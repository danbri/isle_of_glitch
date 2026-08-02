#!/bin/sh
# runs/blind.sh <archive-label> <seed>...
#
# Phase-2-only re-run of an existing archive with the prey's predator channels
# mean-replaced. Everything else -- genomes, world, spawns, frozen predators --
# is identical to the unablated run off the same archive, so the difference in
# the prey-vulnerability marginal is caused by the information and nothing else.
cd "$(dirname "$0")/.." || exit 1
export EVODEVO_WORKERS=1
LAB=$1; shift
for s in "$@"; do
  node tools/tournament.js --archiveIn "runs/arch-$LAB-s$s.json" \
    --tsteps 500 --preyLoss 16 --preyIntake 0 --preyBlind opponent \
    --label "blind-$LAB" --out "runs/t-blind$LAB-s$s.json" \
    > "runs/log-blind$LAB-s$s.txt" 2>&1 &
done
wait
echo "== blind on $LAB done"
