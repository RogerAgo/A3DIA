import { Redis } from '@upstash/redis';
const kv = Redis.fromEnv();
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const payload = requireAuth(req, res);
  if (!payload) return;

  const user = await kv.get(`user:${payload.sub}`);
  if (!user || !user.actif) {
    return res.status(401).json({ success: false, error: 'Compte introuvable ou inactif' });
  }

  return res.status(200).json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      prenom: user.prenom,
      nom: user.nom,
      role: user.role
    }
  });
}
