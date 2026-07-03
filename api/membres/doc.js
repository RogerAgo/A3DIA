import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { requireAuth } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';

// ── Liste blanche des documents réservés aux adhérents ──────────────
// Clé = identifiant public (?id=…) · valeur = nom de fichier dans api/_docs/.
// Sert de garde anti-« path traversal » : seul un id connu est servable.
const DOCS = {
  'convocation-ago-2026':      'convocation-ago-3-juin-2026.pdf',
  'rapport-financier-2026':    'rapport-financier-ago-2026.pdf',
  'rapport-suivi-2026':        'rapport-suivi-societes-ago-2026.pdf',
  'tableau-liquidation-2024':  'tableau-societes-liquidation-31-12-2024.pdf',
  'cerfa-2074-2024':           'cerfa-2074-declaration-2024.pdf',
  'cerfa-2074-notice-2024':    'cerfa-2074-notice-2024.pdf',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const id = String(req.query.id || '');
  const filename = DOCS[id];
  if (!filename) {
    return res.status(404).json({ success: false, error: 'Document introuvable.' });
  }

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  const auth = requireAuth(req, res);
  if (!auth) return;

  // ── Document exclusif : réservé aux adhérents à jour de cotisation ──
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
        error: `L'accès aux documents est réservé aux adhérents à jour de leur cotisation ${annee}.`,
      });
    }
  }

  let buffer;
  try {
    const path = fileURLToPath(new URL(`../_docs/${filename}`, import.meta.url));
    buffer = await readFile(path);
  } catch {
    return res.status(404).json({ success: false, error: 'Fichier indisponible.' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(buffer);
}
