import Stripe from 'stripe';
import { requireAuth } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';

const MONTANT = 5000; // 50 € en centimes

export default async function handler(req, res) {
  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  const auth = requireAuth(req, res);
  if (!auth) return;

  const user = await kv.get(`user:${auth.sub}`);
  if (!user) return res.status(404).json({ success: false, error: 'Compte introuvable' });

  const annee = new Date().getFullYear();

  // ── Statut de la cotisation de l'année ──
  if (req.method === 'GET') {
    const payId = await kv.get(`cotisation:${user.id}:${annee}`);
    let aJour = false;
    if (payId) {
      const p = await kv.get(`payment:${payId}`);
      aJour = p?.status === 'confirme';
    }
    return res.status(200).json({ success: true, annee, aJour, montant: MONTANT });
  }

  // ── Génération d'un paiement carte Stripe ──
  if (req.method === 'POST') {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return res.status(503).json({ success: false, error: 'Le paiement en ligne n\'est pas encore activé.' });
    }

    // Déjà à jour ? on ne fait pas payer deux fois
    const confirmedId = await kv.get(`cotisation:${user.id}:${annee}`);
    if (confirmedId) {
      const p = await kv.get(`payment:${confirmedId}`);
      if (p?.status === 'confirme') {
        return res.status(200).json({ success: true, already: true });
      }
    }

    const now = new Date().toISOString();

    // Réutilise un paiement en attente existant (évite les doublons si l'adhérent reclique)
    let payId = await kv.get(`cotisation_pending:${user.id}:${annee}`);
    let payment = payId ? await kv.get(`payment:${payId}`) : null;

    if (!payment || payment.status === 'confirme') {
      payId = `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      payment = {
        id: payId, memberId: user.id, requestId: null,
        montant: MONTANT, type: 'stripe', status: 'en_attente',
        description: `Cotisation annuelle A3DIA ${annee}`, annee,
        reference: `A3DIA-${annee}-${user.id.slice(-6).toUpperCase()}`,
        stripeSessionId: null, stripePaymentId: null,
        createdAt: now, updatedAt: now, confirmedAt: null
      };
      await kv.set(`payment:${payId}`, payment);
      await kv.sadd('payments', payId);
      await kv.set(`cotisation_pending:${user.id}:${annee}`, payId);
    }

    const stripe = new Stripe(stripeKey);
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${proto}://${host}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: user.email,
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: MONTANT,
          product_data: {
            name: `Cotisation A3DIA ${annee}`,
            description: `${user.prenom} ${user.nom}`
          }
        },
        quantity: 1
      }],
      metadata: { paymentId: payId, memberId: user.id, annee: String(annee) },
      success_url: `${baseUrl}/espace-membres?cotisation=success`,
      cancel_url: `${baseUrl}/espace-membres?cotisation=cancel`
    });

    await kv.set(`payment:${payId}`, { ...payment, stripeSessionId: session.id, updatedAt: now });
    return res.status(200).json({ success: true, url: session.url });
  }

  return res.status(405).end();
}
