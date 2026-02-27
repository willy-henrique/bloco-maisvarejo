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
} from '../types';
import { StorageService } from '../services/storageService';
import {
  isFirebaseConfigured,
  getRitmoBoardOnce,
  saveRitmoBoard as saveRitmoBoardFirestore,
  subscribeRitmoBoard,
} from '../services/firestoreSync';

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
  return {
    backlog: Array.isArray(raw.backlog) ? raw.backlog : base.backlog,
    prioridades: Array.isArray(raw.prioridades) ? raw.prioridades : base.prioridades,
    planos: Array.isArray(raw.planos) ? raw.planos : base.planos,
    tarefas: Array.isArray(raw.tarefas) ? raw.tarefas : base.tarefas,
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
        if (remote && (remote.prioridades.length > 0 || remote.backlog.length > 0)) {
          const mergedEmpresas =
            Array.isArray(remote.empresas) && remote.empresas.length > 0
              ? remote.empresas
              : localData.empresas;
          data = normalizeBoard({ ...remote, empresas: mergedEmpresas });
        }
        else if (data.backlog.length === 0 && data.prioridades.length === 0) {
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
          if (remote && (remote.prioridades.length > 0 || remote.backlog.length > 0)) {
            const local = normalizeBoard(await StorageService.getRitmoBoard(encryptionKey));
            const mergedEmpresas =
              Array.isArray(remote.empresas) && remote.empresas.length > 0
                ? remote.empresas
                : local.empresas;
            setBoard(normalizeBoard({ ...remote, empresas: mergedEmpresas }));
          } else {
            const local = normalizeBoard(await StorageService.getRitmoBoard(encryptionKey));
            if (local.prioridades.length > 0 || local.backlog.length > 0) {
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
          if (local.prioridades.length > 0 || local.backlog.length > 0) setBoard(local);
          else setBoard(defaultBoard());
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      const unsub = subscribeRitmoBoard(encryptionKey, (next) =>
        setBoard((prev) =>
          normalizeBoard({
            ...(next as RitmoGestaoBoard),
            empresas: Array.isArray((next as RitmoGestaoBoard).empresas)
              ? (next as RitmoGestaoBoard).empresas
              : prev.empresas,
          })
        )
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

  const saveBoard = useCallback(
    (next: RitmoGestaoBoard) => {
      setBoard(next);
      if (encryptionKey) persist(encryptionKey, next);
    },
    [encryptionKey, persist]
  );

  // --- Backlog
  const addBacklog = useCallback(
    (item: Omit<Backlog, 'id' | 'data_criacao'>) => {
      const newItem: Backlog = {
        ...item,
        id: crypto.randomUUID(),
        data_criacao: Date.now(),
      };
      saveBoard({
        ...board,
        backlog: [newItem, ...board.backlog],
      });
    },
    [board, saveBoard]
  );

  const updateBacklog = useCallback(
    (id: string, updates: Partial<Backlog>) => {
      saveBoard({
        ...board,
        backlog: board.backlog.map((b) => (b.id === id ? { ...b, ...updates } : b)),
      });
    },
    [board, saveBoard]
  );

  const deleteBacklog = useCallback(
    (id: string) => {
      saveBoard({ ...board, backlog: board.backlog.filter((b) => b.id !== id) });
    },
    [board, saveBoard]
  );

  /** Promover item do backlog a Prioridade (só se houver vaga). */
  const promoverBacklogAPrioridade = useCallback(
    (backlogId: string) => {
      const item = board.backlog.find((b) => b.id === backlogId);
      if (!item) return false;
      const ativas = prioridadesAtivas(board.prioridades);
      if (ativas.length >= MAX_PRIORIDADES_ATIVAS) return false;
      const donoId = board.responsaveis[0]?.id ?? 'r1';
      const nova: Prioridade = {
        id: crypto.randomUUID(),
        titulo: item.titulo,
        descricao: item.descricao,
        dono_id: donoId,
        data_inicio: Date.now(),
        data_alvo: Date.now() + 90 * 24 * 60 * 60 * 1000,
        status_prioridade: 'Execucao',
        origem_backlog_id: backlogId,
      };
      saveBoard({
        ...board,
        backlog: board.backlog.map((b) => (b.id === backlogId ? { ...b, status_backlog: 'promovido' as StatusBacklog } : b)),
        prioridades: [nova, ...board.prioridades],
      });
      return true;
    },
    [board, saveBoard]
  );

  // --- Prioridade
  const addPrioridade = useCallback(
    (item: Omit<Prioridade, 'id'>) => {
      const ativas = prioridadesAtivas(board.prioridades);
      if (ativas.length >= MAX_PRIORIDADES_ATIVAS) return false;
      const nova: Prioridade = { ...item, id: crypto.randomUUID() };
      saveBoard({ ...board, prioridades: [nova, ...board.prioridades] });
      return true;
    },
    [board, saveBoard]
  );

  const updatePrioridade = useCallback(
    (id: string, updates: Partial<Prioridade>) => {
      const next = { ...board, prioridades: board.prioridades.map((p) => (p.id === id ? { ...p, ...updates } : p)) };
      if (updates.status_prioridade === 'Concluido') {
        // Concluída sai do quadro ativo (já filtrado por prioridadesAtivas); mantemos no array para histórico
      }
      saveBoard(next);
    },
    [board, saveBoard]
  );

  const deletePrioridade = useCallback(
    (id: string) => {
      saveBoard({
        ...board,
        prioridades: board.prioridades.filter((p) => p.id !== id),
        planos: board.planos.filter((p) => p.prioridade_id !== id),
        tarefas: board.tarefas.filter((t) => {
          const plano = board.planos.find((pl) => pl.id === t.plano_id);
          return plano?.prioridade_id !== id;
        }),
      });
    },
    [board, saveBoard]
  );

  // --- Plano
  const addPlano = useCallback(
    (item: Omit<PlanoDeAtaque, 'id'>) => {
      const nova: PlanoDeAtaque = { ...item, id: crypto.randomUUID() };
      saveBoard({ ...board, planos: [...board.planos, nova] });
    },
    [board, saveBoard]
  );

  const updatePlano = useCallback(
    (id: string, updates: Partial<PlanoDeAtaque>) => {
      saveBoard({
        ...board,
        planos: board.planos.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      });
    },
    [board, saveBoard]
  );

  const deletePlano = useCallback(
    (id: string) => {
      saveBoard({
        ...board,
        planos: board.planos.filter((p) => p.id !== id),
        tarefas: board.tarefas.filter((t) => t.plano_id !== id),
      });
    },
    [board, saveBoard]
  );

  // --- Tarefa
  const addTarefa = useCallback(
    (item: Omit<Tarefa, 'id'>) => {
      const nova: Tarefa = { ...item, id: crypto.randomUUID() };
      saveBoard({ ...board, tarefas: [...board.tarefas, nova] });
    },
    [board, saveBoard]
  );

  const updateTarefa = useCallback(
    (id: string, updates: Partial<Tarefa>) => {
      saveBoard({
        ...board,
        tarefas: board.tarefas.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      });
    },
    [board, saveBoard]
  );

  const deleteTarefa = useCallback(
    (id: string) => {
      saveBoard({ ...board, tarefas: board.tarefas.filter((t) => t.id !== id) });
    },
    [board, saveBoard]
  );

  // --- Responsáveis
  const addResponsavel = useCallback(
    (item: Omit<Responsavel, 'id'>) => {
      const nova: Responsavel = { ...item, id: crypto.randomUUID() };
      saveBoard({ ...board, responsaveis: [...board.responsaveis, nova] });
    },
    [board, saveBoard]
  );

  // --- Empresas / Workspaces
  const addEmpresa = useCallback(
    (nomeBruto: string) => {
      const nome = nomeBruto.trim();
      if (!nome) return;
      const existentes = new Set((board.empresas ?? []).map((e) => e.trim()).filter(Boolean));
      if (existentes.has(nome)) return;
      const next: RitmoGestaoBoard = {
        ...board,
        empresas: [...existentes, nome],
      };
      saveBoard(next);
    },
    [board, saveBoard]
  );

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
