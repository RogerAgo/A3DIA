import bcrypt from 'bcryptjs';
import { requireAdmin } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';

export default async function handler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  if (req.method === 'GET') return getRequests(kv, res);
  if (req.method === 'PUT') return updateRequest(kv, req, res, admin);
  if (req.method === 'DELETE') return deleteRequest(kv, req, res);
  return res.status(405).end();
}

async function getRequests(kv, res) {
  const ids = (await kv.smembers('requests')) ?? [];
  const reqs = await Promise.all(ids.map(id => kv.get(`request:${id}`)));
  const list = reqs
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.status(200).json({ success: true, requests: list });
}

async function updateRequest(kv, req, res, admin) {
  const { id, action, paymentMethod, notes, status } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const request = await kv.get(`request:${id}`);
  if (!request) return res.status(404).json({ success: false, error: 'Demande introuvable' });

  const now = new Date().toISOString();
  const updates = { updatedAt: now };

  if (notes !== undefined) updates.notes = notes;

  if (action === 'approuver') {
    if (['rejetee', 'payee'].includes(request.status)) {
      return res.status(400).json({ success: false, error: 'Cette demande ne peut plus être approuvée.' });
    }

    const method = paymentMethod || 'virement';
    updates.status = 'approuvee';
    updates.paymentMethod = method;
    updates.approvedAt = now;
    updates.approvedBy = admin.sub;

    if (!request.memberId) {
      const tempPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const memberId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

      const user = {
        id: memberId,
        email: request.email,
        passwordHash,
        civilite: request.civilite,
        prenom: request.prenom,
        nom: request.nom,
        societe: request.societe || '',
        tel: request.tel || '',
        role: 'membre',
        actif: false,
        createdAt: now,
        lastLogin: null
      };

      await kv.set(`user:${memberId}`, user);
      await kv.set(`idx:email:${request.email}`, memberId);
      await kv.sadd('users', memberId);

      updates.memberId = memberId;
      updates.tempPassword = tempPassword;

      const payId = `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const annee = new Date().getFullYear();
      const payment = {
        id: payId,
        memberId,
        requestId: id,
        montant: request.montant || 5000,
        type: method,
        status: 'en_attente',
        description: `Cotisation annuelle A3DIA ${annee}`,
        annee,
        reference: `A3DIA-${annee}-${memberId.slice(-6).toUpperCase()}`,
        stripeSessionId: null,
        stripePaymentId: null,
        createdAt: now,
        updatedAt: now,
        confirmedAt: null
      };

      await kv.set(`payment:${payId}`, payment);
      await kv.sadd('payments', payId);
      updates.paymentId = payId;
    }

  } else if (action === 'rejeter') {
    updates.status = 'rejetee';
    updates.rejectedAt = now;
    updates.rejectedBy = admin.sub;

  } else if (status !== undefined) {
    updates.status = status;
  }

  const updated = { ...request, ...updates };
  await kv.set(`request:${id}`, updated);
  return res.status(200).json({ success: true, request: updated });
}

async function deleteRequest(kv, req, res) {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const request = await kv.get(`request:${id}`);
  if (!request) return res.status(404).json({ success: false, error: 'Demande introuvable' });

  await Promise.all([kv.del(`request:${id}`), kv.srem('requests', id)]);
  return res.status(200).json({ success: true });
}
