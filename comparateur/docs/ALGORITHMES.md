# Algorithmes

Code : `packages/core/src/`. Tests : `packages/core/test/`.

## 1. Prix d'une ligne dans une enseigne (`pricing.ts`)

Pour chaque ligne du panier (référence normalisée × quantité) et chaque **profil de prix** :

1. **Candidats** : articles de l'enseigne liés à la référence par une correspondance **validée**.
2. **Filtres** : bio, origine suisse et labels exigés (par la référence, la ligne ou les préférences
   globales), marque imposée, même unité ; conditionnements différents seulement si autorisés.
3. **Observation de prix** : portée la plus précise (succursale > zone > national), prix non périmés
   d'abord, puis la plus récente ; jamais postérieure à l'instant du calcul.
4. **Paquets** : taille équivalente à ±10 % → un paquet par unité ; sinon nombre minimal de paquets
   couvrant la quantité (tolérance de 10 % d'un paquet). Exemple : 1 kg demandé, paquets de 500 g → 2.
5. **Promotions** : publiées (`published_at ≤ maintenant`), valables à la date des courses
   (`valid_from ≤ date ≤ valid_to`, dates Europe/Zurich incluses), dans la portée du profil, carte ou
   application possédée si requise. Types : prix, % (arrondi aux 5 centimes), « X pour Y », prix ou %
   dès N pièces. Non cumulables : la moins chère s'applique, seulement si elle est inférieure au prix normal.
6. **Statut** : démo · promotion confirmée · périmé (> 30 jours, > 90 jours pour un relevé communautaire ;
   exclu par défaut, et « périmé » même pour une date future) · indicatif (date future, vérifié il y a
   8-30 jours, ou **relevé communautaire**, jamais « vérifié ») · vérifié (source officielle ≤ 7 jours).
   La fiabilité (`official`, `survey`, `crowd`) est portée par chaque observation.
7. **Choix** : l'option la moins chère ; à égalité, la plus fiable puis la correspondance la plus stricte.

## 2. Profils de prix

Deux succursales ont le même profil si elles appartiennent à la même enseigne, à la même zone tarifaire
et n'ont pas de prix propre. Le nombre de profils dans un rayon est faible (typiquement 5 à 12) même
quand il y a des dizaines de succursales : l'optimisation porte sur les profils, puis choisit une
succursale par profil.

## 3. Optimisation panier + itinéraire (`optimizer.ts`)

Problème : choisir un ensemble de magasins, affecter chaque ligne à un magasin et ordonner la tournée
(départ → magasins → retour) — « Traveling Purchaser Problem », NP-difficile en général.

**Réduction exacte utilisée**

- Pour un ensemble S de profils, l'affectation optimale des lignes est triviale (chaque ligne dans le
  profil le moins cher de S, pas de contrainte de capacité).
- Un ensemble est **redondant** si un de ses profils n'est le moins cher pour aucune ligne : l'ensemble
  sans ce profil a le même coût d'achat et un trajet au plus aussi long (inégalité triangulaire). Les
  ensembles redondants sont écartés.

**Étapes**

1. Évaluation de chaque profil seul (scénario « un seul magasin »).
2. Énumération des ensembles de 1 à K profils (K = maximum demandé, plafonné à 5 ; au plus 16 profils
   retenus, les plus complets puis les moins chers).
3. **Élagage** : tri par couverture décroissante puis par borne inférieure
   `achats + max(aller-retour vers le profil le plus éloigné) (+ temps en magasin valorisé)` ; arrêt dès
   que la borne atteint la meilleure solution trouvée.
4. **Tournée** : programmation dynamique de Held-Karp généralisée sur (profils visités, dernière
   succursale), avec au plus 5 succursales candidates par profil (les plus proches, ouvertes le jour dit).
   Chaque transition vérifie l'ouverture à l'heure d'arrivée estimée pendant toute la durée de la visite.
   Complexité : O(2^m · n²) pour m profils et n succursales candidates (m ≤ 5, n ≤ 25).
5. **Scénarios**
   - *Prix le plus bas* : couverture, puis coût d'achat, puis coût du trajet.
   - *Coût global* : meilleur plan pour chaque nombre de magasins k, puis choix final par couverture puis
     `coût global + (k − 1) × seuil d'économie par magasin supplémentaire`.

**Vérification** : un test compare l'optimum à une recherche exhaustive (tous les ensembles, toutes les
succursales, tous les ordres) sur 40 instances aléatoires.

**Coût d'un trajet** : `km × coût/km + heures × valeur du temps` ; le temps en magasin n'est valorisé
que sur demande. Estimation par défaut : distance à vol d'oiseau × facteur de détour (voiture 1,3 ;
vélo 1,25 ; marche 1,2 ; transports publics 1,4), vitesse moyenne (38 / 15 / 4,5 / 20 km/h) et temps
d'accès fixe (3 / 1 / 0 / 8 min). Avec `OSRM_URL`, la matrice routière réelle est utilisée.

## 4. Horaires (`opening-hours.ts`, `holidays.ts`)

- Sous-ensemble de la syntaxe OSM `opening_hours` : jours, plages multiples, nuit, `off`, `PH`, dates
  (`Dec 24`), mois (`Jun-Aug`), fermetures datées (`2026 Sep 03-2026 Nov 05 closed`), règles
  additionnelles. Couverture mesurée : **99,7 %** des 2 246 horaires des succursales importées.
- Jours fériés : certains (Nouvel An, Ascension, 1er Août, Noël) → règles `PH` ; cantonaux possibles →
  état « inconnu » sauf horaire explicite pour la date.
- Succursale sans horaires : horaires présumés `Mo-Fr 08:00-18:30; Sa 08:00-17:00; Su off; PH off` ;
  fermée hors de ces plages, « non vérifiée » dans ces plages.

## 5. Planification

- La date est comprise entre aujourd'hui et +60 jours.
- Le coût « aujourd'hui » est recalculé pour la même affectation (mêmes magasins) afin d'isoler l'effet
  des promotions ; les promotions qui commencent et celles qui auront expiré sont listées.
- L'aperçu sur 10 jours utilise uniquement les promotions déjà publiées.

## 5 bis. « Attendre serait moins cher » (`compare.ts`, `computeWaitSignal`)

L'aperçu calcule, pour chaque jour de la date choisie à +9 jours, le coût des mêmes magasins avec les seules
promotions **déjà publiées**. Le signal s'affiche pour le jour le plus avantageux dans les 6 jours suivants si :
économie ≥ CHF 1 **et** ≥ 3 %, au moins une ligne en promotion ce jour-là, aucune ligne perdue. Les prix normaux
futurs restent les derniers prix connus (« indicatifs ») : aucun prix n'est supposé.

## 6 bis. Détours (`detours.ts`)

Pour un plan de référence P (magasin unique ou parcours optimisé) et chaque profil q absent de P qui est moins
cher sur au moins une ligne (ou fournit une ligne manquante) :

1. **Réoptimisation conjointe** : `optimize` restreint aux profils `P ∪ {q}`, q imposé, au plus |P| + 1
   magasins, seuil nul. Toutes les affectations et tous les ordres de visite sont considérés : ajouter q peut
   rendre un magasin de P inutile (il est alors signalé comme « rendu inutile »), et la succursale de q retenue
   est celle qui s'insère le mieux dans l'itinéraire (Held-Karp).
2. **Mesures**, sur le meilleur plan P' (même couverture au moins) :
   - économie sur les produits = Σ (coût dans P − coût dans P') sur les lignes présentes dans les deux ;
   - articles ajoutés = lignes absentes de P et trouvées grâce à q (montant séparé, jamais compté comme perte) ;
   - surcoût de trajet = (trajet + temps valorisé)(P') − (…)(P) ; km et minutes supplémentaires ;
   - **économie nette = économie sur les produits − surcoût de trajet**.
3. **Décision** : « proposé » si l'économie nette ≥ seuil de l'utilisateur (« économie minimale par magasin
   supplémentaire ») ; sinon « sous le seuil » (affiché pour information) ; « apporte des articles » si q couvre
   des lignes introuvables ailleurs ; les détours sans économie nette ne sont pas affichés.
4. **Accepter** : la succursale devient la seule candidate de son profil et le profil est imposé
   (`requiredProfiles`), avec un magasin de plus autorisé. **Refuser** : la succursale est exclue et le calcul
   refait sans elle.

Complexité : au plus (profils) × (sous-ensembles de |P| + 1 profils) évaluations, avec le cache d'itinéraires ;
moins de 20 ms sur les paniers réels testés.

## 6. Économies

`économie = Σ coût(référence) − Σ coût(scénario)` sur les lignes présentes dans les deux, moins
`(trajet + temps valorisé)(scénario) − (trajet + temps valorisé)(référence)`. Référence : enseigne
habituelle indiquée par l'utilisateur, sinon meilleur magasin unique. Un surcoût est affiché comme tel.

## 7. Limites connues

- Promotions croisées (plusieurs articles différents, seuil sur le total du panier) non gérées.
- Une ligne est achetée entièrement dans un seul magasin (pas de fractionnement d'une même ligne).
- L'optimiseur ne suggère pas d'augmenter une quantité pour déclencher une offre « 3 pour 2 ».
- Au-delà de 5 magasins ou 16 profils, la recherche est plafonnée (signalé à l'utilisateur).
- Le choix des 5 succursales candidates par profil est une heuristique (les plus proches du départ).
- Zones tarifaires Migros rattachées par canton (approximation des limites communales réelles).
- Régions Lidl déduites de la langue de la localité (swisstopo), à défaut du canton.
- Un prix communautaire relevé dans une succursale est généralisé à sa zone (Migros) ou au pays (autres
  enseignes) : toujours « indicatif », avec le lieu du relevé.
