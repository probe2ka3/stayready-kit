# Sources de prix réels — recherche et décisions (phase 2)

> Relevés techniques effectués les 27 et 28.09.2026 depuis l'environnement de développement,
> avec un agent HTTP identifié (`TesPrixBot/0.1`), sans contournement d'aucune protection.
> Ce document complète `01-enseignes.md` (audit des enseignes) et `02-juridique.md` (cadre légal).
> Légende : ✅ exploitable · 🟡 exploitable avec réserves · 📄 autorisation contractuelle nécessaire ·
> ⛔ bloqué techniquement · ⚖️ validation juridique recommandée.

## 1. Synthèse

| Enseigne | Source retenue | Nature du prix | Fraîcheur | Statut |
|---|---|---|---|---|
| **Lidl** | Site officiel : assortiment permanent `sortiment.lidl.ch` + actions datées `www.lidl.ch` | Prix national en magasin, actions avec dates de début/fin, portée régionale et Lidl Plus | Quotidienne (collecte automatique) | ✅ ⚖️ |
| **Migros** | Open Prices (relevés communautaires avec justificatif) | Prix constaté dans une succursale (ticket ou étiquette) | Variable (quelques dizaines de relevés/mois) | 🟡 indicatif |
| **Coop** | Open Prices | idem | idem (faible) | 🟡 indicatif |
| **Denner** | Open Prices | idem | idem (très faible) | 🟡 indicatif · 📄 site officiel |
| **Aldi Suisse** | Open Prices | idem (aucun relevé récent) | — | 🟡 · ⛔ site officiel |
| **OTTO'S** | Open Prices (2 relevés) | idem | — | 🟡 · site officiel non exploité (voir §4.6) |
| **Action** | — | — | — | assortiment alimentaire marginal, non prioritaire |
| **Aligro** | Open Prices (5 relevés, 2025) | idem | — | 🟡 · site officiel non exploité (voir §4.8) |

Conséquence : **Lidl est la seule enseigne dont les prix officiels sont collectés automatiquement**.
Les autres enseignes ne sont couvertes que par des relevés communautaires, publiés sous licence
ouverte, à faible volume et affichés comme « indicatifs ». Tout élargissement fiable passe par un
**accord avec les enseignes** (§7).

## 2. Référence de marché : preise.zzd.ch (« Schnäppchen Jäger »)

Étude des pages publiques (à propos, tarifs, conditions, comparatif Profital), sans reprise de
données, de code ni de contenus.

- **Exploitant** : entreprise individuelle (Aarau), selon ses mentions légales.
- **Couverture déclarée** : Migros, Coop, Lidl, Aldi, Denner. Environ 21 700 produits au 07.09.2026,
  dont Migros 14 730, Lidl 2 767, Coop 2 279, Aldi 1 746, Denner 214.
- **Provenance déclarée** : prix « collectés automatiquement » sur les sites des enseignes, relus
  chaque nuit. Ce sont les **prix en ligne nationaux, pas l'étiquette de la succursale**, avec un
  contrôle de plausibilité du prix au kilo ou au litre.
- **Modèle** : gratuit limité (5 recherches/jour sans compte, 20 avec compte + 1 liste de 5 articles) ;
  abonnement CHF 2/mois ou CHF 20/an (Stripe) ; ni publicité ni affiliation.
- **Absent** : succursales, horaires, itinéraires, optimisation multi-magasins, planification à date,
  cartes de fidélité, application mobile.
- **Conditions** : l'exploitant interdit la collecte automatisée de son propre site ; `robots.txt`
  exclut `/api/`. Nous ne l'utilisons donc pas comme source.

Enseignement : collecter la nuit sur les sites officiels est techniquement faisable pour
Migros, Coop et Aldi. Nous ne le reproduisons pas pour ces trois enseignes, car leurs sites opposent
une protection anti-robot ou des conditions d'utilisation restrictives (§4). TesPrix se distingue par
les prix en magasin datés, les succursales, l'itinéraire et la planification.

## 3. Open Prices (Open Food Facts)

### 3.1 Constats (API `https://prices.openfoodfacts.org/api/v1`, 28.09.2026)

| Mesure | Valeur |
|---|---|
| Lieux suisses référencés | 192 (lieux OpenStreetMap, coordonnées au point près) |
| Prix suisses | **942** (933 en CHF ; 938 par code-barres, 4 par catégorie) |
| Contributeurs | 120 comptes distincts |
| Justificatifs | 522 photos d'étiquette, 420 tickets de caisse |
| Années | 2023 : 1 · 2024 : 100 · 2025 : 623 · 2026 : 216 |
| Prix remisés | 77 (dont 13 « SALE », 4 « date courte ») |

Par enseigne du périmètre (tous âges / moins d'un an / 90 derniers jours / 30 derniers jours) :

| Enseigne | Total | < 1 an | < 90 j | < 30 j | Dernier relevé |
|---|---|---|---|---|---|
| Migros | 470 | 141 | 67 | 43 | 25.09.2026 |
| Coop | 221 | 117 | 35 | 1 | 08.09.2026 |
| Lidl | 45 | 12 | 1 | 0 | 30.07.2026 |
| Denner | 42 | 15 | 12 | 0 | 19.08.2026 |
| Aldi | 34 | 3 | 0 | 0 | 06.11.2025 |
| Aligro | 5 | 0 | 0 | 0 | 23.06.2025 |
| OTTO'S | 2 | 2 | 1 | 0 | 19.08.2026 |
| Action | 0 | — | — | — | — |

- **Géographie** : relevés concentrés sur quelques succursales (Morat, Neuchâtel, La Chaux-de-Fonds,
  Genève, Thalwil). Sur 90 jours, 42 des 67 relevés Migros viennent d'une même succursale (Morat).
- **Recoupement** : 662 codes-barres distincts pour les enseignes du périmètre, dont **8 seulement**
  observés dans au moins deux enseignes (tous Migros/Coop, marques nationales).
- **Accès automatisé** : API publique documentée (OpenAPI 3), sans clé pour la lecture, pagination
  (`page`, `size` ≤ 100), filtres `location_id__in`, `date__gte`, `product_code`. Le connecteur
  s'identifie par son agent HTTP et limite son débit.

### 3.2 Licence et obligations

- **Données : ODbL 1.0** (code de l'API : AGPL-3.0, sans incidence sur la réutilisation des données).
  La réutilisation **commerciale est permise**.
- **Attribution** : mention visible « Prix communautaires : Open Prices (Open Food Facts),
  licence ODbL » avec liens, sur chaque écran qui affiche ces prix (fait : page Sources et badge
  sur les prix concernés).
- **Partage à l'identique** : si nous utilisons publiquement une **base dérivée** (données Open Prices
  modifiées ou fusionnées), nous devons proposer cette base dérivée sous ODbL (art. 4.4 et 4.6).
  **Mesures pour ne pas contaminer les données propriétaires** :
  1. Chaque prix porte sa licence (`license = 'ODbL-1.0'`) et sa référence d'origine.
  2. Les prix Open Prices ne sont **jamais fusionnés** avec ceux d'une autre source : ce sont des
     observations distinctes, rattachées à des articles « code-barres » propres à cette source.
  3. Seules des données **déjà publiques** (codes-barres, prix, dates, lieux) sont croisées avec notre
     catalogue. La table de correspondances qui en découle pourra être publiée sous ODbL sans
     inconvénient : l'export `pnpm job export-odbl` est prévu à cet effet.
  4. Les prix obtenus sous accord avec une enseigne restent dans des enregistrements séparés,
     avec leur propre licence. La base de TesPrix est alors une « base collective » au sens de l'ODbL
     (art. 1), où seule la partie ODbL est soumise au partage.
- ⚖️ À faire valider : qualification « base collective » contre « base dérivée » de l'ensemble
  (catalogue + correspondances + prix Open Prices).

### 3.3 Décision

Open Prices est **intégré** (connecteur `open-prices`) comme source **communautaire et
indicative** : elle est réelle, justifiée et datée, mais clairsemée. Le prix relevé dans une
succursale est appliqué :

- à la **zone tarifaire** pour Migros (coopérative régionale de la succursale observée) ;
- au **niveau national** pour les enseignes à prix nationaux (Coop, Denner, Aldi, Lidl, OTTO'S),

toujours avec le statut « indicatif », la date et le lieu du relevé. Au-delà de 90 jours, le prix
est « périmé » et exclu par défaut. Les prix remisés ne sont retenus que si le prix non remisé est
indiqué.

### 3.4 Open Food Facts (données produits)

La base produits Open Food Facts (ODbL ; photos CC BY-SA) sert à **décrire** un code-barres :
nom, marque, quantité, catégories, labels bio. **Elle ne contient aucun prix.** Les fiches produits
incluses dans les réponses Open Prices suffisent au rapprochement avec le catalogue. Aucune photo
n'est reprise.

## 4. Enseignes : sources officielles examinées

### 4.1 Lidl ✅ ⚖️

| Élément | Constat |
|---|---|
| `sortiment.lidl.ch` (assortiment permanent, ~3 000 articles selon Lidl) | Pages catégories en HTML serveur (Magento) : nom, prix TTC, conditionnement, prix de base (« les 185g \| 100g = 2,16 CHF »), numéro d'article, mention « Aktion », badges (« Qualité suisse », bio). |
| `robots.txt` de `sortiment.lidl.ch` | `Disallow: /*?` (donc **pas de pagination** `?p=2`), `/catalog/`, `/checkout/`… Les pages catégories et sous-catégories sans paramètre sont autorisées. Le plan du site liste 105 catégories et 3 171 fiches. |
| Fiches produits | Chemin `/fr/catalog/product/view/id/N` : techniquement non couvert par `Disallow: /catalog/`, mais sans information supplémentaire (ni code-barres). **Non collectées**, par prudence et par économie. |
| `www.lidl.ch` (actions) | Pages d'actions `/c/fr-CH/<thème>/a<id>` : données structurées par article (`data-grid-data`) avec prix, **prix « au lieu de »**, **dates de début et de fin** (fuseau Europe/Zurich), actions **à venir** (« 1.10. – 7.10. »), variantes **Lidl Plus**, portée régionale dans le titre (« valable uniquement au Tessin »), catégorie Food/Non-food. |
| `robots.txt` de `www.lidl.ch` | Autorise `/c/` ; interdit la recherche et les chemins `/1*`…`/9*`. |
| Conditions | Mentions légales : aucune clause interdisant la consultation automatisée. Lidl se réserve les droits d'auteur sur les contenus : **nous ne reprenons ni photos ni textes descriptifs**, uniquement des faits (désignation, format, prix, dates, numéro d'article). |
| Prix | Prix en magasin, identiques dans toute la Suisse, sauf actions régionales signalées. « Offres valables dans la limite des stocks disponibles ». |

**Limite** : sans pagination, seule la première page de chaque catégorie est lisible (18 articles).
Les sous-catégories étant fines, la couverture reste utile (voir `docs/STATUT.md` pour les chiffres
de la dernière collecte). Une couverture complète passe par une autorisation ou un flux de Lidl.

### 4.2 Migros 📄 ⛔

- `www.migros.ch` : **403** pour un robot identifié (plan du site compris) ; `robots.txt` interdit
  en outre `*/promotion/` et `*/offers/…`.
- Mentions légales du groupe Migros (reprises par Denner) : « la reproduction totale ou partielle,
  la transmission […] ou l'utilisation du portail à des fins publiques ou commerciales sont
  interdites sans autorisation écrite préalable » (texte vu via moteur de recherche, la page étant
  protégée).
- Aucune API publique (confirmé par la communauté Migipedia).
- **Blocage** : autorisation écrite de la Fédération des coopératives Migros nécessaire.

### 4.3 Coop 📄 ⛔

- `www.coop.ch` : protection anti-robot (défi JavaScript/captcha) dès `robots.txt`.
- Aucune API publique. **Blocage** : accord avec Coop nécessaire.

### 4.4 Aldi Suisse ✅ ⚖️ (mis à jour en phase 3)

- `www.aldi-suisse.ch` : pages catégories, fiches et `robots.txt` en **403** (réseau de diffusion).
- **Phase 3** : l'API publique consommée par le site (`api.aldi-suisse.ch/v3/product-search`, `robots.txt`
  absent) est accessible et complète (prix en magasin, actions annoncées) : connecteur `aldi-api`.
  Détails, refus rencontrés et clause des conditions d'utilisation : `docs/DATA_SURFACES.md` §3.

### 4.5 Denner 📄

- Techniquement accessible. `robots.txt` permissif. Pages « Actions » en HTML serveur, avec prix
  et « au lieu de ». L'assortiment permanent n'est pas publié avec ses prix : seule la boutique
  de vins l'est.
- Mais la « notice légale » de Denner renvoie aux **mentions légales Migros**, qui interdisent
  l'utilisation commerciale sans autorisation écrite (§4.2).
- **Décision : aucune collecte automatisée sur denner.ch** sans accord. Le site n'est lu que pour
  cet audit (quelques pages).

### 4.6 OTTO'S 🟡

- `robots.txt` : `Crawl-delay: 10`, `/api/*` interdit. Le site est une application JavaScript :
  les pages, conditions générales comprises, ne sont pas lisibles sans exécuter le JavaScript.
  Les prix proviennent de l'API interne, que `robots.txt` exclut.
- Une collecte serait possible avec un navigateur sans interface, à une page toutes les 10 s,
  mais les conditions d'utilisation n'ont pas pu être lues automatiquement.
- **Décision** : non exploité à ce stade (faible part alimentaire, coût de rendu). À réévaluer
  après lecture humaine des conditions générales.

### 4.7 Action

Assortiment surtout non alimentaire. Prix présents sur les fiches produits (`robots.txt`
permissif hors recherche et tri). **Non prioritaire** pour un comparateur de courses alimentaires.

### 4.8 Aligro 🟡

Actions par marché et par semaine, chargées dynamiquement (application Vue). Le client doit
choisir son profil (particulier ou professionnel). Les conditions générales précisent que les prix
Pro sont hors TVA. Collecter les seuls prix TTC destinés aux particuliers exigerait d'utiliser
l'interface interne : **non exploité sans accord**.

## 5. Fournisseurs tiers

| Fournisseur | Offre | Constat | Décision |
|---|---|---|---|
| **Pepesto** | API payante (JSON) des catalogues migros.ch, coop.ch, aldi-suisse.ch… mise à jour quotidienne ; 9,60 € par requête « catalogue complet », 3,20 € « promotions », 0,96 € « produits choisis » (tarifs publics au 28.09.2026) | Données collectées sur les sites des enseignes : la licence de Pepesto **ne confère pas de droits de la part des enseignes**, dont les conditions l'interdisent (Migros). Prix en ligne, pas en magasin. | **Non retenu.** Aucun achat sans votre accord ; ne réglerait pas la question juridique. |
| **Offerista / Profital** (La Poste) | Diffusion de prospectus numériques pour plus de 100 enseignes | Pas d'API de données publique ; offre B2B de diffusion. | Piste de **partenariat** (prospectus, visibilité), pas de source de prix. |
| Robots de collecte revendus (places de marché de « scrapers ») | Extractions des sites d'enseignes | Contournent les conditions des enseignes | **Exclu.** |
| GS1 Switzerland (trade item) | Données de base produits (GTIN, désignations) | Ni prix ni promotions ; adhésion requise | Enrichissement futur possible. |
| Instituts de panels (NielsenIQ, GfK) | Statistiques de marché agrégées | Pas de prix par article et magasin exploitables par le consommateur | Non pertinent. |

## 6. Prix en ligne et prix en magasin

| Source | Canal | Portée |
|---|---|---|
| Lidl (`sortiment.lidl.ch`, `www.lidl.ch`) | Magasin (Lidl ne vend pas d'alimentaire en ligne) | National, sauf actions régionales signalées |
| Open Prices | Magasin (ticket ou étiquette) | Succursale observée, généralisée selon §3.3 |
| Boutiques en ligne Migros et Coop (non utilisées) | En ligne | Peuvent différer du prix en succursale (Migros : 10 coopératives régionales) |

Chaque prix enregistré indique son **canal** (`store` ou `online`) et sa **portée**. Un prix en
ligne n'est jamais présenté comme un prix en magasin.

## 7. Charte de collecte appliquée par le code

1. **Agent identifié** (`HTTP_USER_AGENT`, avec contact de l'exploitant en production). Jamais
   d'agent imitant un navigateur.
2. **`robots.txt` respecté** (RFC 9309 : groupe de l'agent, jokers `*` et `$`, règle la plus
   longue). `Crawl-delay` appliqué, minimum 3 s entre deux requêtes vers un même hôte.
3. **Arrêt immédiat** en cas de 401, 403 ou 451, ou d'un défi anti-robot : l'enseigne est marquée
   « bloquée », une alerte est levée, et aucun autre moyen d'accès n'est tenté.
4. **Reprises limitées** (3 essais, attente exponentielle) sur les erreurs réseau, 429 et 5xx.
   `Retry-After` est respecté.
5. **Collecte minimale** : catégories alimentaires, faits seulement (désignation, format, prix,
   dates, numéro d'article, URL). Ni photos ni textes descriptifs.
6. **Traçabilité** : chaque prix conserve l'URL et l'instant de collecte. Les pages brutes sont
   archivées (compressées, 30 jours) pour prouver le prix affiché.
7. **Idempotence** : identifiants déterministes (enseigne, article, portée, jour), donc une collecte
   relancée ne crée pas de doublon.

## 8. Ce qui manque et qui dépend de vous

| Besoin | Pour | Action proposée |
|---|---|---|
| Autorisation écrite ou flux de données | Migros, Coop, Aldi Suisse, Denner (et OTTO'S, Aligro) | Envoyer la demande type de `02-juridique.md` §8 au nom de l'exploitant (**aucun contact n'a été pris**) |
| Validation juridique | Collecte Lidl (LCD art. 5 let. c, conditions d'utilisation), ODbL (base collective), comparaisons publiées (LCD art. 3 al. 1 let. e) | Avis d'un avocat en droit de la concurrence et des données |
| Décision d'achat éventuelle | Fournisseur tiers (Pepesto) | Non recommandé (§5) |
| Contact d'exploitation dans l'agent HTTP | Transparence envers les sites | Renseigner `HTTP_USER_AGENT="TesPrixBot/1.0 (+https://<domaine>/robot; contact@<domaine>)"` |
