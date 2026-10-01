# Publication des prix et demandes d'autorisation (version finale, **non envoyées**)

État au 01.10.2026. Aucune demande n'a été envoyée : l'envoi, s'il a lieu, est fait par l'exploitant,
depuis sa propre adresse. Aucun avis juridique payant n'est prévu.

## 1. Collecter n'est pas publier

| Source | Collecte automatique | Publication | Fondement |
|---|---|---|---|
| Lidl (`sortiment.lidl.ch`, `www.lidl.ch`) | oui | **aucune restriction identifiée** — ce n'est **pas** une autorisation | ni conditions d'utilisation du site (seules celles de Lidl Plus), ni clause de reproduction trouvée ; robots.txt respecté |
| Open Prices | oui | oui, sous ODbL (attribution, partage à l'identique) | licence ouverte |
| Relevés en magasin | — | oui (faits constatés, local) | données propres |
| Aldi (`api.aldi-suisse.ch`) | usage privé | **non** | conditions : services « à des fins privées uniquement » |
| Denner (`www.denner.ch`) | usage privé | **non** | précisions juridiques : reproduction et publication interdites sans accord écrit |
| Coop (journal numérique) | usage privé | **non, en attente** | mentions de la Coopzeitung sans clause ; conditions de coop.ch illisibles pour un robot (DataDome) : prudence |
| Migros | aucune | — | site refusé aux robots (403), API non ouverte |

Garde-fous en place : instantanés privés dans `data/private/` (hors dépôt) ; matrice et page publiques
caviardées ; API web : sources restreintes exclues en production (`NODE_ENV=production`), vérifié le
01.10.2026 sur une construction de production (Aldi, Denner et Coop absents ; présents seulement en
aperçu local `pnpm dev`) ; workflow : échec si un identifiant de source restreinte apparaît dans la page
ou si un instantané privé est présent ; test `apps/worker/test/privacy.test.ts` : échec si un fichier
versionné contient un prix d'article Aldi, Denner ou Coop, un instantané restreint ou `data/private/`.

## 2. Lidl : le point juridique ouvert

- **Établi** : aucune condition d'utilisation du site ne restreint la lecture ni la réutilisation ;
  robots.txt autorise les pages lues (`Disallow: /catalog/` ne vise pas `/fr/catalog/…` au sens de la
  RFC 9309, mais l'intention de l'éditeur est incertaine) ; seuls des faits sont repris (désignation,
  contenance, prix, dates, lien), jamais les textes descriptifs ni les images.
- **Non établi** : une autorisation. Le risque principal est la LCD, art. 5 let. c (reprise d'un
  résultat de travail prêt à être mis sur le marché, par un procédé technique de reproduction, sans
  effort correspondant). Une publication large et systématique de l'assortiment l'expose davantage
  qu'un comparateur de 50 aliments citant la source.
- **Sans dépense** : (1) demande écrite gratuite (§ 3.5) ; (2) en attendant, publier seulement des faits,
  source et date, avec lien vers Lidl, et retirer sur simple demande ; (3) option de repli : désactiver
  les fiches `/fr/catalog/…` (`LIDL_PRODUCT_PAGES_PER_RUN=0`, 32/50 au lieu de 47/50). La décision de
  publier reste celle de l'exploitant.

## 3. Demandes prêtes à copier

À envoyer par le formulaire « Contact » / service clientèle du site officiel de chaque enseigne (pour
Denner : <https://www.denner.ch/fr/services/service-a-la-clientele-denner>), en demandant une
transmission au service juridique ou communication. Remplacer les crochets ; ne rien ajouter qui ne soit
pas vrai.

### 3.1 Aldi Suisse

> **Objet : Autorisation de réutiliser les prix publics de votre site dans un comparateur gratuit**
>
> Madame, Monsieur,
>
> Je développe TesPrix, un comparateur gratuit, sans publicité ni revente de données, du prix de 50
> aliments de base en Suisse ([adresse du projet, si publique]). Vos conditions d'utilisation réservent
> les services du site à des fins privées ; c'est pourquoi les prix Aldi ne sont aujourd'hui ni publiés
> ni partagés.
>
> Je vous demande l'autorisation d'afficher publiquement, pour ces 50 aliments, la désignation, la
> contenance, le prix et les dates d'action publiés par la liste d'articles de votre site
> (`api.aldi-suisse.ch/v3/product-search`), avec la mention de la source, la date de chaque prix et un
> lien vers votre site. La lecture est faite par un robot identifié (« TesPrixBot »), une fois par jour,
> environ 45 requêtes espacées de 3 secondes. Je retirerai vos données sur simple demande. Un fichier ou
> un flux officiel me conviendrait encore mieux.
>
> Pouvez-vous me dire si cet usage est accepté, et à quelles conditions ?
>
> Avec mes salutations, [Prénom Nom], [adresse e-mail]

> **Betreff: Erlaubnis zur Weiterverwendung öffentlicher Preise Ihrer Website in einem kostenlosen Preisvergleich**
>
> Sehr geehrte Damen und Herren
>
> Ich entwickle TesPrix, einen kostenlosen Preisvergleich ohne Werbung und ohne Datenverkauf für 50
> Grundnahrungsmittel in der Schweiz. Ihre Nutzungsbedingungen beschränken die Website auf private
> Zwecke; deshalb werden Aldi-Preise derzeit weder veröffentlicht noch weitergegeben.
>
> Ich bitte um Ihre Erlaubnis, für diese 50 Lebensmittel Bezeichnung, Inhalt, Preis und Aktionsdaten aus
> der Artikelliste Ihrer Website öffentlich anzuzeigen – mit Quellenangabe, Datum jedes Preises und Link
> zu Ihrer Website. Das Abrufen erfolgt durch einen gekennzeichneten Bot („TesPrixBot“), einmal täglich,
> rund 45 Anfragen im Abstand von 3 Sekunden. Auf Wunsch entferne ich Ihre Daten sofort. Eine offizielle
> Datei oder ein Datenfeed wäre noch besser.
>
> Ist diese Nutzung erlaubt, und zu welchen Bedingungen?
>
> Freundliche Grüsse, [Vorname Name], [E-Mail-Adresse]

### 3.2 Denner

> **Objet : Accord écrit pour citer vos prix publics dans un comparateur gratuit**
>
> Madame, Monsieur,
>
> Vos précisions d'ordre juridique soumettent la reproduction et la publication du contenu de denner.ch
> à un accord préalable écrit. Je développe TesPrix, un comparateur gratuit, sans publicité ni revente de
> données, du prix de 50 aliments de base ; les prix Denner n'y sont pas publiés.
>
> Je sollicite votre accord écrit pour afficher, pour ces 50 aliments, la désignation, la contenance, le
> prix et les dates d'action publiés sur denner.ch, avec la source, la date de chaque prix, la mention
> « seuls les prix affichés en magasin font foi » et un lien vers votre site. La lecture est faite par un
> robot identifié, une fois par jour, environ 55 pages espacées de 3 secondes. Retrait sur simple demande.
>
> Avec mes salutations, [Prénom Nom], [adresse e-mail]

> **Betreff: Schriftliche Zustimmung zur Nennung Ihrer öffentlichen Preise in einem kostenlosen Preisvergleich**
>
> Sehr geehrte Damen und Herren
>
> Gemäss Ihren rechtlichen Hinweisen ist die Wiedergabe und Veröffentlichung von Inhalten von denner.ch
> nur mit vorgängiger schriftlicher Zustimmung erlaubt. Ich entwickle TesPrix, einen kostenlosen
> Preisvergleich ohne Werbung und ohne Datenverkauf für 50 Grundnahrungsmittel; Denner-Preise werden
> dort nicht veröffentlicht.
>
> Ich bitte um Ihre schriftliche Zustimmung, für diese 50 Lebensmittel Bezeichnung, Inhalt, Preis und
> Aktionsdaten von denner.ch anzuzeigen – mit Quelle, Datum jedes Preises, dem Hinweis „massgebend sind
> die Preise in der Filiale“ und Link zu Ihrer Website. Abruf durch einen gekennzeichneten Bot, einmal
> täglich, rund 55 Seiten im Abstand von 3 Sekunden. Entfernung jederzeit auf Wunsch.
>
> Freundliche Grüsse, [Vorname Name], [E-Mail-Adresse]

### 3.3 Coop

> **Objet : Actions de la semaine (journal numérique) et prix permanents dans un comparateur gratuit**
>
> Madame, Monsieur,
>
> Je développe TesPrix, un comparateur gratuit, sans publicité ni revente de données, du prix de 50
> aliments de base. Deux questions :
>
> 1. Le « Magazine des actions » de Coopération est accessible publiquement sur epaper.cooperation.ch.
>    Puis-je afficher, pour ces 50 aliments, la désignation, le prix d'action, le prix « au lieu de » et
>    les dates de validité qui y sont imprimés, avec la source, l'édition régionale et un lien ? La
>    lecture est faite une fois par semaine par un robot identifié.
> 2. coop.ch refuse l'accès aux robots ; je ne le contourne pas. Existe-t-il un fichier ou un flux
>    officiel des prix permanents que je pourrais utiliser aux mêmes conditions ?
>
> Retrait sur simple demande. Avec mes salutations, [Prénom Nom], [adresse e-mail]

> **Betreff: Wochenaktionen (E-Paper) und Normalpreise in einem kostenlosen Preisvergleich**
>
> Sehr geehrte Damen und Herren
>
> Ich entwickle TesPrix, einen kostenlosen Preisvergleich ohne Werbung und ohne Datenverkauf für 50
> Grundnahrungsmittel. Zwei Fragen:
>
> 1. Das „Aktionsmagazin“ der Coopzeitung ist öffentlich im E-Paper zugänglich. Darf ich für diese 50
>    Lebensmittel Bezeichnung, Aktionspreis, „statt“-Preis und Gültigkeitsdaten mit Quelle,
>    Regionalausgabe und Link anzeigen? Das Abrufen erfolgt einmal pro Woche durch einen gekennzeichneten Bot.
> 2. coop.ch sperrt Bots; ich umgehe das nicht. Gibt es eine offizielle Datei oder einen Datenfeed der
>    Normalpreise, die ich zu den gleichen Bedingungen nutzen dürfte?
>
> Entfernung jederzeit auf Wunsch. Freundliche Grüsse, [Vorname Name], [E-Mail-Adresse]

### 3.4 Migros

> **Objet : Accès aux prix publics pour un comparateur gratuit**
>
> Madame, Monsieur,
>
> Je développe TesPrix, un comparateur gratuit, sans publicité ni revente de données, du prix de 50
> aliments de base en Suisse. Votre équipe a indiqué sur Migipedia que l'API de données produits n'était
> pas ouverte pour l'instant, et migros.ch refuse l'accès à un robot identifié ; je ne contourne pas ces
> restrictions.
>
> Existe-t-il un moyen autorisé — fichier, flux, accès à l'API ou autorisation de lecture du site pour
> un robot identifié, une fois par jour, environ 50 pages — d'obtenir la désignation, la contenance, le
> prix et les actions de ces 50 aliments, par coopérative ? Chaque prix serait affiché avec sa source, sa
> date, sa région et un lien vers migros.ch ; retrait sur simple demande.
>
> Avec mes salutations, [Prénom Nom], [adresse e-mail]

> **Betreff: Zugang zu öffentlichen Preisen für einen kostenlosen Preisvergleich**
>
> Sehr geehrte Damen und Herren
>
> Ich entwickle TesPrix, einen kostenlosen Preisvergleich ohne Werbung und ohne Datenverkauf für 50
> Grundnahrungsmittel in der Schweiz. Ihr Team hat auf Migipedia mitgeteilt, dass die Produktdaten-API
> derzeit nicht geöffnet ist, und migros.ch sperrt gekennzeichnete Bots; ich umgehe diese Einschränkungen nicht.
>
> Gibt es einen erlaubten Weg – Datei, Feed, API-Zugang oder die Erlaubnis, die Website mit einem
> gekennzeichneten Bot einmal täglich (rund 50 Seiten) zu lesen –, um Bezeichnung, Inhalt, Preis und
> Aktionen dieser 50 Lebensmittel je Genossenschaft zu erhalten? Jeder Preis würde mit Quelle, Datum,
> Region und Link zu migros.ch angezeigt; Entfernung jederzeit auf Wunsch.
>
> Freundliche Grüsse, [Vorname Name], [E-Mail-Adresse]

### 3.5 Lidl Suisse (confirmation)

> **Objet : Confirmation — citation de vos prix publics dans un comparateur gratuit**
>
> Madame, Monsieur,
>
> Je développe TesPrix, un comparateur gratuit, sans publicité ni revente de données, du prix de 50
> aliments de base. Je n'ai trouvé aucune condition d'utilisation restreignant la réutilisation des
> informations de sortiment.lidl.ch, mais je préfère votre confirmation écrite avant toute publication.
>
> Seraient affichés, pour ces 50 aliments, la désignation, la contenance, le prix et les dates d'action
> publiés, avec la source, la date de chaque prix et un lien vers votre site — jamais vos textes ni vos
> images. La lecture est faite par un robot identifié, une fois par jour, environ 110 pages espacées de
> 3 secondes, dont des fiches `/fr/catalog/product/view/id/…` listées dans votre plan du site : merci de
> me dire si ces fiches doivent être exclues. Retrait sur simple demande.
>
> Avec mes salutations, [Prénom Nom], [adresse e-mail]

> **Betreff: Bestätigung – Nennung Ihrer öffentlichen Preise in einem kostenlosen Preisvergleich**
>
> Sehr geehrte Damen und Herren
>
> Ich entwickle TesPrix, einen kostenlosen Preisvergleich ohne Werbung und ohne Datenverkauf für 50
> Grundnahrungsmittel. Ich habe keine Nutzungsbedingungen gefunden, welche die Weiterverwendung der
> Angaben von sortiment.lidl.ch einschränken, bitte aber vor einer Veröffentlichung um Ihre schriftliche Bestätigung.
>
> Angezeigt würden für diese 50 Lebensmittel Bezeichnung, Inhalt, Preis und Aktionsdaten – mit Quelle,
> Datum jedes Preises und Link zu Ihrer Website, nie Ihre Texte oder Bilder. Abruf durch einen
> gekennzeichneten Bot, einmal täglich, rund 110 Seiten im Abstand von 3 Sekunden, darunter Seiten
> `/fr/catalog/product/view/id/…` aus Ihrer Sitemap: Bitte teilen Sie mir mit, ob diese ausgeschlossen
> werden sollen. Entfernung jederzeit auf Wunsch.
>
> Freundliche Grüsse, [Vorname Name], [E-Mail-Adresse]

## 4. Après une réponse

- Accord écrit : l'archiver hors dépôt, l'inscrire dans `docs/DROITS_DONNEES.md`, ajouter l'identifiant
  de la source à `AUTHORIZED_SOURCES` (production) et passer sa `publicUse` à l'état autorisé.
- Refus ou absence de réponse : la source reste privée ; rien ne change dans la collecte.
- Demande de retrait : retirer la source de la collecte (`<SOURCE>=off`) et des exports le jour même.
