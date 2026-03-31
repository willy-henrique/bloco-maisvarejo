import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { getDb } from './firebase';

export type DevUsageRow = {
  uid: string;
  nome: string;
  lastSeenAtMs: number;
  totalHeartbeats: number;
  totalPageViews: number;
};

const DEV_USAGE_COLLECTION = 'dev_usage';
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

function toMs(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v instanceof Timestamp) return v.toMillis();
  return 0;
}

export async function trackUsageHeartbeat(input: {
  uid: string;
  nome: string;
  path: string;
  pageView?: boolean;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  const ref = doc(db, DEV_USAGE_COLLECTION, input.uid);
  await setDoc(
    ref,
    {
      uid: input.uid,
      nome: input.nome,
      lastSeenAt: serverTimestamp(),
      lastPath: input.path,
      totalHeartbeats: increment(1),
      totalPageViews: increment(input.pageView ? 1 : 0),
    },
    { merge: true },
  );
}

export async function fetchDevUsageRows(): Promise<DevUsageRow[]> {
  const db = getDb();
  if (!db) return [];
  const snap = await getDocs(query(collection(db, DEV_USAGE_COLLECTION), limit(500)));
  return snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    return {
      uid: String(x.uid ?? d.id),
      nome: String(x.nome ?? ''),
      lastSeenAtMs: toMs(x.lastSeenAt),
      totalHeartbeats: Number(x.totalHeartbeats ?? 0),
      totalPageViews: Number(x.totalPageViews ?? 0),
    };
  });
}

export async function fetchOnlineUsersCount(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const threshold = Timestamp.fromMillis(Date.now() - ONLINE_WINDOW_MS);
  const q = query(
    collection(db, DEV_USAGE_COLLECTION),
    where('lastSeenAt', '>=', threshold),
    orderBy('lastSeenAt', 'desc'),
    limit(500),
  );
  const snap = await getDocs(q);
  return snap.size;
}
