import { Redis } from '@upstash/redis';
const kv = Redis.fromEnv();
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { makeAuthCookie } from '../_lib/auth.js';

const RATE_LIMIT = 5;
const RATE_WINDOW = 15 * 60; // secondes

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email = '', password = '' } = req.body ?? {};
  const ip = (req.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim();

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email et mot de passe requis' });
  }

  // Rate limiting par IP
  const ratKey = `ratelimit:login:${ip}`;
  const attempts = await kv.incr(ratKey);
  if (attempts === 1) await kv.expire(ratKey, RATE_WINDOW);
  if (attempts > RATE_LIMIT) {
    return res.status(429).json({
      success: false,
      error: 'Trop de tentatives. Réessayez dans 15 minutes.'
    });
  }

  const userId = await kv.get(`idx:email:${email.toLowerCase().trim()}`);
  const user = userId ? await kv.get(`user:${userId}`) : null;

  // Réponse identique si email inconnu ou mauvais mdp (timing-safe)
  if (!user || !user.actif) {
    await bcrypt.hash('dummy', 10); // empêche timing attack
    return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
  }

  await kv.del(ratKey);

  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  await kv.set(`user:${user.id}`, { ...user, lastLogin: new Date().toISOString() });

  res.setHeader('Set-Cookie', makeAuthCookie(token));
  return res.status(200).json({
    success: true,
    user: { id: user.id, email: user.email, prenom: user.prenom, nom: user.nom, role: user.role }
  });
}
