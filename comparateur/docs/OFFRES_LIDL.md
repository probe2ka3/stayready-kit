# Offres hebdomadaires Lidl reliées aux 50 besoins

Généré par `pnpm job offres-lidl` le 03.10.2026 sur l'instantané publiable Lidl (collecte du 03.10) : 285 offres en cours ou annoncées, 27 règles revues (`offerRules`, data/matching/reviewed.json).

Une offre n’est reliée que si **tous** les critères de la règle sont remplis sur les informations publiées avec l’offre : désignation (sans la marque), absence de variante exclue ou indéterminée (« diverses sortes »), contenance admise dans la même unité que le besoin (jamais de pièces converties en grammes) et statut bio. Une offre reliée ne compte que par **ses propres** promotions (dates, prix, carte, région, source) ; son prix « au lieu de » n’est pas repris comme prix normal et rien n’est prolongé d’une semaine à l’autre. Les offres « à vérifier » ne sont jamais utilisées par le comparateur.

## Offres reliées (6, dont 1 nouvelle)

Une offre déjà validée par identifiant (décision antérieure, prioritaire) est confirmée par la règle ; elle aussi ne vaut que par ses propres promotions.

| Offre | Désignation publiée | Contenance | Besoin | Pour couvrir le besoin | Prix d’action, dates, région | Règle | Lien |
|---|---|---|---|---|---|---|---|
| [10059639](https://www.lidl.ch/p/fr-CH/emmi-mozzarella-pack-de-3/p10059639) | EMMI Mozzarella, pack de 3 | 450 g | `mozzarella-150g` (150 g) | 1 × 450 g = 450 g | 4.95 du 01.10 au 07.10 (fin présumée) | `lidl-mozzarella` | décision par identifiant du 28.09, confirmée |
| [10059579](https://www.lidl.ch/p/fr-CH/monini-huile-d-olive-vierge-extra/p10059579) | MONINI Huile d’olive vierge extra | 1 l | `huile-olive-1l` (1 l) | 1 × 1 l = 1 l | 9.95 (au lieu de 15.99) du 01.10 au 03.10 | `lidl-huile-olive` | décision par identifiant du 28.09, confirmée |
| [10059701](https://www.lidl.ch/p/fr-CH/oranges/p10059701) | Oranges | 1 kg | `oranges-2kg` (2 kg) | 2 × 1 kg = 2 kg | Lidl Plus 1.39 (au lieu de 1.95) du 01.10 au 07.10 | `lidl-oranges` | **nouvelle** (règle) |
| [10059584](https://www.lidl.ch/p/fr-CH/qualite-suisse-poires-suisses/p10059584) | QUALITÉ SUISSE Poires suisses | 1 kg | `poires-1kg` (1 kg) | 1 × 1 kg = 1 kg | 2.49 (au lieu de 3.29) du 01.10 au 07.10 | `lidl-poires` | décision par identifiant du 28.09, confirmée |
| [10059585](https://www.lidl.ch/p/fr-CH/qualite-suisse-pommes-rouges-suisses/p10059585) | QUALITÉ SUISSE Pommes rouges suisses | 1 kg | `pommes-gala-1kg` (1 kg) | 1 × 1 kg = 1 kg | 1.99 (au lieu de 2.79) du 01.10 au 07.10 | `lidl-pommes` | décision par identifiant du 28.09, confirmée |
| [10059620](https://www.lidl.ch/p/fr-CH/vita-d-or-huile-de-colza/p10059620) | VITA D’OR Huile de colza | 1 l | `huile-colza-1l` (1 l) | 1 × 1 l = 1 l | 2.99 (au lieu de 3.49) du 01.10 au 07.10 | `lidl-huile-colza` | décision par identifiant du 28.09, confirmée |

## À vérifier (6) : désignation reconnue, critère non rempli

| Offre | Désignation publiée | Contenance | Besoin visé | Motif | Prix d’action, dates, région |
|---|---|---|---|---|---|
| [10059586](https://www.lidl.ch/p/fr-CH/citrons/p10059586) | Citrons | 1 pièce | `citrons-500g` | unité piece incompatible avec le besoin (g) : aucune conversion sans poids documenté | 0.39 (au lieu de 0.49) du 01.10 au 07.10 |
| [10059587](https://www.lidl.ch/p/fr-CH/citrons/p10059587) | Citrons | 1 pièce | `citrons-500g` | unité piece incompatible avec le besoin (g) : aucune conversion sans poids documenté | Lidl Plus 0.35 (au lieu de 0.49) du 01.10 au 07.10 |
| [10059680](https://www.lidl.ch/p/fr-CH/maribel-confiture-bio/p10059680) | MARIBEL Confiture bio | 240 g | `confiture-fraises-500g` | variante non précisée (« diverses sortes ») : article acheté inconnu | 0.99 (au lieu de 1.26) du 01.10 au 07.10 |
| [10059573](https://www.lidl.ch/p/fr-CH/nixe-thon-msc-de-bonite-a-ventre-raye/p10059573) | NIXE Thon MSC de Bonite à ventre rayé | 240 g | `thon-huile-240g` | variante exclue par la règle : « naturel » | 1.49 (au lieu de 1.99) du 01.10 au 03.10 |
| [10059574](https://www.lidl.ch/p/fr-CH/nixe-thon-msc-de-bonite-a-ventre-raye/p10059574) | NIXE Thon MSC de Bonite à ventre rayé | 156 g | `thon-huile-240g` | contenance 156 g non admise par la règle (240) | 1.45 (au lieu de 1.85) du 01.10 au 03.10 |
| [10059590](https://www.lidl.ch/p/fr-CH/pommes-de-terre-bio-suisses/p10059590) | Pommes de terre bio suisses | 1 kg | `pdt-fermes-2500g` | type de cuisson (fermes ou farineuses) non publié : aucun des deux besoins ne peut être choisi | 2.19 (au lieu de 2.85) du 01.10 au 07.10 |

Autres offres (273) : aucune règle ne concerne leur désignation (articles hors des 50 besoins, ou désignation différente : « aucun équivalent trouvé dans les sources examinées » ne signifie pas que Lidl ne vend pas le produit).

## Règles revues

| Règle | Besoin | Désignations | Contenances admises | Exclusions | Justification |
|---|---|---|---|---|---|
| `lidl-oranges` | `oranges-2kg` | oranges | 1000, 2000 | sanguin, blut, mandarin, clementin, a jus, bio | Oranges de table en sachet ou filet ; le besoin « Oranges (filet) 2 kg » n'exige ni variété ni origine : 2 sachets de 1 kg = 2 kg. Oranges sanguines, petits agrumes et bio exclus. |
| `lidl-poires` | `poires-1kg` | poires ; poires suisses | 1000 | nashi, sirop, seche, conserve, bio | Poires de table vendues au kilo (« Le kg ») ; le besoin n'exige pas de variété. Nashi, conserves et fruits séchés exclus. |
| `lidl-pommes` | `pommes-gala-1kg` | pommes gala ; pommes gala suisses ; pommes rouges ; pommes rouges suisses | 1000 | pink lady, jazz, kanzi, envy, honeycrunch, smitten, ambrosia, granny, golden, sauce, compote, jus, bio | « Pommes (Gala ou variété courante) » : Gala ou pommes rouges sans variété de marque (décision revue du 28.09.2026, offre 10059585). Variétés de club et spécialités exclues. |
| `lidl-bananes` | `bananes-1kg` | bananes | 1000 | mini, mini-, plantain, seche, bio | Bananes au kilo ou en sachet de 1 kg ; mini-bananes, bananes plantain et fruits séchés exclus. |
| `lidl-carottes` | `carottes-1kg` | carottes ; carottes suisses | 1000 | rape, botte, couleur, multicolore, jeunes, bio | Carottes en sachet de 1 kg ; carottes râpées, en botte et de couleur exclues. |
| `lidl-oignons` | `oignons-1kg` | oignons ; oignons jaunes ; oignons suisses ; oignons jaunes suisses | 1000 | rouge, blanc, nouveau, petits, frit, echalote, bio | Oignons jaunes en sachet de 1 kg ; oignons rouges, blancs, nouveaux, petits et frits exclus. |
| `lidl-pdt-fermes` | `pdt-fermes-2500g` | pommes de terre fermes a la cuisson ; pommes de terre fermes a la cuisson suisses | 2500 | bio | Pommes de terre explicitement « fermes à la cuisson », sac de 2,5 kg ; l'origine suisse exigée par le besoin reste contrôlée sur l'offre. |
| `lidl-pdt-farineuses` | `pdt-farineuses-2500g` | pommes de terre farineuses ; pommes de terre farineuses suisses | 2500 | bio | Pommes de terre explicitement « farineuses », sac de 2,5 kg ; origine suisse contrôlée sur l'offre. |
| `lidl-farine-blanche` | `farine-blanche-1kg` | farine blanche ; fleur de farine | 1000 | bise, complet, mi-blanche, epeautre, pizza, tresse, bio | Farine blanche (fleur de farine) 1 kg ; farines bise, complète, mi-blanche et d'épeautre exclues. |
| `lidl-sucre` | `sucre-cristal-1kg` | sucre cristallise ; sucre cristallise fin ; sucre fin | 1000 | canne, glace, gelifiant, vanill, brun, morceaux, bio | Sucre blanc cristallisé 1 kg ; sucre de canne, glace, gélifiant et vanillé exclus. |
| `lidl-spaghetti` | `spaghetti-500g` | spaghetti | 500 | complet, sans gluten, lentille, pois, riz, bio | Spaghetti de blé dur 500 g ; complets, sans gluten et à base de légumineuses exclus. |
| `lidl-penne` | `penne-500g` | penne ; penne rigate | 500 | mini, mini-, complet, sans gluten, lentille, pois, bio | Penne de blé dur 500 g ; mini-penne, complètes, sans gluten et à base de légumineuses exclues. |
| `lidl-riz-long` | `riz-long-1kg` | riz long grain ; riz long grain etuve | 1000 | basmati, jasmin, complet, sauvage, sachets de cuisson, bio | Riz long grain 1 kg ; basmati, jasmin, complet et sauvage exclus (autres besoins ou qualités). |
| `lidl-tomates-concassees` | `tomates-concassees-400g` | tomates concassees ; pulpe de tomates | 400 | basilic, herbes, ail, piment, oignon, bio | Tomates concassées (pulpe) en boîte de 400 g ; préparations aromatisées exclues. |
| `lidl-huile-colza` | `huile-colza-1l` | huile de colza | 1000 | pressee a froid, spray, aromatis, bio | Huile de colza 1 l ; huile pressée à froid, aromatisée ou en spray exclue (autre produit). |
| `lidl-huile-tournesol` | `huile-tournesol-1l` | huile de tournesol | 1000 | pressee a froid, high oleic, spray, bio | Huile de tournesol 1 l ; huile pressée à froid, « high oleic » ou en spray exclue. |
| `lidl-huile-olive` | `huile-olive-1l` | huile d'olive vierge extra ; huile d'olive extra vierge | 1000 | spray, aromatis, citron, ail, basilic, bio | Huile d'olive vierge extra 1 l (décision revue du 28.09.2026, offre 10059579) ; huiles aromatisées et sprays exclus. |
| `lidl-lait-entier` | `lait-entier-uht-1l` | lait entier uht | 1000 | sans lactose, lactose, bio | Lait entier UHT 1 l ; l'origine suisse exigée par le besoin reste contrôlée sur l'offre ; sans lactose exclu. |
| `lidl-lait-demi` | `lait-demi-uht-1l` | lait demi-ecreme uht | 1000 | sans lactose, lactose, bio | Lait demi-écrémé UHT 1 l ; origine suisse contrôlée sur l'offre ; sans lactose exclu. |
| `lidl-beurre-cuisine` | `beurre-cuisine-250g` | beurre de cuisine ; beurre de cuisine suisse | 250 | bio | Beurre de cuisine 250 g ; origine suisse contrôlée sur l'offre. |
| `lidl-mozzarella` | `mozzarella-150g` | mozzarella | 150, 450 | bufala, mini, mini-, light, allegee, rapee, lactose, bio | Mozzarella de lait de vache 150 g, ou lot de 3 × 150 g de la même mozzarella (décision revue du 28.09.2026, offre 10059639) ; bufala, mini, allégée, râpée et sans lactose exclues. |
| `lidl-citrons` | `citrons-500g` | citrons | 500, 1000 | bio | Citrons en filet de 500 g ou 1 kg ; un prix à la pièce n'est jamais converti en grammes (poids non publié). |
| `lidl-pdt-type-inconnu` | `pdt-fermes-2500g` | pommes de terre ; pommes de terre suisses ; pommes de terre bio suisses |  | — | Désignation sans type de cuisson : impossible de choisir entre « fermes » et « farineuses ». |
| `lidl-confiture-fraises` | `confiture-fraises-500g` | confiture de fraises ; confiture extra de fraises ; confiture ; confiture bio | 450, 500 | bio | Confiture de fraises 450 à 500 g ; une confiture dont la sorte n'est pas précisée reste à vérifier. |
| `lidl-thon-huile` | `thon-huile-240g` | thon ; thon a l'huile ; thon msc de bonite a ventre raye ; thon albacore | 240 | naturel, sauce, tomate | Thon à l'huile, lot de 3 boîtes (240 g) ; thon au naturel exclu ; un poids égoutté seul n'est pas comparable au besoin. |
| `lidl-oeufs-sol` | `oeufs-sol-6` | oeufs suisses d'elevage au sol ; oeufs d'elevage au sol suisses ; oeufs suisses elevage au sol | 6, 10, 12 | plein air, bio, cuits, colores | Œufs suisses d'élevage au sol, boîte de 6, 10 ou 12 (emballages entiers : surplus affiché) ; l'origine suisse est contrôlée sur l'offre. |
| `lidl-oeufs-plein-air` | `oeufs-plein-air-6` | oeufs suisses de plein air ; oeufs de plein air suisses ; oeufs suisses plein air | 6, 10, 12 | bio, cuits, colores | Œufs suisses de plein air, boîte de 6, 10 ou 12 ; l'origine suisse est contrôlée sur l'offre. |

