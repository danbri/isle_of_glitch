#!/usr/bin/env node
/**
 * Characterise the food-sensing policy directly, instead of assuming a
 * functional form for it.
 *
 * Motivation (see RESEARCH.md): ablating the food sense costs 5-21% of
 * fitness (scrambled) and 9-28% (mean-replaced) — the information is used —
 * but the two obvious instantaneous stimulus-response measures, turn-vs-
 * bearing correlation (`taxis`) and thrust-vs-forward-component correlation,
 * both read as chance. So whatever the policy is, it is not a linear
 * instantaneous map from sensor to motor that a Pearson correlation can see.
 *
 * This tool evolves a population under the current defaults, then instead of
 * one correlation coefficient it:
 *
 *   1. Records full per-step, per-agent trajectories (EvoDevoSim.startTrace),
 *      paired: the same genomes from the same spawn positions, once with
 *      senses intact and once with them replaced by the population mean
 *      (`blindConst` — information removed, nothing injected, per the prior
 *      finding that scrambling itself perturbs the network).
 *   2. Computes lagged mutual information between food bearing and turn (and
 *      forward food component and thrust) — model-free, catches nonlinear or
 *      non-monotonic couplings a correlation is blind to — against a
 *      circular-shift surrogate null that preserves each agent's own
 *      autocorrelation structure.
 *   3. Bins turn/thrust by quantile of the sensed signal and prints the
 *      conditional mean response per bin, to look directly for a threshold/
 *      gated response rather than assume proportionality.
 *   4. Splits every timestep into "approaching" / "receding" by the sign of
 *      the change in sensed food mass and compares turn and thrust
 *      distributions between them (klinokinesis), per agent, paired.
 *   5. Compares the paired full-vs-blindConst trajectories directly: final
 *      proximity to food, time spent near a patch, and cumulative intake —
 *      the behavioural effect of sensing with no model of the mechanism.
 *
 *   node tools/policy.js --generations 8 --steps 600 --restarts 6 --seed 1
 */
import fs from 'node:fs/promises';
import { initBackend, parseArgs } from './backend.js';
import { EvoDevoSim, evolveFor, coevolveFor, coevoStep, coevoSyncWorld,
         makeMods, keepAllBut, makeRng, mean, sd } from '../lib/evodevo.js';

const args = parseArgs(process.argv.slice(2), {
  generations: 8, seed: 1, steps: 600, restarts: 6,
  pop: 192, elites: 10, gain: 0.5, mutation: 0.10, epoch: 1450,
  clusters: 9, clusterSigma: 0.12, senseSigma2: 0.050, relocateThresh: 0.15,
  select: 'trunc', backend: 'auto', out: '', quiet: false, label: '',
  bins: 6, lags: '0,1,2,3,5,8,13,21,34', nullShuffles: 24, nearFrac: 0.25,
  // Shared-odour ambiguity (see lib/evodevo.js). At 0 this tool behaves
  // exactly as before: odourMass === foodMass and `quality` is the old
  // long-range toxin mass. At 1 the odour channel carries food and hazards
  // alike and `quality` is the only identity cue, readable only close up.
  ambiguity: 0, qualitySigma2: 0.010,
  // Hazard stakes — see lib/evodevo.js. All three are no-ops at their defaults.
  // The klinokinesis test has to be able to run in the raised-stakes cells or
  // the stakes experiment has no policy-level readout at all.
  hazStakes: 1, hazSigma2: 0.0015, hazards: 18,
  // Two-species mode. The prey population is the one traced and analysed; the
  // predators are stepped alongside it so the traced behaviour is behaviour
  // under actual threat rather than behaviour in an empty world.
  //
  // `channels` selects which stimulus the whole analysis is run against:
  // 'food' reproduces the original single-species measurement, 'opponent'
  // points every measure at the predator instead. That second setting is the
  // point of this mode. Evasion is structurally NOT klinokinesis -- you cannot
  // escape a pursuer by turning more when a food smell fades -- so if the
  // klinokinesis test comes back null on the opponent channel while the
  // mutual information does not, the policy is something this project has
  // never produced before.
  coevo: false, predPop: 48, predElites: 6,
  captureSigma2: 0.0012, preyLoss: 1.0, predGain: 1.0, predForage: 0,
  channels: 'food', ablate: 'base',
});
const log = (...m) => { if (!args.quiet) console.error(...m); };
const lags = String(args.lags).split(',').map(s => Number(s.trim()));

const { pkg, backend } = await initBackend({ prefer: args.backend });
log(`[backend] ${pkg} -> ${backend}`);

const baseCfg = {
  POP: args.pop, ELITES: args.elites, EPOCH_STEPS: args.epoch,
  GAIN: args.gain, MUTATION: args.mutation,
  FOOD_CLUSTERS: args.clusters, FOOD_CLUSTER_SIGMA: args.clusterSigma,
  FOOD_SENSE_SIGMA2: args.senseSigma2, FOOD_RELOCATE_THRESH: args.relocateThresh,
  SELECT: args.select,
  ODOUR_AMBIGUITY: args.ambiguity, ODOUR_QUALITY_SIGMA2: args.qualitySigma2,
  HAZARDS: args.hazards, HAZARD_STAKES: args.hazStakes,
  HAZARD_DAMAGE_SIGMA2: args.hazSigma2,
};
if (args.coevo) Object.assign(baseCfg, {
  COEVO: true, COEVO_CAPTURE_SIGMA2: args.captureSigma2,
  COEVO_PREY_LOSS: args.preyLoss, COEVO_PRED_GAIN: args.predGain,
  COEVO_PRED_FORAGE: args.predForage,
});

const sim = new EvoDevoSim({ seed: args.seed, config: { ...baseCfg, COEVO_ROLE: 'prey' } });
await sim.initialise();
const pred = args.coevo
  ? new EvoDevoSim({ seed: args.seed ^ 0x5f1e,
      config: { ...baseCfg, POP: args.predPop, ELITES: args.predElites, COEVO_ROLE: 'predator' } })
  : null;
if (pred) { await pred.initialise(); coevoSyncWorld(sim, pred); }

const t0 = Date.now();
if (args.coevo) {
  await coevolveFor(sim, pred, args.generations, {
    onGeneration: ({ generation, prey: ps }) =>
      log(`[gen ${String(generation).padStart(3)}] contact ${ps.contact.toFixed(4)} ` +
          `forage ${ps.forageTop.toFixed(3)} fit ${ps.fitnessTop.toFixed(3)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`),
  });
} else {
  await evolveFor(sim, args.generations, {
    onGeneration: ({ generation, best }) =>
      log(`[gen ${String(generation).padStart(3)}] best ${best.toFixed(3)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`),
  });
}
log(`[evolved] ${args.generations} generations in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

/* ------------------------------------------------------- trace collection */

const CH = EvoDevoSim.TRACE_CHANNELS;
const IDX = Object.fromEntries(CH.map((k, i) => [k, i]));
const POP = sim.cfg.POP;

// Which channels the paired "information removed" arm blinds. `base` is the
// original four groups. `opponent` blinds ONLY the predator channels, which is
// the arm that says whether evasion is driven by seeing the predator or is a
// side effect of something else the prey was already doing.
const ablateGroups = args.ablate === 'opponent' ? ['opponent']
  : args.ablate === 'all'
    ? ['food', 'toxin', 'wall', 'energy', ...(sim.cfg.COEVO ? ['opponent'] : [])]
    : ['food', 'toxin', 'wall', 'energy'];
const constMask = keepAllBut(ablateGroups, sim.cfg);
const modRng = makeRng(0xC0FFEE ^ args.seed);

const full = [];   // one trace per restart, senses intact
const blind = [];  // paired trace, same spawn, senses -> population mean

/**
 * One traced episode from a fixed start. In two-species mode the predators are
 * stepped in lockstep from their own fixed start, so the prey trace is
 * behaviour under threat; the predators are never ablated, so the two arms
 * differ only in what the PREY can sense.
 */
const tracedEpisode = (init, predInit, mods) => {
  sim.applyInit(init); sim.mods = mods;
  if (pred) { pred.applyInit(predInit); coevoSyncWorld(sim, pred); }
  sim.startTrace(args.steps);
  for (let i = 0; i < args.steps; i++) {
    if (pred) coevoStep(sim, pred); else sim.step();
  }
  const tr = sim.stopTrace();
  sim.mods = null;
  return tr;
};

for (let r = 0; r < args.restarts; r++) {
  const init = sim.makeInit();
  const predInit = pred ? pred.makeInit() : null;

  full.push(tracedEpisode(init, predInit, null));

  const mods = makeMods(constMask, false, sim.cfg, modRng, true);
  blind.push(tracedEpisode(init, predInit, mods));
  mods.keep.dispose(); mods.drop.dispose(); mods.perm.dispose();

  sim.disposeInit(init);
  if (pred) pred.disposeInit(predInit);
  log(`[trace] restart ${r + 1}/${args.restarts} recorded (${args.steps} steps x ${POP} agents, paired)`);
}
log(`[traces] done in ${((Date.now() - t0) / 1000).toFixed(0)}s total`);

/* ---------------------------------------------------------------- helpers */

/**
 * Which stimulus every measure below is computed against. 'food' reproduces the
 * original single-species analysis exactly. 'opponent' points the identical
 * machinery at the predator: bearing, sensed mass, and the klinokinesis test on
 * the sign of change in that mass.
 */
const STIM = args.channels === 'opponent'
  ? { lat: IDX.pbLat, fwd: IDX.pbFwd, mass: IDX.oppMass, near: null, name: 'opponent' }
  // The food stimulus reads `odourMass`, not `foodMass`: that is the scalar the
  // animal actually has, and a kinesis can only act on what it senses. At
  // ODOUR_AMBIGUITY 0 the two channels are identical by construction, so this is
  // the same measurement as before at every setting the pre-ambiguity runs used.
  // `klinoTrueFood` below re-runs the test against the unmixed food mass, which
  // is what separates "kinesis on the mixture" from "kinesis on real food".
  : { lat: IDX.fbLat, fwd: IDX.fbFwd, mass: IDX.odourMass, near: IDX.minFoodD2, name: 'food' };

const at = (tr, step, agent, ch) => tr.buf[step * POP * CH.length + agent * CH.length + ch];
const series = (tr, agent, ch) => {
  const out = new Float64Array(tr.steps);
  for (let s = 0; s < tr.steps; s++) out[s] = at(tr, s, agent, ch);
  return out;
};
// The network senses tanh(rawMass * .16), not the raw field mass (see step()).
const sensedMass = raw => Math.tanh(raw * 0.16);

function quantileBins(values, nBins) {
  const s = Float64Array.from(values).sort();
  const edges = [];
  for (let i = 1; i < nBins; i++) edges.push(s[Math.floor((i / nBins) * (s.length - 1))]);
  return edges; // nBins-1 interior edges
}
function binIndex(v, edges) {
  let lo = 0, hi = edges.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (v <= edges[mid]) hi = mid; else lo = mid + 1; }
  return lo;
}

/** Discrete mutual information (bits) from a joint-count histogram. */
function miFromJoint(joint, n, nBins) {
  const px = new Float64Array(nBins), py = new Float64Array(nBins);
  for (let i = 0; i < nBins; i++) for (let j = 0; j < nBins; j++) {
    const c = joint[i * nBins + j]; px[i] += c; py[j] += c;
  }
  let mi = 0;
  for (let i = 0; i < nBins; i++) for (let j = 0; j < nBins; j++) {
    const c = joint[i * nBins + j]; if (!c) continue;
    const pij = c / n;
    mi += pij * Math.log2(pij / ((px[i] / n) * (py[j] / n)));
  }
  return mi;
}

/**
 * Pre-bin a channel once (equal-frequency edges from its pooled distribution
 * across every trace and agent), so repeated MI calls at different lags never
 * re-sort the data. Returns { edges, idxByTrace: Int32Array[step*POP+agent] }.
 */
function prebin(traces, ch, nBins) {
  const pooled = [];
  for (const tr of traces) for (let a = 0; a < POP; a++) for (let s = 0; s < tr.steps; s++) pooled.push(at(tr, s, a, ch));
  const edges = quantileBins(pooled, nBins);
  const idxByTrace = traces.map(tr => {
    const idx = new Int32Array(tr.steps * POP);
    for (let a = 0; a < POP; a++) for (let s = 0; s < tr.steps; s++) idx[s * POP + a] = binIndex(at(tr, s, a, ch), edges);
    return idx;
  });
  return { edges, idxByTrace };
}

/**
 * Lagged MI between pre-binned channel `xb` at time t and `yb` at time t+lag,
 * pooled over all agents and restarts, plus a circular-shift surrogate null:
 * each agent's y-series is rotated by an independent random offset before
 * pairing, which destroys the true time alignment between x and y while
 * preserving each series' own autocorrelation and marginal distribution —
 * the right null for autocorrelated time series, where a plain
 * across-sample permutation would be far too liberal. Operates entirely on
 * precomputed bin indices (Int32Array), so neither the observed pass nor any
 * of the `nShuffles` null passes ever materialises an O(N) value array.
 */
function laggedMI(traces, xb, yb, lag, nBins, nShuffles, rng) {
  const off = lag >= 0 ? 0 : -lag, yOff = lag >= 0 ? lag : 0;
  const jointObs = new Float64Array(nBins * nBins);
  let nObs = 0;
  for (let t = 0; t < traces.length; t++) {
    const steps = traces[t].steps, n = steps - Math.abs(lag);
    if (n <= 4) continue;
    const xa = xb.idxByTrace[t], ya = yb.idxByTrace[t];
    for (let a = 0; a < POP; a++) for (let s = 0; s < n; s++) {
      jointObs[xa[(s + off) * POP + a] * nBins + ya[(s + yOff) * POP + a]]++; nObs++;
    }
  }
  const observed = miFromJoint(jointObs, nObs, nBins);
  const nulls = new Array(nShuffles);
  for (let k = 0; k < nShuffles; k++) {
    const jointNull = new Float64Array(nBins * nBins);
    let nNull = 0;
    for (let t = 0; t < traces.length; t++) {
      const steps = traces[t].steps, n = steps - Math.abs(lag);
      if (n <= 4) continue;
      const xa = xb.idxByTrace[t], ya = yb.idxByTrace[t];
      for (let a = 0; a < POP; a++) {
        const shift = 1 + Math.floor(rng.next() * (steps - 1));
        for (let s = 0; s < n; s++) {
          const yPos = (s + yOff + shift) % steps;
          jointNull[xa[(s + off) * POP + a] * nBins + ya[yPos * POP + a]]++; nNull++;
        }
      }
    }
    nulls[k] = miFromJoint(jointNull, nNull, nBins);
  }
  const nm = mean(nulls), ns = sd(nulls) || 1e-9;
  return { observed, nullMean: nm, nullSd: ns, z: (observed - nm) / ns };
}

/** Conditional mean of `ych` per quantile bin of `xch`, pooled. */
function conditionalMeans(traces, xch, ych, nBins) {
  const xs = [], ys = [];
  for (const tr of traces) for (let a = 0; a < POP; a++) {
    const xFull = series(tr, a, xch), yFull = series(tr, a, ych);
    for (let s = 0; s < tr.steps; s++) { xs.push(xFull[s]); ys.push(yFull[s]); }
  }
  const edges = quantileBins(xs, nBins);
  const sums = new Float64Array(nBins), counts = new Float64Array(nBins);
  for (let i = 0; i < xs.length; i++) { const b = binIndex(xs[i], edges); sums[b] += ys[i]; counts[b]++; }
  return Array.from({ length: nBins }, (_, b) => ({
    n: counts[b], meanX: null, meanY: counts[b] ? sums[b] / counts[b] : null,
  })).map((row, b) => {
    // report the bin's own x-range midpoint too, for readability
    const lo = b === 0 ? -Infinity : edges[b - 1], hi = b === nBins - 1 ? Infinity : edges[b];
    return { ...row, range: [lo, hi] };
  });
}

/**
 * Klinokinesis: split timesteps by the sign of the change in sensed food
 * mass (approaching vs receding), per agent, and compare mean |turn| and
 * mean thrust between the two classes. Paired per agent (each agent
 * contributes one "approaching mean" and one "receding mean"), so the
 * within-agent autocorrelation cannot inflate the apparent effect the way
 * pooling all timesteps as independent samples would.
 */
function klinokinesis(traces, stim) {
  const appTurn = [], recTurn = [], appThrust = [], recThrust = [];
  const appNearTurn = [], recNearTurn = [], appFarTurn = [], recFarTurn = [];
  // Conjunction test. The whole point of shared-odour ambiguity is that the
  // *correct* response to a rising odour depends on the quality channel: keep
  // going if it says food, turn away if it says hazard. A klinokinesis that
  // ignores quality gives the same approach-vs-recede turn delta in both
  // halves; a conjunctive policy gives different deltas, and ideally a sign
  // flip where quality is high. Split within each agent so the comparison is
  // not confounded by which agents happen to spend time near sources.
  const appHiQ = [], recHiQ = [], appLoQ = [], recLoQ = [];
  for (const tr of traces) for (let a = 0; a < POP; a++) {
    const mass = series(tr, a, stim.mass).map(sensedMass);
    const turn = series(tr, a, IDX.turn), thrust = series(tr, a, IDX.thrust);
    // Near/far split. The food channel carries a real squared distance; the
    // opponent channel does not, so sensed mass stands in for proximity
    // (more mass = closer), negated to keep "small = near" in both cases.
    const dist = stim.near !== null ? series(tr, a, stim.near)
                                    : series(tr, a, stim.mass).map(v => -v);
    const qual = series(tr, a, IDX.quality);
    const distEdge = quantileBins(dist, 2)[0]; // median split near/far
    // Upper quartile of this agent's own quality exposure: "an identity cue is
    // actually readable right now" rather than an arbitrary absolute level,
    // which would change meaning as the kernel narrows with the dose.
    const qEdge = quantileBins(qual, 4)[2];
    let sApp = 0, cApp = 0, sRec = 0, cRec = 0, sAppT = 0, sRecT = 0;
    let sAppNear = 0, cAppNear = 0, sRecNear = 0, cRecNear = 0, sAppFar = 0, cAppFar = 0, sRecFar = 0, cRecFar = 0;
    let sAppHi = 0, cAppHi = 0, sRecHi = 0, cRecHi = 0, sAppLo = 0, cAppLo = 0, sRecLo = 0, cRecLo = 0;
    for (let s = 1; s < tr.steps; s++) {
      const d = mass[s] - mass[s - 1];
      const near = dist[s] <= distEdge;
      const hiQ = qual[s] > qEdge;
      if (d > 1e-4) {
        sApp += Math.abs(turn[s]); cApp++; sAppT += thrust[s];
        if (near) { sAppNear += Math.abs(turn[s]); cAppNear++; } else { sAppFar += Math.abs(turn[s]); cAppFar++; }
        if (hiQ) { sAppHi += Math.abs(turn[s]); cAppHi++; } else { sAppLo += Math.abs(turn[s]); cAppLo++; }
      } else if (d < -1e-4) {
        sRec += Math.abs(turn[s]); cRec++; sRecT += thrust[s];
        if (near) { sRecNear += Math.abs(turn[s]); cRecNear++; } else { sRecFar += Math.abs(turn[s]); cRecFar++; }
        if (hiQ) { sRecHi += Math.abs(turn[s]); cRecHi++; } else { sRecLo += Math.abs(turn[s]); cRecLo++; }
      }
    }
    if (cApp > 5 && cRec > 5) {
      appTurn.push(sApp / cApp); recTurn.push(sRec / cRec);
      appThrust.push(sAppT / cApp); recThrust.push(sRecT / cRec);
    }
    if (cAppNear > 3) appNearTurn.push(sAppNear / cAppNear);
    if (cRecNear > 3) recNearTurn.push(sRecNear / cRecNear);
    if (cAppFar > 3) appFarTurn.push(sAppFar / cAppFar);
    if (cRecFar > 3) recFarTurn.push(sRecFar / cRecFar);
    // Paired within agent: only agents with enough of both classes in both
    // quality halves contribute, so every delta below is a like-for-like pair.
    if (cAppHi > 3 && cRecHi > 3) { appHiQ.push(sAppHi / cAppHi); recHiQ.push(sRecHi / cRecHi); }
    if (cAppLo > 3 && cRecLo > 3) { appLoQ.push(sAppLo / cAppLo); recLoQ.push(sRecLo / cRecLo); }
  }
  const pairedDelta = (a, b) => {
    const n = Math.min(a.length, b.length);
    const d = []; for (let i = 0; i < n; i++) d.push(a[i] - b[i]);
    return { mean: mean(d), se: sd(d) / Math.sqrt(d.length), n: d.length };
  };
  return {
    massChannel: CH[stim.mass],
    n: appTurn.length,
    turnApproach: mean(appTurn), turnRecede: mean(recTurn),
    turnDelta: pairedDelta(appTurn, recTurn),
    thrustApproach: mean(appThrust), thrustRecede: mean(recThrust),
    thrustDelta: pairedDelta(appThrust, recThrust),
    nearFarBreakdown: {
      turnApproachNear: mean(appNearTurn), turnRecedeNear: mean(recNearTurn),
      turnApproachFar: mean(appFarTurn), turnRecedeFar: mean(recFarTurn),
    },
    // The conjunction test proper.
    byQuality: {
      highQuality: pairedDelta(appHiQ, recHiQ),
      lowQuality: pairedDelta(appLoQ, recLoQ),
    },
  };
}

/**
 * Paired full-vs-blindConst comparison from identical spawns: per agent,
 * the behavioural effect of sensing with no assumption about the mechanism.
 */
function pairedOutcomes(fullTraces, blindTraces, nearFrac) {
  // Near/far threshold from the pooled full-sense distance distribution.
  const allDist = [];
  for (const tr of fullTraces) for (let a = 0; a < POP; a++) for (let s = 0; s < tr.steps; s++) allDist.push(at(tr, s, a, IDX.minFoodD2));
  const sorted = Float64Array.from(allDist).sort();
  const nearThresh = sorted[Math.floor(nearFrac * (sorted.length - 1))];

  const dEat = [], dOcc = [], dFinalDist = [], dPathLen = [];
  for (let r = 0; r < fullTraces.length; r++) {
    const tf = fullTraces[r], tb = blindTraces[r];
    for (let a = 0; a < POP; a++) {
      let eatF = 0, eatB = 0, occF = 0, occB = 0, pathF = 0, pathB = 0;
      let px = at(tf, 0, a, IDX.posX), py = at(tf, 0, a, IDX.posY);
      let bx = at(tb, 0, a, IDX.posX), by = at(tb, 0, a, IDX.posY);
      const tailStart = Math.floor(tf.steps * 0.8);
      let finalDistF = 0, finalDistB = 0, tailN = 0;
      for (let s = 0; s < tf.steps; s++) {
        eatF += at(tf, s, a, IDX.eat); eatB += at(tb, s, a, IDX.eat);
        if (at(tf, s, a, IDX.minFoodD2) <= nearThresh) occF++;
        if (at(tb, s, a, IDX.minFoodD2) <= nearThresh) occB++;
        const nx = at(tf, s, a, IDX.posX), ny = at(tf, s, a, IDX.posY);
        pathF += Math.hypot(nx - px, ny - py); px = nx; py = ny;
        const mx = at(tb, s, a, IDX.posX), my = at(tb, s, a, IDX.posY);
        pathB += Math.hypot(mx - bx, my - by); bx = mx; by = my;
        if (s >= tailStart) { finalDistF += at(tf, s, a, IDX.minFoodD2); finalDistB += at(tb, s, a, IDX.minFoodD2); tailN++; }
      }
      dEat.push(eatF - eatB);
      dOcc.push(occF / tf.steps - occB / tb.steps);
      dFinalDist.push(finalDistF / tailN - finalDistB / tailN);
      dPathLen.push(pathF - pathB);
    }
  }
  const stat = arr => ({ mean: mean(arr), se: sd(arr) / Math.sqrt(arr.length), n: arr.length });
  return { nearThresh, eatDelta: stat(dEat), occupancyDelta: stat(dOcc), finalDistDelta: stat(dFinalDist), pathLenDelta: stat(dPathLen) };
}

/* -------------------------------------------------------------- run it all */

const rng = makeRng(0x5eed ^ args.seed);

log(`[analysis] pre-binning ${STIM.name} channels (bearing lat/fwd, mass) + turn, thrust`);
const binFbLat = prebin(full, STIM.lat, args.bins);
const binFbFwd = prebin(full, STIM.fwd, args.bins);
const binFoodMass = prebin(full, STIM.mass, args.bins);
const binTurn = prebin(full, IDX.turn, args.bins);
const binThrust = prebin(full, IDX.thrust, args.bins);

log('[analysis] lagged mutual information: turn vs food lateral bearing (fbLat)');
const miTurnBearing = lags.map(lag => ({ lag, ...laggedMI(full, binFbLat, binTurn, lag, args.bins, args.nullShuffles, rng) }));

log('[analysis] lagged mutual information: thrust vs food forward component (fbFwd)');
const miThrustFwd = lags.map(lag => ({ lag, ...laggedMI(full, binFbFwd, binThrust, lag, args.bins, args.nullShuffles, rng) }));

log('[analysis] lagged mutual information: turn vs sensed food mass');
const miTurnMass = lags.map(lag => ({ lag, ...laggedMI(full, binFoodMass, binTurn, lag, args.bins, args.nullShuffles, rng) }));

// Control: the same lagged-MI analysis computed on the blindConst traces.
// `fb`/`turn` there are the *true* physical bearing and the *real* motor
// output, but the network that produced `turn` had no access to live
// sensory information (its input channels were replaced by the population
// mean) — only self-motion dynamics survive. A turning agent mechanically
// changes its own future bearing to food, so a lagged MI(bearing, turn) can
// in principle appear from that alone, with no sensing involved. If the
// same lag pattern shows up here, the full-sense result above is a
// dynamical artifact, not evidence of a delayed sensory policy.
log('[analysis] control: same lagged MI computed on blindConst traces (motor-dynamics null)');
const binFbLatBlind = prebin(blind, STIM.lat, args.bins);
const binFbFwdBlind = prebin(blind, STIM.fwd, args.bins);
const binTurnBlind = prebin(blind, IDX.turn, args.bins);
const binThrustBlind = prebin(blind, IDX.thrust, args.bins);
const miTurnBearingBlind = lags.map(lag => ({ lag, ...laggedMI(blind, binFbLatBlind, binTurnBlind, lag, args.bins, args.nullShuffles, rng) }));
const miThrustFwdBlind = lags.map(lag => ({ lag, ...laggedMI(blind, binFbFwdBlind, binThrustBlind, lag, args.bins, args.nullShuffles, rng) }));

log('[analysis] conditional means: turn | fbLat quantile bin');
const bearingBins = conditionalMeans(full, STIM.lat, IDX.turn, args.bins);
log('[analysis] conditional means: thrust | fbFwd quantile bin');
const fwdBins = conditionalMeans(full, STIM.fwd, IDX.thrust, args.bins);
log('[analysis] conditional means: turn | food-mass quantile bin');
const massBins = conditionalMeans(full, STIM.mass, IDX.turn, args.bins);

log(`[analysis] klinokinesis (approach vs recede) on the ${STIM.name} channel`);
const klino = klinokinesis(full, STIM);
// Second klinokinesis, driven by the *true* food mass rather than the scalar
// the agent actually has. At ambiguity 0 the two channels are identical and
// this is a redundancy check; at ambiguity 1 they differ, and a population
// that had learned to discriminate would track true food more strongly than
// the mixed odour it senses. Identical deltas mean the animal is running
// kinesis on whatever its one scalar happens to be, discrimination or not.
const klinoTrueFood = STIM.name === 'food'
  ? klinokinesis(full, { ...STIM, mass: IDX.foodMass }) : null;

// Engagement check: the mechanism must be shown to be live before a null on it
// means anything. At ambiguity 0 odour and food are the same signal; at
// ambiguity 1 the odour a hazard emits is added on top, so mean sensed odour
// must exceed mean true food mass by a clear margin.
const channelLevels = (() => {
  const acc = { foodMass: 0, odourMass: 0, quality: 0, n: 0 };
  for (const tr of full) for (let a = 0; a < POP; a++) for (let st = 0; st < tr.steps; st++) {
    acc.foodMass += at(tr, st, a, IDX.foodMass);
    acc.odourMass += at(tr, st, a, IDX.odourMass);
    acc.quality += at(tr, st, a, IDX.quality);
    acc.n++;
  }
  return { foodMass: acc.foodMass / acc.n, odourMass: acc.odourMass / acc.n,
           quality: acc.quality / acc.n,
           odourExcess: (acc.odourMass - acc.foodMass) / acc.n };
})();

log('[analysis] paired full-vs-blindConst outcomes');
const paired = pairedOutcomes(full, blind, args.nearFrac);

/**
 * Two-species outcome: mean sensed predator mass over the episode, paired per
 * agent between the intact and the information-removed arm. Higher mass means
 * the prey spent the episode closer to predators. A negative delta is the
 * behavioural signature of evasion actually driven by seeing the predator --
 * the outcome measure that the contact statistic reports from the other side.
 */
const opponentOutcome = sim.cfg.COEVO ? (() => {
  const dMass = [], dTurn = [];
  for (let r = 0; r < full.length; r++) {
    const tF = full[r], tB = blind[r];
    for (let a = 0; a < POP; a++) {
      let mF = 0, mB = 0, tuF = 0, tuB = 0;
      for (let st = 0; st < tF.steps; st++) {
        mF += at(tF, st, a, IDX.oppMass); mB += at(tB, st, a, IDX.oppMass);
        tuF += Math.abs(at(tF, st, a, IDX.turn)); tuB += Math.abs(at(tB, st, a, IDX.turn));
      }
      dMass.push((mF - mB) / tF.steps); dTurn.push((tuF - tuB) / tF.steps);
    }
  }
  const st = arr => ({ mean: mean(arr), se: sd(arr) / Math.sqrt(arr.length), n: arr.length });
  return { oppMassDelta: st(dMass), absTurnDelta: st(dTurn) };
})() : null;

const result = {
  label: args.label || undefined,
  settings: { ...args },
  runtimeSeconds: +((Date.now() - t0) / 1000).toFixed(1),
  backend: `${pkg}/${backend}`,
  generation: sim.gen,
  miTurnBearing, miThrustFwd, miTurnMass,
  miTurnBearingBlind, miThrustFwdBlind,
  bearingBins, fwdBins, massBins,
  klinokinesis: klino,
  klinokinesisTrueFood: klinoTrueFood,
  channelLevels,
  pairedOutcomes: paired,
  stimulus: STIM.name, ablated: ablateGroups,
  opponentOutcome,
};

if (args.out) { await fs.writeFile(args.out, JSON.stringify(result, null, 2)); log(`[out] ${args.out}`); }
else process.stdout.write(JSON.stringify(result) + '\n');

const sigLags = miTurnBearing.filter(r => Math.abs(r.z) > 2).map(r => r.lag);
const sigLagsBlind = miTurnBearingBlind.filter(r => Math.abs(r.z) > 2).map(r => r.lag);
log(`\n[summary] turn~bearing MI significant (|z|>2) at lags, full-sense: ${sigLags.length ? sigLags.join(',') : 'none'}`);
log(`[summary] turn~bearing MI significant (|z|>2) at lags, blindConst (motor-dynamics null): ${sigLagsBlind.length ? sigLagsBlind.join(',') : 'none'}`);
log(`[summary] klinokinesis turn delta (approach-recede), sensed ${STIM.name}: ${klino.turnDelta.mean.toFixed(4)} +- ${klino.turnDelta.se.toFixed(4)} (n=${klino.turnDelta.n})`);
if (klinoTrueFood)
  log(`[summary] klinokinesis turn delta, true food mass:            ${klinoTrueFood.turnDelta.mean.toFixed(4)} +- ${klinoTrueFood.turnDelta.se.toFixed(4)} (n=${klinoTrueFood.turnDelta.n})`);
// The quality channel is the food/hazard identity cue, so this split only means
// "conjunction" against the food stimulus. Under --channels opponent it is just
// a hazard-proximity split of an unrelated measure, and is labelled as such
// rather than left to read as a result about predators.
if (STIM.name === 'food') {
  log(`[summary] conjunction test — turn delta where the identity cue is READABLE: ${klino.byQuality.highQuality.mean.toFixed(4)} +- ${klino.byQuality.highQuality.se.toFixed(4)} (n=${klino.byQuality.highQuality.n})`);
  log(`[summary] conjunction test — turn delta where it is NOT:                    ${klino.byQuality.lowQuality.mean.toFixed(4)} +- ${klino.byQuality.lowQuality.se.toFixed(4)} (n=${klino.byQuality.lowQuality.n})`);
} else {
  log(`[summary] (byQuality split reported in JSON only: it conditions on the food/hazard`);
  log(`[summary]  identity cue, which says nothing about the ${STIM.name} stimulus)`);
}
log(`[summary] channel levels: foodMass ${channelLevels.foodMass.toFixed(4)} · odourMass ${channelLevels.odourMass.toFixed(4)} · quality ${channelLevels.quality.toFixed(4)}`);
log(`[summary] paired eat delta (full-blindConst): ${paired.eatDelta.mean.toFixed(4)} +- ${paired.eatDelta.se.toFixed(4)}`);
log(`[summary] paired occupancy delta: ${paired.occupancyDelta.mean.toFixed(4)} +- ${paired.occupancyDelta.se.toFixed(4)}`);
if (opponentOutcome) {
  log(`[summary] paired predator-proximity delta (full - blind, negative = evasion): ` +
      `${opponentOutcome.oppMassDelta.mean.toFixed(4)} +- ${opponentOutcome.oppMassDelta.se.toFixed(4)}`);
  log(`[summary] paired |turn| delta: ${opponentOutcome.absTurnDelta.mean.toFixed(4)} +- ${opponentOutcome.absTurnDelta.se.toFixed(4)}`);
}

sim.dispose();
if (pred) pred.dispose();
