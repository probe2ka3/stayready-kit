# Statut des fonctionnalités — TesPrix

Situation au 30 septembre 2026 (fin de la phase 3). Trois catégories : **opérationnel**, **dépend d'une
source de données ou d'une autorisation**, **nécessite une validation juridique**. Détails des sources :
`docs/DATA_SURFACES.md` ; moteur de données : `docs/DATA_ENGINE.md`.

## Chiffres clés des données réelles (collectes des 28 et 30.09.2026)

| Enseigne | Source (niveau) | Articles | Articles avec prix | Actions (en cours / annoncées) | Fraîcheur | Références couvertes (sur 240) |
|---|---|---|---|---|---|---|
| Lidl | Site officiel : fiches du plan du site, catégories, actions (officiel) | 3 429 | 3 012 | 287 / 244 | 1 207 < 24 h, 1 805 < 7 j | **194** |
| Aldi Suisse | API publique du site (officiel) | 1 901 | 1 484 | 609 / 95 | 1 477 < 24 h | **106** |
| Migros | Open Prices (communautaire) | 109 | 109 (113 prix) | — | surtout > 7 j | 2 |
| Coop | Open Prices | 85 | 85 (100 prix) | — | > 7 j | 2 |
| Denner | Open Prices | 12 | 12 | — | > 7 j | 0 |
| OTTO'S | Open Prices | 1 | 1 | — | ancien | 0 |
| Action, Aligro | — | 0 | 0 | — | — | 0 |

- **Comparables** : 98 références dans ≥ 2 enseignes, 4 dans ≥ 3, 0 dans ≥ 4 ou 5.
  Essentiels (P1) : 30 sur 50 comparables dans ≥ 2 enseignes.
- Correspondances revues : 449 (Lidl, Aldi, Open Prices), seules utilisées (exigences bio, origine, AOP,
  marque respectées).
- Contrôle de qualité (30.09.2026) : 0 prix suspect, 0 divergence, 0 doublon, 0 action lue comme prix
  normal, 18 relevés communautaires anciens ; jeu de validation : 76/76 paires valides.
- FoodAlly (référence tierce, comparaison uniquement) : prix identiques sur les articles communs (écart
  médian 0 %) ; couvre Migros, Coop et Denner.

## ✅ Opérationnel

| Fonctionnalité | Détail |
|---|---|
| **Collecte officielle Lidl** | Pages catégories, 3 167 fiches du plan du site en rotation (7 jours), actions datées, futures, régionales, Lidl Plus |
| **Collecte officielle Aldi** | API publique : 2 500 articles, 43 requêtes, prix en magasin, réductions « au lieu de », actions annoncées à l'avance |
| Collecte communautaire | Open Prices (ODbL), toujours « indicatif » |
| **Moteur multi-sources** | Hiérarchie officiel > tiers > communautaire, alternatives conservées, divergences > 15 % signalées, confiance par prix |
| **Qualité des données** | Tableau `/admin/qualite` : couverture, fraîcheur, sources, alertes par type ; tâche `data-report` |
| **Jeu de validation** | 50 essentiels × 5 enseignes, tests de non-régression, tâche `validate` |
| Catalogue | 240 besoins de base, priorités P1/P2/P3 |
| Comparaison | 3 scénarios, optimisation ≤ 5 magasins, détours, attente rentable, source et confiance affichées |
| **Gratuit** | Toutes les fonctions grand public, sans abonnement |
| Tickets de caisse | Lecture et nettoyage dans le navigateur (`/fr/ticket`) ; envoi **fermé** |
| API professionnelle | `/api/b2b/v1/*` implémentée, **fermée** tant qu'aucune clé n'est configurée |
| Tests | 171 tests unitaires, 7 d'intégration PostgreSQL, 8 parcours navigateur, 2 d'administration |

## ⏳ Dépend d'une source de données ou d'une autorisation

| Élément | Situation | Ce qui débloque |
|---|---|---|
| **Prix Migros, Coop** | Refus technique sur leurs sites (403, DataDome) : aucun contournement | Accord écrit ; ou licence FoodAlly (repli signalé) ; ou tickets de caisse |
| **Prix Denner** | Accessible, mais conditions : usage commercial interdit sans autorisation écrite | Autorisation de Denner |
| Aldi : 415 articles sans contenance publiée (30.09) | Fiches refusées (403) : contenance inconnue, articles écartés | Accord ou flux Aldi |
| Repli FoodAlly | Implémenté, désactivé | Licence (Pro CHF 49 ou Business CHF 499/mois) et revue des correspondances |
| Tickets de caisse | Envoi fermé | Politique de confidentialité validée, file de revue |
| API professionnelle, facturation | Fermées | Clients, contrats, prestataire de facturation |

## ⚖️ Nécessite une validation juridique avant exploitation commerciale

- Collecte des pages publiques de Lidl et de l'API publique d'Aldi (conditions d'Aldi : clause « fins
  privées » dans les conditions du compte utilisateur, portée à préciser ; LCD art. 5 let. c).
- Revente de prix collectés (API professionnelle) ; ODbL pour la part Open Prices.
- Conditions d'utilisation, confidentialité (tickets), mentions légales.
- Nom « TesPrix » (`docs/IDENTITE.md`).

## Avant l'ouverture publique

Voir `docs/LANCEMENT.md`.
