# TesPrix — compte rendu de la phase 2

Date : 28.09.2026. Branche : `claude/swiss-grocery-comparison-w7bk8q` (non fusionnée, non déployée).

## 1. Sources de prix réels utilisées

| Source | Enseignes | Nature | Licence / cadre | Décision |
|---|---|---|---|---|
| Site officiel Lidl Suisse : `sortiment.lidl.ch` (assortiment) et `www.lidl.ch` (actions) | Lidl | Prix en magasin, nationaux, actions datées (dont futures, régionales, Lidl Plus) | Pages publiques ; robots.txt respecté ; aucune clause d'interdiction trouvée ; faits seulement | **Utilisée** ⚖️ avis juridique avant ouverture |
| Open Prices (Open Food Facts) | Migros, Coop, Denner, Lidl, Aldi, OTTO'S | Relevés communautaires avec ticket ou photo d'étiquette | ODbL 1.0 (attribution, partage des données dérivées : export prêt) | **Utilisée**, toujours « indicatif » |
| Open Food Facts (produits) | — | Désignation, marque, contenance, labels par code-barres (pas de prix) | ODbL | Utilisée via les fiches incluses dans Open Prices |
| Sites Migros, Coop, Aldi | — | — | 403 ou défi anti-robot | **Bloquées** : aucun contournement |
| Site Denner | — | Actions avec prix | Conditions Migros : usage commercial interdit sans autorisation écrite | **Non utilisée** |
| OTTO'S, Aligro, Action | — | Application JavaScript / interface interne / assortiment non alimentaire | — | Non utilisées (voir `audit/03-sources-prix.md`) |
| Pepesto, autres revendeurs de données collectées | Migros, Coop, Aldi | API payante | Droits des enseignes non acquis | **Non retenus**, rien n'a été acheté |

`preise.zzd.ch` (Schnäppchen Jäger) a été étudié à partir de ses pages publiques, sans aucune reprise de
données, de code ni de contenu.

## 2. Prix réels importés par enseigne (collecte du 28.09.2026)

| Enseigne | Prix normaux | Promotions | Dont < 90 jours | Source |
|---|---|---|---|---|
| Lidl | 1 148 | 517 (244 futures, 29 régionales, 52 Lidl Plus) | tous (du jour) | Site officiel |
| Migros | 113 | — | 47 | Open Prices |
| Coop | 100 | — | 25 | Open Prices |
| Lidl (communautaire) | 12 | — | 1 | Open Prices |
| Denner | 12 | — | 4 | Open Prices |
| Aldi Suisse | 3 | — | 0 | Open Prices |
| OTTO'S | 1 | — | 0 | Open Prices |
| Action, Aligro | 0 | 0 | — | — |
| **Total** | **1 389** | **517** | | |

Collecte Lidl : 115 requêtes, 37 Mo, aucun blocage, 7 prix rejetés par le contrôle du prix de base
(erreurs manifestes de la source), 4 conditionnements illisibles hors catalogue.

## 3. Couverture réelle du catalogue (200 références)

| Enseigne | Références avec prix réel | Dont prix récent |
|---|---|---|
| Lidl | 98 | 98 |
| Migros | 7 | 2 |
| Coop | 6 | 2 |
| Denner | 4 | 0 |
| OTTO'S | 1 | 0 |
| Aldi, Action, Aligro | 0 | 0 |

- **Panier comparable entre plusieurs enseignes** : 12 références, dont 3 avec des prix récents des deux
  côtés (penne, fusilli, chips nature). Exemple vérifié de bout en bout depuis Morat : parcours Lidl
  (prix officiels du jour) + Migros Morat (relevés du 14.09.2026), avec détour chiffré et signal d'attente.
- Correspondances : 143 validées à la main, 13 refusées explicitement.
- **Conclusion honnête** : la plateforme est fiable mais limitée. Lidl est bien couvert ; les autres
  enseignes ne le seront qu'avec leur accord.

## 4. Fréquence de rafraîchissement effective

| Source | Fréquence | Mécanisme |
|---|---|---|
| Lidl | Quotidienne (05:15) + lundi et jeudi 07:10 (vagues d'actions) | `pnpm job daily`, `collect --only lidl-web` |
| Open Prices | Quotidienne | `pnpm job daily` |
| Succursales OSM | Hebdomadaire | `pnpm job weekly` |
| Localités swisstopo | Trimestrielle | `localities --download` |

Les planifications sont documentées (`docs/DEPLOIEMENT.md`) ; elles ne tournent pas encore sur un serveur.
Les instantanés versionnés datent du 28.09.2026.

## 5. Fonctionnalités opérationnelles

- Collecte réelle idempotente, archive des pages, retraitement sans nouvelle requête, alertes (blocage,
  échec, baisse de volume, structure modifiée), suppression complète d'une source.
- Séparation stricte réel/démo (`PRICE_DATA`), provenance, date, lieu et licence affichés sur chaque prix.
- Statuts de fiabilité : vérifié, indicatif, communautaire, périmé, promotion confirmée.
- Promotions : publication, début et fin distincts ; actions futures ; régionales ; carte de fidélité ;
  prix dès N pièces, « X pour Y », pourcentages.
- Maintenant / planifier ; **signal « attendre serait moins cher »** fondé sur les actions annoncées.
- **Détours intelligents** : réoptimisation conjointe, économie brute, articles ajoutés, km, minutes, coût
  du trajet, économie nette, seuil personnel, accepter/refuser avec recalcul.
- Administration : collectes et alertes, correspondances, anomalies, imports, journal, **indicateurs
  anonymes**.
- Lancement : verrou `waitlist`, prévisualisation par jeton, page d'attente, conditions provisoires, zone
  pilote.

## 6. Résultats des tests

| Suite | Résultat |
|---|---|
| Typage (6 paquets) | 0 erreur |
| Tests unitaires et d'intégration PostgreSQL | **133 / 133** |
| Parcours navigateur public (mobile Pixel 7 + bureau) | **4 / 4** |
| Parcours d'administration | **2 / 2** |
| Construction de production | Réussie |

Cas couverts par la mission 8 :

- panier réel multi-enseignes (vérifié sur l'API avec les données réelles) ;
- même référence en conditionnements différents ;
- promotions conditionnelles ; promotions futures ; prix périmés ;
- correspondances non fiables (suggérées jamais utilisées, refus explicites) ; paniers incomplets ;
  magasins fermés ;
- détours rentables et non rentables ; combinaison d'articles rendant un détour intéressant ;
- variation du coût au km ; limite du nombre de magasins ;
- enseigne sans données ; dégradation progressive (une source bloquée ou en panne n'arrête pas les autres ;
  les données précédentes sont conservées sans doublon).

Mobile : environ 200 Ko de JavaScript compressé par page ; comparaison d'un panier de 20 articles en
25 ms environ (serveur chaud), dont 18 ms de calcul.

## 7. Fonctions commerciales préparées (inactives)

- Offres gratuite (comparaison illimitée, planification, détours, listes) / premium (paniers enregistrés,
  alertes, suivi des actions, historiques, notifications, synchronisation, planification avancée).
- Paiement abstrait compatible Stripe, Datatrans, Payrexx : **désactivé**.
- Emplacements partenaires signalés et séparés du classement : **aucun configuré**. Aucun programme
  d'affiliation alimentaire vérifié pour les 8 enseignes.
- Indicateurs d'exploitation anonymes ; architecture de données agrégées B2B décrite, non développée.
- Plan d'affaires avec scénarios et seuils (`docs/BUSINESS_PLAN.md`), étude de marché (`docs/MARCHE.md`).

## 8. Coûts techniques identifiés (hypothèses)

- Exploitation : **~CHF 13 à 172 / mois** (serveur, base, itinéraires, sauvegardes, courriel, domaine).
- Collecte actuelle : quasi nulle (même serveur, ~37 Mo/jour).
- Fournisseur tiers de données (non recommandé) : ~EUR 864 / mois pour Migros + Coop + Aldi.
- Ponctuel : avis juridique CHF 3 000–8 000, dépôt de marque ~CHF 450 (à vérifier), domaine ~CHF 10–20 / an.
- Seuil de rentabilité (scénario central, hors temps de l'exploitant) : ~14 000 utilisateurs actifs mensuels.

## 9. Blocages nécessitant votre intervention

1. **Accords de données** avec Migros, Coop, Aldi Suisse et Denner (puis OTTO'S, Aligro) : aucun contact
   n'a été pris ; un modèle de demande existe (`docs/audit/02-juridique.md` §8).
2. **Avis juridique** : collecte Lidl (LCD art. 5 let. c), ODbL, comparaisons, conditions d'utilisation,
   nom.
3. **Nom et domaine** : recherche Swissreg/Zefix par un conseil ; décision d'acheter `tesprix.ch` (libre au
   28.09.2026) ou non.
4. **Informations de l'exploitant** : raison sociale, adresse, contact et hébergeur (mentions légales,
   confidentialité, agent HTTP de collecte).
5. **Hébergement** : choix de l'hébergeur (Suisse/UE), planification des tâches, sauvegardes.
6. **Décisions commerciales** : premium (prix, prestataire de paiement), ouverture de la liste d'attente.

## 10. Étapes restantes avant d'ouvrir TesPrix.ch

1. Envoyer les demandes d'accord ; intégrer les flux obtenus (connecteur `officialFeed` prévu).
2. Obtenir l'avis juridique et compléter les textes légaux.
3. Déployer en `PUBLIC_ACCESS=waitlist`, `PRICE_DATA=live`, avec les tâches planifiées actives.
4. Compléter la revue des correspondances pour le panier pilote (≥ 40 références par enseigne couverte).
5. Pilote fermé en Suisse romande (jeton de prévisualisation), mesure des indicateurs.
6. Ouvrir (`PUBLIC_ACCESS=open`), puis la liste d'attente avec confirmation par courriel.
7. Ensuite : OSRM, comptes et premium, allemand et italien.

Liste de contrôle détaillée : `docs/LANCEMENT.md`.
