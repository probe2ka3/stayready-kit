# Sécurité et confidentialité

## Mesures en place

| Domaine | Mesure | Où |
|---|---|---|
| Validation des entrées | Schémas zod stricts (bornes, formats, tailles), corps JSON limité à 64 ko | `apps/web/src/server/validation.ts`, `http.ts` |
| Injections SQL | Requêtes paramétrées (Drizzle, postgres.js) ; aucune concaténation SQL | `packages/db` |
| XSS | Rendu React échappé ; JSON-LD échappé (`<`) ; CSP stricte | `components/json-ld.tsx`, `next.config.ts` |
| En-têtes | CSP, HSTS (prod), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP | `next.config.ts` |
| CSRF | API : contrôle de l'en-tête `Origin` ; administration : Server Actions (contrôle d'origine intégré) + cookie `SameSite=Strict` | `http.ts`, `admin-actions.ts` |
| Limitation de débit | Fenêtre fixe par client (empreinte non réversible de l'IP) : comparaison 30/min, recherche 120/min, connexion admin 5 / 15 min | `rate-limit.ts` |
| Administration | Mot de passe haché scrypt (N=2¹⁵), comparaison à temps constant, session HMAC-SHA256 8 h, cookie HttpOnly / Secure / SameSite=Strict, contrôle dans `proxy.ts` **et** dans chaque page et action ; fermée si non configurée | `server/auth.ts`, `session.ts`, `proxy.ts` |
| Secrets | Uniquement par variables d'environnement ; `.env` ignoré par git ; `.env.example` sans valeur | `.env.example` |
| Journalisation | JSON structuré ; ni IP, ni position, ni panier ; journal d'audit des actions admin et des imports | `server/log.ts`, `audit_log`, `import_runs` |
| Téléversements | Admin uniquement, 10 fichiers × 5 Mo, extensions CSV/JSON, analyse sans exécution | `admin-actions.ts` |
| Conteneur | Image autonome, utilisateur non-root, sonde de santé | `Dockerfile` |
| Dépendances | `pnpm-lock.yaml`, `pnpm audit --prod` en CI, Dependabot hebdomadaire | `.github/` |
| Données tierces | Aucun script, police, CDN ou traceur tiers ; aucune collecte automatisée contournant une protection | — |

## Données personnelles (LPD)

- Aucun compte. Panier, favoris, préférences et listes : `localStorage` du navigateur uniquement.
- Position : code postal suffisant ; géolocalisation seulement sur action explicite ; transmise au
  serveur pour le calcul, **non enregistrée ni journalisée**.
- Liens de navigation (Google Maps, Apple Plans) : transmission des coordonnées au service choisi
  uniquement au clic de l'utilisateur.
- Politique de confidentialité : `/fr/confidentialite` (champs exploitant/hébergeur à compléter).

## Compromis documentés

- **CSP `script-src 'unsafe-inline'`** : nécessaire au rendu statique de Next.js sans nonce. Les pages
  n'incluent aucun script tiers et aucune donnée utilisateur n'est injectée dans du HTML brut. Pour
  supprimer `'unsafe-inline'`, passer à une CSP à nonce générée dans `proxy.ts` (rend toutes les pages
  dynamiques) — voir la documentation Next.js « Content Security Policy ».
- **Limitation de débit en mémoire** : suffisante pour une instance ; au-delà, stockage partagé.
- **`TRUST_PROXY`** : à activer uniquement derrière un proxy inverse qui réécrit `X-Forwarded-For`.

## Recommandations d'exploitation

1. Base de données : rôle applicatif sans droits de superutilisateur ; extensions créées par un
   administrateur ; TLS (`DATABASE_SSL=true`) hors réseau privé ; sauvegardes chiffrées.
2. Restreindre `/admin` au niveau du proxy inverse (liste d'adresses, VPN) en plus du mot de passe.
3. Renouveler `SESSION_SECRET` en cas de doute (invalide toutes les sessions).
4. Surveiller `/api/v1/health` et les journaux d'erreurs ; alerter sur les imports en échec.
5. Relancer l'audit juridique et de sécurité à chaque nouvelle source de données.
