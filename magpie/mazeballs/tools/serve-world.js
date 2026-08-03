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
  const out = { port: 8899, beasts: 3000, cells: 12, start: 0.25, bound: 0, spf: 6, tick: 250 };
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
const world = new WorldGPU(brains, built.cells, { bound: BOUND });
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
async function frame() {
  const { pos, energy } = await world.readCells();
  const { act } = await brains.readState();

  const buf = new ArrayBuffer(HEAD + N * 8 + N * 4 + N * 4 + N * 4);
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
  dv.setUint32(40, evo.nextUid, true);
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
  new Float32Array(buf, at, N).set(energy);
  return new Uint8Array(buf);
}

/* ------------------------------------------------------------------ server */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
};
const ROOT = new URL('..', import.meta.url).pathname;

Deno.serve({ port: args.port, hostname: '127.0.0.1' }, async (req) => {
  const url = new URL(req.url);
  const path = url.pathname === '/' ? '/world.html' : url.pathname;

  if (path === '/frame') {
    return new Response(await frame(), {
      headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' },
    });
  }
  if (path === '/status') {
    return new Response(JSON.stringify({
      steps, bound: BOUND, cells: N, neurons: built.arena.N,
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

console.log(`\n  http://127.0.0.1:${args.port}/world.html?watch=1   (watch the shared run)`);
console.log(`  http://127.0.0.1:${args.port}/world.html            (own local sim)`);
console.log(`  http://127.0.0.1:${args.port}/status\n`);
