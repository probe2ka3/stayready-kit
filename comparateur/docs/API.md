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

## GET /api/v1/stores

`radius` ∈ {5, 10, 20, 30} km. Réponse : `chains` (présentes : nombre, distance de la plus proche),
`absentChains` (non visitables), `stores` (≤ 400, triées par distance, horaires du jour, ouverture
actuelle), `attribution`.

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
  "referenceChainId": null
}
```

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
