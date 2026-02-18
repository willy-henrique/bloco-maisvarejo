/**
 * Fase 1 + 2: Quadro de Prioridades, Backlog, Planos de Ataque e Tarefas.
 * - Máximo 3 prioridades ativas.
 * - Propagação de bloqueio: tarefa → plano → prioridade.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BacklogItem,
  BacklogStatus,
  PlanoDeAtaque,
  Prioridade,
  PrioridadeStatus,
  StatusPlano,
  StatusTarefa,
  Tarefa,
} from '../types';
import { StorageService } from '../services/storageService';
import {
  isFirebaseConfigured,
  subscribeBoard,
  saveBoard,
  getBoardDataOnce,
} from '../services/firestoreSync';

const MAX_PRIORIDADES_ATIVAS = 3;

function countPrioridadesAtivas(prioridades: Prioridade[], excludeId?: string): number {
  return prioridades.filter(
    (p) =>
      p.id !== excludeId &&
      p.status_prioridade !== PrioridadeStatus.CONCLUIDO
  ).length;
}

export function usePrioridadesBoard(encryptionKey: CryptoKey | null) {
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [backlog, setBacklog] = useState<BacklogItem[]>([]);
  const [planos, setPlanos] = useState<PlanoDeAtaque[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const persist = useCallback(
    async (key: CryptoKey, p: Prioridade[], b: BacklogItem[], plan: PlanoDeAtaque[], tar: Tarefa[]) => {
      await StorageService.saveBoard({ prioridades: p, backlog: b, planos: plan, tarefas: tar }, key);
      if (isFirebaseConfigured) await saveBoard(p, b, plan, tar, key);
    },
    []
  );

  useEffect(() => {
    if (!encryptionKey) {
      setPrioridades([]);
      setBacklog([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    if (isFirebaseConfigured) {
      (async () => {
        try {
          const remote = await getBoardDataOnce(encryptionKey);
          if (cancelled) return;
          if (remote && (remote.prioridades.length > 0 || remote.backlog.length > 0 || (remote.planos?.length ?? 0) > 0 || (remote.tarefas?.length ?? 0) > 0)) {
            setPrioridades(remote.prioridades);
            setBacklog(remote.backlog);
            setPlanos(remote.planos ?? []);
            setTarefas(remote.tarefas ?? []);
          } else {
            const local = await StorageService.getBoard(encryptionKey);
            setPrioridades(local.prioridades);
            setBacklog(local.backlog);
            setPlanos(local.planos ?? []);
            setTarefas(local.tarefas ?? []);
            if (local.prioridades.length > 0 || local.backlog.length > 0) {
              await persist(encryptionKey, local.prioridades, local.backlog, local.planos ?? [], local.tarefas ?? []);
            }
          }
        } catch {
          const local = await StorageService.getBoard(encryptionKey);
          if (!cancelled) {
            setPrioridades(local.prioridades);
            setBacklog(local.backlog);
            setPlanos(local.planos ?? []);
            setTarefas(local.tarefas ?? []);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      const unsub = subscribeBoard(
        encryptionKey,
        (p, b, plan, tar) => {
          setPrioridades(p);
          setBacklog(b);
          setPlanos(plan ?? []);
          setTarefas(tar ?? []);
        },
        () => {}
      );
      unsubRef.current = unsub ?? null;

      return () => {
        cancelled = true;
        if (unsubRef.current) unsubRef.current();
        unsubRef.current = null;
      };
    } else {
      (async () => {
        try {
          setLoading(true);
          const local = await StorageService.getBoard(encryptionKey);
          setPrioridades(local.prioridades);
          setBacklog(local.backlog);
          setPlanos(local.planos ?? []);
          setTarefas(local.tarefas ?? []);
        } catch (err) {
          setError('Erro ao carregar quadro.');
        } finally {
          setLoading(false);
        }
      })();
      return () => {};
    }
  }, [encryptionKey, persist]);

  const addPrioridade = useCallback(
    async (data: Omit<Prioridade, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!encryptionKey) return;
      const active = countPrioridadesAtivas(prioridades);
      if (
        data.status_prioridade !== PrioridadeStatus.CONCLUIDO &&
        active >= MAX_PRIORIDADES_ATIVAS
      ) {
        return false;
      }
      const item: Prioridade = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const next = [item, ...prioridades];
      setPrioridades(next);
      await persist(encryptionKey, next, backlog, planos, tarefas);
      return true;
    },
    [encryptionKey, prioridades, backlog, planos, tarefas, persist]
  );

  const updatePrioridade = useCallback(
    async (id: string, updates: Partial<Prioridade>) => {
      if (!encryptionKey) return;
      const next = prioridades.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
      );
      setPrioridades(next);
      await persist(encryptionKey, next, backlog, planos, tarefas);
    },
    [encryptionKey, prioridades, backlog, planos, tarefas, persist]
  );

  const deletePrioridade = useCallback(
    async (id: string) => {
      if (!encryptionKey) return;
      const nextPrioridades = prioridades.filter((p) => p.id !== id);
      const nextPlanos = planos.filter((pl) => pl.prioridade_id !== id);
      const planoIds = new Set(nextPlanos.map((pl) => pl.id));
      const nextTarefas = tarefas.filter((t) => planoIds.has(t.plano_id));
      setPrioridades(nextPrioridades);
      setPlanos(nextPlanos);
      setTarefas(nextTarefas);
      await persist(encryptionKey, nextPrioridades, backlog, nextPlanos, nextTarefas);
    },
    [encryptionKey, prioridades, backlog, planos, tarefas, persist]
  );

  const updatePrioridadeStatus = useCallback(
    async (id: string, status: PrioridadeStatus) => {
      if (!encryptionKey) return false;
      const item = prioridades.find((p) => p.id === id);
      if (!item) return false;
      const isBecomingActive =
        status !== PrioridadeStatus.CONCLUIDO &&
        item.status_prioridade === PrioridadeStatus.CONCLUIDO;
      if (isBecomingActive && countPrioridadesAtivas(prioridades, id) >= MAX_PRIORIDADES_ATIVAS) {
        return false;
      }
      await updatePrioridade(id, { status_prioridade: status });
      return true;
    },
    [encryptionKey, prioridades, updatePrioridade]
  );

  const addBacklogItem = useCallback(
    async (data: Omit<BacklogItem, 'id' | 'data_criacao' | 'status_backlog'> & Partial<Pick<BacklogItem, 'data_criacao' | 'status_backlog'>>) => {
      if (!encryptionKey) return;
      const item: BacklogItem = {
        ...data,
        id: crypto.randomUUID(),
        data_criacao: data.data_criacao ?? Date.now(),
        status_backlog: data.status_backlog ?? BacklogStatus.ABERTO,
      };
      const next = [item, ...backlog];
      setBacklog(next);
      await persist(encryptionKey, prioridades, next, planos, tarefas);
    },
    [encryptionKey, backlog, prioridades, planos, tarefas, persist]
  );

  const updateBacklogItem = useCallback(
    async (id: string, updates: Partial<BacklogItem>) => {
      if (!encryptionKey) return;
      const next = backlog.map((b) => (b.id === id ? { ...b, ...updates } : b));
      setBacklog(next);
      await persist(encryptionKey, prioridades, next, planos, tarefas);
    },
    [encryptionKey, backlog, prioridades, planos, tarefas, persist]
  );

  const deleteBacklogItem = useCallback(
    async (id: string) => {
      if (!encryptionKey) return;
      const next = backlog.filter((b) => b.id !== id);
      setBacklog(next);
      await persist(encryptionKey, prioridades, next, planos, tarefas);
    },
    [encryptionKey, backlog, prioridades, planos, tarefas, persist]
  );

  const addPlano = useCallback(
    async (data: Omit<PlanoDeAtaque, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!encryptionKey) return;
      const item: PlanoDeAtaque = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const next = [item, ...planos];
      setPlanos(next);
      await persist(encryptionKey, prioridades, backlog, next, tarefas);
    },
    [encryptionKey, prioridades, backlog, planos, tarefas, persist]
  );

  const updatePlano = useCallback(
    async (id: string, updates: Partial<PlanoDeAtaque>) => {
      if (!encryptionKey) return;
      const plano = planos.find((pl) => pl.id === id);
      const nextPlanos = planos.map((pl) =>
        pl.id === id ? { ...pl, ...updates, updatedAt: Date.now() } : pl
      );
      let nextPrioridades = prioridades;
      if (plano && updates.status_plano === StatusPlano.BLOQUEADO) {
        nextPrioridades = prioridades.map((p) =>
          p.id === plano.prioridade_id
            ? { ...p, status_prioridade: PrioridadeStatus.BLOQUEADO, updatedAt: Date.now() }
            : p
        );
        setPrioridades(nextPrioridades);
      }
      setPlanos(nextPlanos);
      await persist(encryptionKey, nextPrioridades, backlog, nextPlanos, tarefas);
    },
    [encryptionKey, prioridades, backlog, planos, tarefas, persist]
  );

  const deletePlano = useCallback(
    async (id: string) => {
      if (!encryptionKey) return;
      const nextPlanos = planos.filter((pl) => pl.id !== id);
      const nextTarefas = tarefas.filter((t) => t.plano_id !== id);
      setPlanos(nextPlanos);
      setTarefas(nextTarefas);
      await persist(encryptionKey, prioridades, backlog, nextPlanos, nextTarefas);
    },
    [encryptionKey, prioridades, backlog, planos, tarefas, persist]
  );

  const addTarefa = useCallback(
    async (data: Omit<Tarefa, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!encryptionKey) return;
      const item: Tarefa = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const nextTarefas = [item, ...tarefas];
      setTarefas(nextTarefas);
      let nextPlanos = planos;
      let nextPrioridades = prioridades;
      if (data.status_tarefa === StatusTarefa.BLOQUEADA) {
        const plano = planos.find((pl) => pl.id === data.plano_id);
        if (plano) {
          nextPlanos = planos.map((pl) =>
            pl.id === plano.id
              ? { ...pl, status_plano: StatusPlano.BLOQUEADO, updatedAt: Date.now() }
              : pl
          );
          nextPrioridades = prioridades.map((p) =>
            p.id === plano.prioridade_id
              ? { ...p, status_prioridade: PrioridadeStatus.BLOQUEADO, updatedAt: Date.now() }
              : p
          );
          setPlanos(nextPlanos);
          setPrioridades(nextPrioridades);
        }
      }
      await persist(encryptionKey, nextPrioridades, backlog, nextPlanos, nextTarefas);
    },
    [encryptionKey, prioridades, backlog, planos, tarefas, persist]
  );

  const updateTarefa = useCallback(
    async (id: string, updates: Partial<Tarefa>) => {
      if (!encryptionKey) return;
      const tarefa = tarefas.find((t) => t.id === id);
      const nextTarefas = tarefas.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
      );
      setTarefas(nextTarefas);
      let nextPlanos = planos;
      let nextPrioridades = prioridades;
      if (tarefa && updates.status_tarefa === StatusTarefa.BLOQUEADA) {
        const plano = planos.find((pl) => pl.id === tarefa.plano_id);
        if (plano) {
          nextPlanos = planos.map((pl) =>
            pl.id === plano.id
              ? { ...pl, status_plano: StatusPlano.BLOQUEADO, updatedAt: Date.now() }
              : pl
          );
          nextPrioridades = prioridades.map((p) =>
            p.id === plano.prioridade_id
              ? { ...p, status_prioridade: PrioridadeStatus.BLOQUEADO, updatedAt: Date.now() }
              : p
          );
          setPlanos(nextPlanos);
          setPrioridades(nextPrioridades);
        }
      }
      await persist(encryptionKey, nextPrioridades, backlog, nextPlanos, nextTarefas);
    },
    [encryptionKey, prioridades, backlog, planos, tarefas, persist]
  );

  const deleteTarefa = useCallback(
    async (id: string) => {
      if (!encryptionKey) return;
      const next = tarefas.filter((t) => t.id !== id);
      setTarefas(next);
      await persist(encryptionKey, prioridades, backlog, planos, next);
    },
    [encryptionKey, prioridades, backlog, planos, tarefas, persist]
  );

  const promoteToPrioridade = useCallback(
    async (backlogId: string) => {
      if (!encryptionKey) return false;
      const active = countPrioridadesAtivas(prioridades);
      if (active >= MAX_PRIORIDADES_ATIVAS) return false;

      const bl = backlog.find((b) => b.id === backlogId);
      if (!bl || bl.status_backlog === BacklogStatus.PROMOVIDO) return false;

      const prioridade: Prioridade = {
        id: crypto.randomUUID(),
        titulo: bl.titulo,
        descricao: bl.descricao,
        dono_id: bl.origem || '—',
        data_inicio: new Date(bl.data_criacao).toISOString().split('T')[0],
        data_alvo: new Date(bl.data_criacao).toISOString().split('T')[0],
        status_prioridade: PrioridadeStatus.EXECUCAO,
        origem_backlog_id: bl.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const nextPrioridades = [prioridade, ...prioridades];
      const nextBacklog = backlog.map((b) =>
        b.id === backlogId
          ? { ...b, status_backlog: BacklogStatus.PROMOVIDO, prioridade_id: prioridade.id }
          : b
      );
      setPrioridades(nextPrioridades);
      setBacklog(nextBacklog);
      await persist(encryptionKey, nextPrioridades, nextBacklog, planos, tarefas);
      return true;
    },
    [encryptionKey, prioridades, backlog, planos, tarefas, persist]
  );

  return {
    prioridades,
    backlog,
    planos,
    tarefas,
    loading,
    error,
    addPrioridade,
    updatePrioridade,
    deletePrioridade,
    updatePrioridadeStatus,
    addBacklogItem,
    updateBacklogItem,
    deleteBacklogItem,
    promoteToPrioridade,
    addPlano,
    updatePlano,
    deletePlano,
    addTarefa,
    updateTarefa,
    deleteTarefa,
    maxPrioridadesAtivas: MAX_PRIORIDADES_ATIVAS,
    countPrioridadesAtivas: () => countPrioridadesAtivas(prioridades),
  };
}
