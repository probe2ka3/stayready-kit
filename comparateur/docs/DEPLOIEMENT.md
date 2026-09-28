# Installation, déploiement et maintenance

## Prérequis

- Node.js 22 et pnpm 10 (`corepack enable`), ou Docker.
- PostgreSQL 16 avec **PostGIS 3** et **pg_trgm** (mode complet). Sans base, l'application fonctionne en
  mode démonstration « mémoire ».
- Recommandé : hébergement en Suisse ou dans l'UE (LPD, transferts à l'étranger).

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `SITE_URL` | `http://localhost:3000` | URL publique ; **aussi à fournir au build** (argument Docker `SITE_URL`) |
| `DATA_BACKEND` | `postgres` si `DATABASE_URL`, sinon `memory` | Source des données |
| `DATABASE_URL` | — | `postgres://utilisateur:motdepasse@hôte:5432/base` |
| `DATABASE_SSL` | `false` | TLS vers la base |
| `DATABASE_POOL_SIZE` | `10` | Connexions par instance web |
| `DATA_DIR` | `./data` | Instantanés open data |
| `IMPORT_DIR` | `<DATA_DIR>/imports/inbox` | Dépôt des fichiers d'import (un dossier par enseigne) |
| `ADMIN_USERNAME` | `admin` | Identifiant d'administration |
| `ADMIN_PASSWORD_HASH` | — | `node apps/web/scripts/hash-password.mjs` ; administration fermée si vide |
| `SESSION_SECRET` | — | ≥ 32 caractères aléatoires (`openssl rand -base64 48`) |
| `TRUST_PROXY` | `false` | Lire `X-Forwarded-For` (derrière un proxy de confiance uniquement) |
| `OSRM_URL` | — | Serveur d'itinéraires OSRM ; vide = estimation |
| `OVERPASS_URL` | `https://overpass.osm.ch/api/interpreter` | Import hebdomadaire des succursales |
| `HTTP_USER_AGENT` | — | Agent identifiable (avec contact) pour Overpass |
| `DEMO_DATA` | `true` | `false` : le connecteur de démonstration n'est plus exécuté |
| `PRICE_DATA` | `auto` | `live` : prix réels uniquement ; `demo` : données fictives uniquement ; `auto` : réel dès qu'un prix réel existe |
| `HTTP_USER_AGENT` | `TesPrixBot/0.1 (…)` | Agent de collecte identifiable, **avec contact de l'exploitant en production** (jamais un agent de navigateur) |
| `CRAWL_MIN_DELAY_MS` | `3000` | Délai minimal entre deux requêtes vers un même site (le `Crawl-delay` de robots.txt s'il est plus long) |
| `RAW_ARCHIVE_DIR` / `RAW_ARCHIVE_DAYS` | `<DATA_DIR>/raw` / `30` | Archive des pages lues (preuve du prix affiché), purge automatique |
| `LIDL_WEB` / `OPEN_PRICES` | actifs | `off` pour désactiver une source immédiatement |
| `OPEN_PRICES_MAX_AGE_DAYS` | `400` | Ancienneté maximale des relevés importés |
| `PUBLIC_ACCESS` | `open` | `waitlist` : seules la page d'attente et les pages d'information sont publiques |
| `PREVIEW_TOKEN` | — | ≥ 16 caractères : accès de prévisualisation `?acces=<jeton>` en mode `waitlist` |
| `SIGNUP_ENABLED` | `false` | Ouvre la liste d'attente (PostgreSQL requis) |
| `PILOT_CANTONS` | `GE,VD,NE,FR,VS,JU` | Zone pilote (message hors zone) |
| `BILLING_PROVIDER` | `none` | Paiement : seul `none` (désactivé) existe |
| `COST_*_CHF_MONTH`, `COST_DOMAIN_CHF_YEAR` | 0 | Coûts déclarés, affichés dans les indicateurs d'administration |
| `DATABASE_URL_TEST` | `postgres://cabas:cabas_dev_only@localhost:5432/cabas_test` | Tests d'intégration |

## Option A — Docker Compose (serveur unique)

```bash
cd comparateur
cp .env.example .env                      # renseigner POSTGRES_PASSWORD, SITE_URL, ADMIN_*, SESSION_SECRET
docker compose up -d db
docker compose run --rm worker seed       # migrations + données
docker compose up -d --build web          # écoute sur 127.0.0.1:3000
```

Placer un proxy inverse TLS (Caddy, nginx, Traefik) devant le port 3000 et définir `TRUST_PROXY=true`.

## Option B — Plateforme gérée

1. Base PostgreSQL gérée avec PostGIS (Neon, Supabase, Aiven, Exoscale DBaaS…) ; exécuter une fois
   `CREATE EXTENSION postgis; CREATE EXTENSION pg_trgm;` avec un rôle administrateur si nécessaire.
2. Application : `pnpm install --frozen-lockfile && pnpm build`, démarrage `pnpm start` (ou l'image
   `web` du Dockerfile, sortie Next.js autonome).
3. `pnpm job seed` depuis un poste ou un job ponctuel ayant accès à la base.

## Option C — Démonstration sans base

`DATA_BACKEND=memory pnpm build && pnpm start` : succursales et localités réelles, prix fictifs,
administration en lecture seule.

## Tâches planifiées

| Fréquence | Commande | Rôle |
|---|---|---|
| Quotidienne (ex. 05:15) | `pnpm job daily` | **Collecte des prix réels** (Lidl, Open Prices), imports déposés, contrôles qualité |
| Lundi et jeudi 07:10 | `pnpm job collect --only lidl-web` | Nouvelles actions Lidl (vagues du lundi et du jeudi) |
| Mercredi et jeudi 06:30 | `pnpm job connectors` | Imports structurés déposés pour les nouvelles actions |
| Hebdomadaire (lundi 04:10) | `pnpm job weekly` | Rafraîchissement des succursales OpenStreetMap |
| Trimestrielle | `pnpm job localities --download` | Rafraîchissement des localités swisstopo |

Exemple `crontab` (fuseau du serveur réglé sur Europe/Zurich) :

```cron
15 5 * * *   cd /srv/cabas/comparateur && pnpm job daily   >> /var/log/cabas/daily.log 2>&1
10 7 * * 1,4 cd /srv/cabas/comparateur && pnpm job collect --only lidl-web >> /var/log/cabas/collect.log 2>&1
30 6 * * 3,4 cd /srv/cabas/comparateur && pnpm job connectors >> /var/log/cabas/connectors.log 2>&1
10 4 * * 1   cd /srv/cabas/comparateur && pnpm job weekly  >> /var/log/cabas/weekly.log 2>&1
```

Avec Docker : `docker compose run --rm worker daily` dans le planificateur de l'hôte.

## Itinéraires routiers (facultatif)

Serveur OSRM auto-hébergé avec l'extrait Suisse de Geofabrik :

```bash
wget https://download.geofabrik.de/europe/switzerland-latest.osm.pbf
docker run -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/switzerland-latest.osm.pbf
docker run -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/switzerland-latest.osrm
docker run -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/switzerland-latest.osrm
docker run -d -p 5000:5000 -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/switzerland-latest.osrm
```

Puis `OSRM_URL=http://osrm:5000`. Le serveur de démonstration public d'OSRM ne doit pas être utilisé en
production (conditions d'utilisation). En cas d'indisponibilité, l'estimation prend le relais.

## Collecte des prix réels

| Tâche | Rôle |
|---|---|
| `pnpm job collect [--only lidl-web,open-prices]` | Collecte en ligne ; chaque source est isolée (une panne n'arrête pas les autres) ; alertes `connector_blocked`, `connector_failed`, `coverage_drop`, `parse_drift` |
| `pnpm job reprocess-lidl --date AAAA-MM-JJ` | Retraite une collecte depuis l'archive, sans nouvelle requête (après correction de l'analyseur) |
| `pnpm job import-live` | Charge les instantanés `data/prices/live/*.json` dans la base (amorçage) |
| `pnpm job match-candidates` | Feuille de revue des correspondances (`data/matching/candidates.json`) |
| `pnpm job export-odbl` | Exporte les données dérivées d'Open Prices sous ODbL (`data/exports/`) |
| `pnpm job rezone` | Recalcule les zones tarifaires des succursales (régions Lidl) |
| `pnpm job purge-source --connector <id> --confirm` | Retire toutes les données d'une source |

Les correspondances validées se trouvent dans `data/matching/reviewed.json` (versionné) : une revue prend
effet à la collecte suivante (base) ou immédiatement (mode mémoire).

Règles de collecte : `docs/audit/03-sources-prix.md` §7. En cas de demande d'une enseigne : `LIDL_WEB=off`
puis `pnpm job purge-source --connector lidl-web --confirm` (base et instantané ; action journalisée).

## Mises à jour du schéma

`pnpm job migrate` (idempotent). Après modification de `packages/db/src/schema.ts` :
`pnpm --filter @cabas/db generate` crée une nouvelle migration SQL à relire puis versionner.

## Sauvegardes et supervision

- Sauvegarde quotidienne de la base (`pg_dump -Fc`), rétention 30 jours, test de restauration mensuel.
- Sonde : `GET /api/v1/health` (`200` + `status: ok`).
- Alertes : exécutions `failed` dans `import_runs`, anomalies de gravité « erreur ».

## Tests

```bash
pnpm typecheck
pnpm test                         # unitaires + intégration (DATABASE_URL_TEST)
pnpm test:e2e                     # navigateur, site public (démarre le serveur)
E2E_DATABASE_URL=… E2E_ADMIN_HASH=… pnpm test:e2e:admin
```

Si Playwright ne peut pas télécharger ses navigateurs, indiquer un Chromium existant avec
`PW_CHROMIUM_PATH=/chemin/vers/chrome`. La CI (`.github/workflows/comparateur.yml`) exécute l'ensemble.

## Mise en production avec des prix réels — liste de contrôle

- [ ] Liste complète : `docs/LANCEMENT.md`.
- [ ] Sources de prix validées (voir `docs/audit/03-sources-prix.md`), `PRICE_DATA=live`.
- [ ] `DEMO_DATA=false`, puis `pnpm job purge-demo --confirm`.
- [ ] Mentions légales et politique de confidentialité complétées (exploitant, hébergeur, transferts).
- [ ] Validation juridique des points listés dans `docs/STATUT.md`.
- [ ] Nom définitif vérifié (Swissreg).
- [ ] `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` forts ; `/admin` restreint au niveau du proxy.
- [ ] Sauvegardes et supervision actives.

## Maintenance courante

- Chaque trimestre : revoir les calendriers promotionnels (`packages/reference/src/chains.ts`,
  `docs/audit/01-enseignes.md`) ; les anomalies « jour inhabituel » signalent un changement.
- Traiter les correspondances suggérées et les anomalies dans l'administration.
- Ajouter des références au catalogue : `packages/reference/src/products.ts` puis `pnpm job reference`.
