/**
 * Persistência com RLS: toda leitura/escrita exige chave de criptografia válida (sessão autenticada).
 * Dados sempre criptografados com AES-256-GCM antes de persistir.
 */

import { ActionItem, RitmoGestaoBoard } from '../types';
import { EncryptionService } from './encryptionService';

const STORAGE_KEY_ITEMS = '@Estrategico:Items_Encrypted';
const STORAGE_KEY_NOTES = '@Estrategico:PrivateNote_Encrypted';
const STORAGE_KEY_RITMO = '@Estrategico:RitmoGestao_Encrypted';

function assertKey(key: CryptoKey | null): asserts key is CryptoKey {
  if (!key) {
    throw new Error('RLS: Acesso negado. Faça login para acessar os dados.');
  }
}

export class StorageService {
  /**
   * RLS: retorna itens apenas se a sessão tiver chave de criptografia válida.
   */
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

  /** Ritmo de Gestão: board completo (backlog, prioridades, planos, tarefas, responsáveis, empresas). */
  static async getRitmoBoard(encryptionKey: CryptoKey | null): Promise<RitmoGestaoBoard> {
    assertKey(encryptionKey);
    const encrypted = localStorage.getItem(STORAGE_KEY_RITMO);
    if (!encrypted) {
      return { backlog: [], prioridades: [], planos: [], tarefas: [], responsaveis: [], empresas: [] };
    }
    const dec = await EncryptionService.decrypt<RitmoGestaoBoard>(encrypted, encryptionKey);
    if (!dec || typeof dec !== 'object') {
      return { backlog: [], prioridades: [], planos: [], tarefas: [], responsaveis: [], empresas: [] };
    }
    return {
      backlog: Array.isArray(dec.backlog) ? dec.backlog : [],
      prioridades: Array.isArray(dec.prioridades) ? dec.prioridades : [],
      planos: Array.isArray(dec.planos) ? dec.planos : [],
      tarefas: Array.isArray(dec.tarefas) ? dec.tarefas : [],
      responsaveis: Array.isArray(dec.responsaveis) ? dec.responsaveis : [],
      empresas: Array.isArray((dec as RitmoGestaoBoard).empresas) ? (dec as RitmoGestaoBoard).empresas : [],
    };
  }

  static async saveRitmoBoard(board: RitmoGestaoBoard, encryptionKey: CryptoKey | null): Promise<void> {
    assertKey(encryptionKey);
    const encrypted = await EncryptionService.encrypt(board, encryptionKey);
    localStorage.setItem(STORAGE_KEY_RITMO, encrypted);
  }
}
