# TesPrix — modèle économique v2 : gratuit pour les consommateurs, financé par le B2B

> **Remplacé le 30.09.2026** par [PLAN_SANS_DEPENSES.md](PLAN_SANS_DEPENSES.md) : aucune dépense nouvelle ;
> offres B2B, widgets, marque blanche, revente de données et licence FoodAlly sortent du périmètre.
> Ce document est conservé pour mémoire.

> Version de travail du 30.09.2026. **Tous les montants prospectifs sont des hypothèses**, avec leur
> formule ; aucun revenu n'est acquis, aucun client n'a été contacté, aucun paiement n'est actif.
> Remplace les sections « premium » de `BUSINESS_PLAN.md` (phase 2), dont les coûts restent valables.

## 1. Principes

1. **Gratuit pour les consommateurs**, sans abonnement : comparaison illimitée, trois scénarios,
   itinéraire, planification, détours, listes, alertes de base (`packages/core/src/entitlements.ts`).
2. **Aucune vente de données personnelles** : ni identité, ni adresse, ni position précise, ni contenu
   individuel de panier, ni habitude individuelle. Les sorties B2B passent par un contrôle défensif
   (`assertNoPersonalData`) et ne contiennent que des prix (faits publics datés et sourcés) et des
   agrégats.
3. **Indépendance du classement** : aucune offre commerciale ne modifie le prix, le classement, la
   comparaison, l'itinéraire ni les recommandations.
4. **Provenance** : chaque donnée vendue indique sa source ; une donnée sous licence tierce (FoodAlly)
   ou ODbL (Open Prices) n'est servie que si sa licence le permet.

## 2. Différenciation

| | TesPrix | FoodAlly | Schnäppchen Jäger (zzd) | Prospectus (Profital…) |
|---|---|---|---|---|
| Prix d'un article | ✅ | ✅ | ✅ | ✅ (actions) |
| **Panier complet** comparé | ✅ | liste | ❌ | ❌ |
| **Actions futures datées** (validité, conditions, carte) | ✅ | historique | ❌ | ✅ |
| Prix en magasin / portée régionale | ✅ | en ligne | en ligne | ✅ |
| **Localisation, succursales, horaires** | ✅ | ❌ | ❌ | partiel |
| **Itinéraire et coût du trajet** | ✅ | ❌ | ❌ | ❌ |
| **Nombre maximal de magasins** | ✅ | ❌ | ❌ | ❌ |
| **Détours rentables** (économie nette) | ✅ | ❌ | ❌ | ❌ |
| Indice de confiance, divergences signalées | ✅ | ❌ | ❌ | ❌ |
| Couverture Migros / Coop / Denner | ❌ (sans accord) | ✅ | ✅ | ✅ |

## 3. Actif de données propriétaire

| Élément | État au 30.09.2026 | Pourquoi il a de la valeur |
|---|---|---|
| Catalogue normalisé des besoins de base | 240 références, priorités P1/P2/P3 | Base commune de comparaison entre enseignes |
| Correspondances revues article ↔ référence | 449 décisions (Lidl, Aldi, Open Prices) | Travail humain non reproductible automatiquement |
| Séries de prix officielles quotidiennes | Lidl (3 429 articles), Aldi (1 901) depuis le 28.09.2026 | Historique qui prend de la valeur chaque jour |
| Calendrier des actions, y compris **futures** | 531 (Lidl, dont 244 annoncées) + 712 (Aldi, dont 95 annoncées) au 30.09.2026 | Rare : les dates de validité et conditions sont normalisées |
| Moteur de qualité | Divergences, confiance, validation des 50 essentiels | Fiabilité mesurable, vendable comme telle |
| Signaux d'usage agrégés | Compteurs anonymes (phase 2) | Demande par référence et par canton, seuil minimal d'agrégation |
| Tickets de caisse (à ouvrir) | Architecture prête (`docs/TICKETS.md`) | Seule voie vers Migros/Coop/Denner sans accord |

## 4. Offres professionnelles

Hypothèses de prix (`packages/core/src/b2b.ts`), positionnées **sous** l'offre Business de FoodAlly
(« dès CHF 499/mois ») pour l'accès aux données brutes, et au-dessus pour les services à valeur ajoutée.

### A. API de données (`/api/b2b/v1/*`, fermée par défaut)

| Palier | Contenu | Hypothèse (CHF/mois HT) | Clients visés |
|---|---|---|---|
| Starter | Indices de panier par enseigne (hebdomadaires), couverture, actions agrégées | 149 | Médias, associations de consommateurs, chercheurs |
| Pro | Observations officielles par article et enseigne, provenance et confiance, historique, actions futures | 490 | Fabricants, cabinets d'études, fintech |

Points d'accès implémentés : `observations`, `coverage`, `basket-index` (clé API, empreintes SHA-256
dans `B2B_API_KEY_HASHES`, aucune clé = API fermée).

### B. Tableau de bord Intelligence

Positionnement prix par catégorie et enseigne, fréquence et profondeur des actions, actions annoncées
de la semaine suivante, alertes de variation. **990 CHF/mois** (hypothèse). Clients : marques
(suivi de leurs produits chez les discounters), catégories managers, enseignes régionales.

### C. Widget et marque blanche

- **Widget** comparateur de panier (mention TesPrix obligatoire), coût d'une recette : **99 CHF/mois**.
  Sites de recettes, médias, communes, associations.
- **Marque blanche** (assurances, banques, programmes d'entreprise) : **1 500 CHF/mois**.

### D. Sponsoring (strictement séparé)

Autorisé : un emplacement partenaire **signalé** (« Partenaire »), hors du classement, jamais dans une
ligne de résultat (`sponsored.ts`, emplacements vides à ce jour). Interdit : placement payant dans les
résultats, bonus de classement, itinéraire orienté, recommandation achetée, ciblage individuel.
Hypothèse prudente : **0** dans les scénarios (aucun partenaire contacté).

## 5. Coûts (hypothèses, CHF par mois)

| Poste | Bas | Central | Haut | Formule / source |
|---|---|---|---|---|
| Technique (serveur, base, sauvegardes, supervision, domaine) | 13 | 90 | 172 | `BUSINESS_PLAN.md` §7.1 |
| Collecte first-party | 0 | 0 | 10 | ~610 requêtes/jour (Lidl 460 fiches + 110 pages, Aldi 43), ≈ 75 Mo/jour ; archives 30 j ≈ 2,3 Go |
| Données tierces (repli Migros/Coop/Denner) | 0 | 49 | 499 | FoodAlly Pro (49) ou Business (499), **non souscrit** |
| Avis juridique amorti sur 24 mois | 125 | 229 | 333 | `3 000 – 8 000 / 24` |
| Comptabilité, assurance RC, facturation B2B | 50 | 150 | 300 | hypothèse |
| **Total hors temps de l'exploitant** | **188** | **518** | **1 314** | |
| Temps de l'exploitant (non rémunéré) | | 3 200 | | `40 h × 80` |

### 5 bis. Détail des 518 CHF et budget minimal (phase 4)

Répartition du scénario central (hypothèses, CHF par mois ; prix d'hébergement non revérifiés en
phase 4). « Nécessaire » = indispensable pour ouvrir le comparateur grand public.

| Poste | Central | Nature | Nécessaire au comparateur ? |
|---|---|---|---|
| Serveur d'application (VPS, Suisse ou UE) | 30 | Technique | Oui |
| PostgreSQL + PostGIS | 20 | Technique | Oui, mais 0 si sur le même serveur |
| Itinéraires OSRM auto-hébergés | 15 | Technique | Non : estimation à vol d'oiseau affichée comme telle |
| Sauvegardes, stockage des archives | 8 | Technique | Oui |
| Courriel transactionnel | 10 | Technique | Non tant que les inscriptions sont fermées |
| Supervision | 5 | Technique | Utile (offre gratuite possible) |
| Domaine `.ch` | 2 | Technique | Oui |
| **Sous-total technique** | **90** | | dont nécessaire ≈ 40–60 |
| Collecte first-party (Lidl, Aldi) | 0 | Données | Oui (même serveur) |
| **Licence FoodAlly Pro** (« dès 49 ») | **49** | Données tierces | **Option** : couverture Migros/Coop/Denner ; **incluse dans les 518** |
| Avis juridique amorti sur 24 mois (`5 500 / 24`) | 229 | Juridique | Oui avant l'ouverture (ponctuel : 3 000 – 8 000) |
| Comptabilité, assurance RC, facturation B2B | 150 | Administration | Assurance RC oui (≈ 20–30) ; comptabilité et facturation B2B = options B2B |
| **Total central** | **518** | | |
| Valorisation du temps de l'exploitant (`40 h × 80`) | 3 200 | Non décaissé | — |

Regroupement :

| Catégorie | Montant mensuel (hypothèses) |
|---|---|
| Nécessaire au comparateur grand public | ≈ 60 (technique) + 229 (avis juridique amorti) + 25 (assurance) ≈ **315** |
| Options liées aux données | FoodAlly Pro 49 (incluse dans 518) — **Business 499 si l'affichage public l'exige** (question § 5.3 de `docs/DROITS_DONNEES.md`), soit + 450 |
| Options B2B | ≈ 125 (comptabilité, facturation, contrats) |
| Valorisation du temps | 3 200 (non décaissé) |

**Budget minimal réaliste** pour ouvrir un pilote grand public (sans B2B, sans FoodAlly) :
≈ **50 CHF/mois décaissés** (un serveur avec base et sauvegardes ≈ 25–35, domaine 2, assurance RC
≈ 20) **+ un avis juridique ponctuel de 3 000 à 8 000 CHF** (≈ 125 à 333 CHF/mois sur 24 mois), soit
≈ **175 à 385 CHF/mois** amortis. Avec FoodAlly : **+ 49** (Pro) ou **+ 499** (Business) selon les
droits d'affichage confirmés par le fournisseur — la licence est **supplémentaire** par rapport à ce
budget minimal, mais **déjà comptée** (Pro) dans les 518 CHF du scénario central.

## 6. Revenus (hypothèses)

Formule : `R = Σ nᵢ × pᵢ × (1 − f)`, `f` = frais d'encaissement (3 %, facture ou prestataire).

| Scénario (mois 24) | Starter 149 | Pro 490 | Intelligence 990 | Widget 99 | Marque blanche 1 500 | R brut | R net |
|---|---|---|---|---|---|---|---|
| Pessimiste | 0 | 0 | 0 | 1 | 0 | 99 | 96 |
| Central | 3 | 1 | 1 | 4 | 0 | 2 323 | 2 253 |
| Optimiste | 6 | 3 | 3 | 10 | 1 | 7 824 | 7 589 |

Calcul du scénario central : `3×149 + 1×490 + 1×990 + 4×99 = 447 + 490 + 990 + 396 = 2 323`.

## 7. Seuil de financement du service gratuit

`N_min = ⌈ C / (p × (1 − f)) ⌉`

| Coût à couvrir | Valeur | Équivalent en clients (un seul type) |
|---|---|---|
| Coûts centraux hors temps | 518 | 1 Intelligence (`518 / 960` → 1) · ou 2 Pro · ou 4 Starter · ou 6 widgets |
| Coûts centraux + temps de l'exploitant | 3 718 | 4 Intelligence · ou 8 Pro · ou 26 Starter |

Comparaison : en phase 2, le financement par abonnement consommateur exigeait ~14 000 utilisateurs
actifs mensuels (scénario central). **Deux à cinq clients professionnels** couvrent les coûts
d'exploitation ; c'est la voie retenue.

## 8. Modèles B2B les plus crédibles (classement)

1. **Widget / marque blanche** : valeur = notre calcul (panier, trajet, détours), pas la revente de
   prix bruts ; risque juridique faible ; vente simple (sites de recettes, médias, assureurs).
2. **Intelligence discounters** : Lidl et Aldi publient leurs actions, souvent à l'avance ; les marques
   vendues chez eux ont besoin de ce suivi. Crédible dès maintenant, limité aux discounters.
3. **API de données** : utile aux médias et chercheurs (indices), mais concurrence directe de FoodAlly
   (19 enseignes) ; crédible seulement sur nos spécificités (actions futures, magasin, confiance).

Condition commune : **avis juridique** sur la réutilisation commerciale des prix collectés (Lidl, Aldi :
faits publics ; conditions d'Aldi à clarifier) avant toute vente de données brutes.

## 9. Ce qui reste à décider par l'exploitant

- Souscrire ou non une licence FoodAlly (Pro 49, Business 499) pour un repli Migros/Coop/Denner signalé.
- Démarcher les premiers clients (aucun contact pris) et fixer les tarifs.
- Choisir le prestataire de facturation B2B (`server/billing.ts`, désactivé).
