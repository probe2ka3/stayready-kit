# Fiche de collecte : Migros, Bulle

Générée par `pnpm job fiche-releves --enseigne=migros --magasin=osm:node/10787882859`. Magasin : **Migros, Rue du Château-d'En-Bas 2, 1630 Bulle** (`osm:node/10787882859`, https://www.openstreetmap.org/node/10787882859). Si vous relevez dans une autre succursale, remplacez l'identifiant dans la colonne `magasin` : un prix ne vaut que pour le magasin où il a été relevé.

Autres succursales Migros à moins de 3 km : `osm:node/12265814534` (Migros, 0.5 km) ; `osm:node/8868545060` (Migros, 1.5 km).

Fichier à remplir : `docs/releves/fiche-migros-bulle.csv` (copie à placer dans `data/private/releves/`, **jamais** dans le dépôt public). Une ligne par besoin ; ne rien inventer : case vide si l'information n'est pas affichée.

## Besoins à relever (définition exacte du projet)

| Besoin | Désignation | Quantité de référence | Exigences | Variante à relever | Ne pas relever : mots exclus par les règles revues (radicaux, sans accents) |
|---|---|---|---|---|---|
| `penne-500g` | Penne | 500 g | aucune | la moins chère de la variante ordinaire (marque propre acceptée) | mini, complet, sans gluten, lentille, pois, bio |
| `tomates-concassees-400g` | Tomates concassées | 400 g | aucune | la moins chère de la variante ordinaire (marque propre acceptée) | basilic, herbes, ail, piment, oignon, bio |
| `farine-blanche-1kg` | Farine blanche | 1 kg | aucune | la moins chère de la variante ordinaire (marque propre acceptée) | bise, complet, mi-blanche, epeautre, pizza, tresse, bio |
| `sucre-cristal-1kg` | Sucre cristallisé | 1 kg | aucune | la moins chère de la variante ordinaire (marque propre acceptée) | canne, glace, gelifiant, vanill, brun, morceaux, bio |
| `bananes-1kg` | Bananes | 1 kg | aucune | la moins chère de la variante ordinaire (marque propre acceptée) | mini, plantain, seche, bio |

Rayons : Pâtes, riz et céréales, Conserves, Farine, sucre et sel, Fruits. Une autre contenance est acceptée (le comparateur compte les paquets entiers à acheter et le surplus) : noter la contenance exacte imprimée. Fruits au poids : `au_poids` = oui, `unite` = kg, prix au kilo affiché.

## Par ligne

- `date` (jour du relevé), `article` (désignation affichée), `variante` (rigate, fine, en sachet…), `marque`, `code_barres` (sous le code, si lisible), `contenance` + `unite`, `prix_chf` (prix normal) et, si l’étiquette l’indique, `prix_action_chf`, `action_du`/`action_au` (dates imprimées seulement), `carte` (`cumulus` si le prix est réservé à la carte), `conditions` (« dès 2 », bon…).
- `preuve` : **nom du fichier photo** de l’étiquette ou du ticket (ex. `IMG_2031.jpg`), à placer dans `data/private/releves/preuves/`. Une note sans photo reste « en attente » et n’est jamais publiée.
- `releve_par` : initiales ou pseudonyme ; `statut` : laisser `a_valider` ; la personne qui vérifie la photo met `valide` et ses initiales dans `valide_par`.
- Ne jamais recopier de numéro de carte ni d’autre donnée personnelle du ticket.

## Après la visite

```bash
pnpm job releves --dry-run   # contrôle : rapport privé data/private/releves/rapport.md
pnpm job releves             # publie les seules lignes validées (instantané épuré)
pnpm job matrice-essentiels  # couverture mise à jour
```
