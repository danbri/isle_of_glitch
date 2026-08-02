#!/bin/sh
# runs/rep.sh <label> <seed> <seed> -- <repeatability.js flags...>
#
# Repeatability of prey contact against a frozen predator population, at the
# pure-evasion task setting. This is the number that says whether selection has
# a signal to act on at all: R is the between-genotype share of the trait's
# variance across independent spawns, i.e. the ceiling on the per-generation
# response to selection on it.
cd "$(dirname "$0")/.." || exit 1
export EVODEVO_WORKERS=1
LAB=$1; shift
SEEDS=""
while [ "$1" != "--" ] && [ $# -gt 0 ]; do SEEDS="$SEEDS $1"; shift; done
shift
COMMON="--coevo --evals 6 --steps 1450 --preyLoss 16 --preyIntake 0 --captureSigma2 0.0040"
for s in $SEEDS; do
  # shellcheck disable=SC2086
  node tools/repeatability.js $COMMON --seed "$s" --label "$LAB" \
    --out "runs/rep-$LAB-s$s.json" "$@" > "runs/replog-$LAB-s$s.txt" 2>&1 &
done
wait
for s in $SEEDS; do printf '%s s%s  ' "$LAB" "$s"; grep '\[done\]' "runs/replog-$LAB-s$s.txt"; done
