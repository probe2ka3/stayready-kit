#!/usr/bin/env bash
# Étapes du workflow du dépôt privé `tesprix-collecte` (.github/workflows/quotidien.yml) :
#   github.sh debut     besoin d'une collecte ? verrou partagé (Windows / GitHub) → GITHUB_OUTPUT
#   github.sh collecte  restaure l'état, lance `pnpm quotidien`, enregistre l'état
#   github.sh fin       journal de suivi, libère le verrou, commit + push ; code 1 si une source a échoué
#
# Variables : DEPOT (clone du dépôt privé), CODE (dossier comparateur du dépôt public), EXECUTION (URL),
# DECLENCHEUR (github.event_name), FORCE (true/false), COLLECTE et ISSUE (sorties de `debut`),
# TESPRIX_SOURCES (facultatif : sources à collecter, ex. « open-prices,lidl-web » si une source refuse GitHub).
# Sortie de `quotidien` dans un fichier temporaire de l'exécuteur (ni publiée, ni conservée) : seuls les
# statuts et volumes par source apparaissent dans le journal du workflow.
set -euo pipefail

ETAT="$DEPOT/etat"
OUTILS="$CODE/ops/actions-prive"
TMP="${RUNNER_TEMP:-/tmp}"
SORTIE="${GITHUB_OUTPUT:-/dev/null}"
FORCEARG=()
if [ "${FORCE:-false}" = true ]; then FORCEARG=(--force); fi
cd "$DEPOT"
git config user.name 'tesprix-collecte'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

# Enregistrement : en cas de poussée concurrente (l'autre système a ajouté son suivi), on repart du
# dépôt distant, on y recopie notre état (données, exécutions) et on régénère le tableau de suivi.
enregistrer() {
  git add -A etat
  git diff --cached --quiet && return 0
  git commit -q -m "$1"
  git push -q && return 0
  rm -rf "$TMP/etat-local" && cp -a etat "$TMP/etat-local"
  git fetch -q && git reset -q --hard '@{u}'
  cp -a "$TMP/etat-local/." etat/
  if [ ! -e "$TMP/etat-local/verrou.json" ]; then node "$OUTILS/etat.mjs" liberer "$ETAT"; fi
  node "$OUTILS/etat.mjs" tableau "$ETAT"
  git add -A etat
  git commit -q -m "$1 (après fusion)"
  git push -q
}

case "${1:-}" in
  debut)
    date -u +%Y-%m-%dT%H:%M:%SZ > "$TMP/tesprix-debut"
    for essai in 1 2; do
      reponse=$(node "$OUTILS/etat.mjs" besoin "$ETAT" "${FORCEARG[@]}")
      echo "$reponse"
      if ! grep -q '^collecte=oui' <<<"$reponse"; then
        echo "collecte=non" >> "$SORTIE"
        if grep -q 'collecte en cours' <<<"$reponse"; then echo "issue=concurrence" >> "$SORTIE"; else echo "issue=rien" >> "$SORTIE"; fi
        exit 0
      fi
      if node "$OUTILS/etat.mjs" verrou "$ETAT" --systeme github --execution "${EXECUTION:-}"; then
        git add etat/verrou.json
        git commit -q -m "Verrou de collecte (GitHub, exécution ${GITHUB_RUN_ID:-locale})"
        if git push -q; then
          echo "collecte=oui" >> "$SORTIE"
          exit 0
        fi
        # Poussée concurrente : on reprend l'état distant et on réévalue (essai $essai).
        git fetch -q && git reset -q --hard '@{u}'
      fi
    done
    echo "collecte=non" >> "$SORTIE"
    echo "issue=concurrence" >> "$SORTIE"
    ;;
  collecte)
    node "$OUTILS/etat.mjs" restaurer "$ETAT" "$CODE/data"
    set +e
    SOURCES=()
    if [ -n "${TESPRIX_SOURCES:-}" ]; then SOURCES=("--sources=$TESPRIX_SOURCES"); fi
    RAW_ARCHIVE_DIR="$TMP/tesprix-raw" pnpm -s -C "$CODE" quotidien "${FORCEARG[@]}" "${SOURCES[@]}" > "$TMP/quotidien.log" 2>&1
    code=$?
    set -e
    echo "$code" > "$TMP/tesprix-code"
    node "$OUTILS/etat.mjs" enregistrer "$CODE/data" "$ETAT"
    echo "Collecte terminée, code $code (sortie détaillée sur l'exécuteur seulement, effacée à la fin)."
    ;;
  fin)
    debut=$(cat "$TMP/tesprix-debut" 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
    code=$(cat "$TMP/tesprix-code" 2>/dev/null || true)
    args=(--systeme github --declencheur "${DECLENCHEUR:-inconnu}" --debut "$debut" --execution "${EXECUTION:-}")
    if [ -n "$code" ]; then
      node "$OUTILS/etat.mjs" liberer "$ETAT"
      args+=(--code "$code")
      message="Collecte du $(TZ=Europe/Zurich date +%d.%m.%Y), code $code (exécution ${GITHUB_RUN_ID:-locale})"
    elif [ "${COLLECTE:-non}" = oui ]; then
      # Verrou pris mais collecte interrompue avant la fin (installation, panne de l'exécuteur…).
      node "$OUTILS/etat.mjs" liberer "$ETAT"
      args+=(--issue echec)
      message="Collecte du $(TZ=Europe/Zurich date +%d.%m.%Y) interrompue (exécution ${GITHUB_RUN_ID:-locale})"
    else
      args+=(--issue "${ISSUE:-rien}")
      message="Suivi du $(TZ=Europe/Zurich date +%d.%m.%Y) : ${ISSUE:-rien} (exécution ${GITHUB_RUN_ID:-locale})"
    fi
    set +e
    node "$OUTILS/etat.mjs" noter "$ETAT" "${args[@]}"
    verdict=$?
    set -e
    enregistrer "$message"
    exit "$verdict"
    ;;
  *)
    echo "Usage : github.sh debut|collecte|fin" >&2
    exit 2
    ;;
esac
