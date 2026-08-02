#!/bin/sh
# runs/conc.sh <n>  — how much does running n arms concurrently cost per arm?
# The box has four cores shared with another agent, and every archive-generating
# run is ~8s/generation on its own; this measures the slowdown before 8 x 32
# generations are committed to a particular batch size.
cd "$(dirname "$0")/.." || exit 1
export EVODEVO_WORKERS=1
N=$1
i=1
while [ "$i" -le "$N" ]; do
  node tools/tournament.js --generations 3 --snapEvery 3 --seed "$i" --tsteps 100 \
    --preyLoss 16 --preyIntake 0 --quiet --out "runs/conc-$i.json" > "runs/conclog-$i.txt" 2>&1 &
  i=$((i + 1))
done
wait
echo "== conc $N done"
