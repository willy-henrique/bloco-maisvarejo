/**
 * Criptografia ponta a ponta: AES-256-GCM (Web Crypto API).
 * Chave nunca hardcoded — derivada da senha no login (PBKDF2).
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const TAG_LENGTH = 128;
const PBKDF2_ITERATIONS = Number(import.meta.env.VITE_APP_PBKDF2_ITERATIONS) || 310000;
const SALT_BYTES = 16;

export function getEnvSalt(): string {
  const salt = import.meta.env.VITE_APP_PASSWORD_SALT;
  if (!salt || typeof salt !== 'string') {
    throw new Error('VITE_APP_PASSWORD_SALT não configurado. Execute: node scripts/generate-password-hash.js "SuaSenha"');
  }
  return salt;
}

/**
 * Deriva chave de criptografia a partir da senha (PBKDF2-HMAC-SHA256).
 * Usado no login: uma derivação para verificação, outra para a chave AES.
 */
export async function deriveKeyFromPassword(
  password: string,
  saltHex: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const salt = hexToBuffer(saltHex);
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable: necessário para guardar na sessão e reimportar
    ['encrypt', 'decrypt']
  );
}

/**
 * Verifica senha contra o hash armazenado no .env (PBKDF2).
 */
export async function verifyPassword(password: string): Promise<boolean> {
  const saltHex = getEnvSalt();
  const storedHashHex = import.meta.env.VITE_APP_PASSWORD_HASH;
  if (!storedHashHex || typeof storedHashHex !== 'string') {
    throw new Error('VITE_APP_PASSWORD_HASH não configurado. Execute: node scripts/generate-password-hash.js "SuaSenha"');
  }
  const derivedKey = await deriveKeyFromPassword(password, saltHex);
  const derivedBuffer = await crypto.subtle.exportKey('raw', derivedKey);
  const derivedHex = bufferToHex(derivedBuffer);
  return secureCompare(derivedHex, storedHashHex);
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

/**
 * Exporta chave CryptoKey para string (sessionStorage).
 */
export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

/**
 * Importa chave a partir de string (sessionStorage).
 */
export async function importKeyFromBase64(base64: string): Promise<CryptoKey> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey(
    'raw',
    bytes,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Criptografa dados com AES-256-GCM (IV + ciphertext + tag em base64).
 */
export async function encryptWithKey(data: string | object, key: CryptoKey): Promise<string> {
  const json = typeof data === 'string' ? data : JSON.stringify(data);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(json);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv,
      tagLength: TAG_LENGTH
    },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Descriptografa payload produzido por encryptWithKey.
 */
export async function decryptWithKey<T>(encryptedBase64: string, key: CryptoKey): Promise<T | null> {
  try {
    const binary = atob(encryptedBase64);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv,
        tagLength: TAG_LENGTH
      },
      key,
      ciphertext
    );
    const str = new TextDecoder().decode(decrypted);
    try {
      return JSON.parse(str) as T;
    } catch {
      return str as T;
    }
  } catch {
    return null;
  }
}

/** Namespace legado para compatibilidade: métodos que recebem key do Auth. */
export const EncryptionService = {
  async encrypt(data: unknown, key: CryptoKey): Promise<string> {
    return encryptWithKey(data, key);
  },
  async decrypt<T>(encryptedData: string, key: CryptoKey): Promise<T | null> {
    return decryptWithKey<T>(encryptedData, key);
  },
  verifyPassword,
  deriveKeyFromPassword,
  exportKeyToBase64,
  importKeyFromBase64,
  getEnvSalt
};
