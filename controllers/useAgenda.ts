import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgendaItem, AgendaStatus } from '../types';
import {
  saveAgenda,
  subscribeAgenda,
  subscribeSharedAgendaEvents,
  subscribeIncomingAgendaEventInvites,
  subscribeOutgoingAgendaEventInvites,
  respondAgendaEventInvite,
  syncAgendaEventInvites,
  listAgendaUsers,
  type AgendaEventInvite,
  type AgendaInviteStatus,
  type AgendaSharedUser,
  type SharedAgendaEntry,
} from '../services/agendaService';

const STATUS_CYCLE: AgendaStatus[] = ['pendente', 'em_andamento', 'concluido'];

type CurrentAgendaUser = {
  nome?: string | null;
  email?: string | null;
};

function buildCurrentUser(uid: string, currentUser?: CurrentAgendaUser | null): AgendaSharedUser {
  const email = currentUser?.email?.trim() ?? '';
  const nome = currentUser?.nome?.trim() || email || uid;
  return { uid, nome, email };
}

export function useAgenda(uid: string | null, currentUser?: CurrentAgendaUser | null) {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableUsers, setAvailableUsers] = useState<AgendaSharedUser[]>([]);
  const [incomingEventInvites, setIncomingEventInvites] = useState<AgendaEventInvite[]>([]);
  const [incomingEventInvitesReady, setIncomingEventInvitesReady] = useState(false);
  const incomingEventInvitesRef = useRef<AgendaEventInvite[]>([]);
  const [outgoingEventInvites, setOutgoingEventInvites] = useState<AgendaEventInvite[]>([]);
  const [sharedAgendas, setSharedAgendas] = useState<SharedAgendaEntry[]>([]);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!uid) {
      setAvailableUsers([]);
      return;
    }
    listAgendaUsers(uid).then(setAvailableUsers).catch(() => setAvailableUsers([]));
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setIncomingEventInvites([]);
      setIncomingEventInvitesReady(false);
      return;
    }

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let currentUnsub: (() => void) | null = null;

    const trySubscribe = () => {
      if (cancelled) return;
      currentUnsub?.();
      currentUnsub = null;

      currentUnsub = subscribeIncomingAgendaEventInvites(
        uid,
        (invites) => {
          if (cancelled) return;
          const prev = incomingEventInvitesRef.current;
          if (
            prev.length === invites.length &&
            prev.every(
              (a, i) =>
                a.ownerUid === invites[i].ownerUid &&
                a.eventId === invites[i].eventId &&
                a.status === invites[i].status,
            )
          ) {
            setIncomingEventInvitesReady(true);
            return;
          }
          incomingEventInvitesRef.current = invites;
          setIncomingEventInvites(invites);
          setIncomingEventInvitesReady(true);
        },
        (error) => {
          if (cancelled) return;
          console.error('Falha ao sincronizar convites recebidos.', error);
          setIncomingEventInvitesReady(true);
          // Reconecta automaticamente se o índice ainda está sendo construído
          const msg = (error as { message?: string }).message ?? '';
          if (msg.includes('index') || msg.includes('FAILED_PRECONDITION') || msg.includes('not ready')) {
            retryTimeout = setTimeout(trySubscribe, 30_000);
          }
        },
      );

      if (!currentUnsub) setIncomingEventInvitesReady(true);
    };

    setIncomingEventInvitesReady(false);
    trySubscribe();

    return () => {
      cancelled = true;
      if (retryTimeout !== null) clearTimeout(retryTimeout);
      currentUnsub?.();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setOutgoingEventInvites([]);
      return;
    }
    const unsub = subscribeOutgoingAgendaEventInvites(uid, setOutgoingEventInvites);
    return () => unsub?.();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setSharedAgendas([]);
      return;
    }
    const unsub = subscribeSharedAgendaEvents(uid, setSharedAgendas);
    return () => unsub?.();
  }, [uid]);

  const persist = useCallback(
    (next: AgendaItem[]) => {
      if (!uid) return;
      const prev = itemsRef.current;
      const owner = buildCurrentUser(uid, currentUser);
      setItems(next);
      void saveAgenda(uid, next)
        .then(() =>
          syncAgendaEventInvites(owner, next, prev).catch((error) => {
            console.error('Falha ao sincronizar convites da reunião.', error);
          }),
        )
        .catch((error) => {
          console.error('Falha ao salvar agenda.', error);
          setItems(prev);
        });
    },
    [uid, currentUser],
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
        return { ...i, status: STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] };
      });
      persist(next);
    },
    [persist],
  );

  const deleteItem = useCallback(
    (id: string) => persist(itemsRef.current.filter((i) => i.id !== id)),
    [persist],
  );

  const updateItem = useCallback(
    (id: string, changes: Partial<Omit<AgendaItem, 'id' | 'status' | 'created_at'>>) => {
      const next = itemsRef.current.map((i) => (i.id === id ? { ...i, ...changes } : i));
      persist(next);
    },
    [persist],
  );

  const respondEventInvite = useCallback(
    async (
      ownerUid: string,
      eventId: string,
      status: Exclude<AgendaInviteStatus, 'pending'>,
      rejectionReason?: string,
    ): Promise<string | null> => {
      if (!uid) return 'Usuário não autenticado.';
      setSharingLoading(true);
      setSharingError(null);
      try {
        await respondAgendaEventInvite(ownerUid, eventId, uid, status, rejectionReason);
        return null;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Erro ao responder convite. Tente novamente.';
        setSharingError(message);
        return message;
      } finally {
        setSharingLoading(false);
      }
    },
    [uid],
  );

  return {
    items,
    loading,
    availableUsers,
    addItem,
    cycleStatus,
    deleteItem,
    updateItem,
    incomingEventInvites,
    incomingEventInvitesReady,
    outgoingEventInvites,
    sharedAgendas,
    sharingLoading,
    sharingError,
    respondEventInvite,
  };
}
