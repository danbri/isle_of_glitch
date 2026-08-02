#!/bin/sh
# runs/phase2.sh <archive-label> <out-tag> <seeds...> -- <tournament.js flags>
# Phase-2-only re-run off an existing archive, with arbitrary phase-2 settings.
cd "$(dirname "$0")/.." || exit 1
export EVODEVO_WORKERS=1
LAB=$1; shift
TAG=$1; shift
SEEDS=""
while [ "$1" != "--" ] && [ $# -gt 0 ]; do SEEDS="$SEEDS $1"; shift; done
shift
for s in $SEEDS; do
  # shellcheck disable=SC2086
  node tools/tournament.js --archiveIn "runs/arch-$LAB-s$s.json" \
    --tsteps 500 --preyLoss 16 --preyIntake 0 --label "$TAG" \
    --out "runs/t-$TAG-s$s.json" "$@" > "runs/log-$TAG-s$s.txt" 2>&1 &
done
wait
echo "== $TAG done"
