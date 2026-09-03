# The path to Cambrian dynamics, and what is actually blocking it

Written 2026-08-07. Everything here is measured on the live world at step ~100k,
generation 22, or stated as not measured. Scope is given with each number.

The goal is open-ended ascent: organisms becoming each other's dominant selective
pressure, and that pressure surviving deep time. This is where that stands.

## What is no longer the blocker

Several things this project has previously named as the obstacle are not, on
current measurement.

**Composition is not the blocker.** 88% of living genomes (56 of 64, developed at
the world's own egg extent) carry both a sensor and a cell with real
contractility. The raw material for a sensorimotor loop is present in nearly
every body. This is a change from the descent recorded earlier in `RESEARCH.md`,
where sense+move fell from 3.9% to 0.9%, and it postdates senescence and the new
transport defaults.

**Cell type is not a constraint on mechanics.** Development emits no types at
all — only continuous `contract`/`sense`/`grip` — and `describe()` labels them
afterwards by argmax. Across 64 genomes, mean |contract| is 0.940 for "neuron"
and 0.963 for "muscle": statistically the same. The label decides only whether a
cell senses (and pays `senseWork`) and whether it grips as an anchor. Every cell
is already a muscle.

**Arena fragmentation is not the blocker.** It was a plausible suspect — the
warning fires once per process and then goes quiet, so a strangled run says
nothing. Measured: 5 blocked births against 253 successful over 30s, 1.9%.
`blockedBirths` is now reported in `/status` so this stays visible.

## What the blocker actually is

**Bodies are energy-limited to about thirteen cells, and differentiation needs
more than that.**

Egg size is `yolkFrac` (0.55) times the parent's energy at the moment of
division, and division triggers at `birthEnergy` 9. Developing 32 living genomes
across a range of parent energies, holding everything else at world values:

```
parentE   yolk   median cells   distinct cell types per body
      9    5.0              9                           1.78
     15    8.3             15                           1.94
     27   14.9             26                           2.03
     50   27.5             40                           2.22
    100   55.0             40                           2.22
```

The live world sits at mean energy 17.9 and realises 13.4 cells per body — near
the bottom of that curve, at roughly 1.8 distinct cell types. A body with 1.8
types has no division of labour to speak of.

This is not a bug. It is the friction law working exactly as designed: energy is
scarce, so eggs are small, so bodies are small. It is also a classic r/K
tradeoff, and the world is pinned hard at the r end — dividing at the first
affordable moment beats waiting, because two small bodies now beat one large body
later whenever size buys nothing.

**Which is the crux: size currently buys nothing.** Multicellularity is measured
as *taxed* at −0.4041 ± 0.0669. Until a larger body earns more than two smaller
ones, selection will keep choosing small, and differentiation never gets its
substrate.

## A second, independent blocker

Even given unlimited energy the encoding saturates at **2.2 distinct cell types
per body**, out of four available. Raising the energy ceiling alone therefore
buys bigger bodies made of much the same stuff. This is a property of the
developmental map, not of the economy, and it needs its own fix.

Not measured: whether that ceiling is the GRN's expressivity, the argmax
labelling collapsing a continuum, or the mutation operator failing to explore
type space. Those are three different repairs and I do not know which applies.

## The path, in dependency order

1. **Make size pay.** This is the critical path and everything else waits on it.
   The affordance must be something a big body *actively exploits* where the
   passive case nets zero (the third law). Candidates, none yet tested:
   - a size refuge in contact economics — grazing from a large body costs the
     attacker more than grazing from a small one
   - economies of scale in uptake that exceed the metabolic cost of the extra
     tissue (economies exist here but are currently outweighed)
   - reach: a longer body spans two patches, so it can hold shore and mud at once
   The test is the same in each case: does the multicellularity tax cross zero?

2. **Then raise the differentiation ceiling**, once bodies are big enough for it
   to matter. Diagnose which of the three causes above is binding first.

3. **Then re-run the clade race.** The instrument already exists and works. The
   discovery run cleared at deep time (+0.0845 ± 0.0220); the pre-registered
   replication has cleared its first horizon (+0.1139 ± 0.0416) with the deep
   horizon still running.

4. **H3 remains unbuilt, and it is the arm that tests "dominant".** Flattening
   the geography requires replacing height/wetness/mud/shore with their spatial
   means so that mean productivity is preserved and only the structure is
   removed. Computing those means must reuse the kernel's own noise rather than a
   JS reimplementation, which needs a small sampling compute pass — the main
   pipeline's ten storage buffers are fully allocated, so it needs its own.

## Sequencing warning

Do not chase scale before size pays. 358k cells that twitch is the twitch-not-move
symptom multiplied. The bottleneck is the closed loop and the economics around
it, not the cell count — and the cell count is now cheap, since the viewer runs
at 55 fps and the server at ~42 steps/s.

## Scope

One world, one lineage history, 32–64 genomes per measurement, single timepoint
at step ~100k. The energy/size/differentiation table is a developmental
calculation at fixed genomes, not an evolutionary outcome: it says what these
genomes would build given more yolk, not what evolution would do with a changed
economy. No replicates.
