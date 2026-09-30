# TesPrix — comparateur de courses intelligent pour la Suisse

> « TesPrix » est un **nom provisoire** (recherche d'antériorité et validation juridique à faire, voir
> [docs/IDENTITE.md](docs/IDENTITE.md)). Les paquets techniques gardent le préfixe `@cabas/*`.

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
- **Détours chiffrés** (économie brute, trajet ajouté, économie nette, seuil personnel, accepter/refuser) et
  signal **« attendre serait moins cher »** fondé sur les actions déjà annoncées.

**État actuel (phase 3) : prix réels officiels pour Lidl et Aldi, gratuit pour les consommateurs, service
non ouvert au public.**

- **Lidl** : prix officiels collectés chaque jour sur son site (3 012 articles avec prix, 531 actions dont 244
  futures), 194 références du catalogue couvertes.
- **Aldi Suisse** : prix officiels lus sur l'API publique de son site (1 484 articles avec prix, 712 actions),
  106 références couvertes.
- **Migros, Coop, Denner, OTTO'S** : relevés communautaires Open Prices (ODbL), peu nombreux, toujours
  signalés « indicatifs ». Leurs sites refusent l'accès automatisé ou l'interdisent : un accord est nécessaire.
- Moteur multi-sources (officiel > sous licence > communautaire), divergences signalées, tableau de qualité
  des données, API professionnelle (fermée par défaut).
- Le mode démonstration (prix fictifs) reste disponible et **n'est jamais mélangé** aux prix réels
  (`PRICE_DATA`).

Voir [docs/STATUT.md](docs/STATUT.md) et [docs/RAPPORT_PHASE3.md](docs/RAPPORT_PHASE3.md).

## Démarrage rapide

Prérequis : Node.js 22, pnpm 10 (`corepack enable`).

```bash
cd comparateur
pnpm install
pnpm dev                      # http://localhost:3000 — mode « mémoire », prix réels des instantanés data/prices/live
PRICE_DATA=demo pnpm dev      # données fictives de démonstration
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
│   ├── reference/    Enseignes, zones tarifaires, catégories, catalogue normalisé (240 références, priorités P1/P2/P3)
│   ├── connectors/   Démo, import CSV/JSON, Lidl, Aldi, Open Prices, FoodAlly (comparaison), OSM, swisstopo
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
| `pnpm job collect` | Collecte des prix réels (Lidl, Aldi, Open Prices) ; voir aussi `reprocess-lidl`, `reprocess-aldi`, `import-live`, `match-candidates`, `export-odbl`, `purge-source`, `rezone` |
| `pnpm job data-report` / `validate` | Couverture, fraîcheur et alertes de qualité ; contrôle du jeu de validation des essentiels |
| `pnpm job benchmark-foodally` | Comparaison ponctuelle avec FoodAlly (quota gratuit, aucune donnée intégrée) |

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
| [docs/audit/03-sources-prix.md](docs/audit/03-sources-prix.md) | Sources de prix réels : constats, décisions, blocages, charte de collecte |
| [docs/DATA_SURFACES.md](docs/DATA_SURFACES.md) | Surfaces de données first-party des enseignes (Migros, Coop, Aldi, Lidl, Denner) : champs, accès, limites |
| [docs/DATA_ENGINE.md](docs/DATA_ENGINE.md) | Moteur multi-sources : hiérarchie, confiance, divergences, qualité, couverture, validation |
| [docs/TICKETS.md](docs/TICKETS.md) | « Scanner mon ticket » : modèle, flux, confidentialité |
| [docs/MARCHE.md](docs/MARCHE.md) | Concurrence, affiliation vérifiée, données B2B (sections premium remplacées par le modèle v2) |
| [docs/BUSINESS_PLAN.md](docs/BUSINESS_PLAN.md) | Plan d'affaires de la phase 2 : coûts détaillés (toujours valables), revenus premium (remplacés) |
| [docs/BUSINESS_MODEL_V2.md](docs/BUSINESS_MODEL_V2.md) | Modèle v2 : gratuit pour les consommateurs, financé par le B2B (API, Intelligence, widget, sponsoring séparé) |
| [docs/IDENTITE.md](docs/IDENTITE.md) | Nom, domaines, marques proches, identité visuelle |
| [docs/LANCEMENT.md](docs/LANCEMENT.md) | Zone pilote, verrou de lancement, liste de contrôle d'ouverture |
| [docs/RAPPORT_PHASE2.md](docs/RAPPORT_PHASE2.md) | Compte rendu de la phase 2 |
| [docs/RAPPORT_PHASE3.md](docs/RAPPORT_PHASE3.md) | Compte rendu de la phase 3 : données, couverture, technique, modèle économique |

## Licences des données

- Localités : Source : Office fédéral de topographie swisstopo (OGD).
- Succursales : © les contributeurs d'OpenStreetMap, ODbL 1.0 (voir `data/stores/LICENSE.md`).
- Prix communautaires : Open Prices (Open Food Facts), ODbL 1.0 ; données dérivées exportables (`export-odbl`).
- Prix Lidl : faits (désignation, format, prix, dates) lus sur les pages publiques de Lidl Suisse ; aucune
  photo ni aucun texte descriptif repris.
- Prix Aldi Suisse : mêmes faits, lus sur l'API publique utilisée par son site (liste paginée, sans recherche
  ni fiche produit) ; aucune photo ni aucun texte descriptif repris.
- FoodAlly : utilisé uniquement pour une comparaison ponctuelle (quota anonyme, attribution) ; aucune de ses
  données n'est affichée ni intégrée sans licence.
