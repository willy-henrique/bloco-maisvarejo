/**
 * Persistência com RLS: toda leitura/escrita exige chave de criptografia válida (sessão autenticada).
 * Dados sempre criptografados com AES-256-GCM antes de persistir.
 * Fase 1: board = prioridades + backlog; migração automática a partir de items legado.
 */

import { ActionItem, BacklogItem, ItemStatus, PlanoDeAtaque, Prioridade, PrioridadeStatus, Tarefa } from '../types';
import { EncryptionService } from './encryptionService';

const STORAGE_KEY_ITEMS = '@Estrategico:Items_Encrypted';
const STORAGE_KEY_BOARD = '@Estrategico:Board_Encrypted';
const STORAGE_KEY_NOTES = '@Estrategico:PrivateNote_Encrypted';
const BOARD_VERSION = 3;

export type BoardPayload = {
  v: number;
  prioridades: Prioridade[];
  backlog: BacklogItem[];
  planos: PlanoDeAtaque[];
  tarefas: Tarefa[];
};

function assertKey(key: CryptoKey | null): asserts key is CryptoKey {
  if (!key) {
    throw new Error('RLS: Acesso negado. Faça login para acessar os dados.');
  }
}

/** Migração legado: ActionItem → Prioridade (exportado para Firestore ao ler payload antigo). */
export function migrateItemToPrioridade(item: ActionItem): Prioridade {
  const statusMap: Record<ItemStatus, PrioridadeStatus> = {
    [ItemStatus.ACTIVE]: PrioridadeStatus.EXECUCAO,
    [ItemStatus.EXECUTING]: PrioridadeStatus.EXECUCAO,
    [ItemStatus.BLOCKED]: PrioridadeStatus.BLOQUEADO,
    [ItemStatus.COMPLETED]: PrioridadeStatus.CONCLUIDO,
  };
  return {
    id: item.id,
    titulo: item.what || 'Sem título',
    descricao: item.why || '',
    dono_id: item.who || '',
    data_inicio: item.when || new Date().toISOString().split('T')[0],
    data_alvo: item.when || new Date().toISOString().split('T')[0],
    status_prioridade: statusMap[item.status] ?? PrioridadeStatus.EXECUCAO,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export class StorageService {
  /**
   * Retorna prioridades + backlog. Se existir apenas dados legado (items), migra e retorna.
   */
  static async getBoard(encryptionKey: CryptoKey | null): Promise<BoardPayload> {
    assertKey(encryptionKey);

    const boardEncrypted = localStorage.getItem(STORAGE_KEY_BOARD);
    if (boardEncrypted) {
      const dec = await EncryptionService.decrypt<BoardPayload>(boardEncrypted, encryptionKey);
      if (dec?.prioridades && Array.isArray(dec.prioridades) && Array.isArray(dec.backlog)) {
        const planos = Array.isArray(dec.planos) ? dec.planos : [];
        const tarefas = Array.isArray(dec.tarefas) ? dec.tarefas : [];
        return { v: BOARD_VERSION, prioridades: dec.prioridades, backlog: dec.backlog, planos, tarefas };
      }
    }

    const legacyEncrypted = localStorage.getItem(STORAGE_KEY_ITEMS);
    if (legacyEncrypted) {
      const items = await EncryptionService.decrypt<ActionItem[]>(legacyEncrypted, encryptionKey);
      if (Array.isArray(items) && items.length > 0) {
        const prioridades = items.map(migrateItemToPrioridade);
        return { v: BOARD_VERSION, prioridades, backlog: [], planos: [], tarefas: [] };
      }
    }

    return { v: BOARD_VERSION, prioridades: [], backlog: [], planos: [], tarefas: [] };
  }

  static async saveBoard(
    payload: { prioridades: Prioridade[]; backlog: BacklogItem[]; planos?: PlanoDeAtaque[]; tarefas?: Tarefa[] },
    encryptionKey: CryptoKey | null
  ): Promise<void> {
    assertKey(encryptionKey);
    const toSave: BoardPayload = {
      v: BOARD_VERSION,
      prioridades: payload.prioridades,
      backlog: payload.backlog,
      planos: payload.planos ?? [],
      tarefas: payload.tarefas ?? [],
    };
    const encrypted = await EncryptionService.encrypt(toSave, encryptionKey);
    localStorage.setItem(STORAGE_KEY_BOARD, encrypted);
  }

  /** Legado: usado apenas na migração e por Firestore ao ler payload antigo */
  static async getItems(encryptionKey: CryptoKey | null): Promise<ActionItem[]> {
    assertKey(encryptionKey);
    const encrypted = localStorage.getItem(STORAGE_KEY_ITEMS);
    if (!encrypted) return [];
    const decrypted = await EncryptionService.decrypt<ActionItem[]>(encrypted, encryptionKey);
    return decrypted ?? [];
  }

  static async saveItems(items: ActionItem[], encryptionKey: CryptoKey | null): Promise<void> {
    assertKey(encryptionKey);
    const encrypted = await EncryptionService.encrypt(items, encryptionKey);
    localStorage.setItem(STORAGE_KEY_ITEMS, encrypted);
  }

  /**
   * Notas estratégicas: criptografadas ponta a ponta (RLS).
   */
  static async getStrategicNote(encryptionKey: CryptoKey | null): Promise<string> {
    assertKey(encryptionKey);
    const encrypted = localStorage.getItem(STORAGE_KEY_NOTES);
    if (!encrypted) return '';
    const decrypted = await EncryptionService.decrypt<string>(encrypted, encryptionKey);
    return typeof decrypted === 'string' ? decrypted : '';
  }

  static async saveStrategicNote(content: string, encryptionKey: CryptoKey | null): Promise<void> {
    assertKey(encryptionKey);
    const encrypted = await EncryptionService.encrypt(content, encryptionKey);
    localStorage.setItem(STORAGE_KEY_NOTES, encrypted);
  }
}
