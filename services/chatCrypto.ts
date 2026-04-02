import { importKeyFromBase64, encryptWithKey, decryptWithKey } from './encryptionService';

const SESSION_KEY_SLOT = '@Estrategico:EncryptionKey';

async function getKey(): Promise<CryptoKey | null> {
  try {
    const b64 = sessionStorage.getItem(SESSION_KEY_SLOT);
    if (!b64) return null;
    return await importKeyFromBase64(b64);
  } catch {
    return null;
  }
}

export async function encryptChat(data: unknown): Promise<string | null> {
  const key = await getKey();
  if (!key) return null;
  try {
    return await encryptWithKey(data, key);
  } catch {
    return null;
  }
}

export async function decryptChat<T>(cipher: string): Promise<T | null> {
  const key = await getKey();
  if (!key) return null;
  return decryptWithKey<T>(cipher, key);
}
