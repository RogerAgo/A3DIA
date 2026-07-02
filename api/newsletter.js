import { getDB } from './_lib/db.js';

// Inscription newsletter : stocke l'email dans le set KV `newsletter_subscribers`.
const ipHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const last = ipHits.get(ip);
  if (last && now - last < 10_000) return true;
  ipHits.set(ip, now);
  if (ipHits.size > 1000) {
    for (const [k, t] of ipHits) { if (now - t > 60_000) ipHits.delete(k); }
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

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: 'Service indisponible.' });
  }

  await Promise.all([
    kv.sadd('newsletter_subscribers', email),
    kv.set(`newsletter:${email}`, { email, subscribedAt: new Date().toISOString(), ip })
  ]);

  return res.status(200).json({ success: true, message: 'Inscription confirmée.' });
}
