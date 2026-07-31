# magpie/mazeballs — Evo/Devo Field

A single-page artificial-life piece. Every organism carries a genome that is a
10-node gene-regulatory CTRNN; 48 integration steps of that network *develop*
the genome into a 12-cell embryo, whose expression levels are read as ligands
and receptors and wired into a 12-node sensorimotor CTRNN. That adult network
drives differential thrust through a world of nutrient patches, toxins and
rigid circular obstacles. Fitness accumulates over an epoch, the top 10 are kept
as elites, and the rest of the population is resampled and mutated from them.

The whole population — genomes, phenotypes, bodies and world — lives as
TensorFlow.js tensors on WebGPU (or WebGL, or CPU, in that order of preference).
Only a compact per-frame snapshot is read back for drawing. The visualiser is
hand-written WebGL2 with instanced draws.

Live: <https://danbri.github.io/isle_of_glitch/magpie/mazeballs/>

## Food depletes

Each of the 42 nutrient patches carries a stock in [0,1]. Feeding draws it down
in proportion to how many agents are on it; it regrows logistically toward full.
A patch grazed by a single agent empties in roughly 3 seconds of sim time and
takes about 15 to come back, against a 26-second epoch.

This matters more than it sounds. With a static food field the optimal strategy
is to find one dot and park on it forever, which is the terminal state of that
fitness landscape and leaves nothing interesting to evolve toward. Depletion
makes sitting still stop paying, makes travel between patches worth its cost,
and gives internal state something to be *for*. Both the reward and the food
*sensor* are stock-weighted, so agents are pulled toward live patches rather
than toward the bare geometry of where food used to be.

## Recurrent gain

The adult CTRNN only computes anything if it sits in the range where `tanh` is
still steep. The developed weight matrix was originally scaled by `2.0`, which
puts the mean largest-absolute-row-sum of `W` at about **5**. At that gain the
fixed points sit out in the flat region: cells rail at ±1 and stop responding to
input entirely. Measured at generation 0, with no evolution involved, ~27% of
all cells were pinned and ~15% of agents were parked against the world boundary.

This is upstream of everything else. A railed cell emits the same output whatever
it is sent, so the ablation table will report "open loop" no matter how long you
evolve — not because nothing was learned, but because nothing *could* be.

The **gain** slider rescales the developed matrix live (development re-runs for
all 192 genomes on release). Paired against identical genomes and identical
spawns over 700 steps:

| gain | row sum | railed | at wall | top 25% fitness | population mean |
|---|---|---|---|---|---|
| 2.0 (original) | 5.03 | 31.1% | 15.1% | 1.070 | **−0.025** |
| 1.0 | 2.51 | 15.4% | 10.4% | 1.166 | 0.094 |
| **0.5 (default)** | 1.26 | 3.3% | 6.3% | 1.139 | 0.086 |
| 0.3 | 0.75 | 0.1% | 5.7% | 1.302 | 0.109 |

The original setting was the worst on every measure, including a *negative*
population mean — agents were losing more to toxins than they gained from food.
0.3 scored best here, but the gap between 0.3, 0.5 and 1.0 is within run-to-run
noise, and at a row sum of 0.75 the recurrence is weak enough that the network is
nearly feedforward. 0.5 keeps recurrence meaningful while staying off the rails.

Watch the readout beside the slider: `% railed` is the share of cells beyond
|tanh| > 0.95, and `% at wall` the share of agents pinned to the boundary.
Immediately after an epoch resets both read near zero — the state has not settled
yet — so let it run a few seconds before reading them.

## Analysis panel

Press **A** or hit *analysis*. Fitness alone cannot tell you whether anything
capable evolved — a high number is equally consistent with a lucky spawn, a
fixed motor pattern that happens to spiral through a patch, or memorised
geography. The panel runs controls that can tell those apart.

Every condition replays the **same genomes from the same starting positions**,
changing exactly one thing, so a difference is the condition and not spawn luck.

| condition | what it isolates |
|---|---|
| baseline | reference, fresh spawns |
| all senses scrambled | is the sensorimotor loop closed at all? |
| food / toxin / wall sense scrambled | which modality is load-bearing |
| recurrence lesioned | off-diagonal `W` zeroed — is it more than a reactive map? |
| novel field layout | a layout the population was never selected on |

Senses are ablated by **scrambling between agents** — each agent receives another
agent's stream for the ablated channels. That destroys the information while
preserving the distribution, which a plain zeroing does not.

Two details that matter for reading the output:

- **Δ is computed on the top quartile**, not the population mean. The fitness
  distribution is severely skewed — most agents never find food — so the mean is
  mostly noise around zero. In testing this cut the noise on Δ from ±900% to ±3%.
- **Taxis has an empirical null.** The turn-vs-bearing correlation is also
  measured under the fully scrambled condition, which has the same
  autocorrelation structure but no real coupling. Consecutive timesteps are
  strongly autocorrelated, so a per-agent |r| threshold is meaningless without
  that column — roughly a fifth of agents clear it by chance.

The panel also tracks **lineages**. Because children only ever descend from the
elites, the number of surviving founding lineages can only fall, and from
generation 1 its ceiling is the elite count, not the population. The panel
reports it against the right ceiling. A genome holding an elite slot across many
consecutive re-evaluations is the strongest single signal available here that
something real was found, rather than a good starting position.

## Controls

| input | effect |
|---|---|
| click the field | select an organism; the inspector follows it and traces its path |
| `space` / **pause** | pause and resume |
| `s` / **step** | advance a single simulation step |
| `e` / **evolve now** | end the epoch early: select elites, redevelop, restart bodies |
| `r` / **new biosphere** | fresh field *and* fresh random genomes |
| `a` / **analysis** | open the analysis panel (`Esc` closes) |
| speed | simulation steps per animation frame (1–10) |
| mutation | fraction of genome loci perturbed per offspring (1–30%) |
| gain | recurrent scale of the adult CTRNN (0.10–3.00, see above) |

## Population files

Nothing in the page survives a reload, and a population that has been evolving
for thirty generations is not reproducible — the run is the artefact. The
analysis panel can **export** the whole population to a JSON file and **import**
it back.

What travels: the genomes (`genR` 192×10×10 and `genM` 192×3×10, base64 float32
so the bits round-trip exactly rather than through decimal), the generation
count, the full lineage record, the gain and mutation settings, and **the field
layout**. That last one matters — without it an imported population would be
scored on a different world, which quietly invalidates any comparison the file
was saved to make. About 134 KB per population.

The point beyond not losing runs is paired experiments. Export a population,
change one setting, import the same file, and you are measuring that setting on
identical genomes in an identical world rather than on two runs that merely
resemble each other. Comparing gain values on an *evolved* population — which
adapted to whatever gain it evolved under — needs exactly this.

Files are validated on load: wrong format, wrong population/genome dimensions,
truncated blocks or non-finite values are all rejected with a specific message,
and a rejected file leaves the running population untouched.

## Console

Everything is live on `window.evoDevo` — `sim`, `renderer`, `CFG`, `world()`,
`conditions`. The population's arrays are `tf.Variable`s, so
`await evoDevo.sim.fitness.data()` and `await evoDevo.sim.populationStats()`
work straight from devtools.

## Network use

The page loads two pinned TensorFlow.js builds from jsDelivr
(`@tensorflow/tfjs@4.22.0` and `@tensorflow/tfjs-backend-webgpu@4.22.0`), both
with SRI hashes and `crossorigin="anonymous"`. Nothing else is fetched, and no
data leaves the browser.

## Requirements

WebGL2 is required for the visualiser; without it the page says so instead of
failing silently. WebGPU is used for the tensor work when the browser exposes
`navigator.gpu` and an adapter can be acquired, otherwise it falls back to the
WebGL backend and reports which one is live in the status pill.
