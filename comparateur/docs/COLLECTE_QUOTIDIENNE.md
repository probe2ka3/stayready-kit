# Collecte quotidienne des prix — compte rendu et guide d'exploitation (01.10.2026, mis à jour le 03.10.2026)

Objectif de l'étape : récupérer **automatiquement chaque jour**, à 0 CHF, les prix des 50 aliments de
base chez Migros, Coop, Denner, Aldi et Lidl, sans que les relevés en magasin soient une condition de
fonctionnement. Mesures faites sur un cycle réel exécuté le 01.10.2026 à 00:28 (heure de Zurich),
mises à jour après l'étape « couverture » du même jour (journal Coop, revue Aldi et Denner :
`docs/COUVERTURE_NOYAU.md`).

## 1. Résultat en bref

| Enseigne | Collecteur automatique | Source | Besoins du noyau avec prix | Lus le jour même | Publication |
|---|---|---|---|---|---|
| **Lidl** | ✅ opérationnel | Site officiel (catégories alimentaires, fiches du noyau, actions) | **47/50** | 47 | Oui, sous réserve (conditions muettes, `robots.txt` ambigu) |
| **Denner** | ✅ opérationnel | Site officiel : recherche ciblée, pages thématiques de l'assortiment, actions | **34/50** | 31 | **Non** : « publication ou fins commerciales » interdites sans accord écrit |
| **Aldi** | ✅ opérationnel | API publique du site (liste paginée) | **23/50** | 23 | **Non** : conditions « fins privées uniquement » |
| **Coop** | ⚠️ **actions seulement** (nouveau) | Journal numérique officiel (magazine des actions, édition romande) + Open Prices | **6/50** (actions de la semaine) | 6 | **Non** (en attente : conditions de coop.ch illisibles pour un robot) ; Open Prices : oui |
| **Migros** | ❌ aucun canal gratuit, officiel et accessible à un robot identifié | Open Prices seulement | 0/50 (le relevé de café du 04.08 attribué le 03.10 a été retiré le même jour : lieu d'achat non établi, `docs/COUVERTURE_NOYAU.md` § 0) | 0 | Open Prices : oui |

| Besoins comparables dans au moins… | 2 enseignes | 3 | 4 | 5 |
|---|---|---|---|---|
| Pilote privé (Lidl, Denner, Aldi, Coop, Open Prices), 01.10 | **41** | **18** | **2** | 0 |
| Pilote privé, 03.10 (après réexamen de l'attribution Migros) | **41** | **18** | **2** | 0 |
| Version publique (sources publiables : Lidl, Open Prices), 01.10 | 1 | 0 | 0 | 0 |
| Version publique, 03.10 (après réexamen) | **1** | 0 | 0 | 0 |

Détail et cause (Open Prices ne contient que 106 relevés suisses de moins de 90 jours pour les cinq
enseignes, presque tous hors noyau) : `docs/COUVERTURE_NOYAU.md` § 0.

Ce n'est **pas** une comparaison des cinq enseignes : Migros reste sans source automatique ; Coop
n'a que ses actions de la semaine, en Suisse romande (§ 3). Aucune couverture partielle n'est présentée comme complète : chaque case vide dit
« aucune donnée gratuite », « non affiché » ou « prix trop ancien ».

**Cycle réel** : 214 requêtes, 10 min 32 s de collecte, puis 6 étapes de contrôle et d'export (≈ 10 s),
code de sortie 0, aucune intervention humaine. Par source : Lidl 109 requêtes (5 min 22 s), Denner 53
(2 min 37 s), Aldi 44 (2 min 11 s), Open Prices 8 (22 s). Avant ciblage, Lidl seul demandait ≈ 530
requêtes par jour.

**Cycle réel du 03.10.2026** (11:02–11:13, environnement de développement) : 218 requêtes, 10 min 50 s,
code 0 ; Open Prices 22 s, journal Coop 6 s (texte de l'édition en cache), Denner 2 min 43 s, Aldi
2 min 11 s, Lidl 5 min 19 s (« partiel » : 3 pages en échec). Deux étapes avaient échoué (« L'heure
choisie est déjà passée ») : un cycle lancé après 10:00 calculait le panier de démonstration pour
10:00 ; corrigé (départ au quart d'heure suivant). Résultats identiques au 01.10 (§ 1).

## 2. Méthodes des concurrents (étude du 01.10.2026)

| Acteur | Observé (code, pages, résultats) | Déclaré par l'acteur | Supposé (non vérifiable) | Applicable à TesPrix ? |
|---|---|---|---|---|
| **FoodAlly** | Résultats sans date de relevé ni magasin ; prix cohérents avec Lidl et Aldi (écart médian nul) ; quota anonyme 100/jour (en-têtes) | « Plus de 300 000 produits, plus de 50 enseignes » ; paliers payants 49 et 499 CHF/mois ; collecte en masse interdite sans licence | Prix des boutiques en ligne, nationaux | Méthode : recherche ciblée par besoin ✅. Données : non (licence payante) |
| **SwissGroceries** (MCP libre, GitHub) | Code : API des **applications mobiles** ; Migros par jeton invité (`migros-api-wrapper`) ; Coop avec **contournement de DataDome** par l'agent HTTP ; Denner par **création automatique de compte anonyme** ; Aldi par l'API publique ; Lidl par le prospectus de la semaine ; cache 5 min, 3 reprises, disjoncteur | « Projet personnel, non affilié » | — | Cache, reprises, disjoncteur ✅ (repris). Contournement, comptes créés automatiquement ❌ (interdits) |
| **Swiss Grocery Scraper** (Apify) | — | Actions seulement : Migros et Denner par **Issuu** (OCR), Coop par **navigateur piloté**, Aldi et Lidl par prospectus PDF | — | Issuu interdit l'extraction (conditions § 3.3 h) ; navigateur piloté = robot masqué ❌ |
| **Coop Switzerland Scraper** (Apify) | — | Passe par **Bright Data Web Unlocker** (service payant de contournement de DataDome) | — | ❌ payant et contournement |
| **Aktionis** (CouponPlus AG) | Actions seulement, dates de validité, 8 enseignes, filtres régionaux | Sources non indiquées ; reproduction soumise à autorisation | Prospectus | Base de données : non (droits) |
| **Savaro** (lancé le 31.03.2026) | Site indisponible (503) lors de l'étude | Compare Migros, Coop, Aldi, Lidl, Denner | Méthode inconnue | — |

Réponse officielle Migros sur Migipedia : « nous ne pouvons actuellement pas donner accès à notre API
de données de produits ». **Aucun concurrent observé n'obtient Migros et Coop gratuitement sans
contourner une protection ou sans licence.**

Méthodes reprises : requêtes ciblées par besoin (au lieu de parcourir des milliers d'articles), lecture
des données déjà présentes dans la page (état Nuxt de Denner), actions séparées des prix permanents avec
leurs dates, cache des ressources lentes, reprises limitées, disjoncteur, plafonds par source.

## 3. Sources testées par enseigne (sur prix réels)

« Technique » = accessible à un robot identifié ; « Usage » = collecte compatible avec les conditions ;
« Publication » = affichage public permis ; « Couverture » = besoins du noyau obtenus.

| Enseigne | Canal | Technique | Usage | Publication | Couverture |
|---|---|---|---|---|---|
| Lidl | `sortiment.lidl.ch` (catégories, fiches), `www.lidl.ch` (actions) | ✅ 200 | ✅ aucune condition restrictive trouvée | ⚖️ réserve | 47/50 (32/50 sans les fiches `/fr/catalog/…`) |
| Denner | `www.denner.ch/fr/search?q=…` (5 meilleurs résultats), `/fr/découvrir/produits-ip-suisse` et `/fr/découvrir/produits-phares/provisions-domestiques` (assortiment permanent), `/fr/actions/…` | ✅ 200, `robots.txt` permissif | ✅ privé : seuls la publication et l'usage commercial sont interdits sans accord | ❌ | 34/50 ; détail des 16 manquants : `docs/COUVERTURE_NOYAU.md` § 3 |
| Denner | Prospectus Issuu | — | ❌ conditions d'Issuu | ❌ | — |
| Aldi | `api.aldi-suisse.ch/v3/product-search` (liste paginée), fiches `www.aldi-suisse.ch/fr/produit/…` | ✅ 200 | ✅ privé (« fins privées uniquement ») | ❌ | 23/50 ; détail des manquants : `docs/COUVERTURE_NOYAU.md` § 2 |
| Migros | `www.migros.ch` (pages, API, plan du site) | ❌ 403 « maintenance » pour un robot identifié (seul `robots.txt` répond) | — | — | 0 |
| Migros | Fiches produits (copie archivée publique, Wayback Machine) | Coquille d'application sans prix dans le HTML | — | — | 0 |
| Migros | API produits | Non ouverte (réponse officielle) | ❌ | — | 0 |
| Migros | Prospectus hebdomadaire (Issuu), `produkte.migros.ch`, sites régionaux | ❌ conditions d'Issuu ; domaines inexistants | — | — | 0 |
| Coop | `www.coop.ch` (y compris `robots.txt`) | ❌ 403 + défi DataDome | — | — | 0 |
| Coop | `www.coopzeitung.ch/de/angebote.html` | ✅ 200 | — | — | 0 (aucun prix) |
| Coop | Journal numérique `epaper.cooperation.ch` (magazine des actions) | ✅ 200, `robots.txt` « Allow: / », session anonyme | Privé (conditions de coop.ch illisibles pour un robot) | ❌ en attente | **6/50 en actions** (01.10, édition romande ; PDF avec texte, prix contrôlés par le prix unitaire imprimé) |
| Toutes | Open Prices (ODbL) | ✅ | ✅ | ✅ | Coop 1, Migros 0, Denner 0 (récents) |
| Toutes | opendata.swiss | ✅ | ✅ | ✅ | 0 (indices, pas de prix par enseigne) |

## 4. Chaîne quotidienne

### 4.1 Commande unique

```bash
cd comparateur
pnpm quotidien                 # chaîne complète (journal diffusé au fil de l'eau)
pnpm quotidien --force         # relance tout, même si la collecte du jour a eu lieu
pnpm quotidien --sources=denner-web   # une seule source
```

Étapes : **collecte** ciblée (Open Prices → Denner → Aldi → Lidl) → **extraction** (HTML, état Nuxt,
JSON) → **normalisation** (contenance, prix au kilo ou au litre, vente au poids, lots « 6 x 1 l »,
œufs à la pièce, dates d'action) → **rapprochement** (décisions revues, exigences : origine suisse,
AOP, bio, sans lactose) → **contrôles** (non-régression 103 couples besoin × enseigne, qualité,
fraîcheur du noyau) → **exports publiables** (matrice, page statique, panier d'exemple) → **journal**.

### 4.2 Robustesse

| Exigence | Mise en œuvre |
|---|---|
| Sources indépendantes | Un client HTTP par source ; l'échec, le blocage ou le plafond de l'une n'arrête pas les autres (test `isole les échecs`) |
| Délais et plafonds | 3 s entre deux requêtes vers un même hôte (plus si `Crawl-delay`) ; plafonds par source : Lidl 160, Denner 90, Aldi 60, Open Prices 60 (`<ID>_MAX_REQUESTS`) |
| Cache économe | Plans du site relus au plus une fois par semaine (`data/private/cache/`) ; seules les fiches reliées au noyau sont relues chaque jour |
| Reprises limitées | 3 reprises après erreur réseau, 408, 429 ou 5xx, avec attente exponentielle ; `Retry-After` respecté (≤ 5 min) |
| Limitation et refus | 401, 403, 451, 402 ou défi anti-robot : arrêt immédiat de la source, **aucun contournement** ; disjoncteur après 5 erreurs consécutives |
| Changement de structure | Denner : échec explicite si la majorité des pages n'a plus d'état Nuxt ; Lidl et Aldi : alertes « chute de couverture » et « dérive d'analyse » comparées au cycle précédent **du même mode** ; contrôle de non-régression sur 103 couples |
| Fraîcheur | Une collecte échouée garde l'instantané et **sa date d'origine** (test). Chaque prix garde sa date de lecture : « vérifié » ≤ 7 jours, « indicatif » ≤ 30 jours, écarté au-delà |
| Actions | Actions expirées exclues ; fin non publiée marquée « présumée » (jamais confirmée au-delà du dernier jour vu) ; actions « dès jeudi » annoncées ; prix « au lieu de » gardé comme référence, jamais comme prix permanent |
| Une fois par jour, rattrapage | Relancée le même jour (ouverture de session, nouvel essai), la commande ne reprend **que les sources en échec technique ou incomplètes** ; verrou contre les exécutions simultanées |
| Journal et administration | `data/private/runs/<date>.json` (90 jours) ; section « Collecte quotidienne » de `/admin/qualite` (état, requêtes, durée, dernière réussite, besoins avec prix, actions à fin inconnue) |

Vérifié sur des cycles réels : plafond volontairement réduit pour Denner → source « partielle », 130 prix
précédents conservés avec leur date ; relance du jour → seules les sources demandées ou en échec reprises
(dernière reprise : Open Prices seul, 8 requêtes, 33 s, 7 étapes réussies, non-régression 103/103).
Sur un clone neuf (serveur d'intégration), les instantanés Aldi et Denner sont absents : le contrôle
de non-régression ne vérifie alors que les enseignes présentes et le signale, sans fausse alerte.

### 4.3 Collecter n'est pas publier

| Source | Collecte | Publication | Où sont les données |
|---|---|---|---|
| Lidl, Open Prices, relevés | Permise | Permise (Lidl : réserve) | `data/prices/live/` (versionné) |
| Aldi, Denner, journal Coop | Usage privé | Interdite sans accord écrit (Coop : en attente) | `data/private/live/` (**hors dépôt**, jamais dans un export, un artefact ou une page) |

`data/private/` est exclu de Git ; l'instantané Aldi qui y était versionné depuis la phase 3 en a été
retiré (il reste dans l'historique Git). Les fichiers versionnés (matrice, contrôle des correspondances,
panier d'exemple public) ne contiennent **aucun prix** d'Aldi ou de Denner, seulement le statut
« collecté, non publiable ». Le workflow GitHub échoue si une donnée privée atteint la page publique, et
le test `apps/worker/test/privacy.test.ts` échoue si un fichier versionné contient un prix d'article
Aldi, Denner ou Coop (il a détecté le 01.10.2026 un ancien `data/matching/audit.md` de la phase 4, avec
47 prix Aldi, régénéré depuis). Historique Git : `docs/NETTOYAGE_HISTORIQUE.md` ; demandes
d'autorisation : `docs/AUTORISATIONS.md`.

## 5. Exécution quotidienne à 0 CHF

### 5.0 État réel de l'installation (01.10.2026)

| Élément | État | Preuve |
|---|---|---|
| Cycle de collecte exécuté | ✅ dans l'environnement de développement (pas sur votre PC) | 30.09 22:28 → 01.10 01:08 (heure de Zurich) : cycle complet (214 requêtes), reprises Open Prices, Denner + Coop ; journal `data/private/runs/2026-10-01.json` (hors dépôt) |
| Scripts Windows disponibles | ✅ `installer-tache.ps1`, `tesprix-quotidien.ps1`, `verifier-tache.ps1` ; mode **état partagé** avec GitHub (`-DepotEtat`, 03.10.2026) | testés sous PowerShell 7 avec un Planificateur **simulé** (`scripts/windows/tests/tester-scripts.ps1`, 36 contrôles dont 11 du mode partagé avec un vrai dépôt Git local, aussi en intégration continue ; en mode partagé : 15:30, sans rattrapage à l'ouverture de session) |
| Tâche installée et exécutée sur **votre** ordinateur Windows | ❌ **non vérifiée** : je n'ai pas accès à votre PC | à établir avec la procédure du § 5.2 (sortie de `verifier-tache.ps1`) |
| GitHub Actions, dépôt privé `probe2ka3/tesprix-collecte` (03.10.2026) | dépôt créé par l'exploitant, workflow installé et **actif** ; **premier cycle réel réussi** (installation, 21:22 : les 5 sources en succès, dont Aldi, Denner et le journal Coop depuis GitHub) ; essais réels : « rien » sans relance, reprise de l'état sauvegardé, verrou (« concurrence ») ; **premier déclenchement planifié pas encore observé** (04.10.2026 06:17) ; **0/7** jours complets | `ops/actions-prive/README.md` (état, exécutions, suivi) ; `etat/suivi/SUIVI.md` du dépôt privé |

### 5.1 Options comparées (conditions vérifiées le 01.10.2026)

| Option | Coût | Conditions et limites | Verdict |
|---|---|---|---|
| **Ordinateur de l'exploitant, Planificateur de tâches Windows** | 0 CHF | Ordinateur allumé (ou en veille avec réveil) et connecté ; session ouverte, ou mot de passe enregistré pour une exécution sans session | ✅ **retenu** : le plus simple, aucune limite de durée ni de CPU, données privées (Aldi, Denner, Coop) gardées chez l'exploitant |
| GitHub Actions (dépôt public) | 0 CHF ; sans moyen de paiement, l'usage est bloqué au-delà du quota, jamais facturé | Interdit « toute autre activité sans rapport avec la production, les tests, le déploiement ou la publication du logiciel » ; tâches planifiées seulement sur la branche par défaut, retardées aux heures chargées, désactivées après 60 jours sans activité ; artefacts d'un dépôt public téléchargeables | ⚠️ Construction de la page : oui. Collecte Lidl + Open Prices : désactivée par défaut (zone grise). Aldi, Denner, Coop : **jamais** (données privées sur une infrastructure tierce) |
| **GitHub Actions (dépôt privé séparé)** — étudié le 03.10.2026 | 0 CHF : 2 000 min/mois incluses (GitHub Free), usage **bloqué** au-delà sans moyen de paiement ; avec un moyen de paiement, budget Actions à 0 avec « Stop usage when budget limit is reached » ; mesuré : 13 min par cycle, ≈ 465 min/mois estimées | Même clause d'usage que ci-dessus (**zone grise**, aucune autorisation formelle ; risque : arrêt des tâches ou restriction du compte) ; planification sur la branche par défaut, retards ou abandons possibles aux heures chargées, fuseau `Europe/Zurich` désormais accepté ; état gardé par des commits dans le dépôt privé (≈ 0,56 Mo compressé par collecte), cache HTTP privé ; les 5 sources accessibles depuis GitHub (premier cycle réel du 03.10, une exécution) | ⏳ **En service, en observation** : premier cycle réel réussi le 03.10.2026 ; le PC Windows reste la solution de secours jusqu'à 7 jours consécutifs complets sur déclenchement planifié (`ops/actions-prive/README.md`) |
| Vercel Hobby | 0 CHF | Usage personnel non commercial ; fonction limitée à **300 s** | ❌ un cycle poli dure ≈ 12 min |
| Cloudflare Workers (gratuit) | 0 CHF | voir § 5.1.1 | ❌ sans refonte |
| Machines virtuelles « gratuites » (Oracle, Google Cloud…) | Carte bancaire ou compte de facturation exigé | Dépassement facturable possible | ❌ (règle : aucun dépassement facturable) |

#### 5.1.2 GitHub Actions : essai réel sur les serveurs de GitHub (03.10.2026)

Workflow `.github/workflows/tesprix-essai-cycle.yml` (dépôt public, donc **sources publiables
seulement** : jamais Aldi, Denner ni le journal Coop), même script que pour le dépôt privé
(`ops/actions-prive/cycle.sh`), état dans un dossier temporaire, aucun artefact ni cache. Exécution
37114095944 du 03.10.2026, 11:45–11:51 (heure de Zurich), déclenchée par la poussée du commit
`4e8d24d` :

| Élément | Résultat |
|---|---|
| Installation (`pnpm install`) | 4 s |
| Lidl (site officiel) depuis une adresse de GitHub | ✅ succès : 424 prix, 290 actions, 313 s (aucun blocage) |
| Open Prices | ✅ succès : 246 prix, 25 s |
| Contrôles, matrice, page, paniers | ✅ 6 étapes, ≈ 1 s chacune |
| Contrôle « aucune donnée privée sur le serveur » | ✅ |
| Durée totale du job | **6 min 01 s** (cycle 5 min 38 s) |

Estimation d'un cycle complet en dépôt privé : + Denner ≈ 2 min 45, Aldi ≈ 2 min 10, journal Coop
≈ 1 min le jeudi (quelques secondes ensuite, cache) → **≈ 12 min**, soit ≈ 360 min/mois, plus les
créneaux de rattrapage sans collecte (< 1 min chacun) : **≈ 400 min sur les 2 000 incluses**. Non
mesuré : l'accès d'Aldi, de Denner et du journal Coop depuis les adresses de GitHub (jamais lancés
depuis le dépôt public).

**Second essai, avec le module d'état partagé** (`etat.mjs` : restauration, enregistrement, suivi par
source) et les actions en version Node 24 : exécution
[37142636052](https://github.com/probe2ka3/stayready-kit/actions/runs/37142636052) du 03.10.2026,
20:01–20:07 (heure de Zurich), commit `d32bd16` :

| Élément | Résultat |
|---|---|
| Lidl | ⚠️ **partiel** : 424 prix, 290 actions, 107 requêtes, 347 s ; 1 page en échec (erreur 504 de lidl.ch après une nouvelle tentative) ; besoins du noyau avec prix : 47/50 |
| Open Prices | ✅ succès : 231 prix (relevé de café non attribué : `docs/COUVERTURE_NOYAU.md` § 0), 8 requêtes, 21 s |
| Suivi par source (`etat.mjs noter`) | ✅ ligne du jour écrite (« 20:01 github/essai → collecte », statut et date des données par source) ; **le statut partiel apparaît en avertissement** dans le résumé du workflow (« pages manquantes ») : une exécution verte ne masque pas une source incomplète ; une source en échec l'aurait rendue rouge |
| Contrôle « aucune donnée privée sur le serveur » | ✅ |
| Avertissement « Node.js 20 is deprecated » | ✅ disparu (présent sur l'exécution précédente, `208b3bc`) |
| Durée totale du job | **6 min 29 s** (cycle 6 min 14 s) |

**Dépôt privé `tesprix-collecte` (03.10.2026, soir)** : premier cycle réel avec les 5 sources
(exécution 37147623292, déclencheur `push` à l'installation du workflow) : Open Prices 231 prix, journal
Coop 77 actions, Denner 250 prix et 25 actions, Aldi 1 481 prix et 558 actions, Lidl 424 prix et 290
actions, toutes en succès, aucun blocage ; job 12 min 30 s, 241 requêtes ; état sauvegardé dans le dépôt
privé (commit `4beb671`) ; journal du workflow sans prix. Essais réels ensuite : « rien » sans relance
(37148554048, 15 s), reprise de l'état sauvegardé (37149241748 : Open Prices seul relu, les 4 autres
instantanés identiques octet pour octet), verrou (37149327391 : « concurrence » même forcé). Détail :
`ops/actions-prive/README.md`.

État réel : **testé manuellement ✅ (dépôt public : 2 essais ; dépôt privé : premier cycle et 4 essais) ;
planification active, premier déclenchement planifié ⏳ attendu le 04.10.2026 à 06:17 ; 7 jours
consécutifs complets : 0/7.**

#### 5.1.1 Cloudflare Workers : réexamen chiffré

Limites officielles du plan gratuit (<https://developers.cloudflare.com/workers/platform/limits/>, lues le
01.10.2026) : **10 ms de temps CPU** par invocation (requête HTTP comme déclencheur Cron) ; durée
murale illimitée en HTTP tant que le client reste connecté, **15 min** pour un déclencheur Cron ;
**50 sous-requêtes** par invocation ; 100 000 requêtes par jour (erreur 1027 au-delà) ; 5 déclencheurs
Cron par compte ; 128 Mo de mémoire. **Les attentes réseau (`fetch`) ne comptent pas comme CPU.**

Mesures sur le collecteur réel (réponses archivées des 30.09 et 01.10, temps CPU par page, attentes
réseau exclues) :

| Étape | Médiane | Maximum | Compatible 10 ms ? |
|---|---|---|---|
| Lidl, page HTML (113 Ko) | 0,4 ms | 15 ms | presque |
| Denner, page HTML (199 Ko) | 3,7 ms | 119 ms | non (pages d'actions) |
| Aldi, page de l'API (158 Ko, lecture + rapprochement) | 15,3 ms | 44 ms | **non** |
| Coop, page PDF (≈ 2,5 Mo, pdf.js) | 112 ms | 398 ms | **non** |
| Contrôles, matrice, paniers (après collecte) | ≈ 2 s chacun | — | **non** |

Attentes : ≈ 245 requêtes par jour espacées de 3 s par hôte (≈ 12 min de durée murale) : compatible
avec 15 min par Cron, mais il faudrait ≥ 5 invocations (50 sous-requêtes chacune), un stockage
externe (le code écrit des fichiers : `node:fs`), et découper chaque analyse sous 10 ms de CPU — ce que
la lecture des PDF Coop et le rapprochement ne permettent pas. Conclusion : **incompatible sans refonte**
(ni l'objectif, ni raisonnable pour seulement changer d'hébergement). Le PC Windows reste la solution.

**Dépendance au PC** : sans ordinateur allumé et connecté, aucune collecte n'a lieu ce jour-là ; rien
n'est faussé (les prix gardent leur date, deviennent « indicatifs » après 7 jours et sont écartés après
30) et la collecte reprend dès le démarrage suivant (rattrapage). Pour un fonctionnement sans PC
allumé, seule une infrastructure tierce conviendrait, avec les limites ci-dessus.

### 5.2 Installer puis vérifier sur votre ordinateur Windows (une fois, ≈ 15 min)

Prérequis : Windows 10 ou 11, [Node.js 22](https://nodejs.org) installé, Git. Dans PowerShell :

```powershell
# 1. Installation (une fois)
corepack enable
git clone https://github.com/probe2ka3/stayready-kit.git
cd stayready-kit\comparateur
git checkout claude/swiss-grocery-comparison-w7bk8q
pnpm install
pnpm quotidien                    # premier cycle manuel (≈ 12 min) : vérifie que tout fonctionne
powershell -ExecutionPolicy Bypass -File .\scripts\windows\installer-tache.ps1    # option : -Reveil

# 2. Essai immédiat de la tâche, puis vérification
Start-ScheduledTask -TaskName "TesPrix - collecte quotidienne"
powershell -ExecutionPolicy Bypass -File .\scripts\windows\verifier-tache.ps1
```

`verifier-tache.ps1` (lecture seule) affiche et contrôle : **nom et état** de la tâche ; **prochaine
exécution** en heure locale et à Zurich (06:00 attendu) ; **dernière exécution et résultat** (0 =
succès, 2 = pas d'Internet, 3 = Node.js/pnpm introuvable…) ; **rattrapage** (« exécuter dès que possible
après un démarrage manqué », déclencheur à l'ouverture de session, compteur d'exécutions manquées, et la
liste des collectes des 14 derniers jours avec leur heure réelle de lancement : « à l'heure » ou
« rattrapage ») ; **journaux** (`data\private\logs\quotidien-AAAA-MM-JJ.log`, 60 jours) et dernier
résultat (`data\private\runs\latest.json`). Verdict en fin de sortie ; code de sortie 0 si tout est
conforme.

Vérifier le rattrapage (une fois) : mettre l'ordinateur en veille ou l'éteindre avant 06:00, le
rallumer après ; dans les 5 minutes suivant l'ouverture de session, la collecte démarre ; le journal du
jour contient « Lancement à HH:MM, après l'heure prévue 06:00 : rattrapage » et `verifier-tache.ps1`
liste ce jour comme « rattrapage ou relance ».

Ce qui reste à vérifier **sur votre PC** (impossible ici) : l'enregistrement réel de la tâche par
Windows, le fuseau (Europe/Zurich), le premier lancement à 06:00, le rattrapage après un arrêt, la
connexion réseau au démarrage et les droits du compte utilisé.

Linux ou macOS : `crontab -e` puis `0 6 * * * cd /chemin/comparateur && pnpm quotidien >> data/private/logs/cron.log 2>&1`
(`CRON_TZ=Europe/Zurich` selon le système). Pas de rattrapage automatique avec cron seul.

### 5.3 Temps machine et temps humain

| | Durée |
|---|---|
| Programme, chaque jour | ≈ 12 min sans surveillance (≈ 245 requêtes ; Lidl 5 min, Denner 3, Aldi 2, Coop 1 min le jeudi puis quelques secondes, Open Prices < 1) ; temps CPU inférieur à 1 min |
| Humain, chaque jour | **0 min** |
| Humain, chaque semaine | ≈ 5–10 min : lire l'état (`verifier-tache.ps1`, `/admin/qualite`) ; nouvelles actions Coop à rapprocher (`pnpm job match-audit`, données privées) |
| Humain, chaque mois | ≈ 20–30 min : revoir les nouveaux articles non rapprochés, assisté par l'IA déjà disponible, sans API payante |
| Humain, occasionnel | Changement de structure d'un site : correction de l'analyseur ; alerte « structure modifiée » ou « chute de couverture » dans le journal |

Conditions : ordinateur allumé à 06:00 ou dans la journée (sinon rattrapage), connexion Internet, Node.js
et le dépôt installés. Sans exécution, rien n'est faussé : les prix vieillissent et sont écartés après
30 jours ; la page et le comparateur affichent leur date.

## 6. Exemple reproductible sur prix réels

```bash
pnpm job demo-baskets --now=2026-10-01T06:00:00Z --baskets=panier-noyau.json --name=panier-noyau-prive
pnpm job demo-baskets --now=2026-10-01T06:00:00Z --baskets=panier-noyau.json --name=panier-noyau-public --public
```

Panier de 17 aliments, 1630 Bulle, rayon 5 km, 13 succursales des 5 enseignes :

| Vue | Solution | Achats | Total avec trajet | Manquant |
|---|---|---|---|---|
| Pilote privé (`data/private/demo/`) | Lidl seul (référence), 17/17 | 41,85 | 42,45 | — |
| | Denner + Lidl, 17/17 : un peu moins cher à l'achat, gain net **non retenu** (sous le seuil de 2 CHF par magasin supplémentaire) | non publié | non publié | — |
| | Denner seul | non publié | — | 6 articles sur 17 (sucre, riz long grain, spaghetti, beurre de cuisine, œufs d'élevage au sol, tomates concassées) : **non comparable** |
| | Aldi seul | non publié | — | 10 articles sur 17 : **non comparable** |
| Publique (`data/demo/panier-noyau-public.md`) | Lidl seul, 17/17 | 41,85 | 42,45 | Migros, Coop : « aucune donnée gratuite » ; Aldi, Denner : « non affiché (source sans autorisation de réutilisation) » |

Montants de Denner et d'Aldi : non publiés (sources à usage privé ; ils restent dans le fichier hors
dépôt `data/private/demo/`). Exemples de constats (pilote privé, 01.10.2026) : les carottes et les pommes
de terre fermes étaient moins chères chez Denner grâce à des actions de la semaine ; le lait entier UHT
coûtait le même prix chez Denner et chez Lidl ; Migros et Coop : aucune donnée pour les 17 lignes.

## 7. Blocages restant à résoudre

1. **Migros** : aucun canal gratuit, officiel et accessible à un robot identifié parmi ceux examinés
   (`docs/COUVERTURE_NOYAU.md` § 5) ; API produits non ouverte (réponse officielle sur Migipedia).
   Levée : demande prête, non envoyée (`docs/AUTORISATIONS.md` § 3.4) ; à défaut, relevés ou Open Prices.
2. **Coop** : prix permanents inaccessibles (DataDome, aucun contournement) ; seules les actions de la
   semaine (édition romande) sont lues. Levée : § 3.3 des demandes.
3. **Publication d'Aldi, de Denner et du journal Coop** : collecte privée seulement ; publication après
   accord écrit. Lidl : aucune restriction identifiée, autorisation non établie (§ 2 des demandes).
4. **Denner** : 12 besoins absents du site, 2 caractéristiques non publiées, 2 besoins en action
   seulement ; la recherche ne rend que 5 résultats.
5. **Aldi** : fruits, légumes et crème absents de l'API ; 6 articles sans contenance publiée ; 5 sans
   origine publiée (le besoin exige l'origine suisse).
6. **Planification** : la tâche Windows n'est **pas** vérifiée sur votre ordinateur (pas d'accès) ;
   procédure et contrôle : § 5.2. Collecte sans PC : GitHub Actions dans le dépôt privé
   `tesprix-collecte`, **premier cycle réel réussi le 03.10.2026** (5 sources) ; premier déclenchement
   planifié attendu le 04.10 à 06:17 ; **0/7** jours complets. Coexistence : mode « état partagé » de la
   tâche Windows (un seul journal, une seule collecte par jour ; Windows à 15:30, après les créneaux de
   GitHub) ; commande : `ops/actions-prive/README.md` § 3.
7. **Historique Git** : anciennes données Aldi **toujours présentes** dans l'historique public de la
   branche (11 versions de fichiers de données, 8 versions de documents avec des montants Aldi ou Denner,
   inventaire du 03.10.2026) ; procédure préparée et essayée à blanc, non exécutée (décision de
   l'exploitant : `docs/NETTOYAGE_HISTORIQUE.md`). Le problème n'est pas résolu tant que ce nettoyage n'a
   pas eu lieu, et il ne rappellera pas les copies déjà récupérées.
