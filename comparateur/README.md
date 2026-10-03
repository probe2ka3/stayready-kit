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

**État actuel (collecte réelle du 03.10.2026) : collecte quotidienne automatique à 0 CHF** ([docs/COLLECTE_QUOTIDIENNE.md](docs/COLLECTE_QUOTIDIENNE.md))
sur les 50 aliments de base : Lidl 47/50 (publiable, sous réserve), Denner 34/50 et Aldi 23/50 (usage
privé, jamais publiés), Coop 6/50 (actions du journal, privé ; 1 relevé Open Prices publiable) et
Migros 0/50. Pilote privé : 41 besoins comparables dans ≥ 2 enseignes, 18 dans ≥ 3, 2 dans ≥ 4 ;
**version publique : 1** — ce n'est pas une comparaison des cinq enseignes, et l'interface le dit
(couverture par enseigne). Relevés en magasin qui feraient progresser la version publique :
[docs/RELEVES_PRIORITAIRES.md](docs/RELEVES_PRIORITAIRES.md). Une commande (`pnpm quotidien`),
planifiable dans Windows (`scripts/windows/`) ; alternative sans PC préparée et testée, non activée :
GitHub Actions dans un dépôt privé, avec un journal partagé avec Windows
([ops/actions-prive/README.md](ops/actions-prive/README.md)).
Cadre budgétaire : [docs/PLAN_SANS_DEPENSES.md](docs/PLAN_SANS_DEPENSES.md) ; relevés en magasin facultatifs :
[docs/RELEVES.md](docs/RELEVES.md).

Acquis de la phase 4 (comparateur grand public validé sur prix réels, non ouvert au public) :

- **Lidl** : prix officiels collectés chaque jour (3 012 articles avec prix, 531 actions), 200 références
  du catalogue couvertes.
- **Aldi Suisse** : prix officiels lus sur l'API publique de son site (1 484 articles, 712 actions),
  105 références ; ses conditions réservent les données à un **usage privé** : Aldi est **exclu de
  l'affichage en production** tant qu'aucune autorisation n'est enregistrée
  ([docs/DROITS_DONNEES.md](docs/DROITS_DONNEES.md)).
- **Migros, Coop, Denner** : relevés communautaires Open Prices rares, toujours « indicatifs ».
- Comparaison **enseigne seule / combinaison** avec montant payé par paquets, trajet aller-retour estimé
  (annoncé comme tel), économie après déplacement, couverture explicite, actions conditionnelles et
  régionales, courses à une date future.
- Mode démonstration (prix fictifs) séparé des prix réels (`PRICE_DATA`) ; paniers d'exemple réels sur
  `/fr/exemples`.

Voir [docs/STATUT.md](docs/STATUT.md) et [docs/RAPPORT_PHASE4.md](docs/RAPPORT_PHASE4.md).

## Démarrage rapide

Prérequis : Node.js 22, pnpm 10 (`corepack enable`).

```bash
cd comparateur
pnpm install
pnpm dev                      # http://localhost:3000 — mode « mémoire », prix réels des instantanés data/prices/live
                              # http://localhost:3000/fr/exemples : paniers réels de Lausanne, Bulle et Genève en un clic
RESTRICTED_SOURCES=exclude pnpm dev   # ce que verrait le public en production (Aldi exclu sans autorisation)
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
| `pnpm job benchmark-foodally` | Comparaison ponctuelle avec FoodAlly (plafond de 100 requêtes par jour, aucune donnée intégrée) |
| `pnpm job demo-baskets --now=…` / `match-audit` | Paniers de Lausanne, Bulle et Genève rejoués sur les prix réels ; correspondances manquantes à revoir |
| `pnpm test:e2e:demo` | Parcours des paniers d'exemple sur les prix réels, captures (`E2E_SCREENSHOTS=…`) |
| `pnpm quotidien [--force] [--sources=a,b]` | Chaîne quotidienne : collecte ciblée des 50 aliments (Lidl, Denner, Aldi, Open Prices), contrôles, exports publiables, journal `data/private/runs/` |
| `scripts/windows/installer-tache.ps1` | Tâche planifiée Windows (06:00, rattrapage, nouvel essai, journaux) |
| `pnpm job magasins --npa=…` / `releves` | Identifiants des magasins proches ; import des relevés en magasin (`data/releves/*.csv`) |
| `pnpm job matrice-essentiels` | Matrice 50 aliments × 5 enseignes (`data/matrice/`) et page publique statique (`data/public/index.html`) |

## Documentation

| Document | Contenu |
|---|---|
| [docs/audit/01-enseignes.md](docs/audit/01-enseignes.md) | Audit des 8 enseignes : catalogues, prix, promotions, calendriers vérifiés, accès aux données |
| [docs/audit/02-juridique.md](docs/audit/02-juridique.md) | Analyse juridique préliminaire (LCD, OIP, LPD, LDA, LPM) sourcée sur Fedlex |
| [docs/COLLECTE_QUOTIDIENNE.md](docs/COLLECTE_QUOTIDIENNE.md) | **Collecte quotidienne** : concurrents, sources par enseigne, chaîne, planification et vérification Windows, Cloudflare chiffré, exemple, blocages |
| [docs/COUVERTURE_NOYAU.md](docs/COUVERTURE_NOYAU.md) | Couverture des 50 aliments besoin par besoin (Aldi, Denner), actions Coop, canaux Migros et Coop examinés |
| [docs/AUTORISATIONS.md](docs/AUTORISATIONS.md) | Collecter ≠ publier, point juridique Lidl, demandes d'autorisation prêtes à copier (non envoyées) |
| [docs/NETTOYAGE_HISTORIQUE.md](docs/NETTOYAGE_HISTORIQUE.md) | Procédure (non exécutée) pour retirer les anciennes données Aldi de l'historique Git |
| [docs/PLAN_SANS_DEPENSES.md](docs/PLAN_SANS_DEPENSES.md) | Plan à 0 CHF : audit, sources gratuites testées, matrice, fonctionnement à 0 CHF, prochaines étapes |
| [docs/RELEVES.md](docs/RELEVES.md) | Relevés de prix en magasin : Open Prices ou CSV, règles, transcription assistée, 50 besoins |
| [docs/STATUT.md](docs/STATUT.md) | Ce qui est opérationnel, ce qui attend une autorisation ou une validation |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Décisions d'architecture, modules, flux de données |
| [docs/ALGORITHMES.md](docs/ALGORITHMES.md) | Optimisation panier + itinéraire, prix, promotions, limites |
| [docs/DONNEES.md](docs/DONNEES.md) | Modèle de données, format d'import, correspondances, qualité |
| [docs/API.md](docs/API.md) | API publique `/api/v1` |
| [docs/SECURITE.md](docs/SECURITE.md) | Mesures de sécurité et de confidentialité |
| [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) | Installation, variables d'environnement, tâches planifiées, maintenance |
| [docs/audit/03-sources-prix.md](docs/audit/03-sources-prix.md) | Sources de prix réels : constats, décisions, blocages, charte de collecte |
| [docs/DATA_SURFACES.md](docs/DATA_SURFACES.md) | Surfaces de données first-party des enseignes (Migros, Coop, Aldi, Lidl, Denner) : champs, accès, limites |
| [docs/DROITS_DONNEES.md](docs/DROITS_DONNEES.md) | Droits de réutilisation par source (Lidl, Aldi, Denner, Open Prices, FoodAlly…), évaluation FoodAlly, questions au fournisseur et pour l'avis juridique |
| [docs/DATA_ENGINE.md](docs/DATA_ENGINE.md) | Moteur multi-sources : hiérarchie, confiance, divergences, qualité, couverture, validation |
| [docs/TICKETS.md](docs/TICKETS.md) | « Scanner mon ticket » : modèle, flux, confidentialité |
| [docs/MARCHE.md](docs/MARCHE.md) | Concurrence, affiliation vérifiée, données B2B (sections premium remplacées par le modèle v2) |
| [docs/BUSINESS_PLAN.md](docs/BUSINESS_PLAN.md) | Plan d'affaires de la phase 2 : coûts détaillés (toujours valables), revenus premium (remplacés) |
| [docs/BUSINESS_MODEL_V2.md](docs/BUSINESS_MODEL_V2.md) | Modèle v2 (B2B) — **remplacé** par le plan sans dépenses |
| [docs/IDENTITE.md](docs/IDENTITE.md) | Nom, domaines, marques proches, identité visuelle |
| [docs/LANCEMENT.md](docs/LANCEMENT.md) | Zone pilote, verrou de lancement, liste de contrôle d'ouverture |
| [docs/RAPPORT_PHASE2.md](docs/RAPPORT_PHASE2.md) | Compte rendu de la phase 2 |
| [docs/RAPPORT_PHASE3.md](docs/RAPPORT_PHASE3.md) | Compte rendu de la phase 3 : données, couverture, technique, modèle économique |
| [docs/RAPPORT_PHASE4.md](docs/RAPPORT_PHASE4.md) | Compte rendu de la phase 4 : comparateur grand public, paniers et trajets, droits, budget minimal |

## Licences des données

- Localités : Source : Office fédéral de topographie swisstopo (OGD).
- Succursales : © les contributeurs d'OpenStreetMap, ODbL 1.0 (voir `data/stores/LICENSE.md`).
- Prix communautaires : Open Prices (Open Food Facts), ODbL 1.0 ; données dérivées exportables (`export-odbl`).
- Prix Lidl : faits (désignation, format, prix, dates) lus sur les pages publiques de Lidl Suisse ; aucune
  photo ni aucun texte descriptif repris.
- Prix Aldi Suisse : mêmes faits, lus sur l'API publique utilisée par son site (liste paginée, sans recherche
  ni fiche produit) ; aucune photo ni aucun texte descriptif repris. **Usage privé** : `data/private/`, hors dépôt.
- Prix Denner : faits lus sur les pages publiques du site (recherche, actions). **Usage privé** : `data/private/`,
  hors dépôt ; publication interdite sans accord écrit.
- FoodAlly : utilisé uniquement pour une comparaison ponctuelle (quota anonyme, attribution) ; aucune de ses
  données n'est affichée ni intégrée sans licence.
