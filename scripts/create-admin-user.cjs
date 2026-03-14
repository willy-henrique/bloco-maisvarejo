// scripts/create-admin-user.cjs
// Cria (ou atualiza) o usuário administrador e o documento em users/{uid} no Firestore.
// Use com Node (fora do front-end).
//
// Antes de rodar:
// 1) Baixe o JSON da service account no Firebase Console:
//    Configurações do projeto -> Contas de serviço -> "Gerar nova chave privada".
// 2) No terminal (PowerShell, por exemplo), defina:
//    $env:GOOGLE_APPLICATION_CREDENTIALS="C:\caminho\para\serviceAccountKey.json"
// 3) Execute:
//    npm run create-admin
//

const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'Defina a variável de ambiente GOOGLE_APPLICATION_CREDENTIALS apontando para o JSON da service account.'
  );
  process.exit(1);
}

admin.initializeApp();

const auth = admin.auth();
const db = admin.firestore();

async function main() {
  const email = 'gustavoluis@diretoria.com';
  const password = 'admin2026';

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log('Usuário já existe no Auth:', userRecord.uid);
  } catch {
    console.log('Usuário não existe, criando no Auth...');
    userRecord = await auth.createUser({
      email,
      password,
      displayName: 'Gustavo Luis',
    });
    console.log('Usuário criado no Auth:', userRecord.uid);
  }

  const uid = userRecord.uid;
  const userDocRef = db.collection('users').doc(uid);
  const now = Date.now();

  const userProfile = {
    uid,
    email,
    nome: 'Gustavo Luis',
    role: 'administrador',
    views: ['backlog', 'dashboard', 'table', 'performance', 'roadmap', 'ia'],
    empresas: ['*'],
    ativo: true,
    criadoEm: now,
    criadoPor: uid,
  };

  await userDocRef.set(userProfile, { merge: true });

  console.log('Documento criado/atualizado em users/' + uid);
}

main()
  .then(() => {
    console.log('DONE');
    process.exit(0);
  })
  .catch((err) => {
    console.error('ERRO AO CRIAR ADMIN:', err);
    process.exit(1);
  });

