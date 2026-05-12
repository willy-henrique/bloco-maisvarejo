import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from './firebase';

const GENERAL_CHAT_COL = 'generalChat';
const GENERAL_CHAT_ID = 'main';
const MESSAGES_SUB = 'messages';
const MESSAGES_LIMIT = 100;

export interface GeneralChatMessage {
  id: string;
  senderUid: string;
  senderNome: string;
  texto: string;
  createdAt: number;
  replyTo?: { messageId: string; senderNome: string; texto: string };
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

export async function sendGeneralMessage(
  senderUid: string,
  senderNome: string,
  texto: string,
  replyTo?: GeneralChatMessage['replyTo'],
): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  if (!db) return;

  const trimmed = texto.trim();
  const now = Date.now();

  const msgData: Record<string, unknown> = {
    senderUid,
    senderNome,
    texto: trimmed,
    createdAt: now,
    createdAtServer: serverTimestamp(),
  };
  if (replyTo) msgData.replyTo = replyTo;

  await addDoc(collection(db, GENERAL_CHAT_COL, GENERAL_CHAT_ID, MESSAGES_SUB), msgData);

  await setDoc(
    doc(db, GENERAL_CHAT_COL, GENERAL_CHAT_ID),
    { lastMessage: trimmed.slice(0, 100), lastMessageAt: now },
    { merge: true },
  );
}

export async function markGeneralChatRead(uid: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  if (!db) return;
  try {
    await updateDoc(doc(db, GENERAL_CHAT_COL, GENERAL_CHAT_ID), {
      [`lastReadAt.${uid}`]: Date.now(),
    });
  } catch {
    // doc ainda não existe — sem mensagens enviadas
  }
}

export function subscribeGeneralChatMessages(
  onUpdate: (messages: GeneralChatMessage[]) => void,
): Unsubscribe | null {
  if (!isFirebaseConfigured) return null;
  const db = getDb();
  if (!db) return null;

  let unsubscribed = false;

  const q = query(
    collection(db, GENERAL_CHAT_COL, GENERAL_CHAT_ID, MESSAGES_SUB),
    orderBy('createdAt', 'desc'),
    limit(MESSAGES_LIMIT),
  );

  let unsub: Unsubscribe;
  try {
    unsub = onSnapshot(
      q,
      (snap) => {
        if (unsubscribed) return;
        const messages: GeneralChatMessage[] = snap.docs
          .map((d) => {
            const data = d.data();
            const createdAt = toMillis(data.createdAt) ?? toMillis(data.createdAtServer) ?? Date.now();
            const rt = data.replyTo as Record<string, unknown> | undefined;
            const replyTo =
              rt && typeof rt === 'object' && typeof rt.messageId === 'string'
                ? {
                    messageId: rt.messageId,
                    senderNome: String(rt.senderNome ?? ''),
                    texto: String(rt.texto ?? '').slice(0, 200),
                  }
                : undefined;
            return {
              id: d.id,
              senderUid: String(data.senderUid ?? ''),
              senderNome: String(data.senderNome ?? 'Usuário'),
              texto: String(data.texto ?? ''),
              createdAt,
              replyTo,
            };
          })
          .reverse();
        onUpdate(messages);
      },
      (error) => {
        if (unsubscribed) return;
        // Permission errors must not propagate — they can crash the Firestore SDK
        if ((error as { code?: string }).code === 'permission-denied') {
          console.warn('[generalChat] Sem permissão para ler mensagens. Verifique as regras do Firestore.');
          onUpdate([]);
        } else {
          console.error('[generalChat] Falha ao sincronizar mensagens.', error);
        }
        unsubscribed = true;
      },
    );
  } catch {
    return null;
  }

  return () => {
    unsubscribed = true;
    unsub();
  };
}

export function subscribeGeneralChatMeta(
  onUpdate: (meta: { lastMessageAt: number | null; lastReadAt: Record<string, number> }) => void,
): Unsubscribe | null {
  if (!isFirebaseConfigured) return null;
  const db = getDb();
  if (!db) return null;

  let unsubscribed = false;

  let unsub: Unsubscribe;
  try {
    unsub = onSnapshot(
      doc(db, GENERAL_CHAT_COL, GENERAL_CHAT_ID),
      (snap) => {
        if (unsubscribed) return;
        if (!snap.exists()) {
          onUpdate({ lastMessageAt: null, lastReadAt: {} });
          return;
        }
        const data = snap.data();
        const lastMessageAt = typeof data.lastMessageAt === 'number' ? data.lastMessageAt : null;
        const lastReadAt =
          data.lastReadAt && typeof data.lastReadAt === 'object' && !Array.isArray(data.lastReadAt)
            ? (data.lastReadAt as Record<string, number>)
            : {};
        onUpdate({ lastMessageAt, lastReadAt });
      },
      (error) => {
        if (unsubscribed) return;
        if ((error as { code?: string }).code === 'permission-denied') {
          console.warn('[generalChat] Sem permissão para ler meta do chat. Verifique as regras do Firestore.');
          onUpdate({ lastMessageAt: null, lastReadAt: {} });
        } else {
          console.error('[generalChat] Falha ao sincronizar meta do chat.', error);
        }
        unsubscribed = true;
      },
    );
  } catch {
    return null;
  }

  return () => {
    unsubscribed = true;
    unsub();
  };
}
