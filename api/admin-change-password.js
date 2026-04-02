const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length > 0) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON não configurado');
  const serviceAccount = JSON.parse(raw);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    initAdmin();
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Token ausente' });

    const decoded = await admin.auth().verifyIdToken(token);
    const callerUid = decoded.uid;
    const callerSnap = await admin.firestore().collection('users').doc(callerUid).get();
    const caller = callerSnap.exists ? callerSnap.data() : null;
    if (!caller || caller.role !== 'administrador') {
      return res.status(403).json({ error: 'Somente administrador pode alterar senha de usuários' });
    }

    const { uid, newPassword } = req.body || {};
    if (!uid || !newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Parâmetros inválidos (uid e senha >= 6)' });
    }

    await admin.auth().updateUser(String(uid), { password: String(newPassword) });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('admin-change-password error:', err);
    return res.status(500).json({ error: 'Erro interno ao processar a solicitação.' });
  }
};
