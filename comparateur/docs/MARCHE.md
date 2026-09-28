# Étude de marché, modèle freemium et revenus (mission 4)

> État au 28.09.2026. **Documenté** = vérifié sur une source publique citée. **Supposé** = hypothèse de
> travail non vérifiée. Aucun contact n'a été pris avec les acteurs cités.

## 1. Concurrence

| Service | Ce qu'il fait | Couverture | Provenance des prix | Modèle économique | Statut |
|---|---|---|---|---|---|
| **Schnäppchen Jäger** ([preise.zzd.ch](https://preise.zzd.ch/fr)) | Recherche d'articles et comparaison du prix unitaire ; listes et alertes (payant) | Migros, Coop, Lidl, Aldi, Denner ; ~21 700 articles (07.09.2026) | Sites des enseignes, **prix en ligne**, relus chaque nuit (déclaré) | 5 recherches/jour gratuites, 20 avec compte ; **CHF 2/mois ou CHF 20/an** (Stripe) ; ni publicité ni affiliation | Documenté (pages « About », « Pricing », « Terms ») |
| **FoodAlly** ([foodally.ch](https://foodally.ch/en)) | Comparaison du panier hebdomadaire, historique des prix, vraies actions (référence 60 jours), extension de navigateur, PWA | 19 enseignes dont Migros, Coop, Aldi, Lidl, Denner, Volg, Spar | « Prix publics » relevés chaque jour (déclaré), historique depuis avril 2025 | Gratuit, sans publicité ni compte ; **revenus : accès payant aux données** (médias, recherche, protection des consommateurs, entreprises) | Documenté (page d'accueil) |
| **Rappn** ([rappn.ch](https://rappn.ch/en)) | Application : recherche d'offres, prix unitaires, listes partagées, alertes, cartes de fidélité, tickets de caisse | Migros, Coop, Aldi, Lidl, Denner, Aligro, OTTO'S | « Prospectus publics et sources des enseignes » ; **actions surtout, pas l'assortiment complet** (déclaré) | Gratuit, sans publicité ; exploitant Rappn GmbH (Zoug) | Documenté (page d'accueil) |
| **Profital** ([profital.ch](https://www.profital.ch/en)) | Prospectus numériques et offres locales | 100+ enseignes et marques | Prospectus fournis par les enseignes (réseau Offerista, La Poste) | Payé par les enseignes (diffusion publicitaire) ; gratuit pour l'utilisateur ; >1 million de téléchargements (communiqué Profital) | Documenté ([business.profital.ch](https://business.profital.ch/insights/1-million-downloads-der-profital-app)) |
| **Bring!** ([getbring.com](https://www.getbring.com/en/home)) | Liste de courses partagée | — | Offres ciblées d'enseignes sur la liste | Gratuit, produits sponsorisés intégrés, version premium sans publicité ; ~400 000 utilisateurs actifs mensuels en Suisse | Documenté (presse spécialisée : Horizont, persoenlich.com) |
| Agrégateurs d'actions (oferlo.ch, aktionis.ch…) | Listes des actions de la semaine | Nombreuses enseignes | Prospectus | Publicité | Supposé (non étudiés en détail) |
| Applications des enseignes (Migros, Coop, Lidl Plus) | Actions et coupons propres à l'enseigne | Une enseigne chacune | Enseigne | Fidélisation | Documenté (connu) |

**Constat** : le marché n'est pas vide. Trois comparateurs de prix alimentaires suisses gratuits ou à bas prix
existent en 2026. Aucun, d'après leurs pages publiques, ne combine :

1. le **coût global** d'un panier (produits + trajet + temps) sur **plusieurs magasins** avec un
   **itinéraire optimisé** et les **horaires d'ouverture** ;
2. la **planification à une date** fondée uniquement sur les **actions annoncées** (et le signal « attendre
   serait moins cher ») ;
3. des **détours chiffrés** (économie brute, trajet ajouté, économie nette, seuil personnel) ;
4. la **transparence prix par prix** (source, date, lieu du relevé, fiabilité), en **magasin** plutôt qu'en ligne.

C'est le positionnement de TesPrix. Faiblesse majeure à ce jour : **la couverture des prix** (voir
`docs/audit/03-sources-prix.md`). Schnäppchen Jäger, FoodAlly et Rappn déclarent couvrir Migros et Coop ;
TesPrix ne le fait qu'au travers de relevés communautaires rares.

## 2. Cibles

| Segment | Besoin | Valeur de TesPrix | Hypothèse de taille |
|---|---|---|---|
| Familles avec voiture, périurbain | Gros panier hebdomadaire, plusieurs magasins accessibles | Coût global + détour rentable | Cœur de cible (supposé) |
| Ménages à budget serré | Chaque franc compte | Classement honnête, promotions annoncées | Important (supposé) |
| Étudiants, citadins sans voiture | Petits paniers, à pied/vélo | Coût au km nul, magasins proches | Secondaire |
| Frontaliers et zones frontières | Comparaison large | Hors périmètre (enseignes suisses) | — |

## 3. Architecture freemium (implémentée, paiement inactif)

Code : `packages/core/src/entitlements.ts`, `apps/web/src/server/billing.ts`.

| Fonction | Gratuit | Premium |
|---|---|---|
| Comparaison (3 scénarios, itinéraire, horaires) | ✅ **illimitée** | ✅ |
| Planification à une date (actions annoncées) | ✅ 14 jours | ✅ 60 jours |
| Détours proposés, acceptation/refus | ✅ | ✅ |
| Liste de courses (navigateur, partage, impression) | ✅ | ✅ |
| Paniers enregistrés / récurrents | — | ✅ (compte) |
| Alertes de prix, suivi des actions futures | — | ✅ |
| Historique des prix et des économies | — | ✅ |
| Notifications, synchronisation entre appareils | — | ✅ |
| Planification avancée (meilleur jour de la semaine) | — | ✅ |

Principes : la version gratuite n'est **jamais bridée** sur la comparaison (différence avec Schnäppchen Jäger) ;
le premium vend de la **mémoire et du temps gagné**, pas un meilleur résultat. Le calcul est identique pour
tous.

Paiement : interface `BillingProvider` (paiement, webhooks, résiliation) avec fournisseur par défaut
**désactivé** (`BILLING_PROVIDER=none`). Compatible Stripe, Datatrans, Payrexx (TWINT via prestataire).
Aucun compte ni paiement n'est ouvert : il faut d'abord les CGU, la politique de confidentialité complétée et
la décision de l'exploitant (contrat avec le prestataire, TVA).

## 4. Étude de prix du premium

Référence de marché documentée : Schnäppchen Jäger à **CHF 2/mois ou CHF 20/an**, FoodAlly et Rappn gratuits.

| Tarif mensuel | Annuel (≈ 10 mois) | Lecture |
|---|---|---|
| CHF 2.90 | CHF 29 | Aligné sur le marché, conversion plus facile |
| CHF 3.90 | CHF 39 | Justifiable si alertes + planification avancée fonctionnent sur Migros/Coop |
| CHF 4.90 | CHF 49 | Difficile face à des concurrents gratuits, sauf économie démontrée > CHF 20/mois |

Recommandation (hypothèse) : **lancer sans premium**, mesurer l'économie moyenne réellement calculée par panier
(indicateur disponible), puis tester **CHF 2.90/mois – CHF 29/an**. La valeur perçue dépend de la couverture
Migros/Coop, aujourd'hui insuffisante.

## 5. Affiliation : vérification

| Enseigne | Programme d'affiliation pour les courses alimentaires en Suisse | Source |
|---|---|---|
| Migros | **Non trouvé.** Programme Awin « Migros Mobile CH » : télécommunications, hors alimentaire | [Awin, profil 11844](https://ui.awin.com/merchant-profile/11844) |
| Coop | Non trouvé | Recherche web (28.09.2026) |
| Lidl | **Non trouvé pour lidl.ch.** Programmes Awin de **Lidl Allemagne** (boutique, voyages, fleurs, photos) : non applicables à la Suisse sans confirmation. Lidl Suisse ne vend pas d'alimentaire en ligne | [Lidl DE](https://www.lidl.de/c/das-lidl-partnerprogramm/s10005552), [Awin Lidl DE](https://ui.awin.com/merchant-profile/13936) |
| Aldi Suisse, Denner, OTTO'S, Action, Aligro | Non trouvé | Recherche web (28.09.2026) |

**Conclusion** : aucune affiliation n'est supposée ni configurée. Un prix de magasin ne génère pas de
commission. Pistes réalistes, à confirmer avec les réseaux (Awin, Tradedoubler, Adtraction) : boutiques en
ligne non alimentaires (Lidl.ch non-food, Action), livraison (Migros Online, coop.ch), services annexes.

Support technique prêt (`packages/core/src/sponsored.ts`, `components/partner-slot.tsx`,
`data/commercial/placements.json`) :

- emplacements **séparés** des résultats, toujours signalés : « Annonce », « Partenaire », « Lien affilié » ;
- liens `rel="sponsored nofollow noopener"`, https uniquement, sans traceur tiers ;
- le moteur de comparaison **ne reçoit aucune donnée commerciale** : un partenariat ne peut pas modifier le
  classement (règle testée) ;
- aucun emplacement actif.

## 6. Données agrégées pour les professionnels (plus tard)

Offre possible, sur le modèle déclaré par FoodAlly : indices de prix par enseigne et catégorie, fréquence et
profondeur des actions, écarts régionaux.

- Sources utilisables : prix **collectés** (faits publics) et relevés Open Prices (ODbL : la base dérivée doit
  être partagée sous ODbL, donc **non vendable en exclusivité**). Les prix obtenus **sous accord** dépendront des
  termes de l'accord.
- **Jamais** de données personnelles : les indicateurs d'usage sont déjà anonymes et agrégés (aucun panier
  individuel conservé).
- Aucun développement spécifique à ce stade : la table des prix horodatés et l'export ODbL suffisent pour un
  prototype.

## 7. Partenariats de données à explorer (décision de l'exploitant)

| Acteur | Intérêt | Réserve |
|---|---|---|
| Migros, Coop, Aldi, Denner | Couverture complète, légitimité | Demande d'accord à envoyer (modèle : `docs/audit/02-juridique.md` §8) |
| FoodAlly | Vend l'accès à ses données (déclaré) | Chaîne de droits à vérifier ; coût inconnu ; concurrent partiel |
| Profital / Offerista | Prospectus officiels de 100+ enseignes | Offre B2B de diffusion, pas de données brutes publiques |
| Pepesto | API payante Migros/Coop/Aldi | Données collectées sur les sites des enseignes, **non recommandé** (voir `03-sources-prix.md` §5) |
