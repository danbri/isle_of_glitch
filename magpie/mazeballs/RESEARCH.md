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

## Wave 2 result: the first confirmed capability gain

**`FOOD_CLUSTERS=9` + `FOOD_RELOCATE_THRESH=0.15`** — food drawn around 9 cluster
centres instead of scattered uniformly, and a patch that decays below 0.15 stock
**relocates to a fresh point** instead of regrowing in place.

| | baseline | accepted |
|---|---|---|
| score | 0.1892 ± 0.0067 | **0.2100 ± 0.0075** |
| sensing | 0.0367 | **0.0874 (+138%)** |
| taxis | 0.0107 | 0.0112 |
| forage | 0.852 | 0.535 |

Confirmed at **16 seeds** after the 8-seed run came in just under the bar, with
the standard error shrinking as 1/√2 predicts. Delta +0.0208 against a bar of
0.0201 — the first change in two waves and 45 experiments to clear it on
capability rather than on rescaling.

This is not a viability trick: foraging *fell* by more than a third and stayed
well clear of the 0.30 floor, while sensing more than doubled. The population is
losing food and gaining sensory dependence, which is exactly the trade the whole
project was trying to buy.

**Honest caveat**: `taxis` stayed flat. So the ablation says sensing is
load-bearing, but the steering-to-bearing correlation does not confirm classical
directed chemotaxis. Something is using the senses in a way this measure does
not capture, and finding out what is the obvious next question.

Why it works, and why the two ingredients are both needed: clustering makes
undirected coverage fail, because food is no longer everywhere. Relocation on
depletion makes *memorised* geography fail, because a patch you emptied is gone
rather than refilling where you left it. Together the only remaining strategy is
to find out where food is now — which is what sensing is for. Narrowing the
sensing kernel alone did nothing, which pins the cause on food density rather
than sensor range.

## Where the compute crossover actually is

Step cost against CTRNN size, POP=192, deno/wasm:

| CELLS | ms/step | recurrent MACs/step |
|---|---|---|
| 12 | 6.9 | 0.03M |
| 48 | 8.2 | 0.44M |
| 100 | 13.8 | 1.92M |
| 200 | 30.9 | 7.68M |
| 400 | 220.6 | 30.7M |

From 12 to 48 the arithmetic grows 16x and the time grows 1.2x — the recurrent
update is free, and everything being paid for is dispatch. From 200 to 400 the
arithmetic grows 4x and the time grows 7x — now compute-bound, and superlinear
as the working set outgrows cache. **The crossover is around CELLS 100-200.**

Note the first version of this measurement was wrong: `bench.js` did not pass
`--cells` through to the sim, so it measured CELLS=12 four times and the spread
was contention noise. The corrected tool now varies it.

### On modelling the population as one large sparse CTRNN

100 networks of 100 nodes is exactly a block-diagonal 10,000-node system, and
that framing is right. Two qualifications from the numbers above:

- The recurrent update is *already* a single batched matmul
  (`[POP,1,C] x [POP,C,C]`), not POP separate launches, so flattening to one
  sparse matvec changes neither the launch count nor the FLOP count.
- What the flattened form does buy is the **off-block-diagonal entries**: once
  the population is one state vector, inter-organism coupling is structurally
  free. That is the most interesting unexplored direction here, and it is why
  wave 2's predators failed — they were scripted, so agents faced a fixed rule
  rather than a coupled system that adapts with them.

### RK4 is the right trade for a dispatch-bound system

The integrator is explicit Euler. With tau in [0.24, 1.89] and DT 0.018, DT/tau
runs 0.01-0.075 — far inside Euler's stability limit, so the small step is being
paid for accuracy, not stability. Fourth-order accuracy buys back much more than
the 4x arithmetic it costs, giving fewer and fatter kernel launches for the same
simulated time. That is exactly the right direction when overhead dominates.

The mechanics will not tolerate the same step (collisions, depletion, boundary
clamping), so this wants a deliberate multirate scheme: RK4 the neural ODE on a
coarse step, Euler the physics on a fine one.

### What would justify a GPU

At ~10 TFLOP/s and ~5-10 us launch overhead, being compute-bound needs roughly
500M MACs/step. That is CELLS ~1600 at POP 192, or POP ~50,000 at CELLS 100, or
~22,000 nodes densely coupled. A block-diagonal 100x100 system is 1M MACs — still
firmly launch-bound, where a GPU loses to WASM exactly as the native binding did.

Bigger networks, genuine inter-organism coupling, and RK4 all push the same way:
more arithmetic per launch. The first two are independently the most promising
unexplored science, so the performance and research arguments coincide.

## Block-diagonal vs flattened: measured

Prior art — `danbri/mazeballs/continuous-time-networks` — exposes
`CTNet({size, init_weights})` with a 1-D state vector and an async generator
yielding `states`, `outputs` and `yprime`. That API is genuinely agnostic
between "many small networks" and "one huge one": a population of 192 organisms
of 12 cells *is* a 2304-node CTRNN with block-diagonal weights, same call.
Notably its default backend order is WASM > WebGL > CPU, which independently
matches the ordering measured here.

What the choice costs, on wasm:

| form | time | MACs | effective throughput |
|---|---|---|---|
| batched `[192,1,12]x[192,12,12]` | 0.60 ms | 0.03M | 0.05 GMAC/s |
| dense flat `[1,2304]x[2304,2304]` | 3.71 ms | 5.31M | 1.43 GMAC/s |
| dense flat `[1,10k]x[10k,10k]` | 51.6 ms | 100M | 1.94 GMAC/s |

Two things fall out.

**For independent organisms, batched wins and flattening is pure waste.** The
dense form does 192x the arithmetic — almost all of it multiplying zeros — for
6x the wall time. Do not flatten for performance.

**But the batched form runs at 1/30th of the achievable arithmetic throughput.**
0.05 GMAC/s against 1.94 for the large dense op: the current configuration is
not compute-limited at all, it is entirely overhead-limited. That is the same
conclusion the CELLS scaling table reached, from a different direction.

The consequence for hardware is the useful part. The dense 10k-node op is 100M
MACs, which a mid-range GPU clears in tens of microseconds — while the current
batched op stays launch-bound at ~10 us however small it is. **On a GPU, a
fully coupled 10,000-node population costs about what the present uncoupled
2304-node one already costs.** Coupling becomes nearly free at exactly the point
the hardware changes.

So flattening is not an optimisation, it is an enabler: it only pays once the
off-diagonal blocks are non-zero, and that is precisely the inter-organism
coupling that wave 2's scripted predators could not provide.

Also worth noting: `yprime` being a first-class output in that API is the natural
seam for a higher-order integrator — RK4 needs derivative evaluations at
intermediate points, which is exactly what it already yields.

## A projection error, and what it revealed

I claimed the distinct-patches reward would clear the bar once the gate was
fixed, deriving +0.023 by dividing the reported score by the reported viability.
The arithmetic on point estimates was right; the inference was not. It silently
assumed the baseline's standard error carried across to a different reward
shape. Re-run properly, that reward roughly **doubles** seed-to-seed variance
(sd 0.035-0.039 against baseline 0.019), which lifts the bar past the effect:

| VISIT_SCALE | score ± se | delta | bar | sensing | taxis |
|---|---|---|---|---|---|
| 0.10 | 0.1731 ± 0.0078 | −0.016 | 0.021 | 0.036 | 0.061 |
| 0.12 | 0.1886 ± 0.0137 | −0.001 | 0.031 | 0.029 | 0.094 |
| 0.15 | 0.2110 ± 0.0137 | +0.022 | 0.031 | 0.081 | 0.088 |
| 0.22 | 0.1960 ± 0.0127 | +0.007 | 0.029 | 0.054 | 0.014 |

Nothing adopted. This is the harness catching its own author making exactly the
mistake it was built to prevent — a change in the *variance* is as capable of
deciding a comparison as a change in the mean, and point estimates hide it.

### The complementarity hypothesis

The two most promising changes have mirror-image profiles:

| | sensing | taxis |
|---|---|---|
| clustered relocating food (adopted) | 0.037 → **0.087** | 0.011 → 0.011 |
| distinct-patches reward (not adopted) | small move | 0.011 → **0.088** |

One moves sensing and not taxis; the other moves taxis and not sensing. That is
what two *different* bottlenecks look like, rather than two attempts at the same
one. Testing the combination is now the highest-value experiment available, and
it also bears on the open question left by the adopted change — sensing became
load-bearing while taxis stayed flat, so whatever the organisms are doing with
their senses is not classical directed chemotaxis. A reward that specifically
elevates taxis is the natural probe.

If they compose, that is the strongest result the project has produced. If they
do not, both changes are hitting one underlying constraint, which is equally
worth knowing.

## Wave 2 (parallel worktree): escaping the open-loop attractor through selection

This ran as a sibling wave-2 mandate, in a separate worktree off the same
wave-1 endpoint (`21ca4d9`), attacking a different bottleneck than the
environment mandate above: it does not contain the clustered-relocating-food
change, and was integrated onto trunk afterwards (see "Integrating the two
wave-2 mandates" below).

Mandate: attack the finding that plain fitness-truncation selection collapses
founder lineages to 1-3 within three generations and actively discards sensing,
because open-loop wandering works soonest. 8 seeds this time, not 4.

### The viability gate was still a proportional multiplier

Before measuring anything, `tools/score.js` needed a fix that had already
landed in a sibling wave-1 worktree but not in this one: `viability` was
`base.top / 1.0`, a proportional multiplier on the whole capability term. That
double-penalises difficulty — wave 1's environment mandate found settings that
raised `sensing` 43% and still scored as regressions purely because harder
worlds forage less. A quality-diversity or novelty scheme trades some foraging
efficiency for exploration by design, so the old gate would have scored
exactly this wave's real wins as losses. Changed to a threshold,
`clamp01(base.top / 0.30)`: anything foraging above 0.30 counts as alive, and
capability is judged on its own. `capability` (`score / viability`) is now
reported alongside `score` so the two are never conflated. Baseline and every
experiment below were (re-)measured under the corrected gate.

```
baseline, 8 seeds x 8 generations x 300 steps:
score 0.1884 ± 0.0059   (== capability; viability pinned at 1.0)
sensing 0.038   taxis 0.012   generalisation 0.965   selection 0.041   diversity 0.200
forage 0.873
```

### Six experiments

| # | change | score ± se | Δ vs baseline | 2×combined se | verdict |
|---|---|---|---|---|---|
| 1 | niche selection (QD, 10 angular position sectors) | 0.1825 ± 0.0067 | −0.0059 | 0.0179 | no significant change |
| 2 | niche selection + multi-spawn(2) | 0.1971 ± 0.0089 | +0.0087 | 0.0214 | no significant change |
| 3 | multi-spawn(2) alone, truncation selection | 0.1920 ± 0.0101 | +0.0036 | 0.0234 | no significant change |
| 4 | novelty-weighted fitness selection alone | 0.1854 ± 0.0081 | −0.0030 | 0.0200 | no significant change |
| 5 | **novelty-weighted fitness + multi-spawn(2)** | **0.2137 ± 0.0056** | **+0.0253** | **0.0163** | **IMPROVEMENT** |
| 6 | novelty-weighted fitness + multi-spawn(3) | 0.1952 ± 0.0118 | −0.0185 vs #5 | 0.0261 vs #5 | no gain over #5 |

Niche selection (one fittest agent per angular sector of final position,
backfilled with the next-fittest overall wherever a sector is empty — always
exactly `ELITES` elites, so downstream tensor shapes and lineage bookkeeping
are unaffected by which scheme ran) raised `diversity` a little (0.20 → 0.25)
on its own and in combination, but never moved `sensing` or `taxis`, and never
cleared the bar. Multi-spawn alone replicated wave 1's selection agent almost
exactly (`selection` 0.041 → 0.18, `sensing` unchanged, no significant overall
move) — the mechanism is real but insufficient by itself, exactly as wave 1
found.

**Novelty-weighted fitness selection** — rank by fitness plus a k-nearest-
-neighbour novelty bonus in final-position space (both z-scored so they
combine on a common scale), instead of truncating on fitness alone — was also
null in isolation. Combined with 2-spawn fitness averaging it cleared the bar:
`sensing` 0.038 → 0.059 (+56%), `generalisation` 0.965 → 0.987, `selection`
0.041 → 0.127, at the cost of `forage` 0.873 → 0.627 (still comfortably above
the 0.30 viability floor). This is precisely the shape of result the gate fix
exists to let through: a real sensing/generalisation gain purchased with
foraging efficiency, which the old proportional gate would have read as a
39% regression instead of a win. Pushing to 3 spawns did not compound the
gain — score fell to 0.195 and `se` grew to 0.012, so 2 spawns is kept, not 3.

### Adopted

`--select novelty --spawns 2` (via `tools/run.js` / `evolveFor`'s `spawns`
option) is accepted as a validated headless-evolution configuration:
**0.2137 ± 0.0056 vs baseline 0.1884 ± 0.0059, Δ +0.0253, clears 2×combined
se (0.0163).**

`DEFAULTS.SELECT` stays `'trunc'` — a true no-op — because the win depends on
multi-spawn averaging, which lives in `evolveFor` and only the headless
runners call. The live page instantiates `EvoDevoSim` with no config override
and calls `sim.evolve()` directly once per epoch; it never calls `evolveFor`,
so it cannot benefit from multi-spawn without a change to `index.html`'s own
evolution loop, which is out of scope here. Novelty selection *alone* (no
multi-spawn) was not a significant win, so it is not safe to make the
browser's default either. The accepted change is real but is, honestly, an
offline-training-pipeline result, not a live-page one: useful for pre-training
a population (`exportPopulation`) to load into the browser via
`importPopulation`, not for the click-to-evolve loop as shipped.

### Rejected

- Niche (QD) selection alone or combined with multi-spawn: never cleared the
  bar; raised `diversity` modestly but left `sensing`/`taxis` untouched.
- Multi-spawn evaluation alone: replicates wave 1's real `selection` gain but
  is insufficient alone, as wave 1 also found.
- Multi-spawn(3) on top of the accepted novelty+spawns(2) configuration: no
  further gain, noisier (se 0.0056 → 0.0118).

### What this means for the mandate

Quality-diversity elitism on a purely spatial descriptor (niche or k-NN
novelty in final-position space) does not, by itself, make sensing valuable —
it protects lineages that end up somewhere different, which an undirected
wanderer can do as well as a directed forager. What did move `sensing` was
novelty selection *combined with* averaging out spawn-position luck: with
noisy single-spawn fitness, novelty selection may have mostly been rewarding
agents whose lucky spawn point put them somewhere the population's other
lucky spawns didn't reach; multi-spawn evaluation removes that confound and
lets whatever a genome's final position says about its genotype (rather than
its starting point) actually differentiate it. Neither piece alone was
enough; the combination was.
