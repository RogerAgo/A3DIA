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

// Email de bienvenue avec lien de création de mot de passe (à usage unique).
export async function sendWelcomeSetPassword({ to, prenom, nom, setUrl, baseUrl }) {
  const mailer = getMailer();

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
        L'association A3DIA a lancé son <strong>nouveau site adhérents</strong>. Votre compte a été créé —
        il ne vous reste qu'à choisir votre mot de passe pour accéder à votre espace personnel
        (communiqués, documents, et paiement de votre cotisation en ligne).
      </p>

      <div style="text-align:center;margin-bottom:28px">
        <a href="${setUrl}" style="display:inline-block;background:#1a2961;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.95rem">
          Créer mon mot de passe →
        </a>
      </div>

      <p style="margin:0 0 20px;color:#94a3b8;font-size:0.8rem">
        Ce lien est personnel et valable 14 jours. Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
        <span style="color:#1a2961;word-break:break-all">${setUrl}</span>
      </p>

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
    subject: 'Bienvenue sur le nouveau site A3DIA — créez votre mot de passe',
    html,
    text: `Bonjour ${prenom} ${nom},\n\nL'association A3DIA a lancé son nouveau site adhérents. Votre compte a été créé.\n\nCréez votre mot de passe ici (lien valable 14 jours) :\n${setUrl}\n\nA3DIA`
  });
}

// Email de réinitialisation de mot de passe (lien à usage unique, 2 h).
export async function sendPasswordReset({ to, prenom, nom, setUrl, baseUrl }) {
  const mailer = getMailer();

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08)">
    <div style="background:#1a2961;padding:28px 32px;text-align:center">
      <img src="${baseUrl}/assets/images/logo-a3dia-white.png" alt="A3DIA" height="40" style="height:40px" />
    </div>
    <div style="padding:32px">
      <h1 style="margin:0 0 8px;font-size:1.25rem;color:#0f172a">Réinitialisation de votre mot de passe</h1>
      <p style="margin:0 0 24px;color:#475569;font-size:0.95rem">
        Bonjour ${prenom} ${nom},<br><br>
        Vous avez demandé à réinitialiser le mot de passe de votre espace adhérent A3DIA.
        Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
      </p>
      <div style="text-align:center;margin-bottom:28px">
        <a href="${setUrl}" style="display:inline-block;background:#1a2961;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.95rem">
          Choisir un nouveau mot de passe →
        </a>
      </div>
      <p style="margin:0 0 20px;color:#94a3b8;font-size:0.8rem">
        Ce lien est valable 2 heures. Si vous n'êtes pas à l'origine de cette demande,
        ignorez simplement cet email : votre mot de passe actuel reste inchangé.<br><br>
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
        <span style="color:#1a2961;word-break:break-all">${setUrl}</span>
      </p>
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
    subject: 'Réinitialisation de votre mot de passe A3DIA',
    html,
    text: `Bonjour ${prenom} ${nom},\n\nPour choisir un nouveau mot de passe (lien valable 2 h) :\n${setUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\nA3DIA`
  });
}
