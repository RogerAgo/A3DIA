// Ré-import A3DIA — recharge annuaire + trésorerie dans une base Upstash NEUVE.
//
// Usage :
//   DRY_RUN (validation lecture, sans base) :
//     node scripts/reimport.mjs
//   Import réel :
//     UPSTASH_REDIS_REST_URL="https://..." UPSTASH_REDIS_REST_TOKEN="..." \
//     node scripts/reimport.mjs --write
//   (accepte aussi KV_REST_API_URL / KV_REST_API_TOKEN)

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

const DIR = new URL('../data-backup/', import.meta.url).pathname;
const ANNUAIRE = DIR + 'annuaire_a3dia_2026-07-01.csv';
const TRESO = DIR + 'tresorerie_a3dia_2026-07-01.csv';
const WRITE = process.argv.includes('--write');
const ADMIN_EMAIL = 'contact@a3dia-info.org';
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- CSV parser (gère BOM, guillemets, "" échappés, virgules internes) ----
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim()));
}
function rowsToObjects(rows) {
  const header = rows[0];
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const members = rowsToObjects(parseCsv(readFileSync(ANNUAIRE, 'utf8')));
const payments = rowsToObjects(parseCsv(readFileSync(TRESO, 'utf8')));

console.log(`Annuaire   : ${members.length} lignes`);
console.log(`Trésorerie : ${payments.length} lignes`);

const badEmails = members.filter(m => !emailRe.test((m['Email'] || '').toLowerCase()));
const noAmount = payments.filter(p => !p['Montant (€)'] || isNaN(parseFloat(p['Montant (€)'])));
console.log(`  emails invalides   : ${badEmails.length}`);
console.log(`  montants invalides : ${noAmount.length}`);

if (!WRITE) {
  console.log('\n[DRY RUN] Aucune écriture. Relance avec --write + variables Upstash.');
  process.exit(0);
}

// ---- Import réel ----
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
if (!url || !token) { console.error('❌ URL/TOKEN Upstash manquants.'); process.exit(1); }

const { Redis } = await import('@upstash/redis');
const kv = new Redis({ url, token });

const now = new Date().toISOString();
const emailToId = {};

// Hash jetable partagé : un membre importé ne peut PAS se connecter tant qu'il
// n'a pas reçu son email de bienvenue (qui génère un mot de passe unique).
const placeholderHash = await bcrypt.hash(randomUUID(), 10);

async function chunked(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
    process.stdout.write(`\r   ${Math.min(i + size, items.length)}/${items.length}`);
  }
  process.stdout.write('\n');
}

// 1) Membres (on saute le compte admin — recréé via /api/admin/setup)
const realMembers = members.filter(m => {
  const e = (m['Email'] || '').toLowerCase();
  return e !== ADMIN_EMAIL && emailRe.test(e);
});
console.log(`\n→ Import de ${realMembers.length} membres…`);
await chunked(realMembers, 40, async (m) => {
  const email = (m['Email'] || '').toLowerCase();
  const id = `usr_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const user = {
    id, email, passwordHash: placeholderHash, civilite: '',
    prenom: m['Prénom'] || '', nom: m['Nom'] || '',
    societe: m['Société'] || '', tel: m['Téléphone'] || '',
    adresse: m['Adresse'] || '', cp: m['CP'] || '', ville: m['Ville'] || '',
    role: 'membre',
    actif: (m['Statut'] || '').toLowerCase().startsWith('actif'),
    importedAt: now, createdAt: now, lastLogin: null
  };
  emailToId[email] = id;
  await Promise.all([
    kv.set(`user:${id}`, user),
    kv.set(`idx:email:${email}`, id),
    kv.sadd('users', id)
  ]);
});

// 2) Paiements
console.log(`→ Import de ${payments.length} paiements…`);
let skipped = 0;
await chunked(payments, 80, async (p) => {
  const email = (p['Email'] || '').toLowerCase();
  const montant = Math.round(parseFloat(p['Montant (€)'] || '0') * 100);
  if (!montant) { skipped++; return; }
  const annee = p['Année'] || '';
  const id = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const payment = {
    id, memberId: emailToId[email] || null,
    memberName: p['Adhérent'] || '', requestId: null, montant,
    type: p['Type'] || 'virement',
    status: p['Statut'] || 'confirme',
    description: p['Description'] || `Cotisation A3DIA ${annee}`,
    annee, reference: p['Référence'] || '', source: 'historique',
    stripeSessionId: null, stripePaymentId: null,
    confirmedAt: p['Date confirmation'] || null,
    createdAt: p['Date confirmation'] || now, updatedAt: now
  };
  await Promise.all([kv.set(`payment:${id}`, payment), kv.sadd('payments', id)]);
});

console.log(`\n✅ Ré-import terminé — ${realMembers.length} membres, ${payments.length - skipped} paiements.`);
