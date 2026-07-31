/**
 * Evo/Devo Field — simulation core.
 *
 * No DOM, no WebGL, no globals. The browser page and the headless Node runners
 * both import this file, so there is exactly one implementation of the biology.
 *
 * TensorFlow.js is injected rather than imported, because the browser gets it
 * from a CDN script tag as a global while Node gets it from a package:
 *
 *   browser  useTf(window.tf)
 *   node     useTf(await import('@tensorflow/tfjs'))            // pure JS, CPU
 *   node     useTf(await import('@tensorflow/tfjs-node'))       // native, faster
 *
 * Every random draw goes through an injected seedable RNG, so a run is
 * reproducible from its seed alone — necessary if sweeps are going to be
 * compared against each other rather than against noise.
 */

let tf = (typeof globalThis !== 'undefined' && globalThis.tf) || null;

/** Provide the TensorFlow.js implementation. Accepts a module or a namespace. */
export function useTf(lib) {
  tf = lib && lib.default && lib.default.tensor ? lib.default : lib;
  return tf;
}
function T() {
  if (!tf) throw new Error('TensorFlow.js has not been provided — call useTf(tf) first');
  return tf;
}

export const DEFAULTS = Object.freeze({
  POP: 192, CELLS: 12, GENES: 10, SENSORS: 8,
  FOOD: 42, HAZARDS: 18, OBSTACLES: 8,
  DT: 0.018, EPOCH_STEPS: 1450, DEV_STEPS: 48,
  ELITES: 10, WORLD_BOUND: 0.94, AGENT_RADIUS: 0.017,
  VIEW_STRIDE: 9, TRAIL_POINTS: 300,
  // A patch grazed by one agent empties in ~3s of sim time and takes ~15s to
  // come back. An epoch is 26s, so a squatter starves and a forager does not.
  FOOD_CONSUME: 0.40, FOOD_REGROW: 0.09,
  // Environment-mandate knobs (all off/baseline by default):
  //   FOOD_CLUSTERS      0 = uniform placement (original behaviour); >0 draws
  //                      that many cluster centres and scatters FOOD points
  //                      around them, so travel between patches is necessary.
  //   FOOD_CLUSTER_SIGMA jitter radius of a food point around its cluster centre.
  //   FOOD_SENSE_SIGMA2  variance of the food-sensing Gaussian kernel (field()).
  //                      0.050 is the original wide field (effective radius
  //                      ~0.22 against a 0.94 arena half-width — roughly a
  //                      quarter of the world). Lower narrows it to a real
  //                      gradient instead of a field.
  //   FOOD_RELOCATE_THRESH  0 = disabled (original logistic regrow in place).
  //                      >0: once a patch's stock decays below this level it is
  //                      teleported to a fresh random point and refilled, so it
  //                      never recovers where it was — memorised geography goes
  //                      stale and only live sensing keeps working.
  // Accepted (wave-2 environment mandate, 16 seeds x 8 generations):
  // 9 clusters + relocate-on-depletion raises `sensing` 0.0367 -> 0.0874
  // (+138%) at full viability (forage 0.53, gate clears at 0.30). Score
  // 0.1892 +- 0.0067 -> 0.2100 +- 0.0075, delta +0.0208 vs a bar of 0.0201.
  // Narrowing the sensing kernel (FOOD_SENSE_SIGMA2) tested separately and did
  // not help — left at its original width.
  FOOD_CLUSTERS: 9, FOOD_CLUSTER_SIGMA: 0.12,
  FOOD_SENSE_SIGMA2: 0.050, FOOD_RELOCATE_THRESH: 0.15,
  ACC_COLS: 12,
  // Scales the developed recurrent matrix. 2.0 was the original and rails the
  // network; 0.5 puts the mean max-row-sum near 1.2, where tanh is still steep.
  GAIN: 0.5, SAT_LEVEL: 0.95, WALL_LEVEL: 0.93,
  MUTATION: 0.10, MUTATE_R: 0.16, MUTATE_M: 0.22,
  // Selection scheme. 'trunc' (default) is a no-op: the original top-ELITES
  // fitness truncation, unchanged for every existing caller of evolve().
  // 'niche' is a quality-diversity elite pool: the world is split into
  // NICHES angular sectors around the origin (by each agent's final-position
  // bearing, atan2(y,x)) and the fittest agent in each occupied sector
  // becomes an elite, one per sector — cheap behaviour descriptor, no extra
  // accumulator needed since position is already tracked. Sectors with no
  // agent (early generations, or a sector nobody reached) are backfilled by
  // the next-best globally-fit agent not already chosen, so exactly ELITES
  // elites exist every generation and every downstream tensor shape (genR/
  // genM concat, lineage bookkeeping) is unaffected by which scheme ran.
  // This directly targets the measured failure mode: truncation on raw
  // fitness collapses reproduction onto whichever single strategy scores
  // soonest, so founder lineages fall to 1-3 within three generations and
  // sensing gets discarded. Rewarding one winner per spatial region keeps
  // the parent pool behaviourally spread instead of fitness-convergent.
  // 'novelty' is a second QD-adjacent scheme: rank by fitness plus a
  // behavioural-novelty bonus (mean distance in final-position space to each
  // agent's NOVELTY_K nearest neighbours in the current population, z-scored
  // alongside z-scored fitness so the two are comparable regardless of their
  // raw units) rather than by fitness alone. Both defaults are only consulted
  // when SELECT is 'novelty'.
  SELECT: 'trunc', NICHES: 10, NOVELTY_K: 15, NOVELTY_WEIGHT: 1.0,
  // ---------------------------------------------------------------- central place
  // Central-place foraging. Off by default (CP_STRENGTH 0), in which case every
  // expression below is skipped and the sim is bit-identical to before.
  //
  // The evolved policy in this world has been positively identified as
  // klinokinesis: turn magnitude modulated by the temporal sign of change in
  // sensed food mass — a biased random walk. Every architecture-side lever
  // tried against it came back null, because klinokinesis needs none of that
  // machinery. What it *cannot* do is return somewhere. So:
  //
  //   CP_STRENGTH      fraction of intake diverted out of direct fitness and
  //                    into a per-agent `carry` scalar. The remaining
  //                    (1 - CP_STRENGTH) still pays immediately, which keeps a
  //                    pure-klinokinesis population above the viability floor
  //                    so the run stays measurable instead of degenerate.
  //                    This is the dose knob.
  //   CP_NEST_MULT     carry deposited at the nest pays this multiple, so a
  //                    forager that goes home beats one that never does.
  //   CP_NEST_RADIUS   nest is fixed at the origin in this version.
  //   CP_CARRY_DECAY   per-second decay of undeposited carry: dawdling costs.
  //   CP_DEPOSIT_RATE  per-second fraction of carry banked while inside the
  //                    nest (6/s ⇒ a ~0.4s visit banks most of a load).
  //   CP_NEST_SENSOR   CONTROL ARM ONLY. Adds a 2-channel nest-bearing sensor
  //                    (unit vector to the origin, body frame), taking SENSORS
  //                    8 → 10. With it the task is ordinary taxis and tests
  //                    nothing about memory; without it the only route home is
  //                    path integration off the recurrent state, which is
  //                    possible in principle and is not given. The control
  //                    exists to establish that the task is solvable at all
  //                    before a null on the no-sensor arm means anything.
  CP_STRENGTH: 0, CP_NEST_MULT: 2.5, CP_NEST_RADIUS: 0.14,
  CP_CARRY_DECAY: 0.06, CP_DEPOSIT_RATE: 6.0, CP_NEST_SENSOR: false,
  // ------------------------------------------------- shared-odour ambiguity
  // Food and hazards currently emit into *separate* sensor channels — food on
  // 0,1,2 and toxin on 3,4,5 — so "climb the food channel, ignore the toxin
  // channel" is free, and a single-scalar klinokinesis (the policy this
  // population has been positively identified as running) is a complete
  // solution. This makes that no longer true.
  //
  //   ODOUR_AMBIGUITY   the dose, in [0,1]. Hazards emit into the *food*
  //                     channel with this weight, so at 1.0 a hazard smells
  //                     exactly like a full-stock food patch and the long-
  //                     range channel carries no identity information at all.
  //                     At 0 the branch is skipped entirely and the sim is
  //                     bit-identical to before.
  //   ODOUR_QUALITY_SIGMA2  the hazard/"quality" sensing kernel narrows with
  //                     the same dose, from the original 0.036 (effective
  //                     radius ~0.19, comparable to the food kernel's 0.22 —
  //                     i.e. readable at range) to this value at full
  //                     ambiguity. 0.010 is radius ~0.10: readable only close
  //                     up, and still comfortably outside the hazard *damage*
  //                     kernel's ~0.039, so there is room to turn away.
  //
  // Together these force approach-then-decide: the odour gradient says where
  // something is but not what it is, and the only channel that says what it is
  // cannot be read until you are nearly on top of it. Neither scalar alone is
  // a policy — climbing odour walks you into hazards, and the quality channel
  // is flat everywhere it matters. Deliberately NOT a channel-count change:
  // SENSORS stays 8, because the central-place experiment measured +0.022 of
  // score for adding two channels with the task switched off.
  ODOUR_AMBIGUITY: 0, ODOUR_QUALITY_SIGMA2: 0.010,
  // ------------------------------------------------------------- coevolution
  // Two-species world. Off by default (COEVO false), in which case every
  // expression guarded by it is skipped, SENSORS stays 8, and the sim is
  // bit-identical to the single-species code.
  //
  // Rationale (see RESEARCH.md): every task posed to this simulation so far was
  // designed by a human or an agent, so its difficulty ceiling was whatever the
  // designer imagined, and every one of them was satisfiable by klinokinesis.
  // A second species removes the designer from the loop — the opposing
  // population raises the bar continuously and nobody has to invent the next
  // rung. Evasion in particular is structurally *not* klinokinesis: you cannot
  // escape a pursuer by turning more when a smell fades.
  //
  //   COEVO_ROLE      'prey' eats food and loses on contact; 'predator' gains
  //                   only on contact and (by default) cannot eat food at all.
  //                   The two roles run as two EvoDevoSim instances stepped in
  //                   lockstep by coevoStep(), each holding the other's
  //                   positions for the duration of its own step.
  //   COEVO_SENSE_SIGMA2  width of the opponent-sensing Gaussian, mirroring
  //                   FOOD_SENSE_SIGMA2 so neither side gets a sharper world
  //                   model than the food sense already grants.
  //   COEVO_CAPTURE_SIGMA2  width of the contact kernel that transfers reward.
  //                   Deliberately wider than the food-eating kernel (0.0018)
  //                   because prey, unlike a patch, move.
  //   COEVO_PRED_GAIN  predator fitness per second at full contact.
  //   COEVO_PREY_LOSS  prey fitness per second at full contact. Larger than the
  //                   gain: being caught has to cost more than a missed meal or
  //                   there is no selection pressure to evade.
  //   COEVO_PRED_ENERGY / COEVO_PREY_ENERGY  the same transfer in energy,
  //                   mirroring food's .42 and the toxin's .62.
  //   COEVO_PRED_FORAGE  fraction of normal food intake a predator receives.
  //                   0 makes predation the predator's only income, which is
  //                   what keeps the arms race honest; raising it is the knob
  //                   that buys a predator population insurance against
  //                   starvation-disengagement, at the cost of weakening the
  //                   pressure to actually hunt.
  COEVO: false, COEVO_ROLE: 'prey',
  COEVO_SENSE_SIGMA2: 0.050, COEVO_CAPTURE_SIGMA2: 0.0040,
  COEVO_PRED_GAIN: 1.0, COEVO_PREY_LOSS: 1.5,
  COEVO_PRED_ENERGY: 0.42, COEVO_PREY_ENERGY: 0.62,
  COEVO_PRED_FORAGE: 0,
});

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Deterministic LCG. Also used to seed TensorFlow's random ops. */
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 0x8f3d20a1;
  const step = () => (s = (Math.imul(1664525, s) + 1013904223) >>> 0);
  return { next: () => step() / 4294967296, int: () => step(), state: () => s };
}

/* ------------------------------------------------------------------ world */

export function makeWorld(cfg = DEFAULTS, rng = makeRng(0x8f3d20a1)) {
  const obstacles = [[-.57,-.35,.13],[-.42,.36,.095],[-.04,-.08,.115],[.18,.50,.10],
                     [.46,.17,.14],[.60,-.48,.105],[-.03,.70,.075],[.69,.68,.08]];
  const clearPoint = (x, y, margin = .08) =>
    obstacles.every(o => Math.hypot(x - o[0], y - o[1]) > o[2] + margin);
  // Always returns exactly `count` points: after `guard` rejections the
  // clearance test is dropped, so callers can rely on the length.
  const points = (count) => {
    const out = []; let guard = 0;
    while (out.length < count) {
      const x = (rng.next() * 1.72) - .86, y = (rng.next() * 1.72) - .86;
      if (clearPoint(x, y) || ++guard > 4000) out.push([x, y]);
    }
    return out;
  };
  // `clusters` food sources become `clusters` centres (placed with the same
  // clearance test as uniform points) with `count` points scattered around
  // them — an Irwin-Hall sum of three uniforms for a bounded, roughly-Gaussian
  // jitter, so patches stay well clear of the arena edge instead of a true
  // Gaussian's unbounded tail.
  const clusteredPoints = (count, clusters, sigma) => {
    if (!clusters || clusters <= 0) return points(count);
    const centres = points(clusters);
    const out = []; let guard = 0;
    const bound = cfg.WORLD_BOUND * 0.92;
    for (let i = 0; i < count; i++) {
      const c = centres[i % clusters];
      let x, y;
      do {
        const jx = (rng.next() + rng.next() + rng.next() - 1.5) * (sigma / 1.5);
        const jy = (rng.next() + rng.next() + rng.next() - 1.5) * (sigma / 1.5);
        x = clamp(c[0] + jx, -bound, bound); y = clamp(c[1] + jy, -bound, bound);
      } while (!clearPoint(x, y) && ++guard < 4000);
      out.push([x, y]);
    }
    return out;
  };
  return {
    obstacles,
    food: clusteredPoints(cfg.FOOD, cfg.FOOD_CLUSTERS, cfg.FOOD_CLUSTER_SIGMA),
    hazards: points(cfg.HAZARDS),
  };
}

/* -------------------------------------------------------------- sensors */

// Sensor vector layout, used by the ablation masks.
//   0,1 food direction (body frame)   2 food mass
//   3,4 toxin direction (body frame)  5 toxin mass
//   6   wall/obstacle proximity       7 own energy
//   8,9 nest direction (body frame)   — present only when CP_NEST_SENSOR
// then, appended after whichever of the above exist:
//   opponent direction (body frame) x2, opponent mass x1 — only when COEVO
//
// The optional blocks are appended in a fixed order (nest, then opponent), so
// the indices of a group depend on the configuration. `sensorGroups(cfg)` is
// the single place that resolves them; SENSOR_GROUPS below keeps the static
// base layout for callers that only need the unconditional channels.
//
// ODOUR_AMBIGUITY does not change the layout at all — the channel *count* and
// every index are identical at every dose, deliberately, so no result can be
// confounded with "more channels". What changes is what 0,1,2 and 3,4,5 carry:
// at a dose > 0 the first group is a shared odour emitted by food *and*
// hazards, and the second is a short-range quality/identity cue rather than a
// long-range toxin field. `odour`/`quality` are aliases for those same base
// indices, so they are unaffected by the appended optional blocks and
// `sensorGroups`/`keepAllBut`/`conditions()` stay correct under either reading
// and under any combination of CP_NEST_SENSOR and COEVO.
export const SENSOR_GROUPS = Object.freeze({
  food: [0, 1, 2], toxin: [3, 4, 5], wall: [6], energy: [7], nest: [8, 9],
  odour: [0, 1, 2], quality: [3, 4, 5],
  // Split of the food sense. Every mechanism that has raised `sensing` left
  // `taxis` flat, and `taxis` correlates turn against food *bearing* only. If
  // the population navigates by mass gradient instead, sensing is genuinely
  // load-bearing while a bearing-correlation measure sees nothing. Ablating the
  // two halves separately distinguishes those cases.
  foodDir: [0, 1], foodMass: [2],
});

/**
 * Resolve group -> channel indices for a given configuration. The optional
 * blocks are appended in the same order `step()` pushes them, so this cannot
 * drift out of step with the sensor vector unless both are edited.
 */
export function sensorGroups(cfg = DEFAULTS) {
  const g = { ...SENSOR_GROUPS };
  let next = 8;
  if (cfg.CP_NEST_SENSOR) { g.nest = [next, next + 1]; next += 2; }
  else delete g.nest;
  if (cfg.COEVO) {
    g.opponent = [next, next + 1, next + 2];
    g.opponentDir = [next, next + 1];
    g.opponentMass = [next + 2];
    next += 3;
  }
  return g;
}

export function keepAllBut(groups, cfg = DEFAULTS) {
  const m = new Array(cfg.SENSORS).fill(1);
  const G = sensorGroups(cfg);
  // A group whose channels do not exist in this configuration (nest, when the
  // control arm is off) is simply skipped — otherwise the mask would be longer
  // than the sensor vector and the ablation would silently measure nothing.
  for (const g of groups) for (const i of (G[g] || [])) if (i < cfg.SENSORS) m[i] = 0;
  return m;
}

/** The ablation conditions the diagnostics run. */
export function conditions(cfg = DEFAULTS) {
  // `blind` must scramble every channel that exists — nest and opponent
  // included — or the sensing component reads a population that still has its
  // way home, or still knows where the predators are.
  const all = ['food','toxin','wall','energy'];
  if (cfg.CP_NEST_SENSOR) all.push('nest');
  if (cfg.COEVO) all.push('opponent');
  const extra = [];
  if (cfg.COEVO) extra.push(
    { key:'noOpponent', label:'opponent sense scrambled', mask:keepAllBut(['opponent'], cfg),
      note:'the other species becomes invisible' },
    { key:'noOpponentDir', label:'opponent bearing scrambled', mask:keepAllBut(['opponentDir'], cfg),
      note:'direction to the other species lost, mass kept' });
  // Shared-odour ambiguity relabels the food/toxin conditions without moving
  // them: same keys, same indices, same masks, so a run under ambiguity is
  // still directly comparable with every number already recorded, and the
  // relabelling composes with the appended opponent conditions above.
  const amb = cfg.ODOUR_AMBIGUITY > 0;
  return [
    { key:'baseline', label:'baseline',              note:'same genomes, fresh spawns' },
    { key:'blind',    label:'all senses scrambled',  mask:keepAllBut(all, cfg), note:'is the loop closed at all?' },
    { key:'noFood',   label: amb ? 'odour sense scrambled' : 'food sense scrambled',
      mask:keepAllBut(['food'], cfg),  note: amb ? 'shared food/hazard odour removed' : 'chemotaxis removed' },
    { key:'noToxin',  label: amb ? 'quality sense scrambled' : 'toxin sense scrambled',
      mask:keepAllBut(['toxin'], cfg), note: amb ? 'the only identity cue removed' : 'avoidance removed' },
    { key:'noWall',   label:'wall sense scrambled',  mask:keepAllBut(['wall'], cfg),  note:'obstacle/edge cue removed' },
    { key:'noFoodDir',  label:'food bearing scrambled', mask:keepAllBut(['foodDir'], cfg),  note:'direction lost, mass kept' },
    { key:'noFoodMass', label:'food mass scrambled',    mask:keepAllBut(['foodMass'], cfg), note:'mass lost, direction kept' },
    // Uses the same `all` list as `blind`, so the scramble-vs-mean-replacement
    // pair compares like with like. On the default configuration `all` is
    // exactly the four base groups, so this is unchanged from before.
    { key:'blindConst', label:'all senses -> population mean', mask:keepAllBut(all, cfg), constant:true, note:'information removed, no noise injected' },
    ...extra,
    { key:'lesion',   label:'recurrence lesioned',   lesion:true, note:'off-diagonal W zeroed; reactive only' },
    { key:'novel',    label:'novel field layout',    novel:true,  note:'never selected on this layout' },
  ];
}

export function makeMods(mask, lesion, cfg = DEFAULTS, rng = makeRng(7), constant = false) {
  if (!mask && !lesion) return null;
  const m = { lesion: !!lesion, constant: !!constant };
  if (mask) {
    const perm = Array.from({ length: cfg.POP }, (_, i) => i);
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    m.keep = T().tensor2d([mask], [1, cfg.SENSORS]);
    m.drop = T().tensor2d([mask.map(v => 1 - v)], [1, cfg.SENSORS]);
    m.perm = T().tensor1d(perm, 'int32');
  }
  return m;
}
export const disposeMods = m => {
  if (m) { m.keep && m.keep.dispose(); m.drop && m.drop.dispose(); m.perm && m.perm.dispose(); }
};

/* ------------------------------------------------------------ statistics */

export const mean = a => { let t = 0; for (let i = 0; i < a.length; i++) t += a[i]; return t / a.length; };
export const meanOf = (a, n) => { let t = 0; for (let i = 0; i < n; i++) t += a[i]; return t / n; };
export const sd = a => { const m = mean(a); let t = 0; for (let i = 0; i < a.length; i++) t += (a[i] - m) ** 2; return Math.sqrt(t / Math.max(1, a.length - 1)); };
export const median = a => { const s = Array.from(a).sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
// The fitness distribution is severely skewed — a few agents find food and most
// never do — so the population mean is mostly noise around zero. The mean of the
// top quartile tracks the part of the population selection acts on.
export const topQuartile = a => {
  const s = Array.from(a).sort((x, y) => y - x), n = Math.max(1, Math.round(s.length / 4));
  let t = 0; for (let i = 0; i < n; i++) t += s[i]; return t / n;
};

/* --------------------------------------------------------- serialisation */

// Genomes travel as base64 float32 rather than JSON numbers: ~135KB instead of
// ~250KB, and it round-trips the exact bits rather than decimal approximations.
const B64 = {
  encode(a) {
    const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    if (typeof btoa === 'function') {
      let s = ''; const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      return btoa(s);
    }
    return Buffer.from(bytes).toString('base64');   // Node
  },
  decode(str) {
    let bytes;
    if (typeof atob === 'function') {
      const bin = atob(str); bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      const b = Buffer.from(str, 'base64');
      bytes = new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    }
    if (bytes.length % 4) throw new Error('genome block is not a whole number of floats');
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  },
};
const validPoints = (arr, n) => Array.isArray(arr) && arr.length === n &&
  arr.every(p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
const allFinite = a => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };

/* ---------------------------------------------------------------- the sim */

export class EvoDevoSim {
  // Channel layout written by startTrace()/step()'s tracing block, one row of
  // this many floats per agent per step: food bearing in the body frame
  // (fbFwd, fbLat — same quantities `taxisStats` correlates against turn),
  // raw food-mass sense before its tanh squashing, the turn and thrust motor
  // outputs, this step's food intake, post-step energy, squared distance to
  // the nearest food source, and post-step world position.
  // `pbFwd`/`pbLat`/`oppMass` are the coevolution channels: the opponent's
  // bearing in the body frame and the sensed opponent mass, i.e. exactly the
  // quantities a pursuit or an evasion policy would have to be a function of.
  // They are present unconditionally and read zero when COEVO is off, so tools
  // that index TRACE_CHANNELS by name (tools/policy.js) work either way.
  //
  // `odourMass`/`quality` are the shared-odour channels, on the same principle.
  // `fbFwd`/`fbLat` are the bearing the agent actually senses, which under
  // ODOUR_AMBIGUITY is the shared food+hazard odour rather than food alone;
  // `foodMass` stays the *true* food mass (unmixed) so the two can be told
  // apart; `odourMass` is the scalar the agent has, and `quality` is the
  // short-range identity cue. At dose 0, odourMass === foodMass by
  // construction and `quality` is the old long-range toxin mass.
  //
  // Order here must match the order of the stack in step()'s tracing block.
  static TRACE_CHANNELS = ['fbFwd','fbLat','foodMass','turn','thrust','eat','energy','minFoodD2','posX','posY',
                           'pbFwd','pbLat','oppMass','odourMass','quality'];
  /**
   * @param {object} opts
   * @param {object} [opts.config]  overrides merged over DEFAULTS
   * @param {number} [opts.seed]    seeds genomes, spawns, mutation and the world
   * @param {object} [opts.world]   reuse an existing layout instead of generating one
   */
  constructor(opts = {}) {
    const merged = { ...DEFAULTS, ...(opts.config || {}) };
    // The nest-bearing control arm adds two channels. Derived here rather than
    // asked of the caller so SENSORS, sensorEmb, Win and the ablation masks
    // cannot disagree with each other.
    if (merged.CP_NEST_SENSOR) merged.SENSORS = merged.SENSORS + 2;
    // Two direction channels plus one mass channel for the other species,
    // appended after the nest block — mirroring the food sense exactly, so
    // neither role is handed a richer view of its opponent than of its food.
    if (merged.COEVO) merged.SENSORS = merged.SENSORS + 3;
    this.cfg = Object.freeze(merged);
    // Set by coevoStep() for the duration of a step: the opposing population's
    // positions, [N_opponent, 2]. Null outside a coevolutionary epoch, in which
    // case the opponent channels read zero ("nothing in sight") rather than
    // changing the sensor vector's length — diagnose() and policy.js run the
    // population with no opponent present and must still match Win's shape.
    this.opponentPos = null;
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.rng = makeRng(this.seed);
    this.worldRng = makeRng(this.seed ^ 0x5bf03635);
    this.world = opts.world || makeWorld(this.cfg, this.worldRng);
    this.gen = 0; this.stepNo = 0; this.selected = 0;
    this.mutation = this.cfg.MUTATION; this.gain = this.cfg.GAIN;
    this.mods = null; this.recording = false; this.accSteps = 0; this.analysing = false;
    this.snapshotPending = false; this.lastSnapshot = null;
    this.tracing = false; this.traceBuf = null; this.traceStep = 0;
    this.makeConstants(); this.makeVariables(); this.resetLineage();
  }

  /* seeded wrappers so every run is reproducible from `seed` alone */
  rn(shape, m = 0, s = 1) { return T().randomNormal(shape, m, s, 'float32', this.rng.int()); }
  ru(shape, a = 0, b = 1, dtype = 'float32') { return T().randomUniform(shape, a, b, dtype, this.rng.int()); }

  v(t) { const x = T().variable(t); t.dispose(); return x; }

  makeConstants() {
    const C = this.cfg, W = this.world, tf = T();
    // A Variable, not a plain tensor: FOOD_RELOCATE_THRESH relocates depleted
    // patches in place with .assign() inside step(), which a constant tensor
    // cannot support without dispose-and-recreate every occurrence.
    this.food = this.v(tf.tensor2d(W.food, [C.FOOD, 2]));
    this.haz = tf.tensor2d(W.hazards, [C.HAZARDS, 2]);
    this.obs = tf.tensor2d(W.obstacles.map(o => [o[0], o[1]]), [C.OBSTACLES, 2]);
    this.obsR = tf.tensor1d(W.obstacles.map(o => o[2]));
    const p = []; for (let i = 0; i < C.CELLS; i++) p.push(-1 + 2 * i / (C.CELLS - 1));
    this.cellPos = tf.tensor1d(p);
    this.morph = tf.tensor3d(p.flatMap(x => [1, x, x * x]), [1, C.CELLS, 3]);
    const dk = []; for (let i = 0; i < C.CELLS; i++) for (let j = 0; j < C.CELLS; j++) dk.push(Math.exp(-Math.abs(i - j) / 3.1));
    this.distKernel = tf.tensor3d(dk, [1, C.CELLS, C.CELLS]);
    const eye = []; for (let i = 0; i < C.CELLS; i++) for (let j = 0; j < C.CELLS; j++) eye.push(i === j ? 1 : 0);
    this.eye = tf.tensor3d(eye, [1, C.CELLS, C.CELLS]);
    const emb = []; for (let i = 0; i < C.SENSORS; i++) { const a = (i / C.SENSORS) * Math.PI * 2; emb.push(Math.cos(a), Math.sin(a)); }
    this.sensorEmb = tf.tensor3d(emb, [1, C.SENSORS, 2]);
  }

  makeVariables() {
    const C = this.cfg, tf = T();
    this.genR = this.v(this.rn([C.POP, C.GENES, C.GENES], 0, .38));
    this.genM = this.v(this.rn([C.POP, 3, C.GENES], 0, .75));
    this.bias = this.v(tf.zeros([C.POP, C.CELLS])); this.tau = this.v(tf.ones([C.POP, C.CELLS]));
    this.W = this.v(tf.zeros([C.POP, C.CELLS, C.CELLS]));
    this.Win = this.v(tf.zeros([C.POP, C.SENSORS, C.CELLS]));
    this.Wout = this.v(tf.zeros([C.POP, C.CELLS, 2]));
    this.expr = this.v(tf.zeros([C.POP, C.CELLS, C.GENES])); this.color = this.v(tf.zeros([C.POP, 3]));
    this.pos = this.v(tf.zeros([C.POP, 2])); this.vel = this.v(tf.zeros([C.POP, 2]));
    this.angle = this.v(tf.zeros([C.POP])); this.omega = this.v(tf.zeros([C.POP]));
    this.energy = this.v(tf.ones([C.POP])); this.fitness = this.v(tf.zeros([C.POP]));
    this.neural = this.v(tf.zeros([C.POP, C.CELLS]));
    this.foodStock = this.v(tf.ones([C.FOOD]));
    this.acc = this.v(tf.zeros([C.POP, C.ACC_COLS]));
    // Central-place bookkeeping. Zero and inert unless CP_STRENGTH > 0.
    //   carry    undeposited load
    //   banked   cumulative fitness that arrived via a nest deposit
    //   nestTime seconds spent inside the nest radius
    this.carry = this.v(tf.zeros([C.POP]));
    this.banked = this.v(tf.zeros([C.POP]));
    this.nestTime = this.v(tf.zeros([C.POP]));
    // Behavioural readout for the shared-odour experiment, accumulated at every
    // dose including 0 so the baseline is its own reference. Neither is an
    // input to fitness or to the score: `toxDose` is integrated hazard
    // exposure (seconds at full contact) and `intake` is integrated feeding.
    // A score move under ambiguity is uninterpretable without them — the
    // central-place experiment's six nulls only became a finding once the
    // occupancy numbers said the control arm had not learned the task either.
    this.toxDose = this.v(tf.zeros([C.POP]));
    this.intake = this.v(tf.zeros([C.POP]));
    // Coevolution bookkeeping, per episode. Zero and inert unless COEVO.
    //   contactAcc  integrated contact with the opposing species, in
    //               contact-seconds. This is the tournament's primary
    //               observable: for a predator it is prey caught, for a prey it
    //               is times caught, and it is the *same physical quantity*
    //               measured from both sides, which is what makes a cross-
    //               generational matrix comparable at all.
    //   forageAcc   integrated food intake, so a prey population that survives
    //               by refusing to eat can be told apart from one that evades.
    this.contactAcc = this.v(tf.zeros([C.POP]));
    // `forageAcc` and `intake` above are both integrated feeding. They are kept
    // separate rather than aliased because they serve different instruments —
    // `forageAcc` the cross-generational tournament, `intake` odourStats() —
    // and collapsing them would couple two experiments' readouts for no gain.
    this.forageAcc = this.v(tf.zeros([C.POP]));
  }

  async initialise() { await this.develop(); this.resetBodies(); await this.warmup(); }

  /** Fresh random genomes, keeping the current world. */
  async randomiseGenomes() {
    const C = this.cfg, tf = T();
    tf.tidy(() => {
      this.genR.assign(this.rn([C.POP, C.GENES, C.GENES], 0, .38));
      this.genM.assign(this.rn([C.POP, 3, C.GENES], 0, .75));
    });
    this.gen = 0; this.resetLineage();
    await this.develop(); this.resetBodies();
  }
  async warmup() { for (let i = 0; i < 3; i++) this.step(); const z = T().sum(this.pos); await z.data(); z.dispose(); this.resetBodies(); }

  dispose() {
    for (const k of ['food','haz','obs','obsR','cellPos','morph','distKernel','eye','sensorEmb',
      'genR','genM','bias','tau','W','Win','Wout','expr','color','pos','vel','angle','omega',
      'energy','fitness','neural','foodStock','acc','carry','banked','nestTime',
      'toxDose','intake','contactAcc','forageAcc'])
      if (this[k] && !this[k].isDisposed) this[k].dispose();
  }

  /* ------------------------------------------------------ lineage */
  resetLineage() {
    const C = this.cfg;
    this.founder = new Int32Array(C.POP).map((_, i) => i);
    this.genomeId = new Int32Array(C.POP).map((_, i) => i);
    this.nextGenomeId = C.POP; this.eliteStreak = new Map();
  }
  advanceLineage(topIdx, choiceIdx) {
    const C = this.cfg, E = C.ELITES, f = new Int32Array(C.POP), g = new Int32Array(C.POP);
    for (let k = 0; k < E; k++) { f[k] = this.founder[topIdx[k]]; g[k] = this.genomeId[topIdx[k]]; }
    for (let c = 0; c < C.POP - E; c++) { const p = topIdx[choiceIdx[c]]; f[E + c] = this.founder[p]; g[E + c] = this.nextGenomeId++; }
    this.founder = f; this.genomeId = g;
    const s = new Map();
    for (let k = 0; k < E; k++) s.set(g[k], (this.eliteStreak.get(g[k]) || 0) + 1);
    this.eliteStreak = s;
  }
  lineageStats() {
    const E = this.cfg.ELITES;
    let streak = 0; for (const v of this.eliteStreak.values()) if (v > streak) streak = v;
    return {
      founders: new Set(this.founder).size,
      eliteFounders: new Set(Array.from(this.founder.slice(0, E))).size,
      streak,
    };
  }

  /* ------------------------------------------------------ world */
  // `overrides` lets a difficulty ramp regenerate the layout with different
  // FOOD_CLUSTERS/FOOD_CLUSTER_SIGMA each generation without touching the
  // frozen `this.cfg` (see evolveFor's `curriculum` option).
  reseedWorld(overrides = {}) {
    const C = { ...this.cfg, ...overrides };
    this.world = makeWorld(C, this.worldRng);
    this.food.assign(T().tensor2d(this.world.food, [this.cfg.FOOD, 2]));
    this.haz.dispose();
    this.haz = T().tensor2d(this.world.hazards, [this.cfg.HAZARDS, 2]);
  }
  /** Run `fn` against a layout the population was never selected on, then restore. */
  async withNovelWorld(fn) {
    const C = this.cfg, tf = T();
    const old = this.world, oldFood = this.food, oldHaz = this.haz;
    this.world = makeWorld(C, this.worldRng);
    this.food = this.v(tf.tensor2d(this.world.food, [C.FOOD, 2]));
    this.haz = tf.tensor2d(this.world.hazards, [C.HAZARDS, 2]);
    try { return await fn(); }
    finally {
      this.food.dispose(); this.haz.dispose();
      this.world = old; this.food = oldFood; this.haz = oldHaz;
    }
  }

  /* ------------------------------------------------------ body state */
  resetBodies() {
    const C = this.cfg, tf = T();
    tf.tidy(() => {
      this.pos.assign(this.ru([C.POP, 2], -.82, .82));
      this.vel.assign(tf.zerosLike(this.vel));
      this.angle.assign(this.ru([C.POP], -Math.PI, Math.PI));
      this.omega.assign(tf.zerosLike(this.omega));
      this.energy.assign(this.ru([C.POP], .85, 1.15));
      this.fitness.assign(tf.zerosLike(this.fitness));
      this.neural.assign(this.rn([C.POP, C.CELLS], 0, .08));
      this.foodStock.assign(tf.onesLike(this.foodStock));
      this.carry.assign(tf.zerosLike(this.carry));
      this.banked.assign(tf.zerosLike(this.banked));
      this.nestTime.assign(tf.zerosLike(this.nestTime));
      this.toxDose.assign(tf.zerosLike(this.toxDose));
      this.intake.assign(tf.zerosLike(this.intake));
      this.contactAcc.assign(tf.zerosLike(this.contactAcc));
      this.forageAcc.assign(tf.zerosLike(this.forageAcc));
    });
    this.stepNo = 0;
  }
  /** A reusable starting condition, so conditions can be compared pairwise. */
  makeInit() {
    const C = this.cfg, tf = T();
    return tf.tidy(() => ({
      pos: tf.keep(this.ru([C.POP, 2], -.82, .82)),
      angle: tf.keep(this.ru([C.POP], -Math.PI, Math.PI)),
      energy: tf.keep(this.ru([C.POP], .85, 1.15)),
      neural: tf.keep(this.rn([C.POP, C.CELLS], 0, .08)),
    }));
  }
  applyInit(i) {
    const tf = T();
    tf.tidy(() => {
      this.pos.assign(i.pos); this.angle.assign(i.angle);
      this.energy.assign(i.energy); this.neural.assign(i.neural);
      this.vel.assign(tf.zerosLike(this.vel)); this.omega.assign(tf.zerosLike(this.omega));
      this.fitness.assign(tf.zerosLike(this.fitness)); this.foodStock.assign(tf.onesLike(this.foodStock));
      this.carry.assign(tf.zerosLike(this.carry));
      this.banked.assign(tf.zerosLike(this.banked));
      this.nestTime.assign(tf.zerosLike(this.nestTime));
      this.toxDose.assign(tf.zerosLike(this.toxDose));
      this.intake.assign(tf.zerosLike(this.intake));
      this.contactAcc.assign(tf.zerosLike(this.contactAcc));
      this.forageAcc.assign(tf.zerosLike(this.forageAcc));
    });
    this.stepNo = 0;
  }
  disposeInit(i) { for (const k in i) i[k].dispose(); }
  saveState() {
    const keys = ['pos','vel','angle','omega','energy','fitness','neural','foodStock','acc',
                  'carry','banked','nestTime','toxDose','intake',
                  'contactAcc','forageAcc'];
    const s = { stepNo: this.stepNo }; for (const k of keys) s[k] = this[k].clone(); return s;
  }
  restoreState(s) {
    for (const k in s) { if (k === 'stepNo') { this.stepNo = s[k]; continue; } this[k].assign(s[k]); s[k].dispose(); }
  }

  /* ------------------------------------------------------ development */
  async develop() {
    const C = this.cfg, tf = T();
    let g = tf.zeros([C.POP, C.CELLS, C.GENES]);
    const drive = tf.tidy(() => tf.matMul(tf.tile(this.morph, [C.POP, 1, 1]), this.genM));
    for (let i = 0; i < C.DEV_STEPS; i++) {
      const next = tf.tidy(() => {
        const reg = tf.matMul(g, this.genR);
        return g.add(tf.tanh(reg.add(drive)).sub(g).mul(.19));
      });
      g.dispose(); g = next;
    }
    tf.tidy(() => {
      const e = tf.tanh(g); this.expr.assign(e);
      const sl = k => e.slice([0, 0, k], [C.POP, C.CELLS, 1]).squeeze([2]);
      this.bias.assign(sl(0).mul(1.45));
      this.tau.assign(tf.sigmoid(sl(1)).mul(1.65).add(.24));
      const le = sl(2), li = sl(3), re = sl(4), ri = sl(5);
      let w = le.expandDims(2).mul(re.expandDims(1)).sub(li.expandDims(2).mul(ri.expandDims(1))).mul(this.distKernel).mul(2.0);
      w = w.add(sl(9).expandDims(2).mul(this.eye).mul(.65));
      // Recurrent gain. At the original 2.0 the largest absolute row sum of W
      // averages ~5, which parks a tanh network's fixed points where the
      // nonlinearity is flat: cells rail and sensory input cannot move them.
      this.W.assign(w.mul(this.gain / 2.0));
      const receptor = tf.stack([sl(6), sl(7)], 2);
      const se = tf.tile(this.sensorEmb, [C.POP, 1, 1]);
      this.Win.assign(tf.matMul(se, receptor.transpose([0, 2, 1])).mul(1.18));
      const cp = tf.tile(this.cellPos.expandDims(0), [C.POP, 1]), motor = sl(8);
      this.Wout.assign(tf.stack([tf.tanh(motor.sub(cp.mul(1.4))), tf.tanh(motor.add(cp.mul(1.4)))], 2));
      this.color.assign(tf.stack([sl(2).mean(1), sl(6).mean(1), sl(8).mean(1)], 1).mul(1.2).add(.6).clipByValue(.12, 1));
    });
    drive.dispose(); g.dispose();
  }

  /* ------------------------------------------------------ physics */
  // `weights` scales each source's contribution, so the food sense tracks live
  // patches rather than the bare geometry of where food used to be.
  field(pos, points, sigma2, weights) {
    const rel = points.expandDims(0).sub(pos.expandDims(1));
    const d2 = rel.square().sum(2);
    // d2.mul(-1).div(sigma2), not d2.div(-sigma2): if sigma2 is ever a tensor
    // (an evolvable sensing width) JS unary minus coerces it through
    // valueOf(), which silently yields NaN instead of negating it.
    let w = d2.mul(-1).div(sigma2).exp();
    if (weights) w = w.mul(weights.expandDims(0));
    const mass = w.sum(1).add(1e-5);
    const vec = rel.mul(w.expandDims(2)).sum(1).div(mass.expandDims(1));
    return { rel, d2, w, mass, vec };
  }

  step() {
    const C = this.cfg, tf = T(), mods = this.mods;
    tf.tidy(() => {
      const food = this.field(this.pos, this.food, C.FOOD_SENSE_SIGMA2, this.foodStock);
      // Shared-odour ambiguity. `amb` only ever touches what is *sensed*: the
      // eating kernel below reads food.d2 and the damage kernel reads haz.d2,
      // neither of which depends on the sensing width or on any mixing here.
      // So the world's payoffs are identical at every dose and a score move
      // cannot be a change in how much food or poison is physically there.
      const amb = C.ODOUR_AMBIGUITY;
      // The quality/identity kernel narrows with the dose: at 0 it is the
      // original 0.036 exactly (0.036 + 0 * x is exact in floating point), so
      // this line is a no-op at baseline rather than a near-no-op.
      const qs = 0.036 + amb * (C.ODOUR_QUALITY_SIGMA2 - 0.036);
      const haz = this.field(this.pos, this.haz, qs, null);
      // The odour channel: food weighted by live stock, hazards weighted by the
      // dose, both through the *same* kernel width, so at amb=1 a hazard is
      // indistinguishable from a full patch at range. Mixed as unnormalised
      // weighted sums (vec*mass) and renormalised, which is what a single
      // field() over the union of the two point sets would have produced.
      let odourVec = food.vec, odourMass = food.mass;
      if (amb > 0) {
        const hazOdour = this.field(this.pos, this.haz, C.FOOD_SENSE_SIGMA2, null);
        odourMass = food.mass.add(hazOdour.mass.mul(amb));
        odourVec = food.vec.mul(food.mass.expandDims(1))
          .add(hazOdour.vec.mul(hazOdour.mass.expandDims(1)).mul(amb))
          .div(odourMass.expandDims(1));
      }
      // The opposing species, sensed exactly as food is: a Gaussian-weighted
      // mean direction plus a mass. `opponentPos` is [N_opp, 2] and may have a
      // different population size from this one, which field() already handles.
      // Deliberately NOT mixed into the odour channel: shared-odour ambiguity is
      // a food/hazard discrimination, and folding a third species into the same
      // scalar would confound the two experiments.
      const opp = (C.COEVO && this.opponentPos)
        ? this.field(this.pos, this.opponentPos, C.COEVO_SENSE_SIGMA2, null) : null;
      const orel = this.pos.expandDims(1).sub(this.obs.expandDims(0));
      const od = tf.sqrt(orel.square().sum(2).add(1e-6));
      const on = orel.div(od.expandDims(2));
      const orange = this.obsR.add(.13).expandDims(0);
      const ostr = tf.relu(orange.sub(od)).div(orange);
      const repel = on.mul(ostr.expandDims(2)).sum(1);
      const c = tf.cos(this.angle), s = tf.sin(this.angle);
      const body = v => [
        v.slice([0,0],[-1,1]).squeeze([1]).mul(c).add(v.slice([0,1],[-1,1]).squeeze([1]).mul(s)),
        v.slice([0,1],[-1,1]).squeeze([1]).mul(c).sub(v.slice([0,0],[-1,1]).squeeze([1]).mul(s)),
      ];
      const fb = body(odourVec), hb = body(haz.vec), rb = body(repel);
      const boundary = tf.relu(this.pos.abs().max(1).sub(.70)).mul(3.2);
      const chans = [fb[0], fb[1], tf.tanh(odourMass.mul(.16)),
        hb[0], hb[1], tf.tanh(haz.mass.mul(.18)),
        tf.tanh(boundary.add(rb[0].abs().mul(.4))), this.energy.sub(.7)];
      // Control arm only. Bearing to the nest (origin) as a body-frame unit
      // vector — direction home, no distance. With this the return trip is
      // plain taxis; without it the recurrent state is the only place a route
      // home could live.
      if (C.CP_NEST_SENSOR) {
        const toNest = this.pos.mul(-1);
        const nDist = tf.sqrt(toNest.square().sum(1).add(1e-6));
        const nb = body(toNest.div(nDist.expandDims(1)));
        chans.push(nb[0], nb[1]);
      }
      // Opponent channels. Present whenever COEVO is on, so the sensor vector
      // has a fixed width; zero when no opposing population is being stepped
      // alongside this one (diagnostics, policy traces), which reads as
      // "nothing in sight" rather than as a shape mismatch.
      let ob = null;
      if (C.COEVO) {
        if (opp) {
          ob = body(opp.vec);
          chans.push(ob[0], ob[1], tf.tanh(opp.mass.mul(.16)));
        } else {
          const z = tf.zeros([C.POP]);
          ob = [z, z];
          chans.push(z, z, z);
        }
      }
      let sensors = tf.stack(chans, 1);
      // Ablation: dropped channels are replaced by another agent's values for
      // the same channels — information destroyed, distribution preserved.
      if (mods && mods.keep) {
        // Two ways to ablate. Scrambling hands agent i another agent's value:
        // information destroyed, distribution preserved — but it also *injects a
        // plausible wrong signal*, so a drop may reflect perturbation rather
        // than lost information. Replacing with the population mean removes the
        // information while injecting nothing. If the two cost the same, the
        // drop is information; if only scrambling hurts, it is noise sensitivity.
        const replacement = mods.constant
          ? sensors.mean(0, true).tile([this.cfg.POP, 1])
          : tf.gather(sensors, mods.perm);
        sensors = sensors.mul(mods.keep).add(replacement.mul(mods.drop));
      }
      const Weff = (mods && mods.lesion) ? this.W.mul(this.eye) : this.W;
      const act = tf.tanh(this.neural.add(this.bias));
      const rec = tf.matMul(act.expandDims(1), Weff).squeeze([1]);
      const inp = tf.matMul(sensors.expandDims(1), this.Win).squeeze([1]);
      const ny = this.neural.add(rec.add(inp).sub(this.neural).div(this.tau).mul(C.DT));
      this.neural.assign(ny);
      const motor = tf.matMul(tf.tanh(ny).expandDims(1), this.Wout).squeeze([1]).tanh();
      const left = motor.slice([0,0],[-1,1]).squeeze([1]), right = motor.slice([0,1],[-1,1]).squeeze([1]);
      const thrust = left.add(right).mul(.5), turn = right.sub(left);
      const ax = c.mul(thrust).mul(.72).add(repel.slice([0,0],[-1,1]).squeeze([1]).mul(.95));
      const ay = s.mul(thrust).mul(.72).add(repel.slice([0,1],[-1,1]).squeeze([1]).mul(.95));
      let nv = this.vel.mul(.982).add(tf.stack([ax, ay], 1).mul(C.DT));
      const speed = tf.sqrt(nv.square().sum(1).add(1e-6));
      nv = nv.div(tf.maximum(speed.div(.34), tf.onesLike(speed)).expandDims(1));
      const no = this.omega.mul(.91).add(turn.mul(.055));
      this.omega.assign(no);
      // Wrapped to [-pi, pi]: the heading is integrated every step and would
      // otherwise drift far enough for float32 cos/sin to lose precision.
      const wrapped = this.angle.add(no).add(turn.mul(C.DT * .42)).add(Math.PI);
      this.angle.assign(wrapped.sub(wrapped.div(2 * Math.PI).floor().mul(2 * Math.PI)).sub(Math.PI));
      let np = this.pos.add(nv.mul(C.DT));
      const nrel = np.expandDims(1).sub(this.obs.expandDims(0));
      const nd = tf.sqrt(nrel.square().sum(2).add(1e-6));
      const nn = nrel.div(nd.expandDims(2));
      const pen = tf.relu(this.obsR.add(C.AGENT_RADIUS).expandDims(0).sub(nd));
      np = np.add(nn.mul(pen.expandDims(2)).sum(1));
      const hit = np.abs().greater(C.WORLD_BOUND).toFloat();
      np = np.clipByValue(-C.WORLD_BOUND, C.WORLD_BOUND);
      nv = nv.mul(tf.onesLike(hit).sub(hit.mul(1.72)));
      this.pos.assign(np); this.vel.assign(nv);
      // Feeding draws the patch down; the patch regrows logistically toward 1.
      const k = food.d2.mul(-1).div(.0018).exp();
      let eat = k.mul(this.foodStock.expandDims(0)).max(1);
      let draw = k.sum(0);
      // A predator does not (by default) eat, and must not deplete the patches
      // it walks over either, or it would starve the prey by accident and the
      // arms race would be confounded with resource competition.
      const isPred = C.COEVO && C.COEVO_ROLE === 'predator';
      if (isPred && C.COEVO_PRED_FORAGE !== 1) {
        eat = eat.mul(C.COEVO_PRED_FORAGE);
        draw = draw.mul(C.COEVO_PRED_FORAGE);
      }
      const stock = this.foodStock;
      let newStock = stock.add(
        stock.mul(-1).add(1).mul(C.FOOD_REGROW)
          .sub(draw.mul(stock).mul(C.FOOD_CONSUME))
          .mul(C.DT)).clipByValue(0, 1);
      // Non-stationary resources: a patch that decays past FOOD_RELOCATE_THRESH
      // does not recover in place — it is teleported to a fresh random point
      // and refilled. Depletion becomes permanent-at-that-location, so a
      // memorised layout goes stale and only live sensing keeps paying off.
      if (C.FOOD_RELOCATE_THRESH > 0) {
        const depleted = newStock.less(C.FOOD_RELOCATE_THRESH).toFloat();
        const keep = tf.onesLike(depleted).sub(depleted);
        const candidate = this.ru([C.FOOD, 2], -C.WORLD_BOUND * 0.87, C.WORLD_BOUND * 0.87);
        this.food.assign(this.food.mul(keep.expandDims(1)).add(candidate.mul(depleted.expandDims(1))));
        newStock = newStock.mul(keep).add(depleted);
      }
      this.foodStock.assign(newStock);
      const tox = haz.d2.mul(-1).div(.0015).exp().max(1);
      // Reporting only — neither feeds fitness, energy or selection.
      this.toxDose.assign(this.toxDose.add(tox.mul(C.DT)));
      this.intake.assign(this.intake.add(eat.mul(C.DT)));
      const cost = thrust.abs().mul(.015).add(turn.abs().mul(.009)).add(.013);
      // Contact with the opposing species: the same kernel from both sides, so
      // one physical quantity is being transferred rather than two separately
      // tuned ones. Wider than the food-eating kernel because prey move.
      // `.max(1)` matches feeding: what matters is the closest opponent, not
      // the summed crowd, so a predator cannot farm a distant swarm.
      const contact = opp
        ? opp.d2.mul(-1).div(C.COEVO_CAPTURE_SIGMA2).exp().max(1) : null;
      let dEnergy = eat.mul(.42).sub(tox.mul(.62)).sub(cost);
      if (contact) dEnergy = isPred
        ? dEnergy.add(contact.mul(C.COEVO_PRED_ENERGY))
        : dEnergy.sub(contact.mul(C.COEVO_PREY_ENERGY));
      const en = this.energy.add(dEnergy.mul(C.DT)).clipByValue(0, 1.4);
      this.energy.assign(en);
      // Central-place foraging. Intake stops being worth its full value where
      // it is found: CP_STRENGTH of it goes into `carry`, which decays and is
      // worth CP_NEST_MULT only once banked at the nest. Metabolism is
      // deliberately untouched — eating still feeds you at the same rate, so
      // this changes what fitness *rewards* without changing who survives, and
      // a viability move cannot be mistaken for a capability move.
      let intake = eat;
      if (C.CP_STRENGTH > 0) {
        const r2 = C.CP_NEST_RADIUS * C.CP_NEST_RADIUS;
        const inNest = this.pos.square().sum(1).less(r2).toFloat();
        const deposit = this.carry.mul(inNest).mul(C.CP_DEPOSIT_RATE);   // per second
        const nextCarry = this.carry.add(
          eat.mul(C.CP_STRENGTH).sub(this.carry.mul(C.CP_CARRY_DECAY)).sub(deposit).mul(C.DT));
        this.carry.assign(tf.relu(nextCarry));
        intake = eat.mul(1 - C.CP_STRENGTH).add(deposit.mul(C.CP_NEST_MULT));
        // Behavioural readout, not part of fitness: how much of the reward
        // actually came home, and how long anyone spent at the nest. Without
        // this a score move cannot be attributed to central-place behaviour.
        this.banked.assign(this.banked.add(deposit.mul(C.CP_NEST_MULT).mul(C.DT)));
        this.nestTime.assign(this.nestTime.add(inNest.mul(C.DT)));
      }
      // Predation moves fitness between the species. The prey's loss is set
      // larger than the predator's gain: being caught has to cost more than a
      // missed meal, or evasion never pays for the foraging it displaces.
      if (contact) {
        intake = isPred
          ? intake.add(contact.mul(C.COEVO_PRED_GAIN))
          : intake.sub(contact.mul(C.COEVO_PREY_LOSS));
        // Behavioural readout, not part of fitness. `contactAcc` is the one
        // quantity the ancestral tournament reads, measured identically from
        // both sides; `forageAcc` separates "evaded the predator" from
        // "stopped eating", which produce the same head-to-head number and are
        // opposite results.
        this.contactAcc.assign(this.contactAcc.add(contact.mul(C.DT)));
        this.forageAcc.assign(this.forageAcc.add(eat.mul(C.DT)));
      }
      this.fitness.assign(this.fitness.add(
        intake.sub(tox.mul(1.35)).add(speed.mul(.018)).add(en.greater(.04).toFloat().mul(.003)).mul(C.DT)));
      if (this.recording) {
        // Pooled regression accumulators for the taxis measures.
        // Columns 9-11 capture thrust modulation. `taxis` only correlates the
        // *turn* output against food bearing, so an agent that steers by
        // speeding up when food is ahead and slowing when it is not — a
        // perfectly good taxis — is invisible to it. fb[0] is the forward
        // component of the food vector in the body frame.
        this.acc.assign(this.acc.add(tf.stack([
          fb[1], fb[1].square(), fb[1].mul(turn),
          hb[1], hb[1].square(), hb[1].mul(turn),
          turn, turn.square(), fb[0],
          thrust, thrust.square(), fb[0].mul(thrust)], 1)));
      }
      // Full per-step, per-agent trace for policy analysis beyond correlation —
      // see EvoDevoSim.TRACE_CHANNELS. Off by default (this.tracing), and reads
      // synchronously via dataSync so a multi-hundred-step trace does not pay
      // for hundreds of async round trips.
      if (this.tracing) {
        const distMin = food.d2.min(1);
        const px = np.slice([0, 0], [-1, 1]).squeeze([1]), py = np.slice([0, 1], [-1, 1]).squeeze([1]);
        // Order must match EvoDevoSim.TRACE_CHANNELS exactly.
        const zero = tf.zeros([C.POP]);
        const row = tf.stack([fb[0], fb[1], food.mass, turn, thrust, eat, en, distMin, px, py,
          ob ? ob[0] : zero, ob ? ob[1] : zero, opp ? opp.mass : zero,
          odourMass, haz.mass], 1);
        const view = row.dataSync();
        this.traceBuf.set(view, this.traceStep * C.POP * EvoDevoSim.TRACE_CHANNELS.length);
        this.traceStep++;
      }
    });
    this.stepNo++;
    if (this.recording) this.accSteps++;
  }

  /* ------------------------------------------------------ evolution */
  mutateTensor(parent, scale) {
    const tf = T();
    const mask = this.ru(parent.shape).less(this.mutation).toFloat();
    return parent.add(this.rn(parent.shape, 0, scale).mul(mask));
  }
  /**
   * Quality-diversity elite selection: one fittest agent per angular sector
   * of final position (bearing atan2(y,x) around the origin, C.NICHES
   * sectors), backfilled with the next-fittest agent overall wherever a
   * sector is empty. Small JS loop over the population (once per generation,
   * exactly like advanceLineage already does), not per simulation step.
   * Always returns exactly C.ELITES indices.
   */
  async niceEliteIdx() {
    const C = this.cfg, tf = T();
    const angleT = tf.tidy(() => tf.atan2(
      this.pos.slice([0, 1], [-1, 1]).squeeze([1]), this.pos.slice([0, 0], [-1, 1]).squeeze([1])));
    const [fit, ang] = await Promise.all([this.fitness.data(), angleT.data()]);
    angleT.dispose();
    const N = Math.max(1, C.NICHES | 0);
    const bestIdx = new Array(N).fill(-1), bestFit = new Array(N).fill(-Infinity);
    for (let i = 0; i < C.POP; i++) {
      const bin = Math.min(N - 1, Math.max(0, Math.floor((ang[i] + Math.PI) / (2 * Math.PI) * N)));
      if (fit[i] > bestFit[bin]) { bestFit[bin] = fit[i]; bestIdx[bin] = i; }
    }
    const chosen = new Set(), elites = [];
    for (const i of bestIdx) if (i >= 0 && !chosen.has(i)) { chosen.add(i); elites.push(i); }
    const order = Array.from({ length: C.POP }, (_, i) => i).sort((a, b) => fit[b] - fit[a]);
    for (const i of order) {
      if (elites.length >= C.ELITES) break;
      if (!chosen.has(i)) { chosen.add(i); elites.push(i); }
    }
    return Int32Array.from(elites.slice(0, C.ELITES));
  }
  async evolve() {
    const C = this.cfg, tf = T();
    let topIdx, eliteIdxT, disposeElite = () => {};
    if (C.SELECT === 'niche') {
      topIdx = await this.niceEliteIdx();
      eliteIdxT = tf.tensor1d(topIdx, 'int32');
      disposeElite = () => eliteIdxT.dispose();
    } else if (C.SELECT === 'novelty') {
      // k-nearest-neighbour novelty in final-position space, z-scored
      // alongside z-scored fitness so the two combine on a common scale
      // regardless of their raw units, then truncated on the sum. A
      // pure-fitness optimum is exactly the attractor this system gets stuck
      // in; rewarding agents that end up somewhere the rest of the
      // population didn't is a direct, structural way to keep exploring it.
      const k = Math.max(1, Math.min(C.POP - 1, C.NOVELTY_K | 0));
      const combined = tf.tidy(() => {
        const diff = this.pos.expandDims(1).sub(this.pos.expandDims(0));
        const d2 = diff.square().sum(2).add(tf.eye(C.POP).mul(1e6)); // self excluded
        const nearest = tf.topk(d2.mul(-1), k, false);
        const novelty = nearest.values.mul(-1).sqrt().mean(1);
        const fm = tf.moments(this.fitness), nm = tf.moments(novelty);
        const fz = this.fitness.sub(fm.mean).div(fm.variance.sqrt().add(1e-6));
        const nz = novelty.sub(nm.mean).div(nm.variance.sqrt().add(1e-6));
        return fz.add(nz.mul(C.NOVELTY_WEIGHT));
      });
      const top = tf.topk(combined, C.ELITES, true);
      topIdx = await top.indices.data();
      eliteIdxT = top.indices;
      disposeElite = () => { top.values.dispose(); top.indices.dispose(); combined.dispose(); };
    } else {
      const top = tf.topk(this.fitness, C.ELITES, true);
      topIdx = await top.indices.data();
      eliteIdxT = top.indices;
      disposeElite = () => { top.values.dispose(); top.indices.dispose(); };
    }
    const choice = this.ru([C.POP - C.ELITES], 0, C.ELITES, 'int32');
    const choiceIdx = await choice.data();
    tf.tidy(() => {
      const eliteR = tf.gather(this.genR, eliteIdxT), eliteM = tf.gather(this.genM, eliteIdxT);
      const parentIdx = tf.gather(eliteIdxT, choice);
      const childrenR = this.mutateTensor(tf.gather(this.genR, parentIdx), C.MUTATE_R);
      const childrenM = this.mutateTensor(tf.gather(this.genM, parentIdx), C.MUTATE_M);
      this.genR.assign(tf.concat([eliteR, childrenR], 0).clipByValue(-3.2, 3.2));
      this.genM.assign(tf.concat([eliteM, childrenM], 0).clipByValue(-4, 4));
    });
    disposeElite(); choice.dispose();
    this.advanceLineage(topIdx, choiceIdx);
    this.gen++; this.selected = 0;
    await this.develop(); this.resetBodies();
  }

  /* ------------------------------------------------------ analysis */
  resetAccumulators() { const tf = T(); tf.tidy(() => this.acc.assign(tf.zerosLike(this.acc))); this.accSteps = 0; }

  /**
   * Full per-step, per-agent trace, for policy analysis that a Pearson
   * correlation (`taxisStats`) is structurally blind to — nonlinear or
   * non-monotonic stimulus/response relationships, gated or threshold
   * responses, and trajectory statistics conditioned on sensory state.
   * Preallocated and filled with `dataSync` inside `step()` rather than an
   * async `.data()` per step, so a several-hundred-step trace does not pay
   * for hundreds of round trips.
   */
  startTrace(steps) {
    this.traceBuf = new Float32Array(steps * this.cfg.POP * EvoDevoSim.TRACE_CHANNELS.length);
    this.traceCap = steps; this.traceStep = 0; this.tracing = true;
  }
  stopTrace() {
    this.tracing = false;
    const { traceBuf: buf, traceStep: steps } = this;
    this.traceBuf = null;
    return { buf, steps, pop: this.cfg.POP, channels: EvoDevoSim.TRACE_CHANNELS };
  }

  /**
   * One evaluation episode. `yieldEvery` > 0 hands control back periodically so a
   * browser stays responsive; headless runs pass 0 and go flat out.
   */
  async evaluate({ steps, init, mods = null, record = false, onProgress = null, yieldEvery = 32 }) {
    if (init) this.applyInit(init);
    this.mods = mods; this.recording = record;
    if (record) this.resetAccumulators();
    for (let i = 0; i < steps; i++) {
      this.step();
      if (yieldEvery && (i % yieldEvery) === yieldEvery - 1) {
        await T().nextFrame();
        if (onProgress) onProgress(i + 1);
      }
    }
    const f = new Float32Array(await this.fitness.data());
    this.mods = null; this.recording = false;
    if (onProgress) onProgress(steps);
    return f;
  }

  async taxisStats() {
    if (!this.accSteps) return null;
    const C = this.cfg, raw = await this.acc.data(), K = C.ACC_COLS, n = this.accSteps;
    const col = j => { let t = 0; for (let i = 0; i < C.POP; i++) t += raw[i * K + j]; return t; };
    const N = n * C.POP;
    const corr = (sx, sxx, sy, syy, sxy, cnt) => {
      const cov = cnt * sxy - sx * sy, vx = cnt * sxx - sx * sx, vy = cnt * syy - sy * sy;
      return (vx <= 1e-9 || vy <= 1e-9) ? 0 : cov / Math.sqrt(vx * vy);
    };
    const sT = col(6), sTT = col(7);
    const food = corr(col(0), col(1), sT, sTT, col(2), N);
    const toxin = corr(col(3), col(4), sT, sTT, col(5), N);
    let strongFood = 0;
    for (let i = 0; i < C.POP; i++) {
      const g = j => raw[i * K + j];
      if (Math.abs(corr(g(0), g(1), g(6), g(7), g(2), n)) > 0.2) strongFood++;
    }
    const thrustTaxis = corr(col(8), 0, col(9), col(10), col(11), N) || 0;
    // Sxx for fb[0] is not accumulated separately; recompute from its own column
    // pair using the same estimator shape as above.
    const fwd = (() => {
      let sxx = 0; for (let i = 0; i < C.POP; i++) { const v = raw[i * K + 8]; sxx += v * v; }
      return corr(col(8), sxx, col(9), col(10), col(11), N);
    })();
    return { food, toxin, forwardBias: col(8) / N, strongFood, samples: N,
             thrustTaxis: fwd };
  }

  // `gain` is the mean over agents of the largest absolute row sum of W, which
  // bounds how much the recurrent term can amplify: above ~1 the tanh fixed
  // points sit in the flat region and the cell stops responding to input.
  async networkStats() {
    const C = this.cfg, tf = T();
    const t = tf.tidy(() => tf.stack([
      tf.tanh(this.neural).abs().greater(C.SAT_LEVEL).toFloat().mean(),
      this.W.abs().sum(2).max(1).mean(),
      this.pos.abs().max(1).greater(C.WALL_LEVEL).toFloat().mean(),
    ]));
    const perAgent = tf.tidy(() => tf.tanh(this.neural).abs().greater(C.SAT_LEVEL).toFloat().mean(1));
    const [d, sat, fit] = await Promise.all([t.data(), perAgent.data(), this.fitness.data()]);
    t.dispose(); perAgent.dispose();
    const n = sat.length, ms = mean(sat), mf = mean(fit);
    let sab = 0, sa = 0, sb = 0;
    for (let i = 0; i < n; i++) { const da = sat[i] - ms, db = fit[i] - mf; sab += da * db; sa += da * da; sb += db * db; }
    return { saturation: d[0], gain: d[1], atWall: d[2], satFitCorr: (sa < 1e-12 || sb < 1e-12) ? 0 : sab / Math.sqrt(sa * sb) };
  }

  /**
   * Central-place behaviour, measured on whatever episode just ran. Null when
   * the task is off. `nestShare` is the fraction of the top quartile's fitness
   * that arrived via a nest deposit — the number that says whether a score
   * move is central-place foraging or just the residual direct intake.
   */
  async centralStats() {
    if (!(this.cfg.CP_STRENGTH > 0)) return null;
    const C = this.cfg;
    const [bank, nt, carry, fit] = await Promise.all([
      this.banked.data(), this.nestTime.data(), this.carry.data(), this.fitness.data()]);
    const order = Array.from({ length: C.POP }, (_, i) => i).sort((a, b) => fit[b] - fit[a]);
    const n = Math.max(1, Math.round(C.POP / 4));
    let bq = 0, fq = 0;
    for (let i = 0; i < n; i++) { bq += bank[order[i]]; fq += fit[order[i]]; }
    let visited = 0;
    for (let i = 0; i < C.POP; i++) if (nt[i] > 0) visited++;
    return {
      banked: mean(bank), carry: mean(carry), nestTime: mean(nt),
      visitedFrac: visited / C.POP,
      nestShare: Math.abs(fq) > 1e-9 ? bq / fq : 0,
    };
  }

  /**
   * Hazard exposure and feeding, measured on whatever episode just ran. Always
   * available (dose 0 included) so the ambiguity sweep has its own reference
   * arm rather than an argument about what the baseline "should" be.
   *
   * `toxDose` is integrated hazard contact in seconds-at-full-strength;
   * `toxDoseTop`/`intakeTop` are the same over the top quartile by fitness,
   * i.e. over the part of the population selection acts on. The ratio of
   * `toxDoseTop` to `toxDose` is the discrimination readout: if the selected
   * agents are avoiding hazards that everyone else blunders into, it falls
   * below 1. It cannot be gamed by the score, because none of this is in it.
   */
  async odourStats() {
    const C = this.cfg;
    const [tox, eatn, fit] = await Promise.all([
      this.toxDose.data(), this.intake.data(), this.fitness.data()]);
    const order = Array.from({ length: C.POP }, (_, i) => i).sort((a, b) => fit[b] - fit[a]);
    const n = Math.max(1, Math.round(C.POP / 4));
    let tq = 0, iq = 0;
    for (let i = 0; i < n; i++) { tq += tox[order[i]]; iq += eatn[order[i]]; }
    const toxAll = mean(tox), toxTop = tq / n;
    return {
      ambiguity: C.ODOUR_AMBIGUITY,
      toxDose: toxAll, intake: mean(eatn),
      toxDoseTop: toxTop, intakeTop: iq / n,
      // < 1 means the selected quartile is taking less poison than the
      // population average — the signature of an evolved discrimination.
      toxRatio: toxAll > 1e-9 ? toxTop / toxAll : 0,
    };
  }

  /**
   * Coevolutionary behaviour, measured on whatever episode just ran. Null when
   * the two-species world is off.
   *
   * `contact` is the integrated contact with the opposing species in
   * contact-seconds — for a predator, prey caught; for a prey, times caught.
   * It is the same physical quantity read from both sides, which is what lets
   * a predator generation and a prey generation be placed on one axis.
   * `forage` is integrated food intake, reported alongside because a prey
   * population that survives by never approaching a patch and one that
   * genuinely evades produce identical contact numbers.
   */
  async coevoStats() {
    if (!this.cfg.COEVO) return null;
    const C = this.cfg;
    const [ct, fg, fit] = await Promise.all([
      this.contactAcc.data(), this.forageAcc.data(), this.fitness.data()]);
    let touched = 0;
    for (let i = 0; i < C.POP; i++) if (ct[i] > 1e-4) touched++;
    return {
      contact: mean(ct), contactTop: topQuartile(ct), contactSd: sd(ct),
      // The bottom quartile of contact is the prey side's equivalent of
      // topQuartile: the part of the distribution selection actually keeps.
      contactBottom: topQuartile(Array.from(ct).map(x => -x)) * -1,
      forage: mean(fg), forageTop: topQuartile(fg),
      touchedFrac: touched / C.POP,
      fitness: mean(fit), fitnessTop: topQuartile(fit),
    };
  }

  async populationStats() {
    const tf = T();
    const t = tf.tidy(() => tf.stack([
      tf.moments(this.genR, [0]).variance.mean().sqrt(),
      tf.moments(this.genM, [0]).variance.mean().sqrt(),
      tf.moments(this.expr, [0]).variance.mean().sqrt(),
      tf.moments(this.color, [0]).variance.mean().sqrt(),
    ]));
    const d = await t.data(); t.dispose();
    return Object.assign({ genomeSigma: (d[0] + d[1]) / 2, exprSigma: d[2], colorSigma: d[3] }, this.lineageStats());
  }

  /* ------------------------------------------------------ population files */
  // The field layout travels with the genomes. Without it an imported
  // population is scored on a different world, which quietly breaks whatever
  // comparison the file was saved to make.
  async exportPopulation() {
    const C = this.cfg;
    const [gr, gm] = await Promise.all([this.genR.data(), this.genM.data()]);
    return {
      format: 'evodevo-population', version: 1,
      saved: new Date().toISOString(),
      config: { POP: C.POP, GENES: C.GENES, CELLS: C.CELLS, SENSORS: C.SENSORS, FOOD: C.FOOD, HAZARDS: C.HAZARDS },
      generation: this.gen, gain: this.gain, mutation: this.mutation, seed: this.seed,
      world: { food: this.world.food, hazards: this.world.hazards },
      lineage: {
        founder: Array.from(this.founder), genomeId: Array.from(this.genomeId),
        nextGenomeId: this.nextGenomeId, streak: Array.from(this.eliteStreak.entries()),
      },
      genR: B64.encode(new Float32Array(gr)),
      genM: B64.encode(new Float32Array(gm)),
    };
  }

  async importPopulation(p) {
    const C = this.cfg, tf = T();
    if (!p || p.format !== 'evodevo-population') throw new Error('not an Evo/Devo population file');
    if (p.version > 1) throw new Error('saved by a newer version of this page');
    const c = p.config || {};
    if (c.POP !== C.POP || c.GENES !== C.GENES || c.CELLS !== C.CELLS)
      throw new Error(`saved for a different configuration (pop ${c.POP}, genes ${c.GENES}, cells ${c.CELLS})`);
    const gr = B64.decode(p.genR), gm = B64.decode(p.genM);
    const needR = C.POP * C.GENES * C.GENES, needM = C.POP * 3 * C.GENES;
    if (gr.length !== needR) throw new Error(`genR is ${gr.length} floats, expected ${needR}`);
    if (gm.length !== needM) throw new Error(`genM is ${gm.length} floats, expected ${needM}`);
    if (!allFinite(gr) || !allFinite(gm)) throw new Error('genome contains NaN or Infinity');

    tf.tidy(() => {
      this.genR.assign(tf.tensor3d(gr, [C.POP, C.GENES, C.GENES]));
      this.genM.assign(tf.tensor3d(gm, [C.POP, 3, C.GENES]));
    });
    let worldRestored = false;
    if (p.world && validPoints(p.world.food, C.FOOD) && validPoints(p.world.hazards, C.HAZARDS)) {
      this.world = { obstacles: this.world.obstacles, food: p.world.food, hazards: p.world.hazards };
      this.food.assign(tf.tensor2d(this.world.food, [C.FOOD, 2]));
      this.haz.dispose();
      this.haz = tf.tensor2d(this.world.hazards, [C.HAZARDS, 2]);
      worldRestored = true;
    }
    const L = p.lineage;
    if (L && Array.isArray(L.founder) && L.founder.length === C.POP &&
        Array.isArray(L.genomeId) && L.genomeId.length === C.POP) {
      this.founder = Int32Array.from(L.founder);
      this.genomeId = Int32Array.from(L.genomeId);
      this.nextGenomeId = Number.isFinite(L.nextGenomeId) ? L.nextGenomeId : C.POP;
      this.eliteStreak = new Map(Array.isArray(L.streak) ? L.streak : []);
    } else this.resetLineage();

    if (Number.isFinite(p.gain)) this.gain = clamp(p.gain, 0.1, 3);
    if (Number.isFinite(p.mutation)) this.mutation = clamp(p.mutation, 0.01, 0.3);
    this.gen = Number.isFinite(p.generation) ? p.generation : 0;
    await this.develop(); this.resetBodies();
    return { worldRestored, generation: this.gen, gain: this.gain, mutation: this.mutation, saved: p.saved };
  }

  snapshot(selected) {
    const C = this.cfg, tf = T();
    if (this.snapshotPending) return false;
    this.snapshotPending = true;
    const view = tf.tidy(() => {
      const speed = tf.sqrt(this.vel.square().sum(1).add(1e-6)).expandDims(1);
      return tf.concat([this.pos, this.angle.expandDims(1), this.energy.expandDims(1),
        this.fitness.expandDims(1), speed, this.color], 1);
    });
    // Saturation and wall-pinning ride along in the existing readback rather
    // than costing a second GPU round trip per frame.
    const diag = tf.tidy(() => tf.stack([
      this.fitness.max(), this.fitness.mean(), this.energy.mean(), this.foodStock.mean(),
      tf.tanh(this.neural).abs().greater(C.SAT_LEVEL).toFloat().mean(),
      this.pos.abs().max(1).greater(C.WALL_LEVEL).toFloat().mean(),
    ]));
    const inspect = tf.tidy(() => tf.concat([
      tf.gather(this.expr, selected).flatten(),
      tf.gather(this.neural, selected).flatten(),
      tf.gather(this.W, selected).flatten()]));
    const stock = this.foodStock.clone();
    Promise.all([view.data(), diag.data(), inspect.data(), stock.data()])
      .then(([v, d, i, s]) => {
        this.lastSnapshot = { view: new Float32Array(v), diag: new Float32Array(d),
          inspect: new Float32Array(i), stock: new Float32Array(s) };
      })
      .catch(err => { console.warn('snapshot readback failed', err); })
      .finally(() => { view.dispose(); diag.dispose(); inspect.dispose(); stock.dispose(); this.snapshotPending = false; });
    return true;
  }
}

/* ------------------------------------------------------------ diagnostics */

/**
 * The full ablation suite, with no UI attached. Returns plain data; the page
 * renders it and the headless runners serialise it.
 *
 * Every condition replays the same genomes from the same starting positions,
 * so a difference is the condition and not spawn luck.
 */
export async function diagnose(sim, opts = {}) {
  const {
    steps = 600, restarts = 3, onProgress = null, yieldEvery = 32,
    conditionList = conditions(sim.cfg), seed = 0x51ed,
  } = opts;
  const C = sim.cfg;
  // A dedicated stream, so running diagnostics does not shift the sim's own RNG
  // and change what the next generation would have been.
  const rng = makeRng(seed);
  const total = steps * restarts * conditionList.length;
  let done = 0;

  sim.analysing = true;
  const saved = sim.saveState();
  const results = {};
  for (const c of conditionList) results[c.key] = { pop: [], elite: [], top: [], all: null };
  // The taxis measure is also recorded under the fully scrambled condition,
  // which has the same autocorrelation structure but no real coupling. That run
  // is the empirical null the baseline has to beat.
  let taxis = null, taxisNull = null, network = null, central = null, odour = null;
  try {
    for (let r = 0; r < restarts; r++) {
      const init = sim.makeInit();
      for (const cond of conditionList) {
        const mods = makeMods(cond.mask, cond.lesion, C, rng, cond.constant);
        const record = (r === 0 && (cond.key === 'baseline' || cond.key === 'blind'));
        const cb = onProgress ? n => onProgress({
          fraction: (done + n) / total, restart: r + 1, restarts, condition: cond.label,
        }) : null;
        const runIt = () => sim.evaluate({ steps, init, mods, record, onProgress: cb, yieldEvery });
        const fit = cond.novel ? await sim.withNovelWorld(runIt) : await runIt();
        disposeMods(mods);
        done += steps;
        results[cond.key].pop.push(mean(fit));
        results[cond.key].elite.push(meanOf(fit, C.ELITES));
        results[cond.key].top.push(topQuartile(fit));
        if (record) {
          const t = await sim.taxisStats();
          if (cond.key === 'baseline') {
            results.baseline.all = fit; taxis = t;
            // Measured here, on a settled network. Taken after restoreState it
            // would read the freshly-reset state, where nothing has railed yet
            // and saturation always reports ~0. The central-place readout has
            // the same constraint: the accumulators are per-episode and
            // restoreState puts back the pre-diagnose ones.
            network = await sim.networkStats();
            central = await sim.centralStats();
            odour = await sim.odourStats();
          } else taxisNull = t;
        }
      }
      sim.disposeInit(init);
    }
  } finally {
    sim.restoreState(saved); sim.analysing = false;
  }

  const base = mean(results.baseline.top);
  const drop = key => (base - mean(results[key].top)) / Math.abs(base);
  const table = conditionList.map(c => ({
    key: c.key, label: c.label, note: c.note || '',
    pop: mean(results[c.key].pop), elite: mean(results[c.key].elite), top: mean(results[c.key].top),
    delta: c.key === 'baseline' ? 0 : (mean(results[c.key].top) - base) / Math.abs(base),
  }));
  const all = results.baseline.all;
  const eliteAdvantage = all
    ? (sd(all) > 1e-9 ? (meanOf(all, C.ELITES) - median(all)) / sd(all) : 0)
    : null;

  return {
    steps, restarts, base, table, taxis, taxisNull, eliteAdvantage, central, odour,
    drops: Object.fromEntries(conditionList.filter(c => c.key !== 'baseline').map(c => [c.key, drop(c.key)])),
    network: network || await sim.networkStats(),
    population: await sim.populationStats(),
    generation: sim.gen, gain: sim.gain, mutation: sim.mutation,
    // Fitness accrues at up to ~1 per second of sim time, so the floor for
    // "worth interpreting" scales with how long the episode ran.
    interpretable: base >= 0.03 * steps * C.DT,
    ceiling: steps * C.DT,
  };
}

/* ----------------------------------------------------------- coevolution */

/**
 * Copy the live food state from the world's owner to the other species, so the
 * two sims — which each hold their own `food`/`foodStock` Variables — are
 * looking at one world rather than two that drift apart as patches are eaten
 * and relocated. The prey own the world: they are the ones that deplete it.
 */
export function coevoSyncWorld(owner, other) {
  T().tidy(() => {
    other.food.assign(owner.food);
    other.foodStock.assign(owner.foodStock);
  });
  other.world = owner.world;
}

/**
 * Advance both species by one step, simultaneously.
 *
 * The positions are cloned up front and handed to the *other* sim, so both
 * species react to the same instant. Stepping one and then letting the second
 * read the first's already-updated positions would hand the second species a
 * half-step of precognition, which over 1450 steps is exactly the sort of
 * asymmetry that would show up in a tournament as one side "winning".
 */
export function coevoStep(prey, pred) {
  const pp = prey.pos.clone(), qp = pred.pos.clone();
  prey.opponentPos = qp; pred.opponentPos = pp;
  try { prey.step(); pred.step(); }
  finally {
    prey.opponentPos = null; pred.opponentPos = null;
    pp.dispose(); qp.dispose();
  }
  coevoSyncWorld(prey, pred);
}

/** Run one coevolutionary episode of `steps` from the current bodies. */
export async function coevoEpisode(prey, pred, steps, yieldEvery = 0) {
  for (let i = 0; i < steps; i++) {
    coevoStep(prey, pred);
    if (yieldEvery && (i % yieldEvery) === yieldEvery - 1) await T().nextFrame();
  }
}

/**
 * Coevolve two populations for `generations`.
 *
 * `opts.hof` (default null) turns on hall-of-fame evaluation: each generation
 * is split into a sub-epoch against the current opponent and a sub-epoch
 * against an archived one, with fitness summed across both. Retaining
 * ancestors as part of the opponent set is the standard stabiliser against
 * cycling — a genotype that beats today's opponent but loses to last week's
 * no longer scores well — but it costs a second pair of stepped sims per
 * generation, so it is a hypothesis to test rather than a default.
 *
 * `opts.hof` shape: { frac, ghostPrey, ghostPred, pick(gen) } where `pick`
 * returns an archived population object to load into the two ghost sims.
 */
export async function coevolveFor(prey, pred, generations, opts = {}) {
  const { onGeneration = null, yieldEvery = 0, hof = null } = opts;
  const tf = T();
  const steps = prey.cfg.EPOCH_STEPS;
  const frac = hof ? Math.max(0, Math.min(0.9, hof.frac ?? 0.5)) : 0;
  const mainSteps = Math.max(1, Math.round(steps * (1 - frac)));
  const hofSteps = Math.max(0, steps - mainSteps);

  for (let g = 0; g < generations; g++) {
    prey.resetBodies(); pred.resetBodies();
    coevoSyncWorld(prey, pred);
    await coevoEpisode(prey, pred, mainSteps, yieldEvery);
    const stats = {
      prey: await prey.coevoStats(), pred: await pred.coevoStats(),
    };

    if (hof && hofSteps > 0) {
      // Carry the current-opponent fitness forward, then re-run against the
      // archived opponents and sum. Bodies are reset between sub-epochs so the
      // second is an independent episode, not a continuation of the first.
      const keepPreyF = prey.fitness.clone(), keepPredF = pred.fitness.clone();
      const keepPreyP = prey.pos.clone(), keepPredP = pred.pos.clone();
      const archived = hof.pick(g);
      if (archived) {
        await hof.ghostPrey.importPopulation(archived.prey);
        await hof.ghostPred.importPopulation(archived.pred);
        // Current prey vs archived predators.
        prey.resetBodies(); hof.ghostPred.resetBodies();
        coevoSyncWorld(prey, hof.ghostPred);
        await coevoEpisode(prey, hof.ghostPred, hofSteps, yieldEvery);
        const preyHofF = prey.fitness.clone(), preyHofP = prey.pos.clone();
        // Current predators vs archived prey.
        hof.ghostPrey.resetBodies(); pred.resetBodies();
        coevoSyncWorld(hof.ghostPrey, pred);
        await coevoEpisode(hof.ghostPrey, pred, hofSteps, yieldEvery);
        tf.tidy(() => {
          prey.fitness.assign(keepPreyF.add(preyHofF));
          pred.fitness.assign(keepPredF.add(pred.fitness));
          prey.pos.assign(keepPreyP.add(preyHofP).div(2));
          pred.pos.assign(keepPredP.add(pred.pos).div(2));
        });
        preyHofF.dispose(); preyHofP.dispose();
      }
      keepPreyF.dispose(); keepPredF.dispose(); keepPreyP.dispose(); keepPredP.dispose();
    }

    await prey.evolve(); await pred.evolve();
    if (onGeneration) await onGeneration({ generation: prey.gen, ...stats });
  }
  return { prey, pred };
}

/**
 * Evolve for `generations`, optionally reporting progress. Returns the sim.
 *
 * `opts.spawns` (default 1, a no-op): evaluate each generation over this many
 * independent fresh-spawn episodes and select on the mean fitness instead of
 * a single episode. Truncation (or niche) selection on one episode is
 * partly selecting on spawn-position luck rather than genotype — measured
 * in wave 1, top-10 mean distance to the nearest food patch 0.02-0.03
 * against a population median of 0.12. Averaging independent spawns before
 * selection acts averages that luck out. `evolve()` itself is untouched; it
 * still just acts on whatever `sim.fitness` (and, for niche selection,
 * `sim.pos`) currently holds, so this composes with either selection scheme.
 */
export async function evolveFor(sim, generations, opts = {}) {
  // `curriculum(g, generations)` returns a reseedWorld() overrides object for
  // generation g (0-indexed) — a difficulty ramp that hardens the world as
  // evolution proceeds, so the population is not wiped out before it can
  // adapt. Reseeding regenerates the whole layout each call, so it also
  // exercises the same "no memorised geography" pressure as relocation, just
  // at generation granularity instead of within an epoch. Applied once per
  // generation, before the spawn loop below, so every spawn in a generation
  // sees the same (possibly ramped) layout.
  const { onGeneration = null, yieldEvery = 0, curriculum = null, spawns = 1 } = opts;
  const nSpawns = Math.max(1, spawns | 0);
  for (let g = 0; g < generations; g++) {
    if (curriculum) sim.reseedWorld(curriculum(g, generations));
    let fitAccum = null, posAccum = null;
    for (let s = 0; s < nSpawns; s++) {
      sim.resetBodies();
      for (let i = 0; i < sim.cfg.EPOCH_STEPS; i++) {
        sim.step();
        if (yieldEvery && (i % yieldEvery) === yieldEvery - 1) await T().nextFrame();
      }
      if (nSpawns > 1) {
        const f = sim.fitness.clone(), p = sim.pos.clone();
        if (fitAccum) {
          const nf = fitAccum.add(f), np = posAccum.add(p);
          fitAccum.dispose(); f.dispose(); posAccum.dispose(); p.dispose();
          fitAccum = nf; posAccum = np;
        } else { fitAccum = f; posAccum = p; }
      }
    }
    if (nSpawns > 1) {
      const avgF = fitAccum.div(nSpawns), avgP = posAccum.div(nSpawns);
      fitAccum.dispose(); posAccum.dispose();
      sim.fitness.assign(avgF); avgF.dispose();
      // sim.pos feeds the niche descriptor (bearing of final position); the
      // mean across spawns is the fair analogue of averaging fitness, and
      // evolve() reads it before resetBodies() zeroes it again.
      sim.pos.assign(avgP); avgP.dispose();
    }
    // Read the epoch's result before evolving: evolve() ends by resetting the
    // bodies, which zeroes fitness, so reading afterwards always reports 0.
    let best = 0;
    if (onGeneration) { const t = sim.fitness.max(); best = (await t.data())[0]; t.dispose(); }
    await sim.evolve();
    if (onGeneration) await onGeneration({ generation: sim.gen, best });
  }
  return sim;
}
