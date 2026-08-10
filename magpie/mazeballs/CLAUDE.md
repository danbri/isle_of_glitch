# Working notes for Claude — mazeballs (evo-devo / open-ended evolution)

`magpie/mazeballs/` is a lawful evo-devo world: cells with material properties,
contact chemistry, fields, and conserved energy, evolving brains-in-bodies, aimed
at open-ended ("Cambrian") ascent. **Read this before working here — it is the laws
and the map.** (Ignore the rest of the repo; see the root `CLAUDE.md`.)

## The laws — non-negotiable, and hard-won

1. **First Law: nothing high-level is a primitive.** "predator", "prey", "species",
   "organism", "muscle", "armor", "locomotion" are *regions* of a low-level space —
   never types the kernel branches on, never role knobs (`predatorSpeed`), never
   interaction matrices. Behaviour is a CTRNN's output from sensing chemistry. **If a
   change names a behaviour, it is wrong.** (Full: `WORLD.md`, `primitives.md`.)
2. **Friction law: never mint, always conserve.** Every joule traces to the fixed
   sun and loses to heat; one currency; global-uniform inflow is legitimate,
   local-targeted grants are fiction; a windfall is a new straw into the same drink,
   not a new drink. Loose energy accounting is reward-shaping in disguise. **Test: if
   nothing is ever unaffordable, you minted somewhere.** (Full:
   `energy-speculative-friction.md`.)
3. **Affordance, not forcing.** Terrain/field couplings must be things a cell
   *actively exploits*, where the *passive* case nets zero — else you get the
   global-drift bug. (Full: `primitives.md`.)
4. **Distrust every single run.** This project's edge is its measurement + retraction
   culture: an ancestral tournament (not absolute fitness), a **required conserved
   control** (monoculture / same-world) baked into every score, and **retraction as a
   first-class outcome**. Claims that skip the control get retracted — five in one
   night. Run the control; log the rejection; never publish wishful thinking.

## Current state — honest (so you don't over-claim)

We are at the pre-Cambrian "before": **bodies twitch/shudder but do not move.**
Locomotion has been *retracted* (the displacement was bodies tearing apart /
drifting, not swimming). The GPU sim has active bugs (drift / NaN / swelling) that
poison measurement. Evolution demonstrably acts — including *through* development
(segments 2.8→0.5) — and one multicellular transition is shown in a CPU prototype,
but **no integrated sense→decide→move creature exists yet.** "Infinite ascent" is a
horizon, not a demonstrated state. The by-hand autoresearch loop (`RESEARCH.md` +
the retraction commits) works; it is *not* yet closed/unattended.

## Sequencing — what is premature

- **Do NOT close the autoresearch loop unattended until the sim is STABLE** — green
  light = a config scored twice gives the same `net` within SE. Bugs poison the loop.
- **Do NOT chase scale / differentiation / ascent before a creature BEHAVES.** 358k
  cells that twitch is the twitch-not-move symptom multiplied; scale is not the
  bottleneck, the closed loop is.
- **The critical path is ONE closed sensorimotor loop through development, in a world
  where it pays:** the dev-map must reach motor + sensor wiring; grip (an affordance)
  must beat the scallop theorem; contact-economics must make moving pay; the world
  must be uncoverable.

## The map (reading order)

- **`WORLD-MANUAL.md` — READ THIS FIRST.** The single current description of what
  the world is and how it works, with the measurement behind each choice and the
  retractions kept in place. Where any other document disagrees with it, the
  manual is right and the other is history.


- **`MISSION.md`** — the ambition (Cambrian, self-starting arms race). NB: its "17×
  locomotion" headline is **retracted** by `RESEARCH.md` — reconcile before citing.
- **`primitives.md`** — the configurable kernel: material vectors, contact + substrate
  functions, conserved energy, tradeoffs. **The schema everything hangs off.**
- **`energy-speculative-friction.md`** — the conservation law, in full.
- **`METHODS.md`** — autoresearch over primitives; brain-is-body (one developmental
  encoding grows neural/muscular/skeletal/optical; scale *grows* the brain, doesn't
  *set* it).
- **`eggs.md`** — reproduction in time/space; polyembryony; eggs as a containment
  transition and a Markov blanket.
- **`ASCENT.md`** — the category-free instrument, the bounded-staircase result, the
  next (differentiation) experiment.
- **`AUTORESEARCH.md`** — closing the by-hand loop; the `score-config` linchpin; the
  anti-reward-hacking guards; laptop(s) git-queue; the don't-close-yet sequencing.
- **`RESEARCH.md`** — the running ledger of what has actually been measured.
- **`LAB-NOTES.md` / `WORLD.md` / `ARCHITECTURE.md` / `CELLS.md` / `RUNNING.md`** —
  background, world design, and how to run.

## Tone

Write plainly. This applies to prose, commit messages, code comments and blog
posts equally.

- **State what was measured and what it means.** No build-up, no reveal, no
  "it turns out". A result is not a story with a twist.
- **No absolutes from single measurements.** "There is no economy of scale
  anywhere in the world" was drawn from one correlation and was false. If a
  claim is about a default, say so — "the current transports nothing" was true
  of `flowStr 1.0` and untrue of the mechanism, and the difference is the whole
  finding.
- **Report the scope of a claim with the claim.** At which parameters, at which
  horizon, over how many replicates. A number without those is not a result.
- **No autobiography.** Nobody needs the sequence of dead ends that led
  somewhere, except in `RESEARCH.md`, where the retractions ARE the content and
  belong in the order they happened.
- **Short.** If a paragraph is restating the previous paragraph with more
  adjectives, delete it.
- **Say "not measured" or "I do not know" rather than reaching.** An honest gap
  is more useful than a confident guess, and much cheaper to correct.

## Practicalities

- **GitHub Pages deploys from `main`, repo root, no Actions.** Work on `main`.
  It is **shared with a laptop Claude session**, so `git fetch` + fast-forward
  before committing, and expect races. Nothing builds server-side: committed
  HTML is served HTML.
- **The lab notebook** is an eleventy site: source in `notes/`, built output
  committed to `lab/`. `./tools/notes build | serve | publish` — `publish` builds,
  commits and pushes in one step so source and page cannot drift. Live at
  <https://danbri.github.io/isle_of_glitch/magpie/mazeballs/lab/>.
- **`./tools/world restart` RESEEDS — it does not resume.** `tools/world` line 114
  is `cmd_stop; cmd_start "$@"` with no `--resume`, while the HTTP `/control`
  action of the same name *does* resume. This cost a 970k-step run on 2026-08-05.
  Use the Server panel, or pass `--resume` yourself.
- Generated files exist — edit the tool, not the output. `world.html` runs a
  standalone in-browser WebGPU sim by default; `?watch=1` views the Deno server
  (`tools/serve-world.js`).
- **Drive a RUNNING world over HTTP, not through the browser.** `/control` takes
  `pause|resume|speed|save|restart|reseed|tune|implant|load|flag`; `tune` patches
  physics live off a whitelist in `tools/serve-world.js` (keep it current — every
  parameter added with the pose/mass work was silently rejected for days). The
  page is a VIEWER; the sim is the server. `tools/mcp-world.mjs` wraps the same
  API as an MCP server so other agents get discovery and typed arguments:
  `node tools/mcp-world.mjs`. Every tool returns bounded text — a screenshot is
  the worst context-per-fact trade there is, so reach for a browser only to check
  what is true only at the pixels.
- Commit author: `noreply@anthropic.com` / `Claude`. Keep model IDs out of artifacts.
- These design docs are **agent-facing law + spec** — keep them honest and current:
  if a claim is retracted in `RESEARCH.md`, fix the doc that made it.
