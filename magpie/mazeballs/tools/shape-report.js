/**
 * Body shape and bond strain on a running world server.
 *
 *   deno run --allow-net tools/shape-report.js [http://127.0.0.1:8899]
 *
 * Exists because the frustration it detects takes THOUSANDS of ticks to appear
 * and so cannot be caught by a unit test at any tolerable runtime. It showed up
 * first as a visual report — "the display looks like it is raining, diagonal
 * lines" — which turned out to be long chains of over-stretched bonds, not a
 * rendering artifact.
 *
 * The number that matters is bond length as a MULTIPLE OF ITS REST LENGTH. A
 * healthy body sits near 1. Sustained values well above it mean the bond graph
 * has no embedding in the plane at that rest length, so the body can never
 * satisfy itself however strong the springs are.
 */
const base = Deno.args[0] ?? 'http://127.0.0.1:8899';

const RWM2 = 0x324d5257;
const RWM3 = 0x334d5257;

function parseFrame(ab) {
  const dv = new DataView(ab);
  const magic = dv.getUint32(0, true);
  const n = dv.getUint32(4, true);
  const out = {
    n,
    steps: dv.getUint32(8, true),
    bound: dv.getFloat32(12, true),
    alive: dv.getUint32(16, true),
    births: dv.getUint32(20, true),
    deaths: dv.getUint32(24, true),
    generation: dv.getUint32(28, true),
    lineages: dv.getUint32(32, true),
    epoch: dv.getUint32(40, true),
    pos: new Float32Array(n * 2),
    type: new Int32Array(n),
  };
  out.type.fill(-1);

  let at;
  if (magic === RWM2) {
    at = 48;
    const L = dv.getUint32(at, true); at += 4;
    const idx = new Int32Array(ab, at, L); at += L * 4;
    const lpos = new Float32Array(ab, at, L * 2); at += L * 8;
    at += L * 4;                                // activation
    const ltype = new Int32Array(ab, at, L); at += L * 4;
    at += L * 4;                                // energy
    at += L * 4;                                // uid
    out.live = L;
    for (let k = 0; k < L; k++) {
      const i = idx[k];
      out.pos[i * 2] = lpos[k * 2];
      out.pos[i * 2 + 1] = lpos[k * 2 + 1];
      out.type[i] = ltype[k];
    }
    return out;
  }

  if (magic === RWM3) {
    const hasStatic = dv.getUint32(48, true) !== 0;
    if (!hasStatic) throw new Error('RWM3 delta frame lacks static cell ids; request /frame?have=-1');
    at = 56;
    const L = dv.getUint32(at, true); at += 4;
    const lpos = new Float32Array(ab, at, L * 2); at += L * 8;
    at += L * 4;                                // activation
    at += L * 4;                                // energy
    const idx = new Int32Array(ab, at, L); at += L * 4;
    const ltype = new Int32Array(ab, at, L); at += L * 4;
    at += L * 4;                                // uid
    out.live = L;
    for (let k = 0; k < L; k++) {
      const i = idx[k];
      out.pos[i * 2] = lpos[k * 2];
      out.pos[i * 2 + 1] = lpos[k * 2 + 1];
      out.type[i] = ltype[k];
    }
    return out;
  }

  throw new Error(`unknown frame magic 0x${magic.toString(16)}`);
}

async function snapshot() {
  let last = null;
  for (let tries = 0; tries < 5; tries++) {
    const st = await (await fetch(`${base}/status`)).json();
    // RWM3 uses have=-1 to force the static half. RWM2 ignores the query.
    const frame = parseFrame(await (await fetch(`${base}/frame?have=-1`)).arrayBuffer());
    const bonds = await (await fetch(`${base}/bonds`)).arrayBuffer();
    const bondEpoch = new DataView(bonds).getUint32(0, true);
    last = { st, frame, bonds, bondEpoch };
    if (bondEpoch === frame.epoch) return last;
    await new Promise(r => setTimeout(r, 50));
  }
  console.error(
    `warning: frame epoch ${last.frame.epoch} and bond epoch ${last.bondEpoch} differ; ` +
    `report may cross one birth/death`);
  return last;
}

const { frame, bonds: bb } = await snapshot();
const n = frame.n, b = frame.bound;
const { pos, type } = frame;
const bondK = new DataView(bb).getUint32(4, true);
// Explicit length: without one this spans the whole remaining buffer and
// swallows the rest-length section that now follows it.
const bond = new Int32Array(bb, 8, n * bondK);
// Minimum image: a bond across the seam is short in the world however far apart
// the raw coordinates are.
const mi = v => v > b ? v - 2 * b : (v < -b ? v + 2 * b : v);

// Per-bond rest lengths, fetched rather than assumed. They are inherited from
// the parent's realised geometry (lib/evolve.js), so a hardcoded constant here
// measures strain against a number that does not exist and reports frustration
// that is not there — which this tool did, loudly, after the fix landed.
const brest = new Float32Array(bb, 8 + bond.byteLength, bond.length);
const lens = [];
const adj = new Map();
for (let i = 0; i < n; i++) {
  if (type[i] < 0) continue;
  for (let k = 0; k < bondK; k++) {
    const j = bond[i * bondK + k];
    if (j < 0 || type[j] < 0) continue;
    const rest = Math.max(brest[i * bondK + k], 1e-6);
    lens.push(Math.hypot(mi(pos[j * 2] - pos[i * 2]), mi(pos[j * 2 + 1] - pos[i * 2 + 1])) / rest);
    if (!adj.has(i)) adj.set(i, []);
    adj.get(i).push(j);
  }
}
lens.sort((x, y) => x - y);
const q = p => +lens[Math.floor(lens.length * p)].toFixed(2);

const seen = new Set(); const sizes = [];
for (const start of adj.keys()) {
  if (seen.has(start)) continue;
  const stack = [start]; seen.add(start); let count = 0;
  while (stack.length) {
    const i = stack.pop(); count++;
    for (const j of (adj.get(i) ?? [])) if (!seen.has(j)) { seen.add(j); stack.push(j); }
  }
  if (count > 1) sizes.push(count);
}
sizes.sort((x, y) => x - y);

console.log(`step ${frame.steps.toLocaleString()}  alive ${frame.alive}  gen ${frame.generation}  lineages ${frame.lineages}`);
console.log(`bodies ${sizes.length}, cells/body median ${sizes[sizes.length >> 1] ?? 0} max ${sizes[sizes.length - 1] ?? 0}`);
if (!lens.length) {
  console.log('no live bonds');
  Deno.exit(0);
}
console.log(`bond strain (x rest length): median ${q(0.5)}  p90 ${q(0.9)}  p99 ${q(0.99)}  max ${lens[lens.length - 1].toFixed(1)}`);
const verdict = q(0.5) < 2 ? 'bodies are relaxed'
  : q(0.5) < 4 ? 'bodies are strained' : 'bodies are FRUSTRATED — the bond graph has no planar solution';
console.log(verdict);
