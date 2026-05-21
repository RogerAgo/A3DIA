import { Redis } from '@upstash/redis';
const kv = Redis.fromEnv();
import bcrypt from 'bcryptjs';
import { requireAdmin } from '../_lib/auth.js';

export default async function handler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'GET') return getMembers(res);
  if (req.method === 'POST') return createMember(req, res);
  if (req.method === 'PUT') return updateMember(req, res);
  if (req.method === 'DELETE') return deleteMember(req, res);
  return res.status(405).end();
}

async function getMembers(res) {
  const ids = (await kv.smembers('users')) ?? [];
  const users = await Promise.all(ids.map(id => kv.get(`user:${id}`)));
  const list = users
    .filter(Boolean)
    .map(u => omit(u, ['passwordHash']))
    .sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? '', 'fr'));
  return res.status(200).json({ success: true, members: list });
}

async function createMember(req, res) {
  const { email, password, prenom, nom, civilite = '', tel = '', societe = '', role = 'membre', actif = true } = req.body ?? {};

  if (!email || !password || !prenom || !nom) {
    return res.status(400).json({ success: false, error: 'email, password, prenom et nom sont requis' });
  }
  if (!['membre', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Rôle invalide (membre | admin)' });
  }

  const emailKey = `idx:email:${email.toLowerCase().trim()}`;
  if (await kv.get(emailKey)) {
    return res.status(409).json({ success: false, error: 'Cet email est déjà utilisé' });
  }

  const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id,
    email: email.toLowerCase().trim(),
    passwordHash,
    civilite, prenom, nom, societe, tel,
    role,
    actif: Boolean(actif),
    createdAt: new Date().toISOString(),
    lastLogin: null
  };

  await kv.set(`user:${id}`, user);
  await kv.set(emailKey, id);
  await kv.sadd('users', id);

  return res.status(201).json({ success: true, member: omit(user, ['passwordHash']) });
}

async function updateMember(req, res) {
  const { id, prenom, nom, civilite, tel, societe, role, actif, password } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const user = await kv.get(`user:${id}`);
  if (!user) return res.status(404).json({ success: false, error: 'Membre introuvable' });

  const updates = {};
  if (prenom !== undefined) updates.prenom = prenom;
  if (nom !== undefined) updates.nom = nom;
  if (civilite !== undefined) updates.civilite = civilite;
  if (tel !== undefined) updates.tel = tel;
  if (societe !== undefined) updates.societe = societe;
  if (role !== undefined && ['membre', 'admin'].includes(role)) updates.role = role;
  if (actif !== undefined) updates.actif = Boolean(actif);
  if (password) updates.passwordHash = await bcrypt.hash(password, 10);

  const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
  await kv.set(`user:${id}`, updated);

  return res.status(200).json({ success: true, member: omit(updated, ['passwordHash']) });
}

async function deleteMember(req, res) {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const user = await kv.get(`user:${id}`);
  if (!user) return res.status(404).json({ success: false, error: 'Membre introuvable' });

  await Promise.all([
    kv.del(`user:${id}`),
    kv.del(`idx:email:${user.email}`),
    kv.srem('users', id)
  ]);

  return res.status(200).json({ success: true });
}

function omit(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
}
