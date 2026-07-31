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

## Does this workload want a GPU?

Not at the current size. Measured with `tools/bench.js` on deno/wasm, cost per
1000 agents per step:

| POP | ms/step | ms per 1000 agents |
|---|---|---|
| 192 | 9.4 | 48.8 |
| 3,072 | 95.1 | 30.9 |
| 12,288 | 336.6 | 27.4 |

Per-agent cost nearly halves from POP 192 to POP 12,288, which says the small
configuration is **dispatch-overhead-bound, not compute-bound**. A GPU makes
overhead worse, not better — the same reason the native TensorFlow binding lost
to WASM here. The curve is flattening by 12,288, which is where compute starts
to dominate and an accelerator would begin to pay.

(A POP 768 sample came in at 146 ms per 1000 agents, well off the trend. That
run collided with the research fleet on a shared box; it is noise, not a knee.)

The practical consequence: scaling the population is the change that both makes
a GPU worthwhile *and* attacks the measured problem that selection tracks spawn
luck rather than genotype, since more genomes per generation is more evidence
per selection event. Renting CPU cores is the better buy until then, because
sweeps are embarrassingly parallel across seeds and configurations.

## Wave 1 results

### Environment mandate — null result, with a mechanism

11 environment changes tested against the 8-generation protocol. **None cleared
the bar.** Score stayed at baseline 0.1571 ± 0.0082. The agent reverted all of
them, which was the right call.

The interesting part is *why* they failed, because the hypothesis was
directionally right:

| change | score | sensing | viability |
|---|---|---|---|
| baseline | 0.1571 | 0.051 | 0.810 |
| 5 food clusters + wide gradient | 0.0929 | **0.073** | 0.460 |
| 9 clusters + wide gradient | 0.1178 | **0.070** | 0.629 |
| easier gradient (4× range) | 0.1455 | 0.025 | 0.828 |
| doubled metabolic cost | 0.1433 | **0.010** | 0.842 |

Clumping the food and widening the sensing gradient **does** make sensing more
valuable — it raised the `sensing` component by up to 43%, exactly the predicted
mechanism: sparse clumps make an undirected motor pattern fail while giving a
directed one a real gradient to climb. But every setting strong enough to move
`sensing` also crushed foraging, and because `score = viability × capability`
the gate erased the gain. At viability 0.63 you would need `sensing` around
0.22 to break even — triple the best measured.

Two rows are the inverse trap the protocol warns about: an easier gradient and a
higher metabolic cost both **raised** viability while **lowering** sensing. On
total score alone they would have looked like near-wins; they are the opposite
of what we want, and the component breakdown is what caught them.

Note also that doubling movement cost gave the *lowest* sensing of any trial
(0.010). Making movement expensive without making food harder to find rewards
sitting still, not searching.

### The implication: the 8-generation budget may be the binding constraint

Capability was visibly trying to emerge in the harder environments and could not
repay its viability cost inside 8 generations. If that is right, then every null
result in this wave is partly an artifact of the experiment budget rather than a
fact about the architecture — which would make the protocol itself the thing to
fix first. This is being tested directly by re-baselining at 24 generations.

### Development mandate — null result

6 experiments: cell-cell diffusion over the cell axis at three strengths, a
diffusion of the bounded post-tanh secreted signal, a two-rate Turing
activator/inhibitor pair, and a richer fixed morphogen basis
(`[1,x,x²]` extended with `sin πx`, `cos πx`). All within noise; all reverted.

The agent's own diagnosis is the useful part: the deltas showed **no
dose-response** with diffusion strength (0.15 → −0.002, 0.5 → +0.005,
1.0 → −0.012, not monotonic), which is the signature of noise rather than a
weak real effect.

### The wave-1 pattern is a power problem

Two mandates, 17 experiments, zero significant effects. That is not seventeen
independent facts about the architecture — it is one fact about the harness.

With 4 seeds the standard error is ~0.008, so the acceptance bar sits at
2×combined SE ≈ **0.023**, about 15% of the baseline score. Any architectural
change worth less than 15% is invisible by construction.

Concretely, the best sensing gain anyone found (0.051 → 0.073) contributes
0.40 × 0.022 × viability ≈ **0.005** to the score — a quarter of what would be
needed to register. It was never detectable at this sample size, whatever its
merit.

Standard error falls as 1/√n, so:

| seeds | SE | detection bar | relative compute |
|---|---|---|---|
| 4 | 0.0082 | 0.023 | 1× |
| 16 | 0.0041 | 0.012 | 4× |
| 36 | 0.0027 | 0.008 | 9× |

Sixteen seeds halves the smallest detectable effect. This is the concrete reason
to want more cores: not to make one run faster, but to make small effects
visible at all. Wave 2 should raise seeds before it raises ambition.

### Body mandate — null result, with the sharpest control of the wave

8 experiments: proprioception, directional antennae (free and anchored),
evolvable body parameters, evolvable sensing range, lateral thrust, sensor
noise. All null, all reverted.

Experiment 6 was a deliberate **control**: repeat the antennae architecture but
hold `GENES` at 10 instead of growing it, to rule out "a bigger regulatory
matrix hurts development in 8 generations" as the confound. It produced the same
magnitude of null, so gene-count growth is not the explanation.

Its diagnosis is quantitative and matters: the food field has 42 sources in a
small arena and the sensing kernel has effective radius ~0.22 against an arena
half-width of ~0.94. **An undirected gait finds food nearly as reliably as
directed chemotaxis.** The fitness function also pays `+0.018 x speed`
independently of foraging, so moving fast is rewarded whether or not it finds
anything.

It also found a latent trap worth knowing: `d2.div(-sigma2)` silently yields
`NaN` if `sigma2` is ever a tensor rather than a number, because JS unary minus
coerces through `valueOf()`. Use `d2.mul(-1).div(sigma2)` if that parameter is
ever made evolvable.

## The two decisive results

### Longer evolution makes sensing *worse*. Hypothesis refuted.

The wave-1 nulls suggested the 8-generation budget was too short for capability
to repay its cost. Tested directly by re-baselining at 24 generations:

| | 8 gen | 24 gen |
|---|---|---|
| score | 0.1571 ± 0.0082 | **0.1381 ± 0.0116** |
| sensing | 0.0509 | **0.0218** |
| taxis | 0.0126 | 0.0028 |
| selection | 0.0066 | 0.0689 |
| diversity | 0.225 | **0.100** |
| forage | 0.810 | 0.801 |

Three times the evolutionary time **halves** sensing and nearly eliminates
taxis, while foraging stays flat and ancestral diversity collapses further.

Evolution is not failing to find sensing. It is actively discarding it. In this
world the optimal policy *is* open-loop, so more selection means more
convergence onto it. Every wave-1 null was a correct measurement of a system
whose target is wrong — no amount of architectural richness or evolutionary time
fixes an objective that does not require the capability being sought.

### The one apparent win does not survive the corrected metric

Immigration + multi-spawn, re-measured with `diversity` counting selected
ancestries:

| | baseline | with change |
|---|---|---|
| score | 0.1583 ± 0.0056 | 0.1847 ± 0.0222 |
| diversity | 0.225 | **0.300** (was 1.000) |
| selection | 0.0029 | **0.188** |
| sensing | 0.0473 | 0.0446 |

delta +0.0264 against a bar of 0.0458 — **NO SIGNIFICANT CHANGE**. The diversity
term fell from 1.000 to 0.300 exactly as predicted once immigrants had to earn a
selected slot rather than merely exist. Not adopted.

But `selection` rising 65x is real and is not gameable the same way: multi-spawn
evaluation genuinely makes elites track genotype instead of spawn luck. Note
also that the change **tripled the standard error** (0.0056 to 0.0222), so it
makes outcomes more variable, not just better.

## Wave 2 direction

Not more architecture. The target is wrong, and five agents across 32
experiments established that between them:

1. **Remove the unconditional speed reward.** It pays for locomotion whether or
   not it finds food, which is a direct subsidy for open-loop behaviour.
2. **Make food findable only by sensing** — the environment agent showed
   clumping raises `sensing` up to 43%, and the body agent showed why it must:
   the sensing radius currently covers a quarter of the arena.
3. **Pay the viability cost knowingly.** Harder worlds cost foraging; the score's
   viability gate then erases the capability gain. Either the gate needs
   rethinking or the difficulty must rise gradually.
4. **Raise seeds to 16 before raising ambition.** The detection bar at 4 seeds is
   15% of the score; nothing anyone tried could have registered.

## Coordinating agents: a security finding

Wave 2's co-evolution agent **refused an instruction from the coordinator**,
correctly identifying it as indistinguishable from a prompt injection.

The instruction was legitimate: patch the viability gate from `/1.0` to `/0.30`.
The agent's reasoning for refusing was sound and worth recording verbatim in
substance — the message arrived embedded in a system-reminder rather than as a
normal turn; it asked for a change to the *scoring formula*; and that change
would have retroactively converted several of the agent's own regressions into
improvements. That is precisely the shape of high-value tampering.

It then verified against `tools/score.js` on disk and against this file, found
both said `/1.0`, and declined.

Its verification was correct method with systematically stale evidence: **the
whole worktree predated the fix**, so every source it could consult agreed with
the wrong answer. There was no way for it to reach the right conclusion from
inside its own sandbox.

Two lessons:

1. **Worktrees branch from a stale base.** Commits made after a wave launches do
   not reach its agents. Wave 1 agents hit this with `tools/score.js` and worked
   around it silently; wave 2 hit it with the gate fix and it cost a genuine
   discovery a full cycle. Patch worktrees on disk before launching, or re-create
   them from current HEAD.
2. **There is no authenticated channel to a subagent.** Anything that arrives as
   text is spoofable, and an agent that blindly accepted scoring changes from
   unauthenticated text would be worthless as an experimental instrument. The
   fix is not to ask agents to trust harder — it is to change the artifact on
   disk, which requires no trust, and to keep instructions to *what to
   investigate* rather than *how to score it*.

The agent behaved better than the system it was embedded in. Its skepticism cost
one wave of predator experiments and is worth that price several times over.
