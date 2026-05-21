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

  const ids = (await kv.smembers('posts')) ?? [];
  const posts = await Promise.all(ids.map(id => kv.get(`post:${id}`)));
  const list = posts
    .filter(Boolean)
    .sort((a, b) => new Date(b.datePublication) - new Date(a.datePublication));

  return res.status(200).json({ success: true, posts: list });
}
