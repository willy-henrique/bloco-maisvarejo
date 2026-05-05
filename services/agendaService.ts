import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { AgendaItem, AgendaMember, AgendaStatus } from '../types';
import { getDb, isFirebaseConfigured, USERS_COLLECTION } from './firebase';
import { isDeveloperEmail } from '../config/developer';

const AGENDA_COLLECTION = 'userAgenda';
const AGENDA_INVITES_SUBCOLLECTION = 'agendaInvites';
const EVENT_INVITES_SUBCOLLECTION = 'eventInvites';

export interface AgendaSharedUser extends AgendaMember {}

export type AgendaInviteStatus = 'pending' | 'accepted' | 'declined';

export interface AgendaInvite {
  ownerUid: string;
  ownerNome: string;
  ownerEmail: string;
  viewerUid: string;
  viewerNome: string;
  viewerEmail: string;
  status: AgendaInviteStatus;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
  respondedAt?: number | null;
}

export interface SharedAgendaEntry {
  ownerUid: string;
  ownerNome: string;
  ownerEmail?: string;
  items: AgendaItem[];
}

export interface AgendaEventInvite {
  ownerUid: string;
  ownerNome: string;
  ownerEmail: string;
  eventId: string;
  viewerUid: string;
  viewerNome: string;
  viewerEmail: string;
  status: AgendaInviteStatus;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
  respondedAt?: number | null;
  event: AgendaItem;
}

function getAgendaRef(uid: string) {
  const db = getDb();
  if (!db) return null;
  return doc(db, AGENDA_COLLECTION, uid);
}

function getAgendaInvitesCollectionRef(ownerUid: string) {
  const db = getDb();
  if (!db) return null;
  return collection(db, AGENDA_COLLECTION, ownerUid, AGENDA_INVITES_SUBCOLLECTION);
}

function getAgendaInviteRef(ownerUid: string, viewerUid: string) {
  const db = getDb();
  if (!db) return null;
  return doc(db, AGENDA_COLLECTION, ownerUid, AGENDA_INVITES_SUBCOLLECTION, viewerUid);
}

function getEventInvitesCollectionRef(ownerUid: string) {
  const db = getDb();
  if (!db) return null;
  return collection(db, AGENDA_COLLECTION, ownerUid, EVENT_INVITES_SUBCOLLECTION);
}

function getEventInviteRef(ownerUid: string, eventId: string, viewerUid: string) {
  const db = getDb();
  if (!db) return null;
  return doc(db, AGENDA_COLLECTION, ownerUid, EVENT_INVITES_SUBCOLLECTION, eventInviteDocId(eventId, viewerUid));
}

function eventInviteDocId(eventId: string, viewerUid: string): string {
  return `${eventId}_${viewerUid}`;
}

function normalizeStatus(value: unknown): AgendaInviteStatus {
  if (value === 'accepted' || value === 'declined') return value;
  return 'pending';
}

function normalizeAgendaStatus(value: unknown): AgendaStatus {
  if (value === 'em_andamento' || value === 'concluido') return value;
  return 'pendente';
}

function normalizeMembers(value: unknown): AgendaMember[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const item = raw as Record<string, unknown>;
      const uid = String(item.uid ?? '').trim();
      if (!uid) return null;
      const email = String(item.email ?? '').trim();
      const nome = String(item.nome ?? (email || uid)).trim();
      return { uid, nome, email };
    })
    .filter((member): member is AgendaMember => Boolean(member));
}

function normalizeAgendaItem(raw: Record<string, unknown>, fallbackId: string): AgendaItem {
  const id = String(raw.id ?? fallbackId);
  const titulo = String(raw.titulo ?? 'Evento de agenda');
  const descricao = typeof raw.descricao === 'string' ? raw.descricao : undefined;
  const data_hora = typeof raw.data_hora === 'number' ? raw.data_hora : Date.now();
  const created_at = typeof raw.created_at === 'number' ? raw.created_at : data_hora;
  const participantes = normalizeMembers(raw.participantes);
  return {
    id,
    titulo,
    descricao,
    data_hora,
    status: normalizeAgendaStatus(raw.status),
    created_at,
    ...(participantes.length > 0 ? { participantes } : {}),
  };
}

function normalizeInvite(
  raw: Record<string, unknown>,
  fallbackOwnerUid: string,
  fallbackViewerUid: string,
): AgendaInvite {
  const ownerUid = String(raw.ownerUid ?? fallbackOwnerUid);
  const viewerUid = String(raw.viewerUid ?? fallbackViewerUid);
  const ownerEmail = String(raw.ownerEmail ?? '');
  const viewerEmail = String(raw.viewerEmail ?? '');
  const ownerNome = String(raw.ownerNome ?? (ownerEmail || ownerUid));
  const viewerNome = String(raw.viewerNome ?? (viewerEmail || viewerUid));
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt;
  const rawRespondedAt = raw.respondedAt;
  let respondedAt: number | null | undefined;
  if (typeof rawRespondedAt === 'number') {
    respondedAt = rawRespondedAt;
  } else if (rawRespondedAt === null) {
    respondedAt = null;
  }
  const rejectionReason =
    typeof raw.rejectionReason === 'string' ? raw.rejectionReason : undefined;

  return {
    ownerUid,
    ownerNome,
    ownerEmail,
    viewerUid,
    viewerNome,
    viewerEmail,
    status: normalizeStatus(raw.status),
    rejectionReason,
    createdAt,
    updatedAt,
    respondedAt,
  };
}

function normalizeEventInvite(
  raw: Record<string, unknown>,
  fallbackOwnerUid: string,
  fallbackEventId: string,
  fallbackViewerUid: string,
): AgendaEventInvite {
  const ownerUid = String(raw.ownerUid ?? fallbackOwnerUid);
  const eventId = String(raw.eventId ?? fallbackEventId);
  const viewerUid = String(raw.viewerUid ?? fallbackViewerUid);
  const ownerEmail = String(raw.ownerEmail ?? '');
  const viewerEmail = String(raw.viewerEmail ?? '');
  const ownerNome = String(raw.ownerNome ?? (ownerEmail || ownerUid));
  const viewerNome = String(raw.viewerNome ?? (viewerEmail || viewerUid));
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt;
  const rawRespondedAt = raw.respondedAt;
  let respondedAt: number | null | undefined;
  if (typeof rawRespondedAt === 'number') {
    respondedAt = rawRespondedAt;
  } else if (rawRespondedAt === null) {
    respondedAt = null;
  }
  const rejectionReason =
    typeof raw.rejectionReason === 'string' ? raw.rejectionReason : undefined;
  const rawEvent = raw.event && typeof raw.event === 'object'
    ? raw.event as Record<string, unknown>
    : {};

  return {
    ownerUid,
    ownerNome,
    ownerEmail,
    eventId,
    viewerUid,
    viewerNome,
    viewerEmail,
    status: normalizeStatus(raw.status),
    rejectionReason,
    createdAt,
    updatedAt,
    respondedAt,
    event: normalizeAgendaItem(rawEvent, eventId),
  };
}

function sortInvites(invites: AgendaInvite[]): AgendaInvite[] {
  const weight: Record<AgendaInviteStatus, number> = {
    pending: 0,
    declined: 1,
    accepted: 2,
  };
  return [...invites].sort((a, b) => {
    const byStatus = weight[a.status] - weight[b.status];
    if (byStatus !== 0) return byStatus;
    return b.updatedAt - a.updatedAt;
  });
}

function sortEventInvites(invites: AgendaEventInvite[]): AgendaEventInvite[] {
  const weight: Record<AgendaInviteStatus, number> = {
    pending: 0,
    declined: 1,
    accepted: 2,
  };
  return [...invites].sort((a, b) => {
    const byStatus = weight[a.status] - weight[b.status];
    if (byStatus !== 0) return byStatus;
    return a.event.data_hora - b.event.data_hora || b.updatedAt - a.updatedAt;
  });
}

function sanitize(items: AgendaItem[]) {
  return items.map((item) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item)) {
      if (v !== undefined) out[k] = v;
    }
    return out;
  });
}

function eventSnapshot(item: AgendaItem): AgendaItem {
  const snapshot: AgendaItem = {
    id: item.id,
    titulo: item.titulo,
    data_hora: item.data_hora,
    status: item.status,
    created_at: item.created_at,
  };
  if (item.descricao !== undefined) snapshot.descricao = item.descricao;
  return snapshot;
}

function membersByUid(item: AgendaItem | undefined): Map<string, AgendaMember> {
  return new Map((item?.participantes ?? []).map((member) => [member.uid, member]));
}

export async function findUserByEmail(email: string): Promise<AgendaSharedUser | null> {
  const db = getDb();
  if (!db || !isFirebaseConfigured) return null;
  const normalized = email.trim().toLowerCase();
  try {
    const normalizedQuery = query(collection(db, USERS_COLLECTION), where('email', '==', normalized));
    const normalizedSnap = await getDocs(normalizedQuery);
    if (!normalizedSnap.empty) {
      const d = normalizedSnap.docs[0].data();
      return {
        uid: normalizedSnap.docs[0].id,
        nome: d.nome ?? normalized,
        email: d.email ?? normalized,
      };
    }

    const exactQuery = query(collection(db, USERS_COLLECTION), where('email', '==', email.trim()));
    const exactSnap = await getDocs(exactQuery);
    if (!exactSnap.empty) {
      const d = exactSnap.docs[0].data();
      return {
        uid: exactSnap.docs[0].id,
        nome: d.nome ?? email.trim(),
        email: d.email ?? email.trim(),
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function listAgendaUsers(excludeUid?: string | null): Promise<AgendaSharedUser[]> {
  const db = getDb();
  if (!db || !isFirebaseConfigured) return [];
  try {
    const snap = await getDocs(collection(db, USERS_COLLECTION));
    return snap.docs
      .map((d) => {
        const data = d.data();
        const uid = String(data.uid ?? d.id);
        const email = String(data.email ?? '').trim();
        const nome = String(data.nome ?? (email || uid)).trim();
        const ativo = data.ativo !== false;
        return { uid, nome, email, ativo };
      })
      .filter((user) => user.ativo && user.uid !== excludeUid && !isDeveloperEmail(user.email))
      .map(({ uid, nome, email }) => ({ uid, nome, email }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  } catch {
    return [];
  }
}

async function upsertAgendaEventInvite(
  owner: AgendaSharedUser,
  item: AgendaItem,
  viewer: AgendaMember,
): Promise<void> {
  const ref = getEventInviteRef(owner.uid, item.id, viewer.uid);
  if (!ref) return;

  const now = Date.now();
  const existing = await getDoc(ref).catch(() => null);
  const existingData = existing?.data() as {
    status?: AgendaInviteStatus;
    rejectionReason?: string;
    createdAt?: number;
    respondedAt?: number | null;
  } | undefined;
  const hasExisting = Boolean(existing?.exists());
  const status = hasExisting ? normalizeStatus(existingData?.status) : 'pending';

  await setDoc(
    ref,
    {
      ownerUid: owner.uid,
      ownerNome: owner.nome || owner.email || owner.uid,
      ownerEmail: owner.email || '',
      eventId: item.id,
      viewerUid: viewer.uid,
      viewerNome: viewer.nome || viewer.email || viewer.uid,
      viewerEmail: viewer.email || '',
      status,
      rejectionReason: existingData?.rejectionReason ?? '',
      createdAt: typeof existingData?.createdAt === 'number' ? existingData.createdAt : now,
      updatedAt: now,
      respondedAt: existingData?.respondedAt ?? null,
      event: eventSnapshot(item),
    },
    { merge: true },
  );
}

async function deleteAgendaEventInvite(ownerUid: string, eventId: string, viewerUid: string): Promise<void> {
  const ref = getEventInviteRef(ownerUid, eventId, viewerUid);
  if (!ref) return;
  await deleteDoc(ref);
}

export async function syncAgendaEventInvites(
  owner: AgendaSharedUser,
  nextItems: AgendaItem[],
  previousItems: AgendaItem[],
): Promise<void> {
  if (!isFirebaseConfigured) return;

  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const nextById = new Map(nextItems.map((item) => [item.id, item]));
  const writes: Promise<void>[] = [];

  for (const item of nextItems) {
    const nextMembers = membersByUid(item);
    const previousMembers = membersByUid(previousById.get(item.id));

    for (const member of nextMembers.values()) {
      writes.push(upsertAgendaEventInvite(owner, item, member));
    }

    for (const memberUid of previousMembers.keys()) {
      if (!nextMembers.has(memberUid)) {
        writes.push(deleteAgendaEventInvite(owner.uid, item.id, memberUid));
      }
    }
  }

  for (const previous of previousItems) {
    if (nextById.has(previous.id)) continue;
    for (const member of previous.participantes ?? []) {
      writes.push(deleteAgendaEventInvite(owner.uid, previous.id, member.uid));
    }
  }

  await Promise.all(writes);
}

export async function respondAgendaEventInvite(
  ownerUid: string,
  eventId: string,
  viewerUid: string,
  status: Exclude<AgendaInviteStatus, 'pending'>,
  rejectionReason?: string,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const ref = getEventInviteRef(ownerUid, eventId, viewerUid);
  if (!ref) return;

  const reason = rejectionReason?.trim() ?? '';
  if (status === 'declined' && !reason) {
    throw new Error('Informe o motivo da recusa.');
  }

  const now = Date.now();
  await updateDoc(ref, {
    status,
    rejectionReason: status === 'declined' ? reason : '',
    respondedAt: now,
    updatedAt: now,
  });
}

export function subscribeOutgoingAgendaEventInvites(
  ownerUid: string,
  onUpdate: (invites: AgendaEventInvite[]) => void,
): Unsubscribe | null {
  const ref = getEventInvitesCollectionRef(ownerUid);
  if (!ref || !isFirebaseConfigured) return null;

  return onSnapshot(
    ref,
    (snap) => {
      const invites = snap.docs.map((d) =>
        normalizeEventInvite(d.data() as Record<string, unknown>, ownerUid, '', ''),
      );
      onUpdate(sortEventInvites(invites));
    },
    (error) => {
      console.error('Falha ao sincronizar convites de reuniões enviados.', error);
    },
  );
}

export function subscribeIncomingAgendaEventInvites(
  viewerUid: string,
  onUpdate: (invites: AgendaEventInvite[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe | null {
  const db = getDb();
  if (!db || !isFirebaseConfigured) return null;

  const invitesQuery = query(
    collectionGroup(db, EVENT_INVITES_SUBCOLLECTION),
    where('viewerUid', '==', viewerUid),
  );

  return onSnapshot(
    invitesQuery,
    (snap) => {
      const invites = snap.docs.map((d) => {
        const ownerUid = d.ref.parent.parent?.id ?? '';
        return normalizeEventInvite(d.data() as Record<string, unknown>, ownerUid, '', viewerUid);
      });
      onUpdate(sortEventInvites(invites));
    },
    (error) => {
      console.error('Falha ao sincronizar convites de reuniões recebidos.', error);
    },
  );
}

export function subscribeSharedAgendaEvents(
  viewerUid: string,
  onUpdate: (entries: SharedAgendaEntry[]) => void,
): Unsubscribe | null {
  return subscribeIncomingAgendaEventInvites(viewerUid, (invites) => {
    const grouped = new Map<string, SharedAgendaEntry>();

    for (const invite of invites) {
      if (invite.status !== 'accepted') continue;
      const current = grouped.get(invite.ownerUid) ?? {
        ownerUid: invite.ownerUid,
        ownerNome: invite.ownerNome || invite.ownerEmail || invite.ownerUid,
        ownerEmail: invite.ownerEmail,
        items: [],
      };
      current.items.push(invite.event);
      grouped.set(invite.ownerUid, current);
    }

    const entries = Array.from(grouped.values())
      .map((entry) => ({
        ...entry,
        items: entry.items.sort((a, b) => a.data_hora - b.data_hora),
      }))
      .sort((a, b) => a.ownerNome.localeCompare(b.ownerNome, 'pt-BR'));

    onUpdate(entries);
  });
}

export async function inviteAgendaViewer(
  owner: AgendaSharedUser,
  viewer: AgendaSharedUser,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const ref = getAgendaInviteRef(owner.uid, viewer.uid);
  if (!ref) return;

  const now = Date.now();
  const existing = await getDoc(ref).catch(() => null);
  const existingData = existing?.data() as { createdAt?: number } | undefined;

  await setDoc(
    ref,
    {
      ownerUid: owner.uid,
      ownerNome: owner.nome || owner.email || owner.uid,
      ownerEmail: owner.email || '',
      viewerUid: viewer.uid,
      viewerNome: viewer.nome || viewer.email || viewer.uid,
      viewerEmail: viewer.email || '',
      status: 'pending',
      rejectionReason: '',
      createdAt: typeof existingData?.createdAt === 'number' ? existingData.createdAt : now,
      updatedAt: now,
      respondedAt: null,
    },
    { merge: true },
  );
}

export async function deleteAgendaInvite(ownerUid: string, viewerUid: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  const ref = getAgendaInviteRef(ownerUid, viewerUid);
  if (!ref) return;
  await deleteDoc(ref);
}

export async function respondAgendaInvite(
  ownerUid: string,
  viewerUid: string,
  status: Exclude<AgendaInviteStatus, 'pending'>,
  rejectionReason?: string,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const ref = getAgendaInviteRef(ownerUid, viewerUid);
  if (!ref) return;

  const reason = rejectionReason?.trim() ?? '';
  if (status === 'declined' && !reason) {
    throw new Error('Informe o motivo da recusa.');
  }

  const now = Date.now();
  await updateDoc(ref, {
    status,
    rejectionReason: status === 'declined' ? reason : '',
    respondedAt: now,
    updatedAt: now,
  });
}

export function subscribeOutgoingAgendaInvites(
  ownerUid: string,
  onUpdate: (invites: AgendaInvite[]) => void,
): Unsubscribe | null {
  const ref = getAgendaInvitesCollectionRef(ownerUid);
  if (!ref || !isFirebaseConfigured) return null;

  return onSnapshot(
    ref,
    (snap) => {
      const invites = snap.docs.map((d) =>
        normalizeInvite(d.data() as Record<string, unknown>, ownerUid, d.id),
      );
      onUpdate(sortInvites(invites));
    },
    (error) => {
      console.error('Falha ao sincronizar convites enviados da agenda.', error);
    },
  );
}

export function subscribeIncomingAgendaInvites(
  viewerUid: string,
  onUpdate: (invites: AgendaInvite[]) => void,
): Unsubscribe | null {
  const db = getDb();
  if (!db || !isFirebaseConfigured) return null;

  const invitesQuery = query(
    collectionGroup(db, AGENDA_INVITES_SUBCOLLECTION),
    where('viewerUid', '==', viewerUid),
  );

  return onSnapshot(
    invitesQuery,
    (snap) => {
      const invites = snap.docs.map((d) => {
        const ownerUid = d.ref.parent.parent?.id ?? '';
        return normalizeInvite(d.data() as Record<string, unknown>, ownerUid, viewerUid);
      });
      onUpdate(sortInvites(invites));
    },
    (error) => {
      console.error('Falha ao sincronizar convites recebidos da agenda.', error);
    },
  );
}

export function subscribeSharedAgendas(
  viewerUid: string,
  onUpdate: (entries: SharedAgendaEntry[]) => void,
): Unsubscribe | null {
  const db = getDb();
  if (!db || !isFirebaseConfigured) return null;

  const acceptedInvites = new Map<string, AgendaInvite>();
  const agendaItemsByOwner = new Map<string, AgendaItem[]>();
  const agendaUnsubs = new Map<string, Unsubscribe>();
  let closed = false;

  const emit = () => {
    if (closed) return;
    const entries = Array.from(acceptedInvites.values())
      .map((invite) => ({
        ownerUid: invite.ownerUid,
        ownerNome: invite.ownerNome || invite.ownerEmail || invite.ownerUid,
        ownerEmail: invite.ownerEmail,
        items: agendaItemsByOwner.get(invite.ownerUid) ?? [],
      }))
      .sort((a, b) => a.ownerNome.localeCompare(b.ownerNome, 'pt-BR'));
    onUpdate(entries);
  };

  const incomingUnsub = subscribeIncomingAgendaInvites(viewerUid, (invites) => {
    const nextAccepted = new Map(
      invites.filter((invite) => invite.status === 'accepted').map((invite) => [invite.ownerUid, invite]),
    );

    for (const [ownerUid, unsub] of agendaUnsubs.entries()) {
      if (!nextAccepted.has(ownerUid)) {
        unsub();
        agendaUnsubs.delete(ownerUid);
        agendaItemsByOwner.delete(ownerUid);
      }
    }

    for (const ownerUid of acceptedInvites.keys()) {
      if (!nextAccepted.has(ownerUid)) {
        acceptedInvites.delete(ownerUid);
      }
    }

    for (const [ownerUid, invite] of nextAccepted.entries()) {
      acceptedInvites.set(ownerUid, invite);
      if (agendaUnsubs.has(ownerUid)) continue;

      const agendaRef = doc(db, AGENDA_COLLECTION, ownerUid);
      const unsub = onSnapshot(
        agendaRef,
        (snap) => {
          const data = snap.data() as { items?: AgendaItem[] } | undefined;
          agendaItemsByOwner.set(ownerUid, Array.isArray(data?.items) ? data.items : []);
          emit();
        },
        (error) => {
          console.error('Falha ao sincronizar agenda compartilhada.', error);
        },
      );
      agendaUnsubs.set(ownerUid, unsub);
    }

    emit();
  });

  if (!incomingUnsub) return null;

  return () => {
    closed = true;
    incomingUnsub();
    for (const unsub of agendaUnsubs.values()) unsub();
    agendaUnsubs.clear();
  };
}

export async function loadAgenda(uid: string): Promise<AgendaItem[]> {
  if (!isFirebaseConfigured) return [];
  const ref = getAgendaRef(uid);
  if (!ref) return [];
  try {
    const snap = await getDoc(ref);
    const data = snap.data() as { items?: AgendaItem[] } | undefined;
    return Array.isArray(data?.items) ? data!.items : [];
  } catch {
    return [];
  }
}

export function subscribeAgenda(
  uid: string,
  onChange: (items: AgendaItem[]) => void,
): Unsubscribe | null {
  if (!isFirebaseConfigured) return null;
  const ref = getAgendaRef(uid);
  if (!ref) return null;

  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data() as { items?: AgendaItem[] } | undefined;
      onChange(Array.isArray(data?.items) ? data.items : []);
    },
    (error) => {
      console.error('Falha ao sincronizar agenda em tempo real.', error);
    },
  );
}

export async function saveAgenda(uid: string, items: AgendaItem[]): Promise<void> {
  if (!isFirebaseConfigured) return;
  const ref = getAgendaRef(uid);
  if (!ref) return;
  await setDoc(ref, { items: sanitize(items) }, { merge: true });
}
