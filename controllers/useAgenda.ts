import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgendaItem, AgendaStatus } from '../types';
import { saveAgenda, subscribeAgenda } from '../services/agendaService';

const STATUS_CYCLE: AgendaStatus[] = ['pendente', 'em_andamento', 'concluido'];

export function useAgenda(uid: string | null) {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  // ref to always have latest items in callbacks without stale closures
  const itemsRef = useRef<AgendaItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    if (!uid) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeAgenda(uid, (remote) => {
      const migrated = remote.map((i) => {
        if (!i.status) {
          const legacy = i as AgendaItem & { concluido?: boolean };
          return { ...i, status: legacy.concluido ? 'concluido' : 'pendente' } as AgendaItem;
        }
        return i;
      });
      setItems(migrated);
      setLoading(false);
    });
    if (!unsub) setLoading(false);
    return () => unsub?.();
  }, [uid]);

  const persist = useCallback(
    (next: AgendaItem[]) => {
      if (!uid) return;
      const prev = itemsRef.current;
      setItems(next);
      void saveAgenda(uid, next).catch((error) => {
        console.error('Falha ao salvar agenda.', error);
        setItems(prev);
      });
    },
    [uid],
  );

  const addItem = useCallback(
    (item: Omit<AgendaItem, 'id' | 'status' | 'created_at'>) => {
      const novo: AgendaItem = {
        id: crypto.randomUUID(),
        status: 'pendente',
        created_at: Date.now(),
        ...item,
      };
      persist([...itemsRef.current, novo]);
    },
    [persist],
  );

  const cycleStatus = useCallback(
    (id: string) => {
      const next = itemsRef.current.map((i) => {
        if (i.id !== id) return i;
        const idx = STATUS_CYCLE.indexOf(i.status);
        const nextStatus = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
        return { ...i, status: nextStatus };
      });
      persist(next);
    },
    [persist],
  );

  const deleteItem = useCallback(
    (id: string) => {
      persist(itemsRef.current.filter((i) => i.id !== id));
    },
    [persist],
  );

  const updateItem = useCallback(
    (id: string, changes: Partial<Omit<AgendaItem, 'id' | 'status' | 'created_at'>>) => {
      const next = itemsRef.current.map((i) => (i.id === id ? { ...i, ...changes } : i));
      persist(next);
    },
    [persist],
  );

  return { items, loading, addItem, cycleStatus, deleteItem, updateItem };
}
