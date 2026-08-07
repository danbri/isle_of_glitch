/**
 * WHAT DOES A CELL TYPE STILL DECIDE?
 *
 * The question: can muscle and sensor cells do everything a plain neuron does,
 * and more — making type 0 redundant?
 *
 * Development does not produce types. `develop()` emits per-cell continuous
 * capacities — contract, sense, grip, stiff, tau, bias — and nothing else. The
 * type is read off those afterwards by `describe()` in lib/evolve.js: an argmax
 * over (sense, contract, grip) with a 0.15 floor below which a cell is "just
 * tissue". The label is therefore a summary, not a cause.
 *
 * What the label still causes, in the whole of world_gpu.js, is three branches:
 *
 *   1226  type 1 (sensor) receives external input; every other type gets ext = 0
 *   1803  type 1 pays senseWork every step
 *   1588  type 3 (anchor) grips with P.gripAnchor
 *
 * Contraction is NOT among them: contractionOf() is
 * P.contract * contractility(m.x) * act[...] for every cell regardless of label.
 *
 * So type 0 is not "a cell that cannot contract". It is a cell that does not
 * sense and does not pay the sensing tax. This measures whether type-0 cells
 * really do carry contractility — if they do, a neuron is an untaxed interneuron
 * rather than a dominated cell.
 *
 * It also counts what the argmax discards. `contract` is SIGNED: a cell at -0.9
 * is a strong extensor that pulls hard on its bonds, but it loses an argmax that
 * compares raw values, so it is never labelled muscle however strong it is.
 *
 *   deno run -A tools/what-is-a-type.js [--port 8899] [--n 64]
 */
import { develop } from '../lib/devo.js';
import { describe } from '../lib/evolve.js';

const arg = (k, d) => {
  const i = Deno.args.indexOf(`--${k}`);
  return i >= 0 ? Deno.args[i + 1] : d;
};
const PORT = arg('port', '8899');
const WANT = Number(arg('n', '64'));

const res = await fetch(`http://127.0.0.1:${PORT}/genomes?n=${WANT}`, { cache: 'no-store' })
  .catch(() => null);
if (!res?.ok) {
  console.error(`no world server on :${PORT} — start tools/serve-world.js`);
  Deno.exit(1);
}
const { steps, rows } = await res.json();

const NAME = ['neuron', 'sensor', 'muscle', 'anchor'];
const tally = NAME.map(() => ({ n: 0, absCon: 0, sense: 0, grip: 0, strong: 0 }));
let bodies = 0, cells = 0;
// Actuation available against actuation the label would have permitted, which is
// what the old type-gated kernel could reach.
let actTotal = 0, actIfGated = 0, extensorsHidden = 0;

for (const row of rows) {
  let grown;
  try { grown = develop(Float32Array.from(row.g), { extent: 3.0, maxCells: 60 }); } catch { continue; }
  if (!grown?.cells?.length) continue;
  bodies++;
  for (const c of grown.cells) {
    const t = describe(c);
    const a = Math.abs(c.contract);
    const rec = tally[t];
    rec.n++; rec.absCon += a; rec.sense += c.sense; rec.grip += c.grip;
    if (a > 0.15) rec.strong++;
    cells++;
    actTotal += a;
    if (t === 2) actIfGated += a;
    // A powerful actuator the argmax cannot see, because its capacity is negative.
    if (c.contract < -0.15 && t !== 2) extensorsHidden++;
  }
}

console.log(`${bodies} bodies from ${rows.length} living genomes at step ${steps.toLocaleString()}`);
console.log(`${cells} cells\n`);
console.log('label     count   share   mean |contract|   mean sense   mean grip   |con|>0.15');
for (let t = 0; t < 4; t++) {
  const a = tally[t];
  if (!a.n) { console.log(`${NAME[t].padEnd(9)} ${String(0).padStart(5)}       —`); continue; }
  console.log(
    `${NAME[t].padEnd(9)} ${String(a.n).padStart(5)}  ${(100 * a.n / cells).toFixed(1).padStart(5)}%` +
    `   ${(a.absCon / a.n).toFixed(3).padStart(14)}   ${(a.sense / a.n).toFixed(3).padStart(10)}` +
    `   ${(a.grip / a.n).toFixed(3).padStart(9)}   ${String(a.strong).padStart(10)}`);
}

console.log(`\nactuation in the tissue          ${actTotal.toFixed(1)}`);
console.log(`reachable if gated on label      ${actIfGated.toFixed(1)}` +
            `  (${(100 * actIfGated / Math.max(1e-9, actTotal)).toFixed(1)}%)`);
console.log(`strong extensors the argmax hides: ${extensorsHidden} cells with contract < -0.15 not labelled muscle`);
