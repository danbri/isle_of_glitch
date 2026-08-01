#!/bin/sh
# runs/cross.sh <seeds...>
#
# Cross-lineage phase 2. Four combinations per seed, off archives that already
# exist, so this costs one tournament grid each and nothing is re-evolved:
#
#   xbb  base prey  vs base predators   (the within-lineage control, = t-base)
#   xtb  tk2  prey  vs BASE predators   <- tk2 prey against a fixed standard
#   xbt  base prey  vs TK2  predators
#   xtt  tk2  prey  vs tk2  predators   (= t-tk2)
#
# The question is the confound named in RESEARCH.md: tk2's predator capability
# did not improve, so a fall in tk2's prey vulnerability could be its own
# predators being weaker rather than its prey being better. If it is the
# predators, xtb (tk2 prey against the baseline's predators) reverts toward the
# baseline; if it is the prey, xtb keeps the advantage and xbt does not gain one.
cd "$(dirname "$0")/.." || exit 1
export EVODEVO_WORKERS=1
COMMON="--tsteps 500 --preyLoss 16 --preyIntake 0"
for s in "$@"; do
  # shellcheck disable=SC2086
  node tools/tournament.js --archiveIn "runs/arch-base-s$s.json" \
    --predArchiveIn "runs/arch-tk2-s$s.json" $COMMON --label xbt \
    --out "runs/t-xbt-s$s.json" > "runs/log-xbt-s$s.txt" 2>&1 &
  # shellcheck disable=SC2086
  node tools/tournament.js --archiveIn "runs/arch-tk2-s$s.json" \
    --predArchiveIn "runs/arch-base-s$s.json" $COMMON --label xtb \
    --out "runs/t-xtb-s$s.json" > "runs/log-xtb-s$s.txt" 2>&1 &
  # shellcheck disable=SC2086
  node tools/tournament.js --archiveIn "runs/arch-base-s$s.json" $COMMON --label xbb \
    --out "runs/t-xbb-s$s.json" > "runs/log-xbb-s$s.txt" 2>&1 &
  # shellcheck disable=SC2086
  node tools/tournament.js --archiveIn "runs/arch-tk2-s$s.json" $COMMON --label xtt \
    --out "runs/t-xtt-s$s.json" > "runs/log-xtt-s$s.txt" 2>&1 &
  wait
done
echo "== cross done"
