# « Scanner mon ticket » : architecture

Objectif : obtenir des prix **en magasin** pour les enseignes dont aucune source first-party n'est
exploitable (Migros, Coop, Denner), à partir des tickets de caisse des utilisateurs, **sans collecter de
données personnelles** et sans jamais conserver le contenu d'un panier.

État : analyse et nettoyage implémentés (`packages/core/src/receipts.ts`, testés) ; page minimale
`/fr/ticket` (analyse dans le navigateur, **envoi désactivé**, `RECEIPTS_ENABLED=false`).

## 1. Parcours

```
Photo ou texte du ticket
   │  (sur l'appareil) reconnaissance de caractères locale — la photo ne quitte jamais l'appareil
   ▼
Texte brut ──► scrubReceiptText()  : suppression carte bancaire, IBAN, carte de fidélité, courriel,
   │                                 téléphone, nom du personnel, n° de transaction/terminal, heure
   ▼
parseReceiptText() : enseigne, date (jour seulement), succursale imprimée, lignes (désignation,
   │                  quantité, prix unitaire, remise, poids), total
   ▼
Écran de vérification (la personne voit exactement ce qui serait envoyé, peut retirer des lignes)
   │  consentement explicite, par ticket
   ▼
ReceiptSubmission (serveur)  : enseigne, succursale choisie sur la carte, date, lignes nettoyées
   │  file de revue ; rapprochement des désignations avec les articles connus (revue humaine au début)
   ▼
receiptObservations() : un relevé par article rapproché, indépendant (aucun identifiant de ticket),
   │                    fiabilité « communautaire », justificatif « ticket », 10:00 UTC le jour d'achat
   ▼
Suppression de la soumission après publication (au plus 30 jours après dépôt)
```

## 2. Modèle de données

| Entité | Champs | Conservation |
|---|---|---|
| `ReceiptSubmission` | `id`, `status` (extracted → submitted → reviewed → published / rejected), `chainId`, `storeId`, `purchaseDate` (jour), `lines[]` (désignation nettoyée, quantité, prix unitaire, remise, poids), `submittedAt` | Jusqu'à publication, **30 jours au plus** |
| `PriceObservation` (existant) | `source.kind = 'receipt'`, `connectorId = 'receipts'`, `reliability = 'crowd'`, `proof = 'receipt'`, `storeId`, `observedAt` | Comme les autres relevés (périmé après 90 jours) |
| Jeton de dépôt | Jeton anonyme à durée courte, limitation d'abus (nombre de tickets par jour) | 24 heures |

Jamais conservé : photo, texte brut, heure, montant total, moyen de paiement, numéro de carte de
fidélité, identité, compte, adresse, position précise, lien entre les articles d'un même ticket.

## 3. Protection des données (nLPD)

1. **Minimisation** : seules les données nécessaires au prix d'un article dans une succursale à une
   date sont retenues (art. 6 al. 2 nLPD).
2. **Traitement local d'abord** : lecture et nettoyage sur l'appareil ; rien n'est transmis sans
   action explicite.
3. **Dissociation** : chaque prix devient une observation indépendante ; le panier n'existe plus après
   publication (pas d'habitudes individuelles reconstituables).
4. **Aucune revente** de données personnelles ni de paniers ; les données agrégées B2B n'utilisent que
   des prix (voir `BUSINESS_MODEL_V2.md`).
5. **Transparence** : écran « Retiré avant tout envoi » ; politique de confidentialité à compléter
   avant ouverture (`RECEIPTS_ENABLED=true` seulement ensuite).

## 4. Qualité et abus

- Relevés « communautaires », jamais « vérifiés » ; périmés après 90 jours.
- Contrôles du moteur de données : prix hors bornes, variations brutales, divergence avec une source
  officielle (signalée, jamais tranchée en silence).
- Première phase : revue humaine des rapprochements désignation → article ; ensuite, validation
  automatique seulement pour les désignations déjà revues dans la même enseigne.
- Limitation par jeton anonyme ; rejet des tickets de plus de 30 jours ou datés dans le futur.

## 5. Suite

1. Reconnaissance de caractères sur l'appareil (bibliothèque locale, sans service tiers).
2. Choix de la succursale sur la carte (aucune géolocalisation automatique requise).
3. Table `receipt_submissions` et file de revue dans l'administration.
4. Validation juridique de la politique de confidentialité, puis `RECEIPTS_ENABLED=true`.
