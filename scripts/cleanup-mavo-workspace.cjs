/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { webcrypto } = require('crypto');

const WORKSPACE_OLD = 'Mavo';
const WORKSPACE_NEW = 'Auge';
const DOC_PATH = 'board/main';
const CREDS_FILE = path.resolve(process.cwd(), 'maisvarejo-39c6d-firebase-adminsdk-fbsvc-2ce6a190ef.json');
const ENV_FILE = path.resolve(process.cwd(), '.env');

function readEnvValue(filePath, key) {
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx <= 0) continue;
    if (t.slice(0, idx).trim() === key) return t.slice(idx + 1).trim();
  }
  return '';
}

function norm(s) { return String(s || '').trim().toLowerCase(); }

async function importKey(hashHex) {
  const bytes = new Uint8Array(hashHex.length / 2);
  for (let i = 0; i < hashHex.length; i += 2)
    bytes[i / 2] = parseInt(hashHex.slice(i, i + 2), 16);
  return webcrypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function decrypt(b64, key) {
  const combined = Uint8Array.from(Buffer.from(b64, 'base64'));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const dec = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ct);
  return JSON.parse(Buffer.from(dec).toString('utf8'));
}

async function encrypt(value, key) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const plain = Buffer.from(JSON.stringify(value), 'utf8');
  const ct = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, plain);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return Buffer.from(out).toString('base64');
}

function migrateEmpresaField(arr) {
  let changes = 0;
  const next = (Array.isArray(arr) ? arr : []).map((it) => {
    if (norm(it?.empresa) === norm(WORKSPACE_OLD)) {
      changes++;
      return { ...it, empresa: WORKSPACE_NEW };
    }
    return it;
  });
  return { next, changes };
}

async function run() {
  const hashHex = readEnvValue(ENV_FILE, 'VITE_APP_PASSWORD_HASH');
  if (!hashHex) throw new Error('VITE_APP_PASSWORD_HASH não encontrado');

  const sa = require(CREDS_FILE);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();
  const key = await importKey(hashHex);

  const snap = await db.doc(DOC_PATH).get();
  if (!snap.exists) throw new Error('board/main não encontrado');
  const data = snap.data() || {};

  let ritmoChanges = 0;
  let itemsChanges = 0;
  let ritmoEncrypted = data.ritmoEncrypted;
  let itemsEncrypted = data.itemsEncrypted;

  if (typeof ritmoEncrypted === 'string' && ritmoEncrypted.trim()) {
    const board = await decrypt(ritmoEncrypted, key);

    const empresas = Array.isArray(board.empresas) ? board.empresas : [];
    const deduped = [];
    const seen = new Set();
    for (const e of empresas) {
      const n = norm(e);
      if (n === norm(WORKSPACE_OLD)) {
        if (!seen.has(norm(WORKSPACE_NEW))) {
          deduped.push(WORKSPACE_NEW);
          seen.add(norm(WORKSPACE_NEW));
          ritmoChanges++;
        } else {
          ritmoChanges++;
        }
      } else if (!seen.has(n)) {
        deduped.push(e);
        seen.add(n);
      }
    }
    if (!seen.has(norm(WORKSPACE_NEW))) {
      deduped.push(WORKSPACE_NEW);
      ritmoChanges++;
    }
    board.empresas = deduped;

    const fields = ['backlog', 'prioridades', 'planos', 'tarefas'];
    for (const f of fields) {
      const { next, changes } = migrateEmpresaField(board[f]);
      board[f] = next;
      ritmoChanges += changes;
    }

    if (ritmoChanges > 0) ritmoEncrypted = await encrypt(board, key);

    console.log(`Empresas finais no board: ${board.empresas.join(', ')}`);
  }

  if (typeof itemsEncrypted === 'string' && itemsEncrypted.trim()) {
    const items = await decrypt(itemsEncrypted, key);
    const { next, changes } = migrateEmpresaField(items);
    itemsChanges = changes;
    if (changes > 0) itemsEncrypted = await encrypt(next, key);
  }

  if (ritmoChanges > 0 || itemsChanges > 0) {
    await db.doc(DOC_PATH).set(
      {
        ...(ritmoChanges > 0 ? { ritmoEncrypted } : {}),
        ...(itemsChanges > 0 ? { itemsEncrypted } : {}),
      },
      { merge: true },
    );
  }

  const usersSnap = await db.collection('users').get();
  let usersChanged = 0;
  const updates = [];
  usersSnap.forEach((doc) => {
    const u = doc.data() || {};
    const empresas = Array.isArray(u.empresas) ? u.empresas : [];
    let touched = false;
    const next = empresas.map((e) => {
      if (norm(e) === norm(WORKSPACE_OLD)) { touched = true; return WORKSPACE_NEW; }
      return e;
    });
    const deduped = [...new Set(next)];
    if (touched || deduped.length !== next.length) {
      usersChanged++;
      updates.push(doc.ref.update({ empresas: deduped }));
    }
  });
  if (updates.length > 0) await Promise.all(updates);

  console.log('Limpeza finalizada com sucesso.');
  console.log(`- board/ritmo: ${ritmoChanges} alterações`);
  console.log(`- board/items: ${itemsChanges} alterações`);
  console.log(`- users: ${usersChanged} atualizados`);
  console.log(`Workspace "${WORKSPACE_OLD}" removido. Dados migrados para "${WORKSPACE_NEW}".`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => { console.error('Falha:', err.message || err); process.exit(1); });
