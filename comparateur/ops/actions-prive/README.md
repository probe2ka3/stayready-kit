# Collecte quotidienne sans PC : GitHub Actions dans un dépôt privé

## État au 03.10.2026, 21:55 (heure de Zurich)

Trois jalons distincts, dans cet ordre ; seul le troisième permettra de recommander l'arrêt de Windows.

| Jalon | État | Preuve |
|---|---|---|
| 1. Premier cycle réel, lancé à la main (ici : installation du workflow, déclencheur `push`) | ✅ **réussi** le 03.10.2026 à 21:22, les 5 sources en succès | [37147623292](https://github.com/probe2ka3/tesprix-collecte/actions/runs/37147623292) |
| 2. Premier déclenchement réel par la planification de GitHub (`schedule`) | ⏳ **pas encore observé** : premier créneau le **04.10.2026 à 06:17** (heure de Zurich) | `etat/suivi/SUIVI.md` du dépôt privé |
| 3. Sept jours consécutifs complets (collecte planifiée par GitHub, 5 sources en succès) | ⏳ **0/7** ; au plus tôt le 10.10.2026 si chaque jour du 04 au 10 est complet | idem |

Dépôt privé `probe2ka3/tesprix-collecte` : créé par l'exploitant le 03.10.2026 (privé, branche par
défaut `main`) ; workflow installé sur `main` (`.github/workflows/quotidien.yml`, commits `0e91420` puis
`9ddae04`), **actif** (API GitHub : `state: active`). Aucun secret, aucune variable de dépôt.

**Premier cycle réel** (exécution 37147623292, 21:22–21:34, job 12 min 30 s, 241 requêtes) :

| Source | Accès depuis GitHub | Collecte | Volume | Date des données | Sauvegarde dans le dépôt privé |
|---|---|---|---|---|---|
| Open Prices | ✅ | complète (succès) | 231 prix, 8 requêtes, 22 s | 03.10.2026 | `etat/prices-live/open-prices.json` (commit `4beb671`) |
| Journal Coop (édition romande) | ✅ | complète (succès) | 77 actions, 28 requêtes, 79 s | 03.10.2026 | `etat/private/live/coop-epaper.json` |
| Denner | ✅ | complète (succès) | 250 prix, 25 actions, 55 requêtes, 163 s | 03.10.2026 | `etat/private/live/denner-web.json` |
| Aldi | ✅ | complète (succès) | 1 481 prix, 558 actions, 44 requêtes, 131 s | 03.10.2026 | `etat/private/live/aldi-api.json` |
| Lidl | ✅ | complète (succès) | 424 prix, 290 actions, 106 requêtes, 315 s | 03.10.2026 | `etat/prices-live/lidl-web.json` |

Aucun blocage (403, anti-robot) depuis les adresses de GitHub. Journal du workflow relu ligne par ligne :
statuts seulement, **aucun prix ni article** ; état complet (6,4 Mo, ≈ 0,56 Mo compressé) dans le seul
dépôt privé ; cache HTTP dans le cache privé du dépôt.

**Essais réels du même soir** (lancements manuels ; ils ne comptent pas pour 7/7) :

| Essai | Résultat | Exécution |
|---|---|---|
| Collecte déjà faite, relance sans `force` | « rien » en 15 s : ni installation ni requête | [37148554048](https://github.com/probe2ka3/tesprix-collecte/actions/runs/37148554048) |
| Mise à jour du workflow (`push`) | « rien » en 10 s | [37149217813](https://github.com/probe2ka3/tesprix-collecte/actions/runs/37149217813) |
| Reprise de l'état : relance forcée d'Open Prices seul | état restauré depuis le dépôt : seul Open Prices relu ; les 4 autres instantanés **identiques octet pour octet** (SHA-256) ; matrice privée inchangée (Denner 34, Aldi 23, Coop 6 besoins) ; suivi : « non relue » pour les 4 autres | [37149241748](https://github.com/probe2ka3/tesprix-collecte/actions/runs/37149241748) |
| Verrou : verrou « Windows » simulé (commit `91d32eb`), relance **forcée** | « concurrence » en 16 s : aucune installation, aucune collecte ; verrou retiré ensuite (`03a187d`) | [37149327391](https://github.com/probe2ka3/tesprix-collecte/actions/runs/37149327391) |
| Reprise après échec | **pas observée en réel** (aucune source n'a échoué) ; testée sur dépôt simulé (`etat-partage.test.ts`, banc PowerShell) | — |

**La tâche Windows reste la solution de secours** jusqu'au jalon 3. Son fonctionnement sur votre PC
n'est pas vérifié (`docs/COLLECTE_QUOTIDIENNE.md` § 5.2).

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
- Les créneaux suivants (09:47, 14:17) ne reprennent que les sources en **échec technique** ou
  **incomplètes** (pages manquantes) ; une source réussie n'est jamais relue le même jour, une source
  bloquée (403) non plus. Un rattrapage collecte ce qui est publié au moment du lancement : il **ne
  reconstitue jamais** les prix des jours manqués.
- **Une source en échec ou bloquée rend l'exécution rouge** (après l'enregistrement de l'état) et figure
  en « ÉCHEC » dans `SUIVI.md` ; une source incomplète produit un avertissement visible dans le résumé
  du workflow (nombre de pages manquantes et adresse), ne compte pas pour 7/7 et est reprise au créneau
  suivant. Une source en échec garde ses données antérieures, affichées « données conservées du … (anciennes) » :
  jamais présentées comme une collecte du jour.
- Lidl : une page en erreur temporaire (5xx, délai) est relue une fois en fin de collecte ; une page
  retirée par Lidl (404/410 : article supprimé) est signalée sans rendre la collecte incomplète.

## 2. Conditions de GitHub (documentation officielle lue le 03.10.2026)

| Point | Vérifié | Source |
|---|---|---|
| Minutes incluses (dépôts privés) | GitHub Free : **2 000 min/mois** ; Pro : 3 000 ; remise à zéro chaque mois ; dépôts publics gratuits | [Facturation d'Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| Sans moyen de paiement | « usage is blocked once you use up your quota » : aucun dépassement facturé | idem |
| Avec moyen de paiement | un budget (compte personnel : *Product-level budget*, portée compte entier ou dépôt) n'arrête l'usage que si l'option **« Stop usage when budget limit is reached »** est cochée : « If you do not select Stop usage when budget limit is reached, you will be notified by email if you exceed your budget, but usage will not be stopped. » (correction du 03.10.2026 : la version précédente de ce document l'affirmait à tort pour tout budget de compte) | [Budgets](https://docs.github.com/en/billing/how-tos/set-up-budgets) |
| Décompte | minutes de chaque job arrondies à la minute supérieure ; Linux 2 cœurs : 0,006 $/min au-delà du quota | [Tarifs des exécuteurs](https://docs.github.com/en/billing/reference/actions-runner-pricing) |
| Cache | 10 Go par dépôt, entrées non lues depuis 7 jours supprimées ; caches d'un dépôt privé non publics | [Cache des dépendances](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) |
| Fuseau `Europe/Zurich` | clé `timezone` (IANA) documentée ; heure d'été : un horaire tombant dans l'heure sautée avance à l'heure suivante | [Syntaxe des workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) |
| Planification | branche par défaut seulement ; retards voire abandons aux heures chargées ; désactivation après 60 jours sans activité pour les dépôts **publics** | [Événements](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) |
| Usage admis | pas d'activité « unrelated to the production, testing, deployment, or publication of the software project » ; sanctions jusqu'à la suspension du compte | [Conditions des produits additionnels](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features) |

**Vérifié en réel** : la clé `timezone` est acceptée (workflow valide et actif) ; Aldi, Denner, le
journal Coop, Lidl et Open Prices répondent aux serveurs de GitHub (03.10.2026, une exécution).

**Incertain** : (1) **adéquation de l'usage** : la collecte alimente le logiciel TesPrix (données
d'évaluation), mais GitHub n'autorise pas expressément une collecte planifiée de sites tiers ; aucune
autorisation formelle ; risque : arrêt des tâches ou restriction du compte ; (2) **plan, quota restant et
moyen de paiement** : non consultables d'ici (l'accès de Claude est limité aux dépôts ; l'API de
facturation du compte est refusée ; l'API « timing » des exécutions renvoie 0 ms facturable, champ
abandonné par GitHub) ; le compte a d'autres dépôts privés qui partagent le quota ; (3) **respect de
l'heure** par la planification (`timezone`, retards possibles) : observé à partir du 04.10 06:17 ; (4)
retour à l'heure d'hiver (non décrit ; sans effet : 06:17 n'est pas dans l'heure répétée) ; (5) stabilité
de l'accès des enseignes depuis GitHub sur plusieurs jours ; (6) image des serveurs : `ubuntu-latest`
passe à Ubuntu 26 à partir du 19.10.2026 (avis de GitHub) ; à surveiller dans le suivi.

**Consommation** — *mesurée* le 03.10.2026 (durées des jobs, arrondies à la minute par job) : cycle
complet 12 min 30 s → **13 min** ; exécution « rien » ou « concurrence » 7 à 16 s → **1 min** ; relance
d'Open Prices seul 50 s → 1 min ; total de la soirée (installation et essais) : 17 min. *Estimée* : jour
normal = 1 cycle + 2 créneaux « rien » ≈ **15 min/jour ≈ 465 min/mois** ; jour avec une reprise de Lidl
(≈ 6 min) ≈ 21 min ; plafond réaliste ≈ 650 min/mois, sur 2 000 incluses (Free). Dépôt privé :
≈ 0,56 Mo compressé par collecte (≈ 200 Mo par an).

## 3. Ce qui reste à faire par l'exploitant

1. **Zéro dépense (seule vérification indispensable)** : <https://github.com/settings/billing> →
   *Payment information*.
   - **Aucun moyen de paiement** : rien à faire ; l'usage est bloqué une fois le quota épuisé.
   - **Un moyen de paiement** : *Budgets and alerts* → *New budget* (ou ⋯ → *Edit* sur un budget existant)
     → *Budget Type* : **Product-level budget** → produit **Actions** → *Budget scope* : **tout le compte**
     → *Budget* : **0** → cocher **Stop usage when budget limit is reached** → *Create budget* (ou *Save*).
   Ne changez pas d'abonnement et n'ajoutez aucun moyen de paiement. Usage du mois : même page,
   *Usage*, filtre « Actions ».
2. **Windows en mode partagé** (recommandé pendant l'observation ; sinon la tâche Windows, si elle est
   installée, collecte une seconde fois chaque jour avec son propre journal). Prérequis : Git pour
   Windows et Node.js (déjà requis par la collecte), le clone de `stayready-kit` sur la branche
   `claude/swiss-grocery-comparison-w7bk8q`. Dans PowerShell, depuis le dossier `comparateur` de ce clone :
   ```powershell
   git pull
   git clone https://github.com/probe2ka3/tesprix-collecte.git C:\TesPrix\tesprix-collecte
   powershell -ExecutionPolicy Bypass -File .\scripts\windows\installer-tache.ps1 -DepotEtat C:\TesPrix\tesprix-collecte
   powershell -ExecutionPolicy Bypass -File .\scripts\windows\verifier-tache.ps1
   ```
   (Git pour Windows demande une fois la connexion à GitHub pour le dépôt privé.) La tâche passe à
   **15:30**, après le dernier créneau GitHub (14:17), sans rattrapage à l'ouverture de session : elle ne
   collecte que ce que GitHub n'a pas réussi dans la journée et écrit dans le même `SUIVI.md`. Une
   collecte par Windows ne compte pas pour 7/7.
3. Après **7/7** dans `SUIVI.md` (jalon 3) : désactiver la tâche Windows
   (`Disable-ScheduledTask -TaskName "TesPrix - collecte quotidienne"`).

Si une source refusait un jour les serveurs de GitHub (statut BLOQUÉ dans le suivi) : *Settings* →
*Secrets and variables* → *Actions* → *Variables* → **`TESPRIX_SOURCES`** = les autres sources séparées
par des virgules (`open-prices,coop-epaper,denner-web,aldi-api,lidl-web` sans la source refusée) ; Windows
collecte alors la source retirée. Aucun contournement (autre adresse, autre identité). Lancement manuel :
onglet *Actions* → *Run workflow* (`force` pour relancer, `sources` pour en limiter la liste). Option :
variable `TESPRIX_CODE_REF` pour lire une autre branche du code (ex. `main` après fusion).

## 4. Suivi sur 7 jours

`etat/suivi/SUIVI.md` du dépôt privé est **régénéré automatiquement à chaque exécution** (GitHub, ou
Windows en mode partagé ; un fichier par exécution dans `etat/suivi/executions/`). En tête, les trois
jalons (premier cycle manuel, premier déclenchement `schedule`, **n/7**) ; puis une ligne par jour, y
compris les **jours sans aucun déclenchement** :

- déclenchements : heure de Zurich, système, type (`schedule`, `workflow_dispatch`, `push`,
  `windows-tache`) et issue (collecte, rien, concurrence, echec), avec le lien de l'exécution ;
- « Compte pour 7/7 » : ✅, ou ❌ et la raison ;
- par source : statut final, volume lu (prix, actions), date des données conservées ;
  « contenu identique à la veille » = lecture réussie sans nouvelle offre (normal, ex. journal Coop
  entre deux éditions) ; « données conservées du … (anciennes) » = pas de lecture réussie ce jour-là ;
- erreurs (message de la source, nombre de pages manquantes).

**Un jour compte pour 7/7** seulement si les 5 sources ont fini en **succès** lors de déclenchements
planifiés de GitHub (`schedule` ; une source incomplète à 06:17 reprise avec succès à 09:47 compte).
Ne comptent pas : un lancement manuel, une installation, une collecte Windows, une exécution « rien »
seule, une source partielle, en échec ou bloquée ; un jour sans exécution remet le compteur à zéro.

**Contrôlé par le workflow, sans intervention** : la date du jour, le besoin de collecter, le verrou,
la reprise des sources en échec ou incomplètes, le statut et le volume de chaque source, la sauvegarde
de l'état, le tableau et le compteur, et la couleur de l'exécution (rouge si une source échoue).
**Non contrôlé par le workflow** (nouvelle consultation nécessaire) : l'absence totale de déclenchement
(si GitHub ne lance rien, rien n'est écrit ; seule la date « Mis à jour le » de `SUIVI.md` le révèle) ; la
consommation de minutes du compte ; la plausibilité des prix eux-mêmes au-delà des contrôles automatiques
(non-régression, rapport de qualité). Claude reconsulte `SUIVI.md` et les exécutions aux dates prévues
(premier créneau planifié, puis fin des sept jours) si une reprise de session est programmée.

## 5. Fichiers

| Fichier | Rôle |
|---|---|
| `quotidien.yml` | workflow à copier dans le dépôt privé |
| `github.sh` | étapes du workflow : `debut` (besoin, verrou), `collecte`, `fin` (suivi, enregistrement, verdict) |
| `etat.mjs` | état partagé : besoin, verrou, restaurer, enregistrer, noter, tableau (Node.js seul) |
| `cycle.sh` | cycle sans dépôt (essai du dépôt public, sources publiables seulement) |
