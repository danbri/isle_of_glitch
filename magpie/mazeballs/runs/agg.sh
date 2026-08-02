#!/bin/sh
# runs/agg.sh <label>...  — pool each arm's four seeds and print the endpoint
# tests and per-seed slopes, which are the protocol's bar.
cd "$(dirname "$0")/.." || exit 1
for L in "$@"; do
  echo "########## $L"
  node tools/tournament-agg.js "runs/t-$L-s1.json" "runs/t-$L-s2.json" \
    "runs/t-$L-s3.json" "runs/t-$L-s4.json" --label "$L" --out "runs/agg-$L.json" \
    2>&1 | sed -n '2,21p'
done
