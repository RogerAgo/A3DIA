import { requireAdmin } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';
import { sendWelcomeEmail, getMailer, fromAddress } from '../_lib/mail.js';

export default async function handler(req, res) {
  const admin = requireAdmin(req, res);
  if (!admin) return;

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  if (req.method === 'GET') return getInbox(kv, req, res);
  if (req.method === 'POST') return sendMail(kv, req, res, admin);
  return res.status(405).end();
}

async function getInbox(kv, req, res) {
  // Fetch emails via IMAP if configured
  const imapHost = process.env.IMAP_HOST;
  const imapUser = process.env.IMAP_USER || process.env.SMTP_USER;
  const imapPass = process.env.IMAP_PASS || process.env.SMTP_PASS;

  if (!imapHost || !imapUser || !imapPass) {
    // Return sent emails log from KV as fallback
    const ids = (await kv.smembers('sent_emails')) ?? [];
    const emails = await Promise.all(ids.slice(-50).map(id => kv.get(`sent_email:${id}`)));
    return res.status(200).json({
      success: true,
      inbox: [],
      sent: emails.filter(Boolean).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt)),
      imapConfigured: false
    });
  }

  try {
    // Dynamic import of imapflow
    const { ImapFlow } = await import('imapflow');
    const client = new ImapFlow({
      host: imapHost,
      port: parseInt(process.env.IMAP_PORT || '993'),
      secure: (process.env.IMAP_PORT || '993') === '993',
      auth: { user: imapUser, pass: imapPass },
      logger: false
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    const messages = [];

    try {
      for await (const msg of client.fetch('1:50', {
        envelope: true, bodyStructure: true, flags: true, uid: true
      })) {
        messages.push({
          uid: msg.uid,
          subject: msg.envelope.subject || '(sans objet)',
          from: msg.envelope.from?.[0]?.address || '',
          fromName: msg.envelope.from?.[0]?.name || '',
          date: msg.envelope.date,
          seen: msg.flags.has('\\Seen'),
          flagged: msg.flags.has('\\Flagged')
        });
      }
    } finally {
      lock.release();
    }
    await client.logout();

    const ids = (await kv.smembers('sent_emails')) ?? [];
    const sent = await Promise.all(ids.slice(-30).map(id => kv.get(`sent_email:${id}`)));

    return res.status(200).json({
      success: true,
      inbox: messages.reverse(),
      sent: sent.filter(Boolean).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt)),
      imapConfigured: true
    });
  } catch (err) {
    return res.status(200).json({ success: true, inbox: [], sent: [], imapConfigured: false, error: err.message });
  }
}

async function sendMail(kv, req, res, admin) {
  const { to, subject, body, broadcast, memberFilter } = req.body ?? {};

  let mailer;
  try { mailer = getMailer(); } catch (e) {
    return res.status(503).json({ success: false, error: e.message });
  }

  const recipients = [];

  if (broadcast) {
    // Send to all or filtered members
    const ids = (await kv.smembers('users')) ?? [];
    const users = (await Promise.all(ids.map(id => kv.get(`user:${id}`)))).filter(Boolean);
    const filtered = memberFilter === 'actif' ? users.filter(u => u.actif) : users;
    recipients.push(...filtered.map(u => ({ email: u.email, name: `${u.prenom} ${u.nom}` })));
  } else if (Array.isArray(to)) {
    recipients.push(...to);
  } else if (typeof to === 'string') {
    recipients.push({ email: to, name: '' });
  }

  if (!recipients.length)
    return res.status(400).json({ success: false, error: 'Aucun destinataire.' });
  if (!subject || !body)
    return res.status(400).json({ success: false, error: 'Sujet et corps requis.' });

  let sent = 0, failed = 0, failedEmails = [];
  const sentAt = new Date().toISOString();

  const htmlBody = body.replace(/\n/g, '<br>');
  const fullHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
    <div style="background:#1a2961;padding:24px 32px">
      <img src="https://a3dia-info.org/assets/images/logo-a3dia-white.png" alt="A3DIA" height="36" />
    </div>
    <div style="padding:32px;color:#374151;font-size:0.95rem;line-height:1.7">
      ${htmlBody}
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:0.78rem;color:#94a3b8;text-align:center">
      A3DIA — 9 rue Anatole de La Forge, 75017 Paris
    </div>
  </div>
</body></html>`;

  // Send in batches of 10 to avoid timeout
  for (const r of recipients) {
    try {
      await mailer.sendMail({
        from: fromAddress(),
        to: r.email,
        subject,
        html: fullHtml,
        text: body
      });
      sent++;
    } catch {
      failed++;
      failedEmails.push(r.email);
    }
  }

  // Log sent email
  const logId = `sml_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  await kv.set(`sent_email:${logId}`, {
    id: logId,
    subject,
    recipients: recipients.length,
    sent, failed,
    broadcast: !!broadcast,
    sentBy: admin.sub,
    sentAt,
    preview: body.substring(0, 200)
  });
  await kv.sadd('sent_emails', logId);

  return res.status(200).json({ success: true, sent, failed, failedEmails: failedEmails.slice(0, 10) });
}
