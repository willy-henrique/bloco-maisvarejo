/**
 * Gera VITE_APP_PASSWORD_SALT e VITE_APP_PASSWORD_HASH para .env
 * Uso: node scripts/generate-password-hash.js "SuaSenhaSegura"
 * Nunca commite a senha. Cole as linhas geradas no .env.local
 */
import crypto from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('Uso: node scripts/generate-password-hash.js "SuaSenhaSegura"');
  process.exit(1);
}

const SALT_BYTES = 16;
const KEY_LEN = 32;
const ITERATIONS = 310000; // OWASP 2023 recomendado para PBKDF2-SHA256

const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
const hash = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), ITERATIONS, KEY_LEN, 'sha256').toString('hex');

console.log('\n# Cole estas linhas no .env.local (acesso ao painel):');
console.log(`VITE_APP_PASSWORD_SALT=${salt}`);
console.log(`VITE_APP_PASSWORD_HASH=${hash}`);
console.log(`VITE_APP_PBKDF2_ITERATIONS=${ITERATIONS}`);
console.log('');
