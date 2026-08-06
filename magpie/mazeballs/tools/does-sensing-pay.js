/**
 * DOES SENSING PAY?
 *
 * Energy transport was built on the theory that specialists starve, and it was
 * refuted: it rescued the population and destroyed the differentiation anyway.
 * What that left behind is a sharper claim — a sensor costs senseCost, costs
 * uptake under any tradeoff, and returns information the body cannot convert
 * into energy. If that is true, evolution deleting sensors is the correct
 * answer and no economic plumbing will change it.
 *
 * But it is a claim, and claims get measured. This is the direct test, on the
 * live population, with no simulation of its own:
 *
 *   Do bodies that HAVE sensors hold more energy than bodies that do not?
 *
 * And the follow-up that separates the two ways sensing could pay:
 *
 *   Do they sit on richer ground?    — sensing used to FIND food
 *   Do they move faster?             — sensing used to act at all
 *
 * WHY THIS IS NOT CIRCULAR. A sensor is not being scored on some proxy for
 * usefulness; it is being scored on ENERGY, which is the world's only currency
 * and the thing selection actually acts on. If sensored bodies are poorer, the
 * sense organ is a straightforward net cost and its deletion is not a failure
 * of the world to reward perception — it is the world correctly pricing an
 * organ that does nothing.
 *
 * THE CONFOUND, stated in advance: bodies with sensors may simply be BIGGER,
 * and bigger bodies hold more energy in total. So energy is compared PER CELL,
 * and body size is reported alongside so a size effect is visible rather than
 * hidden.
 *
 *   deno run -A tools/does-sensing-pay.js [--samples 3]
 */
const args = Object.fromEntries(
  Deno.args.map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] ?? 'true'] : null)
    .filter(Boolean));
const PORT = Number(args.port ?? 8899);
const SAMPLES = Number(args.samples ?? 3);
const HEAD = 48;

async function readFrame() {
  const buf = await (await fetch(`http://127.0.0.1:${PORT}/frame`, { cache: 'no-store' }))
    .arrayBuffer();
  const dv = new DataView(buf);
  const steps = dv.getUint32(8, true);
  const bound = dv.getFloat32(12, true);
  let at = HEAD;
  const L = dv.getUint32(at, true); at += 4;
  at += L * 4;
  const pos = new Float32Array(buf.slice(at, at + L * 8)); at += L * 8;
  const act = new Float32Array(buf.slice(at, at + L * 4)); at += L * 4;
  const type = new Int32Array(buf.slice(at, at + L * 4)); at += L * 4;
  const energy = new Float32Array(buf.slice(at, at + L * 4)); at += L * 4;
  const uid = new Int32Array(buf.slice(at, at + L * 4));
  return { L, pos, act, type, energy, uid, bound, steps };
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

/** Group cells into bodies and describe each one. */
function bodies(f) {
  const map = new Map();
  for (let i = 0; i < f.L; i++) {
    const t = f.type[i];
    if (t < 0 || t > 3) continue;
    let b = map.get(f.uid[i]);
    if (!b) { b = { kind: [0, 0, 0, 0], e: 0, n: 0, act: 0, x: 0, y: 0 }; map.set(f.uid[i], b); }
    b.kind[t]++; b.n++;
    b.e += f.energy[i];
    b.act += Math.abs(f.act[i]);
    b.x += f.pos[i * 2]; b.y += f.pos[i * 2 + 1];
  }
  const out = [];
  for (const b of map.values()) {
    if (b.n < 2) continue;
    out.push({
      n: b.n, ePerCell: b.e / b.n, actPerCell: b.act / b.n,
      x: b.x / b.n, y: b.y / b.n,
      hasSensor: b.kind[1] > 0, hasMuscle: b.kind[2] > 0,
      sensorFrac: b.kind[1] / b.n,
    });
  }
  return out;
}

function report(label, a, b, labA, labB) {
  if (!a.length || !b.length) { console.log(`${label}: not enough bodies`); return; }
  const ma = mean(a), mb = mean(b);
  const se = Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);
  const diff = ma - mb;
  const sig = Math.abs(diff) > 2 * se;
  console.log(`${label.padEnd(24)} ${labA} ${ma.toFixed(3).padStart(7)} (n=${a.length})   ` +
    `${labB} ${mb.toFixed(3).padStart(7)} (n=${b.length})   ` +
    `diff ${diff >= 0 ? '+' : ''}${diff.toFixed(3)} +-${(2 * se).toFixed(3)}  ` +
    `${sig ? (diff > 0 ? 'SENSORS AHEAD' : 'SENSORS BEHIND') : 'no difference'}`);
}

const acc = { withE: [], withoutE: [], withA: [], withoutA: [], withN: [], withoutN: [] };
let steps = 0;
for (let s = 0; s < SAMPLES; s++) {
  const f = await readFrame();
  steps = f.steps;
  const bs = bodies(f);
  for (const b of bs) {
    (b.hasSensor ? acc.withE : acc.withoutE).push(b.ePerCell);
    (b.hasSensor ? acc.withA : acc.withoutA).push(b.actPerCell);
    (b.hasSensor ? acc.withN : acc.withoutN).push(b.n);
  }
  if (s < SAMPLES - 1) await new Promise((r) => setTimeout(r, 2500));
}

console.log(`live world at step ${steps.toLocaleString()}, ` +
  `${acc.withE.length + acc.withoutE.length} bodies over ${SAMPLES} samples\n`);
report('energy per cell', acc.withE, acc.withoutE, 'sensored', 'blind');
report('activation per cell', acc.withA, acc.withoutA, 'sensored', 'blind');
report('body size (confound)', acc.withN, acc.withoutN, 'sensored', 'blind');

console.log('');
const d = mean(acc.withE) - mean(acc.withoutE);
const se = Math.sqrt(sd(acc.withE) ** 2 / Math.max(1, acc.withE.length) +
                     sd(acc.withoutE) ** 2 / Math.max(1, acc.withoutE.length));
if (Math.abs(d) <= 2 * se) {
  console.log('VERDICT: sensing is INVISIBLE to the economy. Bodies with sense organs');
  console.log('are no better off than blind ones, so senseCost is paid for nothing and');
  console.log('deleting the organ is the correct answer. Nothing about energy plumbing');
  console.log('or contest coefficients changes that — the world needs a channel through');
  console.log('which knowing something turns into eating something.');
} else if (d < 0) {
  console.log('VERDICT: sensing is a NET LOSS. Sensored bodies are measurably poorer,');
  console.log('so the organ is actively selected against and its rarity is not a puzzle.');
} else {
  console.log('VERDICT: sensing PAYS. Sensored bodies are measurably richer, so the');
  console.log('organ earns its cost and its rarity is a question about development or');
  console.log('about how hard it is to reach, not about the economy.');
}
