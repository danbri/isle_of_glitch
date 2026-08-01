#!/bin/sh
# runs/probe.sh <label> <seed> <seed> -- <policy.js flags...>
#
# The calibrated instrument. `tools/policy.js --coevo --channels opponent
# --ablate opponent` evolves under the arm's own search and task settings, then
# traces the prey twice from identical spawns -- once with the predator channels
# intact and once with them mean-replaced -- and reports the paired change in
# mean sensed predator mass. NEGATIVE means the animal gets further from
# predators when it can see them, i.e. evasion driven by the predator channel.
#
# The reference evader reads about -0.14 on this measure and every evolved arm
# recorded so far reads -0.018 +- 0.037, i.e. nothing. That known-present /
# known-absent pair is what gives the number a scale.
cd "$(dirname "$0")/.." || exit 1
export EVODEVO_WORKERS=1
LAB=$1; shift
SEEDS=""
while [ "$1" != "--" ] && [ $# -gt 0 ]; do SEEDS="$SEEDS $1"; shift; done
shift

COMMON="--coevo --channels opponent --ablate opponent --generations 32 \
--steps 600 --restarts 4 --captureSigma2 0.0040 --preyLoss 16 --preyIntake 0 \
--predPop 48 --predElites 6"

for s in $SEEDS; do
  # shellcheck disable=SC2086
  node tools/policy.js $COMMON --seed "$s" --label "$LAB" \
    --out "runs/p-$LAB-s$s.json" "$@" > "runs/plog-$LAB-s$s.txt" 2>&1 &
done
wait
echo "== probe $LAB done"
for s in $SEEDS; do echo "-- seed $s"; grep -E 'summary|klino' "runs/plog-$LAB-s$s.txt" | head -12; done
