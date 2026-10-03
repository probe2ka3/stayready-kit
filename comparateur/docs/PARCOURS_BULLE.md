# Parcours d’un utilisateur à Bulle, version publique (03.10.2026)

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
