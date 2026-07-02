import { requireAdmin } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';
import { sendWelcomeSetPassword } from '../_lib/mail.js';

// POST /api/admin/send-welcome
// Body: { emails: ["a@b.com", ...] }  (max 40 par lot pour rester sous le timeout)
// Génère un lien "créer mon mot de passe" (14 j) et envoie l'email de bienvenue.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const admin = requireAdmin(req, res);
  if (!admin) return;

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  const { emails } = req.body ?? {};
  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ success: false, error: 'Liste d\'emails requise.' });
  }
  if (emails.length > 40) {
    return res.status(400).json({ success: false, error: 'Maximum 40 emails par envoi.' });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;

  const results = [];
  for (const raw of emails) {
    const email = String(raw ?? '').toLowerCase().trim();
    if (!email) { results.push({ email: raw, status: 'invalide' }); continue; }

    const userId = await kv.get(`idx:email:${email}`);
    if (!userId) { results.push({ email, status: 'introuvable' }); continue; }
    const user = await kv.get(`user:${userId}`);
    if (!user) { results.push({ email, status: 'introuvable' }); continue; }

    const token = `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
    await kv.set(`pwset:${token}`, userId, { ex: 14 * 24 * 3600 });
    const setUrl = `${baseUrl}/nouveau-mot-de-passe?token=${token}`;

    try {
      await sendWelcomeSetPassword({ to: email, prenom: user.prenom, nom: user.nom, setUrl, baseUrl });
      results.push({ email, status: 'envoyé' });
    } catch (e) {
      await kv.del(`pwset:${token}`);
      results.push({ email, status: 'échec', error: e.message });
    }
  }

  const sent = results.filter(r => r.status === 'envoyé').length;
  return res.status(200).json({ success: true, sent, total: emails.length, results });
}
