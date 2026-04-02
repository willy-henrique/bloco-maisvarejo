// scripts/create-dev-user.cjs
// Cria (ou atualiza) o usuário de desenvolvimento no Firebase Auth
// e garante o documento em users/{uid} no Firestore.
//
// Antes de rodar:
// 1) Baixe o JSON da service account no Firebase Console.
// 2) Defina GOOGLE_APPLICATION_CREDENTIALS com o caminho do JSON.
// 3) Execute: npm run create-dev

const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'Defina a variável GOOGLE_APPLICATION_CREDENTIALS apontando para o JSON da service account.'
  );
  process.exit(1);
}

admin.initializeApp();

const auth = admin.auth();
const db = admin.firestore();

async function upsertAuthUser(email, password, displayName) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password, displayName });
    console.log('Usuário dev já existia; senha e nome atualizados:', existing.uid);
    return existing.uid;
  } catch {
    const created = await auth.createUser({ email, password, displayName });
    console.log('Usuário dev criado no Auth:', created.uid);
    return created.uid;
  }
}

async function main() {
  const email = process.env.DEV_EMAIL || 'willydev01@gmail.com';
  const password = process.env.DEV_PASSWORD;
  if (!password) {
    console.error('Defina DEV_PASSWORD. Ex.: $env:DEV_PASSWORD="SuaSenha123"');
    process.exit(1);
  }
  const nome = 'Willy Dev';

  const uid = await upsertAuthUser(email, password, nome);
  const now = Date.now();

  await db.collection('users').doc(uid).set(
    {
      uid,
      email,
      nome,
      role: 'administrador',
      views: ['backlog', 'dashboard', 'table', 'performance', 'roadmap', 'ia'],
      empresas: ['*'],
      ativo: true,
      criadoEm: now,
      criadoPor: uid,
    },
    { merge: true }
  );

  console.log(`Perfil dev criado/atualizado em users/${uid}`);
}

main()
  .then(() => {
    console.log('DONE');
    process.exit(0);
  })
  .catch((err) => {
    console.error('ERRO AO CRIAR USUÁRIO DEV:', err);
    process.exit(1);
  });
