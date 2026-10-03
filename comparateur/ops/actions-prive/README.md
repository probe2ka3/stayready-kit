# Collecte quotidienne sans PC : GitHub Actions dans un dépôt privé

## État au 03.10.2026

| Étape | État | Preuve |
|---|---|---|
| Préparé : workflow du dépôt privé (`quotidien.yml`), étapes (`github.sh`), état partagé (`etat.mjs`), mode partagé de la tâche Windows | ✅ | ce dossier ; `scripts/windows/` |
| Testé localement : dépôt privé simulé (dépôt Git nu), 4 exécutions : premier cycle, créneau suivant « rien à faire », verrou tenu par Windows (« concurrence »), reprise d'une source mise en échec | ✅ | `apps/worker/test/etat-partage.test.ts`, banc PowerShell `scripts/windows/tests/tester-scripts.ps1` (9 contrôles du mode partagé) |
| Testé manuellement sur les serveurs de GitHub : même cycle, **sources publiables seulement** (Lidl, Open Prices), dans le dépôt public | ✅ 03.10.2026 (exécution 37114095944 ; nouvel essai avec `etat.mjs` à la poussée de cette étape) | `docs/COLLECTE_QUOTIDIENNE.md` § 5.1.2 |
| Dépôt privé `probe2ka3/tesprix-collecte` créé | ❌ **impossible d'ici** : l'intégration GitHub de Claude n'a pas le droit de créer un dépôt (« 403 Resource not accessible by integration ») | § 3, étape 2 |
| Aldi, Denner, journal Coop essayés depuis GitHub | ❌ pas encore (seulement depuis le dépôt privé, jamais depuis le dépôt public) | premier lancement, § 3 |
| Planification activée, exécution automatique observée | ❌ non | `etat/suivi/SUIVI.md` du dépôt privé |

**La tâche Windows reste la solution en service** jusqu'à 7 jours consécutifs de collectes automatiques
réussies par GitHub, comptés par `etat/suivi/SUIVI.md` (§ 4). Son fonctionnement sur votre PC n'est
lui-même pas vérifié (`docs/COLLECTE_QUOTIDIENNE.md` § 5.2).

## 1. Principe

- Le dépôt public `stayready-kit` ne sert jamais de stockage privé : ses journaux, caches et artefacts
  sont lisibles par tous. Aldi, Denner et le journal Coop (usage privé) n'y passent jamais.
- Dans le dépôt privé, le code est lu depuis le dépôt public (lecture seule, aucun jeton) ; l'état
  (instantanés, journal des exécutions, matrice et paniers privés, suivi) est enregistré dans le dépôt
  privé, dossier `etat/`, par des commits. Ni archive brute, ni artefact ; la sortie détaillée de la
  collecte reste sur le serveur d'exécution (effacé à la fin) ; le journal du workflow ne montre que des
  statuts et des volumes par source.
- **Un seul journal pour GitHub et Windows** : la tâche Windows en mode partagé (`-DepotEtat`) lit et
  écrit le même dossier `etat/`. Une collecte par jour de Zurich, quel que soit le système ; un verrou
  (`etat/verrou.json`, poussé avant la collecte) empêche deux collectes simultanées ; l'autre système
  note « concurrence » et s'arrête. Sans mode partagé, deux systèmes ayant chacun leur journal
  collecteraient deux fois.
- Les créneaux suivants (09:47, 14:17) ne reprennent que les sources en **échec technique** ; une source
  bloquée (403) n'est pas relancée le même jour. Un rattrapage collecte ce qui est publié au moment du
  lancement : il **ne reconstitue jamais** les prix des jours manqués.
- **Une source en échec ou bloquée rend l'exécution rouge** (après l'enregistrement de l'état) et figure
  en « ÉCHEC » dans `SUIVI.md` ; une source partielle produit un avertissement.

## 2. Conditions de GitHub (documentation officielle lue le 03.10.2026)

| Point | Vérifié | Source |
|---|---|---|
| Minutes incluses (dépôts privés) | GitHub Free : **2 000 min/mois** ; Pro : 3 000 ; remise à zéro chaque mois ; dépôts publics gratuits | [Facturation d'Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| Sans moyen de paiement | « usage is blocked once you use up your quota » : aucun dépassement facturé | idem |
| Avec moyen de paiement | un budget de compte (« user-level ») pour Actions **arrête toujours l'usage** à la limite ; budget à 0 $ = aucun dépassement | [Budgets](https://docs.github.com/en/billing/how-tos/set-up-budgets) |
| Cache | 10 Go par dépôt, entrées non lues depuis 7 jours supprimées ; caches d'un dépôt privé non publics | [Cache des dépendances](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) |
| Fuseau `Europe/Zurich` | clé `timezone` (IANA) documentée ; heure d'été : un horaire tombant dans l'heure sautée avance à l'heure suivante | [Syntaxe des workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) |
| Planification | branche par défaut seulement ; retards voire abandons aux heures chargées ; désactivation après 60 jours sans activité pour les dépôts **publics** | [Événements](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) |
| Usage admis | pas d'activité « unrelated to the production, testing, deployment, or publication of the software project » ; sanctions jusqu'à la suspension du compte | [Conditions des produits additionnels](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features) |

**Incertain** : (1) **adéquation de l'usage** : la collecte alimente le logiciel TesPrix (données
d'évaluation), mais GitHub n'autorise pas expressément une collecte planifiée de sites tiers ; aucune
autorisation formelle ; (2) **plan et consommation du compte** : non consultables d'ici (accès limité au
dépôt) ; le compte a 4 autres dépôts privés qui partagent le quota ; (3) **moyen de paiement enregistré
ou non** : à vérifier par vous (§ 3, étape 1) ; (4) retour à l'heure d'hiver (non décrit ; sans effet ici :
06:17 n'est pas dans l'heure répétée) ; (5) accès d'Aldi, de Denner et du journal Coop depuis les
adresses de GitHub (premier lancement).

**Consommation estimée** : cycle complet ≈ 12 min (mesuré : 10 min 50 s ici ; Lidl + Open Prices : 5 min 38 s
sur GitHub) + installation ; créneaux sans collecte < 1 min (pas d'installation) : **≈ 400 min/mois sur
2 000**. Dépôt privé : état compressé ≈ 0,7 Mo par jour au pire (≈ 250 Mo par an).

## 3. Manipulations restantes (vous seul ; ≈ 10 min)

1. **Zéro dépense** : <https://github.com/settings/billing> → *Payment information* : aucun moyen de
   paiement. S'il y en a un : *Budgets and alerts* → *New budget* → *Product-level budget*, produit
   **Actions**, portée **compte entier**, montant **0** → *Create budget*. Ne changez pas d'abonnement.
2. **Créer le dépôt privé** : <https://github.com/new> → *Owner* `probe2ka3`, *Repository name*
   **`tesprix-collecte`**, **Private**, cocher **Add a README file** → *Create repository*.
3. **Installer le workflow**, au choix :
   - (a) dans le dépôt : *Add file* → *Create new file* → nom **`.github/workflows/quotidien.yml`** →
     coller le contenu de
     <https://raw.githubusercontent.com/probe2ka3/stayready-kit/claude/swiss-grocery-comparison-w7bk8q/comparateur/ops/actions-prive/quotidien.yml>
     → *Commit changes* sur `main`. Ce commit lance aussitôt le premier cycle (déclencheur `push`) ;
   - (b) ou dites à Claude « le dépôt tesprix-collecte existe » : il l'attache à la session, installe le
     fichier, lance et contrôle le premier cycle.
4. **Contrôler le premier cycle** : onglet *Actions* → « TesPrix — collecte quotidienne (privé) » : résumé
   par source ; fichier `etat/suivi/SUIVI.md`. Si une source refuse les serveurs de GitHub (statut
   BLOQUÉ) : *Settings* → *Secrets and variables* → *Actions* → *Variables* → **`TESPRIX_SOURCES`** =
   `open-prices,coop-epaper,denner-web,aldi-api,lidl-web` sans la source refusée (Windows la collecte alors).
5. **Windows en mode partagé** (pendant les 7 jours d'observation), dans PowerShell :
   ```powershell
   git clone https://github.com/probe2ka3/tesprix-collecte.git C:\TesPrix\tesprix-collecte
   cd <dossier stayready-kit>\comparateur
   git pull
   powershell -ExecutionPolicy Bypass -File .\scripts\windows\installer-tache.ps1 -DepotEtat C:\TesPrix\tesprix-collecte
   ```
   La tâche passe à 07:30 : elle ne collecte que si GitHub ne l'a pas fait ; elle écrit son suivi dans le
   même `SUIVI.md`. (Identifiants Git : demandés une fois par Git pour Windows.)
6. Après **7 jours** consécutifs comptés par `SUIVI.md` : désactiver la tâche Windows
   (`Disable-ScheduledTask -TaskName "TesPrix - collecte quotidienne"`).

Option : variable de dépôt `TESPRIX_CODE_REF` pour lire une autre branche du code (ex. `main` après
fusion). Aucun secret n'est requis. Si la clé `timezone` était refusée (fichier signalé invalide), la
remplacer par deux créneaux UTC (`17 4 * * *` et `17 5 * * *`) : une seule collecte a lieu par jour.

## 4. Suivi sur 7 jours

`etat/suivi/SUIVI.md` (régénéré à chaque exécution, un fichier par exécution dans `etat/suivi/executions/`)
indique pour chaque jour : chaque déclenchement (heure de Zurich, système, type : `schedule` = planifié
par GitHub, `workflow_dispatch` = manuel, `push` = installation, `windows-tache` = tâche Windows), son
issue (collecte, rien à faire, concurrence évitée, échec), et pour chaque source le **statut final**, la
**date des données conservées** (une source en échec garde des données plus anciennes : leur date le
montre) et l'**erreur**. En tête : « Jours consécutifs où GitHub a collecté automatiquement, toutes
sources lues : n/7 ». Ne comptent que les jours où un déclenchement `schedule` de GitHub a fait la
collecte et où chaque source a fini en succès ou partiel ; un jour manquant remet le compteur à zéro.

## 5. Fichiers

| Fichier | Rôle |
|---|---|
| `quotidien.yml` | workflow à copier dans le dépôt privé |
| `github.sh` | étapes du workflow : `debut` (besoin, verrou), `collecte`, `fin` (suivi, enregistrement, verdict) |
| `etat.mjs` | état partagé : besoin, verrou, restaurer, enregistrer, noter, tableau (Node.js seul) |
| `cycle.sh` | cycle sans dépôt (essai du dépôt public, sources publiables seulement) |
