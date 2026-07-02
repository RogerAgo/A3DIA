import { requireAuth } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  const auth = requireAuth(req, res);
  if (!auth) return;

  // ── Contenu exclusif : réservé aux adhérents à jour de cotisation ──
  if (auth.role !== 'admin') {
    const annee = new Date().getFullYear();
    const payId = await kv.get(`cotisation:${auth.sub}:${annee}`);
    let aJour = false;
    if (payId) {
      const p = await kv.get(`payment:${payId}`);
      aJour = p?.status === 'confirme';
    }
    if (!aJour) {
      return res.status(403).json({
        success: false,
        code: 'cotisation_requise',
        error: `L'accès aux communiqués est réservé aux adhérents à jour de leur cotisation ${annee}.`
      });
    }
  }

  const ids = (await kv.smembers('posts')) ?? [];
  const posts = await Promise.all(ids.map(id => kv.get(`post:${id}`)));
  const list = posts
    .filter(Boolean)
    .sort((a, b) => new Date(b.datePublication) - new Date(a.datePublication));

  return res.status(200).json({ success: true, posts: list });
}
