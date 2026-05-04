import { useState, useEffect, useCallback } from 'react';
import type { AgendaItem, AgendaStatus } from '../types';
import { subscribeAgenda, saveAgenda } from '../services/agendaService';

const STATUS_CYCLE: AgendaStatus[] = ['pendente', 'em_andamento', 'concluido'];

export function useAgenda(uid: string | null) {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    const unsub = subscribeAgenda(uid, (remote) => {
      // migrate legacy items that used concluido boolean
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
      setItems(next);
      setLoading(false);
      void saveAgenda(uid, next);
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
      persist([...items, novo]);
    },
    [items, persist],
  );

  const cycleStatus = useCallback(
    (id: string) => {
      persist(items.map((i) => {
        if (i.id !== id) return i;
        const idx = STATUS_CYCLE.indexOf(i.status);
        const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
        return { ...i, status: next };
      }));
    },
    [items, persist],
  );

  const deleteItem = useCallback(
    (id: string) => {
      persist(items.filter((i) => i.id !== id));
    },
    [items, persist],
  );

  return { items, loading, addItem, cycleStatus, deleteItem };
}
