# Pre-registered, written before the run (2026-08-07)

**H4.** Counting competitors rather than mouths for regrowth suppression reduces
the multicellularity tax.

    contrast = mean(energy/cell | body >= 15 cells)
             - mean(energy/cell | body <= 8 cells)

Published value at grazeBodyShare 0.0: -0.4041 +- 0.0669 (RESEARCH.md).
Prediction: at grazeBodyShare 1.0 the contrast is HIGHER (less negative, or
positive) by more than 2 SE of the paired difference, at BOTH horizons.

**Mechanism under test** (Codex, from design rather than data): regrowth
suppression is driven by `rivals`, and at grazeBodyShare 0 a rival is a mouth, so
an N-cell body suppresses its own ground N times over. The rule that makes
movement pay is the same rule that punishes being a body.

**Design.** Paired worlds, identical seed and founders, differing only in
grazeBodyShare. 4 replicates, seeds 90000 + rep*41 — independent of every earlier
run in this project. Horizons 8,000 and 80,000 steps.

**Why the contrast and not energy/cell.** grazeBodyShare changes total
consumption as well as its distribution, so a world could get uniformly richer
without size paying any better. A within-world contrast is scale-free and immune
to that confound. This is the control; there is no separate monoculture arm
because the comparison is already within-world.

**Falsifiers.** Improvement <= 2 SE at either horizon. Fewer than 3 usable
replicates. A contrast that improves at the first horizon and fails at the deep
one is a FAILURE, not a partial success — five effects in this project have done
exactly that.

**Known limitation, stated before the result.** Every measurement in this project
before 2026-08-07 was taken with a spatial hash that did not wrap, biasing
crowding, contest and grazing worst at the world boundary. The -0.4041 baseline
inherits that bias. This run does not: both arms are measured post-fix, so the
COMPARISON is clean even though the historical baseline is not.
