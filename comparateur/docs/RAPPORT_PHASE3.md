# TesPrix — compte rendu de la phase 3 : couverture réelle des prix, moteur de données, modèle gratuit

Date : 30.09.2026. Branche : `claude/swiss-grocery-comparison-w7bk8q` (non fusionnée, non déployée).
Chiffres : instantanés `data/prices/live/*.json` au 30.09.2026 (collectes des 28 et 30.09),
`data/quality/summary.json`, `data/benchmark/foodally-summary.json`.

## En bref

- **Deux enseignes collectées automatiquement à la source officielle** : Lidl (site public) et, nouveau,
  **Aldi Suisse (API publique utilisée par son propre site)**. 4 496 articles avec prix officiel,
  1 243 actions datées dont 339 annoncées à l'avance, 0 blocage.
- **Migros, Coop, Denner** : aucune surface first-party utilisable sans contournement (Migros, Coop) ou
  sans autorisation écrite (Denner). Ils restent couverts par des relevés communautaires rares.
- Couverture du catalogue (240 besoins) : **98 références comparables dans ≥ 2 enseignes**, 4 dans ≥ 3,
  aucune dans ≥ 4. Le plafond est fixé par l'accès à Migros, Coop et Denner, pas par la technique.
- Moteur multi-sources, contrôle de qualité, jeu de validation (76/76 paires valides) et API
  professionnelle en place. TesPrix est **gratuit pour les consommateurs** ; le financement visé est B2B.

## 1. Données

### 1.1 Prix réels par enseigne

| Enseigne | Source exacte | Niveau | Articles | Avec prix | Prix relevés | Actions (en cours / annoncées) | Fraîcheur du dernier prix |
|---|---|---|---|---|---|---|---|
| **Lidl** | `sortiment.lidl.ch` (100 pages catégories, 3 167 fiches du plan du site `sitemaps/fr.xml`) et `www.lidl.ch` (11 pages d'actions) | officiel | 3 429 | 3 012 | 4 215 | 531 (287 / 244) | 1 207 < 24 h ; 1 805 entre 2 et 7 j (rotation des fiches) |
| **Aldi Suisse** | `api.aldi-suisse.ch/v3/product-search` (liste paginée, 42 pages de 60) | officiel | 1 901 | 1 484 | 2 954 | 712 (609 / 95) ; 8 closes | 1 477 < 24 h ; 7 < 7 j |
| Migros | Open Prices (`prices.openfoodfacts.org/api/v1`, ODbL) | communautaire | 109 | 109 | 113 | — | 1 < 7 j ; 47 encore utilisables (< 90 j) |
| Coop | Open Prices | communautaire | 85 | 85 | 100 | — | 25 utilisables, aucun < 7 j |
| Denner | Open Prices | communautaire | 12 | 12 | 12 | — | 4 utilisables |
| Lidl, Aldi, OTTO'S | Open Prices | communautaire | 12 / 3 / 1 | 12 / 3 / 1 | 16 | — | anciens |
| Action, Aligro | — | — | 0 | 0 | 0 | — | — |

Méthode d'accès :

| Source | Accès | Volume quotidien (30.09) |
|---|---|---|
| Lidl | Pages HTML publiques ; `robots.txt` respecté ; fiches produits en rotation de 7 tranches (~460 par jour) ; pages catégories et actions chaque jour | ≈ 530 requêtes |
| Aldi | JSON public consommé par le site : `currency=CHF&serviceType=walk-in&limit=60&offset=N` (paramètres du site, prix en magasin) ; **recherche plein texte, fiches et magasins refusés (403) : jamais utilisés** | 43 requêtes |
| Open Prices | API publique ODbL | quelques requêtes |
| **Total** | Robot identifié (`TesPrixBot`), 3 s minimum par hôte, arrêt au premier refus, archives 30 jours | **581 requêtes, 93 Mo, 0 blocage** |

Contrôles à la collecte : prix de base publié comparé au prix calculé (rejet > 35 %), conditionnement
illisible = article écarté (jamais deviné), actions « au lieu de » séparées du prix normal, action à fin
présumée close automatiquement quand le même prix revient comme prix normal.

### 1.2 Ensemble du moteur

| Indicateur | Valeur |
|---|---|
| Observations de prix exploitables | 8 653 (officielles 8 412, communautaires 241) |
| Fraîcheur (dernier prix utilisable par article) | 3 182 < 24 h · 0 entre 24 et 48 h (pas de collecte le 29.09) · 1 886 < 7 j · 76 plus anciens |
| Correspondances revues article ↔ référence | 449 |
| Alertes de qualité (30.09) | 0 prix suspect, 0 variation anormale, 0 contenance incohérente, 0 doublon, 0 divergence, 0 action lue comme prix normal, 0 connecteur en panne, **18 relevés communautaires anciens** |
| Jeu de validation (50 essentiels × 5 enseignes) | 76/76 paires attendues valides (Lidl 45, Aldi 31) ; Migros, Coop, Denner : aucune donnée à valider |

### 1.3 FoodAlly (référence tierce, comparaison uniquement)

50 requêtes anonymes (une par essentiel, quota gratuit de 100/jour), aucune donnée affichée ni
intégrée, résultats bruts hors dépôt, attribution conservée.

| Enseigne | Essentiels trouvés chez FoodAlly | Couverts par TesPrix (officiel) | Comparés | Écart médian | ≤ 5 % | > 20 % |
|---|---|---|---|---|---|---|
| Migros | 30 | 0 | — | — | — | — |
| Coop | 37 | 0 | — | — | — | — |
| Lidl | 27 | 45 | 26 | 0 % | 19 | 5 |
| Aldi | 29 | 31 | 18 | 0 % | 10 | 7 |
| Denner | 14 | 0 | — | — | — | — |

Même article = même prix (écart médian nul). Les écarts > 20 % viennent d'articles différents (marque,
format) ou d'articles Aldi sans contenance publiée. TesPrix couvre mieux Lidl et Aldi que FoodAlly sur
les essentiels ; FoodAlly couvre Migros, Coop et Denner, que TesPrix ne peut pas collecter.

## 2. Couverture (catalogue de 240 besoins de base)

| Comparables dans | Références | Part |
|---|---|---|
| ≥ 2 enseignes | **98** | 41 % |
| ≥ 3 enseignes | **4** (penne 500 g et fusilli 500 g : Aldi, Coop, Lidl ; Nutella 450 g et chips nature 175 g : Aldi, Lidl, Migros) | 2 % |
| ≥ 4 enseignes | **0** | 0 % |
| 5 enseignes | **0** | 0 % |

| Par enseigne | Références couvertes | Dont source officielle |
|---|---|---|
| Lidl | 194 (81 %) | 194 |
| Aldi | 106 (44 %) | 106 |
| Migros | 2 | 0 |
| Coop | 2 | 0 |
| Denner | 0 | 0 |

| Priorité | Taille | Comparables dans ≥ 2 enseignes |
|---|---|---|
| P1 essentiels | 50 | 30 |
| P2 courants | 121 | 49 |
| P3 occasionnels | 69 | 19 |

Une référence n'est comptée couverte que si une correspondance **revue** respecte ses exigences (bio,
origine suisse, AOP, marque, dimension) et dispose d'un prix utilisable. Aldi est limité par 415 articles
sans contenance publiée dans la liste (spaghetti, farine, sel…) : ils sont écartés plutôt que devinés.

Exemple réel (Lausanne, 14 articles, courses planifiées le 01.10.2026) : Lidl seul CHF 40.92, Aldi seul
CHF 42.99, **combinaison Aldi + Lidl CHF 34.63** (économie de CHF 6.29 sur le meilleur magasin unique),
toutes les lignes couvertes ; prix affichés « indicatifs » car la date est future.

**Pour atteindre 4 ou 5 enseignes**, il faut Migros, Coop et Denner. Les trois voies conformes sont
documentées (`DATA_SURFACES.md` §9) : accord écrit, licence FoodAlly (repli signalé, implémenté et
désactivé), tickets de caisse des utilisateurs (implémenté, envoi fermé).

## 3. Technique

### 3.1 Points d'accès first-party publics

| Point d'accès | Données | Limites | Stabilité attendue |
|---|---|---|---|
| `GET api.aldi-suisse.ch/v3/product-search` (`limit` ∈ {12…60}, `offset` ≤ 9 999) | Article, marque, contenance, prix en magasin, prix de base, « au lieu de », réduction, date de mise en vente, catégories, badges (bio, Suisse) | Prix national uniquement ; pas de code-barres ; contenance absente pour ~415 articles ; recherche, fiches et magasins refusés | **Moyenne** : API versionnée consommée par le site, peut changer ou être protégée sans préavis |
| `sortiment.lidl.ch` : pages catégories et fiches `/fr/catalog/product/view/id/N` du plan du site | Article, n° d'article, contenance, prix, prix de base, badges | Fiches rafraîchies tous les 7 jours (catégories chaque jour) ; pas de code-barres ; HTML à analyser | **Moyenne à bonne** : structure stable depuis la phase 2, mais tout changement de gabarit casse l'analyse |
| `www.lidl.ch` pages d'actions (`data-grid-data`) | Actions datées, futures, régionales, Lidl Plus | Texte régional libre | Moyenne |

Refusés et non contournés : Migros (403 sur tout `www.migros.ch`), Coop (défi DataDome dès
`robots.txt`), Aldi (recherche `q=`, fiches, magasins : 403). Denner : accessible mais conditions
interdisant l'usage commercial sans autorisation écrite, aucun connecteur écrit.

Détection des pannes (au plus un jour) : alerte « connecteur en panne » après 48 h, rendement par page
et baisse de couverture à la collecte, jeu de validation quotidien (`daily` lance `data-report` et
`validate`), tableau `/admin/qualite`. En cas de refus, le connecteur s'arrête ; `ALDI_API=off` ou
`LIDL_WEB=off` coupent la source sans effet sur les autres.

### 3.2 Ce qui a été construit

| Élément | Fichiers |
|---|---|
| Connecteur Aldi (API publique), fiches Lidl en rotation | `packages/connectors/src/aldi.ts`, `lidl.ts` |
| Connecteur FoodAlly (MCP public, quota, 402, attribution), repli désactivé | `packages/connectors/src/foodally.ts` |
| Hiérarchie des sources, confiance, divergences > 15 %, alternatives conservées | `packages/core/src/sources.ts`, `pricing.ts` |
| Observation enrichie, couverture, fraîcheur, alertes de qualité | `packages/core/src/data-engine.ts`, `/admin/qualite` |
| Catalogue 240 besoins (P1/P2/P3), jeu de validation, tests de non-régression | `packages/reference`, `data/validation/essentials.json`, `validation.ts` |
| Tickets de caisse : nettoyage des données personnelles dans le navigateur, lecture, observations anonymes | `packages/core/src/receipts.ts`, `/fr/ticket`, `docs/TICKETS.md` |
| API professionnelle (`observations`, `coverage`, `basket-index`), clés hachées, fermée par défaut | `packages/core/src/b2b.ts`, `apps/web/src/app/api/b2b/v1` |
| Offre unique gratuite | `packages/core/src/entitlements.ts` |

Tests : 171 unitaires, 7 d'intégration PostgreSQL, 8 parcours navigateur publics, 2 d'administration.

## 4. Modèle économique (hypothèses, CHF par mois, détail : `BUSINESS_MODEL_V2.md`)

Principes : gratuit pour les consommateurs ; aucune vente de données personnelles (identité, adresse,
position précise, paniers ou habitudes individuels) ; aucune offre commerciale n'influence prix,
classement, comparaison, itinéraire ou recommandation.

### 4.1 Modèles B2B les plus crédibles

1. **Widget / marque blanche** (99 et 1 500) : vend notre calcul (panier, trajet, détours), pas des prix
   bruts ; risque juridique le plus faible ; clients : sites de recettes, médias, assureurs, banques.
2. **Intelligence discounters** (990) : positionnement prix, fréquence et profondeur des actions, actions
   annoncées de la semaine suivante chez Lidl et Aldi ; clients : marques, category managers.
3. **API de données** (Starter 149, Pro 490) : médias, chercheurs ; concurrence directe de FoodAlly
   (19 enseignes) ; crédible seulement sur nos spécificités (actions futures, prix en magasin, confiance).
4. Sponsoring : emplacement « Partenaire » séparé des résultats ; 0 dans les hypothèses.

### 4.2 Coûts

| | Bas | Central | Haut |
|---|---|---|---|
| Technique, collecte, données tierces (licence FoodAlly **non souscrite**), avis juridique amorti, comptabilité | 188 | **518** | 1 314 |
| Avec temps de l'exploitant (`40 h × 80`) | | **3 718** | |

### 4.3 Revenus au mois 24

`R = Σ nᵢ × pᵢ × (1 − 0,03)`

| Scénario | Clients | Brut | Net |
|---|---|---|---|
| Pessimiste | 1 widget | 99 | 96 |
| Central | 3 Starter, 1 Pro, 1 Intelligence, 4 widgets | 2 323 | 2 253 |
| Optimiste | 6 Starter, 3 Pro, 3 Intelligence, 10 widgets, 1 marque blanche | 7 824 | 7 589 |

### 4.4 Seuil de financement du service gratuit

`N_min = ⌈ C / (p × 0,97) ⌉`

| Coût couvert | Clients nécessaires (un seul type) |
|---|---|
| 518 (hors temps de l'exploitant) | 1 Intelligence, ou 2 Pro, ou 4 Starter, ou 6 widgets |
| 3 718 (avec temps de l'exploitant) | 4 Intelligence, ou 8 Pro, ou 26 Starter |

Le scénario central couvre les coûts d'exploitation, pas le temps de l'exploitant. Condition préalable à
toute vente de données brutes : **avis juridique** sur la réutilisation commerciale des prix collectés.

## 5. Décisions qui vous reviennent (rien n'a été engagé)

1. **Accords Migros, Coop, Denner** : seule voie vers une couverture de 4 à 5 enseignes ; aucun contact
   pris (modèle de demande : `audit/02-juridique.md` §8).
2. **Licence FoodAlly** (Pro dès 49, Business dès 499/mois) pour un repli signalé : non souscrite.
3. **Avis juridique** : collecte Lidl, portée de la clause « fins privées » d'Aldi, revente B2B, ODbL.
4. **Tickets de caisse** : politique de confidentialité à valider avant d'ouvrir l'envoi.
5. **Premiers clients B2B**, tarifs définitifs, prestataire de facturation.
6. **Hébergement** et planification de `pnpm job daily` : sans collecte quotidienne, la fraîcheur se
   dégrade (Lidl < 7 j, Aldi < 24 h aujourd'hui).

## 6. Engagements respectés

Aucun CAPTCHA, aucune authentification ni aucun contrôle d'accès contourné ; robot identifié ; arrêt au
premier refus ; aucune donnée ni code copié de FoodAlly, zzd ou Rappn ; aucune donnée FoodAlly mélangée
aux prix affichés ; aucun achat, abonnement ni contact ; aucune fusion ni mise en production ;
StayReady non modifié ; mode démonstration séparé ; aucun prix futur présenté comme confirmé.
