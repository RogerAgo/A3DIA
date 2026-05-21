import Stripe from 'stripe';
import { requireAdmin } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const admin = requireAdmin(req, res);
  if (!admin) return;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(503).json({ success: false, error: 'Stripe non configuré (STRIPE_SECRET_KEY manquant).' });
  }

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  const { paymentId } = req.body ?? {};
  if (!paymentId) return res.status(400).json({ success: false, error: 'paymentId requis' });

  const payment = await kv.get(`payment:${paymentId}`);
  if (!payment) return res.status(404).json({ success: false, error: 'Paiement introuvable' });

  let customerEmail = '';
  let customerName = '';
  if (payment.memberId) {
    const user = await kv.get(`user:${payment.memberId}`);
    if (user) {
      customerEmail = user.email;
      customerName = `${user.prenom} ${user.nom}`;
    }
  }

  const stripe = new Stripe(stripeKey);
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: customerEmail || undefined,
    line_items: [{
      price_data: {
        currency: 'eur',
        unit_amount: payment.montant,
        product_data: {
          name: payment.description,
          description: customerName ? `Adhérent : ${customerName}` : undefined
        }
      },
      quantity: 1
    }],
    metadata: {
      paymentId,
      requestId: payment.requestId || '',
      memberId: payment.memberId || ''
    },
    success_url: `${baseUrl}/admin?stripe=success`,
    cancel_url: `${baseUrl}/admin?stripe=cancel`
  });

  await kv.set(`payment:${paymentId}`, {
    ...payment,
    stripeSessionId: session.id,
    type: 'stripe',
    updatedAt: new Date().toISOString()
  });

  return res.status(200).json({ success: true, url: session.url, sessionId: session.id });
}
