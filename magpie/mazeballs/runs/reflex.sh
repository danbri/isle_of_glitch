#!/bin/sh
# runs/reflex.sh <archive-label> <seed> [<seed>...]
#
# Phase-2-only re-run of an existing archive with the hand-specified reference
# evader switched on. Same genomes, same world, same spawns, same frozen
# predators -- only the prey's motor output differs, so this is the calibrated
# target: what the prey-vulnerability marginal reads when a policy known to be
# reachable from the animal's own sensor vector is actually running.
cd "$(dirname "$0")/.." || exit 1
export EVODEVO_WORKERS=1
LAB=$1; shift
for s in "$@"; do
  node tools/tournament.js --archiveIn "runs/arch-$LAB-s$s.json" \
    --tsteps 500 --preyLoss 16 --preyIntake 0 \
    --preyReflex 1 --reflexSource sensed --reflexMassK 8 \
    --label "reflex-$LAB" --out "runs/t-reflex$LAB-s$s.json" \
    > "runs/log-reflex$LAB-s$s.txt" 2>&1 &
done
wait
echo "== reflex on $LAB done"
for s in "$@"; do echo "-- seed $s"; tail -9 "runs/log-reflex$LAB-s$s.txt"; done
