#!/usr/bin/env bash
# Un cycle de collecte quotidienne sur un serveur sans état (GitHub Actions) :
#   1. reprend l'état de la veille depuis <dossier-etat> (instantanés, journal des exécutions) ;
#   2. lance `pnpm quotidien` (une collecte par jour de Zurich ; relancé le même jour, seules les
#      sources en échec technique sont reprises ; un rattrapage collecte ce qui est publié au moment
#      du lancement, il ne reconstitue jamais les prix des jours manqués) ;
#   3. réécrit l'état dans <dossier-etat>, sans archives brutes, sans cache HTTP ni verrou.
#
# Usage : cycle.sh <dossier-etat> [options de quotidien, ex. --sources=lidl-web,open-prices]
# Le dossier d'état doit rester PRIVÉ (dépôt privé) dès qu'il contient une source à usage privé.
set -euo pipefail

ETAT="${1:?Usage : cycle.sh <dossier-etat> [options de quotidien]}"
shift
COMPARATEUR="$(cd "$(dirname "$0")/../.." && pwd)"
DATA="${DATA_DIR:-$COMPARATEUR/data}"
export DATA_DIR="$DATA"
# Archives brutes (pages et réponses lues) : jamais conservées hors de la machine d'exécution.
export RAW_ARCHIVE_DIR="${RAW_ARCHIVE_DIR:-${RUNNER_TEMP:-/tmp}/tesprix-raw}"

mkdir -p "$ETAT/private" "$ETAT/prices-live" "$DATA/private" "$DATA/prices/live"

# 1. État de la veille. Sources publiables : repris seulement s'ils sont plus récents que ceux du
#    code (live-restore) ; sources privées : uniquement depuis le dossier d'état.
for d in live runs matrice demo matching; do
  if [ -d "$ETAT/private/$d" ]; then
    rm -rf "${DATA:?}/private/$d"
    cp -a "$ETAT/private/$d" "$DATA/private/$d"
  fi
done
rm -f "$DATA/private/runs/quotidien.lock"
pnpm -s -C "$COMPARATEUR" job live-restore --from="$ETAT/prices-live"

# 2. Cycle (code de sortie conservé : l'état est enregistré même après un échec partiel).
set +e
pnpm -s -C "$COMPARATEUR" quotidien "$@"
code=$?
set -e

# 3. État pour le cycle suivant.
for d in live runs matrice demo matching; do
  rm -rf "${ETAT:?}/private/$d"
  if [ -d "$DATA/private/$d" ]; then cp -a "$DATA/private/$d" "$ETAT/private/$d"; fi
done
rm -f "$ETAT/private/runs/quotidien.lock"
find "$ETAT/prices-live" -name '*.json' -delete
for f in "$DATA"/prices/live/*.json; do
  [ -e "$f" ] && cp "$f" "$ETAT/prices-live/"
done
exit "$code"
