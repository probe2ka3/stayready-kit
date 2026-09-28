# TesPrix — plan d'affaires (version de travail)

> **Tous les chiffres prospectifs de ce document sont des hypothèses**, présentées avec leur formule pour
> pouvoir être recalculées. Aucun revenu n'est acquis : le service n'est pas ouvert, aucun paiement n'est
> actif, aucun partenariat n'existe. État au 28.09.2026. Calculs reproductibles : section 13.

## 1. Concept

TesPrix calcule le **coût réel** d'un panier de courses en Suisse : prix des articles, trajet, temps et nombre
d'arrêts. Il propose un magasin unique, la répartition la moins chère, ou le meilleur compromis, avec un
itinéraire. Chaque prix est **sourcé et daté**.

## 2. Problème

- Les prix varient entre enseignes, zones (coopératives Migros) et semaines (actions).
- Comparer à la main est long ; les comparateurs existants comparent des **articles**, pas des **parcours**.
- Un détour « pour économiser » coûte souvent plus en essence et en temps qu'il ne rapporte, et personne ne le
  chiffre.

## 3. Solution

- Trois scénarios (magasin unique, prix les plus bas, coût global optimisé) calculés exactement
  (`docs/ALGORITHMES.md`).
- Planification à une date, fondée uniquement sur les actions **annoncées** ; signal « attendre serait moins
  cher ».
- Détours chiffrés : économie sur les produits, km et minutes en plus, économie nette, seuil personnel.
- Fiabilité visible : prix vérifié, indicatif, communautaire, périmé.

## 4. Concurrents et différenciation

Détail dans `docs/MARCHE.md`. Schnäppchen Jäger (CHF 2/mois), FoodAlly (gratuit, revenus B2B) et Rappn
(application gratuite) comparent des articles ou des actions. Différenciation de TesPrix : coût global,
itinéraire, horaires, planification et détours chiffrés, prix en magasin sourcés un par un.
**Faiblesse** : couverture Migros/Coop/Denner/Aldi insuffisante sans accord.

## 5. Cibles

Familles et ménages motorisés du périurbain romand (gros panier hebdomadaire, plusieurs enseignes à moins de
10 km), puis ménages à budget serré. Zone pilote : Suisse romande (`PILOT_CANTONS`).

## 6. Sources de revenus

| Source | Formule | Statut |
|---|---|---|
| Abonnement premium | `R_p = U × c × P_net` | Architecture prête, **inactive** |
| Emplacements partenaires signalés | `R_s = U × n × f × CPM / 1000` | Support prêt, **aucun partenaire** |
| Affiliation | — | **Aucun programme vérifié** pour les courses (voir `MARCHE.md` §5) : 0 |
| Données agrégées pour les professionnels | par contrat | Plus tard ; exclue des scénarios |

Définitions : `U` = utilisateurs actifs par mois ; `c` = taux de conversion en premium ; `n` = comparaisons
par utilisateur et par mois ; `f` = taux de remplissage des emplacements ; `CPM` = prix pour 1 000
affichages ; `P_net` = prix mensuel net de TVA et de frais de paiement :

```
P_net = P / (1 + TVA) − (P × f_pct + f_fixe)
TVA = 8,1 % (si assujettissement) ; f_pct = 2,9 % ; f_fixe = CHF 0.30 par paiement (hypothèses de frais)
P = 2.90 → P_net ≈ 2.30 ;  P = 3.90 → P_net ≈ 3.19 ;  annuel 29.– → ≈ 2.14 / mois
```

## 7. Coûts

### 7.1 Coûts techniques mensuels (hypothèses, hébergement en Suisse ou dans l'UE)

| Poste | Bas | Haut | Remarque |
|---|---|---|---|
| Serveur d'application (VPS) | 10 | 40 | Next.js autonome, un conteneur |
| PostgreSQL + PostGIS | 0 | 60 | 0 si hébergé sur le même serveur |
| Itinéraires (OSRM auto-hébergé, extrait Suisse) | 0 | 30 | 0 si distances estimées (mode actuel) |
| Sauvegardes, stockage | 2 | 10 | Base + archives de collecte (30 jours) |
| Courriel transactionnel (liste d'attente, alertes) | 0 | 20 | Seulement à l'ouverture des inscriptions |
| Supervision | 0 | 10 | |
| Domaine `.ch` | ~1 | ~2 | ~CHF 10–20 / an |
| **Total** | **~13** | **~172** | |

### 7.2 Coûts de collecte et de données

| Source | Coût | Formule |
|---|---|---|
| Lidl (site officiel) | ≈ 0 | ~115 requêtes/jour, ~37 Mo/jour, sur le même serveur |
| Open Prices (ODbL) | 0 | API publique |
| Accords avec les enseignes | inconnu | à négocier (gratuit, licence ou échange de visibilité) |
| Fournisseur tiers (Pepesto, non recommandé) | ≈ EUR 864 / mois | `3 enseignes × 30 jours × EUR 9.60` (tarif public « catalogue complet ») |
| Relevés manuels (non retenu) | élevé | `h × taux horaire`, non automatisable |

### 7.3 Coûts ponctuels (hypothèses)

| Poste | Montant (CHF) |
|---|---|
| Avis juridique (LCD, collecte, ODbL, CGU, confidentialité) | 3 000 – 8 000 |
| Dépôt de marque suisse (IPI) | ~450 (tarif à vérifier) |
| Recherche d'antériorité par un conseil | 500 – 1 500 |
| Domaine(s) | ~15 – 40 / an |
| Création d'une société (si GmbH) | 1 000 – 2 000 + capital CHF 20 000 |

### 7.4 Temps de l'exploitant (non rémunéré dans les scénarios)

Hypothèse : 40 h/mois × CHF 80 = **CHF 3 200 / mois** de valeur. Aucun scénario ci-dessous ne le couvre avant
le mois 24 : le projet reste une activité accessoire tant que la couverture Migros/Coop n'est pas obtenue.

## 8. Hypothèses de conversion

Conversion `c` des utilisateurs actifs mensuels en abonnés : 1 % (prudent), 2 % (central), 3,5 % (optimiste).
Repères : les services freemium grand public convertissent typiquement quelques pour cent (hypothèse, non
vérifiée pour ce marché). La présence de concurrents gratuits pousse vers le bas de la fourchette.

## 9. Scénarios (CHF par mois, hypothèses)

Paramètres :

| | Prudent | Central | Optimiste |
|---|---|---|---|
| `U` au mois 12 / 24 | 2 000 / 5 000 | 10 000 / 25 000 | 30 000 / 80 000 |
| `c` | 1 % | 2 % | 3,5 % |
| `P` (TTC) | 2.90 | 2.90 | 3.90 |
| `n` comparaisons / utilisateur / mois | 1,5 | 2 | 2,5 |
| `f` × `CPM` | 0 × 6 | 30 % × 8 | 60 % × 10 |
| Coûts techniques | 60 | 150 | 400 |
| Acquisition (marketing) | 0 | 500 | 2 000 |

Résultats (`R = U×c×P_net + U×n×f×CPM/1000` ; `Coûts = technique + acquisition + données`) :

| Scénario | Mois | Abonnés | Premium | Partenaires | Revenus | Coûts | **Résultat** |
|---|---|---|---|---|---|---|---|
| Prudent | 12 | 20 | 46 | 0 | 46 | 60 | **−14** |
| Prudent | 24 | 50 | 115 | 0 | 115 | 60 | **+55** |
| Central | 12 | 200 | 460 | 48 | 508 | 650 | **−142** |
| Central | 24 | 500 | 1 149 | 120 | 1 269 | 650 | **+619** |
| Optimiste | 12 | 1 050 | 3 354 | 450 | 3 804 | 2 400 | **+1 404** |
| Optimiste | 24 | 2 800 | 8 945 | 1 200 | 10 145 | 2 400 | **+7 745** |

Hors temps de l'exploitant (§7.4) et hors coûts ponctuels (§7.3).

## 10. Seuil de rentabilité

```
U* = Coûts mensuels / (c × P_net)          (sans partenaires)
Prudent  : 60 / (1 % × 2.30)     ≈  2 600 utilisateurs actifs
Central  : 650 / (2 % × 2.30)    ≈ 14 100
Optimiste: 2 400 / (3,5 % × 3.19) ≈ 21 500
Avec le temps de l'exploitant (+3 200) au scénario central : (650 + 3 200) / (2 % × 2.30) ≈ 83 700
```

## 11. Acquisition et croissance

| Étape | Condition d'entrée | Actions |
|---|---|---|
| 0. Préparation (actuelle) | — | Données Lidl + Open Prices, validation juridique, demandes d'accord |
| 1. Pilote fermé | Validation juridique, CGU | Accès par jeton de prévisualisation (`PREVIEW_TOKEN`), 50–200 testeurs romands |
| 2. Ouverture romande | ≥ 1 accord ou couverture suffisante | Référencement (pages méthode et sources), presse consommateurs, réseaux locaux |
| 3. Premium | Mesure de l'économie moyenne par panier | Comptes, alertes, historique ; prix testé à CHF 2.90 |
| 4. Suisse entière | Accords Migros/Coop, allemand et italien | Traductions (structure prête), OSRM |

Contribution « Open Prices » : encourager les utilisateurs à photographier leurs tickets pour Open Prices
enrichit une base ouverte dont TesPrix bénéficie (sans rémunération ni collecte par TesPrix).

## 12. Risques

| Risque | Nature | Probabilité | Impact | Mesure |
|---|---|---|---|---|
| Refus des enseignes de fournir leurs prix | Commercial | Élevée | Élevé | Couverture partielle transparente ; Open Prices ; demande d'accord |
| Contestation de la collecte Lidl (LCD art. 5 let. c, conditions) | Juridique | Moyenne | Élevé | Collecte minimale, robots.txt, avis juridique avant ouverture, arrêt immédiat sur demande |
| Obligations ODbL mal appliquées | Juridique | Faible | Moyen | Export `export-odbl`, séparation des sources |
| Comparaisons jugées trompeuses (LCD art. 3 let. e) | Juridique | Moyenne | Élevé | Méthode publiée, prix datés, jamais de « jusqu'à -X % » |
| Nom « TesPrix » indisponible (marque, raison sociale) | Juridique | Inconnue | Moyen | Recherche Swissreg/Zefix par un conseil (`docs/IDENTITE.md`) |
| Concurrents gratuits bien établis | Commercial | Élevée | Moyen | Différenciation par le coût global et les détours |
| Changement de structure du site Lidl | Technique | Moyenne | Moyen | Alertes `parse_drift` / `coverage_drop`, retraitement depuis l'archive |
| Dépendance à un seul contributeur Open Prices | Données | Élevée | Faible | Signalé « indicatif » ; aucun calcul critique n'en dépend |
| Paiement sans CGU valides | Juridique | — | Élevé | Paiement désactivé par construction |

## 13. Reproduire les calculs

```python
TVA, f_pct, f_fixe = 0.081, 0.029, 0.30
P_net = lambda P: P / (1 + TVA) - (P * f_pct + f_fixe)
revenu = lambda U, c, P, n, f, cpm: U * c * P_net(P) + U * n * f * cpm / 1000
seuil = lambda couts, c, P: couts / (c * P_net(P))
```

## 14. Indicateurs de pilotage (tableau de bord `/admin/indicateurs`)

Utilisateurs actifs (visites quotidiennes anonymes), taux de retour à 7 jours, comparaisons, part des
comparaisons sur prix réels, part planifiée, détours proposés/acceptés, listes enregistrées, couverture des
prix, coûts techniques déclarés et coût par comparaison. Aucune donnée personnelle : compteurs agrégés
(`packages/core/src/metrics.ts`).
