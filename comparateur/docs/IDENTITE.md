# Identité : nom, domaines, marques et identité visuelle (mission 6)

> Recherche **préliminaire** du 28.09.2026, non exhaustive. Elle ne remplace pas une recherche
> d'antériorité par un conseil en marques ni une validation juridique. **Aucun domaine n'a été acheté,
> aucune marque déposée, aucune société contactée.**

## 1. Nom proposé : « TesPrix »

- Lecture : « tes prix » (tutoiement, proximité) ; fonctionne en français, lisible en allemand et en italien.
- Signature proposée : « Tes courses, au bon prix, au bon endroit. »
- Nom secondaire envisagé : « LesPrix ».
- Dans le code, les paquets internes gardent le préfixe technique `@cabas/*` (sans effet pour les
  utilisateurs ; renommage possible plus tard sans risque).

## 2. Domaines (RDAP, 28.09.2026)

| Domaine | Registre | Résultat | Interprétation |
|---|---|---|---|
| tesprix.ch | rdap.nic.ch | 404 | **Non enregistré** à cette date |
| tesprix.li | rdap.nic.ch | 404 | Non enregistré |
| tes-prix.ch | rdap.nic.ch | 404 | Non enregistré |
| tesprix.com | rdap.verisign.com | 404 | Non enregistré |
| lesprix.ch | rdap.nic.ch | 404 | Non enregistré |
| lesprix.li | rdap.nic.ch | 404 | Non enregistré |
| lesprix.com | rdap.verisign.com | 200 | **Déjà enregistré** |

Contrôle : migros.ch et coop.ch répondent 200 sur le même service. La disponibilité peut changer à tout
moment ; **l'achat relève de votre décision** (coût indicatif d'un `.ch` : ~CHF 10–20 par an).

## 3. Raisons sociales et marques

| Vérification | Méthode | Résultat préliminaire |
|---|---|---|
| Société nommée « TesPrix », « Tes-Prix », « LesPrix » | Recherche web (Zefix, Moneyhouse indexés) | Aucun résultat trouvé |
| Marque « TesPrix » en Suisse | Recherche web | Aucun résultat trouvé |
| Swissreg (IPI) : marques identiques ou similaires | **Non faite automatiquement** : interface interactive | **À faire** (classes 35, 38, 42 ; éventuellement 9) |

Marques et noms **proches** repérés dans le même domaine (prix, commerce), à examiner par un conseil :

| Nom | Activité | Proximité |
|---|---|---|
| Toppreise.ch | Comparateur de prix suisse (électronique, etc.) | Même secteur ; « Preise » ≈ « prix » (sens) |
| Superprix.ch | Comparateur de prix suisse (boutiques en ligne) | Même secteur, suffixe « prix » |
| Bonprix | Distributeur de mode (groupe Otto) | Suffixe « prix », secteur commerce |
| Franprix, Monoprix | Enseignes françaises de supermarchés | Suffixe « -prix », **même secteur alimentaire** (hors Suisse) |
| Denner « Superpreis » (slogan) | Discount suisse | Sens voisin |

## 4. Risque de caractère descriptif

« Prix » est descriptif pour un comparateur de prix (LPM art. 2 let. a : signes appartenant au domaine
public). « TesPrix » combine un possessif et un terme descriptif. Le risque est que l'ensemble soit jugé
**faiblement distinctif**, donc difficile à enregistrer ou à défendre. Il est **plus fort pour « LesPrix »**
(article défini + terme générique).

Atténuations possibles :

- dépôt **figuratif** (logo + mot-symbole) plutôt que verbal seul ;
- nom de marque plus distinctif, « TesPrix » ne restant que la signature ;
- vérifier le risque de confusion avec les marques en « -prix » du commerce de détail (classe 35).

⚖️ Validation juridique séparée requise avant tout dépôt et avant l'ouverture publique.

## 5. Identité visuelle proposée (appliquée au site)

| Élément | Proposition | Mise en œuvre |
|---|---|---|
| Logo | Étiquette de prix blanche « validée » (coche) dans un carré vert aux coins arrondis : le bon prix, vérifié | `components/icons.tsx` (`LogoMark`), `public/icon.svg`, `public/icon-maskable.svg`, `app/icon.svg` |
| Mot-symbole | « Tes » en graisse moyenne + « **Prix** » en gras vert | `components/shell.tsx` |
| Couleur principale | Vert épargne `#1d7a4b` (confiance, économie) ; clair et sombre | `app/globals.css` (jetons) |
| Couleur d'accent | Brique `#b93d0c` : actions et mises en avant | idem |
| États | Jaune (indicatif), rouge (périmé, erreur), violet (démonstration) | idem |
| Typographie | Police système (rapide, lisible, sans service tiers) | — |
| Ton | Direct, factuel, sans superlatif ni promesse d'économie non vérifiable (LCD) | Textes du site |

Pas de logo d'enseigne, pas de photo de produit (droits des tiers, `docs/audit/02-juridique.md`).
