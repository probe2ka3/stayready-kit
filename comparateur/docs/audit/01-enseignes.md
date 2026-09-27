# Audit des enseignes et des sources de données

> **Date de l'audit : 27 septembre 2026.** Toutes les informations ci-dessous ont été
> vérifiées à cette date sur les sources indiquées. Les calendriers promotionnels
> changent : ils **doivent être revérifiés** avant la mise en production et ensuite
> au minimum chaque trimestre (voir « Procédure de revue » en fin de document).
>
> Légende de fiabilité : ✅ vérifié sur source officielle · 🟡 vérifié sur source
> secondaire (presse, agrégateur) ou source officielle partiellement lisible ·
> ❓ non vérifié / à confirmer auprès de l'enseigne.

## 1. Constat principal : changement de calendrier en 2025-2026

Mes connaissances antérieures indiquaient un cycle promotionnel **mardi → lundi**
pour Migros, Coop et Denner. **Ce n'est plus le cas** :

| Enseigne | Ancien cycle | Nouveau cycle | Depuis | Source |
|---|---|---|---|---|
| Coop | mardi → lundi | **jeudi → mercredi** (Wochenend-Hits jeudi → dimanche) | annoncé le 21.01.2025 | 🟡 [foodaktuell.ch, 21.01.2025](https://www.foodaktuell.ch/2025/01/21/coop-aktionen-beginnen-neu-am-donnerstag) · communiqué officiel [coop.ch](https://www.coop.ch/de/unternehmen/medien/medienmitteilungen/2025/coop-passt-aktionen-noch-staerker-kund-innenbeduerfnissen-an.html) (page protégée contre l'accès automatisé, titre et résumé vérifiés via moteur de recherche) |
| Migros | mardi → lundi | **jeudi → mercredi** ; « Wochenend-Knaller » jeudi → dimanche (auparavant vendredi → samedi) | 05.02.2026 | 🟡 [Blick](https://www.blick.ch/wirtschaft/alles-zum-neuen-aktionsstart-das-musst-du-jetzt-wissen-migros-und-denner-aendern-das-regime-fuer-die-aktionstage-id21633123.html) · [corporate.migros.ch](https://corporate.migros.ch/de/news/migros-aktionen-starten-neu-am-donnerstag) (403 en accès automatisé, titre vérifié) |
| Denner | mardi → lundi | **jeudi → mercredi** | 05.02.2026 | 🟡 [Blick](https://www.blick.ch/wirtschaft/alles-zum-neuen-aktionsstart-das-musst-du-jetzt-wissen-migros-und-denner-aendern-das-regime-fuer-die-aktionstage-id21633123.html) · ✅ rubrique officielle [« Aktionen ab Donnerstag »](https://www.denner.ch/de/aktionen/aktionen-ab-donnerstag) |

Conséquence de conception : **aucun calendrier n'est codé en dur dans le moteur**.
Chaque promotion est stockée avec sa date de publication (`published_at`) et sa
période de validité (`valid_from` / `valid_to`) fournies par la source. Les
calendriers « types » ci-dessous ne servent qu'à la génération des données de
démonstration et au contrôle de cohérence des imports (alerte si une promotion
importée ne correspond pas au rythme habituel de l'enseigne).

## 2. Tableau de synthèse (8 enseignes)

| | Migros | Coop | Denner | Aldi Suisse | Lidl Suisse | OTTO'S | Action | Aligro |
|---|---|---|---|---|---|---|---|---|
| **Site officiel** | migros.ch | coop.ch | denner.ch | aldi-suisse.ch | lidl.ch | ottos.ch | action.com/fr-ch | aligro.ch |
| **Catalogue public en ligne** | ✅ oui (assortiment complet sur migros.ch, ex-Migros Online) | ✅ oui (coop.ch, ex-coop@home) | ✅ oui (assortiment + boutique vins) | 🟡 partiel (assortiment permanent + actions) | 🟡 partiel (sortiment.lidl.ch = non-alimentaire principalement) | 🟡 partiel (boutique en ligne, surtout non-alimentaire) | ✅ assortiment présenté avec prix | 🟡 prospectus et documents ; pas de boutique en ligne grand public mentionnée dans la FAQ |
| **Prix affichés en ligne** | ✅ | ✅ | ✅ | 🟡 sur les pages produit/actions | 🟡 sur les actions | 🟡 boutique en ligne | ✅ (prix, ancien prix, % de rabais sur les offres) | ❓ prix pros HT ; affichage TTC pour particuliers à confirmer |
| **Catalogue promotionnel** | Migros Magazin + « Migros Woche » (encarté), actions en ligne | Coopzeitung / Coopération / Cooperazione, actions en ligne | « Denner Woche » + actions en ligne | Brochure hebdomadaire + page Actions | « Lidl Aktuell » + PDF | « Wochenhits » + catalogues | Prospectus hebdomadaire + page « Offres de la semaine » | Prospectus régionaux (plus de 2000 actions/semaine selon Aligro) |
| **Publication habituelle** | mercredi (magazine distribué le mercredi depuis 02.2026) 🟡 | jeudi (Coopzeitung le jeudi) 🟡 | mercredi (Denner Woche) 🟡 | à l'avance : section « Kommende Aktionen » ✅ | à l'avance : section « Demnächst » plusieurs semaines avant ✅ | à l'avance : prospectus de la semaine suivante visible ✅ | offres à venir annoncées dans l'app ✅ | ❓ |
| **Début → fin des actions** | jeudi → mercredi 🟡 | jeudi → mercredi 🟡 | jeudi → mercredi ✅🟡 | deux vagues : **jeudi** (p. ex. jeu. 24.09 → dim. 27.09) et **lundi** (p. ex. lun. 28.09 → mer. 30.09) ✅ | deux vagues : **jeudi** et **lundi** ; dépliant hebdomadaire jeudi → mercredi ✅ | **mardi**, « solange Vorrat » (sans date de fin) ✅ | **mercredi → mardi** (p. ex. 23.09 → 29.09.2026) ✅ | semaine débutant le lundi (observé sur agrégateur) 🟡 à confirmer |
| **Promotions complémentaires** | Wochenend-Knaller (jeu → dim), coupons Cumulus/app, rabais multiples | Wochenend-Hits (jeu → dim), Supercard, bons | actions week-end, bons | SuperDeals, actions spéciales | Lidl Plus (coupons app, prix réservés à l'app) | actions en ligne exclusives | — | cartes Profi/Business (rabais pros, **exclus du périmètre**) |
| **Promotions publiées avant leur début** | 🟡 veille du début (magazine du mercredi) | 🟡 jour même (jeudi) ; aperçu possible en ligne | 🟡 veille (mercredi) | ✅ oui, section dédiée | ✅ oui, plusieurs semaines | ✅ oui, semaine suivante | ✅ oui (app) | ❓ |
| **Variations régionales** | ✅ **oui** : 10 coopératives régionales pouvant fixer leurs prix ; certaines succursales (ex. ~30 sur ~100 à Zurich) plus chères pour le frais et les comptoirs ([20min](https://www.20min.ch/story/in-der-gleichen-stadt-preise-bei-migros-je-teurer-die-lage-desto-teurer-die-frucht-103058154), [20min](https://www.20min.ch/story/preisdifferenzierung-ueberall-gleiche-preise-migros-kippt-goldkuesten-zuschlag-103222035)) | 🟡 possibles selon la presse ([20min](https://www.20min.ch/story/coop-und-migros-andere-preise-je-nach-region-337952957247)) — à confirmer | ❓ supposées nationales | 🟡 nationales ; disponibilité variable par magasin | 🟡 nationales | ❓ | ❓ | ✅ produits régionaux et prospectus par région |
| **Accès automatisé (constat technique)** | robots.txt interdit `*/promotion/`, `*/offers/instore/`, `*/offers/coupons/` | **403** (protection anti-bot) même sur robots.txt | robots.txt permissif (hors checkout / listes) | **403** (protection Akamai) même sur robots.txt | robots.txt permissif sur lidl.ch ; `sortiment.lidl.ch` : `Disallow: /*?` | robots.txt : `Crawl-delay: 10` | robots.txt permissif (sitemaps) | robots.txt permissif (hors admin/panier) |
| **API / flux officiel** | ❌ aucune API publique documentée (réponse de la communauté [Migipedia](https://migipedia.migros.ch/en/forum/migipedia/is-there-an-api-for-migros-product-data)) | ❌ aucune connue | ❌ aucune connue | ❌ aucune connue | ❌ aucune connue | ❌ aucune connue | ❌ aucune connue | ❌ aucune connue |
| **Stratégie de connecteur retenue** | Demande d'accord / flux partenaire ; en attendant : import structuré | idem | idem | idem | idem | idem | idem | idem, **prix particuliers TTC uniquement** |

Remarques transversales :

- **Aucune enseigne ne publie d'API ou de flux ouvert** pour les prix. Des services
  tiers (scrapers commerciaux) existent mais ne constituent pas des sources
  autorisées par les enseignes : **ils ne sont pas utilisés**.
- Migros, Coop et Aldi opposent des protections techniques à l'accès automatisé
  (403 / pages interdites dans robots.txt). **Le projet ne contourne aucune de ces
  protections** (voir analyse juridique, art. 143bis CP et LCD).
- « Jusqu'à épuisement du stock » (« solange Vorrat ») est la règle pour Aldi, Lidl,
  OTTO'S, Action et une partie des actions des autres enseignes : l'application
  **n'affirme jamais** la disponibilité en succursale.
- Les actions liées à une carte ou une application (Cumulus, Supercard, Lidl Plus)
  ne sont appliquées que si l'utilisateur indique disposer du programme concerné.

## 3. Fiches par enseigne

### 3.1 Migros
- Site : https://www.migros.ch — assortiment et prix en ligne ; promotions en ligne.
- Cycle : jeudi → mercredi depuis le 05.02.2026 ; Wochenend-Knaller jeudi → dimanche.
- Publication : Migros Magazin avec « Migros Woche » distribué le mercredi (veille du début).
- Régions : 10 coopératives (Aare, Bâle, Genève, Lucerne, Neuchâtel-Fribourg,
  Suisse orientale, Tessin, Vaud, Valais, Zurich) ([corporate.migros.ch](https://corporate.migros.ch/de/ueber-uns/organisation/genossenschaften)).
  Les prix peuvent différer par coopérative et, pour le frais, par succursale.
  → Le modèle de données gère des **zones de prix** et des prix **par succursale**.
- Formats exclus en V1 : migrolino (franchise, prix différents), Migros Partner /
  VOI (commerces indépendants), teo (magasins autonomes), outlets.
- robots.txt : interdit notamment `*/promotion/`, `*/offers/instore/`, `*/offers/coupons/`.

### 3.2 Coop
- Site : https://www.coop.ch — assortiment et prix en ligne.
- Cycle : jeudi → mercredi depuis janvier 2025 ; Wochenend-Hits jeudi → dimanche ;
  Coopzeitung le jeudi.
- Accès automatisé bloqué (403). Aucune collecte automatisée n'est prévue sans accord.
- Formats exclus en V1 : Coop Pronto (franchise), Coop to go, Coop Bau+Hobby,
  stations-service. Coop City (rayon alimentaire) est inclus.

### 3.3 Denner
- Site : https://www.denner.ch — rubrique officielle « Aktionen ab Donnerstag ».
- Cycle : jeudi → mercredi depuis le 05.02.2026 ; « Denner Woche » le mercredi.
- Formats exclus en V1 : Denner Satellit (détaillants indépendants partenaires).

### 3.4 Aldi Suisse
- Site : https://www.aldi-suisse.ch — pages « Aktuelle Aktionen » et « Kommende Aktionen ».
- Deux vagues hebdomadaires : jeudi (jusqu'au dimanche) et lundi (jusqu'au mercredi) —
  exemples relevés le 27.09.2026 : 24.09 → 27.09 et 28.09 → 30.09.
- Mention « solange der Vorrat reicht ». Prix nationaux (aucune variation régionale indiquée).
- Accès automatisé bloqué (403).

### 3.5 Lidl Suisse
- Site : https://www.lidl.ch — sections « ab Donnerstag », « ab Montag » et « Demnächst »
  (aperçu sur plusieurs semaines). Prospectus PDF : https://www.lidl.ch/c/de-CH/werbeprospekte-als-pdf/s10019683
- Prix « Lidl Plus » réservés aux utilisateurs de l'application → drapeau `loyalty_program`.

### 3.6 OTTO'S
- Site : https://www.ottos.ch/de/prospekte — « Wochenhits gültig ab 22. September
  solange Vorrat » (mardi) ; prospectus de la semaine suivante déjà visible.
- Pas de date de fin : l'application utilise la date de début de la vague suivante
  comme fin **présumée**, avec statut « fin non garantie ».
- robots.txt : `Crawl-delay: 10`.

### 3.7 Action
- Site : https://www.action.com/de-ch/wochenangebote/ — « Wochenangebote » du mercredi
  au mardi (relevé : 23.09 → 29.09.2026), prix actuel + ancien prix + % de rabais.
- Réseau suisse encore restreint (12 magasins annoncés en avril 2026 selon la presse)
  → couverture OpenStreetMap partielle (3 magasins cartographiés le 27.09.2026).
- Assortiment principalement non alimentaire (entretien, hygiène, ménage).

### 3.8 Aligro
- Site : https://www.aligro.ch — ouvert à tous : « ALIGRO steht allen offen »
  ([FAQ](https://www.aligro.ch/pages/de/faq-2/)). Carte client **obligatoire à Berne
  et Pratteln** « pour des raisons légales ».
- 14 marchés (Suisse romande et alémanique). Prospectus régionaux.
- Les prix professionnels sont affichés **hors TVA** ; les cartes Profi/Business
  donnent des rabais permanents réservés aux professionnels.
  → **Seuls les prix TTC accessibles aux particuliers sans carte professionnelle
  sont admis** (règle de validation dans l'import : champ `audience = consumer`,
  `vat_included = true` obligatoires pour Aligro).
- Couverture OpenStreetMap partielle (2 marchés cartographiés) → import manuel des
  succursales depuis les informations publiques à compléter.

## 4. Données géographiques (sources ouvertes retenues)

| Donnée | Source | Licence / conditions | Statut |
|---|---|---|---|
| Codes postaux, localités, coordonnées | swisstopo — Répertoire officiel des localités (CSV WGS84) : https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ | OGD swisstopo : utilisation libre, y compris commerciale, **mention « Source : Office fédéral de topographie swisstopo » obligatoire** ([conditions](https://www.swisstopo.admin.ch/fr/conditions-utilisation-geodonnees-et-geoservices-gratuit)) | ✅ intégré (5 718 localités) |
| Succursales (adresse, coordonnées, horaires) | OpenStreetMap via l'instance Overpass de l'association suisse OSM (overpass.osm.ch) | **ODbL 1.0** : attribution « © les contributeurs d'OpenStreetMap », partage à l'identique de la base dérivée si elle est redistribuée | ✅ intégré (≈ 2 900 magasins retenus sur 3 370 points) |
| Itinéraires routiers | Estimation interne (distance à vol d'oiseau × facteur de détour) ; fournisseur OSRM compatible configurable | — / selon fournisseur | ✅ estimation ; 🔧 OSRM auto-hébergé recommandé en production |

Couverture OSM relevée le 27.09.2026 (points `shop=*` avec marque) : Coop 806 + 63,
Denner 688 + 50, Migros 640 + 19, Lidl 176 + 9, Aldi 132 + 62 + 18 + 12, OTTO'S 75 + 26,
Action 3, Aligro 2. 2 620 points sur 3 370 renseignent des horaires (`opening_hours`).

## 5. Méthode de récupération retenue (par ordre de priorité)

1. **API ou flux officiel autorisé** — aucun n'existe publiquement. Les connecteurs
   `migros`, `coop`, … exposent un emplacement `officialFeed` prêt à être branché.
2. **Accord avec l'enseigne** — courrier type proposé dans `docs/audit/02-juridique.md` §8.
3. **Autres méthodes compatibles** — relevé manuel de prix en magasin ou sur les pages
   publiques par une personne (pas de reproduction technique massive), avec source et
   date ; contributions vérifiées.
4. **Import structuré** (CSV/JSON) — format documenté dans `docs/DONNEES.md`, avec
   source, date de vérification et portée (nationale / zone / succursale) obligatoires.

En l'absence d'accord, **la plateforme fonctionne avec des données de démonstration
explicitement identifiées** (bandeau permanent, badge « Démo » sur chaque prix,
pages non indexées) et avec l'import structuré.

## 6. Procédure de revue

- Trimestrielle, ou dès qu'un import signale une promotion hors du rythme habituel.
- Vérifier pour chaque enseigne : jour de début, jour de fin, jour de publication,
  promotions liées à une carte, conditions d'utilisation du site, robots.txt.
- Mettre à jour `data/reference/chains.ts` (champ `promoCalendar`) et ce document.
