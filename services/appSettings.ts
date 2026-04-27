import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from './firebase';
import type { AppSettings } from '../types/appSettings';

export const APP_SETTINGS_COLLECTION = 'appSettings';
export const APP_SETTINGS_DOC_ID = 'config';

const DEFAULTS: AppSettings = {
  estrategicoFiltrarKanbanPorWho: false,
  backlogPermiteAlterarEmpresa: false,
  backlogPermiteAlterarData: false,
  tarefaPermiteAlterarData: false,
};

export function getDefaultAppSettings(): AppSettings {
  return { ...DEFAULTS };
}

function merge(data: Partial<AppSettings> | undefined): AppSettings {
  return { ...DEFAULTS, ...data };
}

export async function getAppSettings(): Promise<AppSettings> {
  const db = getDb();
  if (!db || !isFirebaseConfigured) return getDefaultAppSettings();
  try {
    const snap = await getDoc(doc(db, APP_SETTINGS_COLLECTION, APP_SETTINGS_DOC_ID));
    if (!snap.exists()) return getDefaultAppSettings();
    return merge(snap.data() as Partial<AppSettings>);
  } catch {
    return getDefaultAppSettings();
  }
}

/** Atualiza configurações (merge). Só administrador deve chamar (regras Firestore). */
export async function saveAppSettings(partial: Partial<AppSettings>): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('Firestore não configurado');
  await setDoc(
    doc(db, APP_SETTINGS_COLLECTION, APP_SETTINGS_DOC_ID),
    { ...partial },
    { merge: true },
  );
}

/** Inscreve em alterações (todos os usuários autenticados podem ler). */
export function subscribeAppSettings(onNext: (settings: AppSettings) => void): () => void {
  const db = getDb();
  if (!db || !isFirebaseConfigured) {
    onNext(getDefaultAppSettings());
    return () => {};
  }
  const unsub = onSnapshot(
    doc(db, APP_SETTINGS_COLLECTION, APP_SETTINGS_DOC_ID),
    (snap) => {
      if (!snap.exists()) {
        onNext(getDefaultAppSettings());
        return;
      }
      onNext(merge(snap.data() as Partial<AppSettings>));
    },
    () => {
      onNext(getDefaultAppSettings());
    },
  );
  return unsub;
}
