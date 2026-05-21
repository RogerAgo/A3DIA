import nodemailer from 'nodemailer';

export function getMailer() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('Variables SMTP manquantes : SMTP_HOST, SMTP_USER, SMTP_PASS');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

export function fromAddress() {
  return process.env.SMTP_FROM || `A3DIA <${process.env.SMTP_USER}>`;
}

export async function sendWelcomeEmail({ to, prenom, nom, email, tempPassword, baseUrl }) {
  const mailer = getMailer();
  const loginUrl = `${baseUrl}/login.html`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
    <div style="background:#1a2961;padding:28px 32px;text-align:center">
      <img src="${baseUrl}/assets/images/logo-a3dia-white.png" alt="A3DIA" height="40" style="height:40px" />
    </div>
    <div style="padding:32px">
      <h1 style="margin:0 0 8px;font-size:1.25rem;color:#0f172a">Bienvenue sur le nouveau site A3DIA</h1>
      <p style="margin:0 0 24px;color:#475569;font-size:0.95rem">
        Bonjour ${prenom} ${nom},<br><br>
        Votre espace adhérent a été créé sur le nouveau site de l'association A3DIA.
        Vous pouvez dès maintenant vous connecter avec les identifiants ci-dessous.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 10px;font-size:0.85rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Vos identifiants</p>
        <p style="margin:0 0 8px;font-size:0.95rem;color:#0f172a"><strong>Email :</strong> ${email}</p>
        <p style="margin:0;font-size:0.95rem;color:#0f172a"><strong>Mot de passe temporaire :</strong> <code style="background:#e2e8f0;padding:2px 8px;border-radius:4px;font-family:monospace">${tempPassword}</code></p>
      </div>

      <p style="margin:0 0 20px;color:#475569;font-size:0.875rem">
        ⚠️ Pour votre sécurité, <strong>changez votre mot de passe</strong> dès votre première connexion (onglet "Mon compte").
      </p>

      <div style="text-align:center;margin-bottom:28px">
        <a href="${loginUrl}" style="display:inline-block;background:#1a2961;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.95rem">
          Accéder à mon espace →
        </a>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px">
      <p style="margin:0;font-size:0.8rem;color:#94a3b8;text-align:center">
        A3DIA — Association de Défense des Investisseurs Arkéon<br>
        9 rue Anatole de La Forge, 75017 Paris
      </p>
    </div>
  </div>
</body>
</html>`;

  await mailer.sendMail({
    from: fromAddress(),
    to,
    subject: 'Votre accès à l\'espace adhérents A3DIA',
    html,
    text: `Bonjour ${prenom} ${nom},\n\nVotre espace adhérent A3DIA est prêt.\n\nEmail : ${email}\nMot de passe temporaire : ${tempPassword}\n\nConnectez-vous sur : ${loginUrl}\n\nA3DIA`
  });
}
