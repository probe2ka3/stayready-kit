# Paniers de démonstration — résultats reproductibles

Calculé avec `pnpm job demo-baskets --now=2026-10-01T00:22:23.687Z --baskets=panier-noyau.json --exclude=aldi-api,coop-epaper,denner-web` sur les instantanés versionnés
(aldi-api du 2026-09-30, coop-epaper du 2026-10-01, denner-web du 2026-10-01, lidl-web du 2026-09-30, open-prices du 2026-09-30).
Prix réels uniquement (aucune donnée de démonstration). Montants en CHF.
**Sources exclues : aldi-api, coop-epaper, denner-web** — ce que verrait le public en production sans autorisation (docs/DROITS_DONNEES.md).

## Bulle — panier de base, 17 aliments du noyau (5 enseignes)

Départ : 1630 Bulle (FR) · rayon 5 km · courses le 01.10.2026 à 10:00 · voiture, 0.35 CHF/km, aller-retour · au plus 2 magasins · 13 succursales dans le rayon (13 retenues).

Trajets **estimés** (pas un itinéraire routier) : vol d'oiseau × 1.3, durée = 3 min + distance à 38 km/h.

| Solution | Magasins (distance à vol d’oiseau) | Articles | Achats | Trajet | Durée | Coût trajet | Total | Économie achats | Économie nette |
|---|---|---|---|---|---|---|---|---|---|
| Lidl Suisse seul (référence) | Lidl Suisse Lidl (0,7 km) | 17/17 | 41.85 | 1,7 km | 9 min | 0.60 | 42.45 | 0.00 | 0.00 |

| Article demandé | Migros : article, paquets, montant | Coop : article, paquets, montant | Denner : article, paquets, montant | Aldi Suisse : article, paquets, montant | Lidl Suisse : article, paquets, montant | Retenu |
|---|---|---|---|---|---|---|
| 1 × Bananes (1 kg) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Bananes 1 kg × 1 = **1.19** (vérifié, relevé 30.09) | Lidl Suisse |
| 1 × Pommes (Gala ou variété courante) (1 kg) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | QUALITÉ SUISSE Pommes rouges suisses 1 kg × 1 = **1.99** (action confirmée, relevé 30.09 ; action en cours 01.10–07.10) | Lidl Suisse |
| 1 × Carottes (1 kg) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Carottes suisses 1,5 kg × 1 = **2.89** (vérifié, relevé 30.09) | Lidl Suisse |
| 1 × Oignons jaunes (1 kg) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Oignons suisses 1 kg × 1 = **1.69** (vérifié, relevé 30.09) | Lidl Suisse |
| 1 × Pommes de terre fermes à la cuisson (2,5 kg) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Pommes de terre cireuses suisses 2,5 kg × 1 = **3.75** (vérifié, relevé 30.09) | Lidl Suisse |
| 1 × Farine blanche (1 kg) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Farine blanche 1 kg × 1 = **0.99** (vérifié, relevé 30.09) | Lidl Suisse |
| 1 × Sucre cristallisé (1 kg) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Sucre cristallisé fin 1 kg × 1 = **1.49** (vérifié, relevé 30.09) | Lidl Suisse |
| 1 × Huile de colza (1 l) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | VITA D’OR Huile de colza 1 l × 1 = **2.99** (action confirmée, relevé 30.09 ; action en cours 01.10–07.10) | Lidl Suisse |
| 1 × Riz long grain (1 kg) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Riz long grain parbolied 1 kg × 1 = **1.35** (vérifié, relevé 30.09) | Lidl Suisse |
| 2 × Spaghetti (500 g) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Spaghetti 1 kg × 1 = **1.19** (vérifié, relevé 30.09) | Lidl Suisse |
| 4 × Lait entier UHT (1 l) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Lait entier 3.5% UHT 1 l × 4 = **6.20** (vérifié, relevé 30.09) | Lidl Suisse |
| 1 × Beurre de cuisine (250 g) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Beurre de cuisine suisse 250 g × 1 = **3.39** (vérifié, relevé 30.09) | Lidl Suisse |
| 1 × Œufs suisses d’élevage au sol (6 pièces) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Oeufs suisses élevage au sol 6 pièces × 1 = **2.69** (vérifié, relevé 30.09) | Lidl Suisse |
| 4 × Yogourt nature (180 g) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Yogourt nature 1.5% 500 g × 2 = **1.58** (vérifié, relevé 30.09) | Lidl Suisse |
| 1 × Gruyère AOP (250 g) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Gruyère AOP doux 200 g × 2 = **5.98** (vérifié, relevé 30.09) | Lidl Suisse |
| 1 × Pain mi-blanc (500 g) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Pain mi-blanc 500 g × 1 = **0.99** (vérifié, relevé 30.09) | Lidl Suisse |
| 2 × Tomates concassées (400 g) | aucune donnée gratuite | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | non affiché (source sans autorisation de réutilisation) | Piacelli Polpa in Pezzetti 400 g × 2 = **1.50** (vérifié, relevé 30.09) | Lidl Suisse |

Coût du panier selon le jour (magasins retenus, actions publiées uniquement) : 01.10 41.85 · 02.10 41.85 · 03.10 41.85 · 04.10 41.85 · 05.10 41.85 · 06.10 41.85 · 07.10 41.85 · 08.10 43.15 · 09.10 43.15 · 10.10 43.15.

Dates des relevés : lidl 30.09–30.09. Avertissements : travel_estimated.

