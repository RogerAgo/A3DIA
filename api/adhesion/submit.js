import { getDB } from '../_lib/db.js';

const MONTANT_COTISATION = 5000; // 50 € en centimes

// Rate-limit IP en mémoire (par instance) : 1 demande / 30 s
const ipHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const last = ipHits.get(ip);
  if (last && now - last < 30_000) return true;
  ipHits.set(ip, now);
  if (ipHits.size > 1000) {
    for (const [k, t] of ipHits) { if (now - t > 60_000) ipHits.delete(k); }
  }
  return false;
}
const cap = (s, n = 200) => String(s ?? '').trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Honeypot : un bot remplit ce champ caché → on simule un succès sans rien créer
  if (String(req.body?.hp_check ?? '').trim()) {
    return res.status(201).json({ success: true, id: 'ok', email: '' });
  }

  const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0].trim()) || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ success: false, error: 'Veuillez patienter avant de renvoyer une demande.' });
  }

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  const { civilite, prenom, nom, email, tel, societe, adresse, cp, ville } = req.body ?? {};

  if (!prenom?.trim() || !nom?.trim() || !email?.trim()) {
    return res.status(400).json({ success: false, error: 'Prénom, nom et email sont requis.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) {
    return res.status(400).json({ success: false, error: 'Adresse email invalide.' });
  }

  const emailNorm = email.toLowerCase().trim();

  const existingMemberId = await kv.get(`idx:email:${emailNorm}`);
  if (existingMemberId) {
    return res.status(409).json({ success: false, error: 'Un compte avec cet email existe déjà.' });
  }

  const reqIds = (await kv.smembers('requests')) ?? [];
  const reqs = await Promise.all(reqIds.map(id => kv.get(`request:${id}`)));
  const duplicate = reqs.find(r => r?.email === emailNorm && r?.status === 'en_attente');
  if (duplicate) {
    return res.status(409).json({ success: false, error: 'Une demande avec cet email est déjà en cours de traitement.' });
  }

  const id = `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  const request = {
    id,
    civilite: cap(civilite, 10),
    prenom: cap(prenom, 80),
    nom: cap(nom, 80),
    email: emailNorm,
    tel: cap(tel, 30),
    societe: cap(societe, 120),
    adresse: cap(adresse, 200),
    cp: cap(cp, 12),
    ville: cap(ville, 80),
    status: 'en_attente',
    paymentMethod: null,
    montant: MONTANT_COTISATION,
    notes: '',
    memberId: null,
    paymentId: null,
    createdAt: now,
    updatedAt: now
  };

  await kv.set(`request:${id}`, request);
  await kv.sadd('requests', id);

  return res.status(201).json({ success: true, id, email: emailNorm });
}
