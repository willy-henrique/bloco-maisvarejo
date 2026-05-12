import {
  doc,
  setDoc,
  collection,
  query,
  where,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from './firebase';

const PRESENCE_COLLECTION = 'presence';

// Considera online se o lastSeen foi atualizado nos últimos 2 minutos
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

// ─── write helpers ────────────────────────────────────────────────────────────

export async function setUserOnline(uid: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  if (!db) return;
  try {
    await setDoc(
      doc(db, PRESENCE_COLLECTION, uid),
      { online: true, lastSeen: Date.now() },
      { merge: true },
    );
  } catch {
    // Ignora silenciosamente (sem acesso offline etc.)
  }
}

export async function setUserOffline(uid: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  const db = getDb();
  if (!db) return;
  try {
    await setDoc(
      doc(db, PRESENCE_COLLECTION, uid),
      { online: false, lastSeen: Date.now() },
      { merge: true },
    );
  } catch {
    // Ignora
  }
}

// ─── subscription ─────────────────────────────────────────────────────────────

/**
 * Escuta em tempo real todos os UIDs com `online == true` (e lastSeen recente).
 * Retorna um Set com os UIDs atualmente online.
 */
export function subscribeOnlineUsers(
  onUpdate: (onlineUids: Set<string>) => void,
): Unsubscribe | null {
  if (!isFirebaseConfigured) return null;
  const db = getDb();
  if (!db) return null;

  const q = query(
    collection(db, PRESENCE_COLLECTION),
    where('online', '==', true),
  );

  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const set = new Set<string>();
      snap.docs.forEach((d) => {
        const lastSeen = typeof d.data().lastSeen === 'number' ? (d.data().lastSeen as number) : 0;
        if (now - lastSeen < ONLINE_THRESHOLD_MS) {
          set.add(d.id);
        }
      });
      onUpdate(set);
    },
    () => {
      onUpdate(new Set());
    },
  );
}
