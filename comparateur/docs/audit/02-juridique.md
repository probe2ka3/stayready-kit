# Analyse juridique préliminaire (droit suisse)

> **Avertissement.** Ce document est une analyse préliminaire rédigée pour cadrer la
> conception technique. **Il ne constitue pas un avis de droit.** Les points marqués
> ⚖️ doivent être validés par un·e avocat·e inscrit·e au registre avant toute
> exploitation commerciale. Textes consultés le 27.09.2026 dans leur version
> consolidée publiée sur Fedlex (liens ci-dessous).

## 1. Sources consultées

| Texte | RS | Version consultée | Lien officiel |
|---|---|---|---|
| Loi fédérale contre la concurrence déloyale (LCD) | 241 | état au 01.01.2025 | https://www.fedlex.admin.ch/eli/cc/1988/223_223_223/fr |
| Ordonnance sur l'indication des prix (OIP) | 942.211 | état au 01.01.2025 (révision du 30.10.2024) | https://www.fedlex.admin.ch/eli/cc/1978/2081_2081_2081/fr |
| Loi fédérale sur la protection des données (LPD) | 235.1 | état au 07.07.2025 | https://www.fedlex.admin.ch/eli/cc/2022/491/fr |
| Loi sur le droit d'auteur (LDA) | 231.1 | état au 01.07.2025 | https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/fr |
| Loi sur la protection des marques (LPM) | 232.11 | état au 01.07.2025 | https://www.fedlex.admin.ch/eli/cc/1993/274_274_274/fr |
| Code pénal (CP), art. 143bis | 311.0 | — | https://www.fedlex.admin.ch/eli/cc/54/757_781_799/fr |

Autorités et documents d'interprétation :
- SECO — Indication des prix, généralités : https://www.seco.admin.ch/fr/generalites-oip
- IPI — « Toutes les photos sont-elles protégées ? » : https://www.ige.ch/fr/proteger-votre-pi/droit-dauteur/utiliser-une-oeuvre/protection-des-photographies/toutes-les-photos-sont-elles-protegees
- PFPDT (Préposé fédéral à la protection des données et à la transparence) : https://www.edoeb.admin.ch/fr
- Tribunal fédéral, ATF 139 IV 17 (interprétation restrictive de l'art. 5 let. c LCD).
- swisstopo — conditions OGD : https://www.swisstopo.admin.ch/fr/conditions-utilisation-geodonnees-et-geoservices-gratuit
- OpenStreetMap — droits d'auteur et licence ODbL : https://www.openstreetmap.org/copyright

## 2. Synthèse : qu'est-ce qui est permis ?

| Activité | Qualification | Mesure dans le projet |
|---|---|---|
| Comparer des prix réels, exacts et datés de plusieurs enseignes | ✅ **Autorisé en principe**, à condition que la comparaison ne soit ni inexacte, ni fallacieuse, ni inutilement blessante, ni parasitaire (art. 3 al. 1 let. e LCD) | Prix sourcés et datés, méthode publiée, économies calculées sur des paniers comparables |
| Citer le nom des enseignes pour désigner leurs magasins | ✅ Usage référentiel / descriptif généralement admis ⚖️ | Noms en texte simple, **aucun logo**, mention de non-affiliation |
| Utiliser les logos des enseignes | 🔐 **Nécessite une autorisation** (LPM art. 13 ; logos potentiellement protégés aussi par la LDA) | Pastilles neutres avec initiales |
| Reprendre les photos de produits des sites des enseignes | 🔐 **Nécessite une autorisation** : toute photographie d'un objet tridimensionnel est protégée, même sans caractère individuel (art. 2 al. 3bis LDA, en vigueur depuis le 01.04.2020) | Aucune photo ; icônes de catégories |
| Collecter automatiquement les prix sur les sites (scraping) | 📄 **Dépend des conditions contractuelles et techniques** + ⚖️ **validation juridique** | Non implémenté ; connecteurs en attente d'accord ; import structuré |
| Contourner une protection technique (anti-bot, 403, authentification) | ⛔ **Exclu** (risque pénal art. 143bis CP si système « spécialement protégé » ; LCD) | Interdit par conception ; aucun contournement |
| Utiliser les données swisstopo (codes postaux) | ✅ Autorisé, y compris commercialement, **avec mention de la source** | Mention sur la page « Sources » et en pied de page |
| Utiliser les données OpenStreetMap (magasins) | ✅ Autorisé sous **ODbL** : attribution + partage à l'identique de la base dérivée redistribuée | Attribution « © contributeurs OpenStreetMap » ; base magasins sous ODbL |
| Traiter le code postal / la position de l'utilisateur | ✅ Autorisé dans le respect des principes LPD (art. 6, 7, 8, 19) | Minimisation, pas de compte, pas de stockage serveur, géolocalisation facultative |
| Afficher des économies « jusqu'à X % » | ⚠️ **Risque** si non vérifiable (art. 3 al. 1 let. b LCD ; art. 18 LCD) | Économies calculées panier par panier, formule publiée, jamais de promesse générique |

## 3. Loi contre la concurrence déloyale (LCD)

### 3.1 Comparaisons de prix — art. 3 al. 1 let. e
Texte : agit de façon déloyale celui qui « compare, de façon inexacte, fallacieuse,
inutilement blessante ou parasitaire sa personne, ses marchandises, ses oeuvres, ses
prestations ou ses prix avec celles ou ceux d'un concurrent **ou qui, par de telles
comparaisons, avantage des tiers par rapport à leurs concurrents** ».

La seconde partie de la phrase vise aussi un tiers (tel un comparateur) qui avantage
une enseigne par une comparaison inexacte. Exigences de conception retenues :
1. **Exactitude** : chaque prix est lié à une source et à une date de vérification ;
   un prix périmé est signalé et exclu par défaut du calcul.
2. **Comparabilité** : les produits ne sont comparés que s'ils sont équivalents
   (type, quantité, caractéristiques essentielles) ; les différences de conditionnement
   sont affichées ; les économies sont calculées **uniquement sur les articles
   disponibles dans les deux scénarios comparés**.
3. **Neutralité** : aucun classement payant, aucune mise en avant rémunérée.
   Si un partenariat commercial est conclu à l'avenir, il devra être signalé.
4. **Absence de dénigrement** : formulations factuelles (« CHF 3.40 de moins sur ce
   panier »), jamais « l'enseigne X est chère ».

### 3.2 Indications fallacieuses — art. 3 al. 1 let. b et art. 18
Interdiction d'indications inexactes ou fallacieuses sur les prix, y compris « par de
telles allégations, [avantager] des tiers ». L'art. 18 interdit les procédés propres à
induire en erreur pour indiquer des prix ou annoncer des réductions.
→ Un prix ancien ne peut **jamais** être présenté comme promotion actuelle ; une
promotion n'est appliquée que si la date des courses est comprise dans sa période
de validité (fuseau Europe/Zurich) et si elle a été publiée par la source.

### 3.3 Reprise d'une prestation d'autrui — art. 5 let. c
Texte : agit de façon déloyale celui qui « reprend grâce à des procédés techniques de
reproduction et sans sacrifice correspondant le résultat de travail d'un tiers prêt à
être mis sur le marché et l'exploite comme tel ».

- Les prix pris isolément sont des faits. En revanche, un catalogue structuré (noms,
  descriptions, photos, prix, promotions) peut constituer un « résultat de travail ».
  Sa reprise **systématique par procédé technique** (scraping massif) et son
  exploitation commerciale sans effort propre présentent un **risque au regard de
  l'art. 5 let. c** ⚖️.
- La jurisprudence interprète cette condition de manière plutôt restrictive
  (ATF 139 IV 17), et l'exigence d'un « sacrifice correspondant » laisse une marge
  d'appréciation. **Cette marge ne doit pas être considérée comme acquise** ⚖️.
- **Décision de conception** : pas de reproduction technique des catalogues des
  enseignes sans accord. Le catalogue normalisé (références standard, catégories,
  correspondances) est un travail propre au projet.

### 3.4 Indication des prix — art. 16, 16a, 17 LCD
Obligations imposées à celui qui **offre** des marchandises au consommateur et à la
publicité avec prix. Voir OIP ci-dessous.

## 4. Ordonnance sur l'indication des prix (OIP)

- **Champ d'application (art. 2)** : marchandises offertes au consommateur et
  « publicité s'adressant aux consommateurs pour l'ensemble des marchandises ».
- **Question ouverte ⚖️** : un comparateur indépendant qui ne vend rien est-il soumis
  à l'OIP en tant qu'auteur de « publicité » avec prix ? Par prudence, le projet
  applique les exigences de l'OIP comme si elles s'appliquaient :
  - **prix effectivement à payer en CHF, TVA et taxes incluses** (art. 3, 4) — d'où
    l'exclusion des prix professionnels HT (Aligro) ;
  - **prix unitaire** (par kg, litre, pièce) affiché pour chaque produit mesurable
    (art. 5 OIP, art. 16a LCD) ;
  - **spécification** claire : marque, type, quantité, caractéristiques (art. 14) ;
  - **avantages conditionnels** (cartes de fidélité, coupons) désignés séparément
    (art. 4 al. 3 par analogie) → drapeau « avec carte/app ».
- **Prix comparatifs (art. 16, révisé le 30.10.2024, en vigueur le 01.01.2025)** :
  l'autocomparaison (« au lieu de ») est réservée au **vendeur** qui a effectivement
  pratiqué le prix comparatif immédiatement avant, ou pendant au moins 30 jours
  consécutifs. → L'application **n'affiche un prix « au lieu de » que s'il provient
  de l'enseigne elle-même** (champ fourni par la source) ; elle ne fabrique pas
  d'ancien prix à partir de son historique. Les « économies » du comparateur sont
  présentées comme **écart entre scénarios**, pas comme réduction de prix.
- **Réductions de prix (art. 17)** : l'indication en chiffres d'une réduction est
  assimilée à un autre prix ; elle doit être exacte et spécifiée.
- **Sanctions** : amende jusqu'à CHF 20 000 selon le SECO (art. 24 LCD).

## 5. Protection des données (LPD)

Principes (art. 6), protection dès la conception et par défaut (art. 7), sécurité
(art. 8), devoir d'informer (art. 19). Mise en œuvre :

| Exigence | Mise en œuvre |
|---|---|
| Minimisation / par défaut (art. 6 al. 2-4, art. 7 al. 3) | Aucun compte ; code postal suffisant ; géolocalisation du navigateur uniquement sur action explicite ; panier, favoris et listes stockés **dans le navigateur** (localStorage) |
| Finalité (art. 6 al. 3) | La position n'est utilisée que pour calculer les magasins et l'itinéraire ; elle n'est ni stockée ni journalisée côté serveur (coordonnées arrondies à ~1 km dans les journaux techniques si nécessaire) |
| Sécurité (art. 8) | HTTPS/HSTS, en-têtes de sécurité, limitation des requêtes, validation des entrées, secrets hors code, accès admin protégé |
| Information (art. 19) | Page « Confidentialité » : responsable, finalités, destinataires (hébergeur, fournisseur d'itinéraire éventuel), transferts à l'étranger |
| Transfert à l'étranger (art. 16-17) | ⚖️ À documenter selon l'hébergeur choisi (préférence : hébergement en Suisse ou dans l'UE) |
| Sous-traitance (art. 9) | Contrat avec l'hébergeur et le fournisseur d'itinéraires |
| Liens vers Google Maps / Apple Plans | L'ouverture de l'itinéraire transmet les coordonnées au service choisi : action explicite de l'utilisateur, mentionnée dans la politique |

## 6. Droit d'auteur (LDA) et marques (LPM)

- **Photographies** : art. 2 al. 3bis LDA — « Sont considérées comme des œuvres les
  productions photographiques […] d'objets tridimensionnels, même si elles sont
  dépourvues de caractère individuel. » → **aucune photo de produit** sans licence.
- **Textes descriptifs** des enseignes : potentiellement protégés s'ils ont un
  caractère individuel (art. 2 al. 1) → le catalogue normalisé utilise des
  désignations génériques rédigées par le projet.
- **Prix, dates, adresses** : de simples faits ne sont pas des œuvres. La Suisse ne
  connaît pas de droit *sui generis* sur les bases de données comparable au droit
  européen ; la protection passe par la LCD (art. 5) et le contrat ⚖️.
- **Marques** (art. 13 LPM) : le titulaire a un droit exclusif d'usage « dans les
  affaires ». La mention du nom d'une enseigne pour désigner ses propres magasins et
  produits est un usage référentiel généralement admis s'il n'induit pas en erreur
  sur une affiliation ⚖️. → Noms en texte, mention « comparateur indépendant, sans
  affiliation », aucun logo, aucune reprise de charte graphique.
- **Nom du service** : « TesPrix » (auparavant « Cabas ») est un **nom provisoire** ; analyse préliminaire dans `docs/IDENTITE.md`. Une recherche d'antériorité
  (Swissreg / IPI) et de disponibilité du nom de domaine est requise avant lancement ⚖️.

## 7. Conditions d'utilisation des sites des enseignes

- Les conditions d'utilisation des sites (Nutzungsbedingungen / CGU) peuvent
  interdire l'extraction automatisée. Leur opposabilité à un simple visiteur
  (« browsewrap ») est discutée en droit suisse ⚖️, mais **le projet les respecte
  par principe**.
- Constats techniques (27.09.2026) : Coop et Aldi bloquent l'accès automatisé (403) ;
  Migros interdit dans robots.txt les pages de promotions (`*/promotion/`,
  `*/offers/instore/`) ; OTTO'S impose un délai de 10 s entre requêtes. Ces signaux
  sont interprétés comme une **absence d'autorisation** de collecte automatisée.
- Art. 143bis CP (accès indu à un système informatique « spécialement protégé ») :
  tout contournement d'une protection est exclu.
- **Phase 2 (28.09.2026)**, détail dans `03-sources-prix.md` : Denner renvoie aux mentions
  légales Migros, qui interdisent l'utilisation commerciale sans autorisation écrite → pas de
  collecte. Lidl : aucune clause d'interdiction trouvée, robots.txt permissif pour les pages
  catégories et actions → **collecte limitée aux faits, conforme à robots.txt**, sous réserve
  d'un avis juridique (LCD art. 5 let. c) avant l'ouverture publique. Open Prices : ODbL.

## 8. Recommandations et démarches avant exploitation commerciale

1. ⚖️ Faire valider par un·e avocat·e : applicabilité de l'OIP au comparateur ;
   portée de l'art. 5 let. c LCD pour un relevé manuel ou partiel ; opposabilité
   des CGU ; usage des noms d'enseignes.
2. 📨 Adresser à chaque enseigne une demande d'accès aux données (flux de prix et
   promotions, conditions d'usage, mention de la source). Modèle :

   > Objet : demande d'accès à vos données de prix et de promotions
   > Nous développons un comparateur de courses indépendant destiné aux consommateurs
   > suisses. Nous souhaitons afficher vos prix et actions de manière exacte, datée et
   > sourcée, sans logo ni photo, avec un lien vers votre site. Accepteriez-vous de
   > nous fournir un flux (API, fichier) ou de nous autoriser à relever vos prix
   > publics selon des modalités que vous définiriez (fréquence, pages, mention) ?
3. 🔎 Recherche de marque pour le nom définitif du service.
4. 🧾 Compléter les mentions légales (exploitant, adresse, contact) et la politique de
   confidentialité (hébergeur, sous-traitants, transferts).
5. 🔁 Revoir la présente analyse à chaque changement de source de données.

## 9. Ce que le projet fait dès maintenant

- Mention permanente : « Comparateur indépendant, sans affiliation avec les enseignes
  citées. »
- Mode démonstration : bandeau permanent « Prix fictifs de démonstration », badge
  « Démo » sur chaque prix, pages de résultats non indexées.
- Chaque prix : source, type de source, date de vérification, statut
  (vérifié / promotion confirmée / indicatif / périmé / démo).
- Méthode de calcul publiée (page « Méthode ») et formule des économies affichée à
  côté de chaque résultat.
- Attributions : swisstopo, OpenStreetMap (ODbL).
