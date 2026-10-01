# Retirer les anciennes données Aldi de l'historique Git (procédure, **non exécutée**)

Aucune réécriture d'historique ni poussée forcée n'a été faite. Cette procédure est prête pour le jour où
l'exploitant décide de l'appliquer.

## 1. Ce qui est concerné

Le dépôt est public. Avant la séparation collecte/publication (30.09.2026), des fichiers contenant des
prix Aldi (source à usage privé) ont été versionnés. Ils ne sont plus dans la version courante, mais
restent dans l'historique de la branche `claude/swiss-grocery-comparison-w7bk8q` (pas dans `main`).

| Fichier | Versions (blobs) | Commits |
|---|---|---|
| `comparateur/data/prices/live/aldi-api.json` | `3c1336c9…`, `9e430f8c…`, `ef2c97e3…`, `fe967285…` | `d1ea6fe` (28.09) → retiré dans `5d4d8b5` |
| `comparateur/data/demo/resultats.md` | `568561aa…`, `68450b10…`, `e0b0b331…` | `5ab8401` → retiré dans `5d4d8b5` |
| `comparateur/data/demo/panier-noyau-prive.md` | `86d9a618…` | `8e3f21f` → retiré dans `5d4d8b5` |
| `comparateur/data/matching/audit.md` | `26d8bac4…` (47 lignes Aldi avec prix) | `5ab8401` → remplacé le 01.10.2026 |

Nature : prix publics d'articles Aldi relevés du 28 au 30.09.2026 (faits), aucune donnée personnelle.
Les identifiants d'articles et les décisions de correspondance (`reviewed.json`, `validation/`) ne
contiennent pas de prix et restent.

La liste exacte se recalcule à tout moment :

```bash
for p in comparateur/data/prices/live/aldi-api.json comparateur/data/demo/resultats.md \
         comparateur/data/demo/panier-noyau-prive.md comparateur/data/matching/audit.md; do
  for c in $(git log --all --format=%h -- "$p"); do
    b=$(git rev-parse -q --verify "$c:$p") && echo "$b"
  done
done | sort -u > blobs-a-retirer.txt
# Ne garder pour audit.md que la version de 5ab8401 (la version courante est propre) :
grep -v "$(git rev-parse HEAD:comparateur/data/matching/audit.md)" blobs-a-retirer.txt > tmp && mv tmp blobs-a-retirer.txt
```

## 2. Procédure

Outil gratuit : `git filter-repo` (`pip install git-filter-repo`). On retire **uniquement ces versions de
fichiers** (`--strip-blobs-with-ids`) ; tout le reste de l'historique est conservé.

1. **Geler** : plus aucune poussée sur la branche ; noter son dernier commit (`git rev-parse origin/claude/swiss-grocery-comparison-w7bk8q`).
2. **Sauvegarder** (hors du dépôt, conservée jusqu'à vérification complète) :
   ```bash
   git clone --mirror https://github.com/probe2ka3/stayready-kit.git sauvegarde.git
   git -C sauvegarde.git bundle create ../stayready-kit-avant-nettoyage.bundle --all
   git -C sauvegarde.git bundle verify ../stayready-kit-avant-nettoyage.bundle
   ```
3. **Nettoyer dans un clone neuf** (filter-repo refuse un clone de travail) :
   ```bash
   git clone --mirror https://github.com/probe2ka3/stayready-kit.git nettoyage.git
   cd nettoyage.git
   git filter-repo --strip-blobs-with-ids ../blobs-a-retirer.txt --prune-empty never
   ```
4. **Vérifier** avant toute poussée :
   ```bash
   while read b; do git cat-file -e "$b" 2>/dev/null && echo "ENCORE PRÉSENT : $b"; done < ../blobs-a-retirer.txt
   git log --all --oneline -- comparateur/data/prices/live/aldi-api.json   # commits gardés, fichier absent
   git rev-list --all --count                                               # même nombre qu'avant (aucun commit supprimé)
   git diff <ancien-dernier-commit> <nouveau-dernier-commit> --stat          # vide : la version courante est identique
                                                                            # (audit.md propre depuis le 01.10.2026)
   ```
   Puis, dans un clone de travail du résultat : `pnpm install && pnpm test` (dont le test
   `apps/worker/test/privacy.test.ts`).
5. **Publier** (décision de l'exploitant) : seule la branche concernée, avec garde sur l'ancien commit :
   ```bash
   git push --force-with-lease=claude/swiss-grocery-comparison-w7bk8q:<ancien-dernier-commit> \
     origin claude/swiss-grocery-comparison-w7bk8q
   ```
   `main` n'est pas touchée. Tous les commits depuis `d1ea6fe` changent d'identifiant : chaque clone
   existant doit être recréé (ou `git fetch` puis `git reset --hard origin/<branche>`, après avoir
   sauvegardé tout travail local).
6. **Retour arrière** si besoin : `git clone stayready-kit-avant-nettoyage.bundle` puis poussée de
   l'ancienne branche avec la même garde.

Essai à blanc du 01.10.2026 sur une copie locale (sans poussée) : 39 commits avant et après, les 9
versions retirées introuvables (`git cat-file -e`), `aldi-api.json` absent de tout l'historique, `main`
identique, sauvegarde `bundle` de 6,9 Mo créée.

## 3. Limites

- Un dépôt public peut avoir été cloné, archivé ou mis en cache (copies, GitHub Archive, Software
  Heritage). La réécriture empêche la diffusion future depuis ce dépôt ; elle ne rappelle pas les copies.
- GitHub peut conserver des commits devenus inaccessibles (vues en cache, références de demandes de
  fusion) : une demande de purge au support de GitHub est gratuite, mais c'est un message extérieur —
  à décider par l'exploitant.
- Depuis le 30.09.2026, le test `privacy.test.ts` et le workflow bloquent toute nouvelle donnée privée
  versionnée : la procédure n'aura pas à être répétée.
