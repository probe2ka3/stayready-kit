# API publique `/api/v1`

JSON, sans authentification, limitée en débit (réponse `429` + `Retry-After`). Aucune donnée de
requête n'est conservée. Erreurs : `{ "error": { "code", "message", "issues"? } }`.

| Méthode | Route | Limite |
|---|---|---|
| GET | `/api/v1/localities?q=1630&limit=8` | 120 / min |
| GET | `/api/v1/stores?lat=46.62&lon=7.06&radius=10` | 60 / min |
| GET | `/api/v1/products?q=farine` · `?category=oeufs` · `?ids=a,b` | 120 / min |
| GET | `/api/v1/catalog` | — |
| POST | `/api/v1/compare` | 30 / min, même origine |
| GET | `/api/v1/health` | — |
| POST | `/api/v1/metrics` | 120 / min, même origine, compteur anonyme `{ metric, dimension }` (liste fermée) |
| GET | `/api/v1/placements?slot=results_footer` | — (emplacements commerciaux signalés ; vide) |
| POST | `/api/v1/waitlist` | fermé (`503 signup_closed`) tant que `SIGNUP_ENABLED` n'est pas activé |

En mode `PUBLIC_ACCESS=waitlist`, seules `health` et `waitlist` répondent sans jeton de prévisualisation
(`403 not_open` sinon). `health` renvoie aussi `prices` (`live`/`demo`), `access` et `pilotCantons`.

## GET /api/v1/stores

`radius` ∈ {5, 10, 20, 30} km. Réponse : `chains` (présentes : nombre, distance de la plus proche),
`absentChains` (non visitables), `stores` (≤ 400, triées par distance, horaires du jour, ouverture
actuelle), `attribution`.

Phase 4 : la présence d'un magasin est distinguée des données de prix. Chaque enseigne porte
`priceData: { kind, lastObservation, prices }` avec `kind` ∈ `official` (prix publiés par l'enseigne),
`community` (relevés Open Prices), `none`, `demo`, `restricted` (source exclue en production faute
d'autorisation, voir `docs/DROITS_DONNEES.md`). Chaque succursale porte `stock: "unknown"` : aucune
source ne publie la disponibilité par magasin.

## POST /api/v1/compare

```json
{
  "origin": { "lat": 46.6205, "lon": 7.0566, "label": "1630 Bulle" },
  "radiusKm": 10,
  "chains": ["migros", "coop", "lidl"],
  "excludedStores": ["osm:node/123"],
  "lines": [
    { "id": "l1", "productId": "farine-blanche-1kg", "qty": 1 },
    { "id": "l2", "productId": "lait-entier-uht-1l", "qty": 2, "prefs": { "organic": true } }
  ],
  "prefs": { "organicOnly": false, "swissOnly": false, "loyaltyPrograms": ["cumulus"], "allowSimilarPacks": true, "includeStalePrices": false },
  "when": { "mode": "plan", "date": "2026-10-02", "time": "10:00" },
  "maxStores": 2,
  "travel": { "mode": "car", "costPerKmChf": 0.35, "valueOfTimeChfPerHour": 0, "valueInStoreTime": false, "minutesPerStore": 15, "returnToOrigin": true },
  "minSavingPerExtraStoreChf": 2,
  "referenceChainId": null,
  "includeStores": ["osm:node/427655235"]
}
```

`includeStores` (≤ 5) : succursales ajoutées par l'utilisateur après une proposition de détour ; elles sont
imposées dans le parcours optimisé (un magasin de plus autorisé). Refuser un détour = ajouter la succursale à
`excludedStores`.

Nouveautés de la réponse (phase 2) :

- chaque option de prix porte `reliability`, `observedAtPlace`, `license`, `sourceUrl` ;
- chaque scénario porte `detours[]` (`store`, `items[]` avec `baseCents`/`newCents`/`savingCents`,
  `grossSavingsCents`, `addedItemsCents`, `extraTravelCostCents`, `extraDistanceKm`, `extraMinutes`,
  `netSavingsCents`, `droppedStores`, `worthwhile`, `reason`, `resulting`) et `includedStoreIds` ;
- `waitSignal` : `{ fromDate, date, daysLater, basePurchaseCents, purchaseCents, savingsCents, promoLines }`
  ou `null`.

- `when` : `{ "mode": "now" }` ou `{ "mode": "plan", "date": "AAAA-MM-JJ", "time": "HH:MM" | null }`
  (jusqu'à 60 jours). Sans heure, les magasins fermés toute la journée sont exclus.
- `maxStores` : 1 à 5, ou `null` (sans limite, plafonnée à 5).
- Coordonnées limitées à l'emprise de la Suisse ; 100 lignes et quantité 99 au maximum.

Réponse (`CompareResultDto`, `packages/core/src/compare.ts`) :

- `meta` : dates, mode, `dataMode` (`demo` / `live` / `mixed`), fournisseur de trajets, estimation ou
  non, statistiques de calcul, `warnings` ;
- `scenarios[]` (`single_store`, `cheapest_products`, `optimized_total`) : étapes ordonnées (succursale,
  heure d'arrivée, état d'ouverture, articles avec option retenue, sous-total, liens de navigation),
  articles manquants et motifs, totaux, trajet, coût global, économies et référence, lien Google Maps ;
- `singleStoreRanking[]` : meilleur panier complet par enseigne ;
- `alternativesByStoreCount[]` : meilleur coût global pour 1, 2… magasins ;
- `planning` (si date future) : aujourd'hui vs date, promotions qui commencent / expirent ;
- `outlook[]` : coût du panier sur 10 jours (promotions annoncées uniquement).

Chaque option d'article comprend : article de l'enseigne, paquets, prix normal, prix payé, prix unitaire,
promotion (mécanique, validité, publication, carte requise, fin présumée), **statut** et **motifs**,
**date de vérification**, **source**, `isDemo`.

Nouveautés de la réponse (phase 4) :

- `solutions[]` : chaque enseigne seule (meilleure succursale, `kind: "single_chain"`) et la
  combinaison (`kind: "combination"`, `retained` faux si elle n'est pas retenue par le parcours
  optimisé) : `stores[]`, `coveredLines`, `coverageRate`, `complete`, `purchaseCents`, `distanceKm`,
  `driveMin`, `totalMin`, `travelCostCents`, `globalCents`, `promoLines`, `indicativeLines`,
  `isReference` (meilleur magasin unique **complet**, trajet compris), `grossSavingsCents` et
  `netSavingsCents` (null si `notComparable` : `incomplete` ou `no_complete_reference`) ;
- `unavailableEverywhere[]` : articles introuvables dans tout le périmètre ;
- `meta.travelMethod` : `{ provider, estimated, mode, detourFactor, speedKmh, overheadMin, costPerKmChf,
  returnToOrigin }` — `estimated: true` = vol d'oiseau × facteur de détour, jamais un itinéraire routier ;
- `meta.priceDates[]` : dates du plus ancien et du plus récent relevé utilisés, par enseigne ;
  avertissement `prices_not_refreshed` si le relevé le plus récent d'une enseigne a plus de 48 h ;
- option d'article : `requestedQuantity` et `purchasedQuantity` (montant payé = paquets × prix du
  paquet) ; promotion : `conditions[]` (carte, quantité, lot, région), `announced` (commence après
  aujourd'hui), `zoneId`, `regionNote`, `verifiedAt` ; nouveaux types `nth_percent` (« -50 % sur le
  2e paquet ») et `conditional` (prix « dès » ou variable, jamais appliqué) ; nouveaux motifs
  `promo_not_confirmed_on_date` et `variable_weight`.

## API professionnelle `/api/b2b/v1` (phase 3, fermée par défaut)

Authentification : `Authorization: Bearer <clé>` ; les clés ne sont jamais stockées en clair
(`B2B_API_KEY_HASHES` = empreintes SHA-256 hexadécimales, séparées par des virgules). Sans clé configurée,
toutes les routes répondent `403 not_open` ; clé absente ou invalide : `401 unauthorized`.

| Méthode | Route | Réponse |
|---|---|---|
| GET | `/api/b2b/v1/observations?retailer=lidl&product=penne-500g&limit=500` | `{ data: ApiPriceObservation[], count, license }` — observations **officielles** rapprochées du catalogue |
| GET | `/api/b2b/v1/coverage` | Couverture par enseigne et références comparables dans ≥ 2, 3, 4, 5 enseignes |
| GET | `/api/b2b/v1/basket-index?retailers=lidl,aldi&priority=P1` | Indice du panier commun (base 100 = enseigne la moins chère) |

`ApiPriceObservation` : `product_id`, `retailer`, `store_id`, `region`, `geographic_scope`, `price`,
`regular_price`, `promotional_price`, `unit_price`, `unit_price_basis`, `currency`, `quantity`, `unit`,
`observed_at`, `valid_from`, `valid_until`, `source_type`, `source_url`, `source_provider`, `confidence`,
`collection_method`, `promotion_conditions`, `loyalty_requirement`, `license` (montants en CHF).

Garanties : aucune donnée personnelle (contrôle `assertNoPersonalData` sur chaque réponse) ; seules les
sources officielles sont servies (données tierces et ODbL exclues par défaut) ; aucune incidence sur le
service grand public.
