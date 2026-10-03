#!/usr/bin/env bash
# Un cycle de collecte quotidienne sur un serveur sans état, avec un dossier d'état local (essai du
# dépôt public : sources publiables seulement ; le dépôt privé utilise github.sh, qui ajoute le
# journal partagé avec Windows, le verrou et l'enregistrement par commit) :
#   1. reprend l'état de la veille depuis <dossier-etat> (etat.mjs restaurer) ;
#   2. lance `pnpm quotidien` (une collecte par jour de Zurich ; relancé le même jour, seules les
#      sources en échec technique sont reprises ; un rattrapage collecte ce qui est publié au moment
#      du lancement, il ne reconstitue jamais les prix des jours manqués) ;
#   3. réécrit l'état dans <dossier-etat> (etat.mjs enregistrer : sans archives brutes, cache ni verrou).
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

mkdir -p "$ETAT"
node "$COMPARATEUR/ops/actions-prive/etat.mjs" restaurer "$ETAT" "$DATA"

# Code de sortie conservé : l'état est enregistré même après un échec partiel.
set +e
pnpm -s -C "$COMPARATEUR" quotidien "$@"
code=$?
set -e

node "$COMPARATEUR/ops/actions-prive/etat.mjs" enregistrer "$DATA" "$ETAT"
exit "$code"
