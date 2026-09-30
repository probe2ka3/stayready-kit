# Préparation du lancement (mission 7)

## 1. Principe

Le service n'est **pas ouvert au public** tant que les données et les points juridiques essentiels ne sont
pas validés. En production, démarrer avec :

```bash
PUBLIC_ACCESS=waitlist            # seules la page d'attente et les pages d'information sont publiques
PREVIEW_TOKEN=<48 caractères aléatoires>   # accès de test : https://<domaine>/fr?acces=<jeton>
SIGNUP_ENABLED=false              # aucune adresse collectée
PRICE_DATA=live                   # jamais de données fictives en production
DEMO_DATA=false
```

Le verrou (`apps/web/src/proxy.ts`) redirige les pages de l'application vers `/fr/bientot` et répond 403
aux appels d'API. Le jeton de prévisualisation pose un cookie HttpOnly de 30 jours, comparé à temps constant.

## 2. Zone pilote

Suisse romande (`PILOT_CANTONS=GE,VD,NE,FR,VS,JU`), pour trois raisons :

1. langue française d'abord (interface prête ; allemand, italien, anglais structurés) ;
2. relevés Open Prices les plus nombreux (Morat, Neuchâtel, La Chaux-de-Fonds, Genève) ;
3. actions Lidl propres à la Romandie, déjà gérées.

L'architecture reste nationale : succursales et localités de toute la Suisse, régions Lidl, zones Migros.
Hors zone pilote, un message l'indique sans bloquer l'utilisateur.

## 3. Liste de contrôle d'ouverture

**Données**

- [ ] Au moins un accord (Migros, Coop ou Denner), une licence de repli (FoodAlly) ou décision assumée d'ouvrir
      avec Lidl + Aldi (98 références comparables au 30.09.2026)
- [ ] Collecte quotidienne active (`pnpm job daily`), alertes surveillées (`/admin/qualite`)
- [x] Correspondances revues pour le panier type du pilote (Lidl 194, Aldi 106 références)
- [ ] `pnpm job validate --strict` sans écart pendant 7 jours consécutifs
- [ ] `PRICE_DATA=live`, `DEMO_DATA=false`, `pnpm job purge-demo --confirm`

**Juridique**

- [ ] Avis juridique : collecte Lidl, API Aldi (clause « fins privées »), ODbL, comparaisons, OIP (`docs/STATUT.md` ⚖️)
- [ ] Mentions légales, confidentialité et conditions d'utilisation complétées (« À compléter »)
- [ ] Nom : recherche d'antériorité (Swissreg, Zefix), puis décision sur le domaine
- [ ] Agent HTTP de collecte avec contact de l'exploitant (`HTTP_USER_AGENT`)

**Technique**

- [ ] Hébergement en Suisse ou dans l'UE, TLS, sauvegardes quotidiennes testées
- [ ] `ADMIN_PASSWORD_HASH`, `SESSION_SECRET` forts ; `/admin` restreint au niveau du proxy
- [ ] Tests : `pnpm typecheck && pnpm test && pnpm test:e2e && pnpm test:e2e:admin`
- [ ] Contrôle mobile réel (Android et iOS) du parcours complet

**Ouverture**

- [ ] Phase pilote fermée (50–200 testeurs, jeton de prévisualisation), retours et indicateurs
- [ ] `PUBLIC_ACCESS=open` ; liste d'attente ouverte seulement avec confirmation par courriel

## 4. Ce qui reste volontairement désactivé

| Fonction | Variable | Condition d'activation |
|---|---|---|
| Facturation des offres professionnelles | `BILLING_PROVIDER=none` | Premiers clients, contrats, TVA (aucun paiement consommateur) |
| API professionnelle | `B2B_API_KEY_HASHES` vide | Contrat client, avis juridique sur la revente de prix |
| Tickets de caisse | `RECEIPTS_ENABLED=false` | Politique de confidentialité validée |
| Repli fournisseur tiers | `PRICE_FALLBACK_SOURCES` vide, `FOODALLY=off` | Licence FoodAlly souscrite par l'exploitant |
| Liste d'attente | `SIGNUP_ENABLED=false` | Confidentialité complétée, double confirmation |
| Emplacements partenaires | `data/commercial/placements.json` vide | Partenariat réel, signalé |
| Collecte Lidl | `LIDL_WEB` (actif par défaut) | Mettre `off` immédiatement si Lidl le demande |
| Collecte Aldi | `ALDI_API` (actif par défaut) | Mettre `off` immédiatement si Aldi le demande |
