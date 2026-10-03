# Relevés de prix en magasin — guide (plan sans dépenses)

Migros, Coop et Denner n'offrent aucune source de prix gratuite et réutilisable (docs/PLAN_SANS_DEPENSES.md
§ 4). La seule voie gratuite pour les faire entrer dans le comparateur est de **relever soi-même** les
prix affichés en rayon ou payés sur un ticket de caisse. Ce guide décrit deux façons de le faire, à 0 CHF.

## 1. Règles communes (non négociables)

- **Un prix = un magasin, un jour, une preuve.** Un relevé ne vaut que pour le magasin relevé : jamais
  pour la région ni pour le pays. Le comparateur l'affiche avec « ce magasin seulement ».
- **Rien d'inventé.** Contenance, prix, date de fin d'action : seulement ce qui est affiché. Contenance
  illisible → ligne laissée vide (elle sera refusée), jamais estimée.
- **Prix normal ≠ prix d'action.** Le prix normal va dans `prix_chf`, le prix d'action dans
  `prix_action_chf`. Sans date de fin affichée, l'action ne compte que pour le jour du relevé.
- **Règlement du magasin.** Photographier les étiquettes peut être interdit par le règlement intérieur :
  demander, ou noter les prix à la main. Un ticket de caisse est toujours une preuve valable.
- **Données personnelles.** `releve_par` : initiales ou pseudonyme seulement. Ne jamais recopier le
  numéro de carte de fidélité ni d'autres données du ticket.

## 2. Voie A (bénévoles) : l'application Open Prices

[Open Prices](https://prices.openfoodfacts.org) (Open Food Facts) est gratuit, ouvert (licence ODbL) et
déjà lu chaque jour par TesPrix (`collect --only=open-prices`). Chaque prix y est accompagné de sa photo
(étiquette ou ticket), ce qui le rend vérifiable par tous.

1. Installer l'application Open Food Facts ou ouvrir prices.openfoodfacts.org, créer un compte gratuit.
2. Choisir le magasin (lieu OpenStreetMap), photographier l'étiquette ou le ticket.
3. Pour un article à code-barres : scanner le code (la contenance vient de la fiche Open Food Facts).
   Pour un fruit ou un légume en vrac : choisir la catégorie (par ex. « Bananes ») et le prix **au kilo**
   ou **à la pièce**.

Catégories reconnues par TesPrix (vérifiées dans Open Prices le 30.09.2026) : bananes, pommes, poires,
oranges, citrons, carottes, oignons, tomates (seulement si la désignation dit « grappe »), concombres,
poivrons, courgettes, salade iceberg, pommes de terre (seulement si la désignation dit « fermes » ou
« farineuses »). Liste exacte : `OP_CATEGORY_MAP` dans `packages/connectors/src/open-prices.ts`.

Limites mesurées : prix de Migros généralisé à sa zone tarifaire, prix des autres enseignes au pays
(politique tarifaire nationale) ; un relevé communautaire reste « indicatif » et n'est plus utilisé
après 90 jours.

## 3. Voie B (exploitant) : fichier CSV privé, preuve, validation

Les relevés et leurs preuves sont **privés** : ils ne vont jamais dans le dépôt public. Seules les lignes
validées sont publiées, sous une forme épurée (enseigne, magasin, date, article, contenance, prix) :
ni nom de fichier, ni photo, ni auteur, ni validateur.

| Où | Contenu | Versionné ? |
|---|---|---|
| `data/private/releves/*.csv` (ou, sans PC, `etat/private/releves/` du dépôt privé `tesprix-collecte`) | relevés (une ligne par article) | non (dossier privé) |
| `data/private/releves/preuves/` (ou `etat/private/releves/preuves/`) | photos d'étiquettes ou de tickets, PDF | non |
| `data/private/releves/rapport.md` | rapport de validation : statut et motif de chaque ligne, preuve citée | non |
| `data/prices/live/releves.json` | lignes validées seulement, épurées (contrôle bloquant avant écriture) | oui (publiable) |
| `data/releves/modele.csv`, `docs/releves/*.csv` | modèle et fiches **vides** (aucun prix, aucune preuve) | oui |

1. Préparer la fiche du magasin (CSV prérempli + guide reprenant la définition exacte des besoins) :

   ```bash
   pnpm job magasins --npa=1630 --rayon=5                       # identifiant du magasin (colonne plan : OpenStreetMap)
   pnpm job fiche-releves --enseigne=migros --magasin=osm:node/10787882859 --nom=migros-bulle
   ```

   Exemple prêt : `docs/releves/FICHE_MIGROS_BULLE.md` et `docs/releves/fiche-migros-bulle.csv`.
2. En magasin : photographier l'étiquette (ou garder le ticket), remplir une ligne par article.
3. Copier la fiche remplie dans `data/private/releves/` et les photos dans `data/private/releves/preuves/`
   (colonne `preuve` = nom exact du fichier, ex. `IMG_2031.jpg` ; plusieurs : `IMG_1.jpg, IMG_2.jpg`).
   Sans PC : déposer les mêmes fichiers dans `etat/private/releves/` et `etat/private/releves/preuves/` du
   dépôt privé (« Add file → Upload files » sur GitHub) ; le cycle quotidien les reprend.
4. Validation : une personne compare chaque ligne à sa photo, puis met `statut` = `valide` et ses
   initiales dans `valide_par` (`refuse` si la photo ne correspond pas).
5. Contrôler puis publier :

   ```bash
   pnpm job releves --dry-run  # rapport privé, rien n'est écrit dans les données publiables
   pnpm job releves            # instantané publiable des seules lignes validées
   pnpm job matrice-essentiels # couverture 50 × 5 et page publique statique
   ```

Une ligne est **publiée** seulement si : données complètes et cohérentes (contrôles ci-dessous), `statut`
= `valide` avec `valide_par`, besoin parmi les 50 du noyau, variante compatible avec le besoin (mots exclus
et mentions requises des règles revues, `data/matching/reviewed.json` : par ex. pas de penne complètes,
pas de bananes bio pour `bananes-1kg`), et **chaque fichier de preuve cité présent** dans `preuves/`. Sinon
elle reste « en attente » ou « refusée » dans le rapport privé, avec le motif, et n'entre jamais dans le
calcul. Le comparateur présente un relevé publié comme **local et indicatif** : valable pour ce magasin
seulement, avec sa date et le magasin relevé ; une action ne vaut que dans ses dates (jour du relevé si la
fin n'est pas affichée) ; une action réservée à une carte n'est appliquée que si l'utilisateur la déclare ;
une condition non calculable (« avec bon ») est affichée mais jamais appliquée.

| Colonne | Obligatoire | Contenu |
|---|---|---|
| `enseigne` | oui | `migros`, `coop`, `denner`, `aldi` ou `lidl` |
| `magasin` | oui | identifiant donné par `pnpm job magasins`, ex. `osm:node/10787882859` |
| `date` | oui | jour du relevé, `2026-10-03` ou `03.10.2026` (jamais dans le futur) |
| `besoin` | oui | identifiant du besoin (tableau § 5) |
| `article` | oui | désignation telle qu'affichée (garder « AOP », « sans lactose ») |
| `variante` | non | précision imprimée : rigate, fines, en sachet… |
| `marque` | non | marque ou ligne propre (M-Budget, Prix Garantie, Denner…) |
| `code_barres` | non | code EAN imprimé sous les barres (clé de contrôle vérifiée) |
| `contenance`, `unite` | oui* | `500` + `g` ; `1` + `l` ; `6` + `pce`. *Vente au poids : laisser `contenance` vide |
| `au_poids` | non | `oui` si le prix est au kilo (`unite` = `kg`) ou à la pièce (`pce`) |
| `prix_chf` | oui** | prix normal affiché, TVA comprise (au kilo si vendu au poids) |
| `prix_action_chf` | oui** | prix d'action affiché (**au moins un des deux prix**) |
| `action_du`, `action_au` | non | dates de l'action **si elles sont affichées** |
| `carte` | non | action réservée aux porteurs de carte : `cumulus`, `supercard`, `lidl-plus` |
| `conditions` | non | condition de l'action : « dès 2 » (appliquée dès 2 paquets) ; toute autre condition est affichée, jamais appliquée |
| `bio`, `suisse` | non | `oui` si l'étiquette l'indique (exigé pour certains besoins, § 5) |
| `preuve` | oui | nom du fichier photo ou PDF dans `preuves/` (une note seule laisse la ligne en attente) |
| `releve_par` | non | initiales ou pseudonyme (privé, jamais publié) |
| `statut` | non | `a_valider` (par défaut), `valide` ou `refuse` |
| `valide_par` | si `valide` | initiales de la personne qui a vérifié la photo (privé, jamais publié) |

Contrôles automatiques : magasin connu et de la bonne enseigne, besoin connu, unité compatible (jamais
de pièces converties en grammes), exigences du besoin (origine suisse, AOP…), prix plausibles, action
inférieure au prix normal, carte existante, code-barres valide, date non future. Les lignes refusées
n'entrent jamais dans les données. Les fichiers CSV du dossier versionné `data/releves/` ne sont pas lus
(seul le modèle y est admis, contrôlé par `apps/worker/test/privacy.test.ts`).

## 4. Transcrire des photos ou des tickets avec l'IA déjà disponible (sans API payante)

Coller les photos dans une conversation avec l'assistant IA déjà utilisé (aucun appel d'API facturé),
avec la consigne suivante, puis **relire chaque ligne** avant de l'ajouter au fichier :

```text
Transcris ces photos d'étiquettes (ou ce ticket de caisse) en lignes CSV, séparateur « ; », avec
exactement ces colonnes :
enseigne;magasin;date;besoin;article;variante;marque;code_barres;contenance;unite;au_poids;prix_chf;prix_action_chf;action_du;action_au;carte;conditions;bio;suisse;preuve;releve_par;statut;valide_par
Règles : enseigne = <migros|coop|denner>, magasin = <identifiant>, date = <AAAA-MM-JJ>, preuve = nom du
fichier de la photo, statut = a_valider, valide_par vide. « besoin » : choisis uniquement dans cette liste, sinon laisse la ligne de côté :
<coller la colonne « Besoin » du § 5>. Recopie la désignation et la marque telles qu'écrites. N'invente
rien : si la contenance, le prix ou une date n'est pas lisible, laisse la case vide. Prix d'action
seulement s'il est signalé comme action ; dates d'action seulement si elles sont imprimées. Ne recopie
aucun numéro de carte ni donnée personnelle.
```

Sur un ticket de caisse, la contenance manque souvent : la compléter depuis l'emballage ou la laisser
vide (la ligne sera refusée plutôt que devinée).

Priorités (besoins et enseignes qui ajouteraient une 2e ou une 3e enseigne à une comparaison publique,
plan de visite, fiche CSV) : `docs/RELEVES_PRIORITAIRES.md`, régénéré par `pnpm job releves-prioritaires`.

## 5. Les 50 besoins du noyau (`besoin`)

Généré depuis `P1_ESSENTIALS` (`packages/reference/src/products.ts`).

| Besoin | Désignation | Quantité de référence | Rayon | Exigences |
|---|---|---|---|---|
| `bananes-1kg` | Bananes | 1 kg | Fruits | — |
| `pommes-gala-1kg` | Pommes (Gala ou variété courante) | 1 kg | Fruits | — |
| `poires-1kg` | Poires | 1 kg | Fruits | — |
| `oranges-2kg` | Oranges (filet) | 2 kg | Fruits | — |
| `citrons-500g` | Citrons | 500 g | Fruits | — |
| `carottes-1kg` | Carottes | 1 kg | Légumes | — |
| `oignons-1kg` | Oignons jaunes | 1 kg | Légumes | — |
| `tomates-grappe-500g` | Tomates en grappe | 500 g | Légumes | — |
| `concombre-1` | Concombre | 1 pièce | Légumes | — |
| `poivrons-500g` | Poivrons mélangés | 500 g | Légumes | — |
| `courgettes-500g` | Courgettes | 500 g | Légumes | — |
| `salade-iceberg-1` | Salade iceberg | 1 pièce | Légumes | — |
| `pdt-fermes-2500g` | Pommes de terre fermes à la cuisson | 2,5 kg | Pommes de terre | origine suisse |
| `pdt-farineuses-2500g` | Pommes de terre farineuses | 2,5 kg | Pommes de terre | origine suisse |
| `farine-blanche-1kg` | Farine blanche | 1 kg | Farine, sucre et sel | — |
| `farine-mi-blanche-1kg` | Farine mi-blanche | 1 kg | Farine, sucre et sel | — |
| `sucre-cristal-1kg` | Sucre cristallisé | 1 kg | Farine, sucre et sel | — |
| `sel-cuisine-1kg` | Sel de cuisine iodé | 1 kg | Farine, sucre et sel | — |
| `huile-tournesol-1l` | Huile de tournesol | 1 l | Huiles et vinaigre | — |
| `huile-colza-1l` | Huile de colza | 1 l | Huiles et vinaigre | — |
| `huile-olive-1l` | Huile d’olive extra vierge | 1 l | Huiles et vinaigre | — |
| `vinaigre-vin-1l` | Vinaigre de vin | 1 l | Huiles et vinaigre | — |
| `riz-long-1kg` | Riz long grain | 1 kg | Pâtes, riz et céréales | — |
| `spaghetti-500g` | Spaghetti | 500 g | Pâtes, riz et céréales | — |
| `penne-500g` | Penne | 500 g | Pâtes, riz et céréales | — |
| `flocons-avoine-500g` | Flocons d’avoine | 500 g | Pâtes, riz et céréales | — |
| `polenta-500g` | Polenta | 500 g | Pâtes, riz et céréales | — |
| `lentilles-500g` | Lentilles vertes | 500 g | Pâtes, riz et céréales | — |
| `lait-entier-uht-1l` | Lait entier UHT | 1 l | Lait et produits laitiers | origine suisse |
| `lait-demi-uht-1l` | Lait demi-écrémé UHT | 1 l | Lait et produits laitiers | origine suisse |
| `beurre-cuisine-250g` | Beurre de cuisine | 250 g | Lait et produits laitiers | origine suisse |
| `beurre-choix-200g` | Beurre de choix | 200 g | Lait et produits laitiers | origine suisse |
| `creme-entiere-250ml` | Crème entière | 250 ml | Lait et produits laitiers | origine suisse |
| `yogourt-nature-180g` | Yogourt nature | 180 g | Lait et produits laitiers | origine suisse |
| `sere-maigre-500g` | Séré maigre | 500 g | Lait et produits laitiers | origine suisse |
| `gruyere-aop-250g` | Gruyère AOP | 250 g | Lait et produits laitiers | origine suisse, « AOP » |
| `emmentaler-aop-250g` | Emmentaler AOP | 250 g | Lait et produits laitiers | origine suisse, « AOP » |
| `mozzarella-150g` | Mozzarella | 150 g | Lait et produits laitiers | — |
| `oeufs-sol-6` | Œufs suisses d’élevage au sol | 6 pièces | Œufs | origine suisse |
| `oeufs-plein-air-6` | Œufs suisses de plein air | 6 pièces | Œufs | origine suisse |
| `pain-mi-blanc-500g` | Pain mi-blanc | 500 g | Pain | — |
| `pain-complet-500g` | Pain complet | 500 g | Pain | — |
| `poulet-poitrine-500g` | Poitrine de poulet suisse | 500 g | Viande et poisson | origine suisse |
| `boeuf-hache-500g` | Viande hachée de bœuf | 500 g | Viande et poisson | — |
| `jambon-cuit-150g` | Jambon cuit en tranches | 150 g | Viande et poisson | — |
| `thon-huile-240g` | Thon à l’huile (3 boîtes) | 240 g | Conserves | — |
| `tomates-concassees-400g` | Tomates concassées | 400 g | Conserves | — |
| `pois-chiches-400g` | Pois chiches | 400 g | Conserves | — |
| `confiture-fraises-500g` | Confiture de fraises | 500 g | Autres aliments courants | — |
| `cafe-moulu-500g` | Café moulu | 500 g | Autres aliments courants | — |

Un paquet d'une autre taille est accepté (le comparateur calcule le nombre de paquets à acheter et le
prix au kilo) ; la marque propre la moins chère de l'enseigne est la bonne candidate.

## 6. Effort estimé

| Tâche | Durée |
|---|---|
| Relevé des 50 besoins dans un magasin (à la main ou photos) | 40–60 min sur place |
| Transcription assistée par l'IA + relecture | 15–20 min par magasin |
| Ticket de caisse (transcription + contenances) | 5–10 min par ticket |
| `pnpm job releves` + `matrice-essentiels` + contrôle | 5 min |

Un relevé en magasin est toujours « indicatif » (local, daté) ; au-delà de 7 jours il est signalé comme
ancien, et au-delà de 30 jours il est écarté : pour garder
Migros, Coop et Denner comparables autour d'un lieu, compter **un passage par enseigne et par mois**
(≈ 3 h par mois pour trois magasins), plus souvent pour suivre les actions.
