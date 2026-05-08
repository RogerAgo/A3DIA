# Backend & Inscription — Guide technique A3DIA

Ce document explique **comment brancher les formulaires du site sur un vrai backend**, avec un focus sur le flux critique : l'adhésion à 50 €/an.

Trois besoins distincts :

1. **Formulaire contact** — envoyer un message à l'association
2. **Newsletter** — collecter des emails
3. **Adhésion (le gros morceau)** — collecter les infos + encaisser 50 €/an + créer un compte adhérent

Pour chacun, je vais de la solution la plus simple (zéro code, payable en 1 jour) à la plus complète (intégration sur-mesure, plusieurs jours/semaines de dev).

---

## 🟢 Niveau 1 — Solutions sans code (MVP, 1 jour)

Adapté pour démarrer rapidement. Aucun serveur à gérer, aucune base de données. Vous restez sur de l'hébergement statique (Netlify, Vercel, OVH mutualisé, n'importe quoi).

### Formulaire contact + Newsletter → Formspree

**[Formspree](https://formspree.io)** intercepte les soumissions de vos formulaires HTML et vous les envoie par email.

**Plan gratuit** : 50 soumissions/mois. **Plan Bronze** : 9 $/mois pour 150 soumissions, suffisant pour une asso.

Modification à apporter à votre HTML (1 ligne) :

```html
<!-- Avant -->
<form data-form="contact" novalidate>

<!-- Après -->
<form action="https://formspree.io/f/VOTRE_ID" method="POST">
```

C'est tout. Vous recevez chaque message dans votre inbox, plus une vue admin sur formspree.io.

**Alternatives équivalentes** : [Getform](https://getform.io), [Basin](https://usebasin.com), [Web3Forms](https://web3forms.com) (gratuit illimité avec leur logo en bas).

### Adhésion 50 € → Stripe Payment Link

**[Stripe Payment Links](https://stripe.com/payments/payment-links)** vous donne une URL de paiement clé-en-main, hébergée par Stripe.

1. Créez un compte Stripe (gratuit)
2. Créez un produit "Adhésion A3DIA" à 50 €/an, abonnement annuel
3. Stripe vous donne une URL du type `https://buy.stripe.com/xxxxxxx`
4. Le bouton "Valider l'inscription" devient un simple lien vers cette URL

**Avantages** :
- Stripe encaisse, gère les renouvellements automatiques, envoie les factures, gère la TVA
- Rétrofacturation/SEPA/CB tout inclus
- Frais : **1,4 % + 0,25 €** par transaction CB EU (soit ~0,95 € sur 50 €)
- Vous voyez tous les adhérents dans votre dashboard Stripe

**Limite** : Stripe ne stocke pas les champs personnalisés du formulaire (adresse, téléphone, civilité). Pour ça, deux options :

**Option A** — Faire collecter les coordonnées par Stripe lui-même (champs adresse/téléphone activables dans le Payment Link).

**Option B** — Demander le formulaire d'abord, puis rediriger vers Stripe avec les infos pré-remplies via les paramètres URL :
```
https://buy.stripe.com/xxxxxxx?prefilled_email=user@example.com
```
Et envoyer en parallèle les infos détaillées via Formspree à l'association.

**Webhooks Stripe** (intermédiaire) : si vous voulez réagir automatiquement à un paiement réussi (ex. envoyer un email de bienvenue, créer un compte), Stripe peut appeler une URL de votre serveur. Mais là on commence à sortir du "sans code".

---

## 🟡 Niveau 2 — Solution managée (CMS + paiement, 1 semaine)

Si vous voulez un vrai espace adhérent avec connexion, accès aux documents, renouvellement, sans gérer de serveur.

### Recommandation : **HelloAsso** (gratuit, conçu pour les associations)

**[HelloAsso](https://www.helloasso.com)** est une plateforme française dédiée aux associations loi 1901.

- **Gratuit pour l'association** (pas de commission, juste un pourboire optionnel demandé au donateur)
- Adhésions, dons, billetterie, boutique
- Génère automatiquement les reçus fiscaux et attestations d'adhésion
- Espace adhérent intégré
- Export Excel des adhérents
- Conforme RGPD, hébergement français

Sur votre site, le bouton "Adhérer" pointerait vers `https://www.helloasso.com/associations/a3dia/adhesions/...`

C'est probablement **la solution idéale pour A3DIA** : zéro frais, zéro maintenance technique, et c'est conçu exactement pour votre cas d'usage.

### Alternative : **AssoConnect**

[AssoConnect](https://www.assoconnect.com) est plus complet (CRM adhérents, comptabilité asso, mailings) mais payant à partir de 19 €/mois HT pour 100 adhérents.

---

## 🔴 Niveau 3 — Backend sur-mesure (3-6 semaines de dev)

Si vous voulez une intégration totale, espace adhérent dans votre charte, contrôle complet des données. Recommandé seulement si vous prévoyez de faire évoluer significativement le site.

### Stack recommandée

```
Frontend (votre site actuel)
        │
        ▼
   API Node.js (Express ou Fastify) ou PHP (Symfony, Laravel)
        │
        ├──→ PostgreSQL (adhérents, cotisations, sessions)
        ├──→ Stripe API (paiements + webhooks)
        ├──→ SendGrid / Brevo (emails transactionnels)
        └──→ S3 / Backblaze (documents PDF des AG)

Hébergement : Render / Railway / OVH VPS (~10 €/mois)
```

### Schéma de base de données minimal

```sql
-- Table adhérents
CREATE TABLE adherents (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,    -- bcrypt
  civilite        VARCHAR(10),              -- 'Mr' | 'Mme'
  prenom          VARCHAR(100) NOT NULL,
  nom             VARCHAR(100) NOT NULL,
  societe         VARCHAR(200),
  adresse         TEXT NOT NULL,
  code_postal     VARCHAR(10) NOT NULL,
  ville           VARCHAR(100) NOT NULL,
  tel_fixe        VARCHAR(20),
  tel_mobile      VARCHAR(20) NOT NULL,
  rgpd_accept     BOOLEAN DEFAULT FALSE,
  date_inscription TIMESTAMP DEFAULT NOW(),
  date_derniere_connexion TIMESTAMP,
  actif           BOOLEAN DEFAULT TRUE
);

-- Table cotisations (historique des paiements)
CREATE TABLE cotisations (
  id                SERIAL PRIMARY KEY,
  adherent_id       INTEGER REFERENCES adherents(id),
  annee             INTEGER NOT NULL,         -- 2026, 2027...
  montant_centimes  INTEGER NOT NULL,         -- 5000 = 50,00 €
  stripe_payment_id VARCHAR(255),             -- pour réconciliation
  stripe_invoice_id VARCHAR(255),
  statut            VARCHAR(20) NOT NULL,     -- 'pending' | 'paid' | 'failed' | 'refunded'
  date_paiement     TIMESTAMP,
  UNIQUE(adherent_id, annee)
);

-- Table documents (PDFs accessibles aux adhérents)
CREATE TABLE documents (
  id              SERIAL PRIMARY KEY,
  titre           VARCHAR(255) NOT NULL,
  description     TEXT,
  societe         VARCHAR(200),               -- ex. 'MAGILLEM'
  type_doc        VARCHAR(50),                -- 'AG' | 'Communiqué' | 'OPA'
  fichier_url     VARCHAR(500) NOT NULL,
  date_publication DATE NOT NULL,
  reserve_adherents BOOLEAN DEFAULT TRUE
);

-- Table sessions (pour login)
CREATE TABLE sessions (
  token         VARCHAR(64) PRIMARY KEY,
  adherent_id   INTEGER REFERENCES adherents(id),
  expires_at    TIMESTAMP NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);
```

### Endpoints API minimum

```
POST   /api/inscription           Créer un adhérent + initier paiement Stripe
POST   /api/login                  Authentifier (renvoie un cookie de session)
POST   /api/logout                 Détruire la session
GET    /api/me                     Profil de l'adhérent connecté
POST   /api/me/password-reset      Demande de reset mot de passe
POST   /api/cotisation/renew       Renouveler la cotisation année N+1

GET    /api/documents              Liste des documents (filtrable par société/type)
GET    /api/documents/:id/download URL signée pour télécharger un PDF

POST   /api/contact                Formulaire de contact public
POST   /api/newsletter             Inscription newsletter publique

POST   /api/webhooks/stripe        Webhook appelé par Stripe (paiement réussi/échoué)
```

### Flux d'inscription complet (parcours utilisateur)

```
1. L'utilisateur remplit le formulaire d'adhésion sur /adhesion.html
2. Le frontend envoie POST /api/inscription { ...données }
3. Le backend :
   a. Valide les données (email valide, code postal sur 5 chiffres, etc.)
   b. Vérifie que l'email n'existe pas déjà
   c. Crée l'adhérent en base avec actif=false
   d. Crée une session de paiement Stripe (Checkout Session)
   e. Retourne l'URL de paiement
4. Le frontend redirige l'utilisateur vers Stripe
5. L'utilisateur paie 50 € sur Stripe (CB, SEPA, Apple Pay…)
6. Stripe redirige vers /adhesion-success.html
7. EN PARALLÈLE : Stripe appelle POST /api/webhooks/stripe
   a. Le backend valide la signature du webhook (sécurité critique)
   b. Marque la cotisation comme 'paid'
   c. Active l'adhérent (actif=true)
   d. Envoie l'email de bienvenue avec lien de création de mot de passe
8. L'adhérent reçoit l'email, crée son mot de passe, peut se connecter
```

### Sécurité — points critiques

- **Hashage des mots de passe** : bcrypt (coût ≥ 10) ou Argon2id, jamais en clair
- **Sessions** : cookies `HttpOnly`, `Secure`, `SameSite=Lax`
- **HTTPS obligatoire** partout (Let's Encrypt = gratuit)
- **Validation côté serveur** : ne jamais faire confiance aux données du formulaire, tout revalider
- **Rate limiting** sur `/api/login` (max 5 tentatives / 15 min) pour bloquer le brute-force
- **CSRF protection** sur les endpoints qui modifient (POST/PUT/DELETE)
- **Webhooks Stripe** : valider la signature avec votre clé secrète
- **Logs et alertes** : monitorer les échecs de paiement, les erreurs serveur (Sentry par exemple, gratuit jusqu'à 5k événements/mois)

### RGPD — obligations

- **Mention CNIL** dans le formulaire (déjà présente : "vous disposez d'un droit d'accès…")
- **Politique de confidentialité** accessible (lien footer)
- **Registre des traitements** à tenir en interne (CNIL fournit un modèle gratuit)
- **Durée de conservation** : adhérents inactifs supprimés au bout de 3 ans après dernière cotisation
- **Bouton "supprimer mon compte"** dans l'espace adhérent
- **Consentement explicite** pour la newsletter (case décochée par défaut)

---

## 💡 Recommandation pour A3DIA

Vu le profil de l'association (asso loi 1901, ~quelques centaines d'adhérents probablement, bénévoles aux manettes), je recommande **clairement** l'approche suivante :

| Besoin | Solution |
|---|---|
| Formulaire contact | Formspree (plan Bronze 9$/mois) |
| Newsletter | Brevo (gratuit jusqu'à 300 emails/jour) |
| **Adhésion + cotisation** | **HelloAsso** (gratuit, conçu pour les assos) |
| Documents AG | Drive partagé ou WordPress simple si besoin de gestion |
| Espace adhérent | HelloAsso intègre ça nativement |

**Coût total mensuel** : ~10 € (juste Formspree). Tout le reste est gratuit.

**Délai de mise en place** : 1 semaine, sans dev.

**Évolutivité** : si l'asso grandit ou veut une expérience sur-mesure dans 1-2 ans, on migre vers le Niveau 3.

---

## 📞 Pour aller plus loin

- HelloAsso : <https://www.helloasso.com/associations-creer-un-compte>
- Stripe (si HelloAsso ne convient pas) : <https://stripe.com/fr>
- Documentation CNIL pour les associations : <https://www.cnil.fr/fr/les-associations>
- Brevo (ex-Sendinblue) pour newsletter : <https://www.brevo.com/fr/>

Pour toute question technique ou si vous souhaitez que je vous aide à configurer une de ces solutions, n'hésitez pas.
