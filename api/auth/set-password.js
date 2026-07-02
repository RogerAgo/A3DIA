import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { makeAuthCookie } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';

// Flux "créer mon mot de passe" via lien à usage unique (pwset:{token} → userId).
export default async function handler(req, res) {
  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  // ── Validation du lien (appelée par la page au chargement) ──
  if (req.method === 'GET') {
    const token = req.query.token;
    if (!token) return res.status(400).json({ success: false, valid: false, error: 'Token manquant' });
    const userId = await kv.get(`pwset:${token}`);
    if (!userId) return res.status(200).json({ success: false, valid: false, error: 'Ce lien a expiré ou est invalide.' });
    const user = await kv.get(`user:${userId}`);
    if (!user) return res.status(200).json({ success: false, valid: false, error: 'Compte introuvable.' });
    return res.status(200).json({ success: true, valid: true, prenom: user.prenom, email: user.email });
  }

  // ── Enregistrement du mot de passe ──
  if (req.method === 'POST') {
    const { token, password } = req.body ?? {};
    if (!token || !password) return res.status(400).json({ success: false, error: 'Token et mot de passe requis.' });
    if (String(password).length < 8) return res.status(400).json({ success: false, error: 'Le mot de passe doit faire au moins 8 caractères.' });

    const userId = await kv.get(`pwset:${token}`);
    if (!userId) return res.status(404).json({ success: false, error: 'Ce lien a expiré ou est invalide.' });
    const user = await kv.get(`user:${userId}`);
    if (!user) return res.status(404).json({ success: false, error: 'Compte introuvable.' });

    const now = new Date().toISOString();
    await kv.set(`user:${userId}`, {
      ...user,
      passwordHash: await bcrypt.hash(password, 10),
      actif: true,
      updatedAt: now
    });
    await kv.del(`pwset:${token}`); // lien à usage unique

    // Connexion automatique
    const authToken = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.setHeader('Set-Cookie', makeAuthCookie(authToken));
    return res.status(200).json({ success: true });
  }

  return res.status(405).end();
}
