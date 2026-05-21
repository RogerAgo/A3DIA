import { getDB } from '../_lib/db.js';

const MONTANT_COTISATION = 5000; // 50 € en centimes

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  const { civilite, prenom, nom, email, tel, societe, adresse, cp, ville } = req.body ?? {};

  if (!prenom?.trim() || !nom?.trim() || !email?.trim()) {
    return res.status(400).json({ success: false, error: 'Prénom, nom et email sont requis.' });
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
    civilite: civilite || '',
    prenom: prenom.trim(),
    nom: nom.trim(),
    email: emailNorm,
    tel: tel?.trim() || '',
    societe: societe?.trim() || '',
    adresse: adresse?.trim() || '',
    cp: cp?.trim() || '',
    ville: ville?.trim() || '',
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
