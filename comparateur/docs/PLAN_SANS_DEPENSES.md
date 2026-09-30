# TesPrix — plan sans dépenses (état mesuré au 30.09.2026)

> **Mise à jour du 01.10.2026** : collecte quotidienne automatique (Lidl, Denner, Aldi, Open Prices),
> sans relevé obligatoire — voir [COLLECTE_QUOTIDIENNE.md](COLLECTE_QUOTIDIENNE.md). Denner est désormais
> collecté (usage privé) ; l'instantané Aldi a quitté le dépôt (§ 3.4 réglé) ; pilote privé : 41 besoins
> comparables dans au moins 2 enseignes, 13 dans 3, 1 dans 4.

**Objectif initial** : comparer les prix des aliments de base dans les cinq enseignes nationales
(Migros, Coop, Denner, Aldi, Lidl), avec les équipements, accès et outils déjà disponibles, **sans
aucune dépense nouvelle**. Ce plan remplace les hypothèses précédentes (abonnements, licences, offres
B2B : `docs/BUSINESS_MODEL_V2.md` et la licence FoodAlly sortent du périmètre).

## 0. Réponse courte : jusqu'où sans dépenser ?

| Question | Réponse mesurée |
|---|---|
| Le comparateur fonctionne-t-il ? | **Oui, en local** : NPA, magasins, panier, montant payé par paquets, prix au kilo, trajet, économie nette, courses à une date future. 211 tests unitaires, parcours navigateur (§ 9). |
| Enseignes avec des prix officiels, récents, gratuits et réutilisables publiquement | **Lidl seulement** (47 des 50 besoins du noyau, relevés du 28 au 30.09). Réserve : conditions muettes, pas d'avis juridique (§ 8). |
| Aldi | Prix officiels gratuits et à jour (22/50), mais **usage privé seulement** (conditions d'Aldi) : pilote local de l'exploitant, jamais publiés. |
| Migros, Coop, Denner | **Aucune source officielle gratuite utilisable** : refus technique (403, anti-robot) ou interdiction écrite. Open Prices : 1 besoin récent sur 50 (Coop). |
| Besoins comparables dans 2 / 3 / 4 / 5 enseignes, version publique | **1 / 0 / 0 / 0** |
| Idem, pilote privé avec Aldi | **21 / 1 / 0 / 0** |
| Meilleure couverture réalisable à 0 CHF | Automatique : Lidl (47/50, national). Avec des **relevés en magasin** (gratuits, ≈ 1 h par magasin et par mois) : les 5 enseignes **pour les magasins relevés**, y compris Aldi (les conditions d'Aldi visent ses services en ligne, pas un prix constaté en rayon). |
| Publication gratuite | Page statique (matrice 50 × 5) prête pour GitHub Pages ; **aucun hébergement gratuit validé pour l'application complète** : l'application reste un pilote local (§ 6). |

Autrement dit : à 0 CHF, TesPrix peut aujourd'hui publier **une liste de prix Lidl** et les relevés
qui lui sont apportés ; il ne peut **pas** publier un comparateur national des cinq enseignes. Le
comparateur à cinq enseignes est démontré **localement et magasin par magasin**, à condition de
relever soi-même les prix de Migros, Coop, Denner (et Aldi pour la version publique).

## 1. Cadre à 0 CHF

| Écarté | Raison |
|---|---|
| FoodAlly Pro / Business, toute licence de données | Payant ; l'accès gratuit est limité à un usage « hobby », la collecte en masse est interdite et l'usage dans une application exige l'offre Pro (`docs/DROITS_DONNEES.md` § 5) |
| Offres B2B, widgets, marque blanche, revente de données | Hors périmètre (demande de l'exploitant) ; routes `/api/b2b` conservées, non développées |
| Avis juridique payant | Remplacé par des demandes d'autorisation gratuites (§ 7) et une limitation prudente des usages (§ 8) |
| Netlify (compte de StayReady) | 300 crédits par mois partagés avec StayReady : un déploiement quotidien (≈ 15 crédits × 30) les épuiserait et **mettrait StayReady en péril** |
| Tout appel facturé à une API d'IA | La collecte, l'import, la matrice et la page n'appellent aucune IA ; l'IA déjà disponible sert au développement, à la revue des correspondances et à la transcription des relevés (§ 5) |
| Offre gratuite temporaire | Non retenue (aucune n'est utilisée) |

Utilisé : ordinateur de l'exploitant, dépôt GitHub **public** existant (Actions et Pages gratuits pour
un dépôt public), Node.js et pnpm, données ouvertes (OpenStreetMap, swisstopo, Open Prices), assistant
IA déjà disponible.

## 2. État réel par rapport au plan initial

| Élément du plan initial | État réel | Public à 0 CHF ? |
|---|---|---|
| 5 enseignes nationales | Lidl : collecte automatique ; Aldi : collecte automatique, **privée** ; Migros, Coop, Denner : relevés manuels seulement | Lidl + relevés |
| ≈ 50 aliments de base | Noyau de **50 besoins** défini (fruits, légumes, pommes de terre, farine, sucre, sel, huiles, riz, pâtes, lait, œufs, beurre, pain, viande, conserves, café) — `P1_ESSENTIALS` | — |
| Produits équivalents, marques propres | Correspondances revues (472 décisions), exigences par besoin (origine suisse, AOP, bio, sans lactose), marques propres admises | — |
| Prix au kilo / litre et montant payé | Paquets entiers à acheter × prix du paquet ; prix au kilo pour comparer ; vente au poids marquée « estimée » | Oui (page statique) |
| NPA, magasins, panier, trajet, date future | Fonctionnels et testés (phase 4), mode mémoire sans base de données | **Non** : pilote local (§ 6) |
| Actions | Lidl : actions en cours et annoncées (531) ; Aldi : privé ; relevés : prix d'action distinct, fin jamais inventée | Lidl + relevés |
| Mise à jour quotidienne | Possible localement (ordinateur allumé) ; sur GitHub Actions en option désactivée (§ 6.3) | Selon décision |

## 3. Audit honnête

### 3.1 Ce qui fonctionne (vérifié le 30.09.2026)

- Collecte Lidl (catégories, fiches produits en rotation, actions) : 0 blocage ; collecte Aldi (liste
  paginée) : 0 blocage ; Open Prices : relu le 30.09 à 20:51 (241 prix, 222 articles).
- Contrôle de non-régression du noyau : **69/69** (Lidl 47 besoins, Aldi 22).
- Moteur de comparaison, trajets estimés, actions datées, date future : tests unitaires et parcours
  navigateur de la phase 4, inchangés.
- Nouveau : relevés en magasin (`releves`, `magasins`), prix en vrac Open Prices, matrice 50 × 5 et page
  publique (`matrice-essentiels`), panier de base reproductible (§ 5.3).

### 3.2 Accès technique, conditions, fraîcheur, couverture

| Enseigne | Accès technique | Conditions de réutilisation | Fraîcheur | Couverture du noyau |
|---|---|---|---|---|
| **Lidl** | 200, robot identifié, `robots.txt` respecté | Aucune condition d'utilisation du site trouvée ; `Disallow: /catalog/` à confirmer (§ 8) | Quotidienne possible (≈ 530 pages, ≈ 30–40 min) | **47/50** (manquent farine mi-blanche, vinaigre de vin, lentilles) |
| **Aldi** | 200 sur l'API publique du site (liste paginée) | « à des fins **privées** uniquement » : **aucun usage public** sans autorisation écrite | Quotidienne possible (43 requêtes) | 22/50 en privé ; l'API n'expose ni fruits, ni légumes, ni œufs, ni farine, ni lait UHT d'origine indiquée |
| **Migros** | 403 sur `www.migros.ch` pour un robot identifié | Mentions légales du groupe : reproduction interdite sans autorisation | — | 0 (Open Prices : 1 relevé trop ancien) |
| **Coop** | Défi anti-robot (DataDome), aucun contournement | Non lues (accès refusé) | — | 1 (Open Prices, penne, 04.08.2026) |
| **Denner** | 200 | CG § 15 : usage public ou commercial interdit sans autorisation écrite | — | 0 (Open Prices : 1 relevé trop ancien) |

### 3.3 Données uniquement de démonstration

`PRICE_DATA=demo` et les tests `e2e/` (mode démonstration) utilisent des **prix fictifs pour les huit
enseignes**. Toute comparaison Migros, Coop ou Denner vue dans ce mode est fictive : elle n'est **pas**
une fonctionnalité disponible. Les paniers de `/fr/exemples` et `data/demo/*.md` utilisent des prix réels,
Aldi compris (vue privée), sauf les fichiers `*-sans-aldi-api.md` et `panier-noyau-public.md`.

### 3.4 Constat à corriger : instantané Aldi dans le dépôt public (réglé le 01.10.2026)

Réglé : les instantanés des sources non publiables sont écrits dans `data/private/` (exclu de Git) ;
`aldi-api.json` a été retiré de la branche (il reste dans l'historique).


`data/prices/live/aldi-api.json` (prix Aldi, 2,8 Mo) est versionné depuis la phase 3 dans un dépôt
**public**, ce qui contredit l'exclusion d'Aldi de tout usage public. Recommandation (décision de
l'exploitant, § 10 étape 1) : retirer le fichier de la branche et l'ajouter à `.gitignore` (collecte
locale seulement) ; l'historique Git en conserve une copie (réécriture d'historique non recommandée sans
décision explicite). Conséquence : la vue privée et l'exemple privé ne sont plus reproductibles depuis
le seul dépôt (il faut lancer `pnpm job collect --only=aldi-api` en local).

## 4. Sources gratuites testées par enseigne

Tests sur un petit échantillon réel avant tout développement (30.09.2026, robot identifié, 3 s entre
deux requêtes).

| Enseigne | Source gratuite testée | Résultat | Couverture | Fraîcheur | Conditions | Automatisation |
|---|---|---|---|---|---|---|
| Lidl | Pages publiques (catégories, fiches, actions) | ✅ | 47/50 ; **32/50 sans les fiches** `/fr/catalog/…` | 28–30.09 | Aucune restriction trouvée ; ⚖️ LCD art. 5 let. c, `robots.txt` | ✅ `collect --only=lidl-web` |
| Lidl | Open Prices | ✅ (12 prix, 1 récent) | 0 | — | ODbL | ✅ |
| Aldi | API publique du site | ✅ technique | 22/50 | 30.09 | ❌ public (fins privées) | ✅ privé seulement |
| Aldi | Relevé en rayon | Non testé (déplacement requis) | jusqu'à 50/50 par magasin | selon passages | ✅ (faits constatés en magasin) | ❌ manuel |
| Migros | `www.migros.ch/fr` | ❌ 403 | — | — | Reproduction interdite | — |
| Migros | `produkte.migros.ch`, sites régionaux | ❌ domaines inexistants | — | — | — | — |
| Migros, Coop | Prospectus d'actions (PDF chez un éditeur de presse) | ❌ erreur 520 ; un prospectus ne couvre que des actions | — | — | Mêmes réserves | — |
| Coop | `www.coop.ch` | ❌ anti-robot, aucun contournement | — | — | — | — |
| Coop | Page « Angebote » de la Coopzeitung | ❌ sans prix | — | — | — | — |
| Denner | Site et pages d'actions | 200, **non collecté** | — | — | ❌ CG § 15 | — |
| Toutes | **Open Prices** (API, ODbL) | ✅ | Migros 0, Coop 1, Denner 0 (sur 50) | 935 prix en CHF au total, 456 en 400 jours, 154 depuis le 30.06, **47 en septembre** 2026 pour toute la Suisse | ✅ ODbL (attribution, partage à l'identique) | ✅ quotidien |
| Toutes | Open Prices, prix en vrac (catégories) | ✅ lu ; **0 prix** en CHF dans la fenêtre de 400 jours (4 au total, le plus récent du 16.08.2025) | 0 | — | ✅ ODbL | ✅ |
| Toutes | opendata.swiss (API CKAN) | ❌ indices (IPC) et statistiques agricoles, aucun prix par enseigne | — | — | OGD | — |
| Toutes | **Relevés en magasin** (`data/releves/*.csv`) | ✅ outil prêt et testé ; **0 relevé réel à ce jour** | jusqu'à 50/50 par magasin | selon passages | ✅ données propres | Import automatique, relevé manuel |

Les prix permanents et les actions restent distincts partout : actions Lidl et Aldi datées (en cours /
annoncées, fin « non publiée » jamais confirmée au-delà du dernier jour vu), prix remisés Open Prices
écartés sans prix normal, action relevée sans date de fin valable le seul jour du relevé.

## 5. Matrice des besoins × prix disponibles

Détail complet, besoin par besoin : `data/matrice/essentiels.md` (et `.json`), recalculé par
`pnpm job matrice-essentiels`. Page publique correspondante : `data/public/index.html`.

### 5.1 Résumé

| Enseigne | Officiel public | Relevé local | Open Prices | Privé seulement | Trop ancien | Aucune donnée |
|---|---|---|---|---|---|---|
| Migros | 0 | 0 | 0 | 0 | 1 | 49 |
| Coop | 0 | 0 | 1 | 0 | 1 | 48 |
| Denner | 0 | 0 | 0 | 0 | 1 | 49 |
| Aldi | 0 | 0 | 0 | 22 | 0 | 28 |
| Lidl | 47 | 0 | 0 | 0 | 0 | 3 |

| Besoins comparables dans au moins… | 1 enseigne | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Version publique (sans Aldi) | 47 | 1 | 0 | 0 | 0 |
| Pilote privé (avec Aldi) | 48 | 21 | 1 | 0 | 0 |

### 5.2 Par rayon (besoins couverts)

| Rayon | Besoins | Lidl | Aldi (privé) | Migros / Coop / Denner |
|---|---|---|---|---|
| Fruits | 5 | 5 | 0 | 0 |
| Légumes | 7 | 7 | 0 | 0 |
| Pommes de terre | 2 | 2 | 0 | 0 |
| Pâtes, riz, céréales, légumineuses | 6 | 5 | 5 | Coop : penne |
| Farine, sucre, sel | 4 | 3 | 0 | 0 |
| Huiles, vinaigre | 4 | 3 | 2 | 0 |
| Lait, beurre, fromages | 10 | 10 | 5 | 0 |
| Œufs | 2 | 2 | 0 | 0 |
| Pain | 2 | 2 | 2 | 0 |
| Viande (poulet, bœuf haché, jambon) | 3 | 3 | 3 | 0 |
| Conserves (thon, tomates, pois chiches) | 3 | 3 | 3 | 0 |
| Confiture, café | 2 | 2 | 2 | 0 |

### 5.3 Exemple reproductible sur prix réels : panier de base à Bulle

17 aliments du noyau (`data/demo/panier-noyau.json`), départ 1630 Bulle, rayon 5 km, courses le
01.10.2026, voiture 0,35 CHF/km aller-retour, 13 succursales des 5 enseignes dans le rayon.

```bash
pnpm job demo-baskets --now=2026-09-30T19:00:00Z --baskets=panier-noyau.json --exclude=aldi-api --name=panier-noyau-public
pnpm job demo-baskets --now=2026-09-30T19:00:00Z --baskets=panier-noyau.json --name=panier-noyau-prive
```

| Vue | Résultat | Données manquantes |
|---|---|---|
| Publique (`data/demo/panier-noyau-public.md`) | Lidl seul : **41,85 CHF** d'achats (17/17), trajet estimé 1,7 km, 0,60 CHF, total 42,45 ; aucune comparaison possible | Migros, Coop, Denner : « aucune donnée gratuite » pour les 17 articles ; Aldi : « non affiché (source sans autorisation de réutilisation) » |
| Privée (`data/demo/panier-noyau-prive.md`) | Lidl 41,85 (17/17) ; Aldi 7/17 (20,31, **incomplet, non comparable**) ; aucune combinaison moins chère | Aldi : fruits, légumes, pommes de terre, farine, sucre, lait, œufs, yogourt absents de sa source ; Migros, Coop, Denner : aucune donnée |

Ligne à ligne, chaque case donne l'article retenu, le nombre de paquets, le montant, la date du
relevé et l'action éventuelle (ex. pommes 1,99 CHF, action annoncée du 01.10 au 07.10 ; pommes de terre
2,5 kg 3,75 CHF). Pour des prix Migros, Coop ou Denner à Bulle, il faut un relevé (`docs/RELEVES.md`).

## 6. Fonctionnement à 0 CHF

### 6.1 Architecture retenue (existant réutilisé, aucun serveur)

```
Collecte (ordinateur ou Actions)  →  data/prices/live/*.json  →  comparateur local (pnpm dev, mode mémoire)
Relevés (data/releves/*.csv)      →  data/prices/live/releves.json ↗
                                   →  matrice-essentiels  →  data/public/index.html  →  GitHub Pages (option)
```

Pas de base de données, pas d'hébergement dynamique : fichiers JSON versionnés, page HTML autonome.

### 6.2 Limites des services gratuits vérifiées

| Service | Conditions gratuites | Risque de facturation | Décision |
|---|---|---|---|
| GitHub Actions | Gratuit pour les exécuteurs standard des **dépôts publics** ; sans moyen de paiement enregistré, « usage is blocked once you use up your quota » | Nul si aucun moyen de paiement n'est ajouté (à ne pas faire) | Construction de la page : ✅ ; collecte : option désactivée (§ 6.3) |
| Cache et artefacts Actions | Cache 10 Go par dépôt, entrées inutilisées supprimées après 7 jours ; artefacts gardés 7 jours | Nul (dépôt public) | ✅ |
| GitHub Pages | Site ≤ 1 Go, 100 Go de trafic par mois (limite souple), 10 constructions par heure, déploiement ≤ 10 min ; interdit pour un commerce en ligne ou un SaaS | Aucun (service gratuit) | ✅ pour la page statique non commerciale, **après fusion dans `main`** et activation par l'exploitant |
| Netlify (compte StayReady) | 300 crédits par mois, déploiement 15 crédits, 20 crédits par Go | Blocage partagé avec StayReady | ❌ |
| Vercel Hobby | 100 Go de trafic, 1 000 000 d'invocations par mois ; **usage personnel non commercial uniquement** (tout gain financier d'une personne impliquée, publicité ou affiliation l'excluent) ; au-delà : mise en pause, pas de facture | Nul, mais nouveau compte et condition « non commercial » à respecter | Option pour l'application complète **seulement** si TesPrix reste non commercial ; non mise en place |
| Cloudflare Workers (gratuit) | 100 000 requêtes par jour, **10 ms de CPU** par requête ; au-delà : erreurs, pas de facture | Nul | ❌ inadapté (le calcul d'un panier dépasse 10 ms) |

### 6.3 Collecte automatique : ce que GitHub permet, ce qui reste à décider

Le workflow `.github/workflows/tesprix-donnees.yml` est prêt :

- **toujours** (à chaque modification des données) : relevés → matrice → contrôle → page publique
  (artefact), vérification qu'aucune donnée Aldi n'y figure ;
- **collecte Lidl + Open Prices** (tâche quotidienne 04:23 UTC ou lancement manuel) **seulement si** la
  variable de dépôt `TESPRIX_COLLECTE_ACTIONS` vaut `oui` ; jamais Aldi ; instantanés gardés dans le cache
  Actions (`live-restore` ne remplace jamais une collecte plus récente versionnée) ;
- **publication Pages** seulement depuis `main` et si `TESPRIX_PAGES` vaut `oui`.

Zone grise à trancher par l'exploitant : les conditions de GitHub interdisent sur les exécuteurs
hébergés « any other activity unrelated to the production, testing, deployment, or publication of the
software project ». Collecter chaque jour des pages de Lidl pour alimenter la page publiée peut être lu
comme de la « publication » du projet, ou comme un usage étranger au logiciel. Sans avis (payant), la
position prudente est **collecte locale + construction et publication sur GitHub** (clairement
couvertes). Les tâches planifiées ne s'exécutent de toute façon que sur `main` (fusion = décision de
l'exploitant).

### 6.4 Ce qui est automatique, ce qui demande l'exploitant

L'ordinateur n'est pas supposé allumé en permanence. Les prix sont datés partout ; un prix officiel est
« indicatif » après 7 jours et **écarté après 30 jours**, un relevé communautaire après 90 jours : un
arrêt de la collecte ne produit jamais un prix faux présenté comme récent, seulement des cases vides.

| Tâche | Automatique ? | Qui, quand | Effort |
|---|---|---|---|
| Collecte Lidl + Open Prices | Oui, dès que la commande est lancée (≈ 35 min sans intervention) | Exploitant, 1 à 2 fois par semaine (actions annoncées de la semaine suivante comprises) | 2 min |
| Collecte Aldi (pilote privé) | Oui (43 requêtes) | Exploitant, en local seulement | inclus |
| Versionner les instantanés (`git commit`, `git push`) | Non | Exploitant, après chaque collecte | 2 min |
| Relevés Migros, Coop, Denner (et Aldi pour le public) | Import automatique ; relevé manuel | Exploitant ou bénévoles, 1 fois par mois et par magasin | 1 h à 1 h 20 par magasin (`docs/RELEVES.md` § 6) |
| Tickets de caisse | Transcription assistée par l'IA déjà disponible | Exploitant | 5–10 min par ticket |
| Revue des correspondances (`match-audit`, `match-candidates`) | Suggestions automatiques ; décision humaine | Exploitant, 1 fois par mois | 20–30 min |
| Contrôle (`validate`, `data-report`) | Oui | Exploitant, lecture du résultat | 10 min par semaine |
| Matrice et page publique | Oui (Actions à chaque envoi) | — | 0 |

Effort total réaliste pour **une** zone (ex. Bulle) avec 4 magasins relevés chaque mois : **≈ 5 à 6 h
par mois** ; sans relevés (Lidl seul) : ≈ 30 min par semaine.

### 6.5 Pilote local (disponible dès maintenant)

```bash
cd comparateur && pnpm install
pnpm job collect --only=lidl-web,open-prices   # + aldi-api pour le pilote privé
pnpm job releves && pnpm job matrice-essentiels && pnpm job validate
pnpm dev                                       # http://localhost:3000 : NPA, magasins, panier, trajet, date
RESTRICTED_SOURCES=exclude pnpm dev            # vue publique (Aldi exclu)
```

## 7. Demandes d'autorisation gratuites (brouillons, **non envoyés**)

Message commun, à adapter (courriel ou formulaire de contact de l'enseigne, en français ou en allemand) :

> Objet : Réutilisation de vos prix publics dans un comparateur gratuit pour les particuliers
>
> Bonjour, nous développons TesPrix, un comparateur **gratuit, sans publicité ni revente de données**,
> du prix de 50 aliments de base en Suisse. Nous souhaiterions afficher [objet précis ci-dessous], avec
> la source et la date de chaque prix, un lien vers votre site et le retrait immédiat de vos données sur
> simple demande. La lecture se fait par un robot identifié, au plus une fois par jour, en respectant
> `robots.txt` et un délai de 3 secondes entre deux requêtes. Pouvez-vous nous indiquer si cet usage est
> accepté, et à quelles conditions ? Un flux ou un fichier officiel nous conviendrait encore mieux.

| Enseigne | Objet précis | Ce que la réponse débloque |
|---|---|---|
| Aldi Suisse | Prix et actions de la liste publique `api.aldi-suisse.ch/v3/product-search` | 22 besoins publics (21 comparables avec Lidl) |
| Lidl Suisse | Confirmation pour les fiches `/fr/catalog/product/view/id/N` listées au plan du site (`Disallow: /catalog/`) | Maintien de 47/50 au lieu de 32/50 |
| Denner | Prix et actions publiés sur denner.ch (CG § 15 : autorisation écrite requise) | Denner collecté automatiquement |
| Migros | Accès à un flux de prix, ou autorisation de lecture de `www.migros.ch` (403 aujourd'hui) | Migros collecté automatiquement |
| Coop | Idem pour `www.coop.ch` (anti-robot, aucun contournement) | Coop collecté automatiquement |

## 8. Risques résiduels sans avis juridique payant

- **Lidl** : aucune condition d'utilisation trouvée ; la LCD (art. 5 let. c) protège contre la reprise
  d'un résultat de travail « sans sacrifice correspondant » ; `Disallow: /catalog/` ne vise pas
  `/fr/catalog/…` selon RFC 9309 mais l'intention de l'éditeur est incertaine. Mesures : seuls des faits
  repris (désignation, contenance, prix, dates), source et lien affichés, `LIDL_PRODUCT_PAGES_PER_RUN=0`
  disponible (32/50), demande à Lidl (§ 7). **Publier la page reste une décision de l'exploitant.**
- **Relevés** : prix constatés soi-même (faits) ; respecter le règlement du magasin (photos).
- **Open Prices** : ODbL — attribution affichée sur la page ; une base dérivée publiée doit rester sous
  ODbL (`pnpm job export-odbl`).
- **Aldi** : jamais publié (§ 3.4 pour l'instantané versionné).

## 9. Mise en œuvre et vérifications de cette phase

| Élément | Fichiers | Tests |
|---|---|---|
| Noyau de 50 aliments | `packages/reference/src/products.ts` | validation 69/69 |
| Relevés en magasin | `packages/connectors/src/releves.ts`, `apps/worker/src/releves.ts`, `data/releves/modele.csv`, `docs/RELEVES.md` | 7 tests |
| Besoin déclaré par la source | `declaredSlug` (`packages/core/src/types.ts`, `matching.ts`) | inclus |
| Open Prices en vrac | `OP_CATEGORY_MAP`, `categoryProduct` (`open-prices.ts`) ; collecte réelle du 30.09 | 2 tests |
| Matrice et page publique | `apps/worker/src/matrix.ts`, `data/public/template.html` | 2 tests (dont : aucune donnée privée dans la page) |
| Panier de base | `data/demo/panier-noyau.json`, `demo-baskets --baskets= --name=` | exécution reproductible |
| Workflow gratuit | `.github/workflows/tesprix-donnees.yml`, `live-restore` | exécution sur la branche (construction seulement) |
| Correspondances | +4 décisions revues (laitue iceberg, pommes de terre 2,5 kg, sel, pain complet Aldi) | `match-audit` |

## 10. Prochaines étapes, par utilité

| # | Étape | Utilité | Effort | Qui |
|---|---|---|---|---|
| 1 | Retirer `aldi-api.json` du dépôt public (§ 3.4) | Conformité aux conditions d'Aldi | 10 min | Décision exploitant, puis commit |
| 2 | Envoyer les demandes d'autorisation (§ 7), en commençant par Aldi et Lidl | Seule voie gratuite vers une comparaison publique automatique | 30 min | Exploitant |
| 3 | Premier relevé réel : 4 magasins d'une zone (Migros, Coop, Denner, Aldi) avec `docs/RELEVES.md` | Première comparaison publique à 4–5 enseignes (locale) | ≈ 5 h | Exploitant ou bénévoles |
| 4 | Collecte locale 1 à 2 fois par semaine + `git push` | Garder Lidl « récent » | 5 min par passage | Exploitant |
| 5 | Encourager les contributions Open Prices autour de la zone pilote | Données ouvertes durables, lues automatiquement | variable | Bénévoles |
| 6 | Décider de la publication : fusion dans `main`, Pages (`TESPRIX_PAGES=oui`) | Page publique gratuite | 15 min | Exploitant |
| 7 | Décider de la collecte sur Actions (`TESPRIX_COLLECTE_ACTIONS=oui`) après lecture des conditions (§ 6.3) | Mise à jour sans ordinateur allumé | 5 min | Exploitant |
| 8 | Combler les 3 besoins Lidl manquants (farine mi-blanche, vinaigre de vin, lentilles) : revue ou redéfinition du besoin | 50/50 chez Lidl | 30 min | Exploitant + IA |
| 9 | Version statique complète (moteur de comparaison exécuté dans le navigateur sur les fichiers JSON) | Comparateur complet publiable sur Pages, sans serveur | plusieurs jours de développement | Développement |

## 11. Ce qui est démontré, ce qui bloque

- **Démontré** : comparateur complet sur prix réels (Lidl, Aldi en privé), noyau de 50 besoins, montant
  réellement payé, prix au kilo, actions datées, trajets, date future ; import de relevés en magasin et de
  prix en vrac ; matrice et page publique générées sans serveur ; fonctionnement à 0 CHF en local.
- **Bloque** : Migros et Coop refusent l'accès technique ; Denner et Aldi l'interdisent par leurs
  conditions ; Open Prices est trop peu alimenté en Suisse (47 prix en septembre pour tout le pays) ;
  aucun hébergement dynamique gratuit n'est validé pour un usage éventuellement commercial.
- **Meilleure couverture sans dépense** : Lidl 47/50 automatiquement et publiquement (sous réserve § 8) ;
  les quatre autres enseignes uniquement par relevés, **magasin par magasin**, au prix d'environ une heure
  par magasin et par mois ; Aldi automatiquement en privé seulement.
