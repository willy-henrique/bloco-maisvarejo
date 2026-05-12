/**
 * Controller do Sistema de Ritmo de Gestão.
 * Regras: máx 3 prioridades ativas, dono obrigatório, propagação de bloqueios (tarefa → plano → prioridade).
 *
 * Sincronização:
 *  - `setBoard` com functional updater é a ÚNICA fonte de "prev" — evita ler ref stale.
 *  - Subscribe handler faz merge dentro do updater, mas confia no Firestore para existência de itens.
 *  - Persist é enfileirado (last-write-wins controlado pela aplicação) e idempotente.
 *  - NUNCA escrevemos board vazio sobre dados existentes no Firestore (proteção anti-wipeout).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Backlog,
  Prioridade,
  PlanoDeAcao,
  Tarefa,
  Responsavel,
  RitmoGestaoBoard,
  RitmoBoardTombstones,
  StatusPrioridade,
  StatusPlano,
  StatusTarefa,
  StatusBacklog,
  Observer,
} from '../types';
import { StorageService } from '../services/storageService';
import {
  isFirebaseConfigured,
  getRitmoBoardOnce,
  saveRitmoBoard as saveRitmoBoardFirestore,
  subscribeRitmoBoard,
} from '../services/firestoreSync';
import { apiAddObserver, apiGetBlockContext, apiRemoveObserver } from '../services/ritmoCollabApi';

const MAX_PRIORIDADES_ATIVAS = 3;
/**
 * Guard de deleção: tempo máximo que um item pode estar "pendente" de confirmação no Firestore.
 * Aumentado de 15s para 120s para cobrir redes lentas e concorrência multi-tab.
 * O guard é renovado a cada snapshot recebido enquanto o Firestore ainda contém o item.
 * Em paralelo, a deleção é confirmada imediatamente após o write bem-sucedido (não depende só do timer).
 */
const PENDING_DELETION_GUARD_MS = 120_000;
const PENDING_DELETIONS_STORAGE_KEY = '@Estrategico:PendingDeletions';

/** Tombstones expiram após 30 dias — tempo suficiente para todos os usuários sincronizarem. */
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

type TombstoneBucket = keyof Required<RitmoBoardTombstones>;

/**
 * Combina tombstones de várias fontes (local, remoto e pending), mantendo o timestamp
 * mais novo. Usar o mais antigo fazia tombstones renovados expirarem cedo demais.
 */
function mergeTombstones(
  ...sources: Array<RitmoBoardTombstones | undefined>
): RitmoBoardTombstones | undefined {
  if (sources.every((source) => !source)) return undefined;
  const buckets: TombstoneBucket[] = ['backlog', 'prioridades', 'planos', 'tarefas'];
  const result: RitmoBoardTombstones = {};
  const now = Date.now();
  for (const bucket of buckets) {
    const ids = new Set<string>();
    for (const source of sources) {
      Object.keys(source?.[bucket] ?? {}).forEach((id) => ids.add(id));
    }
    if (!ids.size) continue;
    const merged: Record<string, number> = {};
    for (const id of ids) {
      const liveTimestamps = sources
        .map((source) => source?.[bucket]?.[id])
        .filter((ts): ts is number => typeof ts === 'number' && Number.isFinite(ts) && now - ts < TOMBSTONE_TTL_MS);
      if (liveTimestamps.length > 0) merged[id] = Math.max(...liveTimestamps);
    }
    if (Object.keys(merged).length) result[bucket] = merged;
  }
  return Object.keys(result).length ? result : undefined;
}

function tombstonesFromPendingSnapshot(
  pending: PendingDeletionSnapshot,
  at = Date.now(),
): RitmoBoardTombstones | undefined {
  const buckets: TombstoneBucket[] = ['backlog', 'prioridades', 'planos', 'tarefas'];
  const result: RitmoBoardTombstones = {};
  for (const bucket of buckets) {
    if (pending[bucket].size === 0) continue;
    result[bucket] = Object.fromEntries(Array.from(pending[bucket]).map((id) => [id, at]));
  }
  return Object.keys(result).length ? result : undefined;
}

/**
 * Filtra do board todos os itens cujos IDs constam nos tombstones, respeitando cascata:
 * prioridade deletada → planos dela → tarefas deles.
 */
function applyTombstones(
  board: RitmoGestaoBoard,
  ts: RitmoBoardTombstones | undefined,
): RitmoGestaoBoard {
  if (!ts) return board;
  const planoIds = new Set(Object.keys(ts.planos ?? {}));
  const tarefaIds = new Set(Object.keys(ts.tarefas ?? {}));
  const prioIds = new Set(Object.keys(ts.prioridades ?? {}));
  const backlogIds = new Set(Object.keys(ts.backlog ?? {}));
  if (!planoIds.size && !tarefaIds.size && !prioIds.size && !backlogIds.size) return board;
  board.planos.forEach((plano) => {
    if (prioIds.has(plano.prioridade_id)) planoIds.add(plano.id);
  });
  return {
    ...board,
    _tombstones: ts,
    backlog: board.backlog.filter((b) => !backlogIds.has(b.id)),
    prioridades: board.prioridades.filter((p) => !prioIds.has(p.id)),
    planos: board.planos.filter(
      (p) => !planoIds.has(p.id) && !prioIds.has(p.prioridade_id),
    ),
    tarefas: board.tarefas.filter(
      (t) => !tarefaIds.has(t.id) && !planoIds.has(t.plano_id),
    ),
  };
}

type PendingDeletionBucket = 'backlog' | 'prioridades' | 'planos' | 'tarefas';
type PendingDeletionRegistry = Record<PendingDeletionBucket, Map<string, number>>;
type PendingDeletionSnapshot = Record<PendingDeletionBucket, Set<string>>;

function createPendingDeletionRegistry(): PendingDeletionRegistry {
  return {
    backlog: new Map(),
    prioridades: new Map(),
    planos: new Map(),
    tarefas: new Map(),
  };
}

/**
 * Persiste o registry de deleções pendentes no localStorage (dados não-sensíveis: apenas UUIDs).
 * Garante que deleções sobrevivam a reloads de página — sem isso, ao reabrir o app
 * o Firestore (que ainda não confirmou a deleção) traz o item de volta.
 */
function savePendingDeletionsToStorage(registry: PendingDeletionRegistry): void {
  try {
    const data: Record<string, [string, number][]> = {};
    (Object.keys(registry) as PendingDeletionBucket[]).forEach((bucket) => {
      data[bucket] = Array.from(registry[bucket].entries());
    });
    localStorage.setItem(PENDING_DELETIONS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage indisponível (modo privado com cota cheia etc.) — não é fatal
  }
}

/**
 * Restaura o registry de deleções pendentes do localStorage.
 * Chamado no mount do hook para que nova sessão saiba quais deleções ainda não foram confirmadas.
 */
function loadPendingDeletionsFromStorage(): PendingDeletionRegistry {
  const registry = createPendingDeletionRegistry();
  try {
    const raw = localStorage.getItem(PENDING_DELETIONS_STORAGE_KEY);
    if (!raw) return registry;
    const data = JSON.parse(raw) as Record<string, [string, number][]>;
    (Object.keys(registry) as PendingDeletionBucket[]).forEach((bucket) => {
      if (!Array.isArray(data[bucket])) return;
      for (const [id, ts] of data[bucket]) {
        if (typeof id === 'string' && id && typeof ts === 'number') {
          registry[bucket].set(id, ts);
        }
      }
    });
  } catch {
    // JSON inválido ou localStorage indisponível — começa com registry vazio
  }
  return registry;
}

function emptyPendingDeletionSnapshot(): PendingDeletionSnapshot {
  return {
    backlog: new Set(),
    prioridades: new Set(),
    planos: new Set(),
    tarefas: new Set(),
  };
}

const EMPTY_PENDING_DELETIONS = emptyPendingDeletionSnapshot();

function markPendingDeletion(
  registry: PendingDeletionRegistry,
  bucket: PendingDeletionBucket,
  ids: Iterable<string>,
  at = Date.now(),
): void {
  for (const rawId of ids) {
    const id = String(rawId ?? '').trim();
    if (!id) continue;
    registry[bucket].set(id, at);
  }
}

function snapshotPendingDeletions(
  registry: PendingDeletionRegistry,
  now = Date.now(),
): PendingDeletionSnapshot {
  const snapshot = emptyPendingDeletionSnapshot();
  (Object.keys(registry) as PendingDeletionBucket[]).forEach((bucket) => {
    registry[bucket].forEach((ts, id) => {
      if (now - ts > PENDING_DELETION_GUARD_MS) {
        registry[bucket].delete(id);
        return;
      }
      snapshot[bucket].add(id);
    });
  });
  return snapshot;
}

function acknowledgeRemotePendingDeletions(
  registry: PendingDeletionRegistry,
  remote: RitmoGestaoBoard,
): void {
  const remoteIds: PendingDeletionSnapshot = {
    backlog: new Set(remote.backlog.map((item) => item.id)),
    prioridades: new Set(remote.prioridades.map((item) => item.id)),
    planos: new Set(remote.planos.map((item) => item.id)),
    tarefas: new Set(remote.tarefas.map((item) => item.id)),
  };
  (Object.keys(registry) as PendingDeletionBucket[]).forEach((bucket) => {
    registry[bucket].forEach((_ts, id) => {
      if (!remoteIds[bucket].has(id)) registry[bucket].delete(id);
    });
  });
}

function filterBoardPendingDeletions(
  board: RitmoGestaoBoard,
  pending: PendingDeletionSnapshot = EMPTY_PENDING_DELETIONS,
): RitmoGestaoBoard {
  const tombstoneFiltered = applyTombstones(board, mergeTombstones(board._tombstones));
  if (
    pending.backlog.size === 0 &&
    pending.prioridades.size === 0 &&
    pending.planos.size === 0 &&
    pending.tarefas.size === 0
  ) {
    return tombstoneFiltered;
  }
  const pendingPlanos = new Set(pending.planos);
  tombstoneFiltered.planos.forEach((plano) => {
    if (pending.prioridades.has(plano.prioridade_id)) pendingPlanos.add(plano.id);
  });
  return {
    ...tombstoneFiltered,
    backlog: tombstoneFiltered.backlog.filter((item) => !pending.backlog.has(item.id)),
    prioridades: tombstoneFiltered.prioridades.filter((item) => !pending.prioridades.has(item.id)),
    planos: tombstoneFiltered.planos.filter(
      (item) =>
        !pendingPlanos.has(item.id) &&
        !pending.prioridades.has(item.prioridade_id),
    ),
    tarefas: tombstoneFiltered.tarefas.filter(
      (item) =>
        !pending.tarefas.has(item.id) &&
        !pendingPlanos.has(item.plano_id),
    ),
  };
}

function defaultBoard(): RitmoGestaoBoard {
  return {
    backlog: [],
    prioridades: [],
    planos: [],
    tarefas: [],
    responsaveis: [
      { id: 'r1', nome: 'Diretoria' },
      { id: 'r2', nome: 'Operação' },
      { id: 'r3', nome: 'Suporte' },
    ],
    empresas: [],
  };
}

function normalizeBoard(raw: RitmoGestaoBoard | undefined | null): RitmoGestaoBoard {
  const base = defaultBoard();
  if (!raw || typeof raw !== 'object') return base;
  const normalizeObservers = (v: unknown): Observer[] => {
    if (!Array.isArray(v)) return [];
    const parsed: Observer[] = [];
    for (const item of v) {
      if (typeof item === 'string') {
        const uid = item.trim();
        if (uid) parsed.push({ user_id: uid, role: 'follower' });
        continue;
      }
      const obj = item as Partial<Observer>;
      const uid = String(obj.user_id ?? '').trim();
      if (!uid) continue;
      const role = obj.role === 'creator' ? 'creator' : 'follower';
      parsed.push({ user_id: uid, role });
    }
    const uniq = new Map<string, Observer>();
    for (const o of parsed) {
      const prev = uniq.get(o.user_id);
      if (!prev || o.role === 'creator') uniq.set(o.user_id, o);
    }
    return Array.from(uniq.values());
  };
  return {
    backlog: Array.isArray(raw.backlog)
      ? raw.backlog.map((b) => ({ ...b, observadores: normalizeObservers((b as Backlog).observadores) }))
      : base.backlog,
    prioridades: Array.isArray(raw.prioridades)
      ? raw.prioridades.map((p) => ({ ...p, observadores: normalizeObservers((p as Prioridade).observadores) }))
      : base.prioridades,
    planos: Array.isArray(raw.planos)
      ? raw.planos.map((pl) => ({ ...pl, observadores: normalizeObservers((pl as PlanoDeAcao).observadores) }))
      : base.planos,
    tarefas: Array.isArray(raw.tarefas)
      ? raw.tarefas.map((t) => {
          const tarefa = t as Tarefa;
          const concluidaSemData =
            tarefa.status_tarefa === 'Concluida' &&
            (tarefa.data_conclusao === undefined || tarefa.data_conclusao === null);
          return {
            ...tarefa,
            // Backfill defensivo: registros antigos concluídos podem não ter data_conclusao.
            // Nesses casos usamos a melhor aproximação estável (data_vencimento) para exibição.
            data_conclusao: concluidaSemData ? tarefa.data_vencimento : tarefa.data_conclusao,
            observadores: normalizeObservers(tarefa.observadores),
          };
        })
      : base.tarefas,
    responsaveis:
      Array.isArray(raw.responsaveis) && raw.responsaveis.length > 0
        ? raw.responsaveis
        : base.responsaveis,
    empresas: Array.isArray(raw.empresas) ? raw.empresas : [],
    _tombstones: mergeTombstones(
      (raw as RitmoGestaoBoard)._tombstones &&
      typeof (raw as RitmoGestaoBoard)._tombstones === 'object'
        ? (raw as RitmoGestaoBoard)._tombstones
        : undefined,
    ),
  };
}

/** Prioridades ativas = não concluídas (aparecem no quadro estratégico). */
export function prioridadesAtivas(prioridades: Prioridade[]): Prioridade[] {
  return prioridades.filter((p) => p.status_prioridade !== 'Concluido');
}

function normDonoCmp(s: string | undefined): string {
  return String(s ?? '').trim().toLowerCase();
}

/**
 * Snapshot / carga inicial: remoto pode estar atrasado vs localStorage.
 * Preserva dono (e empresa) local quando o carimbo é mais novo, ou quando ambos sem carimbo mas o dono difere (evita refresh apagar troca ainda não replicada).
 */
function mergePrioridadesPreservandoDonoMaisRecente(
  remote: Prioridade[],
  local: Prioridade[],
): Prioridade[] {
  const localById = new Map(local.map((p) => [p.id, p]));
  return remote.map((rp) => {
    const lp = localById.get(rp.id);
    if (!lp) return { ...rp, observadores: Array.isArray(rp.observadores) ? rp.observadores : [] };
    const localObs = Array.isArray(lp.observadores) ? lp.observadores : [];
    const remoteObs = Array.isArray(rp.observadores) ? rp.observadores : [];
    const observadores = localObs.length >= remoteObs.length ? localObs : remoteObs;
    const rTs = rp.dono_atualizado_em ?? 0;
    const lTs = lp.dono_atualizado_em ?? 0;
    const donoDiffers = normDonoCmp(lp.dono_id) !== normDonoCmp(rp.dono_id);
    const preferLocalDono = lTs > rTs || (donoDiffers && lTs >= rTs);
    if (preferLocalDono) {
      return {
        ...rp,
        dono_id: lp.dono_id,
        dono_atualizado_em: lp.dono_atualizado_em ?? rp.dono_atualizado_em,
        empresa: lp.empresa ?? rp.empresa,
        observadores,
      };
    }
    return { ...rp, observadores };
  });
}

/** Quando o dono da prioridade veio do merge local, alinha who_id dos planos (evita snapshot antigo com WHO errado). */
function alinharPlanosWhoAoDonoMesclado(
  planos: PlanoDeAcao[],
  prioridadesMescladas: Prioridade[],
  prioridadesRemotas: Prioridade[],
): PlanoDeAcao[] {
  const remoteDono = new Map(prioridadesRemotas.map((p) => [p.id, p.dono_id]));
  const mergedDono = new Map(prioridadesMescladas.map((p) => [p.id, p.dono_id]));
  return planos.map((pl) => {
    const rDono = remoteDono.get(pl.prioridade_id);
    const mDono = mergedDono.get(pl.prioridade_id);
    if (mDono === undefined) return pl;
    if (String(rDono ?? '').trim() !== String(mDono ?? '').trim()) {
      return { ...pl, who_id: mDono };
    }
    return pl;
  });
}

/**
 * Carga inicial: mescla ownership/dono do local com estado remoto.
 * O Firestore é fonte de verdade para EXISTÊNCIA de itens — não incluímos extras
 * do localStorage que não estejam no remoto, pois eles podem ter sido deletados
 * por outro usuário. Incluí-los causaria ressurreição: o localStorage do usuário B
 * ainda tem o item que o usuário A deletou; ao recarregar, o item seria re-enviado
 * ao Firestore e voltaria para todos.
 */
function mergeBoardRemotoComLocal(
  remote: RitmoGestaoBoard,
  local: RitmoGestaoBoard,
  pending: PendingDeletionSnapshot = EMPTY_PENDING_DELETIONS,
): RitmoGestaoBoard {
  const mergedTombstones = mergeTombstones(
    remote._tombstones,
    local._tombstones,
    tombstonesFromPendingSnapshot(pending),
  );
  const rNormRaw = filterBoardPendingDeletions(normalizeBoard(remote), pending);
  const rNorm = applyTombstones(rNormRaw, mergedTombstones);
  const lNorm = applyTombstones(filterBoardPendingDeletions(normalizeBoard(local), pending), mergedTombstones);
  const rP = rNorm.prioridades;

  // Mescla apenas ownership/dono para prioridades que existem no remoto.
  // NÃO adiciona prioridades que só existem no local — elas podem ter sido
  // deletadas por outro usuário.
  const mergedPrios = mergePrioridadesPreservandoDonoMaisRecente(rP, lNorm.prioridades);

  // Alinha who_id dos planos ao dono mesclado, mas só para planos que existem no remoto.
  const mergedPlanos = alinharPlanosWhoAoDonoMesclado(rNorm.planos, mergedPrios, rP);

  const mergedEmpresas =
    Array.isArray(rNorm.empresas) && rNorm.empresas.length > 0 ? rNorm.empresas : lNorm.empresas;

  return {
    ...normalizeBoard({
      ...rNorm,
      backlog: rNorm.backlog,
      empresas: mergedEmpresas,
      prioridades: mergedPrios,
      planos: mergedPlanos,
      tarefas: rNorm.tarefas,
      responsaveis:
        rNorm.responsaveis.length > 0 ? rNorm.responsaveis : lNorm.responsaveis,
    }),
    _tombstones: mergedTombstones,
  };
}

/**
 * Mescla um snapshot remoto recebido no `onSnapshot` com o estado React atual (`prev`).
 * O Firestore é fonte de verdade para existência de itens; o merge local aqui
 * só preserva campos auxiliares mais recentes, como dono/observadores.
 * Tombstones de ambas as fontes são combinados para garantir que deleções feitas por
 * qualquer usuário prevaleçam mesmo após re-escritas com estado antigo.
 */
function mergeRemoteSnapshotIntoPrev(
  remote: RitmoGestaoBoard,
  prev: RitmoGestaoBoard,
  pending: PendingDeletionSnapshot = EMPTY_PENDING_DELETIONS,
): RitmoGestaoBoard {
  // Combina tombstones: local (prev) + remoto. Garante que uma deleção local
  // sobreviva se outra sessão regravar o Firestore com estado antigo sem tombstone.
  const mergedTombstones = mergeTombstones(
    remote._tombstones,
    prev._tombstones,
    tombstonesFromPendingSnapshot(pending),
  );
  const rNormRaw = filterBoardPendingDeletions(normalizeBoard(remote), pending);
  // Aplica tombstones mesclados ao snapshot remoto antes do merge.
  const rNorm = applyTombstones(rNormRaw, mergedTombstones);
  const prevNorm = applyTombstones(filterBoardPendingDeletions(normalizeBoard(prev), pending), mergedTombstones);
  const remotePrios = rNorm.prioridades;
  const remotePlanos = rNorm.planos;
  const remoteTarefas = rNorm.tarefas;
  const remoteBacklog = rNorm.backlog;

  // Merge de prioridades: usa base remota (autoritativa) + merge de dono mais recente.
  // Não inclui "extras" do prev — o Firestore é fonte de verdade para existência de itens.
  // Incluir extras causava loop: itens deletados voltavam do prev a cada snapshot.
  const mergedPriosRaw = mergePrioridadesPreservandoDonoMaisRecente(remotePrios, prevNorm.prioridades);
  // Observers do snapshot remoto são sempre autoritativos: garante remoção imediata de
  // direitos de visualização sem exigir reload (Testes 3 e 4).
  const remoteObsByPrioId = new Map(remotePrios.map((rp) => [rp.id, rp.observadores ?? []]));
  const mergedPrios = mergedPriosRaw.map((mp) => ({
    ...mp,
    observadores: remoteObsByPrioId.get(mp.id) ?? mp.observadores ?? [],
  }));

  // Para planos e tarefas: observers do remote são sempre a fonte de verdade no snapshot ao vivo.
  const mergedPlanos = alinharPlanosWhoAoDonoMesclado(remotePlanos, mergedPrios, remotePrios).map((rpl) => ({
    ...rpl,
    observadores: Array.isArray(rpl.observadores) ? rpl.observadores : [],
  }));

  const mergedTarefas = remoteTarefas.map((rt) => ({
    ...rt,
    observadores: Array.isArray(rt.observadores) ? rt.observadores : [],
  }));

  const mergedBacklog = remoteBacklog;

  return {
    ...normalizeBoard({
      ...rNorm,
      backlog: mergedBacklog,
      empresas:
        Array.isArray(rNorm.empresas) && rNorm.empresas.length > 0 ? rNorm.empresas : prev.empresas,
      prioridades: mergedPrios,
      planos: mergedPlanos,
      tarefas: mergedTarefas,
      responsaveis: rNorm.responsaveis.length > 0 ? rNorm.responsaveis : prev.responsaveis,
    }),
    _tombstones: mergedTombstones,
  };
}

function boardNeedsTombstoneReassertion(
  remoteRaw: RitmoGestaoBoard,
  merged: RitmoGestaoBoard,
): boolean {
  const mergedTombstones = mergeTombstones(merged._tombstones);
  if (!mergedTombstones) return false;

  const remoteTombstones = mergeTombstones(remoteRaw._tombstones);
  const buckets: TombstoneBucket[] = ['backlog', 'prioridades', 'planos', 'tarefas'];
  for (const bucket of buckets) {
    const mergedBucket = mergedTombstones[bucket] ?? {};
    const remoteBucket = remoteTombstones?.[bucket] ?? {};
    for (const [id, ts] of Object.entries(mergedBucket)) {
      if ((remoteBucket[id] ?? 0) < ts) return true;
    }
  }

  const deletedPrioridades = new Set(Object.keys(mergedTombstones.prioridades ?? {}));
  const deletedPlanos = new Set(Object.keys(mergedTombstones.planos ?? {}));
  const deletedTarefas = new Set(Object.keys(mergedTombstones.tarefas ?? {}));
  const deletedBacklog = new Set(Object.keys(mergedTombstones.backlog ?? {}));

  remoteRaw.planos.forEach((plano) => {
    if (deletedPrioridades.has(plano.prioridade_id)) deletedPlanos.add(plano.id);
  });

  return (
    remoteRaw.backlog.some((item) => deletedBacklog.has(item.id)) ||
    remoteRaw.prioridades.some((item) => deletedPrioridades.has(item.id)) ||
    remoteRaw.planos.some((item) => deletedPlanos.has(item.id)) ||
    remoteRaw.tarefas.some((item) => deletedTarefas.has(item.id) || deletedPlanos.has(item.plano_id))
  );
}

function boardItemCount(b: RitmoGestaoBoard): number {
  return (
    (Array.isArray(b.prioridades) ? b.prioridades.length : 0) +
    (Array.isArray(b.planos) ? b.planos.length : 0) +
    (Array.isArray(b.tarefas) ? b.tarefas.length : 0) +
    (Array.isArray(b.backlog) ? b.backlog.length : 0)
  );
}

function boardHasAnyContent(b: RitmoGestaoBoard): boolean {
  return boardItemCount(b) > 0 || (Array.isArray(b.empresas) && b.empresas.length > 0);
}

/** Verdadeiro se `a` contém ao menos um item por dimensão a mais que `b`. */
function boardHasMoreContentThan(a: RitmoGestaoBoard, b: RitmoGestaoBoard): boolean {
  const aP = a.prioridades.length, bP = b.prioridades.length;
  const aPl = a.planos.length, bPl = b.planos.length;
  const aT = a.tarefas.length, bT = b.tarefas.length;
  const aB = a.backlog.length, bB = b.backlog.length;
  return aP > bP || aPl > bPl || aT > bT || aB > bB;
}


/** Propagação de bloqueio: tarefa bloqueada → plano bloqueado; plano bloqueado → prioridade bloqueada. */
export function computeStatusPlano(planoId: string, tarefas: Tarefa[]): StatusPlano | null {
  const doPlano = tarefas.filter((t) => t.plano_id === planoId);
  if (doPlano.length === 0) return null;
  const algumaBloqueada = doPlano.some((t) => t.status_tarefa === 'Bloqueada');
  if (algumaBloqueada) return 'Bloqueado';
  const todasConcluidas = doPlano.every((t) => t.status_tarefa === 'Concluida');
  if (todasConcluidas) return 'Concluido';
  return 'Execucao';
}

export function computeStatusPrioridade(prioridadeId: string, planos: PlanoDeAcao[], tarefas: Tarefa[]): StatusPrioridade | null {
  const doPrioridade = planos.filter((p) => p.prioridade_id === prioridadeId);
  if (doPrioridade.length === 0) return null;
  const algumPlanoBloqueado = doPrioridade.some((p) => {
    const computed = computeStatusPlano(p.id, tarefas);
    return computed === 'Bloqueado' || p.status_plano === 'Bloqueado';
  });
  if (algumPlanoBloqueado) return 'Bloqueado';
  const todasConcluidas = doPrioridade.every((p) => {
    const computed = computeStatusPlano(p.id, tarefas);
    return computed === 'Concluido' || p.status_plano === 'Concluido';
  });
  if (todasConcluidas) return 'Concluido';
  return 'Execucao';
}

export interface BlockingReason {
  tarefa_id: string;
  tarefa_titulo: string;
  responsavel_id: string;
  bloqueio_motivo: string;
  bloqueada_em?: number;
}

export function getBlockingReasonsForPlano(planoId: string, tarefas: Tarefa[]): BlockingReason[] {
  return tarefas
    .filter((t) => t.plano_id === planoId && t.status_tarefa === 'Bloqueada')
    .map((t) => ({
      tarefa_id: t.id,
      tarefa_titulo: t.titulo,
      responsavel_id: t.responsavel_id,
      bloqueio_motivo: t.bloqueio_motivo ?? '',
      bloqueada_em: t.bloqueada_em,
    }));
}

function ensureCreatorObserver(
  observers: Observer[] | undefined,
  creatorRaw: string | undefined,
): Observer[] {
  const creator = String(creatorRaw ?? '').trim();
  const list = Array.isArray(observers) ? [...observers] : [];
  if (!creator) return list;
  const idx = list.findIndex((o) => o.user_id.trim().toLowerCase() === creator.toLowerCase());
  if (idx === -1) return [...list, { user_id: creator, role: 'creator' }];
  list[idx] = { ...list[idx], role: 'creator' };
  return list;
}

export function useRitmoGestao(encryptionKey: CryptoKey | null) {
  const [board, setBoard] = useState<RitmoGestaoBoard>(defaultBoard());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  /**
   * Inicializado com deleções pendentes salvas no localStorage — garante que
   * itens deletados antes de um reload não ressurjam se o Firestore ainda os contém.
   */
  const pendingDeletionsRef = useRef<PendingDeletionRegistry>(loadPendingDeletionsFromStorage());
  /**
   * Espelho síncrono do `board`. Atualizado a cada commit React via useEffect,
   * para uso estritamente READ-ONLY em handlers que precisem do estado fora de
   * render (ex: callback de subscribe). NUNCA usar como "prev" para mutações:
   * mutações sempre usam o updater funcional do `setBoard`, que garante prev
   * fresco mesmo durante batching.
   */
  const latestBoardRef = useRef<RitmoGestaoBoard>(defaultBoard());
  /**
   * Marca timestamp do último write local. Usamos para distinguir "eco" do
   * Firestore (snapshot que reflete nosso próprio write) de updates de outras
   * sessões — evita reescrever em loop quando recebemos nosso próprio eco.
   */
  const lastLocalWriteAtRef = useRef<number>(0);
  /**
   * Indica se o load inicial já completou. Antes disso, ignoramos certos
   * side-effects (ex: enqueue de re-persist) para evitar reescrever o Firestore
   * com estado parcial durante o boot.
   */
  const initialLoadedRef = useRef<boolean>(false);
  /**
   * Fila de escrita: garante que escritas no Firestore aconteçam em ordem
   * (last-write-wins controlado pela aplicação, evitando race condition em rede).
   * Sempre escreve `pendingPersistRef.current`, que é o último alvo enfileirado.
   */
  const persistChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingPersistRef = useRef<RitmoGestaoBoard | null>(null);
  /**
   * Ref espelho de `encryptionKey`. Atualizado sincronicamente a cada render para
   * que callbacks estabilizados (saveBoard) sempre leiam a chave atual, evitando
   * closures stale quando componentes filhos memorizam callbacks do ritmo.
   */
  const encryptionKeyRef = useRef<CryptoKey | null>(encryptionKey);
  encryptionKeyRef.current = encryptionKey;

  // Mantém o ref espelhado com o estado committed do React.
  useEffect(() => {
    latestBoardRef.current = board;
  }, [board]);

  const persist = useCallback(
    async (key: CryptoKey, data: RitmoGestaoBoard) => {
      const sanitized = filterBoardPendingDeletions(
        normalizeBoard(data),
        snapshotPendingDeletions(pendingDeletionsRef.current),
      );
      await StorageService.saveRitmoBoard(sanitized, key);
      if (isFirebaseConfigured) await saveRitmoBoardFirestore(sanitized, key);

      // Após write bem-sucedido: confirma imediatamente deleções de itens ausentes do board salvo.
      // Não aguarda o snapshot do Firestore — elimina a janela onde o guard pode expirar antes
      // da confirmação e um snapshot com o item ainda presente o ressuscitaria.
      const boardIds: Record<PendingDeletionBucket, Set<string>> = {
        backlog: new Set(sanitized.backlog.map((i) => i.id)),
        prioridades: new Set(sanitized.prioridades.map((i) => i.id)),
        planos: new Set(sanitized.planos.map((i) => i.id)),
        tarefas: new Set(sanitized.tarefas.map((i) => i.id)),
      };
      (Object.keys(pendingDeletionsRef.current) as PendingDeletionBucket[]).forEach((bucket) => {
        pendingDeletionsRef.current[bucket].forEach((_, id) => {
          if (!boardIds[bucket].has(id)) pendingDeletionsRef.current[bucket].delete(id);
        });
      });
      savePendingDeletionsToStorage(pendingDeletionsRef.current);
    },
    [] // pendingDeletionsRef é um ref estável (useRef) — seguro omitir de deps
  );

  /**
   * Enfileira uma persistência. Sempre persiste o último alvo enfileirado;
   * intermediários são descartados se um novo write chegar antes da fila esvaziar.
   * Idempotente: chamar 2x com a mesma referência apenas atualiza pendingPersistRef.
   *
   * Retry automático: falhas no Firestore são retentadas (1x após 3s) para garantir
   * que deleções cheguem ao servidor mesmo em momentos de instabilidade de rede.
   * Sem retry, o item permanecia no Firestore e ressurgia quando o guard de 15s expirava.
   */
  const enqueuePersist = useCallback(
    (key: CryptoKey, data: RitmoGestaoBoard) => {
      pendingPersistRef.current = data;
      const run = async () => {
        const target = pendingPersistRef.current;
        if (!target) return;
        pendingPersistRef.current = null;
        try {
          await persist(key, target);
          lastLocalWriteAtRef.current = Date.now();
        } catch (err) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[useRitmoGestao] persist falhou (tentando novamente em 3s):', err);
          }
          // Retry único após 3s: garante que deleções cheguem ao Firestore mesmo em
          // instabilidade momentânea de rede — sem isso, o item ficava no Firestore
          // e ressurgia ao expirar o pending guard.
          await new Promise<void>((resolve) => setTimeout(resolve, 3_000));
          try {
            await persist(key, target);
            lastLocalWriteAtRef.current = Date.now();
          } catch (retryErr) {
            if (typeof console !== 'undefined' && console.error) {
              console.error('[useRitmoGestao] persist falhou no retry — dado pode estar inconsistente:', retryErr);
            }
          }
        }
        if (pendingPersistRef.current) await run();
      };
      persistChainRef.current = persistChainRef.current.then(run, run);
    },
    [persist]
  );

  const load = useCallback(async () => {
    if (!encryptionKey) {
      setBoard(defaultBoard());
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const pendingDeletes = snapshotPendingDeletions(pendingDeletionsRef.current);
      const localData = filterBoardPendingDeletions(
        normalizeBoard(await StorageService.getRitmoBoard(encryptionKey)),
        pendingDeletes,
      );
      let data = localData;
      if (isFirebaseConfigured) {
        const remote = await getRitmoBoardOnce(encryptionKey);
        if (remote) {
          const remoteNorm = normalizeBoard(remote);
          acknowledgeRemotePendingDeletions(pendingDeletionsRef.current, remoteNorm);
          savePendingDeletionsToStorage(pendingDeletionsRef.current);
          const nextPendingDeletes = snapshotPendingDeletions(pendingDeletionsRef.current);
          const remoteVisible = filterBoardPendingDeletions(remoteNorm, nextPendingDeletes);
          data = mergeBoardRemotoComLocal(remoteVisible, localData, nextPendingDeletes);
          if (boardHasMoreContentThan(data, remoteVisible) || boardNeedsTombstoneReassertion(remoteNorm, data)) {
            enqueuePersist(encryptionKey, data);
          }
        }
      }
      setBoard((prev) =>
        mergeRemoteSnapshotIntoPrev(
          data,
          prev,
          snapshotPendingDeletions(pendingDeletionsRef.current),
        ),
      );
      initialLoadedRef.current = true;
    } catch (e) {
      setError('Erro ao carregar Ritmo de Gestão.');
    } finally {
      setLoading(false);
    }
  }, [encryptionKey, enqueuePersist]);

  useEffect(() => {
    if (!encryptionKey) {
      setBoard(defaultBoard());
      initialLoadedRef.current = false;
      setLoading(false);
      return;
    }
    if (!isFirebaseConfigured) {
      load();
      return;
    }

    let cancelled = false;
    initialLoadedRef.current = false;

    // Carga inicial — busca remote+local, faz merge e seta estado.
    // Usamos updater funcional para preservar quaisquer alterações que possam
    // ter chegado pelo subscribe (ou saveBoard) entre o início desta async fn e o setBoard.
    (async () => {
      try {
        const [remote, localRaw] = await Promise.all([
          getRitmoBoardOnce(encryptionKey),
          StorageService.getRitmoBoard(encryptionKey),
        ]);
        if (cancelled) return;
        const pendingDeletes = snapshotPendingDeletions(pendingDeletionsRef.current);
        const local = filterBoardPendingDeletions(normalizeBoard(localRaw), pendingDeletes);
        const remoteNorm = remote ? normalizeBoard(remote) : null;
        if (remoteNorm) {
          acknowledgeRemotePendingDeletions(pendingDeletionsRef.current, remoteNorm);
          savePendingDeletionsToStorage(pendingDeletionsRef.current);
        }
        const nextPendingDeletes = snapshotPendingDeletions(pendingDeletionsRef.current);
        const remoteVisible = remoteNorm
          ? filterBoardPendingDeletions(remoteNorm, nextPendingDeletes)
          : null;
        const serverData = remoteVisible
          ? mergeBoardRemotoComLocal(remoteVisible, local, nextPendingDeletes)
          : local;
        setBoard((prev) => mergeRemoteSnapshotIntoPrev(serverData, prev, nextPendingDeletes));
        // Reescreve no Firestore se houver dados locais não propagados (ou se nada
        // remoto mas há local). Nunca grava defaultBoard sobre conteúdo existente.
        if (
          remoteNorm &&
          remoteVisible &&
          (boardHasMoreContentThan(serverData, remoteVisible) ||
            boardNeedsTombstoneReassertion(remoteNorm, serverData))
        ) {
          enqueuePersist(encryptionKey, serverData);
        } else if (!remoteVisible && boardHasAnyContent(local)) {
          enqueuePersist(encryptionKey, local);
        }
      } catch {
        const local = filterBoardPendingDeletions(
          normalizeBoard(await StorageService.getRitmoBoard(encryptionKey)),
          snapshotPendingDeletions(pendingDeletionsRef.current),
        );
        if (!cancelled) {
          setBoard((prev) =>
            mergeRemoteSnapshotIntoPrev(
              local,
              prev,
              snapshotPendingDeletions(pendingDeletionsRef.current),
            ),
          );
        }
      } finally {
        if (!cancelled) {
          initialLoadedRef.current = true;
          setLoading(false);
        }
      }
    })();

    // Subscribe — recebe ecos remotos e mescla com estado React atual (via prev do updater).
    // O snapshot remoto é autoritativo para existência de itens.
    const unsub = subscribeRitmoBoard(encryptionKey, (next) => {
      const raw = normalizeBoard(next as RitmoGestaoBoard);
      acknowledgeRemotePendingDeletions(pendingDeletionsRef.current, raw);
      // Renova timestamps de deleções ainda pendentes (o remote ainda as contém, ou seja,
      // a confirmação do Firestore não chegou). Evita que o guard expire prematuramente
      // enquanto o Firestore continua retornando o item deletado (rede lenta, multi-sessão).
      const nowMs = Date.now();
      (Object.keys(pendingDeletionsRef.current) as PendingDeletionBucket[]).forEach((bucket) => {
        pendingDeletionsRef.current[bucket].forEach((_, id) => {
          pendingDeletionsRef.current[bucket].set(id, nowMs);
        });
      });
      // Persiste o estado atualizado do registry (acknowledge pode ter limpado entradas confirmadas).
      savePendingDeletionsToStorage(pendingDeletionsRef.current);
      const pendingDeletes = snapshotPendingDeletions(pendingDeletionsRef.current);
      const remoteVisible = filterBoardPendingDeletions(raw, pendingDeletes);
      setBoard((prev) => {
        const merged = mergeRemoteSnapshotIntoPrev(remoteVisible, prev, pendingDeletes);
        // Sincroniza localStorage com o estado remoto para evitar ressurreição:
        // sem isso, o localStorage do usuário ficaria com itens deletados por outros
        // usuários e os re-enviaria ao Firestore no próximo reload.
        StorageService.saveRitmoBoard(merged, encryptionKey).catch(() => {});
        // Re-persiste no Firestore se um snapshot antigo chegou sem tombstones
        // ou com itens que os tombstones locais já decretaram deletados.
        if (boardNeedsTombstoneReassertion(raw, merged)) {
          const key = encryptionKeyRef.current;
          if (key) enqueuePersist(key, merged);
        }
        return merged;
      });
    });
    unsubRef.current = unsub ?? null;

    return () => {
      cancelled = true;
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
    };
  }, [encryptionKey, load, enqueuePersist]);

  type BoardUpdater = RitmoGestaoBoard | ((prev: RitmoGestaoBoard) => RitmoGestaoBoard);

  /**
   * Atualiza o board e enfileira persistência. Usa o updater funcional do React,
   * garantindo que `prev` é sempre o estado committed mais recente (não pode estar
   * stale como aconteceria com refs lidos fora do callback).
   * Lê encryptionKey via ref para não ficar stale em closures memoizadas de filhos.
   */
  const saveBoard = useCallback(
    (update: BoardUpdater) => {
      setBoard((prev) => {
        const next = typeof update === 'function' ? update(prev) : update;
        if (next === prev) return prev;
        const key = encryptionKeyRef.current;
        if (key) enqueuePersist(key, next);
        return next;
      });
    },
    [enqueuePersist]
  );

  // --- Backlog
  const addBacklog = useCallback(
    (item: Omit<Backlog, 'id' | 'data_criacao'>) => {
      const newItem: Backlog = {
        ...item,
        id: crypto.randomUUID(),
        data_criacao: Date.now(),
      };
      saveBoard((prev) => ({
        ...prev,
        backlog: [newItem, ...prev.backlog],
      }));
    },
    [saveBoard]
  );

  const updateBacklog = useCallback(
    (id: string, updates: Partial<Backlog>) => {
      saveBoard((prev) => ({
        ...prev,
        backlog: prev.backlog.map((b) => (b.id === id ? { ...b, ...updates } : b)),
      }));
    },
    [saveBoard]
  );

  const deleteBacklog = useCallback(
    (id: string) => {
      markPendingDeletion(pendingDeletionsRef.current, 'backlog', [id]);
      savePendingDeletionsToStorage(pendingDeletionsRef.current);
      saveBoard((prev) => ({
        ...prev,
        backlog: prev.backlog.filter((b) => b.id !== id),
        _tombstones: mergeTombstones(prev._tombstones, { backlog: { [id]: Date.now() } }),
      }));
    },
    [saveBoard]
  );

  /** Promover item do backlog a Prioridade (só se houver vaga). */
  const promoverBacklogAPrioridade = useCallback(
    (backlogId: string) => {
      const item = board.backlog.find((b) => b.id === backlogId);
      if (!item || item.status_backlog === 'promovido') return false;
      if (prioridadesAtivas(board.prioridades).length >= MAX_PRIORIDADES_ATIVAS) return false;
      const novaId = crypto.randomUUID();
      saveBoard((prev) => {
        const it = prev.backlog.find((b) => b.id === backlogId);
        if (!it || it.status_backlog === 'promovido') return prev;
        if (prioridadesAtivas(prev.prioridades).length >= MAX_PRIORIDADES_ATIVAS) return prev;
        const nova: Prioridade = {
          id: novaId,
          titulo: it.titulo,
          descricao: it.descricao,
          // Regra de negócio: ao promover backlog, o dono nasce como autor da demanda.
          dono_id: String(it.created_by || '').trim(),
          data_inicio: Date.now(),
          data_alvo: Date.now() + 90 * 24 * 60 * 60 * 1000,
          status_prioridade: 'Execucao',
          origem_backlog_id: backlogId,
          created_by: it.created_by,
          observadores: ensureCreatorObserver(it.observadores, it.created_by),
          workspace_id: it.workspace_id,
          workspace_origem: it.workspace_origem,
        };
        return {
          ...prev,
          backlog: prev.backlog.map((b) =>
            b.id === backlogId ? { ...b, status_backlog: 'promovido' as StatusBacklog } : b
          ),
          prioridades: [nova, ...prev.prioridades],
        };
      });
      return novaId;
    },
    [board.backlog, board.prioridades, saveBoard]
  );

  // --- Prioridade
  const addPrioridade = useCallback(
    (item: Omit<Prioridade, 'id'>) => {
      if (prioridadesAtivas(board.prioridades).length >= MAX_PRIORIDADES_ATIVAS) return false;
      const creator = String(item.created_by ?? '').trim();
      saveBoard((prev) => {
        if (prioridadesAtivas(prev.prioridades).length >= MAX_PRIORIDADES_ATIVAS) return prev;
        const nova: Prioridade = {
          ...item,
          id: crypto.randomUUID(),
          observadores: ensureCreatorObserver(item.observadores, creator),
        };
        return { ...prev, prioridades: [nova, ...prev.prioridades] };
      });
      return true;
    },
    [board.prioridades, saveBoard]
  );

  const updatePrioridade = useCallback(
    (id: string, updates: Partial<Prioridade>) => {
      const { created_by: _ignored, ...safeUpdates } = updates as Partial<Prioridade> & { created_by?: string };
      saveBoard((prev) => {
        const atual = prev.prioridades.find((p) => p.id === id);
        const isBacklogOrigin = Boolean(atual?.origem_backlog_id);
        const donoUpdateSolicitado = safeUpdates.dono_id !== undefined;
        const novoDonoRaw = donoUpdateSolicitado ? String(safeUpdates.dono_id).trim() : '';
        /**
         * Prioridade originada do backlog: dono é imutável (autor original da demanda).
         * Portanto ignoramos qualquer tentativa de alterar `dono_id`.
         */
        const aplicarDono = donoUpdateSolicitado && !isBacklogOrigin && !!novoDonoRaw;
        const updatesSemDono =
          donoUpdateSolicitado && isBacklogOrigin
            ? (() => {
                const { dono_id: _dropDono, ...rest } = safeUpdates;
                return rest;
              })()
            : safeUpdates;

        const nextPrioridades = prev.prioridades.map((p) => {
          if (p.id !== id) return p;
          const merged: Prioridade = { ...p, ...updatesSemDono };
          if (aplicarDono) merged.dono_atualizado_em = Date.now();
          return merged;
        });

        let nextPlanos =
          aplicarDono && atual
            ? prev.planos.map((pl) =>
                pl.prioridade_id === id ? { ...pl, who_id: novoDonoRaw } : pl
              )
            : prev.planos;

        let nextTarefas = prev.tarefas;
        if (updatesSemDono.empresa !== undefined) {
          const em = String(updatesSemDono.empresa ?? '').trim();
          nextPlanos = nextPlanos.map((pl) =>
            pl.prioridade_id === id ? { ...pl, empresa: em } : pl
          );
          const planoIds = new Set(
            prev.planos.filter((pl) => pl.prioridade_id === id).map((pl) => pl.id)
          );
          nextTarefas = prev.tarefas.map((t) =>
            planoIds.has(t.plano_id) ? { ...t, empresa: em } : t
          );
        }

        return { ...prev, prioridades: nextPrioridades, planos: nextPlanos, tarefas: nextTarefas };
      });
    },
    [saveBoard]
  );

  const deletePrioridade = useCallback(
    (id: string) => {
      // Marca pending antes do saveBoard para que o snapshot do Firestore que chegar
      // imediatamente após o write já encontre o guard ativo — evita janela de race.
      saveBoard((prev) => {
        const planoIds = prev.planos
          .filter((p) => p.prioridade_id === id)
          .map((p) => p.id);
        const planoIdsSet = new Set(planoIds);
        const tarefaIds = prev.tarefas
          .filter((t) => planoIdsSet.has(t.plano_id))
          .map((t) => t.id);
        markPendingDeletion(pendingDeletionsRef.current, 'prioridades', [id]);
        markPendingDeletion(pendingDeletionsRef.current, 'planos', planoIds);
        markPendingDeletion(pendingDeletionsRef.current, 'tarefas', tarefaIds);
        savePendingDeletionsToStorage(pendingDeletionsRef.current);
        const now = Date.now();
        const newTombstones = mergeTombstones(prev._tombstones, {
          prioridades: { [id]: now },
          planos: planoIds.length
            ? Object.fromEntries(planoIds.map((pid) => [pid, now]))
            : undefined,
          tarefas: tarefaIds.length
            ? Object.fromEntries(tarefaIds.map((tid) => [tid, now]))
            : undefined,
        });
        return {
          ...prev,
          prioridades: prev.prioridades.filter((p) => p.id !== id),
          planos: prev.planos.filter((p) => p.prioridade_id !== id),
          tarefas: prev.tarefas.filter((t) => !planoIdsSet.has(t.plano_id)),
          _tombstones: newTombstones,
        };
      });
    },
    [saveBoard]
  );

  // --- Plano
  const addPlano = useCallback(
    (item: Omit<PlanoDeAcao, 'id'>) => {
      const creator = String(item.created_by ?? '').trim();
      const nova: PlanoDeAcao = {
        ...item,
        id: crypto.randomUUID(),
        observadores: ensureCreatorObserver(item.observadores, creator),
      };
      saveBoard((prev) => ({ ...prev, planos: [...prev.planos, nova] }));
    },
    [saveBoard]
  );

  const updatePlano = useCallback(
    (id: string, updates: Partial<PlanoDeAcao>) => {
      const { created_by: _ignored, ...safeUpdates } = updates as Partial<PlanoDeAcao> & { created_by?: string };
      saveBoard((prev) => ({
        ...prev,
        planos: prev.planos.map((p) => (p.id === id ? { ...p, ...safeUpdates } : p)),
      }));
    },
    [saveBoard]
  );

  const deletePlano = useCallback(
    (id: string) => {
      saveBoard((prev) => {
        const tarefaIds = prev.tarefas
          .filter((t) => t.plano_id === id)
          .map((t) => t.id);
        markPendingDeletion(pendingDeletionsRef.current, 'planos', [id]);
        markPendingDeletion(pendingDeletionsRef.current, 'tarefas', tarefaIds);
        savePendingDeletionsToStorage(pendingDeletionsRef.current);
        const now = Date.now();
        const newTombstones = mergeTombstones(prev._tombstones, {
          planos: { [id]: now },
          tarefas: tarefaIds.length
            ? Object.fromEntries(tarefaIds.map((tid) => [tid, now]))
            : undefined,
        });
        return {
          ...prev,
          planos: prev.planos.filter((p) => p.id !== id),
          tarefas: prev.tarefas.filter((t) => t.plano_id !== id),
          _tombstones: newTombstones,
        };
      });
    },
    [saveBoard]
  );

  // --- Tarefa
  const addTarefa = useCallback(
    (item: Omit<Tarefa, 'id'>) => {
      const creator = String(item.created_by ?? '').trim();
      const nova: Tarefa = {
        ...item,
        id: crypto.randomUUID(),
        observadores: ensureCreatorObserver(item.observadores, creator),
        bloqueada_em: item.status_tarefa === 'Bloqueada' ? (item.bloqueada_em ?? Date.now()) : undefined,
      };
      saveBoard((prev) => ({ ...prev, tarefas: [...prev.tarefas, nova] }));
    },
    [saveBoard]
  );

  const updateTarefa = useCallback(
    (id: string, updates: Partial<Tarefa>) => {
      const { created_by: _ignored, ...safeUpdates } = updates as Partial<Tarefa> & { created_by?: string };
      saveBoard((prev) => ({
        ...prev,
        tarefas: prev.tarefas.map((t) => {
          if (t.id !== id) return t;
          const next: Tarefa = { ...t, ...safeUpdates };
          if (safeUpdates.status_tarefa === 'Bloqueada' && !t.bloqueada_em) {
            next.bloqueada_em = Date.now();
          }
          if (safeUpdates.status_tarefa && safeUpdates.status_tarefa !== 'Bloqueada') {
            next.bloqueada_em = undefined;
          }
          // Regra única de domínio: ao concluir tarefa, fixa timestamp de conclusão;
          // ao sair de concluída, limpa esse timestamp.
          if (safeUpdates.status_tarefa === 'Concluida') {
            next.data_conclusao = t.data_conclusao ?? Date.now();
          } else if (safeUpdates.status_tarefa) {
            next.data_conclusao = undefined;
          }
          return next;
        }),
      }));
    },
    [saveBoard]
  );

  const deleteTarefa = useCallback(
    (id: string) => {
      saveBoard((prev) => {
        markPendingDeletion(pendingDeletionsRef.current, 'tarefas', [id]);
        savePendingDeletionsToStorage(pendingDeletionsRef.current);
        const newTombstones = mergeTombstones(prev._tombstones, { tarefas: { [id]: Date.now() } });
        return {
          ...prev,
          tarefas: prev.tarefas.filter((t) => t.id !== id),
          _tombstones: newTombstones,
        };
      });
    },
    [saveBoard]
  );

  // --- Observadores
  const addObserver = useCallback(
    (
      entity: 'prioridade' | 'plano' | 'tarefa',
      entityId: string,
      userId: string,
      role: Observer['role'] = 'follower'
    ) => {
      const uid = userId.trim();
      if (!uid) return;
      saveBoard((prev) => {
        if (entity === 'prioridade') {
          return {
            ...prev,
            prioridades: prev.prioridades.map((p) => {
              if (p.id !== entityId) return p;
              const current = Array.isArray(p.observadores) ? [...p.observadores] : [];
              const idx = current.findIndex((o) => o.user_id.trim().toLowerCase() === uid.toLowerCase());
              let fallback = current;
              if (idx >= 0) fallback[idx] = { ...fallback[idx], role: fallback[idx].role === 'creator' ? 'creator' : role };
              else fallback = [...fallback, { user_id: uid, role }];
              void apiAddObserver(current, uid, role).then((remote) => {
                if (!remote) return;
                saveBoard((pp) => ({
                  ...pp,
                  prioridades: pp.prioridades.map((x) => (x.id === entityId ? { ...x, observadores: remote } : x)),
                }));
              });
              return { ...p, observadores: fallback };
            }),
          };
        }
        if (entity === 'plano') {
          return {
            ...prev,
            planos: prev.planos.map((p) => {
              if (p.id !== entityId) return p;
              const current = Array.isArray(p.observadores) ? [...p.observadores] : [];
              const idx = current.findIndex((o) => o.user_id.trim().toLowerCase() === uid.toLowerCase());
              let fallback = current;
              if (idx >= 0) fallback[idx] = { ...fallback[idx], role: fallback[idx].role === 'creator' ? 'creator' : role };
              else fallback = [...fallback, { user_id: uid, role }];
              void apiAddObserver(current, uid, role).then((remote) => {
                if (!remote) return;
                saveBoard((pp) => ({
                  ...pp,
                  planos: pp.planos.map((x) => (x.id === entityId ? { ...x, observadores: remote } : x)),
                }));
              });
              return { ...p, observadores: fallback };
            }),
          };
        }
        // Cascade: ao adicionar observer em tarefa, também adiciona no plano pai (se ainda não estiver).
        const tarefaObj = prev.tarefas.find((t) => t.id === entityId);
        const tarefaPlanoId = tarefaObj?.plano_id;
        const nextTarefas = prev.tarefas.map((t) => {
          if (t.id !== entityId) return t;
          const current = Array.isArray(t.observadores) ? [...t.observadores] : [];
          const idx = current.findIndex((o) => o.user_id.trim().toLowerCase() === uid.toLowerCase());
          let fallback = current;
          if (idx >= 0) fallback[idx] = { ...fallback[idx], role: fallback[idx].role === 'creator' ? 'creator' : role };
          else fallback = [...fallback, { user_id: uid, role }];
          void apiAddObserver(current, uid, role).then((remote) => {
            if (!remote) return;
            saveBoard((pp) => ({
              ...pp,
              tarefas: pp.tarefas.map((x) => (x.id === entityId ? { ...x, observadores: remote } : x)),
            }));
          });
          return { ...t, observadores: fallback };
        });
        const nextPlanosFromTarefa = prev.planos.map((pl) => {
          if (!tarefaPlanoId || pl.id !== tarefaPlanoId) return pl;
          const current = Array.isArray(pl.observadores) ? pl.observadores : [];
          const alreadyObs = current.some((o) => o.user_id.trim().toLowerCase() === uid.toLowerCase());
          if (alreadyObs) return pl;
          const newList = [...current, { user_id: uid, role }];
          void apiAddObserver(current, uid, role).then((remote) => {
            if (!remote) return;
            saveBoard((pp) => ({
              ...pp,
              planos: pp.planos.map((x) => (x.id === pl.id ? { ...x, observadores: remote } : x)),
            }));
          });
          return { ...pl, observadores: newList };
        });
        return { ...prev, tarefas: nextTarefas, planos: nextPlanosFromTarefa };
      });
    },
    [saveBoard]
  );

  const removeObserver = useCallback(
    (entity: 'prioridade' | 'plano' | 'tarefa', entityId: string, userId: string) => {
      const uid = userId.trim().toLowerCase();
      if (!uid) return;
      saveBoard((prev) => {
        const keepNonCreator = (list: Observer[] | undefined) =>
          (Array.isArray(list) ? list : []).filter((o) => {
            if (o.role === 'creator') return true;
            return o.user_id.trim().toLowerCase() !== uid;
          });
        if (entity === 'prioridade') {
          return {
            ...prev,
            prioridades: prev.prioridades.map((p) => {
              if (p.id !== entityId) return p;
              const current = Array.isArray(p.observadores) ? p.observadores : [];
              const fallback = keepNonCreator(current);
              void apiRemoveObserver(current, userId).then((remote) => {
                if (!remote) return;
                saveBoard((pp) => ({
                  ...pp,
                  prioridades: pp.prioridades.map((x) => (x.id === entityId ? { ...x, observadores: remote } : x)),
                }));
              });
              return { ...p, observadores: fallback };
            }),
          };
        }
        if (entity === 'plano') {
          // Cascade: ao remover observer do plano, também remove de todas as tarefas filhas.
          const nextTarefasFromPlano = prev.tarefas.map((t) => {
            if (t.plano_id !== entityId) return t;
            const current = Array.isArray(t.observadores) ? t.observadores : [];
            const isNonCreatorObs = current.some(
              (o) => o.user_id.trim().toLowerCase() === uid && o.role !== 'creator',
            );
            if (!isNonCreatorObs) return t;
            const fallback = keepNonCreator(current);
            void apiRemoveObserver(current, userId).then((remote) => {
              if (!remote) return;
              saveBoard((pp) => ({
                ...pp,
                tarefas: pp.tarefas.map((x) => (x.id === t.id ? { ...x, observadores: remote } : x)),
              }));
            });
            return { ...t, observadores: fallback };
          });
          return {
            ...prev,
            tarefas: nextTarefasFromPlano,
            planos: prev.planos.map((p) => {
              if (p.id !== entityId) return p;
              const current = Array.isArray(p.observadores) ? p.observadores : [];
              const fallback = keepNonCreator(current);
              void apiRemoveObserver(current, userId).then((remote) => {
                if (!remote) return;
                saveBoard((pp) => ({
                  ...pp,
                  planos: pp.planos.map((x) => (x.id === entityId ? { ...x, observadores: remote } : x)),
                }));
              });
              return { ...p, observadores: fallback };
            }),
          };
        }
        return {
          ...prev,
          tarefas: prev.tarefas.map((t) => {
            if (t.id !== entityId) return t;
            const current = Array.isArray(t.observadores) ? t.observadores : [];
            const fallback = keepNonCreator(current);
            void apiRemoveObserver(current, userId).then((remote) => {
              if (!remote) return;
              saveBoard((pp) => ({
                ...pp,
                tarefas: pp.tarefas.map((x) => (x.id === entityId ? { ...x, observadores: remote } : x)),
              }));
            });
            return { ...t, observadores: fallback };
          }),
        };
      });
    },
    [saveBoard]
  );

  // --- Responsáveis
  const addResponsavel = useCallback(
    (item: Omit<Responsavel, 'id'>) => {
      const nova: Responsavel = { ...item, id: crypto.randomUUID() };
      saveBoard((prev) => ({ ...prev, responsaveis: [...prev.responsaveis, nova] }));
    },
    [saveBoard]
  );

  // --- Empresas / Workspaces
  const addEmpresa = useCallback(
    (nomeBruto: string) => {
      const nome = nomeBruto.trim();
      if (!nome) return;
      saveBoard((prev) => {
        const existentes = new Set((prev.empresas ?? []).map((e) => e.trim()).filter(Boolean));
        if (existentes.has(nome)) return prev;
        return { ...prev, empresas: [...existentes, nome] };
      });
    },
    [saveBoard]
  );

  // Regra 8: Propagação de bloqueios (tarefa → plano)
  useEffect(() => {
    if (loading) return;
    saveBoard((prev) => {
      let changed = false;
      const nextPlanos = prev.planos.map((plano) => {
        const computed = computeStatusPlano(plano.id, prev.tarefas);
        if (computed !== null && computed !== plano.status_plano) {
          changed = true;
          return { ...plano, status_plano: computed };
        }
        return plano;
      });
      if (!changed) return prev;
      return { ...prev, planos: nextPlanos };
    });
  }, [board.tarefas, loading, saveBoard]);

  // Regra 8: Propagação de bloqueios (plano → prioridade)
  useEffect(() => {
    if (loading) return;
    saveBoard((prev) => {
      let changed = false;
      const nextPrioridades = prev.prioridades.map((p) => {
        const computed = computeStatusPrioridade(p.id, prev.planos, prev.tarefas);
        if (computed !== null && computed !== p.status_prioridade) {
          changed = true;
          return { ...p, status_prioridade: computed };
        }
        return p;
      });
      if (!changed) return prev;
      return { ...prev, prioridades: nextPrioridades };
    });
  }, [board.planos, loading, saveBoard]);

  const ativasCount = prioridadesAtivas(board.prioridades).length;
  const podeAdicionarPrioridade = ativasCount < MAX_PRIORIDADES_ATIVAS;

  return {
    board,
    loading,
    error,
    refresh: load,
    // Backlog
    addBacklog,
    updateBacklog,
    deleteBacklog,
    promoverBacklogAPrioridade,
    // Prioridade
    addPrioridade,
    updatePrioridade,
    deletePrioridade,
    prioridadesAtivas: prioridadesAtivas(board.prioridades),
    podeAdicionarPrioridade,
    maxPrioridadesAtivas: MAX_PRIORIDADES_ATIVAS,
    // Plano
    addPlano,
    updatePlano,
    deletePlano,
    // Tarefa
    addTarefa,
    updateTarefa,
    deleteTarefa,
    addObserver,
    removeObserver,
    getBlockContext: async (planoId: string) => {
      const remote = await apiGetBlockContext(planoId, board.tarefas);
      if (remote) {
        return remote.map((r) => ({
          tarefa_id: r.task_id,
          tarefa_titulo: r.task_title,
          responsavel_id: r.task_owner,
          bloqueio_motivo: r.block_reason,
        }));
      }
      return getBlockingReasonsForPlano(planoId, board.tarefas);
    },
    // Responsáveis
    responsaveis: board.responsaveis,
    addResponsavel,
    // Empresas / Workspaces
    empresas: board.empresas,
    addEmpresa,
    // Helpers
    computeStatusPlano: (planoId: string) => computeStatusPlano(planoId, board.tarefas),
    computeStatusPrioridade: (prioridadeId: string) =>
      computeStatusPrioridade(prioridadeId, board.planos, board.tarefas),
  };
}
