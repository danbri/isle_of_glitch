#!/usr/bin/env node
/**
 * What does the animal's body actually DO?
 *
 * WHY THIS TOOL EXISTS. `tools/tournament.js --preyBlind all` established that
 * the entire tournament-k2 prey advantage survives blinding every sense the
 * animal has: 2.105 -> 2.318 for the truncation baseline against 1.267 -> 1.283
 * for the tournament arm. A population with no sensory input at all cannot be
 * running a sensorimotor policy, so whatever lowered its contact is a property
 * of how it MOVES. That is a claim about trajectories, and the trace machinery
 * that already exists (`startTrace`, TRACE_CHANNELS) can be pointed straight at
 * it.
 *
 * The measurement is deliberately built on the phase-2 tournament environment
 * rather than on a fresh world: same `tseed`, same layout, same spawn
 * positions, same frozen predators, same 500-step episode. A kinematic
 * difference read here is therefore commensurable with the contact difference
 * the tournament reported, and cannot be an artefact of scoring the two
 * populations in different worlds.
 *
 * THE CONTROL THAT MATTERS. Under `--preyBlind all` the prey's sensor vector is
 * replaced by population means, so the prey trajectory is *causally independent
 * of the predators*: nothing about where the predators are can reach the motor
 * output. Running three prey populations -- generation 0, the truncation
 * baseline at generation 32, and the tournament arm at generation 32 -- against
 * ONE fixed predator population under that ablation makes contact a pure
 * encounter-rate statistic. Any difference is geometry.
 *
 * The generation-0 arm is not decoration. Weak selection leaving the population
 * near its unevolved kinematics and a genuinely evolved encounter-rate strategy
 * both predict "tournament prey move differently from truncation prey"; they
 * differ on whether tournament prey move differently from their own ancestors.
 * Because both arms are seeded identically, generation 0 is shared between them
 * and the comparison is paired within seed.
 *
 *   node tools/kinematics.js --archiveIn runs/arch-tk2-s1.json --preyGen 32 \
 *        --predArchiveIn runs/arch-base-s1.json --predGen 32 \
 *        --preyBlind all --out runs/kin-tk2-s1.json
 */
import fs from 'node:fs/promises';
import { initBackend, parseArgs } from './backend.js';
import {
  EvoDevoSim, coevoEpisode, coevoSyncWorld, makeWorld, makeRng, mean, sd,
  makeMods, disposeMods, keepAllBut, DEFAULTS,
} from '../lib/evodevo.js';

const args = parseArgs(process.argv.slice(2), {
  archiveIn: '', preyGen: -1, predArchiveIn: '', predGen: -1,
  // Phase-2 environment. Defaults match tools/tournament.js exactly.
  tsteps: 500, tseed: 90210, preyBlind: '',
  pop: 192, predPop: 48, elites: 10, predElites: 6, gain: 0.5, mutation: 0.10, epoch: 1450,
  clusters: 9, clusterSigma: 0.12, senseSigma2: 0.050, relocateThresh: 0.15,
  food: 42, select: 'trunc',
  captureSigma2: 0.0040, coevoSenseSigma2: 0.050,
  predGain: 1.0, preyLoss: 16, predForage: 0,
  preySpeed: 0.34, predSpeed: 0.34, preyIntake: 0,
  // Grid resolution for the occupancy statistics. 12 x 12 over the full arena
  // gives cells of side 0.157, which is 2.5 capture radii -- fine enough that
  // "sits in one place" and "covers the arena" separate, coarse enough that a
  // 500-step trace is not mostly empty cells.
  occBins: 12,
  // "Near the wall" threshold, in world units of Chebyshev distance from the
  // boundary. 0.10 is ~1.6 capture-kernel widths, i.e. a band a predator has to
  // enter to make contact.
  wallBand: 0.10,
  out: '', backend: 'auto', quiet: false, label: '',
});
const log = (...m) => { if (!args.quiet) console.error(...m); };
if (!args.archiveIn) { console.error('need --archiveIn'); process.exit(2); }

const { tf, pkg, backend } = await initBackend({ prefer: args.backend });
log(`[backend] ${pkg} -> ${backend}`);

const base = {
  POP: args.pop, ELITES: args.elites, EPOCH_STEPS: args.epoch, FOOD: args.food,
  GAIN: args.gain, MUTATION: args.mutation, SELECT: args.select,
  FOOD_CLUSTERS: args.clusters, FOOD_CLUSTER_SIGMA: args.clusterSigma,
  FOOD_SENSE_SIGMA2: args.senseSigma2, FOOD_RELOCATE_THRESH: args.relocateThresh,
  COEVO: true, COEVO_CAPTURE_SIGMA2: args.captureSigma2,
  COEVO_SENSE_SIGMA2: args.coevoSenseSigma2,
  COEVO_PRED_GAIN: args.predGain, COEVO_PREY_LOSS: args.preyLoss,
  COEVO_PRED_FORAGE: args.predForage,
};
const preyCfg = { ...base, COEVO_ROLE: 'prey', SPEED_MAX: args.preySpeed,
  COEVO_PREY_INTAKE: args.preyIntake };
const predCfg = { ...base, POP: args.predPop, ELITES: args.predElites,
  COEVO_ROLE: 'predator', SPEED_MAX: args.predSpeed };

const load = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const pick = (a, g) => {
  const i = g < 0 ? a.length - 1 : a.findIndex(s => s.generation === g);
  if (i < 0) throw new Error(`no snapshot at generation ${g} (have ${a.map(s => s.generation)})`);
  return a[i];
};
const preyArch = (await load(args.archiveIn)).archive;
const predArch = args.predArchiveIn ? (await load(args.predArchiveIn)).archive : preyArch;
const preySnap = pick(preyArch, args.preyGen), predSnap = pick(predArch, args.predGen);
log(`[pop] prey gen ${preySnap.generation} from ${args.archiveIn}; ` +
    `pred gen ${predSnap.generation} from ${args.predArchiveIn || args.archiveIn}`);

/* ------------------------------------------------- the phase-2 environment */

const strip = p => ({ ...p, world: undefined });
const tworld = makeWorld({ ...DEFAULTS, ...preyCfg }, makeRng(args.tseed ^ 0x51a7));
const preySim = new EvoDevoSim({ seed: args.tseed, config: preyCfg, world: tworld });
const predSim = new EvoDevoSim({ seed: args.tseed ^ 0x77, config: predCfg, world: tworld });
await preySim.initialise(); await predSim.initialise();
const preyInit = preySim.makeInit(), predInit = predSim.makeInit();
const foodHome = tf.tensor2d(tworld.food, [preyCfg.FOOD, 2]);

let preyMods = null;
if (args.preyBlind) {
  const groups = args.preyBlind === 'all'
    ? ['food', 'toxin', 'wall', 'energy', 'opponent'] : [args.preyBlind];
  preyMods = makeMods(keepAllBut(groups, preySim.cfg), false, preySim.cfg,
                      makeRng(0xC0FFEE ^ args.tseed), true);
  log(`[ablate] prey ${groups.join('+')} -> population mean`);
}

await predSim.importPopulation(strip(predSnap.pred));
await preySim.importPopulation(strip(preySnap.prey));
preySim.rng = makeRng(args.tseed); predSim.rng = makeRng(args.tseed ^ 0x77);
preySim.world = tworld; predSim.world = tworld;
preySim.food.assign(foodHome);
preySim.applyInit(preyInit); predSim.applyInit(predInit);
coevoSyncWorld(preySim, predSim);
preySim.mods = preyMods;
// The predators are traced too. Contact is a property of the JOINT occupancy of
// the two species, so a prey statistic on its own cannot say whether a shift in
// where the prey are lowers the encounter rate — that depends entirely on where
// the predators are, and the predator population is identical across the three
// prey arms by construction, which is what makes the overlap comparable.
preySim.startTrace(args.tsteps);
predSim.startTrace(args.tsteps);
await coevoEpisode(preySim, predSim, args.tsteps, 0);
const trace = preySim.stopTrace();
const predTrace = predSim.stopTrace();
preySim.mods = null;
const stats = await preySim.coevoStats();
const [contactAcc, forageAcc] = await Promise.all([
  preySim.contactAcc.data(), preySim.forageAcc.data()]);
disposeMods(preyMods);
preySim.disposeInit(preyInit); predSim.disposeInit(predInit);
foodHome.dispose(); preySim.dispose(); predSim.dispose();

/* ----------------------------------------------------------- the measures */

const CH = EvoDevoSim.TRACE_CHANNELS;
const ci = Object.fromEntries(CH.map((c, i) => [c, i]));
const { buf, steps, pop } = trace;
const nc = CH.length;
const at = (t, a, c) => buf[(t * pop + a) * nc + ci[c]];

const B = DEFAULTS.WORLD_BOUND, DT = DEFAULTS.DT;
const wrap = a => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };

/** Per-agent trajectory summaries. Every one is a property of the path alone
 *  except the last block, which is what the path cost and bought. */
const M = {};
const push = (k, v) => { (M[k] ||= []).push(v); };
// Population-level occupancy: pooled over agents and steps, so it says how the
// POPULATION fills the arena rather than how one animal does.
const nb = args.occBins;
const popCell = new Float64Array(nb * nb);
const binOf = v => Math.min(nb - 1, Math.max(0, Math.floor((v + B) / (2 * B) * nb)));
// Population spread per step, averaged over steps.
const spreadPerStep = [], meanPairPerStep = [];

for (let a = 0; a < pop; a++) {
  let path = 0, sumSpeed = 0, sumSpeed2 = 0, nSpeed = 0;
  let sumAbsDh = 0, sumDh = 0, nDh = 0;
  let sumAbsTurn = 0, sumTurn = 0, sumThrust = 0;
  let sumR = 0, sumCheb = 0, wallSteps = 0, cornerSteps = 0;
  let sumOpp = 0, sumFood = 0, sumMinFoodD = 0, sumEat = 0;
  let mx = 0, my = 0;
  const cells = new Set();
  let prevX = at(0, a, 'posX'), prevY = at(0, a, 'posY'), prevH = null;
  for (let t = 0; t < steps; t++) {
    const x = at(t, a, 'posX'), y = at(t, a, 'posY');
    mx += x; my += y;
    sumR += Math.hypot(x, y);
    const cheb = Math.max(Math.abs(x), Math.abs(y));
    sumCheb += cheb;
    if (cheb > B - args.wallBand) wallSteps++;
    if (Math.abs(x) > B - args.wallBand && Math.abs(y) > B - args.wallBand) cornerSteps++;
    cells.add(binOf(y) * nb + binOf(x));
    popCell[binOf(y) * nb + binOf(x)]++;
    sumAbsTurn += Math.abs(at(t, a, 'turn')); sumTurn += at(t, a, 'turn');
    sumThrust += at(t, a, 'thrust');
    sumOpp += at(t, a, 'oppMass'); sumFood += at(t, a, 'foodMass');
    sumMinFoodD += Math.sqrt(Math.max(0, at(t, a, 'minFoodD2')));
    sumEat += at(t, a, 'eat');
    if (t > 0) {
      const dx = x - prevX, dy = y - prevY, d = Math.hypot(dx, dy);
      path += d;
      sumSpeed += d / DT; sumSpeed2 += (d / DT) ** 2; nSpeed++;
      // Heading is only defined when the animal actually moved; a stalled step
      // would otherwise contribute an arbitrary direction and inflate turning.
      if (d > 1e-5) {
        const h = Math.atan2(dy, dx);
        if (prevH !== null) { const dh = wrap(h - prevH); sumAbsDh += Math.abs(dh); sumDh += dh; nDh++; }
        prevH = h;
      }
    }
    prevX = x; prevY = y;
  }
  mx /= steps; my /= steps;
  let gyr = 0;
  for (let t = 0; t < steps; t++) gyr += (at(t, a, 'posX') - mx) ** 2 + (at(t, a, 'posY') - my) ** 2;
  gyr = Math.sqrt(gyr / steps);
  const net = Math.hypot(at(steps - 1, a, 'posX') - at(0, a, 'posX'),
                         at(steps - 1, a, 'posY') - at(0, a, 'posY'));
  const msp = sumSpeed / Math.max(1, nSpeed);
  push('speed', msp);
  push('speedSd', Math.sqrt(Math.max(0, sumSpeed2 / Math.max(1, nSpeed) - msp * msp)));
  push('pathLength', path);
  push('netDisplacement', net);
  push('straightness', path > 1e-9 ? net / path : 0);
  push('absHeadingRate', sumAbsDh / Math.max(1, nDh));            // rad per step
  push('headingBias', sumDh / Math.max(1, nDh));                  // signed: circling
  push('absHeadingBias', Math.abs(sumDh / Math.max(1, nDh)));
  // Curvature per unit distance. Undefined for an animal that barely moved --
  // dividing a real numerator by a near-zero path gives numbers in the
  // thousands and a mean that is entirely the stalled tail -- so it is NaN
  // below a path length of 0.05 (about three capture radii) and the aggregator
  // drops those agents rather than letting them dominate.
  push('tortuosity', path > 0.05 ? sumAbsDh / path : NaN);        // rad per world unit
  push('mobile', path > 0.05 ? 1 : 0);
  push('absTurnCmd', sumAbsTurn / steps);
  push('turnCmdBias', sumTurn / steps);
  push('absTurnCmdBias', Math.abs(sumTurn / steps));
  push('thrust', sumThrust / steps);
  push('radius', sumR / steps);
  push('chebyshev', sumCheb / steps);
  push('wallFrac', wallSteps / steps);
  push('cornerFrac', cornerSteps / steps);
  push('gyration', gyr);
  push('cellsVisited', cells.size);
  push('oppMass', sumOpp / steps);
  push('foodMass', sumFood / steps);
  push('minFoodDist', sumMinFoodD / steps);
  push('eat', sumEat / steps);
  push('contact', contactAcc[a]);
  push('forage', forageAcc[a]);
}

for (let t = 0; t < steps; t++) {
  let sx = 0, sy = 0;
  for (let a = 0; a < pop; a++) { sx += at(t, a, 'posX'); sy += at(t, a, 'posY'); }
  sx /= pop; sy /= pop;
  let v = 0;
  for (let a = 0; a < pop; a++) v += (at(t, a, 'posX') - sx) ** 2 + (at(t, a, 'posY') - sy) ** 2;
  spreadPerStep.push(Math.sqrt(v / pop));
  // Mean pairwise distance on a fixed stride of agents: O(pop^2) per step over
  // 500 steps is 48M operations, which is affordable, but the stride keeps it
  // cheap and the estimate is unbiased.
  let s = 0, n = 0;
  for (let i = 0; i < pop; i += 4) for (let j = i + 4; j < pop; j += 4) {
    s += Math.hypot(at(t, i, 'posX') - at(t, j, 'posX'), at(t, i, 'posY') - at(t, j, 'posY')); n++;
  }
  meanPairPerStep.push(s / n);
}

/** Normalised Shannon entropy of the pooled occupancy grid: 1 = the population
 *  visits every cell equally, 0 = it lives in one cell. */
const tot = popCell.reduce((a, b) => a + b, 0);
let H = 0;
for (const c of popCell) if (c > 0) { const p = c / tot; H -= p * Math.log(p); }
const occupancy = { bins: nb, entropy: H / Math.log(nb * nb),
                    occupied: popCell.filter(c => c > 0).length / (nb * nb),
                    grid: Array.from(popCell, c => c / tot) };

/* ------------------------------------------------- the predators' own field */

const pnc = CH.length, ppop = predTrace.pop, pbuf = predTrace.buf;
const pat = (t, a, c) => pbuf[(t * ppop + a) * pnc + ci[c]];
const predCell = new Float64Array(nb * nb);
let predCheb = 0, predRad = 0, predWall = 0;
for (let t = 0; t < predTrace.steps; t++) for (let a = 0; a < ppop; a++) {
  const x = pat(t, a, 'posX'), y = pat(t, a, 'posY');
  predCell[binOf(y) * nb + binOf(x)]++;
  predCheb += Math.max(Math.abs(x), Math.abs(y));
  predRad += Math.hypot(x, y);
  if (Math.max(Math.abs(x), Math.abs(y)) > B - args.wallBand) predWall++;
}
const pn = predTrace.steps * ppop;
const ptot = predCell.reduce((a, b) => a + b, 0);
/**
 * Occupancy overlap. `sum_c p_prey(c) p_pred(c) * nCells` is 1 when the two
 * distributions are independent-uniform, above 1 when the two species pile into
 * the same cells and below 1 when they segregate. It is the spatial term of an
 * encounter rate, and — because the predator population is held identical
 * across the three prey arms — the only thing that varies in it is where the
 * prey chose to be.
 */
let overlap = 0;
for (let c = 0; c < nb * nb; c++) overlap += (popCell[c] / tot) * (predCell[c] / ptot);
const predator = { chebyshev: predCheb / pn, radius: predRad / pn, wallFrac: predWall / pn,
                   entropy: (() => { let h = 0; for (const c of predCell) if (c > 0) { const p = c / ptot; h -= p * Math.log(p); } return h / Math.log(nb * nb); })(),
                   overlap: overlap * nb * nb, grid: Array.from(predCell, c => c / ptot) };

const q = (a, p) => { const s = Array.from(a).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const summary = {};
for (const k in M) {
  const v = M[k].filter(Number.isFinite);
  summary[k] = { n: v.length,
    mean: mean(v), sd: sd(v),
    p05: q(v, 0.05), p25: q(v, 0.25), p50: q(v, 0.50), p75: q(v, 0.75), p95: q(v, 0.95) };
}

const result = {
  label: args.label || undefined,
  source: { preyArchive: args.archiveIn, preyGen: preySnap.generation,
            predArchive: args.predArchiveIn || args.archiveIn, predGen: predSnap.generation },
  settings: { tsteps: args.tsteps, tseed: args.tseed, preyBlind: args.preyBlind,
              preyLoss: args.preyLoss, preyIntake: args.preyIntake,
              occBins: args.occBins, wallBand: args.wallBand },
  backend: `${pkg}/${backend}`,
  coevoStats: stats,
  population: { spread: mean(spreadPerStep), meanPairDist: mean(meanPairPerStep) },
  occupancy, predator,
  summary,
  agents: M,
};

if (args.out) { await fs.writeFile(args.out, JSON.stringify(result)); log(`[out] ${args.out}`); }
else process.stdout.write(JSON.stringify(result) + '\n');

log('\n  metric            mean      sd     p05     p50     p95');
for (const k of ['speed','absTurnCmd','absHeadingRate','tortuosity','straightness','pathLength',
                 'gyration','cellsVisited','radius','chebyshev','wallFrac','cornerFrac',
                 'oppMass','minFoodDist','contact','forage']) {
  const s = summary[k];
  const f = x => x.toFixed(4).padStart(8);
  log(`  ${k.padEnd(16)}${f(s.mean)}${f(s.sd)}${f(s.p05)}${f(s.p50)}${f(s.p95)}`);
}
log(`  population spread ${result.population.spread.toFixed(4)}  meanPairDist ${result.population.meanPairDist.toFixed(4)}` +
    `  occupancyH ${occupancy.entropy.toFixed(4)}  occupied ${(occupancy.occupied * 100).toFixed(0)}%`);
log(`  predators: chebyshev ${predator.chebyshev.toFixed(4)} wallFrac ${predator.wallFrac.toFixed(4)} ` +
    `entropy ${predator.entropy.toFixed(4)}   prey/pred occupancy overlap ${predator.overlap.toFixed(4)}`);
