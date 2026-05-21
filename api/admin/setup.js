import bcrypt from 'bcryptjs';
import { getDB } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const kv = getDB();

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      return res.status(500).json({
        success: false,
        error: 'ADMIN_EMAIL et/ou ADMIN_PASSWORD manquants dans les variables d\'environnement.'
      });
    }

    const existingId = await kv.get(`idx:email:${email.toLowerCase()}`);
    if (existingId) {
      return res.status(409).json({
        success: false,
        error: 'Un compte avec cet email existe déjà. Setup déjà effectué.'
      });
    }

    const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id,
      email: email.toLowerCase().trim(),
      passwordHash,
      civilite: '', prenom: 'Administrateur', nom: 'A3DIA',
      societe: '', tel: '',
      role: 'admin', actif: true,
      createdAt: new Date().toISOString(),
      lastLogin: null
    };

    await kv.set(`user:${id}`, user);
    await kv.set(`idx:email:${email.toLowerCase()}`, id);
    await kv.sadd('users', id);

    return res.status(201).json({
      success: true,
      message: `Compte admin créé pour ${email}. Connectez-vous sur /login.`
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Erreur inconnue',
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
  }
}
