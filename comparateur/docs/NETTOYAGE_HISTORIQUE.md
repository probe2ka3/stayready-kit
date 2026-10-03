# Retirer les données de sources privées de l'historique Git (procédure préparée, **non exécutée**)

Aucune réécriture d'historique ni poussée forcée n'a été faite. **Tant que cette procédure n'a pas été
appliquée, les anciennes données Aldi restent lisibles dans l'historique public de la branche
`claude/swiss-grocery-comparison-w7bk8q`.** Le nettoyage empêche leur diffusion future depuis ce dépôt ;
il **ne garantit pas** l'effacement des copies déjà récupérées (clones, archives, caches).

## 1. Périmètre (inventaire du 03.10.2026)

Commande (lecture seule, toutes les références) : `python3 comparateur/ops/historique/inventaire.py <dossier>`.
Elle applique les règles de `apps/worker/test/privacy.test.ts` à **chaque version** de chaque fichier
de l'historique et écrit `a-retirer.txt`, `a-expurger.txt` et `inventaire.md`.

Références publiques : `main` et `claude/swiss-grocery-comparison-w7bk8q` ; aucune demande de fusion
(pas de références `refs/pull/*`), aucune étiquette, aucun fork (`forks_count` = 0 le 03.10.2026).
`main` ne contient aucune de ces versions : elle n'est pas modifiée.

**Versions de fichiers de données à retirer entièrement (11)** :

| Fichier | Versions | Présent du commit … au commit … | Contenu |
|---|---|---|---|
| `comparateur/data/prices/live/aldi-api.json` | `fe967285`, `ef2c97e3`, `3c1336c9`, `9e430f8c` | `d1ea6fe` → `9b7ea3c` | instantanés de l'API Aldi (2 002 à 3 666 prix et actions) |
| `comparateur/data/demo/resultats.md` | `568561aa`, `68450b10`, `e0b0b331` | `5ab8401` → `ec0c932` | paniers d'exemple avec prix Aldi |
| `comparateur/data/demo/panier-noyau-prive.md` | `86d9a618` | `8e3f21f` → `9b7ea3c` | panier privé avec prix Aldi |
| `comparateur/data/matching/audit.md` | `26d8bac4` | `5ab8401` → `5ee8cae` | 47 lignes Aldi avec prix |
| `comparateur/data/matrice/essentiels.json` | `2ebbc361`, `b107e965` | `8e3f21f` → `ec0c932` | 21 et 22 cases Aldi avec prix (**ajoutées le 03.10.2026** : absentes de la version précédente de cette procédure) |

**Versions de documents à expurger (8)** : seuls les montants associés à Aldi ou à Denner sont masqués
(« [montant retiré] »), le reste du document est conservé :

| Fichier | Versions | Contenu |
|---|---|---|
| `comparateur/docs/RAPPORT_PHASE4.md` | 1 (`913b0e8` → `208b3bc`) | totaux et prix Aldi des paniers de Lausanne, Bulle, Genève |
| `comparateur/docs/COLLECTE_QUOTIDIENNE.md` | 4 (`5d4d8b5` → `208b3bc`) | totaux Denner et Aldi, prix Denner d'exemple |
| `comparateur/docs/PLAN_SANS_DEPENSES.md` | 2 (`9b7ea3c` → `208b3bc`) | total Aldi du panier privé |
| `comparateur/docs/RAPPORT_PHASE3.md` | 1 (`44b77c5` → `208b3bc`) | totaux Aldi du panier de Lausanne |

Ces montants ont été retirés de la version actuelle le 03.10.2026 (commit de cette étape) ; le test
`privacy.test.ts` contrôle désormais aussi la documentation. Les décisions de correspondance
(`reviewed.json`) et le jeu de validation ne contiennent pas de prix et restent.

**Hors historique Git** (non traité par la réécriture) :

- artefacts `tesprix-page-publique` du dépôt public : l'artefact 11126610801 (exécution du 30.09.2026 sur
  `9b7ea3c`, période où le dépôt contenait encore `aldi-api.json`) contient la matrice de cette date ;
  son contenu n'a pas pu être vérifié d'ici. Il expire automatiquement le **07.10.2026 vers 23:11**
  (heure de Zurich) ; suppression immédiate possible : onglet *Actions* → exécution → *Artifacts* → corbeille ;
- journaux des exécutions de workflows publics (conservés 90 jours) : statuts et volumes, pas de prix
  attendus, non vérifiés un à un.

L'inventaire se refait juste avant l'exécution (de nouveaux commits peuvent s'être ajoutés ; la version
actuelle doit rester propre : `privacy.test.ts`).

## 2. Procédure

Outil gratuit : `git filter-repo` (`pip install git-filter-repo`). Version testée : `a40bce548d2c`.

1. **Geler** : plus aucune poussée sur la branche (sessions Claude, tâche Windows, CI) ; noter son dernier
   commit : `git ls-remote https://github.com/probe2ka3/stayready-kit.git claude/swiss-grocery-comparison-w7bk8q`.
2. **Sauvegarde privée** (contient les données à retirer : jamais dans un dépôt public, ni dans un espace
   partagé) :
   ```bash
   git clone --mirror https://github.com/probe2ka3/stayready-kit.git avant.git
   git -C avant.git bundle create "$PWD/stayready-kit-avant-nettoyage.bundle" --all
   git -C avant.git bundle verify "$PWD/stayready-kit-avant-nettoyage.bundle"
   ```
   Conserver ce fichier hors ligne (disque personnel) jusqu'à vérification complète, puis le supprimer.
3. **Inventaire** (dans un clone de travail de la branche, pour disposer des scripts) :
   ```bash
   git clone -b claude/swiss-grocery-comparison-w7bk8q https://github.com/probe2ka3/stayready-kit.git travail
   (cd avant.git && python3 ../travail/comparateur/ops/historique/inventaire.py ../nettoyage)
   ```
   Relire `nettoyage/inventaire.md` (même liste qu'au § 1, plus d'éventuels ajouts justifiés).
4. **Nettoyer dans un miroir neuf** :
   ```bash
   git clone --mirror https://github.com/probe2ka3/stayready-kit.git nettoye.git
   cd nettoye.git
   TESPRIX_A_EXPURGER=../nettoyage/a-expurger.txt git filter-repo \
     --strip-blobs-with-ids ../nettoyage/a-retirer.txt \
     --blob-callback "$(cat ../travail/comparateur/ops/historique/expurger.py)" \
     --prune-empty never
   ```
   (`filter-repo` retire la référence `origin` du miroir : c'est voulu, rien ne peut partir par erreur.)
5. **Vérifier** avant toute poussée :
   ```bash
   python3 ../travail/comparateur/ops/historique/inventaire.py ../apres     # attendu : 0 et 0
   git rev-list --all --count                                            # même nombre qu'avant
   git rev-parse 'claude/swiss-grocery-comparison-w7bk8q^{tree}'          # = arbre d'avant (version actuelle identique)
   git -C ../avant.git rev-parse 'claude/swiss-grocery-comparison-w7bk8q^{tree}'
   git rev-parse main; git -C ../avant.git rev-parse main                 # identiques : main inchangée
   ```
6. **Publier** (décision de l'exploitant) : seule la branche concernée, avec garde sur l'ancien commit :
   ```bash
   git push --force-with-lease=claude/swiss-grocery-comparison-w7bk8q:<ancien-dernier-commit> \
     https://github.com/probe2ka3/stayready-kit.git claude/swiss-grocery-comparison-w7bk8q
   ```
7. **Après la poussée** :
   - tous les commits de la branche depuis `d1ea6fe` changent d'identifiant : chaque clone existant
     (ordinateur Windows, sessions) doit être recloné, ou mis à jour par `git fetch` puis
     `git reset --hard origin/claude/swiss-grocery-comparison-w7bk8q` après avoir sauvegardé tout travail
     local ; un ancien clone ne doit plus jamais être poussé (il réintroduirait les données) ;
   - le dépôt privé `tesprix-collecte` lit la branche par son nom : rien à changer ;
   - les liens vers d'anciens commits (documentation, comptes rendus) ne fonctionnent plus ;
   - GitHub peut garder un temps des vues en cache d'anciens commits : une demande de purge au support de
     GitHub est gratuite, mais c'est un message extérieur, à décider par l'exploitant.
8. **Retour arrière** si besoin : `git clone stayready-kit-avant-nettoyage.bundle` puis poussée de
   l'ancienne branche avec la même garde.

## 3. Essai à blanc du 03.10.2026 (copie locale, sans poussée)

Sur un miroir du dépôt local (43 commits, références `main` et branche de travail) : `filter-repo` a
réécrit l'historique en 3,4 s ; **43 commits avant et après** ; arbre final de la branche **identique** ;
`main` **inchangée** ; aucune des 11 versions retirées n'existe plus (`git cat-file -e`) ;
`aldi-api.json` absent de tout l'historique ; nouvel inventaire : **0 version à retirer, 0 à expurger** ;
dans les anciennes versions de `RAPPORT_PHASE4.md`, « contre 1 × 600 g chez Aldi ([montant retiré],
action) ». Sauvegarde `bundle` créée et vérifiée (7,0 Mo).

## 4. Limites

- Un dépôt public peut avoir été cloné, archivé ou mis en cache (copies, GitHub Archive, Software
  Heritage) : la réécriture ne rappelle pas ces copies.
- L'inventaire repose sur des règles (identifiants, hôtes, montants près d'un nom de source) : une
  donnée privée écrite autrement pourrait lui échapper ; la relecture de `inventaire.md` reste nécessaire.
- Depuis le 30.09.2026 (données) et le 03.10.2026 (documentation), `privacy.test.ts` bloque toute nouvelle
  donnée privée versionnée : la procédure n'aura pas à être répétée.
