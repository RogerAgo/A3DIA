import bcrypt from 'bcryptjs';
import { requireAdmin } from '../_lib/auth.js';
import { getDB } from '../_lib/db.js';
import { sendWelcomeEmail, sendWelcomeSetPassword } from '../_lib/mail.js';

const POST_TYPES = ['Communiqué', 'Document AG', 'OPA / OVR', 'Dividende', 'Info'];

export default async function handler(req, res) {
  const { resource } = req.query;

  if (resource === 'setup') return setup(req, res);

  const admin = requireAdmin(req, res);
  if (!admin) return;

  let kv;
  try { kv = getDB(); } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }

  switch (resource) {
    case 'members':         return members(kv, req, res);
    case 'payments':        return payments(kv, req, res);
    case 'posts':           return posts(kv, req, res);
    case 'requests':        return requests(kv, req, res, admin);
    case 'stats':           return stats(kv, req, res);
    case 'import':          return importMembers(kv, req, res);
    case 'dedup-payments':  return dedupPayments(kv, req, res);
    default:
      return res.status(404).json({ success: false, error: `Ressource inconnue: ${resource}` });
  }
}

function omit(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
}

// ─── setup ──────────────────────────────────────────────────────────────────
async function setup(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const kv = getDB();
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      return res.status(500).json({
        success: false,
        error: 'ADMIN_EMAIL et/ou ADMIN_PASSWORD manquants dans les variables d\'environnement.'
      });
    }

    const existingId = await kv.get(`idx:email:${email.toLowerCase()}`);
    if (existingId) {
      return res.status(409).json({
        success: false,
        error: 'Un compte avec cet email existe déjà. Setup déjà effectué.'
      });
    }

    const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id,
      email: email.toLowerCase().trim(),
      passwordHash,
      civilite: '', prenom: 'Administrateur', nom: 'A3DIA',
      societe: '', tel: '',
      role: 'admin', actif: true,
      createdAt: new Date().toISOString(),
      lastLogin: null
    };

    await kv.set(`user:${id}`, user);
    await kv.set(`idx:email:${email.toLowerCase()}`, id);
    await kv.sadd('users', id);

    return res.status(201).json({
      success: true,
      message: `Compte admin créé pour ${email}. Connectez-vous sur /login.`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Erreur inconnue',
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
  }
}

// ─── members ────────────────────────────────────────────────────────────────
async function members(kv, req, res) {
  if (req.method === 'GET')    return membersList(kv, res);
  if (req.method === 'POST')   return membersCreate(kv, req, res);
  if (req.method === 'PUT')    return membersUpdate(kv, req, res);
  if (req.method === 'DELETE') return membersDelete(kv, req, res);
  return res.status(405).end();
}

async function membersList(kv, res) {
  const ids = (await kv.smembers('users')) ?? [];
  const users = await Promise.all(ids.map(id => kv.get(`user:${id}`)));
  const list = users
    .filter(Boolean)
    .map(u => omit(u, ['passwordHash']))
    .sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? '', 'fr'));
  return res.status(200).json({ success: true, members: list });
}

async function membersCreate(kv, req, res) {
  const { email, password, prenom, nom, civilite = '', tel = '', societe = '', role = 'membre', actif = true } = req.body ?? {};

  if (!email || !password || !prenom || !nom) {
    return res.status(400).json({ success: false, error: 'email, password, prenom et nom sont requis' });
  }
  if (!['membre', 'admin'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Rôle invalide (membre | admin)' });
  }

  const emailKey = `idx:email:${email.toLowerCase().trim()}`;
  if (await kv.get(emailKey)) {
    return res.status(409).json({ success: false, error: 'Cet email est déjà utilisé' });
  }

  const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id, email: email.toLowerCase().trim(), passwordHash,
    civilite, prenom, nom, societe, tel, role,
    actif: Boolean(actif),
    createdAt: new Date().toISOString(), lastLogin: null
  };

  await kv.set(`user:${id}`, user);
  await kv.set(emailKey, id);
  await kv.sadd('users', id);

  return res.status(201).json({ success: true, member: omit(user, ['passwordHash']) });
}

async function membersUpdate(kv, req, res) {
  const { id, prenom, nom, civilite, tel, societe, role, actif, password } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const user = await kv.get(`user:${id}`);
  if (!user) return res.status(404).json({ success: false, error: 'Membre introuvable' });

  const updates = {};
  if (prenom !== undefined) updates.prenom = prenom;
  if (nom !== undefined) updates.nom = nom;
  if (civilite !== undefined) updates.civilite = civilite;
  if (tel !== undefined) updates.tel = tel;
  if (societe !== undefined) updates.societe = societe;
  if (role !== undefined && ['membre', 'admin'].includes(role)) updates.role = role;
  if (actif !== undefined) updates.actif = Boolean(actif);
  if (password) updates.passwordHash = await bcrypt.hash(password, 10);

  const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
  await kv.set(`user:${id}`, updated);

  return res.status(200).json({ success: true, member: omit(updated, ['passwordHash']) });
}

async function membersDelete(kv, req, res) {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const user = await kv.get(`user:${id}`);
  if (!user) return res.status(404).json({ success: false, error: 'Membre introuvable' });

  await Promise.all([
    kv.del(`user:${id}`),
    kv.del(`idx:email:${user.email}`),
    kv.srem('users', id)
  ]);

  return res.status(200).json({ success: true });
}

// ─── payments ───────────────────────────────────────────────────────────────
async function payments(kv, req, res) {
  if (req.method === 'GET')    return paymentsList(kv, res);
  if (req.method === 'POST')   return paymentsCreate(kv, req, res);
  if (req.method === 'PUT')    return paymentsUpdate(kv, req, res);
  if (req.method === 'DELETE') return paymentsDelete(kv, req, res);
  return res.status(405).end();
}

async function paymentsList(kv, res) {
  const ids = (await kv.smembers('payments')) ?? [];
  const list = await Promise.all(ids.map(id => kv.get(`payment:${id}`)));

  const memberIds = [...new Set(list.filter(Boolean).map(p => p.memberId).filter(Boolean))];
  const memberRows = await Promise.all(memberIds.map(id => kv.get(`user:${id}`)));
  const memberMap = Object.fromEntries(memberRows.filter(Boolean).map(m => [m.id, m]));

  const out = list
    .filter(Boolean)
    .map(p => ({
      ...p,
      memberName: memberMap[p.memberId] ? `${memberMap[p.memberId].prenom} ${memberMap[p.memberId].nom}` : '—',
      memberEmail: memberMap[p.memberId]?.email || '—',
      memberActif: memberMap[p.memberId]?.actif ?? null
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.status(200).json({ success: true, payments: out });
}

async function paymentsCreate(kv, req, res) {
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

async function paymentsUpdate(kv, req, res) {
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

async function paymentsDelete(kv, req, res) {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const payment = await kv.get(`payment:${id}`);
  if (!payment) return res.status(404).json({ success: false, error: 'Paiement introuvable' });

  await Promise.all([kv.del(`payment:${id}`), kv.srem('payments', id)]);
  return res.status(200).json({ success: true });
}

// ─── posts ──────────────────────────────────────────────────────────────────
async function posts(kv, req, res) {
  if (req.method === 'GET')    return postsList(kv, res);
  if (req.method === 'POST')   return postsCreate(kv, req, res);
  if (req.method === 'PUT')    return postsUpdate(kv, req, res);
  if (req.method === 'DELETE') return postsDelete(kv, req, res);
  return res.status(405).end();
}

async function postsList(kv, res) {
  const ids = (await kv.smembers('posts')) ?? [];
  const rows = await Promise.all(ids.map(id => kv.get(`post:${id}`)));
  const list = rows
    .filter(Boolean)
    .sort((a, b) => new Date(b.datePublication) - new Date(a.datePublication));
  return res.status(200).json({ success: true, posts: list });
}

async function postsCreate(kv, req, res) {
  const { titre, contenu, societe = '', type = 'Communiqué', datePublication } = req.body ?? {};

  if (!titre || !contenu) {
    return res.status(400).json({ success: false, error: 'titre et contenu sont requis' });
  }

  const id = `post_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  const post = {
    id, titre, contenu, societe,
    type: POST_TYPES.includes(type) ? type : 'Communiqué',
    datePublication: datePublication || now.split('T')[0],
    createdAt: now, updatedAt: now
  };

  await kv.set(`post:${id}`, post);
  await kv.sadd('posts', id);

  return res.status(201).json({ success: true, post });
}

async function postsUpdate(kv, req, res) {
  const { id, titre, contenu, societe, type, datePublication } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const post = await kv.get(`post:${id}`);
  if (!post) return res.status(404).json({ success: false, error: 'Communiqué introuvable' });

  const updates = { updatedAt: new Date().toISOString() };
  if (titre !== undefined) updates.titre = titre;
  if (contenu !== undefined) updates.contenu = contenu;
  if (societe !== undefined) updates.societe = societe;
  if (type !== undefined && POST_TYPES.includes(type)) updates.type = type;
  if (datePublication !== undefined) updates.datePublication = datePublication;

  const updated = { ...post, ...updates };
  await kv.set(`post:${id}`, updated);

  return res.status(200).json({ success: true, post: updated });
}

async function postsDelete(kv, req, res) {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const post = await kv.get(`post:${id}`);
  if (!post) return res.status(404).json({ success: false, error: 'Communiqué introuvable' });

  await Promise.all([kv.del(`post:${id}`), kv.srem('posts', id)]);

  return res.status(200).json({ success: true });
}

// ─── requests ───────────────────────────────────────────────────────────────
async function requests(kv, req, res, admin) {
  if (req.method === 'GET')    return requestsList(kv, res);
  if (req.method === 'PUT')    return requestsUpdate(kv, req, res, admin);
  if (req.method === 'DELETE') return requestsDelete(kv, req, res);
  return res.status(405).end();
}

async function requestsList(kv, res) {
  const ids = (await kv.smembers('requests')) ?? [];
  const rows = await Promise.all(ids.map(id => kv.get(`request:${id}`)));
  const list = rows
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.status(200).json({ success: true, requests: list });
}

async function requestsUpdate(kv, req, res, admin) {
  const { id, action, paymentMethod, notes, status } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const request = await kv.get(`request:${id}`);
  if (!request) return res.status(404).json({ success: false, error: 'Demande introuvable' });

  const now = new Date().toISOString();
  const updates = { updatedAt: now };

  if (notes !== undefined) updates.notes = notes;

  if (action === 'approuver') {
    if (['rejetee', 'payee'].includes(request.status)) {
      return res.status(400).json({ success: false, error: 'Cette demande ne peut plus être approuvée.' });
    }

    const method = paymentMethod || 'stripe'; // carte recommandée par défaut ; l'adhérent choisit ensuite
    updates.status = 'approuvee';
    updates.paymentMethod = method;
    updates.approvedAt = now;
    updates.approvedBy = admin.sub;

    if (!request.memberId) {
      // Mot de passe jetable : l'adhérent définit le sien via le lien de bienvenue
      const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);
      const memberId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

      const user = {
        id: memberId,
        email: request.email,
        passwordHash,
        civilite: request.civilite,
        prenom: request.prenom,
        nom: request.nom,
        societe: request.societe || '',
        tel: request.tel || '',
        role: 'membre',
        actif: false,
        createdAt: now,
        lastLogin: null
      };

      await kv.set(`user:${memberId}`, user);
      await kv.set(`idx:email:${request.email}`, memberId);
      await kv.sadd('users', memberId);
      updates.memberId = memberId;

      const payId = `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const annee = new Date().getFullYear();
      const payment = {
        id: payId,
        memberId,
        requestId: id,
        montant: request.montant || 5000,
        type: method,
        status: 'en_attente',
        description: `Cotisation annuelle A3DIA ${annee}`,
        annee,
        reference: `A3DIA-${annee}-${memberId.slice(-6).toUpperCase()}`,
        stripeSessionId: null,
        stripePaymentId: null,
        createdAt: now,
        updatedAt: now,
        confirmedAt: null
      };

      await kv.set(`payment:${payId}`, payment);
      await kv.sadd('payments', payId);
      // Réutilisable par le paiement carte self-service (/api/membres/cotisation)
      await kv.set(`cotisation_pending:${memberId}:${annee}`, payId);
      updates.paymentId = payId;

      // Email de bienvenue avec lien "créer mon mot de passe" (14 j)
      try {
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const proto = req.headers['x-forwarded-proto'] || 'https';
        const baseUrl = `${proto}://${host}`;
        const token = `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
        await kv.set(`pwset:${token}`, memberId, { ex: 14 * 24 * 3600 });
        await sendWelcomeSetPassword({
          to: request.email, prenom: request.prenom, nom: request.nom,
          setUrl: `${baseUrl}/nouveau-mot-de-passe?token=${token}`, baseUrl
        });
        updates.welcomeEmailSent = true;
      } catch {
        updates.welcomeEmailSent = false;
      }
    }

  } else if (action === 'rejeter') {
    updates.status = 'rejetee';
    updates.rejectedAt = now;
    updates.rejectedBy = admin.sub;

  } else if (status !== undefined) {
    updates.status = status;
  }

  const updated = { ...request, ...updates };
  await kv.set(`request:${id}`, updated);
  return res.status(200).json({ success: true, request: updated });
}

async function requestsDelete(kv, req, res) {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ success: false, error: 'id requis' });

  const request = await kv.get(`request:${id}`);
  if (!request) return res.status(404).json({ success: false, error: 'Demande introuvable' });

  await Promise.all([kv.del(`request:${id}`), kv.srem('requests', id)]);
  return res.status(200).json({ success: true });
}

// ─── stats ──────────────────────────────────────────────────────────────────
async function stats(kv, req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const [userIds, requestIds, paymentIds, postIds] = await Promise.all([
    kv.smembers('users'),
    kv.smembers('requests'),
    kv.smembers('payments'),
    kv.smembers('posts')
  ]);

  const [users, requestRows, paymentRows] = await Promise.all([
    Promise.all((userIds ?? []).map(id => kv.get(`user:${id}`))),
    Promise.all((requestIds ?? []).map(id => kv.get(`request:${id}`))),
    Promise.all((paymentIds ?? []).map(id => kv.get(`payment:${id}`)))
  ]);

  const validUsers = users.filter(Boolean);
  const validRequests = requestRows.filter(Boolean);
  const validPayments = paymentRows.filter(Boolean);

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

// ─── import ─────────────────────────────────────────────────────────────────
async function importMembers(kv, req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { members: list, sendEmails = true } = req.body ?? {};

  if (!Array.isArray(list) || list.length === 0) {
    return res.status(400).json({ success: false, error: 'Liste de membres vide ou invalide.' });
  }
  if (list.length > 200) {
    return res.status(400).json({ success: false, error: 'Maximum 200 membres par import.' });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;

  const results = { created: [], skipped: [], errors: [] };

  for (const m of list) {
    const email = m.email?.toLowerCase().trim();
    const prenom = m.prenom?.trim();
    const nom = m.nom?.trim();

    if (!email || !prenom || !nom) {
      results.errors.push({ email: email || '?', reason: 'email, prenom et nom requis' });
      continue;
    }

    const existingId = await kv.get(`idx:email:${email}`);
    if (existingId) {
      results.skipped.push({ email, reason: 'compte existant' });
      continue;
    }

    try {
      const tempPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const now = new Date().toISOString();

      const user = {
        id,
        email,
        passwordHash,
        civilite: m.civilite?.trim() || '',
        prenom,
        nom,
        societe: m.societe?.trim() || '',
        tel: m.tel?.trim() || '',
        role: 'membre',
        actif: true,
        importedAt: now,
        createdAt: now,
        lastLogin: null
      };

      await kv.set(`user:${id}`, user);
      await kv.set(`idx:email:${email}`, id);
      await kv.sadd('users', id);

      if (sendEmails) {
        try {
          await sendWelcomeEmail({ to: email, prenom, nom, email, tempPassword, baseUrl });
          results.created.push({ email, prenom, nom, status: 'créé + email envoyé' });
        } catch {
          results.created.push({ email, prenom, nom, status: 'créé (échec email)', tempPassword });
        }
      } else {
        results.created.push({ email, prenom, nom, status: 'créé', tempPassword });
      }

    } catch (err) {
      results.errors.push({ email, reason: err.message });
    }
  }

  return res.status(200).json({
    success: true,
    summary: {
      total: list.length,
      created: results.created.length,
      skipped: results.skipped.length,
      errors: results.errors.length
    },
    results
  });
}

// ─── dedup-payments ─────────────────────────────────────────────────────────
// POST /api/admin/dedup-payments
// Removes duplicate historical payment records in one shot.
// Uses Promise.all throughout so Upstash auto-pipelines all Redis ops.
async function dedupPayments(kv, req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // 1. Get all IDs
  const allIds = (await kv.smembers('payments')) ?? [];

  // 2. Fetch all payment objects in one parallel batch (Upstash pipelines these)
  const all = (await Promise.all(allIds.map(id => kv.get(`payment:${id}`)))).filter(Boolean);

  // 3. Filter to historique payments only
  const hist = all.filter(p => p.source === 'historique');

  // 4. Build composite dedup key
  const makeKey = p => {
    const d = p.confirmedAt ? p.confirmedAt.slice(0, 10) : '';
    return `${p.memberId || p.memberName}|${p.annee}|${p.montant}|${p.type}|${p.reference || ''}|${d}`;
  };

  // Sort oldest-first so we keep the earliest import
  hist.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

  const seen = new Set();
  const toDelete = [];
  for (const p of hist) {
    const k = makeKey(p);
    if (seen.has(k)) {
      toDelete.push(p.id);
    } else {
      seen.add(k);
    }
  }

  // 5. Delete duplicates — all in parallel (one pipeline per op type)
  if (toDelete.length > 0) {
    await Promise.all(toDelete.map(id => kv.del(`payment:${id}`)));
    await Promise.all(toDelete.map(id => kv.srem('payments', id)));
  }

  return res.status(200).json({
    success: true,
    summary: {
      totalFetched: all.length,
      historique: hist.length,
      duplicatesRemoved: toDelete.length,
      remaining: all.length - toDelete.length
    }
  });
}
