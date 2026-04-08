/**
 * Controller do Sistema de Ritmo de Gestão.
 * Regras: máx 3 prioridades ativas, dono obrigatório, propagação de bloqueios (tarefa → plano → prioridade).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Backlog,
  Prioridade,
  PlanoDeAtaque,
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
      ? raw.planos.map((pl) => ({ ...pl, observadores: normalizeObservers((pl as PlanoDeAtaque).observadores) }))
      : base.planos,
    tarefas: Array.isArray(raw.tarefas)
      ? raw.tarefas.map((t) => ({ ...t, observadores: normalizeObservers((t as Tarefa).observadores) }))
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
    if (!lp) return rp;
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
      };
    }
    return rp;
  });
}

/** Quando o dono da prioridade veio do merge local, alinha who_id dos planos (evita snapshot antigo com WHO errado). */
function alinharPlanosWhoAoDonoMesclado(
  planos: PlanoDeAtaque[],
  prioridadesMescladas: Prioridade[],
  prioridadesRemotas: Prioridade[],
): PlanoDeAtaque[] {
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
): RitmoGestaoBoard {
  const rNorm = normalizeBoard(remote);
  const lNorm = normalizeBoard(local);
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

  const mergedEmpresas =
    Array.isArray(rNorm.empresas) && rNorm.empresas.length > 0 ? rNorm.empresas : lNorm.empresas;

  return normalizeBoard({
    ...rNorm,
    empresas: mergedEmpresas,
    prioridades: allPrios,
    planos: mergedPlanos,
    tarefas: [...rNorm.tarefas, ...extraTarefas],
    responsaveis:
      rNorm.responsaveis.length > 0 ? rNorm.responsaveis : lNorm.responsaveis,
  });
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

export function computeStatusPrioridade(prioridadeId: string, planos: PlanoDeAtaque[], tarefas: Tarefa[]): StatusPrioridade | null {
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

  const persist = useCallback(
    async (key: CryptoKey, data: RitmoGestaoBoard) => {
      await StorageService.saveRitmoBoard(data, key);
      if (isFirebaseConfigured) await saveRitmoBoardFirestore(data, key);
    },
    []
  );

  const load = useCallback(async () => {
    if (!encryptionKey) {
      setBoard(defaultBoard());
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      let localData = normalizeBoard(await StorageService.getRitmoBoard(encryptionKey));
      let data = localData;
      if (isFirebaseConfigured) {
        const remote = await getRitmoBoardOnce(encryptionKey);
        const remoteHasData = remote && (
          remote.prioridades.length > 0 || remote.backlog.length > 0 ||
          (Array.isArray(remote.empresas) && remote.empresas.length > 0)
        );
        if (remoteHasData && remote) {
          data = mergeBoardRemotoComLocal(remote, localData);
          void persist(encryptionKey, data).catch(() => {});
        } else if (
          data.backlog.length === 0 &&
          data.prioridades.length === 0 &&
          data.empresas.length === 0
        ) {
          await persist(encryptionKey, data);
        }
      }
      setBoard(data);
    } catch (e) {
      setError('Erro ao carregar Ritmo de Gestão.');
    } finally {
      setLoading(false);
    }
  }, [encryptionKey, persist]);

  useEffect(() => {
    if (!encryptionKey) {
      setBoard(defaultBoard());
      setLoading(false);
      return;
    }
    if (!isFirebaseConfigured) {
      load();
      return;
    }
    if (isFirebaseConfigured) {
      let cancelled = false;
      (async () => {
        try {
          const remote = await getRitmoBoardOnce(encryptionKey);
          if (cancelled) return;
          const remoteHasData = remote && (
            remote.prioridades.length > 0 || remote.backlog.length > 0 ||
            (Array.isArray(remote.empresas) && remote.empresas.length > 0)
          );
          if (remoteHasData && remote) {
            const local = normalizeBoard(await StorageService.getRitmoBoard(encryptionKey));
            const mergedInit = mergeBoardRemotoComLocal(remote, local);
            setBoard(mergedInit);
            void persist(encryptionKey, mergedInit).catch(() => {});
          } else {
            const local = normalizeBoard(await StorageService.getRitmoBoard(encryptionKey));
            const localHasData = local.prioridades.length > 0 || local.backlog.length > 0 || local.empresas.length > 0;
            if (localHasData) {
              setBoard(local);
              await saveRitmoBoardFirestore(local, encryptionKey);
            } else {
              const def = defaultBoard();
              setBoard(def);
              await persist(encryptionKey, def);
            }
          }
        } catch {
          const local = normalizeBoard(await StorageService.getRitmoBoard(encryptionKey));
          const localHasData = local.prioridades.length > 0 || local.backlog.length > 0 || local.empresas.length > 0;
          if (localHasData) setBoard(local);
          else setBoard(defaultBoard());
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      const unsub = subscribeRitmoBoard(encryptionKey, (next) =>
        setBoard((prev) => {
          const raw = next as RitmoGestaoBoard;
          const remotePrios = Array.isArray(raw.prioridades) ? raw.prioridades : [];
          const remotePlanos = Array.isArray(raw.planos) ? raw.planos : [];
          const mergedPrios = mergePrioridadesPreservandoDonoMaisRecente(remotePrios, prev.prioridades);
          const mergedPlanos = alinharPlanosWhoAoDonoMesclado(remotePlanos, mergedPrios, remotePrios);
          return normalizeBoard({
            ...raw,
            empresas: Array.isArray(raw.empresas) ? raw.empresas : prev.empresas,
            prioridades: mergedPrios,
            planos: mergedPlanos,
          });
        })
      );
      unsubRef.current = unsub ?? null;
      return () => {
        cancelled = true;
        if (unsubRef.current) unsubRef.current();
        unsubRef.current = null;
      };
    } else {
      load();
    }
  }, [encryptionKey, load, persist]);

  type BoardUpdater = RitmoGestaoBoard | ((prev: RitmoGestaoBoard) => RitmoGestaoBoard);

  const saveBoard = useCallback(
    (update: BoardUpdater) => {
      setBoard((prev) => {
        const next = typeof update === 'function' ? update(prev) : update;
        if (encryptionKey && next !== prev) void persist(encryptionKey, next);
        return next;
      });
    },
    [encryptionKey, persist]
  );

  // --- Backlog
  const addBacklog = useCallback(
    (item: Omit<Backlog, 'id' | 'data_criacao'>) => {
      const creator = String(item.created_by ?? '').trim();
      const newItem: Backlog = {
        ...item,
        id: crypto.randomUUID(),
        data_criacao: Date.now(),
        observadores: ensureCreatorObserver(item.observadores, creator),
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
      saveBoard((prev) => ({ ...prev, backlog: prev.backlog.filter((b) => b.id !== id) }));
    },
    [saveBoard]
  );

  /** Promover item do backlog a Prioridade (só se houver vaga). */
  const promoverBacklogAPrioridade = useCallback(
    (backlogId: string) => {
      const item = board.backlog.find((b) => b.id === backlogId);
      if (!item || item.status_backlog === 'promovido') return false;
      if (prioridadesAtivas(board.prioridades).length >= MAX_PRIORIDADES_ATIVAS) return false;
      saveBoard((prev) => {
        const it = prev.backlog.find((b) => b.id === backlogId);
        if (!it || it.status_backlog === 'promovido') return prev;
        if (prioridadesAtivas(prev.prioridades).length >= MAX_PRIORIDADES_ATIVAS) return prev;
        const donoId = prev.responsaveis[0]?.id ?? 'r1';
        const nova: Prioridade = {
          id: crypto.randomUUID(),
          titulo: it.titulo,
          descricao: it.descricao,
          dono_id: donoId,
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
      return true;
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
      saveBoard((prev) => {
        const atual = prev.prioridades.find((p) => p.id === id);
        const novoDonoRaw =
          updates.dono_id !== undefined ? String(updates.dono_id).trim() : '';
        /** Sempre que o Tático manda `dono_id`, grava carimbo e alinha planos — evita skip quando string legada ≡ uid canônico. */
        const aplicarDono = updates.dono_id !== undefined && !!novoDonoRaw;

        const nextPrioridades = prev.prioridades.map((p) => {
          if (p.id !== id) return p;
          const merged: Prioridade = { ...p, ...updates };
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
        if (updates.empresa !== undefined) {
          const em = String(updates.empresa ?? '').trim();
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
      saveBoard((prev) => ({
        ...prev,
        prioridades: prev.prioridades.filter((p) => p.id !== id),
        planos: prev.planos.filter((p) => p.prioridade_id !== id),
        tarefas: prev.tarefas.filter((t) => {
          const plano = prev.planos.find((pl) => pl.id === t.plano_id);
          return plano?.prioridade_id !== id;
        }),
      }));
    },
    [saveBoard]
  );

  // --- Plano
  const addPlano = useCallback(
    (item: Omit<PlanoDeAtaque, 'id'>) => {
      const creator = String(item.created_by ?? '').trim();
      const nova: PlanoDeAtaque = {
        ...item,
        id: crypto.randomUUID(),
        observadores: ensureCreatorObserver(item.observadores, creator),
      };
      saveBoard((prev) => ({ ...prev, planos: [...prev.planos, nova] }));
    },
    [saveBoard]
  );

  const updatePlano = useCallback(
    (id: string, updates: Partial<PlanoDeAtaque>) => {
      saveBoard((prev) => ({
        ...prev,
        planos: prev.planos.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      }));
    },
    [saveBoard]
  );

  const deletePlano = useCallback(
    (id: string) => {
      saveBoard((prev) => ({
        ...prev,
        planos: prev.planos.filter((p) => p.id !== id),
        tarefas: prev.tarefas.filter((t) => t.plano_id !== id),
      }));
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
      saveBoard((prev) => ({
        ...prev,
        tarefas: prev.tarefas.map((t) => {
          if (t.id !== id) return t;
          const next: Tarefa = { ...t, ...updates };
          if (updates.status_tarefa === 'Bloqueada' && !t.bloqueada_em) {
            next.bloqueada_em = Date.now();
          }
          if (updates.status_tarefa && updates.status_tarefa !== 'Bloqueada') {
            next.bloqueada_em = undefined;
          }
          return next;
        }),
      }));
    },
    [saveBoard]
  );

  const deleteTarefa = useCallback(
    (id: string) => {
      saveBoard((prev) => ({ ...prev, tarefas: prev.tarefas.filter((t) => t.id !== id) }));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.tarefas, loading]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.planos, loading]);

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
