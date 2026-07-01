import Stripe from 'stripe';
import { getDB } from '../_lib/db.js';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    return res.status(503).json({ error: 'Stripe non configuré.' });
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];
  const stripe = new Stripe(stripeKey);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    return res.status(400).json({ error: `Signature invalide : ${err.message}` });
  }

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { paymentId, requestId, memberId } = session.metadata ?? {};
    const now = new Date().toISOString();

    if (paymentId) {
      const payment = await kv.get(`payment:${paymentId}`);
      if (payment) {
        await kv.set(`payment:${paymentId}`, {
          ...payment,
          status: 'confirme',
          stripePaymentId: session.payment_intent,
          confirmedAt: now,
          updatedAt: now
        });
        // Marque la cotisation de l'année comme réglée pour ce membre
        if (payment.memberId && payment.annee) {
          await kv.set(`cotisation:${payment.memberId}:${payment.annee}`, paymentId);
          await kv.del(`cotisation_pending:${payment.memberId}:${payment.annee}`);
        }
      }
    }

    if (memberId) {
      const user = await kv.get(`user:${memberId}`);
      if (user) {
        await kv.set(`user:${memberId}`, { ...user, actif: true, updatedAt: now });
      }
    }

    if (requestId) {
      const request = await kv.get(`request:${requestId}`);
      if (request) {
        await kv.set(`request:${requestId}`, { ...request, status: 'payee', updatedAt: now });
      }
    }
  }

  return res.status(200).json({ received: true });
}
