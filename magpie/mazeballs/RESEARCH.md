# Autonomous research loop

An [autoresearch](https://github.com/karpathy/autoresearch)-style loop for this
simulation: an agent proposes a change to the architecture, runs a fixed-budget
experiment, measures it against an objective, keeps the change if it clears a
significance bar, rolls it back if it does not, and repeats.

Karpathy's original runs a 5-minute nanochat training job per experiment and
lets the agent rewrite `train.py` — architecture and optimiser, not just
hyperparameters. This is the same loop with a different inner job.

## The objective

`tools/score.js`. **Not fitness.** Two measured reasons:

1. A population that finds one food patch and sits on it scores maximally on
   fitness while being incapable of anything. That is what the original build
   evolved, and it is what "optimise fitness" gets you here.
2. A 24-cell sweep measured spread-across-seeds of **0.250** against
   spread-across-parameters of **0.026**. A loop hill-climbing a single-run
   fitness number would spend its entire budget chasing seed noise.

So the score is a composite of the diagnostics that separate capability from
luck, averaged over K independent seeds, reported with a standard error:

| component | weight | what it measures |
|---|---|---|
| `sensing` | 0.40 | fraction of top-quartile fitness lost when every sense is scrambled |
| `taxis` | 0.20 | steering-to-bearing correlation in excess of the empirical null |
| `generalisation` | 0.15 | holding up on a field layout never selected on |
| `selection` | 0.15 | elites beating the population median on fresh spawns, in sd |
| `diversity` | 0.10 | surviving founder lineages against their real ceiling |

multiplied by a **viability gate** (`top-quartile fitness / 1.0`, clamped) so a
population that forages nothing scores nothing. Without the gate, killing the
population would be a cheap way to make every ablation look harmless.

## The significance bar

```
node tools/score.js --seeds 1,2,3,4 --generations 8 --steps 300 --restarts 1 --compare baseline.json
```

A change counts only if it clears **2× the combined standard error** of the two
means. `--compare` prints `IMPROVEMENT` / `NO SIGNIFICANT CHANGE` / `REGRESSION`
and sets the exit code accordingly, so it can drive an automated accept/rollback.

This bar is the whole point. Every effect measured on this system so far that
was not checked against seed noise turned out to be noise, including one that
reached the README before a sweep retired it.

## Baseline

Wave 1 baseline, on `main` at `f1fb6df`, 4 seeds × 8 generations:

```
score 0.1571 ± 0.0082
sensing 0.051   taxis 0.013   generalisation 0.988   selection 0.007   diversity 0.225
forage 0.810    viability 0.810
```

Read that as a diagnosis. `generalisation` is near its maximum only because
nothing layout-specific has evolved to lose. The real headroom is `sensing`
(0.95 unclaimed, weight 0.40), `taxis` (0.99), and `selection` (0.99) — which is
to say: **nothing in this system currently uses its senses, and selection is not
tracking genotype.** A change that fixes either moves the score a lot.

## Rules for an experiment agent

- Work in an isolated git worktree. Modify only `lib/` and `tools/`; never
  `index.html`.
- `lib/evodevo.js` is imported by the browser page. No Node-only APIs, no new
  npm dependencies.
- Keep everything batched over the population axis. Looping over 192 agents in
  JavaScript will make experiments too slow to run.
- Use `sim.rng.int()` to seed TensorFlow's random ops. Unseeded randomness
  destroys the reproducibility the significance test depends on.
- If you change the sensor layout, update `SENSOR_GROUPS` and the masks in
  `conditions()` to match, or the ablations silently measure the wrong thing.
- If you change reproduction, keep lineage bookkeeping meaningful or the
  `diversity` component becomes a lie.
- **Run experiments synchronously.** A score run blocks for a few minutes; let
  it. Three of the five agents in wave 1 backgrounded their runs and then
  stalled waiting for a notification that they were themselves responsible for
  producing, losing an experiment cycle each. Block on the call with a generous
  timeout instead.
- Commit each accepted change with its measured before/after numbers.
- Report the component breakdown, never just the total. A gain that is entirely
  `forage`/`viability` with `sensing` still at 0.05 is not a capability win.

## Integrating a wave

Agents in a wave all edit `lib/evodevo.js` in separate worktrees, so their
diffs will conflict. Merging is not a matter of resolving the text.

**Re-measure every change on top of the accumulated trunk.** A change that
clears the bar in isolation need not clear it in combination — richer
development and evolvable sensor geometry may be substitutes rather than
complements, and two changes that each fix the same bottleneck will not add up.
Integration order therefore matters, and the honest procedure is:

1. Rank accepted changes by their measured isolated delta.
2. Apply the largest, re-measure against the current baseline, keep only if it
   still clears the bar.
3. Re-baseline, then attempt the next. Discard anything that no longer pays.
4. Verify the browser page still runs after each merge — `lib/evodevo.js` is
   shared, and a change that is fine headless can still break the renderer
   (sensor count, world field names, tensor shapes read by the snapshot).

Expect to keep fewer changes than were accepted. That is the correct outcome,
not a failure of the wave.

## Known traps

- **Making the world easier inflates the score** through the viability gate
  without any capability appearing. Always check the components.
- **Short epochs select for lucky spawns.** At ~2s of simulated time, 7–9 of the
  10 "elites" are simply agents that spawned on top of a patch (top-10 mean
  distance to nearest patch 0.021–0.034 against a population median of 0.117).
- **Founder lineages can only fall.** Every child descends from an elite, so
  from generation 1 the ceiling on ancestral diversity is `ELITES`, not `POP`.
  Measuring it against `POP` reads a total monoculture as healthy.
- **Saturation must be measured on a settled network.** Immediately after a
  reset nothing has railed yet and it reads ~0 regardless of the real regime.
