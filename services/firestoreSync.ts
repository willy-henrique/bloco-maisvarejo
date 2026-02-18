/**
 * Sincronização em tempo real com Firestore.
 * Fase 1: board = prioridades + backlog; compatível com payload legado (items).
 */

import {
  doc,
  onSnapshot,
  setDoc,
  getDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import type { ActionItem, BacklogItem, PlanoDeAtaque, Prioridade, Tarefa } from '../types';
import type { BoardPayload } from './storageService';
import { migrateItemToPrioridade } from './storageService';
import { getDb, isFirebaseConfigured, BOARD_COLLECTION, BOARD_DOC_ID } from './firebase';
import { EncryptionService } from './encryptionService';

export type BoardData = {
  itemsEncrypted?: string;
  boardEncrypted?: string;
  notesEncrypted?: string;
};

export type BoardDataDecrypted = {
  prioridades: Prioridade[];
  backlog: BacklogItem[];
  planos: PlanoDeAtaque[];
  tarefas: Tarefa[];
  notes: string;
};

function getBoardRef() {
  const database = getDb();
  if (!database) return null;
  return doc(database, BOARD_COLLECTION, BOARD_DOC_ID);
}

/**
 * Inscreve em atualizações em tempo real (prioridades + backlog + planos + tarefas + notas).
 */
export function subscribeBoard(
  encryptionKey: CryptoKey,
  onBoard: (prioridades: Prioridade[], backlog: BacklogItem[], planos: PlanoDeAtaque[], tarefas: Tarefa[]) => void,
  onNotes: (notes: string) => void
): Unsubscribe | null {
  const ref = getBoardRef();
  if (!ref) return null;

  return onSnapshot(ref, async (snap) => {
    const data = snap.data() as BoardData | undefined;
    if (!data) return;

    if (data.boardEncrypted) {
      try {
        const dec = await EncryptionService.decrypt<BoardPayload>(data.boardEncrypted, encryptionKey);
        if (dec?.prioridades && dec?.backlog) {
          onBoard(
            dec.prioridades,
            dec.backlog,
            Array.isArray(dec.planos) ? dec.planos : [],
            Array.isArray(dec.tarefas) ? dec.tarefas : []
          );
        }
      } catch {
        // chave diferente
      }
    } else if (data.itemsEncrypted) {
      try {
        const items = await EncryptionService.decrypt<ActionItem[]>(data.itemsEncrypted, encryptionKey);
        if (Array.isArray(items) && items.length > 0) {
          onBoard(items.map(migrateItemToPrioridade), [], [], []);
        }
      } catch {
        // chave diferente
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
 * Salva prioridades + backlog + planos + tarefas no Firestore (criptografados).
 */
export async function saveBoard(
  prioridades: Prioridade[],
  backlog: BacklogItem[],
  planos: PlanoDeAtaque[],
  tarefas: Tarefa[],
  encryptionKey: CryptoKey
): Promise<void> {
  const ref = getBoardRef();
  if (!ref) return;

  const payload: BoardPayload = { v: 3, prioridades, backlog, planos, tarefas };
  const encrypted = await EncryptionService.encrypt(payload, encryptionKey);
  const snap = await getDoc(ref);
  const existing = (snap.data() as BoardData) || {};
  await setDoc(ref, { ...existing, boardEncrypted: encrypted }, { merge: true });
}

/** Legado: salva itens (ActionItem[]) — usado apenas se ainda não migrou */
export async function saveBoardItems(items: ActionItem[], encryptionKey: CryptoKey): Promise<void> {
  const ref = getBoardRef();
  if (!ref) return;
  const encrypted = await EncryptionService.encrypt(items, encryptionKey);
  const snap = await getDoc(ref);
  const existing = (snap.data() as BoardData) || {};
  await setDoc(ref, { ...existing, itemsEncrypted: encrypted }, { merge: true });
}

/**
 * Salva notas no Firestore (criptografadas).
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
 * Carrega prioridades + backlog + notas uma vez. Migra de itemsEncrypted se for o caso.
 */
export async function getBoardDataOnce(
  encryptionKey: CryptoKey
): Promise<BoardDataDecrypted | null> {
  const ref = getBoardRef();
  if (!ref) return null;
  try {
    const snap = await getDoc(ref);
    const data = snap.data() as BoardData | undefined;
    if (!data) return { prioridades: [], backlog: [], planos: [], tarefas: [], notes: '' };

    let prioridades: Prioridade[] = [];
    let backlog: BacklogItem[] = [];
    let planos: PlanoDeAtaque[] = [];
    let tarefas: Tarefa[] = [];
    let notes = '';

    if (data.boardEncrypted) {
      const dec = await EncryptionService.decrypt<BoardPayload>(data.boardEncrypted, encryptionKey);
      if (dec?.prioridades) prioridades = dec.prioridades;
      if (dec?.backlog) backlog = dec.backlog;
      if (Array.isArray(dec?.planos)) planos = dec.planos;
      if (Array.isArray(dec?.tarefas)) tarefas = dec.tarefas;
    } else if (data.itemsEncrypted) {
      const items = await EncryptionService.decrypt<ActionItem[]>(data.itemsEncrypted, encryptionKey);
      if (Array.isArray(items)) {
        prioridades = items.map(migrateItemToPrioridade);
        backlog = [];
      }
    }

    if (data.notesEncrypted !== undefined) {
      const dec = await EncryptionService.decrypt<string>(data.notesEncrypted, encryptionKey);
      notes = typeof dec === 'string' ? dec : '';
    }

    return { prioridades, backlog, planos, tarefas, notes };
  } catch {
    return null;
  }
}

export { isFirebaseConfigured };
