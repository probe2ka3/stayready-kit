# Données : modèle, import, qualité

## Modèle (PostgreSQL + PostGIS)

Schéma : `packages/db/src/schema.ts` ; migrations : `packages/db/migrations/`.

| Table | Rôle | Points clés |
|---|---|---|
| `chains` | Enseignes | calendrier promotionnel constaté, programmes de fidélité, `consumer_prices_only` |
| `price_zones` | Zones tarifaires | coopératives Migros (cantons) |
| `stores` | Succursales | `location geography(Point,4326)` calculé depuis lat/lon, index GiST, horaires OSM, source, `active` |
| `localities` | Localités swisstopo | NPA, nom, commune, canton, coordonnées ; index trigramme |
| `categories` | Catégories | icône, type (alimentaire, ménage, hygiène, autre) |
| `canonical_products` | Références normalisées | quantité normalisée (g, ml, pièce), exigences (bio, suisse, labels, marque), GTIN |
| `retailer_products` | Articles des enseignes | `id = <enseigne>:<sku>`, GTIN, quantité, attributs, `is_demo` |
| `product_matches` | Correspondances | `gtin` / `equivalent` / `similar`, statut `suggested` / `validated` / `rejected`, `origin = admin` jamais écrasée |
| `price_observations` | Prix observés | centimes, portée (nationale / zone / succursale), date de vérification, source (connecteur, type, référence), statut |
| `promotions` | Promotions | type et paramètres, **`published_at` ≠ `valid_from`**, `valid_to` inclus, carte requise, « jusqu'à épuisement », fin présumée, prix « au lieu de » fourni par l'enseigne |
| `import_runs` | Journal des exécutions | connecteur, type, statut, statistiques, problèmes |
| `anomalies` | Anomalies de qualité | unicité des anomalies ouvertes, résolution tracée |
| `audit_log` | Actions des administrateurs | qui, quoi, quand |

Montants en **centimes** (entiers). Dates de validité en **dates calendaires Europe/Zurich**, instants
en UTC.

## Types de source (par ordre de préférence)

`official_api` · `agreement` · `retailer_site` (pages publiques officielles, collecte conforme à robots.txt) ·
`manual_survey` · `manual_import` · `open_data` (dont Open Prices) · `demo`.

## Champs d'un prix réel (migration 0001)

| Champ | Contenu |
|---|---|
| `retailer_product_id` | Article de l'enseigne (`lidl:<n° d'article>`, `aldi:<n° d'article>`, `<enseigne>:gtin-<code>` pour Open Prices) |
| `price_cents` | Prix TTC en centimes |
| quantité, unité (article) | Conditionnement normalisé (g, ml, pièces) ; le prix unitaire est calculé |
| `observed_at` | Instant de la collecte ou du relevé |
| `zone_id`, `store_id` | Portée : nationale, zone tarifaire, succursale |
| `price_type` | `regular` (les prix d'action sans dates sont des promotions du jour) |
| `channel` | `store` (magasin) ou `online` |
| `reliability` | `official`, `survey`, `crowd`, `third_party` (fournisseur tiers, comparaison ou repli sous licence) |
| `license` | `ODbL-1.0` pour Open Prices, vide pour les données propres |
| `source_url`, `source_ref` | Page ou relevé d'origine |
| `observed_at_place` | Lieu réel d'un relevé communautaire généralisé |
| `proof` | `web_page`, `public_api` (API publique du site de l'enseigne), `receipt`, `price_tag` |

Niveau de source (officiel, sous licence, communautaire, inconnu), confiance et divergences : voir
`docs/DATA_ENGINE.md`.

Promotions : `published_at`, `valid_from`, `valid_to` distincts, `end_is_presumed`, `while_stocks_last`,
`loyalty_program`, `zone_id` (actions régionales), `region_note` (texte de l'enseigne), `source_url`.

Idempotence : identifiants déterministes (source, article, portée, jour) ; relancer une collecte ne crée
aucun doublon ; `LEAST(published_at)` conserve la première date de publication constatée.

## Correspondances revues (`data/matching/reviewed.json`)

Décisions de l'équipe données (relecteur, date, motif) : validation vers une référence du catalogue, ou refus
explicite (`canonicalSlug: null`). Règles appliquées : même type de produit ; bio seulement vers une référence
bio ; origine suisse exigée par la référence présente sur l'article ; variété ou format différents admis
seulement comme « conditionnement différent » ; données incohérentes de la source refusées (ex. prix d'un pack
associé à une bouteille). Outil d'aide : `pnpm job match-candidates`.

## Format d'import

Fichiers déposés dans `<IMPORT_DIR>/<enseigne>/` (tâche `connectors`), passés en ligne de commande
(`pnpm job import fichier.csv --connector migros --dry-run`) ou téléversés dans l'administration.
CSV (séparateur `;` ou `,`, UTF-8, en-tête obligatoire) ou JSON (`{ "products": [...], "promotions": [...] }`
avec les mêmes noms de champs). Exemples : `data/imports/examples/`.

### Articles et prix

| Colonne | Oblig. | Description |
|---|---|---|
| `chain_id` | ✔ | `migros`, `coop`, `denner`, `aldi`, `lidl`, `ottos`, `action`, `aligro` |
| `sku` | ✔ | identifiant de l'article chez l'enseigne |
| `name` | ✔ | désignation |
| `quantity`, `unit` | ✔ | ex. `1` + `kg`, `75` + `cl`, `6` + `pce` (g, kg, ml, cl, dl, l, pièce…) |
| `brand`, `gtin`, `url` | | GTIN contrôlé (clé de contrôle) |
| `organic`, `swiss_origin` | | `1`/`0`, `oui`/`non`, `true`/`false` |
| `labels` | | séparés par `|` : `vegan`, `lactose-free`, `aop`, `fairtrade`… |
| `canonical_slug` | | référence normalisée → correspondance **validée** ; sinon suggestions à valider |
| `match_kind` | | `gtin`, `equivalent`, `similar` (déduit de la quantité si absent) |
| `price_chf` | | prix TTC ; absent = article sans prix |
| `observed_at` | si prix | date (`AAAA-MM-JJ`, interprétée 12:00 à Zurich) ou instant ISO ; jamais dans le futur |
| `scope` | | `national` (défaut), `zone:<id>`, `store:<id>` |
| `source_kind` | ✔ | `official_api`, `agreement`, `manual_survey`, `manual_import` (`demo` refusé) |
| `source_ref` | ✔ | URL, référence du relevé, nom du flux |
| `audience`, `vat_included` | | `consumer` / `1` par défaut ; **obligatoires pour Aligro** |

### Promotions

| Colonne | Oblig. | Description |
|---|---|---|
| `chain_id`, `sku` | ✔ | article concerné (dans le lot ou déjà en base) |
| `type` | ✔ | `price`, `percent`, `multibuy`, `min_qty_price`, `min_qty_percent` |
| `promo_price_chf` / `percent` / `buy_qty` + `pay_qty` / `min_qty` | selon type | ex. `multibuy` 3 pour 2 : `buy_qty=3`, `pay_qty=2` |
| `published_at` | ✔ | date de publication par l'enseigne (≤ aujourd'hui, ≤ `valid_to`) |
| `valid_from`, `valid_to` | ✔ | dates incluses (Zurich) |
| `reference_price_chf` | | prix « au lieu de » **communiqué par l'enseigne** |
| `loyalty_program` | | `cumulus`, `supercard`, `lidl-plus` |
| `while_stocks_last`, `end_is_presumed`, `label`, `scope`, `verified_at` | | |
| `source_kind`, `source_ref` | ✔ | |

**Garde-fou** : toute ligne dont `source_ref` commence par « EXEMPLE » est traitée comme donnée fictive.

Les lignes invalides sont rejetées individuellement avec numéro de ligne, colonne et motif ; le reste du
fichier est importé. Chaque exécution est journalisée (`import_runs`).

## Correspondances

1. GTIN identique à une référence qui le déclare → validée automatiquement.
2. `canonical_slug` fourni par l'importateur → validée (décision humaine lors du relevé).
3. Sinon, suggestions (similarité du nom, compatibilité des caractéristiques et du conditionnement) →
   statut `suggested`, **non utilisées** tant qu'un administrateur ne les a pas validées.
4. Deux produits aux caractéristiques essentielles différentes (bio / non bio, origine exigée, labels,
   marque imposée, unité) ne sont jamais proposés comme équivalents.

## Contrôles de qualité (`pnpm job quality`, quotidien)

| Anomalie | Gravité |
|---|---|
| Date de vérification dans le futur | erreur |
| Prix sans source | erreur |
| Promotion : fin avant début, publiée après la fin | erreur |
| Promotion non avantageuse (≥ prix normal) | erreur |
| Variation de prix ≥ 50 % entre deux observations | alerte |
| Prix unitaire ×3 ou ÷3 par rapport à la médiane des autres enseignes | alerte |
| Promotion de plus de deux mois | alerte |
| Promotion débutant un jour inhabituel pour l'enseigne | info |
| Prix non vérifié depuis plus de 30 jours | info |

Les promotions terminées passent au statut `expired`. Résolution dans l'administration : corrigée,
ignorée, ou **donnée écartée** (le prix ou la promotion n'est plus utilisé).

## Données ouvertes

| Instantané | Source | Rafraîchissement |
|---|---|---|
| `data/geo/localities.json` | swisstopo, répertoire officiel des localités | `pnpm job localities --download` (trimestriel) |
| `data/stores/osm-stores.json` | OpenStreetMap via overpass.osm.ch | `pnpm job stores --download` (hebdomadaire, `pnpm job weekly`) |

Formats exclus en V1 (commerces franchisés ou indépendants) : migrolino, Migros Partner / VOI, teo,
Coop Pronto, Coop to go, Denner Satellit / Express, points de vente spécialisés (bricolage, stations,
cosmétiques, sport).
