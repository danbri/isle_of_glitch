#!/bin/sh
# runs/kin.sh <blind|intact> <predGen> <seeds...>
#
# The kinematic characterisation. Three prey populations -- generation 0, the
# truncation baseline at generation 32, and the tournament-k2 arm at generation
# 32 -- run against ONE fixed predator population (the baseline lineage's, at
# generation <predGen>, per seed) in the phase-2 tournament world.
#
# Generation 0 is taken from the baseline archive, but the two arms share a seed
# and therefore share their generation-0 genomes exactly, so it is the common
# ancestor of both and the three-way comparison is paired within seed. The same
# holds for the predators at generation 0: both archives contain the identical
# unevolved predator population for a given seed.
#
# Holding the predators fixed is what makes the contact number here an
# encounter-rate statistic: under `--preyBlind all` the prey trajectory cannot
# depend on the predators at all, so any contact difference between the three
# prey populations is geometry and nothing else.
#
# `predGen 0` is the generality probe. If the prey's advantage is a general
# lowering of the encounter rate, it should survive being pointed at an
# unevolved pursuer; if it is tuned to where *evolved* predators go, it should
# shrink.
cd "$(dirname "$0")/.." || exit 1
export EVODEVO_WORKERS=1
MODE=$1; shift
PG=$1; shift
case "$MODE" in
  blind)  FLAG="--preyBlind all"; TAG=b ;;
  intact) FLAG="";                TAG=i ;;
  *) echo "usage: kin.sh blind|intact <predGen> <seeds...>"; exit 2 ;;
esac
[ "$PG" = "32" ] || TAG="$TAG$PG"

for s in "$@"; do
  # shellcheck disable=SC2086
  node tools/kinematics.js --archiveIn "runs/arch-base-s$s.json" --preyGen 0 \
    --predArchiveIn "runs/arch-base-s$s.json" --predGen "$PG" $FLAG \
    --label "gen0-$TAG" --out "runs/kin-gen0-$TAG-s$s.json" \
    > "runs/kinlog-gen0-$TAG-s$s.txt" 2>&1 &
  # shellcheck disable=SC2086
  node tools/kinematics.js --archiveIn "runs/arch-base-s$s.json" --preyGen 32 \
    --predArchiveIn "runs/arch-base-s$s.json" --predGen "$PG" $FLAG \
    --label "base-$TAG" --out "runs/kin-base-$TAG-s$s.json" \
    > "runs/kinlog-base-$TAG-s$s.txt" 2>&1 &
  # shellcheck disable=SC2086
  node tools/kinematics.js --archiveIn "runs/arch-tk2-s$s.json" --preyGen 32 \
    --predArchiveIn "runs/arch-base-s$s.json" --predGen "$PG" $FLAG \
    --label "tk2-$TAG" --out "runs/kin-tk2-$TAG-s$s.json" \
    > "runs/kinlog-tk2-$TAG-s$s.txt" 2>&1 &
  wait
done
echo "== kin $MODE predGen $PG done"
