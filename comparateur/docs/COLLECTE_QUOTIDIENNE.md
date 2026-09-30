# Collecte quotidienne des prix — compte rendu et guide d'exploitation (01.10.2026)

Objectif de l'étape : récupérer **automatiquement chaque jour**, à 0 CHF, les prix des 50 aliments de
base chez Migros, Coop, Denner, Aldi et Lidl, sans que les relevés en magasin soient une condition de
fonctionnement. Mesures faites sur un cycle réel exécuté le 01.10.2026 à 00:28 (heure de Zurich).

## 1. Résultat en bref

| Enseigne | Collecteur automatique | Source | Besoins du noyau avec prix | Lus le jour même | Publication |
|---|---|---|---|---|---|
| **Lidl** | ✅ opérationnel | Site officiel (catégories alimentaires, fiches du noyau, actions) | **47/50** | 47 | Oui, sous réserve (conditions muettes, `robots.txt` ambigu) |
| **Denner** | ✅ opérationnel (nouveau) | Site officiel : recherche ciblée + actions | **34/50** | 31 | **Non** : « publication ou fins commerciales » interdites sans accord écrit |
| **Aldi** | ✅ opérationnel | API publique du site (liste paginée) | **22/50** | 22 | **Non** : conditions « fins privées uniquement » |
| **Coop** | ❌ impossible gratuitement et sans contournement | Open Prices seulement | 1/50 | 0 | Oui (ODbL) |
| **Migros** | ❌ impossible gratuitement et sans contournement | Open Prices seulement | 0/50 | 0 | — |

| Besoins comparables dans au moins… | 2 enseignes | 3 | 4 | 5 |
|---|---|---|---|---|
| Pilote privé (Lidl, Denner, Aldi, Open Prices) | **41** | **13** | **1** | 0 |
| Version publique (sources publiables : Lidl, Open Prices) | 1 | 0 | 0 | 0 |

Ce n'est **pas** une comparaison des cinq enseignes : Migros et Coop restent sans source automatique
autorisée (§ 3). Aucune couverture partielle n'est présentée comme complète : chaque case vide dit
« aucune donnée gratuite », « non affiché » ou « prix trop ancien ».

**Cycle réel** : 214 requêtes, 10 min 32 s de collecte, puis 6 étapes de contrôle et d'export (≈ 10 s),
code de sortie 0, aucune intervention humaine. Par source : Lidl 109 requêtes (5 min 22 s), Denner 53
(2 min 37 s), Aldi 44 (2 min 11 s), Open Prices 8 (22 s). Avant ciblage, Lidl seul demandait ≈ 530
requêtes par jour.

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
| Denner | `www.denner.ch/fr/search?q=…` (5 meilleurs résultats, prix permanents et actions), `/fr/actions/…` | ✅ 200, `robots.txt` permissif | ✅ privé : seuls la publication et l'usage commercial sont interdits sans accord | ❌ | 34/50 ; **absents du site** : sucre, sel, séré, blanc de poulet suisse, tomates en conserve, polenta, beurre de cuisine, pain complet |
| Denner | Prospectus Issuu | — | ❌ conditions d'Issuu | ❌ | — |
| Aldi | `api.aldi-suisse.ch/v3/product-search` (liste paginée) | ✅ 200 | ✅ privé (« fins privées uniquement ») | ❌ | 22/50 (l'API n'expose ni fruits, ni légumes, ni œufs, ni farine ; lait bio sans origine indiquée) |
| Migros | `www.migros.ch` (pages, API, plan du site) | ❌ 403 « maintenance » pour un robot identifié (seul `robots.txt` répond) | — | — | 0 |
| Migros | Fiches produits (copie archivée publique, Wayback Machine) | Coquille d'application sans prix dans le HTML | — | — | 0 |
| Migros | API produits | Non ouverte (réponse officielle) | ❌ | — | 0 |
| Migros | Prospectus hebdomadaire (Issuu), `produkte.migros.ch`, sites régionaux | ❌ conditions d'Issuu ; domaines inexistants | — | — | 0 |
| Coop | `www.coop.ch` (y compris `robots.txt`) | ❌ 403 + défi DataDome | — | — | 0 |
| Coop | `www.coopzeitung.ch/de/angebote.html` | ✅ 200 | — | — | 0 (aucun prix) |
| Coop | Journal numérique `epaper.coopzeitung.ch` | ✅ 200, `robots.txt` permissif | Accès aux pages non documenté ; actions seulement, en images | — | 0 (non exploité) |
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
| Une fois par jour, rattrapage | Relancée le même jour (ouverture de session, nouvel essai), la commande ne reprend **que les sources en échec technique** ; verrou contre les exécutions simultanées |
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
| Aldi, Denner | Usage privé | Interdite sans accord écrit | `data/private/live/` (**hors dépôt**, jamais dans un export, un artefact ou une page) |

`data/private/` est exclu de Git ; l'instantané Aldi qui y était versionné depuis la phase 3 en a été
retiré (il reste dans l'historique Git). Les fichiers versionnés (matrice, contrôle des correspondances,
panier d'exemple public) ne contiennent **aucun prix** d'Aldi ou de Denner, seulement le statut
« collecté, non publiable ». Le workflow GitHub échoue si une donnée privée atteint la page publique.

## 5. Exécution quotidienne à 0 CHF

### 5.1 Options comparées (conditions vérifiées le 01.10.2026)

| Option | Coût | Conditions et limites | Verdict |
|---|---|---|---|
| **Ordinateur de l'exploitant, Planificateur de tâches Windows** | 0 CHF | Ordinateur allumé (ou en veille avec réveil) et connecté ; session ouverte, ou mot de passe enregistré pour une exécution sans session | ✅ **retenu** : seule option où les données privées (Aldi, Denner) restent chez l'exploitant |
| GitHub Actions (dépôt public) | 0 CHF ; sans moyen de paiement, l'usage est bloqué au-delà du quota, jamais facturé | Interdit « toute autre activité sans rapport avec la production, les tests, le déploiement ou la publication du logiciel » ; tâches planifiées seulement sur la branche par défaut, retardées aux heures chargées, désactivées après 60 jours sans activité ; artefacts d'un dépôt public téléchargeables | ⚠️ Construction de la page : oui. Collecte Lidl + Open Prices : option désactivée par défaut (zone grise). Aldi, Denner : **jamais** (données privées sur une infrastructure tierce) |
| Vercel Hobby | 0 CHF | Usage personnel non commercial ; fonction limitée à **300 s** | ❌ un cycle poli dure ≈ 11 min |
| Cloudflare Workers (gratuit) | 0 CHF | 10 ms de CPU par requête, erreurs au-delà | ❌ |
| Machines virtuelles « gratuites » (Oracle, Google Cloud…) | Carte bancaire ou compte de facturation exigé | Dépassement facturable possible | ❌ (règle : aucun dépassement facturable) |

### 5.2 Installation sur Windows (une fois, ≈ 15 min)

Prérequis : Windows 10 ou 11, [Node.js 22](https://nodejs.org) installé, puis dans PowerShell :

```powershell
corepack enable
git clone https://github.com/probe2ka3/stayready-kit.git
cd stayready-kit\comparateur
git checkout claude/swiss-grocery-comparison-w7bk8q
pnpm install
pnpm quotidien          # premier cycle manuel (≈ 11 min) : vérifie que tout fonctionne
powershell -ExecutionPolicy Bypass -File .\scripts\windows\installer-tache.ps1
```

La tâche « TesPrix - collecte quotidienne » : chaque jour à **06:00** (heure de l'ordinateur ; fuseau
Europe/Zurich attendu, sinon avertissement) ; **rattrapage** si l'ordinateur était éteint (« exécuter dès
que possible ») et à l'ouverture de session (après 5 min) ; seulement avec une connexion réseau ; nouvel
essai toutes les 30 min, 3 fois au plus, après un échec ; durée maximale 2 h ; jamais deux exécutions
simultanées. Options : `-Reveil` (sort l'ordinateur de veille), `-SansSession` (exécution sans session
ouverte, mot de passe demandé une fois), `-Heure 07:30`, `-Desinstaller`.

Journaux : `data\private\logs\quotidien-AAAA-MM-JJ.log` (60 jours) ; résultat détaillé :
`data\private\runs\latest.json` ; état lisible : `pnpm dev` puis `/admin/qualite`.

Linux ou macOS : `crontab -e` puis `0 6 * * * cd /chemin/comparateur && pnpm quotidien >> data/private/logs/cron.log 2>&1`
(`CRON_TZ=Europe/Zurich` selon le système). Pas de rattrapage automatique avec cron seul.

### 5.3 Temps machine et temps humain

| | Durée |
|---|---|
| Programme, chaque jour | ≈ 11 min sans surveillance (214 requêtes ; Lidl 5 min, Denner 3, Aldi 2, Open Prices < 1) |
| Humain, chaque jour | **0 min** |
| Humain, chaque semaine | ≈ 5–10 min : lire l'état (`/admin/qualite` ou `latest.json`) |
| Humain, chaque mois | ≈ 20–30 min : revoir les nouveaux articles non rapprochés (`pnpm job match-audit`, `match-candidates`), assisté par l'IA déjà disponible, sans API payante |
| Humain, occasionnel | Changement de structure d'un site : correction de l'analyseur (développement assisté par l'IA) ; alerte « structure modifiée » ou « chute de couverture » dans le journal |

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
| | Denner + Lidl, 17/17 : **2,10 CHF** moins cher à l'achat, 1,80 après trajet, **non retenue** (sous le seuil de 2 CHF par magasin supplémentaire) | 39,75 | 40,65 | — |
| | Denner seul | 34,89 | — | 6 articles sur 17 (sucre, riz long grain, spaghetti, beurre de cuisine, œufs d'élevage au sol, tomates concassées) : **non comparable** |
| | Aldi seul | 19,79 | — | 10 articles sur 17 : **non comparable** |
| Publique (`data/demo/panier-noyau-public.md`) | Lidl seul, 17/17 | 41,85 | 42,45 | Migros, Coop : « aucune donnée gratuite » ; Aldi, Denner : « non affiché (source sans autorisation de réutilisation) » |

Exemples de lignes (pilote privé, 01.10.2026) : carottes 1 kg Denner 1,55 (action du 01.10 au 07.10)
contre 2,89 chez Lidl (1,5 kg) ; pommes de terre fermes 2,5 kg Denner 2,99 (action, fin non publiée)
contre 3,75 chez Lidl ; lait entier UHT 1 l : 1,55 chez Denner comme chez Lidl ; Migros et Coop : aucune
donnée pour les 17 lignes.

## 7. Blocages restant à résoudre

1. **Migros** : aucun canal automatique autorisé. Levée : accord écrit (demande prête, non envoyée,
   `docs/PLAN_SANS_DEPENSES.md` § 7) ; à défaut, relevés en magasin ou Open Prices (facultatifs).
2. **Coop** : protection DataDome sur tout le site ; aucun contournement. Même levée.
3. **Publication d'Aldi et de Denner** : collecte privée seulement ; publication après accord écrit.
4. **Denner** : 8 besoins absents du site ; résultats limités aux 5 premiers de la recherche (un article
   moins cher plus loin dans la liste peut manquer) ; les nouveaux articles demandent une revue.
5. **Lidl** : réserve juridique (`Disallow: /catalog/`) ; sans les fiches, 32/50.
6. **Aldi** : fruits, légumes, œufs, farine absents de l'API ; lait bio sans origine indiquée.
7. **Planification** : l'installation Windows n'a pas pu être exécutée ici (serveur Linux) ; les deux
   scripts PowerShell ont été vérifiés par l'analyseur syntaxique de PowerShell 7.4. Premier essai à faire
   sur l'ordinateur : `Start-ScheduledTask -TaskName "TesPrix - collecte quotidienne"`.
