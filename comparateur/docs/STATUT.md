# Statut des fonctionnalités

Situation au 28 septembre 2026. Trois catégories, conformément au cahier des charges :
**opérationnel**, **dépend d'une source de données ou d'une autorisation**, **nécessite une
validation juridique**.

## ✅ Opérationnel

| Fonctionnalité | Détail |
|---|---|
| Localisation par code postal / localité | 4 073 localités officielles (swisstopo), recherche sans accents, géolocalisation facultative |
| Découverte des succursales | 2 955 succursales réelles (OpenStreetMap), rayon 5/10/20/30 km, enseignes absentes signalées et non proposées |
| Sélection / exclusion | Par enseigne et par succursale |
| Catalogue normalisé | 200 références, 18 catégories, filtres bio / origine suisse / labels / marque imposée |
| Panier | Recherche, suggestions, catégories, quantités, favoris, préférences par article, stockage local, sans compte |
| Comparaison | 3 scénarios, optimisation exacte (≤ 5 magasins), horaires à l'heure d'arrivée, coûts de trajet paramétrables, seuil d'économie |
| Maintenant / planifier | Promotions publiées uniquement, aujourd'hui vs date choisie, promotions qui commencent / expirent, aperçu sur 10 jours |
| Résultats | Totaux, économies (ou surcoût) transparents, distance, durée, trajet, articles manquants, statuts de fiabilité |
| Listes par magasin | Articles à cocher (conservés), partage, impression / PDF, liens de navigation (Google Maps, Apple Plans, geo:) |
| Import structuré | CSV / JSON validés (source et date obligatoires, prix TTC particuliers pour Aligro), simulation avant enregistrement |
| Connecteur par enseigne | 8 connecteurs, branchables sur un flux officiel sans modifier le reste |
| Qualité des données | Expiration des promotions, anomalies (prix périmés, sauts de prix, promotions incohérentes, prix unitaires aberrants), journal |
| Administration | Correspondances (validation humaine), anomalies, imports, journal d'audit, connexion sécurisée |
| SEO / PWA | URLs propres, métadonnées, sitemap, données structurées, manifeste, mode hors ligne des listes |
| Sécurité | CSP, HSTS, validation, limitation de débit, CSRF, secrets hors code, sessions signées |

## ⏳ Dépend d'une source de données ou d'une autorisation

| Élément | Situation | Prochaine étape |
|---|---|---|
| **Prix réels des enseignes** | Aucune API publique ; Migros, Coop et Aldi bloquent l'accès automatisé ; aucun accord | Demandes d'accès (modèle dans `docs/audit/02-juridique.md` §8) ; en attendant : relevés manuels documentés via l'import structuré |
| Promotions réelles | Idem (les calendriers sont réels, les promotions affichées sont fictives) | Idem |
| Itinéraires routiers précis | Estimation (vol d'oiseau × détour) | Héberger un serveur OSRM (variable `OSRM_URL`) |
| Succursales Action / Aligro | Couverture OSM partielle (5 et 7 points) | Import manuel des adresses publiques ou contribution à OSM |
| Horaires manquants | 24 % des succursales sans horaires dans OSM | Horaires présumés prudents appliqués et signalés ; compléter via OSM |
| Stocks en succursale | Aucune donnée | Non affiché (jamais affirmé) |

## ⚖️ Nécessite une validation juridique avant exploitation commerciale

- Applicabilité de l'OIP à un comparateur qui ne vend pas (pratiques déjà alignées par prudence).
- Portée de l'art. 5 let. c LCD pour des relevés manuels ou partiels de prix.
- Opposabilité des conditions d'utilisation des sites des enseignes.
- Usage des noms d'enseignes (usage référentiel, sans logo).
- Nom commercial définitif (recherche Swissreg / IPI).
- Mentions légales et politique de confidentialité : exploitant, hébergeur, transferts à l'étranger (champs « à compléter »).

## Avant l'ouverture publique avec des prix réels

1. Obtenir au moins une source autorisée ou organiser des relevés documentés.
2. `DEMO_DATA=false` puis `pnpm job purge-demo --confirm`.
3. Compléter les mentions légales et la politique de confidentialité.
4. Faire valider les points ⚖️ ci-dessus.
