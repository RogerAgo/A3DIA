/**
 * Endpoint d'initialisation one-shot.
 * Crée le premier compte administrateur à partir des variables d'env.
 * Se désactive automatiquement si un admin existe déjà.
 *
 * Usage (une seule fois après déploiement) :
 *   POST /api/admin/setup  {}
 */
import { kv } from '@vercel/kv';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    return res.status(500).json({
      success: false,
      error: 'ADMIN_EMAIL et ADMIN_PASSWORD doivent être définis dans les variables d\'environnement'
    });
  }

  // Vérifier qu'aucun admin n'existe déjà
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
    civilite: '',
    prenom: 'Administrateur',
    nom: 'A3DIA',
    societe: '',
    tel: '',
    role: 'admin',
    actif: true,
    createdAt: new Date().toISOString(),
    lastLogin: null
  };

  await kv.set(`user:${id}`, user);
  await kv.set(`idx:email:${email.toLowerCase()}`, id);
  await kv.sadd('users', id);

  return res.status(201).json({
    success: true,
    message: `Compte admin créé pour ${email}. Vous pouvez maintenant vous connecter sur /login.`
  });
}
