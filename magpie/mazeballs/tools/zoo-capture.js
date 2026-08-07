/**
 * CAPTURE LIVE CREATURES INTO THE ZOO, at gene level.
 *
 * `design-creatures.js` finds genomes by specification and search — the intent
 * is stated in advance and a hill-climb goes looking. This does the opposite and
 * the better thing: it takes genomes that a world actually produced and keeps
 * them.
 *
 * Why that matters. A designed genome is a guess about what is reachable; an
 * evolved one is proof. It also carries its provenance — the step, generation
 * and lineage it came from — so a creature in the library is a record of a
 * moment in a world rather than an artefact with no history.
 *
 * The genome is stored, not the body. Development is deterministic given a
 * genome (`canalised`), so the body is reproducible from it, and storing the
 * genome means the creature can be re-grown, mutated, injected a hundred times,
 * and compared against its own descendants.
 *
 *   deno run -A tools/zoo-capture.js 45140 45069 48722 --label "sensor giant"
 *   deno run -A tools/zoo-capture.js --auto
 *
 * `--auto` picks what is RARE in the current population rather than what is
 * biggest: tissue count first, then whether the body can close a sensorimotor
 * loop, then size. In a world that has descended to small single-tissue bodies,
 * those are the only two things worth keeping.
 */
import { develop, DEFAULT_EXTENT } from '../lib/devo2.js';
import { describe } from '../lib/evolve.js';

const args = Deno.args.filter((a) => !a.startsWith('--'));
const flag = (n) => Deno.args.includes(`--${n}`);
const opt = (n, d) => {
  const i = Deno.args.indexOf(`--${n}`);
  return i >= 0 && Deno.args[i + 1] ? Deno.args[i + 1] : d;
};
const PORT = Number(opt('port', 8899));
const OUT = opt('out', './lib/creatures.json');
const HEAD = 48;

async function population() {
  const buf = await (await fetch(`http://127.0.0.1:${PORT}/frame`, { cache: 'no-store' }))
    .arrayBuffer();
  const dv = new DataView(buf);
  const steps = dv.getUint32(8, true);
  let at = HEAD;
  const L = dv.getUint32(at, true); at += 4;
  at += L * 4 + L * 8 + L * 4;
  const type = new Int32Array(buf.slice(at, at + L * 4)); at += L * 4;
  const energy = new Float32Array(buf.slice(at, at + L * 4)); at += L * 4;
  const uid = new Int32Array(buf.slice(at, at + L * 4));
  const B = new Map();
  for (let i = 0; i < L; i++) {
    const t = type[i];
    if (t < 0 || t > 3) continue;
    let o = B.get(uid[i]);
    if (!o) { o = { k: [0, 0, 0, 0], n: 0, e: 0 }; B.set(uid[i], o); }
    o.k[t]++; o.n++; o.e += energy[i];
  }
  return { steps, bodies: B };
}

/** Measure a developed body, the same way design-creatures does. */
function measure(cells) {
  const n = cells.length;
  if (!n) return null;
  let cx = 0, cy = 0;
  for (const c of cells) { cx += c.x; cy += c.y; }
  cx /= n; cy /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const c of cells) {
    const dx = c.x - cx, dy = c.y - cy;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  sxx /= n; syy /= n; sxy /= n;
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const disc = Math.max(0, tr * tr / 4 - det);
  const l1 = tr / 2 + Math.sqrt(disc), l2 = Math.max(1e-9, tr / 2 - Math.sqrt(disc));
  const kind = [0, 0, 0, 0];
  let tough = 0, enz = 0;
  for (const c of cells) {
    const t = describe(c);
    if (t >= 0 && t < 4) kind[t]++;
    tough += Math.max(0, c.toughness ?? 0);
    enz += c.enzyme ?? 0.5;
  }
  let paired = 0;
  for (const c of cells) {
    const my = 2 * cy - c.y;
    let best = 1e9;
    for (const d of cells) {
      const dd = (d.x - c.x) ** 2 + (d.y - my) ** 2;
      if (dd < best) best = dd;
    }
    if (best < 0.55) paired++;
  }
  return {
    cells: n, elongation: +Math.sqrt(l1 / l2).toFixed(3),
    symmetry: +(paired / n).toFixed(3),
    neuron: +(kind[0] / n).toFixed(3), sensor: +(kind[1] / n).toFixed(3),
    muscle: +(kind[2] / n).toFixed(3), anchor: +(kind[3] / n).toFixed(3),
    toughness: +(tough / n).toFixed(3), enzyme: +(enz / n).toFixed(3),
    tissues: kind.filter((v) => v > 0).length,
  };
}

const pop = await population();
let uids = args.map(Number).filter(Number.isFinite);

if (flag('auto') || !uids.length) {
  // What is RARE, not what is big. See the header.
  const rows = [];
  for (const [u, o] of pop.bodies) {
    if (o.n < 2) continue;
    const tis = o.k.filter((v) => v > 0).length;
    rows.push({ u, n: o.n, tis, sm: o.k[1] > 0 && o.k[2] > 0 });
  }
  rows.sort((a, b) => (b.tis * 1000 + (b.sm ? 500 : 0) + b.n) - (a.tis * 1000 + (a.sm ? 500 : 0) + a.n));
  uids = rows.slice(0, Number(opt('n', 6))).map((r) => r.u);
  console.log(`--auto picked ${uids.join(', ')}`);
}

let lib = { note: '', encoding: 'devo2-grn', creatures: [] };
try { lib = JSON.parse(await Deno.readTextFile(OUT)); } catch { /* first run */ }
lib.creatures ??= [];

let added = 0;
for (const u of uids) {
  let g;
  try {
    g = await (await fetch(`http://127.0.0.1:${PORT}/genome?uid=${u}`, { cache: 'no-store' })).json();
  } catch (e) { console.log(`  ${u}: ${e.message}`); continue; }
  if (!g || g.ok === false || !g.g) { console.log(`  ${u}: no longer alive`); continue; }

  const grown = develop(Float32Array.from(g.g), { extent: DEFAULT_EXTENT, maxCells: 60 });
  const m = measure(grown.cells ?? []);
  if (!m) { console.log(`  ${u}: develops into nothing`); continue; }

  const live = pop.bodies.get(u);
  const label = opt('label', null);
  const name = label && uids.length === 1
    ? label
    : `Wild ${u} · gen ${g.generation} · lin ${g.lineage}`;
  // Replace rather than duplicate if this uid was captured before.
  const at = lib.creatures.findIndex((c) => c.uid === u);
  const rec = {
    name, uid: u,
    about: `Evolved, not designed. Taken live at step ${pop.steps.toLocaleString()} ` +
           `from generation ${g.generation}, lineage ${g.lineage}` +
           (live ? `, then holding ${(live.e / live.n).toFixed(2)} energy per cell across ${live.n} cells` : '') +
           `. ${m.tissues} tissue${m.tissues === 1 ? '' : 's'}` +
           (m.sensor > 0 && m.muscle > 0 ? ', and it can close a sensorimotor loop.' : '.'),
    provenance: { step: pop.steps, generation: g.generation, lineage: g.lineage,
                  capturedAt: new Date().toISOString() },
    stats: m,
    genome: Array.from(g.g).map((v) => +v.toFixed(5)),
  };
  if (at >= 0) lib.creatures[at] = rec; else lib.creatures.push(rec);
  added++;
  console.log(`  ${String(u).padStart(6)}  ${String(m.cells).padStart(2)} cells  ` +
    `${m.tissues} tissue(s)  n/s/m/a ${[m.neuron, m.sensor, m.muscle, m.anchor]
      .map((v) => (100 * v).toFixed(0)).join('/')}%  gen ${g.generation} lin ${g.lineage}`);
}

lib.note = 'Designed genomes come from tools/design-creatures.js (specification and '
         + 'search). Wild ones come from tools/zoo-capture.js and are genomes a world '
         + 'actually produced, with the step, generation and lineage they came from.';
await Deno.writeTextFile(OUT, JSON.stringify(lib, null, 1));
console.log(`\n${added} captured, ${lib.creatures.length} in the zoo -> ${OUT}`);
