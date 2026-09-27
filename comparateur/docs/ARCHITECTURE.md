# Architecture

## Décisions principales

| Décision | Choix | Raison |
|---|---|---|
| Organisation | Monorepo pnpm : 4 paquets + 2 applications | Modules séparés et remplaçables ; le cœur métier ne dépend d'aucun framework |
| Cœur métier | TypeScript pur (`@cabas/core`), sans dépendance | Testable en isolation, réutilisable côté serveur, tâches et (partiellement) navigateur |
| Web | Next.js 16 (App Router), React 19, Tailwind CSS 4 | Rendu statique des pages publiques (SEO, rapidité), API et administration dans le même déploiement |
| API | Route Handlers `/api/v1/*`, validation zod | Couche d'API indépendante de l'interface, versionnée |
| Base | PostgreSQL 16 + PostGIS, Drizzle ORM, migrations SQL versionnées | Recherche géographique indexée (GiST), requêtes paramétrées typées |
| Mode sans base | Adaptateur « mémoire » (instantanés open data + démo) | Démarrage immédiat, démonstration, tests de bout en bout sans infrastructure |
| Tâches planifiées | CLI `@cabas/worker` (cron externe) | Indépendant de l'hébergeur (cron système, planificateur de la plateforme, CI) |
| Itinéraires | Interface `TravelMatrixProvider` : estimation par défaut, OSRM optionnel | Aucune dépendance obligatoire à un service tiers |
| État utilisateur | localStorage (zustand) | Aucun compte, minimisation des données (LPD) |
| Hors ligne | Service worker minimal | Listes consultables en magasin sans réseau |
| Langues | Segment `/[locale]`, dictionnaires typés, contenus par langue | Français publié ; allemand, italien, anglais prévus sans refonte |

## Modules (correspondance avec le cahier des charges)

| # | Module demandé | Emplacement |
|---|---|---|
| 1 | Gestion des enseignes | `packages/reference/src/chains.ts`, table `chains` |
| 2 | Gestion des succursales | `packages/connectors/src/osm-stores.ts`, `packages/db/src/repo-stores.ts`, table `stores` (PostGIS) |
| 3 | Catalogue normalisé | `packages/reference/src/products.ts`, tables `canonical_products`, `product_matches` |
| 4 | Connecteurs de prix | `packages/connectors/src/{chains,demo,file-import}.ts` — un connecteur par enseigne |
| 5 | Promotions | `packages/core/src/pricing.ts` (application), table `promotions`, contrôles `quality.ts` |
| 6 | Panier | `apps/web/src/lib/store.ts`, `components/basket-view.tsx` |
| 7 | Moteur de comparaison | `packages/core/src/{pricing,compare}.ts` |
| 8 | Optimisation des trajets | `packages/core/src/{optimizer,travel,opening-hours}.ts`, `apps/web/src/server/routing.ts` |
| 9 | Interface utilisateur | `apps/web/src/app/(site)`, `apps/web/src/components` |
| 10 | Administration | `apps/web/src/app/(admin)`, `apps/web/src/server/admin-actions.ts` |

## Dépendances entre paquets

```
            ┌──────────────┐
            │ @cabas/core  │  domaine pur (aucune dépendance)
            └──────┬───────┘
       ┌───────────┼──────────────┬───────────────┐
┌──────▼──────┐ ┌──▼───────────┐ ┌▼────────────┐   │
│  reference  │ │  connectors  │ │     db      │   │
└──────┬──────┘ └──┬───────────┘ └┬────────────┘   │
       └────────┬──┴──────────────┴───┐            │
          ┌─────▼─────┐          ┌────▼─────┐      │
          │ apps/web  │          │  worker  │      │
          └───────────┘          └──────────┘
```

## Flux d'une comparaison

1. Le navigateur envoie `POST /api/v1/compare` : position, rayon, panier, préférences, date, réglages de trajet.
2. Validation (zod), limitation de débit, contrôle d'origine.
3. Couche de données (`AppData`, PostgreSQL ou mémoire) : succursales dans le rayon (PostGIS
   `ST_DWithin`), références normalisées, index des offres (correspondances validées, dernier prix par
   portée, promotions publiées sur l'horizon de planification).
4. `compareBasket` (cœur) : profils de prix → coût de chaque ligne dans chaque profil → élagage des
   succursales (ouvertes, les plus proches) → matrice de déplacement → optimisation → résultat JSON.
5. Aucune donnée de la requête n'est enregistrée.

## Flux des données de prix

```
Source autorisée / relevé / fichier ──► Connecteur d'enseigne ──► validation ──► applyBatch (transaction)
                                                                                   │
            tâche quotidienne `pnpm job daily` ◄──────────────────────────────────┘
                     │
                     ├─ contrôles qualité (anomalies, expiration)
                     └─ journal (`import_runs`, `audit_log`)
```

## Extensibilité

- **Nouvelle enseigne** : ajouter une entrée dans `CHAINS` (calendrier, programmes de fidélité) ; son
  connecteur est créé automatiquement ; ses succursales sont classées dans `classifyOsm`.
- **Flux officiel** : implémenter `OfficialFeed` et le passer au `ChainConnector` de l'enseigne.
- **Nouvelle catégorie / référence** : `packages/reference`, puis `pnpm job reference`.
- **Nouvelle langue** : dictionnaire `messages/<l>.ts`, entrée dans `LOCALES`, contenus `src/content/<l>/`.
- **Autre fournisseur d'itinéraires** : implémenter `TravelMatrixProvider`.
- **Montée en charge** : limitation de débit et caches sont en mémoire du processus ; au-delà d'une
  instance, les remplacer par un stockage partagé (Redis) derrière les mêmes interfaces.
