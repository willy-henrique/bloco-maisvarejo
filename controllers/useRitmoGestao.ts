/**
 * Controller do Sistema de Ritmo de Gestão.
 * Regras: máx 3 prioridades ativas, dono obrigatório, propagação de bloqueios (tarefa → plano → prioridade).
 *
 * Sincronização:
 *  - `setBoard` com functional updater é a ÚNICA fonte de "prev" — evita ler ref stale.
 *  - Subscribe handler faz merge dentro do updater (preserva extras locais ainda não ecoados).
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
const PENDING_DELETION_GUARD_MS = 15_000;

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
  if (
    pending.backlog.size === 0 &&
    pending.prioridades.size === 0 &&
    pending.planos.size === 0 &&
    pending.tarefas.size === 0
  ) {
    return board;
  }
  return {
    ...board,
    backlog: board.backlog.filter((item) => !pending.backlog.has(item.id)),
    prioridades: board.prioridades.filter((item) => !pending.prioridades.has(item.id)),
    planos: board.planos.filter(
      (item) =>
        !pending.planos.has(item.id) &&
        !pending.prioridades.has(item.prioridade_id),
    ),
    tarefas: board.tarefas.filter(
      (item) =>
        !pending.tarefas.has(item.id) &&
        !pending.planos.has(item.plano_id),
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

/** Carga inicial: não descartar localStorage quando o Firestore ainda não recebeu a última troca de dono. */
function mergeBoardRemotoComLocal(
  remote: RitmoGestaoBoard,
  local: RitmoGestaoBoard,
  pending: PendingDeletionSnapshot = EMPTY_PENDING_DELETIONS,
): RitmoGestaoBoard {
  const rNorm = filterBoardPendingDeletions(normalizeBoard(remote), pending);
  const lNorm = filterBoardPendingDeletions(normalizeBoard(local), pending);
  const rP = rNorm.prioridades;
  const mergedPrios = mergePrioridadesPreservandoDonoMaisRecente(rP, lNorm.prioridades);
  const mergedPrioIds = new Set(mergedPrios.map((p) => p.id));
  const extraPrios = lNorm.prioridades.filter((p) => !mergedPrioIds.has(p.id));
  const allPrios = [...mergedPrios, ...extraPrios];

  let mergedPlanos = alinharPlanosWhoAoDonoMesclado(rNorm.planos, mergedPrios, rP);
  const planoIds = new Set(mergedPlanos.map((pl) => pl.id));
  const extraPlanos = lNorm.planos.filter((pl) => !planoIds.has(pl.id));
  mergedPlanos = [...mergedPlanos, ...extraPlanos];

  const tarefaIds = new Set(rNorm.tarefas.map((t) => t.id));
  const extraTarefas = lNorm.tarefas.filter((t) => !tarefaIds.has(t.id));

  const backlogIds = new Set(rNorm.backlog.map((b) => b.id));
  const extraBacklog = lNorm.backlog.filter((b) => !backlogIds.has(b.id));

  const mergedEmpresas =
    Array.isArray(rNorm.empresas) && rNorm.empresas.length > 0 ? rNorm.empresas : lNorm.empresas;

  return normalizeBoard({
    ...rNorm,
    backlog: [...rNorm.backlog, ...extraBacklog],
    empresas: mergedEmpresas,
    prioridades: allPrios,
    planos: mergedPlanos,
    tarefas: [...rNorm.tarefas, ...extraTarefas],
    responsaveis:
      rNorm.responsaveis.length > 0 ? rNorm.responsaveis : lNorm.responsaveis,
  });
}

/**
 * Mescla um snapshot remoto recebido no `onSnapshot` com o estado React atual (`prev`).
 * Preserva itens locais que ainda não chegaram no remote (extras), garantindo que
 * planos/tarefas recém-criados não sumam ao receber um eco antigo.
 */
function mergeRemoteSnapshotIntoPrev(
  remote: RitmoGestaoBoard,
  prev: RitmoGestaoBoard,
  pending: PendingDeletionSnapshot = EMPTY_PENDING_DELETIONS,
): RitmoGestaoBoard {
  const rNorm = filterBoardPendingDeletions(normalizeBoard(remote), pending);
  const prevNorm = filterBoardPendingDeletions(normalizeBoard(prev), pending);
  const remotePrios = rNorm.prioridades;
  const remotePlanos = rNorm.planos;
  const remoteTarefas = rNorm.tarefas;
  const remoteBacklog = rNorm.backlog;

  const mergedPriosBase = mergePrioridadesPreservandoDonoMaisRecente(remotePrios, prevNorm.prioridades);
  const mergedPrioIds = new Set(mergedPriosBase.map((p) => p.id));
  const extraPrios = prevNorm.prioridades.filter((p) => !mergedPrioIds.has(p.id));
  const mergedPrios = [...mergedPriosBase, ...extraPrios];

  const mergedPlanosBase = alinharPlanosWhoAoDonoMesclado(remotePlanos, mergedPrios, remotePrios).map((rpl) => {
    const lpl = prevNorm.planos.find((p) => p.id === rpl.id);
    if (!lpl) return rpl;
    const localObs = Array.isArray(lpl.observadores) ? lpl.observadores : [];
    const remoteObs = Array.isArray(rpl.observadores) ? rpl.observadores : [];
    return { ...rpl, observadores: localObs.length >= remoteObs.length ? localObs : remoteObs };
  });
  const mergedPlanoIds = new Set(mergedPlanosBase.map((pl) => pl.id));
  const extraPlanos = prevNorm.planos.filter((pl) => !mergedPlanoIds.has(pl.id));
  const mergedPlanos = [...mergedPlanosBase, ...extraPlanos];

  const mergedTarefasBase = remoteTarefas.map((rt) => {
    const lt = prevNorm.tarefas.find((t) => t.id === rt.id);
    if (!lt) return rt;
    const localObs = Array.isArray(lt.observadores) ? lt.observadores : [];
    const remoteObs = Array.isArray(rt.observadores) ? rt.observadores : [];
    return { ...rt, observadores: localObs.length >= remoteObs.length ? localObs : remoteObs };
  });
  const mergedTarefaIds = new Set(mergedTarefasBase.map((t) => t.id));
  const extraTarefas = prevNorm.tarefas.filter((t) => !mergedTarefaIds.has(t.id));
  const mergedTarefas = [...mergedTarefasBase, ...extraTarefas];

  const mergedBacklogIds = new Set(remoteBacklog.map((b) => b.id));
  const extraBacklog = prevNorm.backlog.filter((b) => !mergedBacklogIds.has(b.id));
  const mergedBacklog = [...remoteBacklog, ...extraBacklog];

  return normalizeBoard({
    ...rNorm,
    backlog: mergedBacklog,
    empresas:
      Array.isArray(rNorm.empresas) && rNorm.empresas.length > 0 ? rNorm.empresas : prev.empresas,
    prioridades: mergedPrios,
    planos: mergedPlanos,
    tarefas: mergedTarefas,
    responsaveis: rNorm.responsaveis.length > 0 ? rNorm.responsaveis : prev.responsaveis,
  });
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
  const pendingDeletionsRef = useRef<PendingDeletionRegistry>(createPendingDeletionRegistry());
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
      await StorageService.saveRitmoBoard(data, key);
      if (isFirebaseConfigured) await saveRitmoBoardFirestore(data, key);
    },
    []
  );

  /**
   * Enfileira uma persistência. Sempre persiste o último alvo enfileirado;
   * intermediários são descartados se um novo write chegar antes da fila esvaziar.
   * Idempotente: chamar 2x com a mesma referência apenas atualiza pendingPersistRef.
   *
   * IMPORTANTE: erros são LOGADOS (não silenciados) para evitar bugs invisíveis
   * — já tivemos um caso de RangeError em String.fromCharCode(...) que ficou
   * mascarado por try/catch silencioso, fazendo planos aparecerem na UI mas
   * nunca serem salvos no Firestore.
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
          // Falha de criptografia/serialização/rede: NUNCA silenciar.
          // Bugs determinísticos (ex.: RangeError em btoa de payload grande)
          // ficavam invisíveis e faziam o plano sumir só no Firestore.
          if (typeof console !== 'undefined' && console.error) {
            console.error('[useRitmoGestao] persist falhou:', err);
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
          const nextPendingDeletes = snapshotPendingDeletions(pendingDeletionsRef.current);
          const remoteVisible = filterBoardPendingDeletions(remoteNorm, nextPendingDeletes);
          data = mergeBoardRemotoComLocal(remoteVisible, localData, nextPendingDeletes);
          if (boardHasMoreContentThan(data, remoteVisible)) {
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
        if (remoteNorm) acknowledgeRemotePendingDeletions(pendingDeletionsRef.current, remoteNorm);
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
        if (remoteVisible && boardHasMoreContentThan(serverData, remoteVisible)) {
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
      const pendingDeletes = snapshotPendingDeletions(pendingDeletionsRef.current);
      const remoteVisible = filterBoardPendingDeletions(raw, pendingDeletes);
      setBoard((prev) => mergeRemoteSnapshotIntoPrev(remoteVisible, prev, pendingDeletes));
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
      saveBoard((prev) => {
        markPendingDeletion(pendingDeletionsRef.current, 'backlog', [id]);
        return { ...prev, backlog: prev.backlog.filter((b) => b.id !== id) };
      });
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
        return {
          ...prev,
          prioridades: prev.prioridades.filter((p) => p.id !== id),
          planos: prev.planos.filter((p) => p.prioridade_id !== id),
          tarefas: prev.tarefas.filter((t) => !planoIdsSet.has(t.plano_id)),
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
        return {
          ...prev,
          planos: prev.planos.filter((p) => p.id !== id),
          tarefas: prev.tarefas.filter((t) => t.plano_id !== id),
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
        return { ...prev, tarefas: prev.tarefas.filter((t) => t.id !== id) };
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
        return {
          ...prev,
          tarefas: prev.tarefas.map((t) => {
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
          }),
        };
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
          return {
            ...prev,
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
