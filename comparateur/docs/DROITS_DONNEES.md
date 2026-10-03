# Droits de réutilisation des données — état au 30.09.2026

> Constat technique et documentaire préparé pour l'exploitant et son conseil juridique. **Ce n'est pas
> un avis juridique.** Aucun message n'a été envoyé à une enseigne ni à un fournisseur ; aucun
> abonnement n'a été souscrit. Code : `packages/core/src/sources.ts` (`publicUse`, `termsNote`).

## 1. Principe appliqué

Une source techniquement accessible n'est pas, de ce seul fait, réutilisable dans un service public
ou commercial. Chaque source porte un statut de réutilisation ; une source dont les conditions
restreignent l'usage (**autorisation requise**) est **exclue de l'affichage en production** tant
qu'aucune autorisation n'est enregistrée (`AUTHORIZED_SOURCES`). En local, l'aperçu privé la conserve
pour l'évaluation (`RESTRICTED_SOURCES=include|exclude` permet de le vérifier).

| Statut | Signification | Sources |
|---|---|---|
| Licence ouverte | Licence publiée, conditions à respecter | Open Prices (ODbL), OpenStreetMap (ODbL), swisstopo (OGD) |
| Aucune restriction trouvée | Aucune clause restrictive lue ; avis juridique requis avant exploitation | Lidl (site officiel) |
| **Autorisation requise** | Conditions de l'enseigne restreignant l'usage | **Aldi Suisse** (exclue en production), Denner (non collectée), Migros (non collectée) |
| Licence requise | Fournisseur tiers, usage applicatif payant | FoodAlly (comparaison seulement) |
| Données propres | Produites par TesPrix ou ses utilisateurs | Tickets de caisse (envoi fermé) |

### 1.1 Provenance et enseigne : deux notions distinctes (03.10.2026)

Le droit de publier dépend de la **source** d'un prix, jamais de l'**enseigne** concernée :

- un relevé **Open Prices** fait chez Coop, Aldi, Denner ou Migros est jugé selon la licence d'Open
  Prices (ODbL) : il est publiable, daté, « indicatif », avec son lieu ;
- un prix des collecteurs privés (API Aldi, site Denner, journal Coop) n'est **jamais** publiable,
  quelle que soit l'étiquette qu'il porte.

La provenance est **établie, pas déclarée** (`recordProvenance`, `packages/core/src/sources.ts`) :
fichier de la source (un fichier du dossier privé n'est jamais lu comme publiable), étiquettes et
**hôte des URL** de chaque article, prix et action (`SOURCE_REGISTRY[…].hosts`). La source la plus
restrictive l'emporte ; dans le fichier d'une source publiable, un enregistrement dont une URL ne
relève pas de cette source est écarté. Les filtres de production (`buildOfferIndex`) et le test
`privacy.test.ts` contrôlent aussi les hôtes. Tests : `packages/connectors/test/free-sources.test.ts`
(« provenance établie… »), `packages/core/test/consumer.test.ts` (« provenance… », « exclusion… »).
Les statistiques par enseigne (pages Magasins, Sources, Bientôt) sont calculées **après** exclusion.

## 2. Par source et par méthode de collecte

| Source | Méthode | Accès technique | Conditions lues | Statut TesPrix |
|---|---|---|---|---|
| **Lidl Suisse** — `sortiment.lidl.ch` (catégories, fiches), `www.lidl.ch` (actions) | Pages HTML publiques, robot identifié, 3 s par hôte | 200 ; `robots.txt` respecté (voir §3) | Mentions légales (Lidl Schweiz DL AG, Weinfelden) **sans conditions d'utilisation du site** ; seules des conditions Lidl Plus existent. Aucune clause d'interdiction trouvée. | Utilisé ; ⚖️ avis juridique (LCD art. 5 let. c) avant ouverture ; demande d'accord recommandée |
| **Aldi Suisse** — `api.aldi-suisse.ch/v3/product-search` | JSON public consommé par le site, liste paginée | 200 ; `robots.txt` absent (404) sur l'hôte de l'API ; recherche, fiches et magasins refusés (403) | Conditions d'utilisation d'Aldi Suisse (`/fr/informations/conditions-dutilisation`) : « Les utilisateurs sont autorisés à recourir aux services d'ALDI SUISSE **à des fins privées uniquement**. Il est interdit aux utilisateurs de se servir de données dans le but de recourir aux contenus associés à des fins industrielles, **commerciales** ou pour toute autre exploitation dans un secteur d'activité. » Champ d'application (§ 1.1) centré sur le compte utilisateur ; portée pour un accès sans compte **incertaine**. | **Autorisation requise** : collecte limitée à l'évaluation interne, **exclue de l'affichage en production** ; même exigence que Denner |
| Denner — recherche et actions (`www.denner.ch`) | Pages publiques, robot identifié, 3 s par hôte, ≈ 53 requêtes par jour | 200 ; `robots.txt` permissif | « Précisions d'ordre juridique » : reproduction, transmission, mise en réseau et utilisation « dans un but de publication ou à des fins commerciales » interdites sauf accord préalable écrit | **Collecte privée** depuis le 01.10.2026 (`data/private/`), **jamais publiée** ; publication après accord écrit |
| Migros — `www.migros.ch` | Non collecté | 403 sur tout l'hôte | Mentions légales du groupe : reproduction et usage commercial interdits sans autorisation écrite | Non collecté ; accord requis |
| Coop — `www.coop.ch` | Non collecté | Défi anti-robot (DataDome) | — | Non collecté, aucun contournement ; accord requis |
| Coop — journal numérique `epaper.cooperation.ch` (magazine des actions) | Pages PDF publiques, session anonyme, robot identifié, une lecture par semaine | 200 ; `robots.txt` « Allow: / » | Mentions légales de la Coopzeitung sans clause sur la réutilisation ; conditions de coop.ch non consultables par un robot | **Collecte privée** depuis le 01.10.2026 (`data/private/`), **jamais publiée** ; demande prête (`docs/AUTORISATIONS.md` § 3.3) |
| Open Prices (Open Food Facts) | API publique | 200 | ODbL 1.0 : attribution, partage à l'identique des bases dérivées | Utilisé, « indicatif » ; export ODbL prêt (`export-odbl`) |
| OpenStreetMap (succursales, horaires) | Overpass, instantané | 200 | ODbL 1.0 | Utilisé, attribution affichée |
| swisstopo (localités) | Fichier OGD | 200 | Données publiques en libre accès, source à citer | Utilisé, attribution affichée |
| FoodAlly | Serveur MCP public, par requête | 200 ; quota anonyme (§ 5) | « Bulk crawling » interdit sans licence ; attribution avec lien obligatoire ; usage « apps, bots, agents » dans l'offre Pro | Comparaison seulement ; jamais affiché ; licence non souscrite |
| Tickets de caisse | Saisie volontaire, nettoyage sur l'appareil | — | Politique de confidentialité à valider | Envoi fermé |

## 3. Lidl : point à clarifier dans `robots.txt`

`sortiment.lidl.ch/robots.txt` contient `Disallow: /catalog/` et `Disallow: /*?`. Les fiches produits
lues en rotation sont `/fr/catalog/product/view/id/N` :

- selon RFC 9309 (correspondance par **préfixe** du chemin), `/catalog/` ne vise pas `/fr/catalog/…` ;
- Lidl **publie ces adresses dans son propre plan du site** (`sitemaps/fr.xml`, déclaré dans `robots.txt`) ;
- aucune adresse avec `?` n'a jamais été demandée (vérifié sur les archives des 28 et 30.09).

L'intention de l'éditeur pourrait toutefois viser aussi les chemins préfixés par la langue. **Impact
mesuré** si les fiches sont abandonnées (`LIDL_PRODUCT_PAGES_PER_RUN=0`) : Lidl passerait d'environ
**197 à 99** besoins couverts (les pages catégories et d'actions restent). À poser à Lidl dans la
demande d'accord ; décision de l'exploitant (§ 7).

## 4. Aldi : traitement identique aux autres enseignes

- Collecte : la liste paginée publique reste lue une fois par jour (43 requêtes) pour l'évaluation
  interne ; `ALDI_API=off` l'arrête immédiatement.
- Affichage : en production, Aldi est retiré de l'index de prix (articles, prix, actions) et la page
  magasins indique « Prix non affichés : les conditions de l'enseigne réservent ses données à un
  usage privé ; autorisation en attente ». Le comparateur fonctionne alors avec Lidl seul (exemple de
  Lausanne : 40.92 CHF, aucune combinaison possible).
- Levée : autorisation écrite d'Aldi Suisse (ou avis juridique concluant que la clause ne s'applique
  pas), puis `AUTHORIZED_SOURCES=aldi-api`.

## 5. FoodAlly : évaluation pour élargir la couverture

### 5.1 Tarifs et quotas : ce que disent ses différentes pages (consultées le 30.09.2026)

| Source d'information | Gratuit | Pro | Business |
|---|---|---|---|
| En-têtes mesurés (`X-Ratelimit-*`, 28 et 30.09) | anonyme : **30/min, 100/jour** | — | — |
| Page `/licensing` | **60/min, 100/jour**, « hobby, low-volume » | **dès CHF 49/mois** : 600/min, 100 000/jour, historique complet, « apps, bots, agents » | **dès CHF 499/mois** : 6 000/min, 5 000 000/jour, export en masse |
| `llms.txt` (conditions pour les robots) | « **environ 2 000 requêtes par jour** » de prix courants | 49 : historique et métriques | 499 : catalogue en masse, 14 mois d'export ; usage commercial ou en masse négocié à part |
| Couverture annoncée | page d'accueil (phase 3) : ~312 000 articles, 19 vendeurs ; `llms.txt` : « plus de 300 000 produits, plus de 50 enseignes » | | |

Les trois indications de quota gratuit se contredisent (100 ou ~2 000 par jour ; 30 ou 60 par
minute) : **seul un accord écrit ferait foi**. TVA, durée de conservation, cache et affichage public ne
sont précisés nulle part.

Utilisation par TesPrix le 30.09.2026 : 126 recherches (`search_products`) et 4 requêtes techniques
(3 `robots.txt`, 1 `tools/list`), aucune réponse 402. Les en-têtes indiquaient un quota restant
« frais » à chaque passage (compteur apparemment par adresse de sortie) ; le total du jour **dépasse
néanmoins les 100 requêtes par jour** annoncées pour un client anonyme. Aucune requête supplémentaire
n'a été faite ensuite et la tâche applique désormais un **plafond local de 100 par jour**, quels que
soient les en-têtes (`apps/worker/src/benchmark.ts`).

### 5.2 Couverture effective (correspondances plausibles, non revues : borne haute)

Méthode : une recherche par besoin (termes allemands), meilleur article plausible par enseigne
(même dimension, contenance 1/6 à 5 fois la référence, mots de la requête dans la désignation,
exigences bio/origine/marque). 50 essentiels + deux échantillons systématiques de 38 besoins (1 sur 5)
parmi les 190 autres. Résumés : `data/benchmark/foodally-summary*.json`.

| Enseigne | 50 essentiels | Échantillon 76/190 | Estimation sur 240 (± IC 95 %) | TesPrix aujourd'hui (officiel) |
|---|---|---|---|---|
| Migros | 30 | 52 (68 %) | **≈ 160 ± 15** | 0 (2 via Open Prices) |
| Coop | 37 | 53 (70 %) | **≈ 170 ± 15** | 0 (2 via Open Prices) |
| Denner | 14 | 22 (29 %) | **≈ 69 ± 15** | 0 |
| Lidl | 27 | 50 (66 %) | ≈ 152 | 200 |
| Aldi | 29 | 42 (55 %) | ≈ 134 | 105 |

Besoins comparables si FoodAlly complétait Migros, Coop et Denner (TesPrix officiel pour Lidl et Aldi) :

| Comparables dans | Aujourd'hui | Avec FoodAlly (borne haute, estimation sur 240) | dont essentiels |
|---|---|---|---|
| ≥ 2 enseignes | 100 | ≈ 192 | 44/50 |
| ≥ 3 enseignes | 4 | ≈ 162 | 32/50 |
| ≥ 4 enseignes | 0 | ≈ 94 | 26/50 |
| 5 enseignes | 0 | ≈ 27 | 7/50 |

**Précision** : là où les deux sources coexistent (Lidl, Aldi), l'écart médian est nul ; mais 20 à
45 % des paires plausibles diffèrent de plus de 20 % (article différent : marque, format, variété).
Une revue manuelle des correspondances FoodAlly serait donc indispensable ; la couverture réellement
utilisable serait inférieure aux bornes ci-dessus.

**Fraîcheur** : les résultats de recherche ne portent **aucune date de relevé** ; FoodAlly parle de
« prix courants ». Impossible de savoir, par article, si le prix a été vérifié le jour même.

**Précision géographique** : aucun magasin, aucune région, aucun canal dans les résultats. Les prix
semblent nationaux, probablement issus des boutiques en ligne ; les prix régionaux (coopératives
Migros) et en magasin ne sont pas garantis.

**Droits** : attribution avec lien cliquable obligatoire ; collecte en masse interdite sans licence ;
cache, durée de conservation, affichage dans un comparateur public et redistribution **non
précisés**. Le palier gratuit (« hobby ») ne couvre pas un service public.

**Dépendance** : chaque observation garde sa provenance (`third_party`, niveau « licensed ») ; le repli
est désactivé par défaut (`PRICE_FALLBACK_SOURCES`) et peut être coupé sans effet sur Lidl ou Aldi.

### 5.3 Questions à adresser à FoodAlly (brouillon, non envoyé)

1. Quelle offre autorise l'**affichage public** des prix dans un comparateur gratuit (web) : Pro à
   CHF 49 suffit-il, ou Business est-il requis ? Montants HT/TTC, engagement, résiliation ?
2. Quota réel du palier gratuit et des paliers payants (30/min ou 60/min ; 100 ou ~2 000 par jour) ?
3. **Cache et conservation** : pouvons-nous conserver les prix obtenus (combien de temps) et servir un
   même prix à plusieurs utilisateurs sans nouvelle requête ?
4. **Date de relevé** et **canal** (en ligne / magasin) de chaque prix : disponibles par l'API ?
5. **Précision géographique** : prix nationaux, régionaux (coopératives Migros) ou par magasin ?
6. Fréquence de mise à jour par enseigne ; actions datées (début, fin, conditions) disponibles ?
7. Origine des données Migros, Coop, Denner et droits dont FoodAlly dispose pour les sous-licencier ;
   garantie en cas de réclamation d'une enseigne ?
8. Redistribution : exports ou API professionnelle de TesPrix incluant des prix FoodAlly exclus ou
   possibles (et à quelles conditions) ?
9. Forme exacte de l'attribution dans une interface mobile ; lien par article ou par page ?
10. Identifiants stables (EAN) pour une revue durable des correspondances ?

## 6. Points pour l'avis juridique (brouillon)

1. **LCD art. 5 let. c** (reprise d'un résultat de travail par des procédés techniques) : la lecture
   quotidienne de prix publics (Lidl, Aldi) et leur comparaison relèvent-elles d'une « mise en valeur
   sans sacrifice correspondant » ? Différence entre usage grand public gratuit et offres B2B.
2. **Aldi** : opposabilité de la clause « fins privées uniquement » à un accès sans compte à l'API du
   site ; portée du § 1.1 ; conséquences d'une poursuite de la collecte pour évaluation interne.
3. **Lidl** : absence de conditions d'utilisation du site ; interprétation de `Disallow: /catalog/`
   face à `/fr/catalog/…` listé au plan du site.
4. Droit d'auteur sur les désignations (seuls des faits sont repris : nom, contenance, prix, dates ; ni
   photo ni texte descriptif).
5. **OIP** : un comparateur qui affiche des prix de tiers doit-il respecter l'indication des prix de
   base et des prix « au lieu de » (comparaison concurrentielle) ?
6. Responsabilité en cas de prix erroné affiché (clause de non-garantie, statut « indicatif »).
7. ODbL : effet de partage à l'identique sur une base qui mêle Open Prices et données propres.
8. Licence FoodAlly : droits d'affichage public, sous-licence des données d'enseignes.
9. LPD : tickets de caisse (nettoyage sur l'appareil suffisant ?), journaux, mesures d'usage.
10. Nom « TesPrix » (marque, raison sociale).

## 7. Demandes d'accord aux enseignes (brouillon, non envoyé)

Version à jour et message prêt à adapter : `docs/PLAN_SANS_DEPENSES.md` § 7 (plan sans dépenses : aucun
avis juridique payant ; les points du § 6 restent ouverts et sont traités par des demandes gratuites et
une limitation prudente des usages).

Modèle de base : `docs/audit/02-juridique.md` § 8. Points propres à la phase 4 :

- **Aldi Suisse** : autorisation écrite de réutiliser, dans un comparateur gratuit pour les
  particuliers, les prix et actions publiés sur `api.aldi-suisse.ch/v3/product-search` (liste
  paginée, une lecture par jour, robot identifié) ; ou flux officiel. Préciser : pas de revente de
  données brutes, source affichée, retrait sur simple demande.
- **Lidl Suisse** : confirmation que la lecture des fiches `/fr/catalog/product/view/id/N` publiées au
  plan du site est acceptée (sinon arrêt, § 3) ; même engagement de retrait.
- **Migros, Coop, Denner** : accès à un flux de prix et d'actions, ou autorisation écrite pour Denner
  (pages d'actions techniquement accessibles).
