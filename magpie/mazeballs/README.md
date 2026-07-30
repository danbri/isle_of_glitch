# magpie/mazeballs — Evo/Devo Field

A single-page artificial-life piece. Every organism carries a genome that is a
10-node gene-regulatory CTRNN; 48 integration steps of that network *develop*
the genome into a 12-cell embryo, whose expression levels are read as ligands
and receptors and wired into a 12-node sensorimotor CTRNN. That adult network
drives differential thrust through a world of nutrient and toxin fields and
rigid circular obstacles. Fitness accumulates over an epoch, the top 10 are kept
as elites, and the rest of the population is resampled and mutated from them.

The whole population — genomes, phenotypes, bodies and world — lives as
TensorFlow.js tensors on WebGPU (or WebGL, or CPU, in that order of preference).
Only a compact per-frame snapshot is read back for drawing. The visualiser is
hand-written WebGL2 with instanced draws.

Live: <https://danbri.github.io/isle_of_glitch/magpie/mazeballs/>

## Controls

| input | effect |
|---|---|
| click the field | select an organism; the inspector follows it and traces its path |
| `space` / **pause** | pause and resume |
| `s` / **step** | advance a single simulation step |
| `e` / **evolve now** | end the epoch early: select elites, redevelop, restart bodies |
| `r` / **new biosphere** | fresh nutrient/toxin field *and* fresh random genomes |
| speed | simulation steps per animation frame (1–10) |
| mutation | fraction of genome loci perturbed per offspring (1–30%) |

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
