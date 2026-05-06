import {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  increment,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from './firebase';

const PRIVATE_CHATS = 'privateChats';
const MESSAGES_SUB = 'messages';
const MESSAGES_LIMIT = 100;
export const DELETE_FOR_EVERYONE_WINDOW_MS = 3 * 60 * 1000;
export const DELETED_MESSAGE_TEXT = 'Mensagem apagada';

export type DeletePrivateMessageScope = 'me' | 'everyone';

// ─── tipos ────────────────────────────────────────────────────────────────────

export interface PrivateChatMessage {
  id: string;
  senderUid: string;
  senderNome: string;
  texto: string;
  createdAt: number;
  editedAt?: number | null;
  deletedAt?: number | null;
  deletedFor?: Record<string, boolean>;
  deletedForEveryone?: boolean;
}

export interface ConversationMeta {
  chatId: string;
  participants: string[];
  participantNames: Record<string, string>;
  lastMessage: string;
  lastMessageAt: number | null;
  unread: Record<string, number>;
  clearedAt: Record<string, number>;
  lastMessageHiddenAt: Record<string, number>;
  lastVisibleMessage: Record<string, string>;
  lastVisibleMessageAt: Record<string, number | null>;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

export function getPrivateChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('__');
}

function asRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, T>) : {};
}

function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const fn = (value as { toMillis?: unknown }).toMillis;
    if (typeof fn === 'function') {
      const millis = fn.call(value);
      return typeof millis === 'number' && Number.isFinite(millis) ? millis : null;
    }
  }
  return null;
}

function messageCreatedAt(data: Record<string, unknown>): number {
  return toMillis(data.createdAt) ?? toMillis(data.createdAtServer) ?? Date.now();
}

function messagePreview(data: Record<string, unknown>): string {
  if (data.deletedForEveryone === true) return DELETED_MESSAGE_TEXT;
  return String(data.texto ?? '').slice(0, 100);
}

function isDeletedForUser(data: Record<string, unknown>, uid: string): boolean {
  return asRecord<boolean>(data.deletedFor)[uid] === true;
}

export function canDeletePrivateMessageForEveryone(
  message: PrivateChatMessage,
  now = Date.now(),
): boolean {
  return !message.deletedForEveryone && now - message.createdAt <= DELETE_FOR_EVERYONE_WINDOW_MS;
}

export function getConversationPreviewForUser(conv: ConversationMeta, uid: string) {
  const globalAt = conv.lastMessageAt ?? null;
  const hiddenAt = conv.lastMessageHiddenAt[uid] ?? null;
  if (globalAt !== null && hiddenAt === globalAt) {
    return {
      text: conv.lastVisibleMessage[uid] ?? '',
      at: conv.lastVisibleMessageAt[uid] ?? null,
    };
  }
  return { text: conv.lastMessage, at: globalAt };
}

export function isConversationVisibleForUser(conv: ConversationMeta, uid: string): boolean {
  const clearedAt = conv.clearedAt[uid] ?? 0;
  if (!clearedAt) return true;
  const preview = getConversationPreviewForUser(conv, uid);
  if (preview.at === null) return false;
  return preview.at > clearedAt;
}

// ─── operações ────────────────────────────────────────────────────────────────

export async function ensurePrivateChat(
  myUid: string,
  myNome: string,
  otherUid: string,
  otherNome: string,
): Promise<string> {
  const chatId = getPrivateChatId(myUid, otherUid);
  if (!isFirebaseConfigured) return chatId;
  const db = getDb();
  if (!db) return chatId;

  const ref = doc(db, PRIVATE_CHATS, chatId);

  // setDoc com merge:true é um upsert seguro:
  // • Doc novo  → regra 'create': usa request.resource.data (disponível) ✓
  // • Doc existe → regra 'update': usa resource.data (doc existe) ✓
  // Nunca usa getDoc, então não há problema de resource == null nas rules.
  // Não sobrescreve lastMessage/unread/createdAt em docs já existentes.
  await setDoc(
    ref,
    {
      participants: [myUid, otherUid].sort(),
      participantNames: { [myUid]: myNome, [otherUid]: otherNome },
    },
    { merge: true },
  );

  return chatId;
}

export async function sendPrivateMessage(
  chatId: string,
  senderUid: string,
  senderNome: string,
  receiverUid: string,
  texto: string,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  if (!db) return;

  const now = Date.now();
  const trimmed = texto.trim();

  await addDoc(collection(db, PRIVATE_CHATS, chatId, MESSAGES_SUB), {
    senderUid,
    senderNome,
    texto: trimmed,
    createdAt: now,
    createdAtServer: serverTimestamp(),
  });

  await updateDoc(doc(db, PRIVATE_CHATS, chatId), {
    lastMessage: trimmed.slice(0, 100),
    lastMessageAt: now,
    [`participantNames.${senderUid}`]: senderNome,
    [`unread.${receiverUid}`]: increment(1),
  });
}

export async function markConversationRead(chatId: string, myUid: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  if (!db) return;
  try {
    await updateDoc(doc(db, PRIVATE_CHATS, chatId), { [`unread.${myUid}`]: 0 });
  } catch {
    // ignora se doc ainda não existe
  }
}

async function refreshPrivateChatPreview(chatId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  if (!db) return;

  const latestQuery = query(
    collection(db, PRIVATE_CHATS, chatId, MESSAGES_SUB),
    orderBy('createdAt', 'desc'),
    limit(1),
  );
  const latest = await getDocs(latestQuery);
  const parentRef = doc(db, PRIVATE_CHATS, chatId);

  if (latest.empty) {
    await updateDoc(parentRef, {
      lastMessage: '',
      lastMessageAt: null,
    });
    return;
  }

  const data = latest.docs[0].data();
  await updateDoc(parentRef, {
    lastMessage: messagePreview(data),
    lastMessageAt: messageCreatedAt(data),
  });
}

async function refreshPrivateChatPreviewForUser(
  chatId: string,
  uid: string,
  hiddenMessageAt: number,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  if (!db) return;

  const parentRef = doc(db, PRIVATE_CHATS, chatId);
  const parent = await getDoc(parentRef);
  if (!parent.exists()) return;

  const parentData = parent.data();
  const lastMessageAt = typeof parentData.lastMessageAt === 'number' ? parentData.lastMessageAt : null;
  if (lastMessageAt !== hiddenMessageAt) return;

  const clearedAt = asRecord<number>(parentData.clearedAt)[uid] ?? 0;
  const latestQuery = query(
    collection(db, PRIVATE_CHATS, chatId, MESSAGES_SUB),
    orderBy('createdAt', 'desc'),
    limit(MESSAGES_LIMIT),
  );
  const latest = await getDocs(latestQuery);
  const visible = latest.docs
    .map((d) => d.data())
    .find((data) => {
      const createdAt = messageCreatedAt(data);
      return createdAt > clearedAt && !isDeletedForUser(data, uid);
    });

  await updateDoc(parentRef, {
    [`lastMessageHiddenAt.${uid}`]: hiddenMessageAt,
    [`lastVisibleMessage.${uid}`]: visible ? messagePreview(visible) : '',
    [`lastVisibleMessageAt.${uid}`]: visible ? messageCreatedAt(visible) : null,
  });
}

export async function editPrivateMessage(chatId: string, messageId: string, texto: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  if (!db) return;

  const trimmed = texto.trim();
  if (!trimmed) return;

  await updateDoc(doc(db, PRIVATE_CHATS, chatId, MESSAGES_SUB, messageId), {
    texto: trimmed,
    editedAt: Date.now(),
  });

  await refreshPrivateChatPreview(chatId);
}

export async function deletePrivateMessage(
  chatId: string,
  messageId: string,
  uid: string,
  scope: DeletePrivateMessageScope,
  messageCreatedAtMs: number,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  if (!db) return;

  const messageRef = doc(db, PRIVATE_CHATS, chatId, MESSAGES_SUB, messageId);
  if (scope === 'me') {
    await updateDoc(messageRef, { [`deletedFor.${uid}`]: true });
    await refreshPrivateChatPreviewForUser(chatId, uid, messageCreatedAtMs);
    return;
  }

  if (Date.now() - messageCreatedAtMs > DELETE_FOR_EVERYONE_WINDOW_MS) {
    throw new Error('DELETE_FOR_EVERYONE_EXPIRED');
  }

  await updateDoc(messageRef, {
    texto: '',
    deletedForEveryone: true,
    deletedAt: Date.now(),
  });
  await refreshPrivateChatPreview(chatId);
}

export async function clearPrivateChatForMe(chatId: string, uid: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  if (!db) return;

  await updateDoc(doc(db, PRIVATE_CHATS, chatId), {
    [`clearedAt.${uid}`]: Date.now(),
    [`unread.${uid}`]: 0,
  });
}

// ─── subscriptions ────────────────────────────────────────────────────────────

export function subscribeMyConversations(
  myUid: string,
  onUpdate: (convs: ConversationMeta[]) => void,
): Unsubscribe | null {
  if (!isFirebaseConfigured) return null;
  const db = getDb();
  if (!db) return null;

  const q = query(
    collection(db, PRIVATE_CHATS),
    where('participants', 'array-contains', myUid),
  );

  return onSnapshot(
    q,
    (snap) => {
      const convs: ConversationMeta[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          chatId: d.id,
          participants: Array.isArray(data.participants) ? data.participants.map(String) : [],
            participantNames: (data.participantNames ?? {}) as Record<string, string>,
            lastMessage: String(data.lastMessage ?? ''),
            lastMessageAt: typeof data.lastMessageAt === 'number' ? data.lastMessageAt : null,
            unread: (data.unread ?? {}) as Record<string, number>,
            clearedAt: asRecord<number>(data.clearedAt),
            lastMessageHiddenAt: asRecord<number>(data.lastMessageHiddenAt),
            lastVisibleMessage: asRecord<string>(data.lastVisibleMessage),
            lastVisibleMessageAt: asRecord<number | null>(data.lastVisibleMessageAt),
          };
        });
      onUpdate(convs);
    },
    (error) => {
      console.error('Falha ao sincronizar conversas.', error);
    },
  );
}

export function subscribePrivateChatMessages(
  chatId: string,
  viewerUid: string,
  clearedAt: number,
  onUpdate: (messages: PrivateChatMessage[]) => void,
): Unsubscribe | null {
  if (!isFirebaseConfigured) return null;
  const db = getDb();
  if (!db) return null;

  const q = query(
    collection(db, PRIVATE_CHATS, chatId, MESSAGES_SUB),
    orderBy('createdAt', 'desc'),
    limit(MESSAGES_LIMIT),
  );

  return onSnapshot(
    q,
    (snap) => {
      const messages = snap.docs
        .map((d) => {
          const data = d.data();
          const createdAt = messageCreatedAt(data);
          if (createdAt <= clearedAt || isDeletedForUser(data, viewerUid)) return null;
          return {
            id: d.id,
            senderUid: String(data.senderUid ?? ''),
            senderNome: String(data.senderNome ?? 'Usuário'),
            texto: String(data.texto ?? ''),
            createdAt,
            editedAt: typeof data.editedAt === 'number' ? data.editedAt : null,
            deletedAt: typeof data.deletedAt === 'number' ? data.deletedAt : null,
            deletedFor: asRecord<boolean>(data.deletedFor),
            deletedForEveryone: data.deletedForEveryone === true,
          };
        })
        .filter((msg): msg is NonNullable<typeof msg> => msg !== null)
        .reverse();
      onUpdate(messages);
    },
    (error) => {
      console.error('Falha ao sincronizar mensagens.', error);
    },
  );
}
