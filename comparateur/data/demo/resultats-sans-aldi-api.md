# Paniers de démonstration — résultats reproductibles

Calculé avec `pnpm job demo-baskets --now=2026-09-30T19:00:00.000Z --exclude=aldi-api` sur les instantanés versionnés
(aldi-api du 2026-09-30, lidl-web du 2026-09-30, open-prices du 2026-09-30).
Prix réels uniquement (aucune donnée de démonstration). Montants en CHF.
**Sources exclues : aldi-api** — ce que verrait le public en production sans autorisation (docs/DROITS_DONNEES.md).

## Lausanne — panier de référence (phase 3), 14 articles

Départ : 1003 Lausanne · rayon 10 km · courses le 01.10.2026 à 10:00 · voiture, 0.35 CHF/km, aller-retour · au plus 2 magasins · 113 succursales dans le rayon (25 retenues).

Trajets **estimés** (pas un itinéraire routier) : vol d'oiseau × 1.3, durée = 3 min + distance à 38 km/h.

| Solution | Magasins (distance à vol d’oiseau) | Articles | Achats | Trajet | Durée | Coût trajet | Total | Économie achats | Économie nette |
|---|---|---|---|---|---|---|---|---|---|
| Lidl Suisse seul (référence) | Lidl Suisse Lidl (0,4 km) | 14/14 | 40.54 | 1,1 km | 8 min | 0.38 | 40.92 | 0.00 | 0.00 |
| Coop seul | Coop Coop (0,3 km) | 1/14 | 2.50 | 0,7 km | 7 min | 0.25 | (2.75, incomplet) | non comparable | non comparable |

Aucune combinaison de magasins n’est moins chère qu’un seul magasin pour ce panier (aucun article n’est moins cher ailleurs).

| Article demandé | Migros : article, paquets, montant | Coop : article, paquets, montant | Denner : article, paquets, montant | Aldi Suisse : article, paquets, montant | Lidl Suisse : article, paquets, montant | Retenu |
|---|---|---|---|---|---|---|
| 2 × Spaghetti (500 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Spaghetti 1 kg × 1 = **1.19** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Riz long grain (1 kg) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Riz long grain parbolied 1 kg × 1 = **1.35** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Flocons d’avoine (500 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Fiocons d'avoine gros 500 g × 1 = **0.69** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Huile de colza (1 l) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | VITA D’OR Huile de colza 1 l × 1 = **2.99** (action confirmée, relevé 30.09 ; action annoncée 01.10–07.10) | Lidl Suisse |
| 1 × Beurre de cuisine (250 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Beurre de cuisine suisse 250 g × 1 = **3.39** (indicatif, relevé 30.09) | Lidl Suisse |
| 2 × Mozzarella (150 g) | aucune donnée gratuite | prix trop ancien (01.09) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Mozzarella classique 125 g × 3 = **2.37** (indicatif, relevé 28.09) | Lidl Suisse |
| 1 × Pain toast (500 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Pain de mie 335 g × 2 = **3.98** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Poitrine de poulet suisse (500 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Poitrine de poulet 300 g × 2 = **13.50** (indicatif, relevé 28.09) | Lidl Suisse |
| 3 × Tomates concassées (400 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Piacelli Polpa in Pezzetti 400 g × 3 = **2.25** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Confiture de fraises (500 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Confiture de fraises 450 g × 1 = **1.19** (indicatif, relevé 28.09) | Lidl Suisse |
| 1 × Café moulu (500 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Café Intenso moulu 500 g × 1 = **3.49** (indicatif, relevé 28.09) | Lidl Suisse |
| 2 × Chocolat au lait (100 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Chocolat au lait 100 g × 2 = **1.38** (indicatif, relevé 28.09) | Lidl Suisse |
| 4 × Yogourt nature (180 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Yogourt nature 1.5% 500 g × 2 = **1.58** (indicatif, relevé 28.09) | Lidl Suisse |
| 1 × Penne (500 g) | aucune donnée gratuite | Pasta Penne Lisce 500 g × 1 = **2.50** (indicatif, relevé 04.08) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Penne Rigate 1 kg × 1 = **1.19** (indicatif, relevé 30.09) | Lidl Suisse |

Même panier aujourd’hui (30.09) : 41.04 ; le 01.10 : 40.54 (actions qui commencent : 2, qui auront expiré : 0).

Coût du panier selon le jour (magasins retenus, actions publiées uniquement) : 01.10 40.54 · 02.10 40.54 · 03.10 40.54 · 04.10 40.54 · 05.10 40.54 · 06.10 40.54 · 07.10 40.54 · 08.10 41.04 · 09.10 41.04 · 10.10 41.04.

Dates des relevés : lidl 28.09–30.09. Avertissements : stale_prices_excluded, travel_estimated.

## Bulle — semaine en famille, 12 articles (frais, AOP, bio)

Départ : 1630 Bulle (FR) · rayon 10 km · courses le 03.10.2026 à 10:00 · voiture, 0.35 CHF/km, aller-retour · au plus 2 magasins · 15 succursales dans le rayon (14 retenues).

Trajets **estimés** (pas un itinéraire routier) : vol d'oiseau × 1.3, durée = 3 min + distance à 38 km/h.

| Solution | Magasins (distance à vol d’oiseau) | Articles | Achats | Trajet | Durée | Coût trajet | Total | Économie achats | Économie nette |
|---|---|---|---|---|---|---|---|---|---|
| Lidl Suisse seul (référence) | Lidl Suisse Lidl (0,7 km) | 12/12 | 45.36 | 1,7 km | 9 min | 0.60 | 45.96 | 0.00 | 0.00 |

| Article demandé | Migros : article, paquets, montant | Coop : article, paquets, montant | Denner : article, paquets, montant | Aldi Suisse : article, paquets, montant | Lidl Suisse : article, paquets, montant | Retenu |
|---|---|---|---|---|---|---|
| 2 × Lait entier UHT (1 l) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Lait entier 3.5% UHT 1 l × 2 = **3.10** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Œufs suisses de plein air (6 pièces) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Oeufs suisses élevage plein air 8 pièces × 1 = **4.29** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Gruyère AOP (250 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Gruyère AOP doux 200 g × 2 = **5.98** (indicatif, relevé 28.09) | Lidl Suisse |
| 1 × Pain mi-blanc (500 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Pain mi-blanc 500 g × 1 = **0.99** (indicatif, relevé 28.09) | Lidl Suisse |
| 1 × Bananes (1 kg) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Bananes 1 kg × 1 = **1.19** (indicatif, relevé 28.09) | Lidl Suisse |
| 1 × Pommes (Gala ou variété courante) (1 kg) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | QUALITÉ SUISSE Pommes rouges suisses 1 kg × 1 = **1.99** (action confirmée, relevé 30.09 ; action annoncée 01.10–07.10) | Lidl Suisse |
| 1 × Beurre de choix (200 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Beurre de choix 200 g × 1 = **3.09** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Viande hachée de bœuf (500 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Viande hachée de boeuf 500 g × 1 = **7.79** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Riz basmati (1 kg) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Fairtrade Riz basmati 1 kg × 1 = **2.99** (indicatif, relevé 30.09) | Lidl Suisse |
| 2 × Spaghetti bio (500 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Spaghetti bio 500 g × 2 = **2.38** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Café en grains (1 kg) | aucune donnée gratuite | aucune donnée gratuite | prix trop ancien (29.08) | non affiché (source sans autorisation de réutilisation) | Grains de Café Rosso 1 kg × 1 = **7.99** (indicatif, relevé 28.09) | Lidl Suisse |
| 2 × Jus de pomme (1 l) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Jus de pomme 1,5 l × 2 = **3.58** (indicatif, relevé 28.09) | Lidl Suisse |

Même panier aujourd’hui (30.09) : 46.16 ; le 03.10 : 45.36 (actions qui commencent : 1, qui auront expiré : 0).

Coût du panier selon le jour (magasins retenus, actions publiées uniquement) : 03.10 45.36 · 04.10 45.36 · 05.10 45.36 · 06.10 45.36 · 07.10 45.36 · 08.10 46.16 · 09.10 46.16 · 10.10 46.16 · 11.10 46.16 · 12.10 46.16.

Dates des relevés : lidl 28.09–30.09. Avertissements : stale_prices_excluded, travel_estimated.

## Genève — entretien, hygiène et épicerie, 10 articles

Départ : 1201 Genève (GE) · rayon 10 km · courses le 02.10.2026 à 17:00 · voiture, 0.35 CHF/km, aller-retour · au plus 2 magasins · 119 succursales dans le rayon (25 retenues).

Trajets **estimés** (pas un itinéraire routier) : vol d'oiseau × 1.3, durée = 3 min + distance à 38 km/h.

| Solution | Magasins (distance à vol d’oiseau) | Articles | Achats | Trajet | Durée | Coût trajet | Total | Économie achats | Économie nette |
|---|---|---|---|---|---|---|---|---|---|
| Lidl Suisse seul | Lidl Suisse Rue de Lausanne 45, 1201 Genève (0,6 km) | 7/10 | 13.92 | 1,5 km | 8 min | 0.54 | (14.46, incomplet) | non comparable | non comparable |

Introuvables dans toutes les enseignes du périmètre : Lentilles vertes, Papier toilette 3 plis (10 rouleaux), Thé noir (25 sachets).

| Article demandé | Migros : article, paquets, montant | Coop : article, paquets, montant | Denner : article, paquets, montant | Aldi Suisse : article, paquets, montant | Lidl Suisse : article, paquets, montant | Retenu |
|---|---|---|---|---|---|---|
| 1 × Lentilles vertes (500 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | aucune donnée gratuite | manquant |
| 2 × Lait entier UHT (1 l) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Lait entier 3.5% UHT 1 l × 2 = **3.10** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Liquide vaisselle (750 ml) | aucune donnée gratuite | prix trop ancien (17.09) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Liquide vaisselle Original 1,5 l × 1 = **1.09** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Papier toilette 3 plis (10 rouleaux) (10 pièces) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | aucune donnée gratuite | manquant |
| 2 × Dentifrice au fluor (75 ml) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Dentifrice 125 ml × 2 = **0.78** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Gel douche (250 ml) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Gel douche 5 dl × 1 = **1.09** (indicatif, relevé 30.09) | Lidl Suisse |
| 1 × Shampoing cheveux normaux (250 ml) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Shampoing professionnel 250 ml × 1 = **2.49** (indicatif, relevé 30.09) | Lidl Suisse |
| 2 × Eau minérale plate (6 × 1,5 l) (9 l) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Eau minérale 1,5 l × 12 = **3.00** (indicatif, relevé 30.09) | Lidl Suisse |
| 3 × Chocolat noir (100 g) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | Chocolat noir 100 g × 3 = **2.37** (indicatif, relevé 28.09) | Lidl Suisse |
| 1 × Thé noir (25 sachets) (25 pièces) | aucune donnée gratuite | aucune donnée gratuite | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | aucune donnée gratuite | manquant |

Articles manquants dans la solution retenue : Lentilles vertes (aucune enseigne), Papier toilette 3 plis (10 rouleaux) (aucune enseigne), Thé noir (25 sachets) (aucune enseigne).

Même panier aujourd’hui (30.09) : 13.92 ; le 02.10 : 13.92 (actions qui commencent : 0, qui auront expiré : 1).

Coût du panier selon le jour (magasins retenus, actions publiées uniquement) : 02.10 13.92 · 03.10 13.92 · 04.10 13.92 · 05.10 13.92 · 06.10 13.92 · 07.10 13.92 · 08.10 13.92 · 09.10 13.92 · 10.10 13.92 · 11.10 13.92.

Dates des relevés : lidl 28.09–30.09. Avertissements : stale_prices_excluded, travel_estimated.

