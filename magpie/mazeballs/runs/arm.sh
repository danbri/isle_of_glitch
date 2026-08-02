#!/bin/sh
# runs/arm.sh <label> <seed> [<seed>] -- <tournament.js flags...>
#
# One arm of the search-variant sweep, at the pure-evasion task setting
# (preyLoss 16, preyIntake 0 -> predation is 0.99 of prey fitness variance and
# foraging is worth literally nothing). Every arm differs from the baseline ONLY
# in the prey's search; the task, the world, the predators and the predators'
# own search are identical.
#
# Seeds run concurrently, two at a time, because the box has four cores shared
# with another agent.
cd "$(dirname "$0")/.." || exit 1
export EVODEVO_WORKERS=1

LABEL=$1; shift
SEEDS=""
while [ "$1" != "--" ] && [ $# -gt 0 ]; do SEEDS="$SEEDS $1"; shift; done
shift   # drop the --

COMMON="--generations 32 --snapEvery 8 --tsteps 500 --preyLoss 16 --preyIntake 0"

for s in $SEEDS; do
  # shellcheck disable=SC2086
  node tools/tournament.js $COMMON --seed "$s" --label "$LABEL" \
    --archiveOut "runs/arch-$LABEL-s$s.json" --out "runs/t-$LABEL-s$s.json" "$@" \
    > "runs/log-$LABEL-s$s.txt" 2>&1 &
done
wait
echo "== $LABEL done"
for s in $SEEDS; do tail -8 "runs/log-$LABEL-s$s.txt"; done
