# Couverture des 50 aliments de base — analyse besoin par besoin (01.10.2026)

Mesures sur les collectes réelles du 30.09 et du 01.10.2026. « Couvert » = au moins un article dont la
correspondance est revue, qui satisfait les exigences du besoin (origine suisse, AOP, bio…) et qui a un
prix utilisable aujourd'hui (prix permanent récent ou action en cours). Rien n'est déduit : sans
contenance, origine ou prix publiés, le besoin reste non couvert.

## 1. Avant / après

| Enseigne | Avant (30.09) | Après (01.10) | Nature des prix | Publication |
|---|---|---|---|---|
| Lidl | 47/50 | 47/50 | permanents + actions, nationaux | permise (aucune restriction identifiée ; voir `AUTORISATIONS.md`) |
| Denner | 34/50 | 34/50 | permanents + actions, nationaux | interdite sans accord écrit |
| Aldi | 22/50 | **23/50** | permanents + actions, nationaux | usage privé seulement |
| Coop | 1/50 | **6/50** | **actions de la semaine** (Suisse romande) ; penne aussi en relevé communautaire | journal Coop : privé ; Open Prices : ODbL |
| Migros | 0/50 | 0/50 | — (1 relevé communautaire trop ancien) | — |

Aliments comparables (même besoin chiffré dans plusieurs enseignes) :

| Vue | ≥ 2 | ≥ 3 | ≥ 4 | 5 |
|---|---|---|---|---|
| Pilote privé, avant | 41 | 13 | 1 | 0 |
| Pilote privé, après | 41 | **18** | **2** | 0 |
| Version publique (Lidl, Open Prices) | 1 | 0 | 0 | 0 |

Le gain Coop dépend des actions de la semaine : il varie d'une semaine à l'autre et ne remplace pas des
prix permanents. Denner gagne en robustesse (121 articles de l'assortiment permanent lus sur deux pages
thématiques, indépendamment de la recherche) et une erreur de lecture est corrigée (voir § 3), sans
nouveau besoin couvert.

## 2. Aldi : 28 besoins manquants (avant)

Sources examinées : liste paginée complète de l'API (2 559 articles le 30.09 ; 633 sans contenance
publiée), 13 fiches produits du site (`www.aldi-suisse.ch/fr/produit/…`, état Nuxt : `sellingSize`,
`countryOrigin`, `description`).

| Classe | Besoins | Constat |
|---|---|---|
| Absent des sources examinées (16) | bananes, pommes, poires, oranges, citrons, carottes, oignons, tomates en grappe, concombre, poivrons, courgettes, salade iceberg, pommes de terre fermes, pommes de terre farineuses | L'API et les fiches n'exposent **aucun fruit ni légume frais** (seulement conserves, surgelés, snacks) |
| | vinaigre de vin | « Vinaigre de table » (vinaigre d'alcool) et vinaigre de pomme seulement : produits différents |
| | crème entière | Demi-crème, demi-crème acidulée, demi-crème sans lactose seulement |
| Conditionnement inconnu (6) | polenta, farine blanche, farine mi-blanche, sucre cristallisé, sel de cuisine iodé, huile de tournesol 1 l | Article présent avec prix, mais **ni la liste ni la fiche ne publient la contenance** (`sellingSize` vide ; la fiche « Farine blanche » indique seulement « Origine : Suisse ») ; huile de tournesol 5 l : format non équivalent |
| Caractéristique inconnue : origine (5) | lait entier UHT, lait drink UHT, yogourt nature, séré maigre, œufs d'élevage au sol | Lait entier BIO UHT 3,8 %, lait drink BIO UHT 2,7 %, yogourt BIO nature, séré maigre BIO : **origine non publiée** (le besoin exige l'origine suisse) ; œufs au sol : la fiche publie « Pack de 10 œufs » mais pas l'origine ; yogourt nature Saveurs Suisses : contenance non publiée ; lait entier pasteurisé et articles sans lactose : produits différents |
| Correspondance manquante (1) → **corrigée** | œufs de plein air | « Œufs régionaux d'élevage en plein air, Suisse orientale » (Saveurs Suisses, 4 pièces) : origine et mode d'élevage publiés ; revue ajoutée |
| Prix absent | — | (lait UHT 1,5 % 12 × 1 l : action à venir, format de 12 l non équivalent) |

## 3. Denner : 16 besoins manquants (avant)

Sources examinées : recherche du site (`/fr/search?q=`, 5 premiers résultats rendus côté serveur ; la
pagination n'est pas servie), **28 requêtes alternatives** (variantes, marques propres, synonymes), deux
pages thématiques listant l'assortiment permanent (`/fr/découvrir/produits-ip-suisse` : 149 articles ;
`/fr/découvrir/produits-phares/provisions-domestiques` : 15 articles), plan du site (seuls la cave et
les actions y figurent), actions en cours et annoncées, fiches produits.

| Classe | Besoins | Constat |
|---|---|---|
| Absent des sources examinées (12) | polenta (« polenta », « semoule de maïs », « bramata » : 0) ; sucre cristallisé (« sucre fin », « sucre blanc » : sucre vanillé et bâtonnets seulement) ; sel de cuisine (« sel iodé », « sel de table ») ; séré maigre (« séré », « quark » : 0 résultat) ; beurre de cuisine (« beurre ») ; vinaigre de vin (uniquement « aux herbes », aromatisé) ; lentilles vertes (rouges et brunes seulement) ; œufs suisses au sol (œufs au sol importés ; œufs suisses = plein air) ; pain complet (« pain bis » ≠ pain complet) ; poitrine de poulet suisse (blancs marinés d'Allemagne, poulet entier) ; tomates concassées (« tomates pelées », « pulpe de tomates », « tomates hachées ») ; confiture de fraises (« Zéro » sans sucre : produit différent) | L'index en ligne ne couvre qu'une partie de l'assortiment (« spaghetti » : 3 articles en tout) : **absent du site, pas forcément du magasin** |
| Caractéristique inconnue (2) | riz long grain ; crème entière | « Riz Denner, parboiled, 1 kg » : type de grain non publié (fiche sans description) ; « Crème entière Denner UHT 35 % » : origine non publiée (le besoin exige l'origine suisse) |
| Prix absent (2) | spaghetti ; café moulu | Barilla 3 × 500 g et La Semeuse moulu 2 × 500 g : correspondances revues, mais **action seulement** (aucun prix permanent publié) et pas en cours ce jour |

Correction de lecture : « Émincé de bœuf… env. 220 g, les 100 g » était lu comme une pièce de 220 g à
4.50 (le mot « bœuf » déclenchait la lecture des œufs) ; il est désormais lu au prix des 100 g. Œufs
« 10x53 » et « 6x53 » : nombre d'œufs lu dans la désignation.

## 4. Coop : actions du journal numérique (nouveau collecteur)

`epaper.cooperation.ch` publie chaque jeudi le « Magazine des actions » de l'édition romande, page par
page en PDF avec texte (robots.txt : `Allow: /`, session anonyme ouverte par la page d'accueil, aucun
compte). Le collecteur `coop-epaper` :

- lit les 24 pages une fois par semaine (28 requêtes, ≈ 60 Mo ; les jours suivants : 3 requêtes, texte
  en cache) ;
- rattache chaque prix à sa désignation et le **contrôle par le prix unitaire imprimé** (« 100 g = –.20 ») ;
  sans contrôle possible, l'offre est écartée ;
- conserve les dates imprimées (semaine 1.10–7.10, week-end 1.10–4.10, nouveautés jusqu'au 14.10),
  « dans la limite des stocks disponibles », le prix « au lieu de » et la région de l'édition (« SR ») ;
- écarte les pages « Les actions hypermarché » (réservées à 5 magasins), les offres conditionnelles
  (« à partir de 2 »), les assortiments (« au choix », « p. ex. ») et le non-alimentaire.

Collecte réelle du 01.10.2026 : 94 couples prix/désignation, **77 actions** acceptées, 6 besoins du
noyau couverts (viande hachée de bœuf suisse, pommes Gala, poires Williams, citrons, tomates en grappe,
penne) et 6 refus motivés (lait et sucre/farine en lots de 12 l et 10 kg, poulet surgelé des Pays-Bas,
Gruyère vendu en duo au poids). Les actions s'appliquent à la zone `coop-romandie` (GE, VD, VS, FR, NE,
JU), jamais à toute la Suisse.

## 5. Migros et Coop : canaux examinés

Tests du 30.09 et du 01.10.2026 avec l'agent identifié `TesPrixBot/0.1`, robots.txt lu d'abord.

| Enseigne | Canal (URL) | Méthode | Résultat |
|---|---|---|---|
| Migros | `https://www.migros.ch/robots.txt` | GET | 200 (fiches produits autorisées ; `/offers/`, recherche, compte exclus) |
| Migros | `https://www.migros.ch/fr`, `/fr/offers/home`, fiches, plan du site | GET | **403** « maintenance » pour un robot identifié |
| Migros | Sites des coopératives : `migrosaare.ch` → `aare.migros.ch`, `migrosvaud.ch`, `migrosvalais.ch`, `migrosnf.ch` → `neuchatel-fribourg.migros.ch` | GET | redirigés vers `www.migros.ch/…/content/…` ou `corporate.migros.ch` : **403** |
| Migros | `migros-zuerich.ch`, `migrosgeneve.ch`, `migros-aare.ch`, `produkte.migros.ch/angebote/aktionen` | GET | hôtes injoignables |
| Migros | Migros Magazine : `www.migrosmagazine.ch` ; `epaper.migrosmagazin(e).ch`, `epaper.migros.ch` | GET | redirigé vers `www.migros.ch` (403) ; hôtes de journal numérique injoignables |
| Migros | Prospectus hebdomadaire sur Issuu | lecture des conditions | extraction interdite par les conditions d'Issuu |
| Migros | API de données produits | réponse officielle | **non ouverte** (ci-dessous) |
| Migros | `filialen.migros.ch` | GET | 200 : succursales et horaires, aucun prix |
| Migros | Open Prices (ODbL) | API | 113 prix suisses, aucun besoin du noyau dans les 90 jours |
| Coop | `https://www.coop.ch/robots.txt`, `/fr/` | GET | **403** + défi DataDome : arrêt immédiat, aucun contournement |
| Coop | `https://www.coopzeitung.ch/fr/offres.html` | GET | 200 : catalogues et concours, aucun prix structuré ; mentions légales sans clause sur la réutilisation |
| Coop | `https://epaper.cooperation.ch` (journal numérique) | GET/POST de l'application, PDF | **200, exploité** : magazine des actions (§ 4) |
| Coop | `www.cooperation-online.ch` | GET | redirigé vers une page de maintenance |
| Coop | Open Prices (ODbL) | API | 100 prix ; 1 besoin (penne, Neuchâtel, 04.08) |

**Réponse officielle Migros** : forum Migipedia, question « Is there an API for migros product data? »
(<https://migipedia.migros.ch/en/forum/migipedia/is-there-an-api-for-migros-product-data>), réponse de
l'équipe Migros (« Philipp_Migros ») : « Unfortunately, we are currently unable to grant access to our
product data API. However, I have been able to find out that this may change in the future. » Elle porte
sur **l'API de données produits** (valeurs nutritives, prix aux 100 g) ; elle ne dit rien de la lecture
du site, laquelle est de toute façon refusée (403) à un robot identifié.

Limites de la recherche : les API des applications mobiles Migros et Coop n'ont pas été utilisées (accès
par jeton d'application : ce serait se faire passer pour l'application) ; les agrégateurs de prospectus
(Profital, Aktionis) ne sont pas des sources officielles et leurs conditions réservent la reproduction ;
FoodAlly reste sous licence payante. **Aucune impossibilité générale n'est affirmée** : Migros n'a pas
de canal gratuit, officiel et accessible à un robot identifié parmi ceux examinés ; Coop n'en a pas pour
ses prix permanents.

## 6. Reproduire l'analyse

```bash
pnpm quotidien --force --sources=denner-web,coop-epaper   # collecte réelle (privée)
pnpm job matrice-essentiels                               # couverture et comparables
pnpm job match-audit                                       # candidats à revoir (public : sources publiables)
```
