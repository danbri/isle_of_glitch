import { parseArgs } from './backend.js';
import { DEFAULTS, makeRng, randomGenome, develop, makeWorld, Colony } from '../lib/softbody.js';
const a = parseArgs(process.argv.slice(2), { H: 3, starve: 0.005, steps: 500, pop: 40, evals: 40, food: 42, clusters: 9, consume: -1, relocateThresh: 0.30, perCluster: 0 });
const cfg = Object.freeze({ ...DEFAULTS, FOOD: a.food, FOOD_CLUSTERS: a.clusters, FOOD_TOXIC_FRAC: 0.5, FOOD_TOXIN_HARSH: a.H, FOOD_STARVE: a.starve, FOOD_RELOCATE_THRESH: a.relocateThresh, ...(a.consume >= 0 ? { FOOD_CONSUME: a.consume } : {}) });
const world = makeWorld(cfg, makeRng(7));
const rng = makeRng(1);
const phenos = Array.from({ length: a.pop }, (_, i) => develop({ buf: randomGenome(rng, cfg).buf }, cfg, makeRng((0x51b0 ^ Math.imul(i + 1, 2654435761)) >>> 0)));
const mean = v => v.reduce((s, x) => s + x, 0) / v.length;
// Collect per-genome per-spawn net (quality ablated) so we can measure how the
// escape fraction shrinks as spawns are averaged — the spawn-noise diagnosis.
const netQ = phenos.map(() => []), grossQ = phenos.map(() => []), goodQ = phenos.map(() => []), toxQ = phenos.map(() => []);
for (let e = 0; e < a.evals; e++) {
  const col = new Colony(phenos, world, cfg); col.qualAblate = 'mean'; col.spawn(makeRng(0x9000 + e * 7919));
  for (let s = 0; s < a.steps; s++) { col.step(); if (s % 50 === 0) col.assertFinite(); }
  col.assertFinite('end');
  const tr = col.traits();
  for (let g = 0; g < a.pop; g++) { netQ[g].push(tr[g].netIntake); grossQ[g].push(tr[g].gross); goodQ[g].push(tr[g].goodEaten); toxQ[g].push(tr[g].toxEaten); }
}
console.log(`[escape-scaling] quality-ABLATED, H ${a.H} starve ${a.starve} consume ${a.consume>=0?a.consume:DEFAULTS.FOOD_CONSUME} food ${a.food}/${a.clusters} steps ${a.steps} pop ${a.pop}`);
console.log(`  population mean net-ablated (all spawns): ${mean(phenos.map((_,g)=>mean(netQ[g]))).toFixed(4)}`);
console.log(`  mean gross ${mean(phenos.map((_,g)=>mean(grossQ[g]))).toFixed(4)}  mean good ${mean(phenos.map((_,g)=>mean(goodQ[g]))).toFixed(4)}  mean tox ${mean(phenos.map((_,g)=>mean(toxQ[g]))).toFixed(4)}`);
console.log(`  aggregate selectivity (Σgood/Σgross) = ${(mean(phenos.map((_,g)=>mean(goodQ[g])))/mean(phenos.map((_,g)=>mean(grossQ[g])))).toFixed(4)}  (0.5 = no discrimination)`);
console.log('  spawns-averaged   escape%(net-ablated>0)');
for (const k of [1, 2, 4, 8, 16, a.evals]) {
  if (k > a.evals) continue;
  // average the first k spawns per genome
  const esc = phenos.filter((_, g) => mean(netQ[g].slice(0, k)) > 0).length / a.pop;
  console.log(`  ${String(k).padStart(3)}               ${(esc * 100).toFixed(0)}%`);
}
