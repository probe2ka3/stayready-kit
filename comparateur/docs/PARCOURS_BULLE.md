# Parcours d’un utilisateur à Bulle, version publique (03.10.2026, rejoué après P12)

Conditions : site lancé en local en **mode public** (`RESTRICTED_SOURCES=exclude` : Aldi, Denner et le
journal Coop exclus ; `PRICE_DATA=live`), instantanés publiables du 03.10.2026 (Lidl, Open Prices),
navigateur mobile (412 px). Parcours : localité « 1630 » → magasins (rayon 10 km) → panier de
12 articles du noyau (lait entier UHT, farine blanche, spaghetti, penne, bananes, beurre de cuisine,
œufs d’élevage au sol, tomates concassées, sucre, riz, citrons, oranges) → comparaison « plus tard »,
mardi 06.10.2026 à 10:00 (samedi soir, « maintenant » : aucun magasin ouvert, signalé correctement).

## Résultat

| Étape | Avant | Après |
|---|---|---|
| Magasins : Migros | « Prix partiels » (des relevés Open Prices **de plus de 90 jours**, inutilisables, étaient comptés) | « **Sans prix** : aucun prix utilisable pour les 50 aliments de base » |
| Magasins : Coop | « Prix partiels », relevés « souvent anciens » | « Prix partiels : **1 des 50** aliments de base (relevé communautaire récent) » + prix de l’enseigne non affichés (usage privé) |
| Magasins : Lidl | « Prix officiels » | « Prix officiels pour **47 des 50** aliments de base, relevés le 3 oct. » |
| Magasins : Aldi, Denner | « Prix partiels » | « **Prix non affichés** » (usage privé, autorisation en attente) |
| Solutions : texte d’en-tête | « Mêmes articles, mêmes quantités » (faux : Lidl et Coop ne vendent pas le même article) | « Mêmes besoins, mêmes quantités : produit équivalent le moins cher de chaque enseigne (marque ou variante peut différer) » |
| Comparaison article par article | absente | **nouvelle** : penne 500 g, Lidl 1.19 CHF (prix publié, lu le 3 oct.) contre Coop 2.50 CHF (Barilla, relevé communautaire du 4 août à Coop Maladière, Neuchâtel ; prix supposé identique dans les succursales), **« Produits équivalents »**, écart 1.31 CHF pour la même quantité ; « 1 article comparable sur 12 » |
| Couverture : prix « indicatifs » | « 12 indicatifs (relevés communautaires ou anciens) » pour des prix Lidl lus le jour même | « 12 prix lus avant le mar. 6 oct., non garantis ce jour-là » ; Coop : « 1 relevé communautaire » |
| « Panier complet par enseigne » | Coop **2.50 CHF** affiché en regard de Lidl 20.20 CHF (1 article sur 12) | Coop « — », « partiel : 2.50 CHF pour 1/12 articles, non comparable » |
| Carte de fidélité | action Lidl Plus ignorée sans un mot | signalée si elle est plus avantageuse : « Avec Lidl Plus : … non appliqué (carte non déclarée) » ; jamais appliquée sans déclaration (cas présent dans les données : oranges et citrons Lidl Plus du 01 au 07.10, non reliés au besoin : voir ci-dessous) |
| Économies et conditionnement | aucun signal quand une enseigne vend un autre conditionnement (citrons 750 g pour un besoin de 500 g) | « dont n articles achetés dans un autre conditionnement que dans la référence » sur l’économie et chaque solution ; écart article par article seulement pour des quantités identiques |

Inchangé et vérifié : un panier incomplet n’a jamais d’économie calculée ; chaque prix garde sa date,
sa source et sa portée (nationale, zone tarifaire, succursale) ; les sources privées n’apparaissent
pas ; trajet estimé annoncé comme tel ; magasins fermés le jour choisi non comparés.

Captures : `docs/captures/bulle-public/` (magasins, article par article, panier par enseigne, couverture).

## Rejeu du 03.10.2026 au soir (P12) : même panier, même date

Mêmes conditions (mode public, NPA 1630, rayon 10 km, mêmes 12 articles, « plus tard » mardi 06.10.2026
à 10:00), après : règles revues des offres Lidl, lecture corrigée des prix Lidl Plus, affichage des
conditionnements, distinction « vérifié dans un magasin du rayon » / « relevé ailleurs ».

| Élément | Avant (P11) | Après (P12) |
|---|---|---|
| Lidl seul : achats / trajet / total | 20.20 / 0.69 / 20.89 CHF | **inchangé** : 20.20 / 0.69 / 20.89 CHF |
| Couverture | Lidl 12/12, Coop 1/12, Migros, Denner, Aldi 0/12 | **inchangée** |
| Articles comparables entre enseignes | 1 sur 12 (penne) | **inchangé** : 1 sur 12 |
| Paniers complets comparables | 0 (Lidl seul complet) | **inchangé** : 0 |
| Oranges 2 kg chez Lidl | 2.79 le 06.10, mais **2.78 « aujourd’hui »** (prix Lidl Plus 2 × 1.39 appliqué sans carte, lu comme action du 03.10) et « +0.01 CHF en attendant » | 2.79 (filet de 2 kg, prix pour tous) ; « Avec Lidl Plus : 2.78 CHF pour 2 kg (2 × 1 kg), jusqu’au 7 oct. — non appliqué : carte non déclarée » ; plus d’écart fictif « en attendant » |
| Chaque article (liste par enseigne) | « À payer : 1 × 750 g à 1.79 CHF » | « À payer : 1 × 750 g à 1.79 CHF · demandé 500 g · acheté 750 g · surplus 250 g » (demandé et acheté affichés sur chaque ligne) |
| Article par article | « 1 × 500 g · 2.38 CHF / kg » | « 1 × 500 g = 500 g acheté · 2.38 CHF / kg » ; le montant est le coût des paquets entiers, le prix au kilo sert à comparer |
| Penne Coop | relevé du 04.08 à Coop Maladière, Neuchâtel | idem + « **relevé hors de votre rayon : non vérifié dans un magasin proche** » |
| Page des magasins | couverture par enseigne | + « Aucun prix vérifié dans un magasin de votre rayon » pour chaque enseigne ; Coop : « 1 relevé fait dans une autre succursale, hors de votre rayon » |

Avec la carte Lidl Plus déclarée (même panier réduit, API) : oranges = **2 sachets de 1 kg**, 2 kg
achetés, 2.78 CHF (offre du 01 au 07.10, règle `lidl-oranges`) ; le 09.10, l’offre ne s’applique plus
et rien n’est prolongé (test `packages/connectors/test/offres-hebdo.test.ts`).

**La comparaison entre enseignes à Bulle reste inchangée** : elle ne progressera qu’avec de vrais relevés
en magasin (fiche Migros Bulle : `docs/releves/FICHE_MIGROS_BULLE.md`). Captures mises à jour :
`docs/captures/bulle-public/`.

## Ce que voit réellement l’utilisateur à Bulle

Une seule enseigne a des prix publiables pour presque tout le panier (Lidl, 47/50 aliments de base) ;
Coop n’a qu’un article (penne) ; Migros, Denner et Aldi aucun. **La version publique ne permet donc
pas aujourd’hui de comparer un panier entre enseignes à Bulle** : elle le dit (couverture par enseigne,
« 1 article comparable sur 12 ») au lieu de laisser croire à une comparaison. Le prochain gain dépend de
nouvelles données publiables (relevés en magasin : `docs/RELEVES_PRIORITAIRES.md`).

## Reproduire

```bash
DATA_BACKEND=memory PRICE_DATA=live RESTRICTED_SOURCES=exclude pnpm --filter @cabas/web exec next dev -p 3300
# puis : localité 1630, magasins, panier, Comparer → « Plus tard », un jour ouvrable
```
