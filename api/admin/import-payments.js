import { requireAdmin } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const admin = requireAdmin(req, res);
  if (!admin) return;

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  const { payments } = req.body ?? {};
  if (!Array.isArray(payments) || !payments.length)
    return res.status(400).json({ success: false, error: 'Liste vide.' });
  if (payments.length > 300)
    return res.status(400).json({ success: false, error: 'Max 300 par lot.' });

  let created = 0, errors = 0;
  const now = new Date().toISOString();

  for (const p of payments) {
    try {
      const id = `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const payment = {
        id,
        memberId: p.memberId || null,
        memberName: p.memberName || '',
        requestId: null,
        montant: Number(p.montant) || 0,
        type: p.type || 'autre',
        status: p.status || 'confirme',
        description: p.description || '',
        annee: Number(p.annee) || new Date().getFullYear(),
        reference: p.reference || '',
        commentaire: p.commentaire || '',
        source: p.source || 'historique',
        stripeSessionId: null,
        stripePaymentId: null,
        confirmedAt: p.confirmedAt || (p.status === 'confirme' ? now : null),
        createdAt: now,
        updatedAt: now
      };
      await kv.set(`payment:${id}`, payment);
      await kv.sadd('payments', id);
      created++;
    } catch { errors++; }
  }

  return res.status(200).json({ success: true, summary: { created, errors } });
}
