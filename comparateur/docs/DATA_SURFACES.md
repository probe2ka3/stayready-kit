# Surfaces de données first-party des enseignes (phase 3)

> Relevés techniques des 28 et 30.09.2026, avec un agent HTTP identifié (`TesPrixBot`), sans imitation
> de navigateur, sans exécution de JavaScript, sans authentification, sans contournement d'aucune
> protection. Toute réponse 401/403, tout défi anti-robot ou toute interdiction de `robots.txt` arrête
> l'exploration de l'hôte concerné. Ce document complète `audit/03-sources-prix.md` (phase 2).
>
> Légende : ✅ exploité · ⚖️ validation juridique avant ouverture publique · 📄 autorisation écrite
> nécessaire · ⛔ refusé techniquement (aucun contournement) · ➖ sans objet.

## 1. Synthèse

| Enseigne | Surface first-party publique | Accès pour un robot identifié | Statut | Connecteur |
|---|---|---|---|---|
| **Aldi Suisse** | API de recherche consommée par le site (`api.aldi-suisse.ch/v3/product-search`) | 200 (liste paginée) ; recherche plein texte, fiches et magasins refusés (403) | ✅ ⚖️ | `aldi-api` (nouveau) |
| **Lidl Suisse** | Pages catégories + **fiches produits du plan du site** (`sortiment.lidl.ch`), pages d'actions (`www.lidl.ch`) | 200, `robots.txt` respecté | ✅ ⚖️ | `lidl-web` (étendu) |
| **Migros** | Site et API du site sur `www.migros.ch` | 403 sur tout l'hôte (plan du site compris) | ⛔ 📄 | — |
| **Coop** | `www.coop.ch` | Défi anti-robot (DataDome) dès `robots.txt` | ⛔ 📄 | — |
| **Denner** | Pages d'actions SSR (Nuxt) avec données embarquées | 200 | 📄 (conditions : usage commercial interdit sans autorisation écrite) | — (documenté, non développé) |

Résultat mesuré (instantanés au 30.09.2026, après les collectes des 28 et 30.09) :

| Enseigne | Articles lus le 30.09 | Articles retenus (cumul) | Articles avec prix | Actions (en cours / annoncées) | Requêtes par jour | Blocages |
|---|---|---|---|---|---|---|
| Aldi Suisse | 2 513 (196 non alimentaires, 415 sans contenance) | 1 901 | 1 484 | 609 / 95 | 43 | 0 |
| Lidl Suisse | 1 799 (catégories) + 415 fiches + 410 actions | 3 429 | 3 012 | 287 / 244 | ≈ 530 (passe complète du 28.09 : 3 288) | 0 |

## 2. Méthode d'exploration

1. `robots.txt` de chaque hôte (RFC 9309 : 404 = aucune restriction ; 401/403 = arrêt).
2. Page d'accueil et page catalogue en HTML serveur : recherche des données embarquées (JSON-LD,
   `__NUXT_DATA__`, `__NEXT_DATA__`, attributs `data-*`), de la configuration publique du front
   (points d'accès d'API, tailles de page), des liens de plan du site.
3. Appels aux seuls points d'accès **effectivement utilisés par le site** et permis par `robots.txt`,
   avec les paramètres du site (taille de page, devise), à 3 s d'intervalle.
4. Arrêt au premier refus. Les refus rencontrés sont documentés ci-dessous comme limites.

## 3. Aldi Suisse ✅ ⚖️

### 3.1 Point d'accès

| Élément | Valeur |
|---|---|
| URL | `GET https://api.aldi-suisse.ch/v3/product-search?currency=CHF&serviceType=walk-in&limit=60&offset=N` |
| Type | API REST JSON (Spryker Glue) consommée par le front Nuxt de `www.aldi-suisse.ch` (configuration publique `API_GATEWAY_BASE_URL`) |
| `robots.txt` de l'hôte API | 404 → aucune restriction |
| Authentification | Aucune |
| Pagination | `limit` ∈ {12, 16, 24, 30, 32, 48, 60} ; `offset` ≤ 9 999 (`WEB_MAX_PRODUCTS_OFFSET`) ; `meta.pagination.totalCount` (2 551 le 28.09.2026) ; 43 requêtes pour tout l'assortiment, **aucun doublon** constaté |
| Filtres | `categoryTree=<id>` (20 rayons, dont « Actions » `1588161418433031`, 583 articles), `brandName`, `countryOrigin`, `theme` ; tri `relevance`, `name_asc/desc`, `price_asc/desc` |
| Portée | `serviceType=walk-in` : prix **en magasin**, nationaux (Aldi Suisse ne vend pas d'alimentaire en ligne ; `notForSale: true` = non commandable en ligne) |
| Refus rencontrés | `q=` (recherche plein texte) → 403 ; `/v2|v3/products/{sku}` (fiche) → 403 ; `/v2/merchants` (magasins) → 403 ; fiches HTML `www.aldi-suisse.ch/fr/produit/…` → 403 ; pages catégories HTML → 403 (Akamai). **Aucun n'est utilisé.** |

### 3.2 Champs par article

| Besoin | Champ | Remarque |
|---|---|---|
| Identifiant | `sku` (18 chiffres) ; `abstractSku` (famille de variantes) | Stable ; utilisé comme identifiant TesPrix `aldi:<sku sans zéros>` |
| Désignation | `name` (FR) ; `urlSlugTextAlternatives` (de, fr, it) | |
| Marque | `brandName` (marques propres : MILSANI, BIO, SAVEURS SUISSES…) | `null` = sans marque |
| Conditionnement | `sellingSize` (« 450 g », « 0,75 l », « 6 x 1,5 l », « 15 Pièce »), `quantityUnit`, `weightType` | **Absent pour 633 articles le 28.09, 415 le 30.09** (spaghetti, farine, sel, Nutella…) : ces articles sont écartés, jamais devinés |
| Prix | `price.amount` / `amountRelevant` (centimes) | |
| Prix de base | `price.comparison` + `comparisonDisplay` (« CHF 0.44/100 g ») | Contrôle de cohérence : 8 rejets (erreurs de la source : « Muesli 750 kg », « Viande des Grisons 0,08 g ») |
| Promotion | `price.wasPriceDisplay` (« au lieu de »), `savingsDisplay` ; rayon « Actions » | 108 réductions, 417 articles d'action |
| Dates | `onSaleDate` (AAAA-MM-JJ) + `onSaleDateDisplay` (« Disponible à partir du 05.10.2026 ») | **Actions annoncées à l'avance** ; pas de date de fin (jusqu'à épuisement) |
| Disponibilité | `discontinued`, `notForSale` | Pas de stock par magasin |
| Magasin / région | — | Prix nationaux |
| GTIN | — | Non publié |
| Origine, labels | `badges[].items[].alt` (« Suisse Garantie… », « AOP… », « EU organic… »), rayons (« Retour aux sources (bio) ») | Lus pour les exigences bio / origine suisse |
| Catégories | `categories[]` (id, nom) | Filtre des actions non alimentaires |
| Fréquence de changement | Actions : lundi et jeudi ; assortiment : ponctuel | Collecte quotidienne |

### 3.3 Autres surfaces Aldi

- Prospectus : `catalog.aldi-suisse.ch/aldiwoche_kw<semaine>-<année>_fr` (Publitas : PDF + zones produit).
  Non utilisé : les mêmes actions sont dans l'API.
- Conditions d'utilisation (`/fr/informations/conditions-dutilisation`) : champ d'application = compte
  utilisateur (« Ma liste », commande, tickets), avec une clause « fins privées uniquement » et une
  interdiction d'« utiliser des données à des fins commerciales » et de « scripts » compromettant la
  capacité d'action du site. ⚖️ **Portée à faire valider** (compte utilisateur seulement ou consultation
  publique) avant l'ouverture. Le connecteur est désactivable immédiatement (`ALDI_API=off`) et la
  source peut être purgée (`purge-source --connector aldi-api`).

## 4. Lidl Suisse ✅ ⚖️

### 4.1 Assortiment permanent : `sortiment.lidl.ch`

| Élément | Valeur |
|---|---|
| Surfaces | (a) pages catégories (Magento, HTML serveur) ; (b) **fiches produits** `/fr/catalog/product/view/id/N`, listées dans le plan du site `sitemaps/fr.xml` (3 167 fiches FR) |
| `robots.txt` | `Disallow: /*?` (pas de pagination `?p=2`), `Disallow: /catalog/` (racine uniquement : les chemins `/fr/catalog/…` ne sont pas visés et sont publiés dans le plan du site) |
| Pagination | Aucune (interdite) ; couverture complète par les fiches du plan du site |
| Rotation | 460 fiches par jour (`LIDL_PRODUCT_PAGES_PER_RUN`), tout l'assortiment relu en 7 jours, sans état ; passage complet ponctuel possible (3 288 requêtes, 2 h 45, 0 blocage le 28.09.2026) |
| Identifiant | Numéro d'article (`N° d'article`, suffixe du slug `…-0001198`) |
| Désignation | `h1.page-title` ; `og:title` |
| Marque | Logo de marque (non repris) ; marque souvent dans la désignation |
| Conditionnement | `pricefield__footer` (« les 185g \| 100g = 2,16 CHF », « les 20 pièces ») |
| Prix | `itemprop="price"` ; `product:price:amount` |
| Prix de base | Dans le pied du bloc prix ; contrôle de cohérence (15 rejets le 28.09.2026) |
| Promotion | `pricefield--discount`, en-tête « Aktion », pastille Lidl Plus |
| Origine | Liste `product-badges-list` (pastille « Schweizer Kreuz ») — placée après le bloc de prix |
| GTIN | Non publié |
| Magasin / région | Prix nationaux |

### 4.2 Actions datées : `www.lidl.ch`

Pages `/c/fr-CH/<thème>/a<id>` liées depuis l'accueil ; attribut `data-grid-data` (JSON par article) :
`erpNumber`, titre, `price.price`, `price.oldPrice` (« au lieu de »), `discount.discountText`,
`storeStartDate` / `storeEndDate` (dates de validité, y compris **actions à venir**), variantes
**Lidl Plus**, portée régionale dans le titre (« valable uniquement au Tessin »), `category`
(Food / Non-food), `renderedTs` (publication). `robots.txt` : `/c/` autorisé ; recherche interdite
(non utilisée). Fréquence : vagues du lundi et du jeudi.

> Phase 4 : `robots.txt` de `sortiment.lidl.ch` contient `Disallow: /catalog/` ; les fiches lues
> sont `/fr/catalog/product/view/id/N`, hors de ce préfixe selon RFC 9309 et listées au plan du site
> de Lidl. Ambiguïté documentée et décision laissée à l'exploitant : `docs/DROITS_DONNEES.md` § 3.
> Aldi : conditions « fins privées uniquement » → exclu de l'affichage en production sans
> autorisation (§ 4 du même document).

## 5. Migros ⛔ 📄

| Surface | Résultat |
|---|---|
| `www.migros.ch` (accueil, fiches, plan du site, API du site) | **403** « maintenance » pour un robot identifié, sur tout l'hôte, bien que `robots.txt` (200) autorise les fiches produits et exclue seulement `/promotion/`, `/offers/…`, recherche, compte |
| `produkte.migros.ch` (ancien catalogue) | Hôte inaccessible |
| `web-api.migros.ch` | Connexion refusée |
| `www.migrosmagazine.ch` | Redirigé vers `www.migros.ch` (403) |
| `filialen.migros.ch` (localisateur) | 200, `robots.txt` permissif, plans du site par langue : **succursales et horaires**, aucun prix |
| Conditions | Mentions légales du groupe : reproduction et usage commercial interdits sans autorisation écrite |

**Conclusion** : aucune surface de prix first-party accessible sans contourner le refus de l'hôte. Le
localisateur peut enrichir les succursales et horaires (complément à OpenStreetMap). Prix : accord écrit
avec la Fédération des coopératives Migros, ou relevés communautaires / tickets.

## 6. Coop ⛔ 📄

| Surface | Résultat |
|---|---|
| `www.coop.ch` (accueil, `robots.txt`, plan du site) | **403** + page de défi DataDome (« Please enable JS and disable any ad blocker ») : arrêt immédiat |
| `www.coopzeitung.ch` | 200 ; rubrique « Angebote » = catalogues et concours, **aucun prix structuré** |
| `epaper.coopzeitung.ch` | 200, `robots.txt` permissif ; journal numérique (PDF) avec authentification prévue ; contenus rédactionnels protégés, prix seulement dans les annonces (images) : **non exploité** |
| `www.cooperation-online.ch` | Redirigé vers une page de maintenance |

**Conclusion** : aucune surface de prix first-party exploitable. Accord avec Coop nécessaire.

## 7. Denner ✅ (usage privé) 📄

Mise à jour du 01.10.2026 (docs/COLLECTE_QUOTIDIENNE.md) : la **recherche du site** publie aussi des prix
permanents ; un collecteur ciblé (`denner-web`) est en service, en **collecte privée**.

| Élément | Constat |
|---|---|
| Surfaces | Recherche `/fr/search?q=…` (5 résultats les plus pertinents : prix permanents et actions), `/fr/actions/actions-actuelles`, `/fr/actions/actions-dès-jeudi` (paginées), fiches `/fr/actions/<slug>~p<id>`, boutique de vins |
| Technique | Nuxt SSR : état `__NUXT_DATA__` (format « devalue ») avec les articles du moteur de recherche du site ; `robots.txt` permissif (hors panier, liste) ; 200 pour un robot identifié |
| Champs | `articleId`, `name`, `nameSubline` (« UHT, 3,5 %, 6 x 1 litre », « Suisse, le kg »), `price`, `standardPrice`, `insteadPriceText` (« au lieu de »), `promotionLabel` (« 24.09–30.09.2026 », « Jusqu'au … », « Dès le … »), `promotionFrom/To` (époques), `salesQuantity` (lots), `has_discount`, `promo_current_week`, `promo_next_week`, `content_size_text` (« 0.5 unit.ml » = 0,5 l) |
| Couverture du noyau | 34/50 ; absents du site : sucre, sel, séré, blanc de poulet suisse, tomates en conserve, polenta, beurre de cuisine, pain complet |
| Conditions (« Précisions d'ordre juridique ») | « La reproduction (complète ou partielle), la transmission […], la modification, la mise en réseau et l'utilisation du portail / de l'app **dans un but de publication ou à des fins commerciales** sont interdites sauf accord préalable écrit. » « Seuls sont valides les prix affichés dans les points de vente. » |

**Conclusion** : collecte privée quotidienne (≈ 53 requêtes), instantané dans `data/private/`, jamais
publié ; publication après accord écrit.

## 8. Référence : FoodAlly (fournisseur tiers, pas first-party)

| Élément | Constat (30.09.2026) |
|---|---|
| Offre | Comparateur gratuit sans publicité ; ~312 000 articles, 19 vendeurs (Migros, Coop, Lidl, Aldi, Denner, Volg, Spar, Aligro…), historique depuis avril 2025 ; revenus : licences de données |
| Accès machine | Serveur MCP public `https://foodally.ch/mcp` (JSON-RPC 2.0 : `search_products`, `get_product`) — **seul chemin autorisé aux robots** par son `robots.txt` ; API `/api/v2/…` avec clé |
| Paliers (page `/licensing`) | Gratuit : 30 requêtes/min et 100/jour en anonyme (en-têtes `X-Ratelimit-*`, HTTP 402 au-delà) ; Pro « dès CHF 49/mois » (historique, métriques) ; Business « dès CHF 499/mois » (export du catalogue, 14 mois d'historique) ; contact `data@foodally.ch` |
| Conditions | Collecte massive interdite sans licence ; attribution obligatoire avec lien cliquable vers la page source |
| Utilisation TesPrix | Connecteur `foodally` : 50 requêtes (une par essentiel), résultats bruts hors dépôt, provenance « fournisseur tiers », **exclu des prix affichés** ; repli possible seulement avec licence (`PRICE_FALLBACK_SOURCES=foodally`) et correspondances revues. Aucun abonnement souscrit. |

Benchmark du 30.09.2026 (`data/benchmark/foodally-summary.json`) sur les 50 essentiels :

| Enseigne | Essentiels trouvés chez FoodAlly | Couverts par TesPrix (officiel) | Comparés | Écart médian | ≤ 5 % | > 20 % |
|---|---|---|---|---|---|---|
| Migros | 30 | 0 | — | — | — | — |
| Coop | 37 | 0 | — | — | — | — |
| Lidl | 27 | 45 | 26 | 0 % | 19 | 5 |
| Aldi | 29 | 31 | 18 | 0 % | 10 | 7 |
| Denner | 14 | 0 | — | — | — | — |

Lecture : pour un même article, les prix concordent (écart médian nul). Les écarts importants viennent
d'articles différents (marque, format) ou d'articles Aldi dont la contenance n'est pas publiée dans la
liste de l'API. FoodAlly couvre Migros, Coop et Denner, que TesPrix ne peut pas collecter : c'est la
seule source tierce de repli crédible, **sous licence**, et sans dépendance (chaque observation garde
sa provenance, la source peut être coupée sans effet sur les données officielles).

## 9. Ce que cela implique

1. **Couverture automatique réelle** : Lidl (quasi complète) et Aldi (assortiment avec contenance) ;
   actions datées et futures pour les deux.
2. **Migros, Coop, Denner** : aucune voie first-party ouverte sans autorisation. Trois options, non
   exclusives : demande d'accord (modèle `audit/02-juridique.md` §8), licence FoodAlly Pro/Business
   pour un repli signalé, tickets de caisse des utilisateurs (`docs/TICKETS.md`).
3. **Juridique** : avis avant ouverture sur Lidl (collecte de pages publiques) et Aldi (portée de la
   clause « fins privées »).
