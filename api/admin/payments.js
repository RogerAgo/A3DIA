import { requireAdmin } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';

export default async function handler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  if (req.method === 'GET') return getPayments(kv, res);
  if (req.method === 'POST') return createPayment(kv, req, res);
  if (req.method === 'PUT') return updatePayment(kv, req, res);
  if (req.method === 'DELETE') return deletePayment(kv, req, res);
  return res.status(405).end();
}

async function getPayments(kv, res) {
  const ids = (await kv.smembers('payments')) ?? [];
  const payments = await Promise.all(ids.map(id => kv.get(`payment:${id}`)));

  const memberIds = [...new Set(payments.filter(Boolean).map(p => p.memberId).filter(Boolean))];
  const members = await Promise.all(memberIds.map(id => kv.get(`user:${id}`)));
  const memberMap = Object.fromEntries(members.filter(Boolean).map(m => [m.id, m]));

  const list = payments
    .filter(Boolean)
    .map(p => ({
      ...p,
      memberName: memberMap[p.memberId] ? `${memberMap[p.memberId].prenom} ${memberMap[p.memberId].nom}` : '—',
      memberEmail: memberMap[p.memberId]?.email || '—',
      memberActif: memberMap[p.memberId]?.actif ?? null
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.status(200).json({ success: true, payments: list });
}

async function createPayment(kv, req, res) {
  const { memberId, montant, type, description, annee, reference } = req.body ?? {};
  if (!memberId || !montant || !type) {
    return res.status(400).json({ success: false, error: 'memberId, montant et type sont requis' });
  }

  const id = `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  const yr = annee || new Date().getFullYear();
  const payment = {
    id, memberId,
    requestId: null,
    montant: Number(montant),
    type,
    status: 'en_attente',
    description: description || `Cotisation annuelle A3DIA ${yr}`,
    annee: yr,
    reference: reference || `A3DIA-${yr}-${id.slice(-6).toUpperCase()}`,
    stripeSessionId: null,
    stripePaymentId: null,
    createdAt: now, updatedAt: now, confirmedAt: null
  };

  await kv.set(`payment:${id}`, payment);
  await kv.sadd('payments', id);
  return res.status(201).json({ success: true, payment });
}

async function updatePayment(kv, req, res) {
  const { id, status, reference } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const payment = await kv.get(`payment:${id}`);
  if (!payment) return res.status(404).json({ success: false, error: 'Paiement introuvable' });

  const now = new Date().toISOString();
  const updates = { updatedAt: now };

  if (reference !== undefined) updates.reference = reference;

  if (status !== undefined && status !== payment.status) {
    updates.status = status;

    if (status === 'confirme') {
      updates.confirmedAt = now;

      if (payment.memberId) {
        const user = await kv.get(`user:${payment.memberId}`);
        if (user) {
          await kv.set(`user:${payment.memberId}`, { ...user, actif: true, updatedAt: now });
        }
      }

      if (payment.requestId) {
        const request = await kv.get(`request:${payment.requestId}`);
        if (request) {
          await kv.set(`request:${payment.requestId}`, { ...request, status: 'payee', updatedAt: now });
        }
      }
    }
  }

  const updated = { ...payment, ...updates };
  await kv.set(`payment:${id}`, updated);
  return res.status(200).json({ success: true, payment: updated });
}

async function deletePayment(kv, req, res) {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const payment = await kv.get(`payment:${id}`);
  if (!payment) return res.status(404).json({ success: false, error: 'Paiement introuvable' });

  await Promise.all([kv.del(`payment:${id}`), kv.srem('payments', id)]);
  return res.status(200).json({ success: true });
}
