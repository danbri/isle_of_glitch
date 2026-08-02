#!/usr/bin/env node
/**
 * Mutation-operator bake-off on the soft body.
 *
 *   node tools/sb-op.js --op signflip --pop 64 --gens 24 --seed 1 --out run.json
 *
 * The 17× first-evolution ascent (`tools/sb-evolve.js`) was climbed by ONE
 * operator: additive bounded-Gaussian on every locus at ε = 0.08 — the same
 * operator the gate's ε sweep used. The flatness analysis then measured that on
 * the genotype→phenotype map, SIGN structure of the regulatory matrix carries
 * ~2/3 of the phenotype and magnitudes ~1/3, and that "Gaussian jitter on dense
 * weights is effectively a magnitude operator: it wanders the fungible axis and
 * rarely crosses the sign boundaries that carry the functional structure." The
 * genome was given a modular, contiguous, per-module LAYOUT (see lib/softbody.js
 * LAYOUT / GENE_MODULES) precisely so a structure-aware operator could exploit
 * it. Nobody had tested whether one climbs faster than the blind Gaussian.
 *
 * This tool is that test. It reproduces the sb-evolve loop shape EXACTLY — k=2
 * tournament, elite carry, displacement fitness, NaN-safe shared episodes,
 * spawn-averaged rigorous end comparison — and swaps only the reproduction
 * operator, selected by --op. It imports everything from lib/softbody.js and
 * NEVER modifies it: every structure-aware operator is built here by reading and
 * writing the exported genome buffer through the exported offset helpers
 * (regOff / matOff / kinOff), the module table (GENE_MODULES) and the block
 * table (LAYOUT). So it stays mergeable alongside concurrent softbody edits.
 *
 * OPERATORS (--op):
 *   gaussian   Baseline. Additive bounded-Gaussian on EVERY locus at ε. This is
 *              perturbGenome — the operator the 17× ascent used. The control.
 *   magonly    Sign-PRESERVING magnitude jitter on every locus: w' = sign(w)·
 *              max(0,|w|+δ), δ~ε·gauss. Never crosses zero, so it removes the
 *              incidental near-zero sign flips Gaussian jitter lands on. The
 *              flatness analysis predicts this tracks `gaussian` almost exactly —
 *              i.e. that Gaussian IS a magnitude operator. Control.
 *   signflip   `gaussian` PLUS: flip the sign of each regulatory weight (the
 *              regOff blocks, GENES×GENES loci) with probability --signRate.
 *              Adds the sign channel on top of the incumbent operator.
 *   signonly   NO magnitude jitter. ONLY flip regulatory signs at --signRate.
 *              Magnitudes frozen at the parent's. Isolates the sign channel:
 *              if this climbs, sign structure alone is a selectable axis.
 *   permodule  Per-module rates. For each GENE_MODULE (fate/role/neural/motor/
 *              receptor) and the RD block, jitter ALL its loci at ε with an
 *              independent per-module probability --moduleRate. A retune of one
 *              subsystem at a time rather than one global per-locus rate.
 *   blockcross blockCrossover (cut on a LAYOUT boundary, transfer a suffix of
 *              whole modules from a second tournament-picked parent) with prob
 *              0.5, then `gaussian`. The recombination operator the modular
 *              layout was built for; the 17× result was mutation-only.
 *
 * All arms at a given --seed start from the byte-identical gen-0 population
 * (randomGenome is driven by the one seeded LCG), so per-seed differences are
 * the operator's doing and a paired-by-seed comparison is available.
 *
 * REPRODUCIBILITY: one seeded LCG drives every draw. Development is seeded from
 * genome identity (as sb-evolve/sb-probe do), spawns from the generation index.
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from './backend.js';
import {
  DEFAULTS, makeRng, randomGenome, perturbGenome, cloneGenome, blockCrossover,
  develop, makeWorld, Colony,
  GENES, GENE_STRIDE, RD_BLOCK, GENE_MODULES, LAYOUT, regOff, matOff, kinOff,
} from '../lib/softbody.js';

const a = parseArgs(process.argv.slice(2), {
  op: 'gaussian',
  pop: 64, gens: 24, elite: 2, eps: 0.08, steps: 600,
  seed: 1, evals: 6,
  signRate: 0.01,    // per-regulatory-locus sign-flip probability (signflip/signonly)
  moduleRate: 0.5,   // per-module jitter probability (permodule)
  moduleEps: -1,     // ε used inside a jittered module (permodule); -1 => use --eps
  crossRate: 0.5,    // block-crossover probability per child (blockcross)
  out: '', quiet: false,
});
const cfg = DEFAULTS;
const log = (...m) => { if (!a.quiet) console.error(...m); };

/* ------------------------------------------------------- gaussian primitive */
// Same bounded Irwin-Hall(4) draw lib/softbody.js uses internally, replicated
// here (it is not exported) so every magnitude jitter in this tool is drawn from
// the identical distribution perturbGenome uses — a fair comparison depends on
// the noise source being the same, not merely "Gaussian".
const gauss = (rng) => { let s = 0; for (let i = 0; i < 4; i++) s += rng.next(); return (s - 2); };

/* ------------------------------------------------------------- operators */
// Every operator maps (parent buffer[, second parent]) -> a fresh child buffer,
// touching only the exported buffer through exported offsets. lib/softbody.js is
// never modified.

/** indices of the regulatory (gene<-gene) loci — where sign structure lives. */
const REG_LOCI = (() => {
  const idx = [];
  for (let k = 0; k < GENES; k++) { const ro = regOff(k); for (let m = 0; m < GENES; m++) idx.push(ro + m); }
  return idx;
})();

function opGaussian(parent, _p2, rng) {
  return perturbGenome({ buf: parent.buf }, a.eps, rng).buf;
}

function opMagOnly(parent, _p2, rng) {
  const buf = Float32Array.from(parent.buf);
  for (let i = 0; i < buf.length; i++) {
    const w = buf[i], d = gauss(rng) * a.eps;
    const s = w < 0 ? -1 : 1;
    const mag = Math.abs(w) + d;
    buf[i] = s * (mag > 0 ? mag : 0);        // reflect at zero: sign never flips
  }
  return buf;
}

function opSignFlip(parent, _p2, rng) {
  const buf = perturbGenome({ buf: parent.buf }, a.eps, rng).buf;   // full Gaussian first
  for (const i of REG_LOCI) if (rng.next() < a.signRate) buf[i] = -buf[i];
  return buf;
}

function opSignOnly(parent, _p2, rng) {
  const buf = Float32Array.from(parent.buf);                        // magnitudes frozen
  for (const i of REG_LOCI) if (rng.next() < a.signRate) buf[i] = -buf[i];
  return buf;
}

// Per-module jitter. LAYOUT tiles [0,GENOME_LEN) as: rd.activator, rd.inhibitor,
// then grn.<module> for each GENE_MODULE. We treat the two rd.* blocks together
// as the "rd" subsystem and each grn.<module> as its own subsystem, and jitter a
// whole subsystem's contiguous locus range at once with its own probability.
const MODULE_RANGES = (() => {
  const ranges = [{ name: 'rd', from: 0, to: RD_BLOCK }];
  for (const m of GENE_MODULES) {
    if (m.name === 'silent') continue;   // no phenotypic readout; still jittered under rd? no—skip
    ranges.push({ name: m.name, from: RD_BLOCK + m.from * GENE_STRIDE, to: RD_BLOCK + m.to * GENE_STRIDE });
  }
  return ranges;
})();
function opPerModule(parent, _p2, rng) {
  const buf = Float32Array.from(parent.buf);
  const meps = a.moduleEps >= 0 ? a.moduleEps : a.eps;
  let touched = 0;
  for (const r of MODULE_RANGES) {
    if (rng.next() >= a.moduleRate) continue;
    touched++;
    for (let i = r.from; i < r.to; i++) buf[i] += gauss(rng) * meps;
  }
  // Guard: if no module was picked, jitter one at random so a child is never an
  // exact clone (which would collapse tournament diversity toward the elite).
  if (!touched) {
    const r = MODULE_RANGES[rng.int() % MODULE_RANGES.length];
    for (let i = r.from; i < r.to; i++) buf[i] += gauss(rng) * meps;
  }
  return buf;
}

function opBlockCross(parent, p2, rng) {
  let src = parent;
  if (p2 && rng.next() < a.crossRate) src = { buf: blockCrossover(parent, p2, rng).buf };
  return perturbGenome({ buf: src.buf }, a.eps, rng).buf;
}

const OPS = {
  gaussian: opGaussian, magonly: opMagOnly, signflip: opSignFlip,
  signonly: opSignOnly, permodule: opPerModule, blockcross: opBlockCross,
};
const mutate = OPS[a.op];
if (!mutate) { console.error(`unknown --op ${a.op}; choose ${Object.keys(OPS).join('|')}`); process.exit(2); }
const needsTwoParents = a.op === 'blockcross';

/* --------------------------------------------------------------- helpers */
// Identical world, dev-seed and spawn-seed scheme to sb-evolve, so this loop is
// the same experiment with only the operator swapped.
const world = makeWorld(cfg, makeRng(7));
const devSeed = (id) => makeRng((0x51b0 ^ Math.imul(id, 2654435761)) >>> 0);
const spawnSeed = (gen) => (0x3000 ^ Math.imul(gen + 1, 40503)) >>> 0;

let nextId = 0;
function mkRandom(rng) { return { buf: randomGenome(rng, cfg).buf, id: nextId++, pheno: null }; }
function pheno(g) { return g.pheno || (g.pheno = develop({ buf: g.buf }, cfg, devSeed(g.id))); }

const finite = (x) => (Number.isFinite(x) ? x : 0);
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const median = (v) => { const s = [...v].sort((p, q) => p - q); return s[s.length >> 1]; };
const se = (v) => { const m = mean(v), n = v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1) / n); };

/** NaN-safe shared episode, isolating on a throw — copied from sb-evolve. */
function runColony(phenos, seed, steps) {
  const col = new Colony(phenos, world, cfg);
  col.spawn(makeRng(seed));
  try {
    for (let s = 0; s < steps; s++) { col.step(); if (s % 50 === 0) col.assertFinite(); }
    col.assertFinite('end');
    return col.traits();
  } catch (err) {
    log(`  [nan] shared episode threw (${String(err.message).slice(0, 50)}); isolating`);
    return phenos.map((p, i) => {
      const solo = new Colony([p], world, cfg);
      solo.spawn(makeRng((seed ^ Math.imul(i + 1, 2654435761)) >>> 0));
      try {
        for (let s = 0; s < steps; s++) { solo.step(); if (s % 50 === 0) solo.assertFinite(); }
        solo.assertFinite('end');
        return solo.traits()[0];
      } catch { return { displacement: 0, path: 0, speed: 0, occupancy: 0, intake: 0 }; }
    });
  }
}

/** One shared episode; displacement is the fitness, as in the 17× result. */
function evalPop(phenos, gen) {
  const tr = runColony(phenos, spawnSeed(gen), a.steps);
  return tr.map(t => finite(t.displacement));
}

/** Spawn-averaged displacement over `evals` held-out spawns, per genome. */
function remeasure(genomes) {
  const canon = genomes.map(pheno);
  const per = genomes.map(() => []);
  for (let e = 0; e < a.evals; e++) {
    const tr = runColony(canon, 0x9000 + e * 7919, a.steps);
    for (let g = 0; g < genomes.length; g++) per[g].push(finite(tr[g].displacement));
  }
  const perGenome = genomes.map((_, g) => mean(per[g]));
  return { meanDisp: mean(perGenome), seDisp: se(perGenome),
           moveFrac: perGenome.filter(d => d > 0.02).length / genomes.length };
}

/* ------------------------------------------------------------------- loop */
const rng = makeRng(a.seed);
let pop = Array.from({ length: a.pop }, () => mkRandom(rng));
const gen0 = pop.map(g => ({ buf: Float32Array.from(g.buf), id: g.id, pheno: pheno(g) }));

log(`[sb-op] op ${a.op}  pop ${a.pop} gens ${a.gens} elite ${a.elite} eps ${a.eps} steps ${a.steps} seed ${a.seed}` +
    (a.op === 'signflip' || a.op === 'signonly' ? `  signRate ${a.signRate}` : '') +
    (a.op === 'permodule' ? `  moduleRate ${a.moduleRate} moduleEps ${a.moduleEps >= 0 ? a.moduleEps : a.eps}` : '') +
    (a.op === 'blockcross' ? `  crossRate ${a.crossRate}` : ''));

const traj = [];
let fit = evalPop(pop.map(pheno), 0);
function record(gen, fit) {
  const row = { gen, best: Math.max(...fit), median: median(fit), mean: mean(fit),
                moveFrac: fit.filter(d => d > 0.02).length / fit.length };
  traj.push(row);
  log(`  gen ${String(gen).padStart(2)}  best ${row.best.toFixed(3)}  median ${row.median.toFixed(3)}  ` +
      `mean ${row.mean.toFixed(3)}  moving ${(row.moveFrac * 100).toFixed(0)}%`);
  return row;
}
record(0, fit);

for (let gen = 1; gen <= a.gens; gen++) {
  const order = fit.map((f, i) => i).sort((p, q) => fit[q] - fit[p]);
  const next = [];
  for (let e = 0; e < a.elite && e < order.length; e++) {
    const src = pop[order[e]];
    next.push({ buf: cloneGenome(src).buf, id: src.id, pheno: src.pheno });
  }
  const pick = () => { const i = rng.int() % pop.length, j = rng.int() % pop.length; return fit[i] >= fit[j] ? i : j; };
  while (next.length < a.pop) {
    const parent = pop[pick()];
    const p2 = needsTwoParents ? pop[pick()] : null;
    const childBuf = mutate(parent, p2, rng);
    next.push({ buf: childBuf, id: nextId++, pheno: null });
  }
  pop = next;
  fit = evalPop(pop.map(pheno), gen);
  record(gen, fit);
}

/* -------------------------------------------------- rigorous end comparison */
log('[remeasure] gen-0…');
const m0 = remeasure(gen0);
log('[remeasure] evolved…');
const mE = remeasure(pop);

const f = x => x.toFixed(4);
const barOf = (s0, s1) => 2 * Math.sqrt(s0 ** 2 + s1 ** 2);
const gain = mE.meanDisp - m0.meanDisp, bar = barOf(m0.seDisp, mE.seDisp);
console.log(`\n=== sb-op : op ${a.op} : seed ${a.seed} ===`);
console.log(`pop ${a.pop} gens ${a.gens} elite ${a.elite} eps ${a.eps} steps ${a.steps}` +
            (a.op === 'signflip' || a.op === 'signonly' ? ` signRate ${a.signRate}` : '') +
            (a.op === 'permodule' ? ` moduleRate ${a.moduleRate} moduleEps ${a.moduleEps >= 0 ? a.moduleEps : a.eps}` : ''));
console.log('trajectory (fresh spawn each gen):');
console.log('  gen  best     median   mean     moving');
for (const r of traj)
  if (r.gen === 0 || r.gen === a.gens || r.gen % Math.max(1, Math.floor(a.gens / 12)) === 0)
    console.log(`  ${String(r.gen).padStart(3)}  ${f(r.best)}  ${f(r.median)}  ${f(r.mean)}  ${(r.moveFrac * 100).toFixed(0)}%`);
console.log(`\nrigorous displacement (mean over ${a.evals} held-out spawns):`);
console.log(`  gen-0    ${f(m0.meanDisp)} ± ${f(m0.seDisp)}   moving ${(m0.moveFrac * 100).toFixed(0)}%`);
console.log(`  evolved  ${f(mE.meanDisp)} ± ${f(mE.seDisp)}   moving ${(mE.moveFrac * 100).toFixed(0)}%`);
console.log(`  ascent   ${gain >= 0 ? '+' : ''}${f(gain)} vs bar ${f(bar)} -> ${gain > bar ? 'ASCENDS' : 'flat'}`);

if (a.out) {
  writeFileSync(a.out, JSON.stringify({
    op: a.op, seed: a.seed, pop: a.pop, gens: a.gens, elite: a.elite, eps: a.eps, steps: a.steps,
    signRate: a.signRate, moduleRate: a.moduleRate, moduleEps: a.moduleEps, crossRate: a.crossRate,
    traj, gen0: m0, evolved: mE, gain, bar,
  }, null, 2));
  log(`[out] ${a.out}`);
}
