// Ré-import A3DIA — recharge annuaire + trésorerie dans une base Upstash NEUVE.
//
// Usage :
//   DRY_RUN (validation lecture, sans base) :
//     node scripts/reimport.mjs
//   Import réel (une fois la nouvelle base créée) :
//     UPSTASH_REDIS_REST_URL="https://..." UPSTASH_REDIS_REST_TOKEN="..." \
//     node scripts/reimport.mjs --write
//
// Le script est IDEMPOTENT sur l'email : si un user existe déjà (même email),
// il le réutilise plutôt que de le dupliquer.

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

const DIR = new URL('../data-backup/', import.meta.url).pathname;
const ANNUAIRE = DIR + 'annuaire_a3dia_2026-07-01.csv';
const TRESO = DIR + 'tresorerie_a3dia_2026-07-01.csv';
const WRITE = process.argv.includes('--write');

// ---- CSV parser (gère BOM, guillemets, "" échappés, virgules internes) ----
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignore */ }
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

// ---- Lecture ----
const members = rowsToObjects(parseCsv(readFileSync(ANNUAIRE, 'utf8')));
const payments = rowsToObjects(parseCsv(readFileSync(TRESO, 'utf8')));

console.log(`Annuaire   : ${members.length} lignes`);
console.log(`Trésorerie : ${payments.length} lignes`);

// ---- Validation ----
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const badEmails = members.filter(m => !emailRe.test((m['Email'] || '').toLowerCase()));
const noAmount = payments.filter(p => !p['Montant (€)'] || isNaN(parseFloat(p['Montant (€)'])));
console.log(`  emails invalides   : ${badEmails.length}`);
console.log(`  montants invalides : ${noAmount.length}`);

// combien de paiements matcheront un membre par email
const memberEmails = new Set(members.map(m => (m['Email'] || '').toLowerCase()));
const orphanPay = payments.filter(p => !memberEmails.has((p['Email'] || '').toLowerCase()));
console.log(`  paiements sans membre correspondant : ${orphanPay.length}`);

if (!WRITE) {
  console.log('\n[DRY RUN] Aucune écriture. Relance avec --write + les variables Upstash pour importer.');
  if (badEmails.length) console.log('Exemples emails invalides :', badEmails.slice(0, 5).map(m => `${m['Prénom']} ${m['Nom']}`));
  process.exit(0);
}

// ---- Import réel ----
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) { console.error('❌ UPSTASH_REDIS_REST_URL / _TOKEN manquants.'); process.exit(1); }

const { Redis } = await import('@upstash/redis');
const kv = new Redis({ url, token });

const now = new Date().toISOString();
const emailToId = {};

// 1) Membres
console.log('\n→ Import des membres…');
let created = 0, reused = 0;
for (const m of members) {
  const email = (m['Email'] || '').toLowerCase();
  if (!emailRe.test(email)) continue;

  let id = await kv.get(`idx:email:${email}`);
  if (id) { emailToId[email] = id; reused++; continue; }

  id = `usr_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const isAdmin = email === 'contact@a3dia-info.org';
  const tempPassword = randomUUID().replace(/-/g, '').slice(0, 10);
  const user = {
    id, email,
    passwordHash: await bcrypt.hash(tempPassword, 10),
    civilite: '',
    prenom: m['Prénom'] || '',
    nom: m['Nom'] || '',
    societe: m['Société'] || '',
    tel: m['Téléphone'] || '',
    adresse: m['Adresse'] || '', cp: m['CP'] || '', ville: m['Ville'] || '',
    role: isAdmin ? 'admin' : 'membre',
    actif: (m['Statut'] || '').toLowerCase().startsWith('actif'),
    importedAt: now, createdAt: now, lastLogin: null
  };
  await kv.set(`user:${id}`, user);
  await kv.set(`idx:email:${email}`, id);
  await kv.sadd('users', id);
  emailToId[email] = id;
  created++;
  if (created % 200 === 0) console.log(`   ${created} créés…`);
}
console.log(`   membres : ${created} créés, ${reused} réutilisés`);

// 2) Paiements
console.log('\n→ Import des paiements…');
let pc = 0;
for (const p of payments) {
  const email = (p['Email'] || '').toLowerCase();
  const memberId = emailToId[email] || null;
  const montant = Math.round(parseFloat(p['Montant (€)'] || '0') * 100);
  if (!montant) continue;
  const annee = p['Année'] || '';
  const id = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const payment = {
    id, memberId,
    memberName: p['Adhérent'] || '',
    requestId: null,
    montant,
    type: p['Type'] || 'virement',
    status: p['Statut'] || 'confirme',
    description: p['Description'] || `Cotisation A3DIA ${annee}`,
    annee,
    reference: p['Référence'] || '',
    source: 'historique',
    stripeSessionId: null, stripePaymentId: null,
    confirmedAt: p['Date confirmation'] || null,
    createdAt: p['Date confirmation'] || now,
    updatedAt: now
  };
  await kv.set(`payment:${id}`, payment);
  await kv.sadd('payments', id);
  pc++;
  if (pc % 300 === 0) console.log(`   ${pc} paiements…`);
}
console.log(`   paiements : ${pc} importés`);

console.log('\n✅ Ré-import terminé.');
