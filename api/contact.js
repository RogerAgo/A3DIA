// A3DIA — Formulaire de contact (Vercel Serverless Function)
// Remplace envoi-contact.php. Envoie un email via SMTP Hostinger avec nodemailer.

import nodemailer from 'nodemailer';

const SMTP_HOST = 'smtp.hostinger.com';
const SMTP_PORT = 465;
const SMTP_USER = 'contact@a3dia-info.org';
const MAIL_TO = 'contact@a3dia-info.org';
const FROM_NAME = 'Site A3DIA';

const ipHits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const last = ipHits.get(ip);
  if (last && now - last < 30_000) return true;
  ipHits.set(ip, now);
  if (ipHits.size > 1000) {
    for (const [k, t] of ipHits) {
      if (now - t > 60_000) ipHits.delete(k);
    }
  }
  return false;
}

function stripTags(s) {
  return String(s ?? '').replace(/<[^>]*>/g, '').trim();
}

function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  const body = req.body ?? {};
  const honeypot = stripTags(body.hp_check);
  if (honeypot) {
    return res.status(200).json({ success: true, message: 'Message reçu' });
  }

  const nom = stripTags(body.nom);
  const email = stripTags(body.email);
  const telephone = stripTags(body.telephone);
  const entreprise = stripTags(body.entreprise);
  const message = stripTags(body.message);

  if (!nom || !isEmail(email) || !message) {
    return res.status(400).json({
      success: false,
      error: 'Veuillez remplir le nom, un email valide et un message.',
    });
  }

  const ip =
    (req.headers['x-forwarded-for']?.toString().split(',')[0].trim()) ||
    req.socket?.remoteAddress ||
    'unknown';

  if (rateLimited(ip)) {
    return res.status(429).json({
      success: false,
      error: 'Veuillez patienter quelques secondes avant de renvoyer un message.',
    });
  }

  const smtpPass = process.env.SMTP_PASS;
  if (!smtpPass) {
    console.error('[A3DIA] SMTP_PASS manquante dans les variables d\'environnement Vercel');
    return res.status(500).json({ success: false, error: 'Configuration serveur incomplète.' });
  }

  const sep = '-'.repeat(50);
  const corps =
    `Vous avez reçu un nouveau message via le formulaire d'a3dia-info.org\n\n` +
    `${sep}\n` +
    `Nom        : ${nom}\n` +
    `Email      : ${email}\n` +
    `Téléphone  : ${telephone || 'non renseigné'}\n` +
    `Entreprise : ${entreprise || 'non renseignée'}\n` +
    `${sep}\n\n` +
    `Message :\n\n${message}\n\n` +
    `${sep}\n` +
    `Pour répondre, cliquez simplement « Répondre ». Votre réponse arrivera directement à ${email}.\n\n` +
    `IP : ${ip}\n` +
    `Date : ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}\n`;

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user: SMTP_USER, pass: smtpPass },
  });

  try {
    await transporter.sendMail({
      from: { name: FROM_NAME, address: SMTP_USER },
      to: MAIL_TO,
      replyTo: { name: nom, address: email },
      subject: 'Nouveau contact — A3DIA',
      text: corps,
    });
    return res.status(200).json({ success: true, message: 'Message envoyé avec succès' });
  } catch (err) {
    console.error('[A3DIA] Erreur envoi mail :', err);
    return res.status(500).json({
      success: false,
      error: "Erreur d'envoi du message. Réessayez plus tard.",
    });
  }
}
