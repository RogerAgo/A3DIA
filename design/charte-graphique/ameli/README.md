# ameli — colorimétrie

Planche de colorimétrie pour le dossier graphique **ameli — fitness & wellness**,
avec les références Pantone à proposer au client.

| Fichier | Usage |
| --- | --- |
| `colorimetrie.html` | Source de la planche (1920 × 1080), plus une annexe technique visible à l'écran seulement |
| `colorimetrie-ameli.pdf` | Export vectoriel 16/9 (339 × 190,8 mm), texte sélectionnable — à placer dans le dossier |
| `colorimetrie-ameli.png` | Export bitmap 3840 × 2160 (2×) |
| `rapprochement-pantone.py` | Script de rapprochement Pantone (CIEDE2000), rejouable |

## Palette

### Primaires

| Couleur | Hex | Pantone | ΔE₀₀ | CMJN | RVB |
| --- | --- | --- | --- | --- | --- |
| Ivoire ameli | `#FFF9F1` | 9184 C | 2,7 | 0 / 2 / 5 / 0 | 255 / 249 / 241 |
| Bleu ameli | `#CFDEFF` | 2717 C à 65 % | 3,7 | 19 / 13 / 0 / 0 | 207 / 222 / 255 |
| Encre | `#0A0A05` | 419 C | 2,7 | 60 / 50 / 40 / 100 | 10 / 10 / 5 |

### Neutres

| Couleur | Hex | Pantone | ΔE₀₀ | CMJN | RVB |
| --- | --- | --- | --- | --- | --- |
| Greige sable | `#E7E3D8` | 9083 C | 1,4 | 3 / 4 / 9 / 7 | 231 / 227 / 216 |
| Nude terracotta | `#D0B09B` | 480 C | 2,6 | 5 / 20 / 29 / 14 | 208 / 176 / 155 |
| Taupe chaud | `#8E837D` | 409 C | 1,0 | 17 / 23 / 27 / 33 | 142 / 131 / 125 |

### Accents

| Couleur | Hex | Pantone | ΔE₀₀ | CMJN | RVB |
| --- | --- | --- | --- | --- | --- |
| Orange solaire | `#FFAF5E` | 1485 C | 1,2 | 0 / 31 / 63 / 0 | 255 / 175 / 94 |
| Pêche | `#FFC09F` | 162 C | 3,4 | 0 / 25 / 38 / 0 | 255 / 192 / 159 |
| Lilas | `#DAA7E2` | 251 C | 2,7 | 7 / 28 / 3 / 9 | 218 / 167 / 226 |

## Méthode

Les neuf valeurs sont relevées par échantillonnage direct des pages du dossier
(planche palette, moodboard, logotype, page de fin) : couleurs d'aplat majoritaires,
sans interpolation. Chaque valeur est convertie en Lab (D65) puis comparée à une
sélection de références Pantone Solid Coated par **CIEDE2000**.

Lecture du ΔE₀₀ : sous 2, l'écart n'est pas perceptible ; sous 4, il reste acceptable
en production ; au-delà de 5, il faut changer de référence ou passer par une trame.

```
python3 rapprochement-pantone.py
```

## Points d'attention

**Le bleu est le seul point dur.** Aucune encre Pantone en aplat n'atteint ce bleu à la
fois très clair et franchement violacé. Le meilleur aplat, 2707 C, reste à ΔE₀₀ 6,2 et
tire vers le cyan. Une trame à 65 % du **2717 C** ramène l'écart à 3,7 et conserve la
nuance périwinkle : c'est la solution à retenir dès qu'un tramage est possible.

**Le noir se compose.** 419 C rend fidèlement le noir du logotype. En quadrichromie, un
noir 100 % seul paraîtra délavé sur aplat : composer 60 / 50 / 40 / 100, et réserver le
100 % noir seul aux petits textes.

**Lisibilité.** Encre sur ivoire : 18,96:1. Encre sur bleu ameli : 14,69:1. Les deux
dépassent le seuil AAA. En revanche l'ivoire sur bleu tombe à 1,29:1 — sur les aplats
bleus, écrire toujours en encre, jamais en blanc, et réserver l'ivoire aux filets et
tracés. Le taupe, à 3,5:1 sur ivoire, ne convient qu'au texte de 18 px et plus.

**Hiérarchie d'emploi.** Trois primaires portent la marque. Les neutres prolongent la
photographie sans jamais dominer. Les accents restent des ponctuations : un seul par
support, sur moins d'un dixième de la surface.

## Réserves

Les valeurs CMJN sont **indicatives** (conversion sRGB → CMJN, hypothèse ISO Coated v2)
et doivent être régénérées dans le fichier PAO avec le profil réellement utilisé.
Les références Pantone sont issues des équivalences sRGB publiées du nuancier
Solid Coated : **à valider sur nuancier physique, sur le papier retenu**, avant
bon à tirer.

## Régénérer les exports

Les exports sont produits par un rendu Chromium de `colorimetrie.html` (viewport
1920 × 1080, `deviceScaleFactor: 2`, polices Google injectées hors ligne, capture du
nœud `#planche`). L'annexe technique est masquée à l'export par la feuille `@media print`.
