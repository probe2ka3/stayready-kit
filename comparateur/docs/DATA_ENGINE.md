# Moteur de données multi-sources

Code : `packages/core/src/sources.ts`, `pricing.ts` (`chooseAmongSources`), `data-engine.ts`,
`validation.ts`, `b2b.ts`. Tâches : `data-report`, `validation-calibrate`, `validate`,
`benchmark-foodally`. Administration : `/admin/qualite`.

## 1. Hiérarchie des sources

| Niveau | Sources | Fiabilité affichée | Usage |
|---|---|---|---|
| 1. `first_party` | Lidl (site officiel), Aldi (API publique du site), flux sous accord | « vérifié » ≤ 7 jours | Prix affiché en priorité |
| 2. `licensed` | FoodAlly (fournisseur tiers) | toujours « indicatif » | **Comparaison uniquement** ; repli seulement sous licence (`PRICE_FALLBACK_SOURCES`) et correspondances revues |
| 3. `community` | Open Prices (ODbL), tickets de caisse, relevés de l'exploitant | toujours « indicatif » ; périmé après 90 jours | Repli lorsqu'aucune source officielle n'est utilisable |
| 4. `unknown` | Provenance non qualifiée, démonstration | — | Jamais sans avertissement |

## 2. Choix du prix affiché (par enseigne et par ligne du panier)

1. Pour chaque article correspondant (correspondance **revue**, exigences satisfaites) : observation
   de la portée la plus précise (succursale > zone > national), non périmée, la plus récente ;
   promotions publiées, valables à la date choisie, dans la portée, carte détenue.
2. Parmi toutes les offres de l'enseigne : **niveau de source le plus fiable disponible**, puis la moins
   chère, puis la plus fiable, puis la meilleure correspondance.
3. Les autres sources restent visibles (« Autres sources : … ») ; si le même article (même contenance
   ± 2 %, marques compatibles, désignations proches) diffère de plus de **15 %** en prix normalisé,
   l'écart est affiché et le prix porte le motif `source_divergence`. Rien n'est fusionné.

## 3. Observation enrichie (`PriceRecord`, API : snake_case)

`product_id`, `retailer`, `store_id`, `region`, `geographic_scope`, `price`, `regular_price`,
`promotional_price`, `unit_price` (+ base), `currency`, `quantity`, `unit`, `observed_at`,
`valid_from`, `valid_until`, `source_type`, `source_url`, `source_provider`, `confidence`,
`collection_method`, `promotion_conditions`, `loyalty_requirement`, `license`.

**Confiance** = base(niveau) × fraîcheur × correspondance :
base 0,95 / 0,80 / 0,60 / 0,30 ; fraîcheur 1 jusqu'à 1 jour, puis linéaire jusqu'à 0,5 à la limite de
péremption (30 j officiel, 90 j communautaire), 0,25 au-delà ; correspondance 1 (code-barres),
0,95 (équivalent), 0,85 (contenance voisine).

## 4. Contrôle de qualité

| Alerte | Règle |
|---|---|
| Prix suspect | Hors [0,05 ; 500] CHF, ou prix normalisé hors [min/3 ; max×3] des meilleurs prix des autres enseignes |
| Variation anormale | ≥ 40 % entre deux relevés successifs d'une même source |
| Contenance incohérente | Lot « 6 x 1,5 l » enregistré comme une unité ; correspondance hors [1/6 ; 5] fois la référence |
| Doublon | Deux prix différents le même jour, même article, même source |
| Données anciennes | Dernier prix d'un article rapproché au-delà de la limite de péremption |
| Divergence de sources | Même article, deux sources, écart > 15 % |
| Action lue comme prix normal | Prix normal du jour égal au prix d'une action en cours inférieure à son « au lieu de » |
| Connecteur en panne | Bloqué, en échec ou sans collecte depuis 48 h |

Une alerte appelle une vérification ; aucune donnée n'est supprimée automatiquement.

## 5. Couverture et fraîcheur

Une référence est **couverte** par une enseigne si une correspondance revue satisfait ses exigences
(bio, origine suisse, AOP, marque, dimension) et dispose d'un prix utilisable (normal non périmé ou
action en cours). Indicateurs : couverture par enseigne (dont source officielle), références
comparables dans ≥ 2, 3, 4, 5 enseignes, fraîcheur < 24 h, < 48 h, < 7 j, couverture par priorité.

## 6. Jeu de validation

`data/validation/essentials.json` : 50 essentiels (P1) × Migros, Coop, Aldi, Lidl, Denner ; articles
attendus, contenance admise, bande de prix normalisé. `pnpm job validate [--strict]` détecte :
disparition du catalogue, article attendu absent, prix manquant, quantité mal lue, prix au kilo hors
bornes (lot attribué à une unité), action lue comme prix normal.
