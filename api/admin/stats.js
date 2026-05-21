import { requireAdmin } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const admin = requireAdmin(req, res);
  if (!admin) return;

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  const [userIds, requestIds, paymentIds, postIds] = await Promise.all([
    kv.smembers('users'),
    kv.smembers('requests'),
    kv.smembers('payments'),
    kv.smembers('posts')
  ]);

  const [users, requests, payments] = await Promise.all([
    Promise.all((userIds ?? []).map(id => kv.get(`user:${id}`))),
    Promise.all((requestIds ?? []).map(id => kv.get(`request:${id}`))),
    Promise.all((paymentIds ?? []).map(id => kv.get(`payment:${id}`)))
  ]);

  const validUsers = users.filter(Boolean);
  const validRequests = requests.filter(Boolean);
  const validPayments = payments.filter(Boolean);

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();

  const confirmedPayments = validPayments.filter(p => p.status === 'confirme');
  const pendingPayments = validPayments.filter(p => p.status === 'en_attente');

  const revenueTotal = confirmedPayments.reduce((s, p) => s + (p.montant || 0), 0);
  const pendingRevenue = pendingPayments.reduce((s, p) => s + (p.montant || 0), 0);

  const revenueThisYear = confirmedPayments
    .filter(p => p.confirmedAt && new Date(p.confirmedAt).getFullYear() === thisYear)
    .reduce((s, p) => s + (p.montant || 0), 0);

  const revenueThisMonth = confirmedPayments
    .filter(p => {
      if (!p.confirmedAt) return false;
      const d = new Date(p.confirmedAt);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    })
    .reduce((s, p) => s + (p.montant || 0), 0);

  // Activité récente (dernières demandes + paiements)
  const recentRequests = validRequests
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  const recentPayments = validPayments
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  return res.status(200).json({
    success: true,
    stats: {
      membres: {
        total: validUsers.length,
        actifs: validUsers.filter(u => u.actif).length,
        inactifs: validUsers.filter(u => !u.actif).length
      },
      demandes: {
        total: validRequests.length,
        en_attente: validRequests.filter(r => r.status === 'en_attente').length,
        approuvees: validRequests.filter(r => r.status === 'approuvee').length,
        payees: validRequests.filter(r => r.status === 'payee').length,
        rejetees: validRequests.filter(r => r.status === 'rejetee').length
      },
      paiements: {
        total: validPayments.length,
        confirmes: confirmedPayments.length,
        en_attente: pendingPayments.length,
        revenueTotal,
        revenueThisYear,
        revenueThisMonth,
        pendingRevenue
      },
      communiques: (postIds ?? []).length
    },
    recentRequests,
    recentPayments
  });
}
