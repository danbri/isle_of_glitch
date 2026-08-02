#!/bin/sh
# Smoke test: every search variant runs and produces finite numbers.
cd "$(dirname "$0")/.." || exit 1
export EVODEVO_WORKERS=1
for a in "--preySelect tournament --preyTournK 2" \
         "--preyElitism false" \
         "--preyCrossover 0.5" \
         "--preySelfAdapt true" \
         "--preySelect mapelites" \
         "--preySelect novelty"; do
  echo "=== $a"
  # shellcheck disable=SC2086
  node tools/tournament.js --generations 2 --snapEvery 2 --seed 1 --tsteps 200 $a 2>&1 \
    | grep -E '^\[gen|^  [0-9]|Error' | head -8
done
