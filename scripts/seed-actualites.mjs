// Seed des actualités de l'Espace Adhérents (système de posts existant).
// Reprend le contenu de l'ancien site (www.a3dia.org → « Les actualités ») :
//  1. AGO du 3 juin 2026 (convocation + rapports)
//  2. Moins-values fiscales (tableau des liquidations + Cerfa 2074)
// Les PDF sont servis par la route AUTHENTIFIÉE /api/membres/doc?id=… :
// réservée aux adhérents connectés ET à jour de cotisation (mêmes règles
// que /api/membres/posts). Fichiers hors zone publique : api/_docs/.
//
// Usage : node scripts/seed-actualites.mjs
// Lit UPSTASH_REDIS_REST_URL/TOKEN (ou KV_REST_API_*) depuis .env.local
// (récupéré via `vercel env pull .env.local --environment=production`).
// Idempotent : ne recrée pas un post dont le titre existe déjà.

import { readFileSync } from 'node:fs';
import { Redis } from '@upstash/redis';
import crypto from 'node:crypto';

// ── env ──────────────────────────────────────────────────────────────────────
try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* pas de .env.local : on tentera les vars du shell */ }

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('Variables KV manquantes (vercel env pull .env.local --environment=production)');
  process.exit(1);
}
const kv = new Redis({ url, token });

// ── contenu des posts ────────────────────────────────────────────────────────
const POSTS = [
  {
    titre: 'Assemblée Générale Ordinaire du 3 juin 2026',
    type: 'Document AG',
    societe: '',
    datePublication: '2026-05-30',
    contenu: `
<p>L'Assemblée Générale de l'Association s'est tenue en <strong>visio-conférence le mercredi 3 juin 2026 à 10h</strong>.</p>
<p>À l'ordre du jour : rapport d'activité 2025, approbation des comptes 2025, budget 2026 et cotisation 2027, quitus au Bureau, renouvellement des membres du bureau, et rapport sur le suivi des sociétés (sorties réalisées, négociations en cours et perspectives).</p>
<p><strong>Documents :</strong></p>
<ul>
  <li><a href="/api/membres/doc?id=convocation-ago-2026" target="_blank" rel="noopener">Convocation à l'AGO du 3 juin 2026 (avec formulaire de pouvoir)</a></li>
  <li><a href="/api/membres/doc?id=rapport-suivi-2026" target="_blank" rel="noopener">Rapport de suivi des sociétés — présenté par Alain Tanneur</a></li>
  <li><a href="/api/membres/doc?id=rapport-financier-2026" target="_blank" rel="noopener">Rapport financier — présenté par Robert Deville, trésorier</a></li>
</ul>
<p>Rappel : seuls les membres à jour de leur cotisation peuvent assister et participer aux votes à l'Assemblée Générale (article 13.1 des statuts).</p>`,
  },
  {
    titre: 'Moins-values fiscales : déclaration 2025 des revenus 2024',
    type: 'Info',
    societe: '',
    datePublication: '2025-04-18',
    contenu: `
<p>Pour établir votre déclaration fiscale 2025 sur les revenus 2024, vous trouverez ci-dessous un tableau établi au 31/12/2024 recensant l'ensemble des sociétés ex-Arkéon et ETI ayant été mises en <strong>liquidation judiciaire</strong>, pouvant donc bénéficier de l'<strong>imputation des moins-values</strong> constatées, avec pour chacune le prix d'achat des titres et la date de liquidation.</p>
<p><strong>Documents :</strong></p>
<ul>
  <li><a href="/api/membres/doc?id=tableau-liquidation-2024" target="_blank" rel="noopener">Tableau des sociétés mises en liquidation judiciaire (au 31/12/2024)</a></li>
  <li><a href="/api/membres/doc?id=cerfa-2074-2024" target="_blank" rel="noopener">Formulaire Cerfa n°2074 — déclaration des plus ou moins-values réalisées en 2024</a></li>
  <li><a href="/api/membres/doc?id=cerfa-2074-notice-2024" target="_blank" rel="noopener">Notice du Cerfa 2074 (revenus 2024)</a></li>
</ul>
<p>La moins-value est imputable sur les plus-values de même nature réalisées la même année ou les 10 années suivantes. En cas de doute, rapprochez-vous de votre conseiller fiscal.</p>`,
  },
];

// ── seed ─────────────────────────────────────────────────────────────────────
const ids = (await kv.smembers('posts')) ?? [];
const existing = (await Promise.all(ids.map((id) => kv.get(`post:${id}`)))).filter(Boolean);
const now = new Date().toISOString();

for (const p of POSTS) {
  if (existing.some((e) => e.titre === p.titre)) {
    console.log(`↷ déjà présent : ${p.titre}`);
    continue;
  }
  const id = `post_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const post = { id, ...p, contenu: p.contenu.trim(), createdAt: now, updatedAt: now };
  await kv.set(`post:${id}`, post);
  await kv.sadd('posts', id);
  console.log(`✓ créé : ${p.titre} (${id})`);
}

console.log(`\nTotal posts en base : ${((await kv.smembers('posts')) ?? []).length}`);
