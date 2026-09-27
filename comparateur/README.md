# Cabas — comparateur de courses intelligent pour la Suisse

> « Cabas » est un **nom de travail** (recherche d'antériorité de marque à faire).

Plateforme web qui compare le coût d'un panier de courses entre les enseignes
présentes autour de l'utilisateur (Migros, Coop, Denner, Aldi Suisse, Lidl Suisse,
OTTO'S, Action, Aligro) et trouve **la combinaison de magasins la plus avantageuse,
trajet compris**, avec un itinéraire et une liste de courses par magasin.

- Parcours : localisation → magasins → panier → date des courses → comparaison → itinéraire.
- Trois scénarios : **un seul magasin**, **prix des produits le plus bas**, **coût global optimisé**
  (produits + trajet + temps, avec seuil d'économie minimale par magasin supplémentaire).
- Courses **maintenant** (horaires vérifiés à l'heure d'arrivée) ou **planifiées** (promotions déjà
  annoncées uniquement, distinction publication / validité, fuseau Europe/Zurich).
- Aucun compte : panier, favoris et listes restent dans le navigateur.
- Chaque prix affiche sa source, sa date de vérification et son statut de fiabilité.

**État actuel : mode démonstration.** Aucune enseigne ne publie d'API de prix et aucun accord n'est
conclu : les **prix sont fictifs** et identifiés comme tels partout. Les **succursales
(2 955, OpenStreetMap)**, les **localités (4 073, swisstopo)** et les **calendriers promotionnels**
sont réels. Voir [docs/STATUT.md](docs/STATUT.md).

## Démarrage rapide

Prérequis : Node.js 22, pnpm 10 (`corepack enable`).

```bash
cd comparateur
pnpm install
pnpm dev                      # http://localhost:3000 — mode « mémoire », sans base de données
```

### Avec PostgreSQL + PostGIS (mode complet, administration incluse)

```bash
cp .env.example .env          # renseigner DATABASE_URL, ADMIN_PASSWORD_HASH, SESSION_SECRET…
pnpm job seed                 # migrations + référentiel + localités + succursales + démo + qualité
DATA_BACKEND=postgres pnpm dev
```

Ou avec Docker : voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) (`docker compose`).

## Structure

```
comparateur/
├── packages/
│   ├── core/         Domaine pur : prix, promotions, dates, horaires, géographie, optimiseur
│   ├── reference/    Enseignes, zones tarifaires, catégories, catalogue normalisé (200 références)
│   ├── connectors/   Démo, import CSV/JSON, connecteur par enseigne, OSM, swisstopo
│   └── db/           Schéma Drizzle, migrations PostGIS, dépôts
├── apps/
│   ├── web/          Next.js : site public, API /api/v1, administration
│   └── worker/       Tâches planifiées (CLI) : seed, import, connecteurs, qualité
├── data/             Instantanés open data (localités, succursales) + exemples d'import
├── docs/             Audit, analyse juridique, architecture, algorithmes, données, déploiement
├── e2e/, e2e-admin/  Tests de bout en bout (Playwright)
└── Dockerfile, docker-compose.yml, .env.example
```

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Application web |
| `pnpm test` | Tests unitaires + intégration PostgreSQL (si `DATABASE_URL_TEST` joignable) |
| `pnpm test:e2e` | Tests navigateur du site public (mobile + bureau) |
| `pnpm test:e2e:admin` | Tests navigateur de l'administration (PostgreSQL requis) |
| `pnpm typecheck` | Vérification des types de tous les paquets |
| `pnpm job <tâche>` | `migrate`, `seed`, `reference`, `localities [--download]`, `stores [--download]`, `connectors`, `import <fichiers> --connector <id> [--dry-run]`, `quality`, `daily`, `weekly`, `status`, `purge-demo --confirm` |

## Documentation

| Document | Contenu |
|---|---|
| [docs/audit/01-enseignes.md](docs/audit/01-enseignes.md) | Audit des 8 enseignes : catalogues, prix, promotions, calendriers vérifiés, accès aux données |
| [docs/audit/02-juridique.md](docs/audit/02-juridique.md) | Analyse juridique préliminaire (LCD, OIP, LPD, LDA, LPM) sourcée sur Fedlex |
| [docs/STATUT.md](docs/STATUT.md) | Ce qui est opérationnel, ce qui attend une autorisation ou une validation |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Décisions d'architecture, modules, flux de données |
| [docs/ALGORITHMES.md](docs/ALGORITHMES.md) | Optimisation panier + itinéraire, prix, promotions, limites |
| [docs/DONNEES.md](docs/DONNEES.md) | Modèle de données, format d'import, correspondances, qualité |
| [docs/API.md](docs/API.md) | API publique `/api/v1` |
| [docs/SECURITE.md](docs/SECURITE.md) | Mesures de sécurité et de confidentialité |
| [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) | Installation, variables d'environnement, tâches planifiées, maintenance |

## Licences des données

- Localités : Source : Office fédéral de topographie swisstopo (OGD).
- Succursales : © les contributeurs d'OpenStreetMap, ODbL 1.0 (voir `data/stores/LICENSE.md`).
