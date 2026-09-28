# Statut des fonctionnalités — TesPrix

Situation au 28 septembre 2026 (fin de la phase 2). Trois catégories : **opérationnel**, **dépend d'une
source de données ou d'une autorisation**, **nécessite une validation juridique**.

## Chiffres clés des données réelles (collecte du 28.09.2026)

| Enseigne | Source | Articles | Prix normaux | Promotions | Références du catalogue couvertes (sur 200) |
|---|---|---|---|---|---|
| Lidl | Site officiel (assortiment + actions) | 1 549 | 1 148 | 517 (dont 244 futures, 29 régionales, 52 Lidl Plus) | **98** (prix du jour) |
| Migros | Open Prices (ODbL) | — | 113 (47 de moins de 90 jours) | — | 7 (2 avec prix récent) |
| Coop | Open Prices | — | 100 (25 de moins de 90 jours) | — | 6 (2 récents) |
| Denner | Open Prices | — | 12 (4 de moins de 90 jours) | — | 4 (0 récent) |
| Lidl | Open Prices | — | 12 | — | inclus ci-dessus |
| Aldi Suisse | Open Prices | — | 3 (anciens) | — | 0 |
| OTTO'S | Open Prices | — | 1 (ancien) | — | 1 (0 récent) |
| Action, Aligro | — | — | 0 | — | 0 |

- Open Prices : 222 articles (codes-barres), 241 prix au total.
- **Comparables entre au moins deux enseignes** : 12 références (penne, fusilli, chips, séré, tofu, huile
  d'olive 1 l et 50 cl, mozzarella, fromage râpé, sauce soja, liquide vaisselle, café en grains), dont **3 avec
  des prix récents des deux côtés** (penne, fusilli, chips).
- Correspondances : 143 validées à la main et 13 refus explicites (`data/matching/reviewed.json`) ;
  suggestions automatiques jamais utilisées sans validation.

## ✅ Opérationnel

| Fonctionnalité | Détail |
|---|---|
| **Collecte de prix réels** | Lidl (quotidienne, robots.txt respecté, 3 s entre requêtes) et Open Prices ; archivage des pages, reprises, blocage détecté et jamais contourné, alertes, retraitement depuis l'archive |
| **Séparation réel / démo** | `PRICE_DATA=live|demo` : jamais de mélange ; provenance, date, lieu et licence affichés prix par prix |
| Fiabilité | Vérifié (officiel ≤ 7 j), indicatif (8 à 30 j, relevé communautaire, date future), périmé (> 30 j ; > 90 j pour les relevés communautaires), promotion confirmée |
| Actions datées | Publication, début et fin distincts ; actions annoncées à l'avance (Lidl) ; régionales (Tessin, Romandie, Suisse alémanique) ; Lidl Plus |
| Localisation, succursales | 4 073 localités (swisstopo), 2 955 succursales (OSM), régions Lidl selon la langue de la localité |
| Comparaison | 3 scénarios, optimisation exacte ≤ 5 magasins, horaires à l'heure d'arrivée, coûts de trajet paramétrables |
| **Détours intelligents** | Réoptimisation conjointe par magasin candidat ; économie brute, articles ajoutés, km, minutes, coût du trajet, économie nette ; seuil personnel ; accepter (magasin imposé) / refuser (exclu et recalcul) |
| **Attendre serait moins cher** | Signal fondé uniquement sur les actions déjà annoncées (≥ 1 CHF et ≥ 3 %, sans perte d'article) |
| Planification | Aujourd'hui vs date choisie ; aperçu sur 10 jours à partir de la date choisie |
| Listes, partage, impression | Inchangé (phase 1) |
| Administration | Collectes et alertes, correspondances, anomalies, imports, journal, **indicateurs anonymes** |
| Offres gratuite / premium | Droits définis ; **paiement désactivé** |
| Contenus commerciaux | Emplacements signalés, séparés du classement ; **aucun partenaire** |
| Lancement | Verrou `PUBLIC_ACCESS=waitlist`, prévisualisation par jeton, page d'attente, liste d'attente **fermée** |
| Tests | 133 tests unitaires et d'intégration, 4 parcours navigateur (mobile et bureau), 2 parcours d'administration |

## ⏳ Dépend d'une source de données ou d'une autorisation

| Élément | Situation | Ce qui débloque |
|---|---|---|
| **Prix Migros, Coop, Aldi** | Sites protégés contre l'accès automatisé (403, défi anti-robot) : **aucun contournement** | Accord écrit ou flux de l'enseigne |
| **Prix Denner** | Site accessible mais conditions (reprises de Migros) interdisant l'usage commercial sans autorisation écrite | Autorisation de Denner/Migros |
| Prix OTTO'S, Aligro, Action | Voir `docs/audit/03-sources-prix.md` §4.6–4.8 | Lecture humaine des conditions ou accord |
| Couverture Lidl complète | Pagination interdite par robots.txt : première page de chaque catégorie seulement | Accord ou flux Lidl |
| Itinéraires routiers précis | Estimation (vol d'oiseau × détour) | Serveur OSRM (`OSRM_URL`) |
| Premium, alertes, historique | Architecture prête, comptes et paiement non ouverts | Décision de l'exploitant, CGU, prestataire de paiement |
| Liste d'attente | Prête, fermée | Politique de confidentialité complétée, `SIGNUP_ENABLED=true` |

## ⚖️ Nécessite une validation juridique avant exploitation commerciale

- Collecte automatisée des pages publiques de Lidl (LCD art. 5 let. c, conditions du site).
- ODbL : qualification « base collective » de la base TesPrix, export des données dérivées.
- Comparaisons publiées (LCD art. 3 al. 1 let. e) et indication des prix (OIP).
- Nom « TesPrix » : marques proches en « -prix », caractère descriptif (`docs/IDENTITE.md`).
- Conditions d'utilisation (projet), mentions légales et confidentialité (champs « à compléter »).

## Avant l'ouverture publique

Voir `docs/LANCEMENT.md`.
