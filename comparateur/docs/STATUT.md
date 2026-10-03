# Statut des fonctionnalités — TesPrix

Situation au 3 octobre 2026 (**plan sans dépenses** : `docs/PLAN_SANS_DEPENSES.md`, après la phase 4).
Trois catégories : **opérationnel**, **dépend d'une source de données ou d'une autorisation**, **point
juridique ouvert** (aucun avis payant prévu). Détails : `docs/RAPPORT_PHASE4.md`, droits :
`docs/DROITS_DONNEES.md`, relevés : `docs/RELEVES.md`.

## Noyau de 50 aliments de base × 5 enseignes (collecte réelle du 03.10.2026)

| Enseigne | Collecte automatique quotidienne | Besoins avec prix (privé) | Prix publiables (version publique) |
|---|---|---|---|
| Lidl | ✅ site officiel, ciblée (≈ 108 requêtes) | **47/50** | 47/50 (⚖️ aucune restriction trouvée ≠ autorisation formelle) |
| Denner | ✅ site officiel, recherche ciblée + actions (≈ 54 requêtes) | **34/50** | 0/50 : publication interdite sans accord écrit |
| Aldi | ✅ API du site (≈ 43 requêtes) | 23/50 | 0/50 : usage privé (conditions d'Aldi) |
| Coop | ⚠️ actions seulement : journal numérique officiel, édition romande ; prix permanents : DataDome, aucun contournement | 6/50 (5 actions + 1 relevé Open Prices) | 1/50 (Open Prices : penne, relevé du 04.08, retiré après le 02.11 s'il n'est pas renouvelé) |
| Migros | ❌ 403, API non ouverte ; Open Prices | 0/50 | 0/50 (relevé de café du 04.08 : lieu d'achat non établi, non utilisé) |

Comparables dans 2 / 3 / 4 / 5 enseignes : **41 / 18 / 2 / 0** en pilote privé, **1 / 0 / 0 / 0** en
version publique (mêmes valeurs qu'au 01.10 : l'attribution à Migros d'un relevé de café, ajoutée le
03.10, a été retirée après examen du justificatif ; inchangées après P12 : 1 offre Lidl nouvellement
reliée, sur un besoin déjà couvert, 0 relevé réel). **Prix vérifiés dans un magasin de Bulle : 0** (Lidl :
prix publiés pour la région ; Coop : relevé fait à Neuchâtel ; `docs/COUVERTURE_NOYAU.md` § 0 ter). Prochain gain public : relevés en magasin
(`docs/RELEVES_PRIORITAIRES.md`). Commande : `pnpm quotidien` (≈ 12 min, 241 requêtes sur GitHub le 03.10). Planification :
GitHub Actions dans le dépôt privé `tesprix-collecte` : **premier cycle réel réussi le 03.10.2026**
(5 sources, dont Aldi, Denner et le journal Coop depuis GitHub), planification active, premier déclenchement
planifié attendu le 04.10 à 06:17 (aucun observé à la consultation du 03.10, 23:50), **0/7** jours complets (`ops/actions-prive/README.md`) ; Windows
(`scripts/windows/installer-tache.ps1`, **non vérifiée** sur l'ordinateur de l'exploitant) en secours, mode
« état partagé » à 15:30. Analyse : `docs/COUVERTURE_NOYAU.md` ; exploitation :
`docs/COLLECTE_QUOTIDIENNE.md`. Hors plan : FoodAlly (licence), offres B2B, widgets, marque blanche.

Publication : la provenance d'un prix (fichier de la source et hôte de ses URL) décide, pas son
étiquette ni l'enseigne ; un relevé Open Prices pour Coop, Aldi, Denner ou Migros reste publiable
(ODbL), un prix d'une source privée réétiqueté ne l'est jamais (`docs/DROITS_DONNEES.md`).

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
| **Magasins** | Enseignes et succursales du rayon (5–30 km), sélection par enseigne et par magasin, nombre maximal de magasins ; **données de prix par enseigne** : nombre des 50 aliments de base ayant un prix **utilisable** dans le rayon (mêmes règles que la comparaison : fraîcheur, zone tarifaire), officiels, partiels, aucun, non affichés ; **stock toujours « inconnu »** |
| **Article par article** | Pour chaque article ayant un prix dans au moins deux enseignes du rayon : offre la moins chère de chaque enseigne, **« même article » (même code-barres) ou « produits équivalents »**, date, source, lieu du relevé communautaire et portée du prix ; écart seulement pour des quantités achetées identiques (`docs/PARCOURS_BULLE.md`) |
| **Comparaison des solutions** | Chaque enseigne seule et la combinaison : achats, trajet aller-retour, durée, coût, total, économie sur les achats et **après déplacement** par rapport au meilleur magasin unique **complet** ; panier incomplet jamais présenté comme moins cher ; **couverture par enseigne** affichée (« ce que couvre cette comparaison » : articles avec prix, indicatifs **et pourquoi** — relevé communautaire, prix de plus de 7 jours, action à fin non publiée, ou courses prévues après le relevé —, enseigne non affichée ou fermée ce jour-là) ; panier partiel jamais chiffré en regard des paniers complets ; articles achetés dans un autre conditionnement signalés dans les économies ; action réservée à une carte non déclarée signalée, jamais appliquée ; aucun scénario sans article (dimanche : avertissement au lieu d'un trajet « à 0 article ») |
| **Montant réellement payé** | Paquets entiers à acheter × prix du paquet ; sur chaque ligne : quantité demandée, paquets, quantité achetée, surplus (ou léger manque dans la tolérance de 10 %) ; jamais de prix proportionnel ; jamais de pièces converties en grammes ; « moins cher au kilo » distingué de « moins cher pour couvrir le besoin » |
| **Offres hebdomadaires Lidl** | Règles revues multicritères (désignation sans marque, variante exclue ou « diverses sortes », contenance et unité, bio, mentions requises) : 1 offre nouvellement reliée (oranges 1 kg Lidl Plus → 2 × 1 kg), 5 confirmées, 6 « à vérifier » jamais utilisées ; chaque offre ne vaut que par ses propres promotions (dates, carte, région, source), jamais prolongée (`docs/OFFRES_LIDL.md`, `pnpm job offres-lidl`) |
| **Prix Lidl Plus** | Prix carte de la fiche catalogue (thème Lidl Plus) lu comme tel : appliqué seulement si la carte est déclarée, sinon signalé |
| **Conditions des actions** | Carte déclarée (Lidl Plus), quantité minimale, « -X % sur le 2e paquet », prix « dès » jamais appliqué, actions régionales par zone, conditions affichées |
| **Trajet** | Estimation à vol d'oiseau × 1,3 **annoncée comme telle** ; coût par km modifiable ; OSRM facultatif |
| **Courses plus tard** | Date jusqu'à 60 jours : actions publiées valables ce jour-là dans la région ; actions « en cours » vs « annoncées » ; dernier prix connu signalé comme non garanti ; fin non publiée non confirmée au-delà du dernier jour vu |
| Fraîcheur | Dates des relevés par enseigne, alerte si > 48 h, exclusion au-delà de 30 jours |
| Droits des sources | Statut de réutilisation par source ; exclusion en production sans autorisation (`AUTHORIZED_SOURCES`) |
| Collecte officielle | Lidl (catégories, fiches en rotation, actions), Aldi (liste paginée) — 0 blocage |
| Démonstration | `/fr/exemples` (Lausanne, Bulle, Genève en un clic), `pnpm job demo-baskets`, captures `docs/captures/phase4` |
| Contrôles | `match-audit`, `data-report`, `validate`, `/admin/qualite` |
| Gratuit | Toutes les fonctions grand public, sans compte ni abonnement |
| Relevés en magasin | Saisie privée (`data/private/releves/`, ou `etat/private/releves/` du dépôt privé), photo de l'étiquette ou du ticket dans `preuves/`, validation (`statut`, `valide_par`), rapport privé, publication des seules lignes validées d'un des 50 besoins, épurées (ni fichier, ni preuve, ni auteur) ; prix présenté comme local et indicatif ; fiche Migros Bulle prête (`docs/releves/FICHE_MIGROS_BULLE.md`) ; **0 relevé réel à ce jour** |
| Couverture vérifiée | Page des magasins et article par article : « vérifié dans un magasin de votre rayon » distingué d'un relevé fait ailleurs (prix supposé identique) et des prix publiés par l'enseigne |
| Matrice et page publique | `pnpm job matrice-essentiels` : 50 × 5, vues publique et privée, page statique sans donnée Aldi |
| Tests | 303 unitaires (dont offres Lidl, conditionnements, relevés et données privées), 7 d'intégration PostgreSQL, 36 contrôles PowerShell (tâche Windows), 8 parcours publics, 2 d'administration, 6 de démonstration sur prix réels (03.10.2026) ; parcours public à Bulle rejoué après P12 (`docs/PARCOURS_BULLE.md`) |

## ⏳ Dépend d'une source de données ou d'une autorisation

| Élément | Situation | Ce qui débloque |
|---|---|---|
| **Affichage des prix Aldi** | Collecte pour évaluation interne ; exclu en production | Autorisation écrite d'Aldi Suisse ou avis juridique favorable |
| **Fiches produits Lidl** | Lues en rotation (`/fr/catalog/…`, hors `Disallow: /catalog/` selon RFC 9309, listées au plan du site) | Confirmation de Lidl ; sinon `LIDL_PRODUCT_PAGES_PER_RUN=0` (≈ 99 références au lieu de 200) |
| **Prix Migros, Coop** | Refus technique (403, DataDome) : aucun contournement | Accord écrit (demande gratuite prête) ; relevés en magasin |
| **Prix Denner** | Conditions : usage commercial interdit sans autorisation écrite | Autorisation (demande gratuite prête) ; relevés en magasin |
| Aldi : 415 articles sans contenance | Écartés (jamais devinés) | Accord ou flux Aldi |
| Repli FoodAlly | Implémenté, désactivé, **hors plan** (licence payante) | — |
| Sources privées (Aldi, Denner, journal Coop) | Instantanés dans `data/private/` (hors dépôt) ; test `privacy.test.ts` contre tout prix privé versionné ; anciennes données Aldi dans l'historique Git (procédure prête : `docs/NETTOYAGE_HISTORIQUE.md`) | Accord écrit pour publier (`docs/AUTORISATIONS.md`) |
| Page publique statique | Générée (`data/public/index.html`), non publiée | Fusion dans `main` + `TESPRIX_PAGES=oui` |
| Tickets de caisse, API professionnelle, facturation | Fermés | Voir `docs/LANCEMENT.md` |

## ⚖️ Points juridiques ouverts (aucun avis payant prévu : demandes d'autorisation gratuites, plan § 7–8)

Points détaillés dans `docs/DROITS_DONNEES.md` § 6 : LCD art. 5 let. c (collecte Lidl et Aldi), clause
« fins privées » d'Aldi, `robots.txt` de Lidl, OIP (prix de base, « au lieu de »), responsabilité en cas
de prix erroné, ODbL, licence FoodAlly, LPD (tickets), nom « TesPrix ».

## Avant l'ouverture publique

Voir `docs/LANCEMENT.md`.
