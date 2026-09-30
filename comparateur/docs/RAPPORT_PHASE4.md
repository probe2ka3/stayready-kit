# TesPrix — compte rendu de la phase 4 : validation du comparateur grand public

Date : 30.09.2026. Branche : `claude/swiss-grocery-comparison-w7bk8q` (non fusionnée, non déployée).
Aucun achat, aucun abonnement, aucun message envoyé à une enseigne ou à un fournisseur. StayReady
n'a pas été modifié.

Chiffres reproductibles : `pnpm job demo-baskets --now=2026-09-30T19:00:00Z` (→ `data/demo/resultats.md`),
avec `--exclude=aldi-api` pour la vue publique (→ `data/demo/resultats-sans-aldi-api.md`).

## En bref

- Le parcours complet fonctionne sur les **prix réels** : localité → magasins (avec l'état des données
  de prix de chaque enseigne) → panier → comparaison **Lidl seul / Aldi seul / combinaison**, montant
  payé par paquets, trajet aller-retour estimé et **annoncé comme estimé**, économie après
  déplacement, courses à une date future.
- Le panier de Lausanne est confirmé : **Lidl 40.92, combinaison 34.63, gain net 6.29 CHF** après
  détour. Ce gain repose sur deux articles, dont une action Aldi du 01 au 07.10 dont la fin n'est pas
  publiée.
- La validation a révélé des erreurs réelles, toutes corrigées et couvertes par des tests :
  - 12 actions Lidl conditionnelles lues comme de simples prix réduits ;
  - une eau de marque (Vittel, 1.15 CHF) seule rapprochée alors que la marque propre existait
    (0.25 CHF) ;
  - un yogourt sans lactose comparé à un yogourt ordinaire ;
  - 18 autres correspondances moins chères manquantes (café en grains, chocolat noir, gel douche…).
- **Droits** : les conditions d'Aldi réservent ses données à un **usage privé**. Aldi est désormais
  traité comme Denner : il est **exclu de l'affichage en production** sans autorisation écrite. Sans
  elle, la version publique ne compare que Lidl, et le gain de Lausanne disparaît.

## 1. Ce qui fonctionne effectivement, et les preuves

| Exigence | Réalisation | Preuve |
|---|---|---|
| NPA ou localité, magasins proches | Recherche swisstopo, rayon 5–30 km, succursales OSM par enseigne | e2e `parcours complet` |
| Sélection d'enseignes et de magasins | Interrupteur par enseigne, case par succursale, rayon et **nombre maximal de magasins** (page Magasins et page Comparer) | e2e, captures `*-magasins.jpg` |
| Présence ≠ données de prix | Par enseigne : « Prix officiels » (avec la date du relevé), « Prix partiels » (Open Prices), « Sans prix », « Prix non affichés » (source sans autorisation) | API `/stores` `priceData`, e2e démo |
| Stock inconnu | « Stock : inconnu » sur chaque succursale ; aucune source ne publie la disponibilité | e2e |
| Lidl seul, Aldi seul, combinaison | Tableau « Comparaison des solutions » : achats, trajet, durée, coût, total, économie brute et nette face au meilleur magasin unique **complet** | tests `consumer.test.ts`, captures `*-comparer.jpg` |
| Équivalence des produits | Correspondances revues ; bio, origine, AOP, marque et dimension exigés ; **sans lactose ≠ ordinaire** ; `match-audit` pour les correspondances manquantes | 5 tests « correspondances » |
| Montant réellement payé | Paquets × prix du paquet, quantité demandée et achetée affichées (« À payer : 3 × 125 g à 0.79 · demandé 300 g · acheté 375 g ») | 4 tests « quantités et paquets » |
| Articles manquants, couverture | Couverture par solution (x/y, %), articles introuvables partout ; aucune économie affichée pour un panier incomplet | 3 tests « solutions » |
| Source, date, conditions | Source et date de chaque prix, confiance ; conditions des actions (carte, quantité, 2e paquet, région) ; actions « dès » jamais appliquées | 5 tests « conditions », tests connecteur Lidl |
| Trajet et économie nette | Aller-retour par défaut ; coût/km modifiable ; méthode affichée (« vol d'oiseau × 1,3, 3 min + distance à 38 km/h, pas un itinéraire routier ») | 3 tests « trajet » |
| Courses plus tard | Onglet « Plus tard » : actions publiées valables ce jour-là dans la région ; « en cours » ou « annoncée » ; dernier prix connu signalé comme non garanti ; fin non publiée non confirmée | 4 tests « dates », 1 test « régional », e2e |
| Fraîcheur, panne de collecte | Dates des relevés par enseigne ; alerte au-delà de 48 h ; exclusion au-delà de 30 jours | test « collecte en panne » |

Tests exécutés sur le commit de code final **`ccd4498`** :

| Suite | Résultat |
|---|---|
| Vérification des types (`pnpm typecheck`, 6 paquets) | OK |
| Tests unitaires (`vitest --project unit`) | **200/200** (29 nouveaux : 26 dans `consumer.test.ts`, 2 Lidl conditionnel, 1 Aldi au poids) |
| Tests d'intégration PostgreSQL + PostGIS | **7/7** |
| Parcours navigateur, site public (mobile + bureau, `pnpm test:e2e`) | **8/8** |
| Parcours navigateur, administration (base fraîche) | **2/2** |
| Démonstration sur prix réels (`pnpm test:e2e:demo`, 3 paniers × mobile/bureau) | **6/6** |
| Build de production (`pnpm build`) | OK |
| Jeu de validation des essentiels (`pnpm job validate`) | 76/76 |

## 2. Paniers et trajets (données réelles du 28 au 30.09)

Hypothèses communes aux trois paniers :

- rayon de 10 km, au plus 2 magasins, en voiture à 0.35 CHF/km, aller-retour ;
- **trajets estimés** : vol d'oiseau × 1,3 ; il ne s'agit pas d'un itinéraire routier ;
- prix affichés « indicatifs » lorsque la date est future ;
- détail ligne à ligne dans `data/demo/resultats.md`.

### 2.1 Lausanne (14 articles, jeudi 01.10 à 10 h)

| Solution | Articles | Achats | Trajet | Coût trajet | Total | Économie achats | Économie nette |
|---|---|---|---|---|---|---|---|
| **Combinaison** Aldi (Rue St-Martin) → Lidl (0,4 km chacun) | 14/14 | 34.24 | 1,1 km · 11 min | 0.39 | **34.63** | 6.30 | **6.29** |
| Lidl seul (référence) | 14/14 | 40.54 | 1,1 km · 8 min | 0.38 | **40.92** | — | — |
| Aldi seul | 13/14 | 39.08 | 0,9 km · 7 min | 0.33 | incomplet (non comparable) | — | — |

**Vérification des quantités.** Chaque ligne est payée par paquets entiers :

- 2 × spaghetti 500 g → 1 paquet de 1 kg (1.19) ;
- 2 × mozzarella 150 g → 3 × 125 g (acheté 375 g) ;
- 4 × yogourt 180 g → 2 pots de 500 g ;
- pain toast 500 g → **2 × 335 g chez Lidl (3.98)**, contre 1 × 500 g chez Aldi (1.19) ;
- poulet 500 g → **2 × 300 g chez Lidl (13.50)**, contre 1 × 600 g chez Aldi (9.99, action).

**Le gain de 6.29 subsiste-t-il après le détour ?** Oui : les deux magasins sont à 100 m l'un de
l'autre, et le détour coûte 0.01 CHF et 3 minutes.

| Réglage | Économie nette de la combinaison |
|---|---|
| 0.35 CHF/km (défaut) | 6.29 |
| 0.70 CHF/km | 6.27 |
| Temps de trajet valorisé à 25 CHF/h | 5.00 |
| À pied | 6.30 |

**Ce qui compose le gain.** Les 6.30 viennent de deux lignes :

- **pain toast : 2.79**. Lidl ne vend que des paquets de 335 g, il faut donc en payer deux. Au seul
  prix au kilo, l'écart n'aurait été que de 1.78, ce qui illustre la différence avec le montant réel ;
- **poulet : 3.51**, grâce à une action Aldi annoncée du 01 au 07.10, sans date de fin publiée.

Les 12 autres articles coûtent le même prix chez Lidl et chez Aldi. Aujourd'hui (30.09) comme
après le 07.10, la combinaison coûte 38.25 et le gain tombe à 2.79.

**Aldi seul** n'est plus comparable : le seul yogourt nature rapproché chez Aldi était « sans
lactose ». Cette correspondance a été refusée : il n'existe plus d'équivalent, et les 42.99 annoncés en
phase 3 comparaient un produit différent.

**Vue publique sans autorisation d'Aldi :** Lidl seul, 40.92. Aucune combinaison possible.

### 2.2 Bulle (12 articles : frais, AOP, bio ; samedi 03.10 à 10 h)

| Solution | Articles | Achats | Trajet | Coût trajet | Total |
|---|---|---|---|---|---|
| Lidl seul (référence) | 12/12 | 45.36 | 1,7 km · 9 min | 0.60 | **45.96** |
| Aldi seul (Champ-Francey) | 8/12 | 38.13 | 3,7 km · 12 min | 1.30 | incomplet |

- **Aucune combinaison n'est moins chère** : aucun article n'est meilleur marché chez Aldi, depuis
  que le café en grains Lidl à 7.99 est rapproché (auparavant, seule une référence à 14.99 l'était).
- Aldi n'a ni lait UHT, ni œufs, ni bananes, ni pommes avec contenance publiée.
- Gruyère AOP : 2 × 200 g à payer pour 250 g demandés (acheté 400 g), dans les deux enseignes.

### 2.3 Genève (10 articles : entretien, hygiène, épicerie ; vendredi 02.10 à 17 h)

| Solution | Articles | Achats | Trajet | Coût trajet | Total |
|---|---|---|---|---|---|
| Combinaison Lidl (Rue de Lausanne) → Aldi (Promenade de l'Europe) | 9/10 | 14.73 | 4,9 km · 17 min | 1.71 | incomplet |
| Lidl seul | 7/10 | 13.92 | 1,5 km · 8 min | 0.54 | incomplet |
| Aldi seul | 6/10 | 12.70 | 3,6 km · 12 min | 1.27 | incomplet |

- **Aucune économie n'est calculée**, car aucun magasin n'a tout le panier : le papier toilette 10
  rouleaux est introuvable partout le 02.10. Lidl ne l'affichait qu'en action du jour, valable le 30.09.
- La combinaison trouve 9 articles sur 10 ; elle n'est pas présentée comme « moins chère ».
- **Eau plate** : avant correction, 12 × 1.15 = 13.80 chez Lidl (Vittel) ; après, 12 × 0.25 = 3.00
  (eau naturelle de marque propre, vérifiée sur la fiche archivée).

### 2.4 Actions régionales (vérifiées sur données réelles)

L'action Lidl « valable uniquement en Suisse romande » sur la moutarde se comporte comme suit :

- Lausanne, 30.09 : appliquée à 1.39 ;
- Lausanne, 01.10 : 1.69, prix indicatif ;
- Zurich : absente, sans prix connu hors action.

## 3. Couverture obtenue et limites

| Indicateur (240 besoins) | Phase 3 | Phase 4 |
|---|---|---|
| Couverts par Lidl | 194 | **200** |
| Couverts par Aldi | 106 | **105** (sans-lactose refusés) |
| Comparables dans ≥ 2 enseignes | 98 | **100** |
| Comparables dans ≥ 3 / ≥ 4 / 5 | 4 / 0 / 0 | 4 / 0 / 0 |
| Essentiels comparables dans ≥ 2 | 30/50 | 28/50 (sans-lactose refusés) |
| Correspondances revues | 449 | 468 |

**Limites restantes :**

1. Migros, Coop et Denner restent quasi absents. Au plus 3 enseignes sont comparables, alors que
   Migros et Coop sont présents partout.
2. **Sans autorisation d'Aldi**, la version publique ne compare que Lidl.
3. Il faudra trancher sur les fiches Lidl `/fr/catalog/…` (`robots.txt`, `docs/DROITS_DONNEES.md`
   § 3). Sans elles, Lidl passe de 200 à environ 99 besoins couverts.
4. 415 articles Aldi n'ont pas de contenance publiée (lait UHT, œufs, fruits…).
5. Les prix sont nationaux ou régionaux, jamais propres à une succursale. Le stock est inconnu.
6. Les trajets sont estimés. OSRM est prêt (`OSRM_URL`) mais non hébergé.
7. 62 candidats de `match-audit` restent à revoir, pour la plupart des faux positifs
   (« pain d'épices au chocolat »).

## 4. Données : actions Aldi, fraîcheur, panne de collecte

**Les 8 actions Aldi manquantes (712 = 609 + 95 + 8).** Ce sont 8 baisses de prix devenues
permanentes : 3 chips tuiles, 3 galettes de rösti, un steak de thon et une saucisse à rôtir.

- Le 28.09, elles étaient affichées « au lieu de » : une action a été enregistrée, sans date de fin
  publiée.
- Le 30.09, Aldi affichait le même prix comme prix normal, sans « au lieu de ». L'action a donc été
  close au 29.09, pour éviter deux statuts contradictoires.
- Elles restent dans l'instantané un jour pour l'historique, puis sont purgées. Étant expirées, elles
  sont **exclues de tout calcul** (test « l'action expirée n'est pas appliquée »).

**Fraîcheur réelle.** La date affichée est l'instant où la page ou la réponse de l'enseigne a été lue.
Elle n'est jamais réécrite lors des fusions de collectes (un identifiant par article et par jour).

- Lidl : pages catégories et actions lues chaque jour, fiches en rotation sur 7 jours. Dans les paniers,
  les relevés vont du 28 au 30.09 et chaque date est affichée.
- Le prix « au lieu de » publié avec une action est enregistré comme prix normal observé ce jour-là.

**Si la collecte quotidienne échoue :**

- les anciens relevés restent affichés, avec leur date ;
- statut « vérifié » jusqu'à 7 jours, « indicatif » jusqu'à 30 jours, **exclusion au-delà** (90 jours
  pour Open Prices) ;
- les actions expirent à leur date ; une action sans fin publiée n'est plus confirmée après le dernier
  jour où elle a été vue ;
- alertes : `connector_broken` après 48 h (`/admin/qualite`) et avertissement `prices_not_refreshed`
  dans chaque comparaison.

## 5. Droits d'utilisation, FoodAlly, questions ouvertes

Voir `docs/DROITS_DONNEES.md` : tableau par source et méthode, extraits des conditions, questions au
fournisseur et pour l'avis juridique, demandes d'accord en brouillon.

### Aldi

Conditions d'utilisation : « à des fins privées uniquement », usage commercial des données interdit.

- **Traitement identique à Denner** : collecte réservée à l'évaluation interne, exclusion de
  l'affichage en production (`AUTHORIZED_SOURCES`).
- Sur la page Magasins, l'enseigne apparaît « Prix non affichés ».

### Lidl

- Aucune condition d'utilisation du site n'a été trouvée ; seule la clause LCD art. 5 let. c est à
  valider.
- Point à clarifier : `Disallow: /catalog/` face aux fiches `/fr/catalog/…` que Lidl liste dans son plan
  du site.

### FoodAlly (évaluation, aucune licence souscrite)

**Tarifs et quotas : ses pages se contredisent.**

| Source | Quota gratuit | Offres payantes |
|---|---|---|
| En-têtes mesurés | 30 requêtes/min, 100/jour | — |
| Page `/licensing` | 60 requêtes/min, 100/jour | Pro dès CHF 49/mois ; Business dès CHF 499/mois |
| `llms.txt` | environ 2 000 requêtes/jour | — |

**Couverture estimée**, à partir des 50 essentiels et de 76 besoins échantillonnés. C'est une borne
haute : les correspondances ne sont pas revues.

| Enseigne | Besoins couverts (sur 240) |
|---|---|
| Migros | ≈ 160 ± 15 |
| Coop | ≈ 170 ± 15 |
| Denner | ≈ 69 ± 15 |

Avec FoodAlly en complément de Lidl et Aldi, environ **192 besoins** seraient comparables dans au moins
2 enseignes, **94** dans au moins 4 et **27** dans les 5.

**Qualité des données.**

- **Précision** : même prix sur les mêmes articles, mais 20 à 45 % des paires plausibles sont des
  articles différents ; une revue manuelle serait nécessaire.
- **Fraîcheur** : aucune date de relevé dans les résultats.
- **Géographie** : ni magasin, ni région, ni canal (en ligne ou magasin).

**Droits.** Attribution avec lien obligatoire ; collecte en masse interdite. Cache, conservation,
affichage public et redistribution ne sont pas précisés. Le palier gratuit (« hobby ») ne couvre pas
un service public.

**Transparence sur le quota.** Le 30.09, 126 recherches ont été faites au total, plus 4 requêtes
techniques. Aucune n'a reçu de refus (402), et les en-têtes indiquaient un quota restant à chaque
passage. Le total dépasse néanmoins les 100 par jour annoncés. Aucune requête n'a suivi, et un
**plafond local de 100 par jour** est désormais appliqué quels que soient les en-têtes.

### Questions non résolues (préparées, non envoyées)

- **FoodAlly** : 10 questions — droits d'affichage public et offre requise, cache, date de relevé,
  géographie, droits sur les données des enseignes, redistribution, attribution, identifiants EAN.
- **Avis juridique** : 10 points — LCD 5c, clause Aldi, `robots.txt` de Lidl, OIP, responsabilité en
  cas de prix erroné, ODbL, licence FoodAlly, LPD pour les tickets, nom « TesPrix ».
- **Enseignes** : autorisation écrite d'Aldi ; confirmation de Lidl sur les fiches ; accord ou flux
  pour Migros, Coop et Denner.

## 6. Budget minimal (hypothèses, détail dans `BUSINESS_MODEL_V2.md` § 5 bis)

| Poste | Montant (CHF par mois) | Nature |
|---|---|---|
| Technique | 90 | Serveur 30, base 20, OSRM 15, sauvegardes 8, courriel 10, supervision 5, domaine 2 ; seuls ≈ 40–60 sont nécessaires |
| Collecte | 0 | — |
| **Licence FoodAlly Pro** | **49** | Option, **déjà incluse** dans les 518 |
| Avis juridique amorti (5 500 / 24) | 229 | Nécessaire avant l'ouverture |
| Comptabilité, assurance RC, facturation B2B | 150 | Seule l'assurance RC (≈ 20–30) est nécessaire au comparateur ; le reste relève des options B2B |
| **Total central** | **518** | |
| Temps de l'exploitant (valorisation) | 3 200 | Non décaissé |

**Budget minimal réaliste** pour un pilote grand public (sans B2B ni FoodAlly) :

- ≈ **50 CHF/mois décaissés** : serveur avec base et sauvegardes, domaine, assurance RC ;
- **plus un avis juridique ponctuel** de 3 000 à 8 000 CHF ;
- soit ≈ **175 à 385 CHF/mois** amortis sur 24 mois.

La licence FoodAlly s'y **ajoute** : 49 CHF (Pro), ou 499 CHF (Business) si l'affichage public
l'exige.

## 7. Démonstration

Aucun aperçu privé en ligne : il faudrait un déploiement, exclu à ce stade. **Démonstration locale** :

```bash
cd comparateur && pnpm install
pnpm dev                                   # http://localhost:3000/fr/exemples → « Charger et comparer »
RESTRICTED_SOURCES=exclude pnpm dev        # vue publique (Aldi exclu sans autorisation)
pnpm job demo-baskets --now=2026-09-30T19:00:00Z   # tableaux reproductibles (data/demo/)
E2E_SCREENSHOTS=docs/captures/phase4 pnpm test:e2e:demo   # parcours + captures
```

Captures (`docs/captures/phase4/`) : `desktop-{lausanne,bulle,geneve}-comparer.jpg`,
`desktop-*-magasins.jpg`, `mobile-lausanne-comparer.jpg`, `mobile-lausanne-magasins.jpg`.

## 8. Décisions qui vous reviennent

1. **Aldi** : demander l'autorisation écrite, qui conditionne la moitié de la valeur du comparateur.
   Ou arrêter aussi la collecte interne (`ALDI_API=off`).
2. **Lidl** : conserver la lecture des fiches `/fr/catalog/…` (lecture RFC 9309, plan du site) en
   attendant sa réponse, ou l'arrêter (environ 99 besoins au lieu de 200).
3. **FoodAlly** : poser les questions préparées avant tout abonnement. Seul levier rapide pour
   Migros, Coop et Denner.
4. **Avis juridique** : 10 points listés.
5. Hébergement et collecte quotidienne (`pnpm job daily`).

## 9. Commits de la phase 4

| Commit | Contenu |
|---|---|
| `068a584` | Comparaison fiabilisée : solutions, paquets, actions conditionnelles, fin non publiée, magasins |
| `5ab8401` | Paniers reproductibles (`demo-baskets`), `match-audit`, 19 correspondances ajoutées, 2 refusées |
| `463976e` | Parcours navigateur de la phase 4 |
| `791c439` | Droits par source (Aldi exclu en production sans autorisation), échantillons FoodAlly, plafond local |
| `78b3f9b` | Paniers d'exemple en un clic, démonstration et captures sur prix réels |
| `ccd4498` | Documentation (droits, budget, API, moteur, lancement) — **commit de code final testé** |
| suivant | Ce compte rendu et les captures régénérées sur `ccd4498` |
