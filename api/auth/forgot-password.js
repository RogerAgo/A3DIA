import { getDB } from '../_lib/db.js';
import { sendPasswordReset } from '../_lib/mail.js';

// POST /api/auth/forgot-password  { email }
// Envoie un lien de réinitialisation (réutilise le flux pwset: + /nouveau-mot-de-passe).
// Réponse identique que le compte existe ou non (pas d'énumération d'emails).

const ipHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const last = ipHits.get(ip);
  if (last && now - last < 15_000) return true;
  ipHits.set(ip, now);
  if (ipHits.size > 1000) {
    for (const [k, t] of ipHits) { if (now - t > 120_000) ipHits.delete(k); }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const email = String(req.body?.email ?? '').toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Adresse email invalide.' });
  }

  const ip = (req.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) {
    return res.status(429).json({ success: false, error: 'Veuillez patienter avant de réessayer.' });
  }

  const generic = {
    success: true,
    message: 'Si un compte existe avec cette adresse, un email de réinitialisation vient de lui être envoyé.'
  };

  let kv;
  try { kv = getDB(); } catch {
    return res.status(500).json({ success: false, error: 'Service indisponible.' });
  }

  const userId = await kv.get(`idx:email:${email}`);
  if (!userId) return res.status(200).json(generic);

  // Cooldown 5 min par compte (évite le spam d'une boîte adhérent)
  if (await kv.get(`pwreset_cd:${userId}`)) return res.status(200).json(generic);

  const user = await kv.get(`user:${userId}`);
  if (!user) return res.status(200).json(generic);

  const token = `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
  await kv.set(`pwset:${token}`, userId, { ex: 2 * 3600 }); // 2 h
  await kv.set(`pwreset_cd:${userId}`, 1, { ex: 300 });

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const setUrl = `${proto}://${host}/nouveau-mot-de-passe?token=${token}`;

  try {
    await sendPasswordReset({ to: email, prenom: user.prenom, nom: user.nom, setUrl, baseUrl: `${proto}://${host}` });
  } catch {
    await kv.del(`pwset:${token}`);
    return res.status(503).json({ success: false, error: 'Envoi impossible pour le moment. Réessayez plus tard.' });
  }

  return res.status(200).json(generic);
}
