/**
 * Sincronização em tempo real com Firestore (estilo Excel).
 * Dados são criptografados antes de enviar; ao receber, descriptografamos.
 */

import {
  doc,
  onSnapshot,
  setDoc,
  getDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { ActionItem } from '../types';
import { getDb, isFirebaseConfigured, BOARD_COLLECTION, BOARD_DOC_ID } from './firebase';
import { EncryptionService } from './encryptionService';

export type BoardData = {
  itemsEncrypted?: string;
  notesEncrypted?: string;
};

function getBoardRef() {
  const database = getDb();
  if (!database) return null;
  return doc(database, BOARD_COLLECTION, BOARD_DOC_ID);
}

/**
 * Inscreve em atualizações em tempo real do board (itens + notas).
 * Quando outro usuário salvar, onItems/onNotes são chamados com os dados descriptografados.
 */
export function subscribeBoard(
  encryptionKey: CryptoKey,
  onItems: (items: ActionItem[]) => void,
  onNotes: (notes: string) => void
): Unsubscribe | null {
  const ref = getBoardRef();
  if (!ref) return null;

  return onSnapshot(ref, async (snap) => {
    const data = snap.data() as BoardData | undefined;
    if (!data) return;

    if (data.itemsEncrypted) {
      try {
        const items = await EncryptionService.decrypt<ActionItem[]>(data.itemsEncrypted, encryptionKey);
        if (Array.isArray(items)) onItems(items);
      } catch {
        // payload de outro usuário pode falhar se a chave for diferente; ignorar
      }
    }
    if (data.notesEncrypted !== undefined) {
      try {
        const notes = await EncryptionService.decrypt<string>(data.notesEncrypted, encryptionKey);
        onNotes(typeof notes === 'string' ? notes : '');
      } catch {
        // idem
      }
    }
  });
}

/**
 * Salva itens no Firestore (criptografados). Outros usuários recebem via onSnapshot.
 */
export async function saveBoardItems(items: ActionItem[], encryptionKey: CryptoKey): Promise<void> {
  const ref = getBoardRef();
  if (!ref) return;

  const encrypted = await EncryptionService.encrypt(items, encryptionKey);
  const snap = await getDoc(ref);
  const existing = (snap.data() as BoardData) || {};
  await setDoc(ref, { ...existing, itemsEncrypted: encrypted }, { merge: true });
}

/**
 * Salva notas no Firestore (criptografadas). Outros usuários recebem via onSnapshot.
 */
export async function saveBoardNotes(notes: string, encryptionKey: CryptoKey): Promise<void> {
  const ref = getBoardRef();
  if (!ref) return;

  const encrypted = await EncryptionService.encrypt(notes, encryptionKey);
  const snap = await getDoc(ref);
  const existing = (snap.data() as BoardData) || {};
  await setDoc(ref, { ...existing, notesEncrypted: encrypted }, { merge: true });
}

/**
 * Carrega itens e notas uma vez (para carga inicial). Retorna null se doc não existir ou falhar.
 */
export async function getBoardDataOnce(
  encryptionKey: CryptoKey
): Promise<{ items: ActionItem[]; notes: string } | null> {
  const ref = getBoardRef();
  if (!ref) return null;
  try {
    const snap = await getDoc(ref);
    const data = snap.data() as BoardData | undefined;
    if (!data) return { items: [], notes: '' };

    let items: ActionItem[] = [];
    let notes = '';
    if (data.itemsEncrypted) {
      const dec = await EncryptionService.decrypt<ActionItem[]>(data.itemsEncrypted, encryptionKey);
      if (Array.isArray(dec)) items = dec;
    }
    if (data.notesEncrypted !== undefined) {
      const dec = await EncryptionService.decrypt<string>(data.notesEncrypted, encryptionKey);
      notes = typeof dec === 'string' ? dec : '';
    }
    return { items, notes };
  } catch {
    return null;
  }
}

export { isFirebaseConfigured };
