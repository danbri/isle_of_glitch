/**
 * One authoritative world, running headless in Deno, watched from a browser.
 *
 * WHAT THIS FIXES. Loading world.html from a plain static file server makes
 * every tab run its OWN simulation, on its own GPU device, from its own random
 * seed. Two browsers are then two unrelated universes, the page is not showing
 * you anything a second observer could corroborate, and nothing survives
 * closing the tab. That is fine for a toy and useless for a lab.
 *
 * Here the simulation lives in ONE Deno process, stepping on the machine's GPU
 * and never stopping. The browser becomes a viewport: it fetches frames and
 * draws them, and every watcher sees the same world at the same step. Closing
 * a tab costs nothing; the run continues. This is also what a long evolutionary
 * run needs — days of world time do not fit in a page visit.
 *
 * WHY THE BROWSER STILL HAS A GPU JOB. Deno's WebGPU has compute but no
 * surface: there is no window and nothing to present to. So the split is
 * compute here, render there — the frame crosses as raw positions and
 * activations, and the browser's own WebGPU draws them with the same shader it
 * always used. Deno is not drawing to your browser and could not; it is
 * shipping numbers, and the browser is drawing them.
 *
 *   deno run -A tools/serve-world.js --port 8899 --beasts 3000
 *   open http://127.0.0.1:8899/world.html?watch=1
 *
 * Without ?watch=1 the page still runs its own local simulation, which stays
 * useful for fiddling with parameters without disturbing the shared run.
 */
import { buildBodies } from '../lib/bodies.js';
import { BrainArenaGPU } from '../lib/brainarena_gpu.js';
import { WorldGPU } from '../lib/world_gpu.js';
import { Evolver } from '../lib/evolve.js';

const args = (() => {
  const out = {
    port: 8899, beasts: 3000, cells: 12, start: 0.25, bound: 0, spf: 6, tick: 250,
    host: '0.0.0.0',
    // The non-stationary field, which measured far better than a static one:
    // ancestral-tournament shareB 0.970 against 0.864, and body size kept
    // growing (27.6 and rising) where the static world saturated at 19.3.
    drift: 1,
  };
  const a = Deno.args;
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2);
    const v = a[i + 1] !== undefined && !a[i + 1].startsWith('--') ? a[++i] : 'true';
    out[k] = /^[\d.]+$/.test(v) ? +v : v;
  }
  return out;
})();

const BOUND = args.bound || Math.max(40, Math.sqrt(args.beasts * args.cells) * 0.62);

console.log(`building ${args.beasts} bodies x ${args.cells} cells, bound ${BOUND.toFixed(0)}`);
const built = buildBodies({
  beasts: args.beasts, cells: args.cells, bound: BOUND, seed: (Date.now() & 0xffff) || 7,
});
const brains = await BrainArenaGPU.create(built.arena);
const world = new WorldGPU(brains, built.cells, {
  bound: BOUND,
  ...(args.drift ? { driftX: 0.06, driftY: 0.037, morphRate: 0.0075 } : {}),
});
const evo = new Evolver({
  arena: built.arena, world, cells: built.cells,
  seed: 5, birthEnergy: 18, deathEnergy: 0,
});
const startCount = Math.max(60, Math.floor(args.beasts * args.start));
for (let o = startCount; o < args.beasts; o++) evo.cull(o);
evo.founders = evo.alive();
console.log(`founders ${evo.alive()}, arena ${built.arena.N} neuron slots`);

const N = built.meta.nCells;
let last = { alive: evo.alive(), born: 0, died: 0, meanEnergy: 0, maxGeneration: 0, lineages: evo.alive() };
let steps = 0, sinceTick = 0, ticking = false, running = true;

/* ------------------------------------------------------------- the sim loop */

// Runs independently of any watcher. Nobody has to be looking for the world to
// continue, which is the entire point of moving it out of the tab.
(async function loop() {
  while (running) {
    world.step(args.spf);
    steps += args.spf; sinceTick += args.spf;

    if (sinceTick >= args.tick && !ticking) {
      sinceTick = 0; ticking = true;
      try { last = await evo.tick(steps); } catch (e) { console.error('tick failed:', e.message); }
      ticking = false;
    }
    // Yield so the HTTP handler gets a turn; without this the loop starves the
    // server and every frame request times out.
    await new Promise(r => setTimeout(r, 0));
  }
})();

/* ----------------------------------------------------------------- framing */

const FRAME_MAGIC = 0x314d5257;         // 'WRM1'
const HEAD = 48;

/**
 * A frame is positions, activations and cell types.
 *
 * Types change only on birth and death, but they are sent every frame anyway:
 * at these sizes the saving is not worth a second code path that can disagree
 * with itself about which cells are alive. Correctness first; the topologyEpoch
 * machinery in brainarena.js is there when this becomes the bottleneck.
 */
// One readback serves every viewer in the same window.
//
// Each viewer polling independently meant N concurrent readbacks per frame, and
// concurrent readbacks were what poisoned the device: two overlapping mapAsync
// calls on one staging buffer gives "Buffer is already mapped", which is a
// device error, after which every command buffer is invalid and the simulation
// silently stops. The staging buffers are per-call now so that cannot recur,
// but coalescing is still right — the GPU should not do the same work twice
// because two people are watching.
let cached = null, cachedAt = -1, inFlight = null;
const FRAME_MS = 40;

async function frame() {
  const now = performance.now();
  if (cached && now - cachedAt < FRAME_MS) return cached;
  if (inFlight) return inFlight;
  inFlight = buildFrame().then(f => {
    cached = f; cachedAt = performance.now(); inFlight = null; return f;
  }).catch(e => { inFlight = null; throw e; });
  return inFlight;
}

async function buildFrame() {
  const { pos, energy } = await world.readCells();
  const { act } = await brains.readState();

  // Live bond pairs, computed HERE so they describe the same instant as the
  // positions above. Sending them out-of-band (the /bonds endpoint) meant the
  // viewer held a bond list from one moment and positions from another, and
  // with tens of thousands of births constantly recycling slots those lists
  // disagreed about which cells belong to which body. The result was lines
  // drawn between cells that were never bonded — arbitrary pairs, which is
  // exactly why they ignored the renderer's length cull. Diagnosed twice as
  // something else (dead cells, then over-stretched bodies) before the strain
  // measurement came back clean at 1.00 and ruled the physics out.
  const pairs = [];
  const bond = built.cells.bond, bondK = built.cells.bondK;
  for (let i = 0; i < N; i++) {
    if (built.cells.ctype[i] < 0) continue;
    for (let k = 0; k < bondK; k++) {
      const j = bond[i * bondK + k];
      if (j < 0 || j <= i || built.cells.ctype[j] < 0) continue;   // each bond once
      pairs.push(i, j);
    }
  }
  const P32 = Int32Array.from(pairs);

  const buf = new ArrayBuffer(HEAD + N * 8 + N * 4 + N * 4 + N * 4 + 4 + P32.byteLength);
  const dv = new DataView(buf);
  dv.setUint32(0, FRAME_MAGIC, true);
  dv.setUint32(4, N, true);
  dv.setUint32(8, steps, true);
  dv.setFloat32(12, BOUND, true);
  dv.setUint32(16, last.alive, true);
  dv.setUint32(20, evo.births, true);
  dv.setUint32(24, evo.deaths, true);
  dv.setUint32(28, last.maxGeneration, true);
  dv.setUint32(32, last.lineages, true);
  dv.setFloat32(36, last.meanEnergy, true);
  // Topology version. Bonds are ~480KB and change only when a body is born or
  // dies, so they are NOT in the frame; the viewer refetches /bonds when this
  // moves. Sending them every frame would nearly double the bandwidth for data
  // that is identical 99% of the time — which matters once this is watched over
  // a tailnet rather than loopback.
  dv.setUint32(40, evo.births + evo.deaths, true);
  dv.setFloat32(44, world.params.flowScale, true);

  let at = HEAD;
  new Float32Array(buf, at, N * 2).set(pos); at += N * 8;
  // Per-CELL activation: the browser draws cells, not slots, so resolve the
  // cell -> brain-slot indirection here rather than shipping the slot table.
  const cellAct = new Float32Array(N);
  const cellType = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const t = built.cells.ctype[i];
    cellType[i] = t;
    const slot = built.cells.cslot[i];
    cellAct[i] = (t >= 0 && slot >= 0) ? act[slot] : 0;
  }
  new Float32Array(buf, at, N).set(cellAct); at += N * 4;
  new Int32Array(buf, at, N).set(cellType); at += N * 4;
  new Float32Array(buf, at, N).set(energy); at += N * 4;
  new DataView(buf).setUint32(at, P32.length, true); at += 4;
  new Int32Array(buf, at, P32.length).set(P32);
  return new Uint8Array(buf);
}

/* ------------------------------------------------------------------ server */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
};
const ROOT = new URL('..', import.meta.url).pathname;

// Bound to all interfaces so a tailnet peer can reach it. That also exposes it
// to anything else routable to this host, which is the trade being made — pass
// --host 127.0.0.1 to keep it local only.
Deno.serve({ port: args.port, hostname: args.host }, async (req) => {
  const url = new URL(req.url);
  // Bare / watches the shared world. Serving the plain page there made every
  // visitor build a SECOND simulation locally — and once the arena was sized for
  // the largest evolvable body that became 2000*40 = 80,000 cells rather than
  // 24,000, tripling the GPU buffers. On this machine that merely drops to 47fps;
  // on a phone or a smaller GPU over the tailnet it exceeds device limits and the
  // page errors after loading. Anyone who actually wants a private sandbox can
  // still ask for /world.html.
  if (url.pathname === '/') {
    return new Response(null, { status: 302, headers: { location: '/world.html?watch=1' } });
  }
  const path = url.pathname;

  if (path === '/frame') {
    return new Response(await frame(), {
      headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' },
    });
  }
  if (path === '/bonds') {
    // Bond graph as it stands, plus the version it corresponds to, so a viewer
    // can tell whether what it just fetched is already stale.
    // Bond indices AND their rest lengths. Rest is per-bond and inherited from
    // the parent's realised geometry, so any strain measure that assumes one
    // constant is measuring against a number that no longer exists — which is
    // exactly how shape-report kept reporting frustration after it was fixed.
    const bond = built.cells.bond, brest = built.cells.brest;
    const buf = new ArrayBuffer(8 + bond.byteLength + brest.byteLength);
    const dv = new DataView(buf);
    dv.setUint32(0, evo.births + evo.deaths, true);
    dv.setUint32(4, built.cells.bondK, true);
    new Int32Array(buf, 8, bond.length).set(bond);
    new Float32Array(buf, 8 + bond.byteLength, brest.length).set(brest);
    return new Response(new Uint8Array(buf), {
      headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' },
    });
  }
  if (path === '/status') {
    return new Response(JSON.stringify({
      steps, bound: BOUND, cells: N, neurons: built.arena.N,
      // The viewer builds its buffers from these, so it does not have to be
      // configured to match by hand — a mismatch is not a user error, it is
      // just a page that has not been told the shape yet.
      beasts: args.beasts, cellsPerBeast: args.cells,
      // Ground truth for cell ownership. cellsOwned sums the arena's own
      // organism table; cellsLiveTyped counts cells the world still treats as
      // present. They must match — any excess is orphan cells that no organism
      // owns but which still crowd the living, still render, and still carry
      // bonds.
      cellsOwned: (() => { let t = 0; for (let o = 0; o < built.arena.P; o++) if (built.arena.alive[o]) t += built.arena.cnt[o]; return t; })(),
      cellsLiveTyped: (() => { let t = 0; for (let i = 0; i < N; i++) if (built.cells.ctype[i] >= 0) t++; return t; })(),
      drift: !!args.drift,
      alive: last.alive, births: evo.births, deaths: evo.deaths,
      generation: last.maxGeneration, lineages: last.lineages,
      meanEnergy: last.meanEnergy, organisms: evo.nextUid,
    }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }

  // Static files, confined to the project directory.
  try {
    const full = new URL('.' + path, `file://${ROOT}`).pathname;
    if (!full.startsWith(ROOT)) return new Response('no', { status: 403 });
    const body = await Deno.readFile(full);
    const ext = path.slice(path.lastIndexOf('.'));
    return new Response(body, {
      headers: { 'content-type': MIME[ext] ?? 'application/octet-stream' },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
});

const tailscale = (() => {
  try {
    for (const [, addrs] of Object.entries(Deno.networkInterfaces?.() ?? {})) {}
    const ifs = Deno.networkInterfaces?.() ?? [];
    const ts = ifs.find(i => i.family === 'IPv4' && i.address.startsWith('100.'));
    return ts?.address ?? null;
  } catch { return null; }
})();
console.log(`\n  http://127.0.0.1:${args.port}/world.html?watch=1   (watch the shared run)`);
if (tailscale) console.log(`  http://${tailscale}:${args.port}/world.html?watch=1   (over tailscale)`);
console.log(`  http://127.0.0.1:${args.port}/world.html            (own local sim)`);
console.log(`  http://127.0.0.1:${args.port}/status`);
console.log(`  drift ${args.drift ? 'ON (non-stationary field)' : 'off (static field)'}\n`);
