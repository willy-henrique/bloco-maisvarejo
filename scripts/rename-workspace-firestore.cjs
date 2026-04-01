/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { webcrypto } = require('crypto');

const WORKSPACE_FROM = 'Mavo';
const WORKSPACE_TO = 'Auge';
const DOC_PATH = 'board/main';
const CREDS_FILE = path.resolve(process.cwd(), 'maisvarejo-39c6d-firebase-adminsdk-fbsvc-2ce6a190ef.json');
const ENV_FILE = path.resolve(process.cwd(), '.env');

function readEnvValue(filePath, key) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const k = trimmed.slice(0, idx).trim();
    if (k !== key) continue;
    return trimmed.slice(idx + 1).trim();
  }
  return '';
}

function b64ToBytes(b64) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

function bytesToB64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function normalizeWorkspaceName(name) {
  return String(name || '').trim().toLowerCase();
}

function renameIfMatch(name) {
  return normalizeWorkspaceName(name) === normalizeWorkspaceName(WORKSPACE_FROM) ? WORKSPACE_TO : name;
}

async function importAesKeyFromHashHex(hashHex) {
  const bytes = new Uint8Array(hashHex.length / 2);
  for (let i = 0; i < hashHex.length; i += 2) {
    bytes[i / 2] = parseInt(hashHex.slice(i, i + 2), 16);
  }
  return webcrypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

async function decryptJson(base64Payload, key) {
  const combined = b64ToBytes(base64Payload);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    ciphertext,
  );
  const str = Buffer.from(decrypted).toString('utf8');
  return JSON.parse(str);
}

async function encryptJson(value, key) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const plain = Buffer.from(JSON.stringify(value), 'utf8');
  const cipher = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    plain,
  );
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), iv.length);
  return bytesToB64(out);
}

function renameInBoard(board) {
  const next = { ...board };
  let changes = 0;

  const renameEmpresaField = (arr) =>
    (Array.isArray(arr) ? arr : []).map((it) => {
      const empresa = String(it?.empresa ?? '');
      const renamed = renameIfMatch(empresa);
      if (renamed !== empresa) {
        changes += 1;
        return { ...it, empresa: renamed };
      }
      return it;
    });

  const empresas = Array.isArray(next.empresas) ? next.empresas : [];
  next.empresas = empresas.map((e) => {
    const renamed = renameIfMatch(e);
    if (renamed !== e) changes += 1;
    return renamed;
  });
  next.backlog = renameEmpresaField(next.backlog);
  next.prioridades = renameEmpresaField(next.prioridades);
  next.planos = renameEmpresaField(next.planos);
  next.tarefas = renameEmpresaField(next.tarefas);

  return { next, changes };
}

function renameInItems(items) {
  let changes = 0;
  const next = (Array.isArray(items) ? items : []).map((it) => {
    const empresa = String(it?.empresa ?? '');
    const renamed = renameIfMatch(empresa);
    if (renamed !== empresa) {
      changes += 1;
      return { ...it, empresa: renamed };
    }
    return it;
  });
  return { next, changes };
}

async function run() {
  if (!fs.existsSync(CREDS_FILE)) {
    throw new Error(`Credencial não encontrada: ${CREDS_FILE}`);
  }
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`Arquivo .env não encontrado: ${ENV_FILE}`);
  }

  const hashHex = readEnvValue(ENV_FILE, 'VITE_APP_PASSWORD_HASH');
  if (!hashHex) throw new Error('VITE_APP_PASSWORD_HASH não encontrado no .env');

  const serviceAccount = require(CREDS_FILE);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const key = await importAesKeyFromHashHex(hashHex);

  const boardRef = db.doc(DOC_PATH);
  const snap = await boardRef.get();
  if (!snap.exists) throw new Error(`Documento não encontrado: ${DOC_PATH}`);
  const data = snap.data() || {};

  let ritmoChanged = 0;
  let itemsChanged = 0;
  let ritmoEncrypted = data.ritmoEncrypted;
  let itemsEncrypted = data.itemsEncrypted;

  if (typeof ritmoEncrypted === 'string' && ritmoEncrypted.trim()) {
    const board = await decryptJson(ritmoEncrypted, key);
    const { next, changes } = renameInBoard(board);
    ritmoChanged = changes;
    if (changes > 0) {
      ritmoEncrypted = await encryptJson(next, key);
    }
  }

  if (typeof itemsEncrypted === 'string' && itemsEncrypted.trim()) {
    const items = await decryptJson(itemsEncrypted, key);
    const { next, changes } = renameInItems(items);
    itemsChanged = changes;
    if (changes > 0) {
      itemsEncrypted = await encryptJson(next, key);
    }
  }

  if (ritmoChanged > 0 || itemsChanged > 0) {
    await boardRef.set(
      {
        ...(ritmoChanged > 0 ? { ritmoEncrypted } : {}),
        ...(itemsChanged > 0 ? { itemsEncrypted } : {}),
      },
      { merge: true },
    );
  }

  const usersSnap = await db.collection('users').get();
  let usersChanged = 0;
  const userUpdates = [];
  usersSnap.forEach((doc) => {
    const u = doc.data() || {};
    const empresas = Array.isArray(u.empresas) ? u.empresas : [];
    let touched = false;
    const nextEmpresas = empresas.map((e) => {
      const renamed = renameIfMatch(e);
      if (renamed !== e) touched = true;
      return renamed;
    });
    if (touched) {
      usersChanged += 1;
      userUpdates.push(doc.ref.update({ empresas: nextEmpresas }));
    }
  });
  if (userUpdates.length > 0) await Promise.all(userUpdates);

  console.log('Migração finalizada com sucesso.');
  console.log(`- board/ritmo campos alterados: ${ritmoChanged}`);
  console.log(`- board/items campos alterados: ${itemsChanged}`);
  console.log(`- users atualizados: ${usersChanged}`);
  console.log(`Workspace renomeado: "${WORKSPACE_FROM}" -> "${WORKSPACE_TO}"`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Falha na migração:', err.message || err);
    process.exit(1);
  });

