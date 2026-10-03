# Collecte quotidienne sur GitHub Actions, dans un dépôt privé (préparé, non activé)

État au 03.10.2026 :

| Étape | État |
|---|---|
| Code préparé (`quotidien.yml`, `cycle.sh`) | ✅ dans ce dossier |
| Cycle testé localement sans état préalable, puis relancé (une collecte par jour, reprise des seules sources en échec) | ✅ 03.10.2026, sur une copie des données |
| Lancement réel sur les serveurs de GitHub | ✅ 03.10.2026, même script, **sources publiables seulement** (Lidl, Open Prices), dans le dépôt public (`.github/workflows/tesprix-essai-cycle.yml`, exécution 37114095944) : Lidl 424 prix + 290 actions en 313 s, Open Prices 246 prix en 25 s, 6 étapes OK, job de 6 min 01 s (`docs/COLLECTE_QUOTIDIENNE.md` § 5.1.2) |
| Dépôt privé créé, workflow installé, lancement manuel réussi | ❌ à faire par l'exploitant (ci-dessous) |
| Planification activée, lancement automatique observé | ❌ non observé |

Tant que des lancements automatiques n'ont pas été observés pendant une semaine, **la tâche Windows
reste la solution en service** (`docs/COLLECTE_QUOTIDIENNE.md` § 5.2).

## 1. Pourquoi un dépôt privé séparé

- Le dépôt `stayready-kit` est **public** : ses journaux, caches et artefacts d'Actions sont lisibles
  par tous. Ils ne sont jamais un stockage privé : les données d'Aldi, de Denner et du journal Coop
  (usage privé) n'y passent jamais.
- Dans un dépôt privé, le code est lu depuis le dépôt public (lecture seule, aucun jeton) ; l'état
  (instantanés, journal des exécutions, matrice et paniers privés) est enregistré dans le dépôt privé
  lui-même (`etat/`), par des commits. Ni archive brute, ni artefact.
- Les conditions des sources restent respectées : collecte pour l'évaluation privée de l'exploitant,
  jamais publiée.

## 2. Coûts, quotas et conditions (documentation officielle lue le 03.10.2026)

| Point | Constat | Source |
|---|---|---|
| Minutes incluses | GitHub Free, dépôts privés : **2 000 min/mois** (exécuteur Linux standard) ; dépôts publics : gratuits | [Facturation d'Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| Dépassement | « If your account does not have a valid payment method on file, usage is blocked once you use up your quota. » | idem |
| Stockage | artefacts 500 Mo (non utilisés ici) ; cache **10 Go par dépôt**, entrées non lues depuis 7 jours supprimées | idem ; [Cache des dépendances](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) |
| Planification | branche par défaut seulement ; **retards possibles, voire exécutions abandonnées** aux heures chargées (début d'heure) ; fuseau IANA possible (`timezone`), heure d'été gérée | [Événements](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [Syntaxe](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) |
| Inactivité | désactivation après 60 jours sans activité : **dépôts publics** seulement (ici, un commit par jour) | idem |
| Usage admis | exécuteurs hébergés : pas d'activité « unrelated to the production, testing, deployment, or publication of the software project associated with the repository », pas d'usage « as part of a serverless application » ; sanctions possibles jusqu'à la suspension du compte | [Conditions des produits additionnels](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features) |

**Zone grise à assumer** : la collecte alimente le logiciel TesPrix (données de test et
d'évaluation), mais GitHub n'autorise pas expressément une collecte planifiée de sites tiers ; aucune
autorisation formelle. Risque : arrêt des tâches ou restriction du compte. Le PC Windows n'a pas ce
risque.

**Consommation estimée** : cycle complet mesuré le 03.10.2026 dans l'environnement de développement :
**10 min 50 s** (Lidl 5 min 19 s, Denner 2 min 43 s, Aldi 2 min 11 s, Open Prices 22 s, Coop 6 s avec
le cache de la semaine) ; sur les serveurs de GitHub, Lidl + Open Prices : 5 min 38 s de cycle, 6 min
01 s de job (installation 4 s). Cycle complet estimé ≈ 12 min ; créneaux de rattrapage sans collecte à
faire : < 1 min (le test de l'état précède l'installation). Soit ≈ 12 × 30 + 2 × 30 ≈ **400 min/mois sur
2 000**, partagées avec les autres dépôts **privés** du compte (les dépôts publics ne consomment rien).
Croissance du dépôt privé : état compressé ≈ 0,7 Mo, réécrit chaque jour (≈ 250 Mo/an au pire).

Non testé depuis GitHub : l'accès d'Aldi, de Denner et du journal Coop depuis les adresses des
serveurs de GitHub (un site peut refuser les adresses de centres de données) ; il sera visible dans le
résumé du premier lancement manuel.

## 3. Actions restantes (exploitant, ≈ 10 min)

1. **Aucun dépassement facturable** : GitHub → *Settings* → *Billing and licensing* → *Payment
   information* : aucun moyen de paiement. S'il y en a un : *Budgets and alerts* → budget **0 $** pour
   Actions avec **« Stop usage when budget limit is reached »** coché.
2. **Créer un dépôt privé** (ex. `tesprix-collecte`), *Private*, avec un README (branche `main`).
3. Y ajouter le fichier **`.github/workflows/quotidien.yml`** = copie exacte de
   [`quotidien.yml`](quotidien.yml), sur `main` (la planification ne lit que la branche par défaut).
   Variante : ajouter ce dépôt à une session Claude avec accès en écriture, qui le poussera.
4. **Premier lancement manuel** : onglet *Actions* → « TesPrix — collecte quotidienne (privé) » →
   *Run workflow*. Contrôler le résumé (statut par source, durées) et le commit « Collecte du … ».
5. Les jours suivants : vérifier les exécutions planifiées (06:17, rattrapages 09:47 et 14:17, heure
   de Zurich) et les commits quotidiens. Après **7 jours** d'exécutions automatiques réussies,
   désactiver la tâche Windows (`Disable-ScheduledTask -TaskName "TesPrix - collecte quotidienne"`),
   pour ne pas collecter deux fois.

Option : variable de dépôt `TESPRIX_CODE_REF` (*Settings* → *Secrets and variables* → *Actions* →
*Variables*) pour lire une autre branche du code (ex. `main` après fusion). Aucun secret n'est requis.

Si la clé `timezone` était refusée par GitHub, la remplacer par deux créneaux UTC (`17 4 * * *` et
`17 5 * * *`) : une seule collecte a lieu par jour de Zurich, le second créneau ne fait rien.

## 4. Fonctionnement

- `cycle.sh <dossier-etat>` : reprend l'état (sources publiables : seulement si plus récent que celui
  du code, `live-restore`), lance `pnpm quotidien`, réécrit l'état. Code de sortie de `quotidien`
  conservé ; l'état est enregistré même après un échec partiel.
- **Une collecte par jour de Zurich** ; relancé le même jour, seules les sources en échec technique sont
  reprises ; une source bloquée (403) ne l'est pas. Un rattrapage collecte ce qui est publié au moment
  du lancement : il **ne reconstitue jamais les prix des jours manqués**.
- **Doublons** : un seul cycle à la fois (`concurrency`) ; même identifiant de prix → remplacé, jamais
  ajouté deux fois ; verrou `quotidien.lock` jamais enregistré.
- **Échecs partiels** : une source en échec garde ses données précédentes avec leur date d'origine
  (elles vieillissent : « indicatif » après 7 jours, écartées après 30).
- Archives brutes : dossier temporaire de l'exécuteur, effacé à la fin. Cache HTTP (textes du journal
  Coop) : cache Actions du dépôt privé, fichiers de plus de 10 jours purgés.
