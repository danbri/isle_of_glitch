# Autoresearch — closing the loop, and leaving it cranking

> **Still current.** Closing the by-hand loop, and the anti-reward-hacking guards — see [`WORLD-MANUAL.md`](WORLD-MANUAL.md) for how it
> sits in the world as a whole, and for the measurements behind it.

How to turn the by-hand research loop into an unattended one that runs across
laptop(s). Companion to `METHODS.md` (what the loop mutates + brain-is-body),
`energy-speculative-friction.md` (the conservation law any proposed mechanism must
obey), and `ASCENT.md` (the objective — *did a new transition open?*).

## 0. You are already doing this — by hand

`RESEARCH.md` is an autoresearch loop with a human (a Claude) in the seat. The
nightly commit stream *is* the loop: propose (a self-propulsion assay) → run a
fixed-budget experiment → measure against a control → **keep or RETRACT** (five
retractions in one line last night). What follows removes the per-iteration human
**without losing the rigour that produced those retractions** — because that rigour
is exactly what an unattended loop most needs and usually lacks.

## 1. The Karpathy loop, mapped

Propose a change → run a fixed-budget job → score it → keep past a significance bar,
roll back otherwise → journal → repeat.

| Karpathy | here | status |
|---|---|---|
| rewrite `train.py` | edit the primitive **schema** (METHODS.md) | schema not built |
| 5-min training run | fixed-budget seeded sim experiment | pieces exist (`soup-ascent`, assays) |
| val loss | ascent/transition objective **+ its control** | not unified / auto-controlled |
| significance bar | ≥ bar over N seeds | culture exists |
| git rollback + journal | git + `RESEARCH.md` | have it |

Three of five in hand. The two missing — the **schema** and a **single auto-scored
objective with the control baked in** — are the build.

## 2. The five pieces

1. **Mutation space = DATA** (not freeform code). The primitive schema: fields,
   couplings, windfalls, developmental encoding, physical constants as rows. The
   loop edits the schema; searching data is safe unattended. Freeform code would
   need a sandbox — avoid it; make every mechanism a schema entry (METHODS.md §2).
2. **The score runner** (§3) — the linchpin.
3. **The acceptance gate** (§4) — retraction as first-class.
4. **Rollback + journal** — git branch/commit per accepted change; logged rejections.
5. **Candidate generation** (§5) — param-perturb (free) + LLM-structural (occasional).

## 3. The linchpin: `score-config`

One command, deterministic, self-controlling:

```
score-config <schema.json> --seeds 8 --budget <steps>   →   result.json
```

```json
{
  "schema_hash": "…",
  "objective": { "name": "ascent_ladder_2nd_half", "value": 0.53, "se": 0.02 },
  "control":   { "name": "same_world_tournament",   "value": 0.50, "se": 0.02 },
  "net": 0.03,
  "confounds_checked": ["free_energy_removed", "monoculture_vs_mixed", "population_converged"],
  "friction_ok": true,
  "tests_pass": true,
  "notes": "…"
}
```

The control is **not** a separate command and **not** optional: a config's score
**is** objective-minus-confound. `net` is the *only* number the gate reads. This is
what stops the loop banking free-energy artifacts (the exact trap behind the
tough-food confound — a windfall adds energy, so "bigger population" isn't ascent
until the same-world tournament removes the free-energy term).

## 4. The acceptance gate — retraction, automated

Accept **iff** `tests_pass && friction_ok && net > baseline.net + bar &&
survives_adversarial_refute`. Otherwise **revert, and LOG the rejection** —
rejections are data, the map of what doesn't work, exactly like the retraction
commits.

**Adversarial refute:** before accepting, a skeptic re-runs the winner trying to
explain the gain *without* the proposed mechanism — ablate it, swap the control,
flag a converged population (identical median AND p90 = one animal measured N
times). Keep only if the skeptic fails. This is last night's retraction discipline,
turned into a gate.

## 5. Candidate generation (two tiers)

- **Tier 1 — parameter perturbation (free).** Jitter schema scalars/vectors,
  gradient-free. Proves the harness, costs nothing, runs forever. Keep it always on.
- **Tier 2 — LLM structural (occasional).** Given the journal + recent results, an
  LLM proposes a *structural* primitive edit — a new field, coupling, windfall, GRN
  motif — as a **schema diff**. ELM / FunSearch: an LLM mutation operator beats
  random when the genotype is structured. A local model keeps it free; the API for
  hard jumps. Fire tier-2 when tier-1 plateaus (loop-until-dry).

## 6. Leaving it cranking on laptop(s)

- **Inner experiment per laptop** — headless, seeded, fixed-budget. The bottleneck,
  and embarrassingly parallel.
- **Distribution = git-as-queue** (zero infra): `queue/` holds candidate schemas; a
  worker claims one by committing a lock (`queue/claimed/<id>.<host>`), runs
  `score-config`, commits `results/<id>.json`, appends to the journal. Provenance
  for free — you already commit heavily. (A tiny Tailscale-hosted coordination
  server can replace git-queue if you outgrow it.)
- **This is POET.** N laptops = N coevolving worlds; the driver transplants and
  branches winners. The scale buys *more worlds* (and, per METHODS.md §3, bigger
  *grown* brain-bodies) — not a hand-set bigger brain.
- **Human at LOW frequency.** The loop posts a daily digest to the group-chat / PR
  thread; you review, veto, re-aim. In the loop, not per-iteration.

## 7. The guards — or it accumulates garbage

Unattended optimisation **reward-hacks**. It will mint energy, exploit a render
metric, or converge the population so the metric reads a flattering constant — the
exact failure modes behind last night's retractions, which a *human-attended* Claude
caught by running controls. Automate the catching, or the archive fills with
nonsense:

- **Friction-law gate** — the `energy-speculative-friction.md` checklist, run
  automatically: no mint, conserved, global-uniform not local-targeted. Whose fixed
  gradient does a proposed windfall tap, and where does the loss go?
- **Control baked into the score** (§3) — `net` = objective − confound is the only
  number the gate sees.
- **QD archive, not a champion.** MAP-Elites over a behaviour/morphology descriptor
  space; keep the diverse frontier, not the single best. A lone scalar objective
  Goodharts and collapses diversity — keep the frontier so the search can't sit on
  one hill (this is also the standing "is it still climbing?" instrument at scale).
- **Retraction first-class** (§4) — the adversarial refute, and every rejection
  logged.
- **Determinism** — fixed seeds; the objective must be stable across identical runs.
  A nondeterministic sim (today's drift / NaN) poisons the loop; see §8.

## 8. Sequencing — do NOT close the loop yet

1. **Stabilise the sim.** The active drift/NaN bugs manufacture artifacts; a loop on
   them chases noise and banks nonsense. Green light = *a config scored twice gives
   the same `net` within SE*.
2. **Build the primitive schema** (mutation space = data).
3. **Build `score-config`** — objective + control + friction gate + tests, one
   command, deterministic JSON out. The linchpin; everything hangs off it.
4. **Close the loop with tier-1** and *validate the harness against planted cases*:
   seed it one known-good change and one known-mint change — it must **accept the
   first and reject the second**. A loop that can't reject a mint is not ready.
5. **Add tier-2** (LLM structural), the **QD archive**, and **git-queue**
   distribution.
6. **Crank across laptops; review digests.**

The prize is not a demonstrated infinite climb (`ASCENT.md` — that's a horizon). It
is a loop that reliably **manufactures the next transition** and **files an honest
report when it can't**. Build the honest-report machinery first; the manufacturing
follows.
