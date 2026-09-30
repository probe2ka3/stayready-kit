# Paniers de démonstration — résultats reproductibles

Calculé avec `pnpm job demo-baskets --now=2026-09-30T19:00:00.000Z` sur les instantanés versionnés
(aldi-api du 2026-09-30, lidl-web du 2026-09-30, open-prices du 2026-09-30).
Prix réels uniquement (aucune donnée de démonstration). Montants en CHF.

## Lausanne — panier de référence (phase 3), 14 articles

Départ : 1003 Lausanne · rayon 10 km · courses le 01.10.2026 à 10:00 · voiture, 0.35 CHF/km, aller-retour · au plus 2 magasins · 113 succursales dans le rayon (25 retenues).

Trajets **estimés** (pas un itinéraire routier) : vol d'oiseau × 1.3, durée = 3 min + distance à 38 km/h.

| Solution | Magasins (distance à vol d’oiseau) | Articles | Achats | Trajet | Durée | Coût trajet | Total | Économie achats | Économie nette |
|---|---|---|---|---|---|---|---|---|---|
| Combinaison | Aldi Suisse Rue St. Martin 3-5 (0,4 km) → Lidl Suisse Lidl (0,4 km) | 14/14 | 34.24 | 1,1 km | 11 min | 0.39 | 34.63 | 6.30 | 6.29 |
| Lidl Suisse seul (référence) | Lidl Suisse Lidl (0,4 km) | 14/14 | 40.54 | 1,1 km | 8 min | 0.38 | 40.92 | 0.00 | 0.00 |
| Aldi Suisse seul | Aldi Suisse Rue des Terreaux 25 (0,4 km) | 13/14 | 39.08 | 0,9 km | 7 min | 0.33 | (39.41, incomplet) | non comparable | non comparable |
| Coop seul | Coop Coop (0,3 km) | 1/14 | 2.50 | 0,7 km | 7 min | 0.25 | (2.75, incomplet) | non comparable | non comparable |

| Article demandé | Lidl Suisse : article, paquets, montant | Aldi Suisse : article, paquets, montant | Retenu |
|---|---|---|---|
| 2 × Spaghetti (500 g) | Spaghetti 1 kg × 1 = **1.19** (indicatif, relevé 30.09) | Spaghetti, blé dur 500 g × 2 = **2.38** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Riz long grain (1 kg) | Riz long grain parbolied 1 kg × 1 = **1.35** (indicatif, relevé 30.09) | Riz à grains longs 500 g × 2 = **2.38** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Flocons d’avoine (500 g) | Fiocons d'avoine gros 500 g × 1 = **0.69** (indicatif, relevé 30.09) | Flocons d’avoine, tendres 500 g × 1 = **0.69** (indicatif, relevé 30.09) | Aldi Suisse |
| 1 × Huile de colza (1 l) | VITA D’OR Huile de colza 1 l × 1 = **2.99** (action confirmée, relevé 30.09 ; action annoncée 01.10–07.10) | Huile de colza 1 l × 1 = **3.49** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Beurre de cuisine (250 g) | Beurre de cuisine suisse 250 g × 1 = **3.39** (indicatif, relevé 30.09) | Beurre de cuisine 250 g × 1 = **3.39** (indicatif, relevé 30.09) | Aldi Suisse |
| 2 × Mozzarella (150 g) | Mozzarella classique 125 g × 3 = **2.37** (indicatif, relevé 28.09) | Mozzarella, standard 125 g × 3 = **2.37** (indicatif, relevé 30.09) | Aldi Suisse |
| 1 × Pain toast (500 g) | Pain de mie 335 g × 2 = **3.98** (indicatif, relevé 30.09) | Pain toast de blé 500 g × 1 = **1.19** (indicatif, relevé 30.09) | Aldi Suisse |
| 1 × Poitrine de poulet suisse (500 g) | Poitrine de poulet 300 g × 2 = **13.50** (indicatif, relevé 28.09) | Poitrine de poulet 600 g × 1 = **9.99** (action confirmée, relevé 30.09 ; action annoncée 01.10–07.10 (fin non publiée)) | Aldi Suisse |
| 3 × Tomates concassées (400 g) | Piacelli Polpa in Pezzetti 400 g × 3 = **2.25** (indicatif, relevé 30.09) | Tomates concassées, nature 400 g × 3 = **2.55** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Confiture de fraises (500 g) | Confiture de fraises 450 g × 1 = **1.19** (indicatif, relevé 28.09) | Confiture de fraise 450 g × 1 = **1.19** (indicatif, relevé 30.09) | Aldi Suisse |
| 1 × Café moulu (500 g) | Café Intenso moulu 500 g × 1 = **3.49** (indicatif, relevé 28.09) | Café moulu, Classic Intenso 500 g × 1 = **3.49** (indicatif, relevé 30.09) | Aldi Suisse |
| 2 × Chocolat au lait (100 g) | Chocolat au lait 100 g × 2 = **1.38** (indicatif, relevé 28.09) | Chocolat clair, lait entier 125 g × 2 = **4.78** (indicatif, relevé 30.09) | Lidl Suisse |
| 4 × Yogourt nature (180 g) | Yogourt nature 1.5% 500 g × 2 = **1.58** (indicatif, relevé 28.09) | introuvable | Lidl Suisse |
| 1 × Penne (500 g) | Penne Rigate 1 kg × 1 = **1.19** (indicatif, relevé 30.09) | Penne rigate 1 kg × 1 = **1.19** (indicatif, relevé 30.09) | Aldi Suisse |

Même panier aujourd’hui (30.09) : 38.25 ; le 01.10 : 34.24 (actions qui commencent : 3, qui auront expiré : 1).

Coût du panier selon le jour (magasins retenus, actions publiées uniquement) : 01.10 34.24 · 02.10 34.24 · 03.10 34.24 · 04.10 34.24 · 05.10 34.24 · 06.10 34.24 · 07.10 34.24 · 08.10 38.25 · 09.10 38.25 · 10.10 38.25.

Dates des relevés : lidl 28.09–30.09, aldi 30.09–30.09. Avertissements : stale_prices_excluded, travel_estimated.

## Bulle — semaine en famille, 12 articles (frais, AOP, bio)

Départ : 1630 Bulle (FR) · rayon 10 km · courses le 03.10.2026 à 10:00 · voiture, 0.35 CHF/km, aller-retour · au plus 2 magasins · 15 succursales dans le rayon (14 retenues).

Trajets **estimés** (pas un itinéraire routier) : vol d'oiseau × 1.3, durée = 3 min + distance à 38 km/h.

| Solution | Magasins (distance à vol d’oiseau) | Articles | Achats | Trajet | Durée | Coût trajet | Total | Économie achats | Économie nette |
|---|---|---|---|---|---|---|---|---|---|
| Lidl Suisse seul (référence) | Lidl Suisse Lidl (0,7 km) | 12/12 | 45.36 | 1,7 km | 9 min | 0.60 | 45.96 | 0.00 | 0.00 |
| Aldi Suisse seul | Aldi Suisse Chemin de Champ-Francey 150, 1630 Bulle (1,4 km) | 8/12 | 38.13 | 3,7 km | 12 min | 1.30 | (39.43, incomplet) | non comparable | non comparable |

Aucune combinaison de magasins n’est moins chère qu’un seul magasin pour ce panier (aucun article n’est moins cher ailleurs).

| Article demandé | Lidl Suisse : article, paquets, montant | Aldi Suisse : article, paquets, montant | Retenu |
|---|---|---|---|
| 2 × Lait entier UHT (1 l) | Lait entier 3.5% UHT 1 l × 2 = **3.10** (indicatif, relevé 30.09) | introuvable | Lidl Suisse |
| 1 × Œufs suisses de plein air (6 pièces) | Oeufs suisses élevage plein air 8 pièces × 1 = **4.29** (indicatif, relevé 30.09) | introuvable | Lidl Suisse |
| 1 × Gruyère AOP (250 g) | Gruyère AOP doux 200 g × 2 = **5.98** (indicatif, relevé 28.09) | Le Gruyère AOP, doux 200 g × 2 = **5.98** (indicatif, relevé 30.09 ; action en cours 28.09–04.10 (fin non publiée)) | Lidl Suisse |
| 1 × Pain mi-blanc (500 g) | Pain mi-blanc 500 g × 1 = **0.99** (indicatif, relevé 28.09) | Pain mi-blanc 500 g × 1 = **0.99** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Bananes (1 kg) | Bananes 1 kg × 1 = **1.19** (indicatif, relevé 28.09) | introuvable | Lidl Suisse |
| 1 × Pommes Gala (1 kg) | QUALITÉ SUISSE Pommes rouges suisses 1 kg × 1 = **1.99** (action confirmée, relevé 30.09 ; action annoncée 01.10–07.10) | introuvable | Lidl Suisse |
| 1 × Beurre de choix (200 g) | Beurre de choix 200 g × 1 = **3.09** (indicatif, relevé 30.09) | Beurre 250 g × 1 = **3.85** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Viande hachée de bœuf (500 g) | Viande hachée de boeuf 500 g × 1 = **7.79** (indicatif, relevé 30.09) | Viande hachée de bœuf 500 g × 1 = **7.79** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Riz basmati (1 kg) | Fairtrade Riz basmati 1 kg × 1 = **2.99** (indicatif, relevé 30.09) | Riz Basmati 500 g × 2 = **3.98** (indicatif, relevé 30.09) | Lidl Suisse |
| 2 × Spaghetti bio (500 g) | Spaghetti bio 500 g × 2 = **2.38** (indicatif, relevé 30.09) | Spaghetti, blé dur 500 g × 2 = **2.38** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Café en grains (1 kg) | Grains de Café Rosso 1 kg × 1 = **7.99** (indicatif, relevé 28.09) | Crema Intenso, en grains 500 g × 2 = **9.58** (indicatif, relevé 30.09 ; action en cours 30.09–06.10 (fin non publiée)) | Lidl Suisse |
| 2 × Jus de pomme (1 l) | Jus de pomme 1,5 l × 2 = **3.58** (indicatif, relevé 28.09) | Jus de pomme 1,5 l × 2 = **3.58** (indicatif, relevé 30.09) | Lidl Suisse |

Même panier aujourd’hui (30.09) : 46.16 ; le 03.10 : 45.36 (actions qui commencent : 1, qui auront expiré : 0).

Coût du panier selon le jour (magasins retenus, actions publiées uniquement) : 03.10 45.36 · 04.10 45.36 · 05.10 45.36 · 06.10 45.36 · 07.10 45.36 · 08.10 46.16 · 09.10 46.16 · 10.10 46.16 · 11.10 46.16 · 12.10 46.16.

Dates des relevés : lidl 28.09–30.09. Avertissements : stale_prices_excluded, travel_estimated.

## Genève — entretien, hygiène et épicerie, 10 articles

Départ : 1201 Genève (GE) · rayon 10 km · courses le 02.10.2026 à 17:00 · voiture, 0.35 CHF/km, aller-retour · au plus 2 magasins · 119 succursales dans le rayon (25 retenues).

Trajets **estimés** (pas un itinéraire routier) : vol d'oiseau × 1.3, durée = 3 min + distance à 38 km/h.

| Solution | Magasins (distance à vol d’oiseau) | Articles | Achats | Trajet | Durée | Coût trajet | Total | Économie achats | Économie nette |
|---|---|---|---|---|---|---|---|---|---|
| Combinaison | Lidl Suisse Rue de Lausanne 45, 1201 Genève (0,6 km) → Aldi Suisse Promenade de l'Europe 11, Genève (1,4 km) | 9/10 | 14.73 | 4,9 km | 17 min | 1.71 | (16.44, incomplet) | non comparable | non comparable |
| Lidl Suisse seul | Lidl Suisse Rue de Lausanne 45, 1201 Genève (0,6 km) | 7/10 | 13.92 | 1,5 km | 8 min | 0.54 | (14.46, incomplet) | non comparable | non comparable |
| Aldi Suisse seul | Aldi Suisse Promenade de l'Europe 11, Genève (1,4 km) | 6/10 | 12.70 | 3,6 km | 12 min | 1.27 | (13.97, incomplet) | non comparable | non comparable |

Introuvables dans toutes les enseignes du périmètre : Papier toilette 3 plis (10 rouleaux).

| Article demandé | Lidl Suisse : article, paquets, montant | Aldi Suisse : article, paquets, montant | Retenu |
|---|---|---|---|
| 1 × Lentilles vertes (500 g) | introuvable | Légumineuses, lentille de montagne 500 g × 1 = **1.89** (indicatif, relevé 30.09) | Aldi Suisse |
| 2 × Lait entier UHT (1 l) | Lait entier 3.5% UHT 1 l × 2 = **3.10** (indicatif, relevé 30.09) | introuvable | Lidl Suisse |
| 1 × Liquide vaisselle (750 ml) | Liquide vaisselle Original 1,5 l × 1 = **1.09** (indicatif, relevé 30.09) | introuvable | Lidl Suisse |
| 1 × Papier toilette 3 plis (10 rouleaux) (10 pièces) | introuvable | introuvable | manquant |
| 2 × Dentifrice au fluor (75 ml) | Dentifrice 125 ml × 2 = **0.78** (indicatif, relevé 30.09) | introuvable | Lidl Suisse |
| 1 × Gel douche (250 ml) | Gel douche 5 dl × 1 = **1.09** (indicatif, relevé 30.09) | Gel douche Family, Fresh Touch 1 l × 1 = **1.15** (indicatif, relevé 28.09 ; action en cours 28.09–04.10 (fin non publiée)) | Lidl Suisse |
| 1 × Shampoing cheveux normaux (250 ml) | Shampoing professionnel 250 ml × 1 = **2.49** (indicatif, relevé 30.09) | Shampooing familial aux herbes 5 dl × 1 = **0.58** (indicatif, relevé 30.09) | Aldi Suisse |
| 2 × Eau minérale plate (6 × 1,5 l) (9 l) | Eau minérale 1,5 l × 12 = **3.00** (indicatif, relevé 30.09) | Eau minérale, naturelle 1,5 l × 12 = **3.00** (indicatif, relevé 30.09) | Aldi Suisse |
| 3 × Chocolat noir (100 g) | Chocolat noir 100 g × 3 = **2.37** (indicatif, relevé 28.09) | Chocolat noir, cacao 70% 125 g × 3 = **5.25** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Thé noir (25 sachets) (25 pièces) | introuvable | Mélange au thé noir, earl grey 40 pièces × 1 = **0.83** (indicatif, relevé 30.09) | Aldi Suisse |

Articles manquants dans la solution retenue : Papier toilette 3 plis (10 rouleaux) (aucune enseigne).

Même panier aujourd’hui (30.09) : 14.73 ; le 02.10 : 14.73 (actions qui commencent : 0, qui auront expiré : 2).

Coût du panier selon le jour (magasins retenus, actions publiées uniquement) : 02.10 14.73 · 03.10 14.73 · 04.10 14.73 · 05.10 14.73 · 06.10 14.73 · 07.10 14.73 · 08.10 14.73 · 09.10 14.73 · 10.10 14.73 · 11.10 14.73.

Dates des relevés : lidl 28.09–30.09, aldi 30.09–30.09. Avertissements : stale_prices_excluded, travel_estimated.

