import {
  collection,
  doc,
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
      onChange(Array.isArray(data?.items) ? data!.items : []);
    },
    (_err) => {
      onChange([]);
    },
  );
}

export async function saveAgenda(uid: string, items: AgendaItem[]): Promise<void> {
  if (!isFirebaseConfigured) return;
  const ref = getAgendaRef(uid);
  if (!ref) return;
  await setDoc(ref, { items }, { merge: false });
}
