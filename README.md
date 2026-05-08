# A3DIA — Site web

Site institutionnel de l'Association de Défense des Investisseurs Arkéon.

➡️ **Pour l'inscription, le paiement et l'espace adhérent : voir [BACKEND.md](./BACKEND.md)**

## Structure
```
a3dia/
├── index.html, adhesion.html, actualites.html, contact.html
├── css/styles.css        # Toute la mise en forme
├── js/main.js            # Carrousel, menu mobile, validation
├── assets/
│   ├── images/           # Logo, hero, newsletter
│   └── icons/            # 4 icônes mission
├── README.md
└── BACKEND.md            # ⭐ Documentation backend
```

## Identité
- **Palette** : navy institutionnel (`#050b1f` → `#1a2961`), accent doré (`#c9a961`)
- **Typographie** : Inter (Google Fonts) + Helvetica Neue en fallback
- **Logo** : 3 versions dans `assets/images/` (white, dark, original)

## Lancer en local

**MAMP** : copier le dossier dans `/Applications/MAMP/htdocs/`, démarrer MAMP, ouvrir `http://localhost:8888/a3dia/`

**VS Code Live Server** : clic droit sur `index.html` → "Open with Live Server"

**Python** : `python3 -m http.server 8000` puis `http://localhost:8000`

## Déploiement
Hébergement statique : **Netlify** (drag & drop sur app.netlify.com/drop), Vercel, OVH FTP, GitHub Pages.

## À personnaliser avant production
- Email `contact@a3dia.org` (4 pages + footer)
- Numéro de téléphone (page contact)
- Lien "Connexion" dans le header
- Liens "Statuts", "Mentions légales", "Politique de confidentialité" du footer
- Brancher les formulaires sur un vrai backend (voir BACKEND.md)
