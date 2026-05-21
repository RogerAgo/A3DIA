import bcrypt from 'bcryptjs';
import { requireAdmin } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';
import { sendWelcomeEmail } from '../_lib/mail.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const admin = requireAdmin(req, res);
  if (!admin) return;

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  const { members, sendEmails = true } = req.body ?? {};

  if (!Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ success: false, error: 'Liste de membres vide ou invalide.' });
  }
  if (members.length > 200) {
    return res.status(400).json({ success: false, error: 'Maximum 200 membres par import.' });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;

  const results = { created: [], skipped: [], errors: [] };

  for (const m of members) {
    const email = m.email?.toLowerCase().trim();
    const prenom = m.prenom?.trim();
    const nom = m.nom?.trim();

    if (!email || !prenom || !nom) {
      results.errors.push({ email: email || '?', reason: 'email, prenom et nom requis' });
      continue;
    }

    // Skip if already exists
    const existingId = await kv.get(`idx:email:${email}`);
    if (existingId) {
      results.skipped.push({ email, reason: 'compte existant' });
      continue;
    }

    try {
      const tempPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const now = new Date().toISOString();

      const user = {
        id,
        email,
        passwordHash,
        civilite: m.civilite?.trim() || '',
        prenom,
        nom,
        societe: m.societe?.trim() || '',
        tel: m.tel?.trim() || '',
        role: 'membre',
        actif: true,
        importedAt: now,
        createdAt: now,
        lastLogin: null
      };

      await kv.set(`user:${id}`, user);
      await kv.set(`idx:email:${email}`, id);
      await kv.sadd('users', id);

      if (sendEmails) {
        try {
          await sendWelcomeEmail({ to: email, prenom, nom, email, tempPassword, baseUrl });
          results.created.push({ email, prenom, nom, status: 'créé + email envoyé' });
        } catch (mailErr) {
          results.created.push({ email, prenom, nom, status: 'créé (échec email)', tempPassword });
        }
      } else {
        results.created.push({ email, prenom, nom, status: 'créé', tempPassword });
      }

    } catch (err) {
      results.errors.push({ email, reason: err.message });
    }
  }

  return res.status(200).json({
    success: true,
    summary: {
      total: members.length,
      created: results.created.length,
      skipped: results.skipped.length,
      errors: results.errors.length
    },
    results
  });
}
