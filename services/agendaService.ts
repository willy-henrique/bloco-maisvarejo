import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { AgendaItem } from '../types';
import { getDb, isFirebaseConfigured } from './firebase';

const AGENDA_COLLECTION = 'userAgenda';

function getAgendaRef(uid: string) {
  const db = getDb();
  if (!db) return null;
  return doc(db, AGENDA_COLLECTION, uid);
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
      // não limpa os itens em caso de erro — mantém o estado atual
    },
  );
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

export async function saveAgenda(uid: string, items: AgendaItem[]): Promise<void> {
  if (!isFirebaseConfigured) return;
  const ref = getAgendaRef(uid);
  if (!ref) return;
  await setDoc(ref, { items: sanitize(items) }, { merge: false });
}
