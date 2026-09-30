# Statut des fonctionnalités — TesPrix

Situation au 30 septembre 2026 (fin de la phase 4 : comparateur grand public). Trois catégories :
**opérationnel**, **dépend d'une source de données ou d'une autorisation**, **nécessite une validation
juridique**. Détails : `docs/RAPPORT_PHASE4.md`, droits : `docs/DROITS_DONNEES.md`, moteur :
`docs/DATA_ENGINE.md`.

## Chiffres clés des données réelles (instantanés du 30.09.2026)

| Enseigne | Source (statut de réutilisation) | Articles | Avec prix | Actions (en cours / annoncées) | Références couvertes (sur 240) |
|---|---|---|---|---|---|
| Lidl | Site officiel (aucune restriction trouvée ; ⚖️ avis requis) | 3 429 | 3 012 | 287 / 244 (11 conditionnelles jamais appliquées, 1 « 2e paquet ») | **200** |
| Aldi Suisse | API publique du site (**autorisation requise** : exclu en production) | 1 901 | 1 484 | 609 / 95 (+ 8 closes) | **105** |
| Migros | Open Prices (licence ouverte) | 109 | 109 | — | 2 |
| Coop | Open Prices | 85 | 85 | — | 2 |
| Denner | Open Prices | 12 | 12 | — | 0 |

- Comparables : **100** références dans ≥ 2 enseignes, 4 dans ≥ 3, 0 dans ≥ 4. Essentiels : 28/50.
- Correspondances revues : 468 (19 ajoutées et 2 refusées en phase 4 après `match-audit`).
- Qualité : 0 prix suspect, 0 divergence, 0 action lue comme prix normal, 18 relevés communautaires
  anciens ; validation des essentiels 76/76.
- Sans autorisation d'Aldi, la version publique ne compare que Lidl (+ relevés communautaires).

## ✅ Opérationnel

| Fonctionnalité | Détail |
|---|---|
| Localisation | NPA ou localité (swisstopo), géolocalisation facultative |
| **Magasins** | Enseignes et succursales du rayon (5–30 km), sélection par enseigne et par magasin, nombre maximal de magasins ; **données de prix par enseigne** (officiels, partiels, aucun, non affichés) ; **stock toujours « inconnu »** |
| **Comparaison des solutions** | Chaque enseigne seule et la combinaison : achats, trajet aller-retour, durée, coût, total, économie sur les achats et **après déplacement** par rapport au meilleur magasin unique **complet** ; panier incomplet jamais présenté comme moins cher |
| **Montant réellement payé** | Paquets à acheter × prix du paquet, quantité demandée / achetée ; prix au kilo pour comparer seulement |
| **Conditions des actions** | Carte déclarée (Lidl Plus), quantité minimale, « -X % sur le 2e paquet », prix « dès » jamais appliqué, actions régionales par zone, conditions affichées |
| **Trajet** | Estimation à vol d'oiseau × 1,3 **annoncée comme telle** ; coût par km modifiable ; OSRM facultatif |
| **Courses plus tard** | Date jusqu'à 60 jours : actions publiées valables ce jour-là dans la région ; actions « en cours » vs « annoncées » ; dernier prix connu signalé comme non garanti ; fin non publiée non confirmée au-delà du dernier jour vu |
| Fraîcheur | Dates des relevés par enseigne, alerte si > 48 h, exclusion au-delà de 30 jours |
| Droits des sources | Statut de réutilisation par source ; exclusion en production sans autorisation (`AUTHORIZED_SOURCES`) |
| Collecte officielle | Lidl (catégories, fiches en rotation, actions), Aldi (liste paginée) — 0 blocage |
| Démonstration | `/fr/exemples` (Lausanne, Bulle, Genève en un clic), `pnpm job demo-baskets`, captures `docs/captures/phase4` |
| Contrôles | `match-audit`, `data-report`, `validate`, `/admin/qualite` |
| Gratuit | Toutes les fonctions grand public, sans compte ni abonnement |
| Tests | 200 unitaires, 7 d'intégration PostgreSQL, 8 parcours publics, 2 d'administration, 6 de démonstration sur prix réels |

## ⏳ Dépend d'une source de données ou d'une autorisation

| Élément | Situation | Ce qui débloque |
|---|---|---|
| **Affichage des prix Aldi** | Collecte pour évaluation interne ; exclu en production | Autorisation écrite d'Aldi Suisse ou avis juridique favorable |
| **Fiches produits Lidl** | Lues en rotation (`/fr/catalog/…`, hors `Disallow: /catalog/` selon RFC 9309, listées au plan du site) | Confirmation de Lidl ; sinon `LIDL_PRODUCT_PAGES_PER_RUN=0` (≈ 99 références au lieu de 200) |
| **Prix Migros, Coop** | Refus technique (403, DataDome) : aucun contournement | Accord écrit ; ou licence FoodAlly (≈ 160 et ≈ 170 besoins, borne haute) |
| **Prix Denner** | Conditions : usage commercial interdit sans autorisation écrite | Autorisation ; ou FoodAlly (≈ 69 besoins) |
| Aldi : 415 articles sans contenance | Écartés (jamais devinés) | Accord ou flux Aldi |
| Repli FoodAlly | Implémenté, désactivé | Licence et droits d'affichage public confirmés (questions prêtes) |
| Tickets de caisse, API professionnelle, facturation | Fermés | Voir `docs/LANCEMENT.md` |

## ⚖️ Nécessite une validation juridique avant exploitation

Points détaillés dans `docs/DROITS_DONNEES.md` § 6 : LCD art. 5 let. c (collecte Lidl et Aldi), clause
« fins privées » d'Aldi, `robots.txt` de Lidl, OIP (prix de base, « au lieu de »), responsabilité en cas
de prix erroné, ODbL, licence FoodAlly, LPD (tickets), nom « TesPrix ».

## Avant l'ouverture publique

Voir `docs/LANCEMENT.md`.
