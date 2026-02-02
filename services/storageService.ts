/**
 * Persistência com RLS: toda leitura/escrita exige chave de criptografia válida (sessão autenticada).
 * Dados sempre criptografados com AES-256-GCM antes de persistir.
 */

import { ActionItem } from '../types';
import { EncryptionService } from './encryptionService';

const STORAGE_KEY_ITEMS = '@Estrategico:Items_Encrypted';
const STORAGE_KEY_NOTES = '@Estrategico:PrivateNote_Encrypted';

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
}
