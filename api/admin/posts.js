import { kv } from '@vercel/kv';
import { requireAdmin } from '../_lib/auth.js';

const TYPES = ['Communiqué', 'Document AG', 'OPA / OVR', 'Dividende', 'Info'];

export default async function handler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'GET') return getPosts(res);
  if (req.method === 'POST') return createPost(req, res);
  if (req.method === 'PUT') return updatePost(req, res);
  if (req.method === 'DELETE') return deletePost(req, res);
  return res.status(405).end();
}

async function getPosts(res) {
  const ids = (await kv.smembers('posts')) ?? [];
  const posts = await Promise.all(ids.map(id => kv.get(`post:${id}`)));
  const list = posts
    .filter(Boolean)
    .sort((a, b) => new Date(b.datePublication) - new Date(a.datePublication));
  return res.status(200).json({ success: true, posts: list });
}

async function createPost(req, res) {
  const { titre, contenu, societe = '', type = 'Communiqué', datePublication } = req.body ?? {};

  if (!titre || !contenu) {
    return res.status(400).json({ success: false, error: 'titre et contenu sont requis' });
  }

  const id = `post_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  const post = {
    id, titre, contenu, societe,
    type: TYPES.includes(type) ? type : 'Communiqué',
    datePublication: datePublication || now.split('T')[0],
    createdAt: now,
    updatedAt: now
  };

  await kv.set(`post:${id}`, post);
  await kv.sadd('posts', id);

  return res.status(201).json({ success: true, post });
}

async function updatePost(req, res) {
  const { id, titre, contenu, societe, type, datePublication } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const post = await kv.get(`post:${id}`);
  if (!post) return res.status(404).json({ success: false, error: 'Communiqué introuvable' });

  const updates = { updatedAt: new Date().toISOString() };
  if (titre !== undefined) updates.titre = titre;
  if (contenu !== undefined) updates.contenu = contenu;
  if (societe !== undefined) updates.societe = societe;
  if (type !== undefined && TYPES.includes(type)) updates.type = type;
  if (datePublication !== undefined) updates.datePublication = datePublication;

  const updated = { ...post, ...updates };
  await kv.set(`post:${id}`, updated);

  return res.status(200).json({ success: true, post: updated });
}

async function deletePost(req, res) {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const post = await kv.get(`post:${id}`);
  if (!post) return res.status(404).json({ success: false, error: 'Communiqué introuvable' });

  await Promise.all([kv.del(`post:${id}`), kv.srem('posts', id)]);

  return res.status(200).json({ success: true });
}
