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
import { Lineage } from '../lib/lineage.js';

/**
 * ONE RESOURCE KNOB: --cells, the universe's total cell budget.
 *
 * Everything else is derived, because everything else was never a design choice.
 * Body count and body size are OUTCOMES of development and the economy; a flag
 * that appears to set them is lying about what this world is.
 *
 * What the old flags actually were, and why they are gone from the surface:
 *
 *   --beasts   was two different things wearing one name: the cell-arena size
 *              AND the body-slot count. Because they were the same number the
 *              population jammed against a bookkeeping ceiling at 23% cell
 *              occupancy, which is a bug that cost days of chasing the economy.
 *   --cells    was the FOUNDER RING SIZE, which applies to nothing after the
 *              first division. It now means the universe budget, which is what
 *              anyone reading it assumed it meant.
 *   --maxCells is a development ceiling, not a universe knob. Still overridable
 *              because the arena needs a contiguous-island bound, but it has no
 *              business on the front of the command line.
 *
 * Derived from the budget:
 *   body slots   budget / 8   — bodies measure 11-20 cells, and a slot is a few
 *                scalars against maxCells cells, so be generous and let ENERGY
 *                decide the population rather than allocation.
 *   arena width  budget / maxCells, which is what makes the cell slots add up.
 *   bound        sized so the LIVE fraction (measured near 0.35) sits at the
 *                areal density the world was tuned for.
 */
const args = (() => {
  const out = {
    port: 8899, cells: 100000, maxCells: 60, start: 0.25, bound: 0, spf: 1, tick: 250,
    founderCells: 12,
    host: '0.0.0.0',
    // Developmental encoding: 2 is the GRN-in-an-egg (DEVELOPMENT-2.md), 1 is
    // the old positional readout. Kept selectable so the two can be run against
    // the same world rather than compared across worlds.
    devo: 2, founders: 300,
    // The non-stationary field, which measured far better than a static one:
    // ancestral-tournament shareB 0.970 against 0.864, and body size kept
    // growing (27.6 and rising) where the static world saturated at 19.3.
    drift: 1,
  };
  // Aliases that say what the flag actually controls. The old names still
  // work; nothing that exists is broken to rename it.
  // --budget reads better than --cells for what it is. --bodyCap is the
  // development ceiling the arena needs; it is not a body-size setting.
  const ALIAS = { budget: 'cells', bodyCap: 'maxCells' };
  const a = Deno.args;
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2);
    const v = a[i + 1] !== undefined && !a[i + 1].startsWith('--') ? a[++i] : 'true';
    out[ALIAS[k] ?? k] = /^[\d.]+$/.test(v) ? +v : v;
  }
  return out;
})();

// Sized for the tissue the world will actually hold, not for the founder rings.
// This used beasts * cells, i.e. 12 cells a body — but development builds ~34, so
// the live world was carrying nearly three times the tissue the number was chosen
// for. That is why crowding suppression tuned in a 600-body test world killed the
// 1200-body server: the server was already far denser than anything measured.
/**
 * Version stamps for the two INDEPENDENT things that can be out of date.
 *
 * `pageVersion` is world.html, which is static — a browser reload picks up any
 * change. `simVersion` is the physics: lib/*.js, loaded into THIS process at
 * startup, which a reload cannot touch and only a restart replaces.
 *
 * Conflating them is easy and was actively confusing: reloading forever will
 * never pick up a change to traction or grazing, and restarting the server does
 * nothing for a renderer bug. The page now compares both and says which.
 */
const codeStamp = async () => {
  const here = new URL('.', import.meta.url).pathname;
  const stat = async (f) => {
    try { const st = await Deno.stat(f); return `${st.size}:${st.mtime?.getTime() ?? 0}`; }
    catch { return '0'; }
  };
  const sim = [];
  for await (const e of Deno.readDir(`${here}../lib`)) {
    if (e.isFile && e.name.endsWith('.js') && !e.name.endsWith('_test.js')) sim.push(e.name);
  }
  sim.sort();
  const simParts = [];
  for (const f of sim) simParts.push(`${f}=${await stat(`${here}../lib/${f}`)}`);
  simParts.push(`serve=${await stat(`${here}serve-world.js`)}`);
  const hash = (x) => {
    let h = 5381;
    for (let i = 0; i < x.length; i++) h = ((h * 33) ^ x.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };
  return {
    simVersion: hash(simParts.join('|')),
    pageVersion: hash(await stat(`${here}../world.html`)),
  };
};
// Captured at startup: this is what the RUNNING process actually loaded.
const RUNNING = await codeStamp();
// Identifies THIS process. A restarting server answers /status for a few hundred
// milliseconds after it has agreed to die, so a client polling "is it back yet"
// sees the outgoing process and rebuilds against something about to exit. Waiting
// for this value to CHANGE is the only reliable "it is a new server now".
const BOOT_ID = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
console.log(`code: sim ${RUNNING.simVersion}, page ${RUNNING.pageVersion}`);

// Derived, not configured. See the note on the argument block.
const CELL_BUDGET = args.cells;
// NOT a distance. This is how many contiguous organism ISLANDS the brain
// arena is divided into — the thing historically called 'beasts'. The world's
// spatial extent is BOUND, below, in world units.
const ARENA_ISLANDS = Math.max(16, Math.ceil(CELL_BUDGET / args.maxCells));
const BODY_SLOTS  = Math.max(64, Math.ceil(CELL_BUDGET / 8));
// About 35% of slots are live in practice; size the world so THAT sits at the
// areal density the physics was tuned against, rather than sizing for slots
// that are mostly empty.
const LIVE_FRAC = 0.35;
const BOUND = args.bound ||
  Math.max(40, Math.sqrt(CELL_BUDGET * LIVE_FRAC / 0.5) / 2);

console.log(`universe: ${CELL_BUDGET.toLocaleString()} cell budget, ` +
  `${BODY_SLOTS.toLocaleString()} body slots, bodies up to ${args.maxCells} cells, ` +
  `bound ${BOUND.toFixed(0)} (derived)`);
const built = buildBodies({
  beasts: ARENA_ISLANDS, cells: args.founderCells, bound: BOUND, seed: (Date.now() & 0xffff) || 7,
  // Sized for the bodies DEVELOPMENT can reach, not for the founder rings.
  // A genome decides its own body size, so the arena has to hold the largest
  // one evolution might specify; sized for 12 it fragments and births start
  // failing for lack of contiguous room while every other number looks healthy.
  maxCells: args.maxCells,
  bodySlots: BODY_SLOTS,
});
const brains = await BrainArenaGPU.create(built.arena);
const world = new WorldGPU(brains, built.cells, {
  bound: BOUND,
  ...(args.drift ? { driftX: 0.06, driftY: 0.037, morphRate: 0.0075 } : {}),
});
const LINEAGE = new Lineage({ path: `${new URL('..', import.meta.url).pathname}runs/lineage.csv` });
const evo = new Evolver({
  arena: built.arena, world, cells: built.cells, lineageLog: LINEAGE,
  seed: 5, birthEnergy: 18, deathEnergy: 0, maxCells: args.maxCells,
  devoVersion: args.devo,
});
console.log(`developmental encoding: ${evo.devoName} (egg extent ${evo.eggExtent})`);
// ONE ROOT. Founder 0 is cellzero and makes itself; the rest are its children,
// seeded rather than grown. Exactly one cell in this world's history was
// self-created, which is the claim; a populated start is a statement about
// where the recording begins, not about anything creating itself.
//
// --founders 1 is a literal single-cell origin. It currently STALLS: the pair
// settles at mean energy 8.3 against a birth threshold of 18 and never divides
// again. Measured, not assumed, and the reason this is not the default.
//
// The founder is a hand-built ring rather than a developed body, which is the
// one honest wart here: a 12-cell ring is not a plausible zygote. It is the
// world's boundary condition, like the sun, and it is marked as such in the
// lineage rather than pretended away.
const startCount = Math.max(1, Math.floor(args.founders ?? 1));
for (let o = startCount; o < BODY_SLOTS; o++) evo.cull(o);
for (let o = 0; o < startCount; o++) await evo.seedOrigin(o, 0);
evo.founders = evo.alive();
console.log(`founders ${evo.alive()}, arena ${built.arena.N} neuron slots`);

const SNAP = args.snapshot || `${new URL('..', import.meta.url).pathname}runs/world.snapshot`;

const N = built.meta.nCells;

/* --------------------------------------------------------------- persistence */

/**
 * The whole world to one file, and back.
 *
 * Without this a restart loses the run — 1.3 million steps of evolution gone
 * because a process was restarted. It also makes WHERE the simulation runs
 * independent of where it is watched: the same file can be resumed by this
 * server, inspected by a script, or picked up by a native build later. That
 * decoupling is the point, more than the crash-safety.
 *
 * The brain arena already knows how to serialise itself (lib/brainarena.js).
 * What it does not carry is the world: positions, velocities, energy, bonds,
 * cell types and the lineage bookkeeping. Those go alongside it.
 */
// 'WRN2'. BUMPED when cmeta.x stopped being a bare cell type and became a
// packed (type | contractility<<8 | grippiness<<16). A WRN1 snapshot loaded
// into this build would decode every cell as having zero contractility —
// bodies that look right, brains that run, and not one muscle in the world.
// Silent wrong beats loud wrong every time, so refuse it by magic instead.
const SNAP_MAGIC = 0x324e5257;                  // 'WRN2'
const SNAP_MAGIC_V1 = 0x314e5257;               // 'WRN1' — pre-packed cmeta

async function saveSnapshot(path) {
  const { pos, energy } = await world.readCells();
  await brains.readState(built.arena);          // pull GPU state into the arena
  const arenaBlob = built.arena.snapshot();
  const c = built.cells;

  const parts = [
    ['pos', pos], ['energy', energy],
    ['ctype', c.ctype], ['cslot', c.cslot], ['body', c.body], ['bodySize', c.bodySize],
    ['bond', c.bond], ['brest', c.brest],
    ['uid', evo.uid], ['parentUid', evo.parentUid], ['generation', evo.generation],
    ['lineage', evo.lineage], ['birthStep', evo.birthStep],
  ];
  const head = new ArrayBuffer(64);
  const hv = new DataView(head);
  hv.setUint32(0, SNAP_MAGIC, true);
  hv.setUint32(4, 1, true);                     // version
  hv.setUint32(8, N, true);
  hv.setUint32(12, c.bondK, true);
  hv.setUint32(16, steps, true);
  hv.setFloat32(20, BOUND, true);
  hv.setUint32(24, evo.births, true);
  hv.setUint32(28, evo.deaths, true);
  hv.setUint32(32, evo.nextUid, true);
  hv.setUint32(36, arenaBlob.byteLength, true);
  hv.setUint32(40, ARENA_ISLANDS, true);
  hv.setUint32(44, args.founderCells, true);

  const bytes = [new Uint8Array(head), arenaBlob];
  for (const [, a] of parts) bytes.push(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  let total = 0; for (const b of bytes) total += b.byteLength;
  const out = new Uint8Array(total);
  let at = 0; for (const b of bytes) { out.set(b, at); at += b.byteLength; }

  // Write beside the target then rename, so a crash mid-write cannot leave a
  // half-file where a good one used to be.
  await Deno.writeFile(path + '.tmp', out);
  await Deno.rename(path + '.tmp', path);
  // A ROLLING RING beside the live file. Overwriting one snapshot means the only
  // state you can ever go back to is the most recent — and the most recent is
  // exactly what you have when you notice something has gone wrong.
  try {
    const ring = `${path}.${String(Math.floor(steps / 1e5) % 8)}.ring`;
    await Deno.writeFile(ring, out);
  } catch { /* ring is a convenience, never fatal */ }
  return { bytes: total, steps };
}

async function loadSnapshot(path) {
  const raw = await Deno.readFile(path);
  const hv = new DataView(raw.buffer, raw.byteOffset);
  const magic = hv.getUint32(0, true);
  if (magic === SNAP_MAGIC_V1) throw new Error(
    'this snapshot predates packed cell metadata (WRN1). Resuming it would give ' +
    'every cell zero contractility — a world of bodies that cannot contract a ' +
    'single bond, with nothing in the logs to say so. Start a fresh world.');
  if (magic !== SNAP_MAGIC) throw new Error('not a world snapshot');
  const n = hv.getUint32(8, true);
  if (n !== N) throw new Error(`snapshot has ${n} cell slots, this world has ${N} — start with the same --beasts/--cells`);
  const arenaLen = hv.getUint32(36, true);

  const { BrainArena } = await import('../lib/brainarena.js');
  const restored = BrainArena.restore(raw.subarray(64, 64 + arenaLen));
  built.arena.state.set(restored.state); built.arena.bias.set(restored.bias);
  built.arena.invTau.set(restored.invTau); built.arena.act.set(restored.act);
  built.arena.esrc.set(restored.esrc); built.arena.ew.set(restored.ew);
  built.arena.off.set(restored.off); built.arena.cnt.set(restored.cnt);
  built.arena.alive.set(restored.alive); built.arena.cell.set(restored.cell);
  built.arena.free = restored.free.map(h => [h[0], h[1]]);

  let at = 64 + arenaLen;
  const take = (arr) => {
    new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
      .set(raw.subarray(at, at + arr.byteLength));
    at += arr.byteLength;
  };
  const c = built.cells;
  const pos = new Float32Array(N * 2), energy = new Float32Array(N);
  take(pos); take(energy);
  take(c.ctype); take(c.cslot); take(c.body); take(c.bodySize);
  take(c.bond); take(c.brest);
  take(evo.uid); take(evo.parentUid); take(evo.generation);
  take(evo.lineage); take(evo.birthStep);

  steps = hv.getUint32(16, true);
  evo.births = hv.getUint32(24, true);
  evo.deaths = hv.getUint32(28, true);
  evo.nextUid = hv.getUint32(32, true);

  // Push everything back to the GPU.
  const vel = new Float32Array(N * 4);
  const meta = new Int32Array(N * 4);
  for (let i = 0; i < N; i++) {
    meta[i * 4] = c.ctype[i]; meta[i * 4 + 1] = c.cslot[i];
    meta[i * 4 + 2] = c.body[i]; meta[i * 4 + 3] = c.bodySize[i];
    c.px[i] = pos[i * 2]; c.py[i] = pos[i * 2 + 1];
  }
  world.writeCellRange(0, N, { pos, vel, meta, bond: c.bond, brest: c.brest, energy });
  brains.writeState(built.arena);
  return { steps, alive: evo.alive() };
}
let last = { alive: evo.alive(), born: 0, died: 0, meanEnergy: 0, maxGeneration: 0, lineages: evo.alive() };
let steps = 0, sinceTick = 0, ticking = false, running = true;

/* ------------------------------------------------------------- the sim loop */

// Runs independently of any watcher. Nobody has to be looking for the world to
// continue, which is the entire point of moving it out of the tab.
if (args.resume) {
  try {
    const r = await loadSnapshot(SNAP);
    console.log(`resumed from ${SNAP}: step ${r.steps.toLocaleString()}, ${r.alive} bodies`);
  } catch (e) {
    console.log(`could not resume (${e.message}); starting fresh`);
  }
}

let paused = false;

/**
 * A METRICS LOG, so diagnosing a run does not mean pasting screenshots.
 *
 * A screenshot says "it looks static" and costs a great deal to transmit; one
 * JSONL line says alive 157, muscle 0.7%, median body 6 cells, and costs almost
 * nothing. The whole history of a run is then a file to read the tail of, rather
 * than something reconstructed from memory and impressions.
 *
 * Cheap enough to keep always: ~200 bytes per sample, so an overnight run at one
 * sample per 5,000 steps is well under a megabyte.
 */
const METRICS = `${new URL('..', import.meta.url).pathname}runs/metrics.jsonl`;
let sinceMetric = 0;
const METRIC_EVERY = args.metricEvery ?? 5000;

async function logMetrics() {
  try {
    const A = built.arena, C = built.cells;
    const census = [0, 0, 0, 0];
    let liveCells = 0;
    const sizes = [];
    for (let o = 0; o < A.P; o++) {
      if (!A.alive[o]) continue;
      sizes.push(A.cnt[o]);
      for (let i = A.off[o]; i < A.off[o] + A.cnt[o]; i++) {
        const t = C.ctype[i];
        if (t >= 0 && t < 4) { census[t]++; liveCells++; }
      }
    }
    sizes.sort((a, b) => a - b);
    const rec = {
      t: new Date().toISOString(), step: steps,
      alive: last.alive, births: evo.births, deaths: evo.deaths,
      gen: last.maxGeneration, lineages: last.lineages,
      meanEnergy: +last.meanEnergy.toFixed(2),
      liveCells,
      bodyMin: sizes[0] ?? 0,
      bodyMed: sizes[sizes.length >> 1] ?? 0,
      bodyMax: sizes[sizes.length - 1] ?? 0,
      neuron: census[0], sensor: census[1], muscle: census[2], anchor: census[3],
      musclePct: liveCells ? +(100 * census[2] / liveCells).toFixed(2) : 0,
      spf: args.spf, bound: +BOUND.toFixed(1),
      crowdK: world.params.regrowCrowdK, moteRegrow: world.params.moteRegrow,
      flowStr: world.params.flowStr, contract: world.params.contract,
      // Failed eggs are a Dev 2.0 statistic that did not exist before: a genome
      // can now specify a body that development never finishes, and the parent
      // has spent the yolk regardless. A run where this climbs is a run where
      // reproduction is quietly failing, which no other field here would show.
      devo: evo.devoVersion, failedEggs: evo.failedEggs,
      simVersion: RUNNING.simVersion,
    };
    await Deno.writeTextFile(METRICS, JSON.stringify(rec) + '\n', { append: true });
  } catch (e) { console.error('metrics failed:', e.message); }
}

/**
 * WATCH MY OWN CODE. Deno loads lib/*.js once at startup, so a running server
 * silently keeps executing the physics it booted with however many times the
 * files change underneath it. That is invisible from the outside and has cost
 * real confusion — measurements taken against code that had already been fixed.
 *
 * Checked on a slow timer; it logs loudly and /status reports it, so both the
 * terminal and the browser can say "this process is behind". Deliberately does
 * NOT auto-restart: dropping a long run without being asked is worse than
 * running slightly old physics, and the Server panel makes restarting one click.
 */
let staleSince = 0;
setInterval(async () => {
  try {
    const now = await codeStamp();
    if (now.simVersion !== RUNNING.simVersion) {
      if (!staleSince) {
        staleSince = Date.now();
        console.warn(
          `\n*** PHYSICS ON DISK HAS CHANGED ***\n` +
          `    running sim ${RUNNING.simVersion}, on disk ${now.simVersion}\n` +
          `    this process is still executing the code it started with.\n` +
          `    restart to pick it up:  ./tools/world restart   (or Server -> restart in the UI)\n`);
      }
    } else if (staleSince) {
      staleSince = 0;
      console.log('physics on disk matches this process again');
    }
  } catch { /* never fatal */ }
}, 15000);

/**
 * HIGH-RATE BRAIN TRACE for one animal at a time.
 *
 * The scope used to take one sample per /frame, and a frame is ~2.2MB and 1.8s
 * of world time apart — so it sampled at 0.56 Hz while neurons with tau 0.018s
 * run near 9 Hz. Undersampled by about thirty-two times: the "blocky" traces
 * were a fast signal seen through a slow shutter, and any gait would have been
 * aliased into noise long before it was visible.
 *
 * Recorded HERE, where the brain is, every few steps, for the one animal being
 * inspected. 64 neurons x 4 bytes is tiny next to a frame, so the sampling rate
 * is set by what the dynamics need rather than by what the link can carry.
 */
const TRACE_ROWS = 64;
const TRACE_COLS = 4096;
const trace = {
  uid: -1, slot: -1, cells: [],
  buf: new Float32Array(TRACE_ROWS * TRACE_COLS),
  step: new Int32Array(TRACE_COLS),
  // SAMPLE EVERY STEP. At everyN 5 the scope sampled at 13 Hz, and neurons
  // measured flipping at 7-19 Hz, so the traces were aliased — the jagged
  // lines were the SCOPE, not the brain. This project has already published
  // one retraction for a scope that aliased by 32x. Sampling every step gives
  // 66 Hz, comfortably above the fastest neuron the genome can specify.
  //
  // The cost is one act readback per step, and it is paid ONLY while somebody
  // has a trace attached (trace.uid >= 0), which is the loop's own guard.
  head: 0, filled: 0, everyN: 1, since: 0,
};

function traceAttach(uid) {
  if (uid === trace.uid) return;
  trace.uid = uid; trace.head = 0; trace.filled = 0; trace.cells = []; trace.slot = -1;
  if (uid < 0) return;
  for (let o = 0; o < built.arena.P; o++) {
    if (built.arena.alive[o] && evo.uid[o] === uid) { trace.slot = o; break; }
  }
  if (trace.slot < 0) { trace.uid = -1; return; }
  const off = built.arena.off[trace.slot], n = Math.min(built.arena.cnt[trace.slot], TRACE_ROWS);
  for (let i = 0; i < n; i++) trace.cells.push(off + i);
}

async function traceSample() {
  if (trace.uid < 0 || !trace.cells.length) return;
  // Cheap because it is ONE readback of the act buffer, already needed for
  // frames; at everyN=5 this is ~13 Hz of world time, comfortably above Nyquist
  // for the fastest neurons the genome can specify.
  // ONE ORGANISM'S SLICE, not the whole arena. See readStateRange: this used
  // to copy 800 KB every step and the world ran at 23 steps/s in visible
  // bursts because of it.
  const from = trace.cells[0], count = trace.cells.length;
  const { act } = await brains.readStateRange(from, count);
  const col = trace.head * TRACE_ROWS;
  for (let r = 0; r < TRACE_ROWS; r++) {
    const i = trace.cells[r];
    trace.buf[col + r] = (i !== undefined && built.cells.ctype[i] >= 0)
      ? act[i - from] : NaN;
  }
  trace.step[trace.head] = steps;
  trace.head = (trace.head + 1) % TRACE_COLS;
  trace.filled = Math.min(trace.filled + 1, TRACE_COLS);
}

let lastSave = Date.now();
const SAVE_EVERY_MS = (args.saveEvery ?? 120) * 1000;

(async function loop() {
  while (running) {
    if (paused) { await new Promise(r => setTimeout(r, 100)); continue; }
    world.step(args.spf);
    steps += args.spf; sinceTick += args.spf;

    trace.since += args.spf;
    if (trace.uid >= 0 && trace.since >= trace.everyN && !ticking) {
      trace.since = 0; await traceSample();
    }

    sinceMetric += args.spf;
    if (sinceMetric >= METRIC_EVERY && !ticking) {
      sinceMetric = 0; await logMetrics();
      // The tree of life is only durable once written. Flush on the metrics
      // cadence so a crash costs seconds of ancestry rather than all of it.
      LINEAGE.flush();
    }

    if (sinceTick >= args.tick && !ticking) {
      sinceTick = 0; ticking = true;
      try { last = await evo.tick(steps); } catch (e) { console.error('tick failed:', e.message); }
      ticking = false;
    }
    if (SAVE_EVERY_MS > 0 && Date.now() - lastSave > SAVE_EVERY_MS && !ticking) {
      lastSave = Date.now();
      try {
        const r = await saveSnapshot(SNAP);
        console.log(`saved ${(r.bytes / 1048576).toFixed(1)} MB at step ${r.steps.toLocaleString()}`);
      } catch (e) { console.error('snapshot failed:', e.message); }
    }
    // Yield so the HTTP handler gets a turn; without this the loop starves the
    // server and every frame request times out.
    await new Promise(r => setTimeout(r, 0));
  }
})();

/* ----------------------------------------------------------------- framing */

const FRAME_MAGIC = 0x324d5257;   // 'RWM2' — layout changed to live-cells-only         // 'WRM1'
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

  // LIVE CELLS ONLY.
  //
  // The frame carried every arena slot — 72,000 of them — while typically ~9,000
  // are alive. 87% of a 2.2MB payload was dead space, and that payload is what
  // made a frame take 0.7s to build and 1.8s of world time to arrive, which in
  // turn aliased the brain trace by thirty-two times. Sending an index with each
  // live cell costs 4 bytes and removes seven eighths of the message.
  const liveIdx = [];
  for (let i = 0; i < N; i++) if (built.cells.ctype[i] >= 0) liveIdx.push(i);
  const L = liveIdx.length;
  // idx(4) + pos(8) + act(4) + type(4) + energy(4) + uid(4) per live cell.
  // Sized for five of those six once, which threw only when the bond pairs
  // overran the end — an error about a typed array length, nowhere near the
  // arithmetic that caused it.
  const PER = 4 + 8 + 4 + 4 + 4 + 4;
  const buf = new ArrayBuffer(HEAD + 4 + L * PER + 4 + P32.byteLength);
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
  new DataView(buf).setUint32(at, L, true); at += 4;
  new Int32Array(buf, at, L).set(Int32Array.from(liveIdx)); at += L * 4;
  {
    const p2 = new Float32Array(buf, at, L * 2);
    for (let k = 0; k < L; k++) { const i = liveIdx[k]; p2[k * 2] = pos[i * 2]; p2[k * 2 + 1] = pos[i * 2 + 1]; }
    at += L * 8;
  }
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
  {
    const a2 = new Float32Array(buf, at, L);
    for (let k = 0; k < L; k++) a2[k] = cellAct[liveIdx[k]];
    at += L * 4;
    const t2 = new Int32Array(buf, at, L);
    for (let k = 0; k < L; k++) t2[k] = cellType[liveIdx[k]];
    at += L * 4;
    const e2 = new Float32Array(buf, at, L);
    for (let k = 0; k < L; k++) e2[k] = energy[liveIdx[k]];
    at += L * 4;
  }

  // ASSEMBLY IDENTITY — which animal a cell belongs to, stable across everything.
  //
  // Arena SLOTS are recycled: when a body dies its range is reused, so a cell
  // index means "whatever occupies these slots now" and nothing more. Tracking a
  // cell by index across time therefore teleports it across the world the moment
  // its slot is reused, which silently wrecked a displacement measurement — the
  // apparent motion was mostly recycling.
  //
  // The uid is minted once per BIRTH EVENT and never reused, so it survives slot
  // recycling, and it is carried by the cell rather than derived from position,
  // so it survives a body being torn in half: both halves still name the same
  // animal. Genome identity would not do this — siblings and twins share a
  // genome and are different animals.
  {
    const u2 = new Int32Array(buf, at, L);
    for (let k = 0; k < L; k++) {
      const i = liveIdx[k];
      const b = built.cells.body ? built.cells.body[i] : -1;
      u2[k] = b >= 0 ? evo.uid[b] : -1;
    }
    at += L * 4;
  }
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
const server = Deno.serve({ port: args.port, hostname: args.host }, async (req) => {
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

  // The genomes of living organisms, so a specimen can be inspected, drawn or
  // re-developed outside the run. This is the dataset development actually
  // produces — positions and bonds are only what it produced THIS time — and
  // without it the run is unreadable from outside.
  // One animal's genome by uid, with the labels needed to read it. The genetics
  // has never been visible in the UI at all — you could watch bodies without ever
  // seeing what specifies them.
  // Subscribe to, and read, the high-rate trace. Binary: it is numbers.
  if (path === '/trace') {
    const uid = Number(url.searchParams.get('uid') ?? -1);
    const want = Math.min(TRACE_COLS, Number(url.searchParams.get('n') ?? 600) || 600);
    traceAttach(uid);
    if (trace.uid < 0) {
      return new Response(JSON.stringify({ ok: false, error: 'no such living animal' }),
        { status: 404, headers: { 'content-type': 'application/json' } });
    }
    const rows = trace.cells.length;
    const cols = Math.min(want, trace.filled);
    const types = new Int32Array(rows);
    for (let r = 0; r < rows; r++) types[r] = built.cells.ctype[trace.cells[r]];
    const buf = new ArrayBuffer(16 + rows * 4 + cols * 4 + cols * rows * 4);
    const dv2 = new DataView(buf);
    dv2.setUint32(0, uid, true); dv2.setUint32(4, rows, true);
    dv2.setUint32(8, cols, true); dv2.setFloat32(12, world.params.dt, true);
    let at2 = 16;
    new Int32Array(buf, at2, rows).set(types); at2 += rows * 4;
    const stepsOut = new Int32Array(buf, at2, cols); at2 += cols * 4;
    const vals = new Float32Array(buf, at2, cols * rows);
    for (let c = 0; c < cols; c++) {
      const src = ((trace.head - cols + c) % TRACE_COLS + TRACE_COLS) % TRACE_COLS;
      stepsOut[c] = trace.step[src];
      for (let r = 0; r < rows; r++) vals[c * rows + r] = trace.buf[src * TRACE_ROWS + r];
    }
    return new Response(buf, {
      headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' },
    });
  }

  if (path === '/genome') {
    const want = Number(url.searchParams.get('uid'));
    let slot = -1;
    for (let o = 0; o < built.arena.P; o++) {
      if (built.arena.alive[o] && evo.uid[o] === want) { slot = o; break; }
    }
    if (slot < 0 || !evo.genome[slot]) {
      return new Response(JSON.stringify({ ok: false, error: 'no such living animal' }),
        { status: 404, headers: { 'content-type': 'application/json' } });
    }
    // DESCRIBE THE ENCODING THAT ACTUALLY RAN. This imported devo.js's PROPS and
    // BASIS and handed them back for a devo2 genome, so the viewer drew a grid of
    // Dev 1.0 basis functions — ap, dv, |dv|, sin2ap — over numbers that mean
    // nothing of the sort. Headings for an encoding the world stopped using.
    const D = evo.devoVersion === 1
      ? await import('../lib/devo.js') : await import('../lib/devo2.js');
    return new Response(JSON.stringify({
      ok: true, uid: want, slot,
      generation: evo.generation[slot], lineage: evo.lineage[slot],
      cells: built.arena.cnt[slot],
      encoding: evo.devoName,
      ...(evo.devoVersion === 1 ? {
        props: D.PROPS, basis: D.BASIS.map(b => b[0]), nb: D.NB,
        synBasis: D.SYN_BASIS.map(b => b[0]), synOff: D.SYN_OFF, nsyn: D.NSYN,
      } : {
        // A regulatory network, not a basis expansion: per gene, K regulators
        // (source gene + weight), a bias, a decay and a diffusion rate.
        grn: {
          nGene: D.NGENE, k: D.K, stride: D.GENE_STRIDE,
          offSrc: D.OFF_SRC, offW: D.OFF_W, offBias: D.OFF_BIAS,
          offDecay: D.OFF_DECAY, offDiff: D.OFF_DIFF,
          outBase: D.OUT_BASE, outputs: D.OUTPUTS,
          maternal: ['AP', 'DV', 'RAD', 'NOISE', 'CROWD'],
          synOff: D.SYN_OFF, nsyn: D.NSYN,
          // The synapse basis is SHARED with devo.js — devo2 imports it rather
          // than restating it — so the viewer can name those columns either way.
          synBasis: D.SYN_BASIS.map(b => b[0]),
        },
      }),
      g: Array.from(evo.genome[slot]),
    }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }

  if (path === '/genomes') {
    const want = Math.min(64, Number(url.searchParams.get('n') ?? 8) || 8);
    const rows = [];
    for (let o = 0; o < built.arena.P && rows.length < want; o++) {
      if (!built.arena.alive[o] || !evo.genome[o]) continue;
      rows.push({
        slot: o,
        uid: evo.uid[o],
        generation: evo.generation[o],
        lineage: evo.lineage[o],
        cells: built.arena.cnt[o],
        g: Array.from(evo.genome[o]),
      });
    }
    // Deepest first: the interesting specimens are the ones with ancestry.
    rows.sort((a, b) => b.generation - a.generation);
    return new Response(JSON.stringify({ steps, count: rows.length, rows }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  // Standing crop. The background field in the viewer is FERTILITY — where crop
  // regrows — and since motes landed that is no longer where food IS. A creature
  // grazing a patch to nothing leaves the fertility field completely unchanged,
  // so the most important thing happening in the world was invisible.
  if (path === '/motes') {
    const m = await world.readMotes();
    const n = m.stock.length;
    const buf = new ArrayBuffer(8 + n * 12);
    new Uint32Array(buf, 0, 2).set([n, 0]);
    const f = new Float32Array(buf, 8);
    for (let i = 0; i < n; i++) {
      f[i * 3] = m.pos[i * 2];
      f[i * 3 + 1] = m.pos[i * 2 + 1];
      f[i * 3 + 2] = m.stock[i];
    }
    return new Response(buf, {
      headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' },
    });
  }

  /**
   * Control the world from the browser, so the run can be managed from a phone
   * without a shell on this machine.
   *
   * Deliberately a FIXED SET OF NAMED ACTIONS. Nothing here takes a command, a
   * path, or anything else that could be turned into arbitrary execution: this
   * port is reachable by anything on the tailnet, and "restart yourself picking
   * up new code" is already the most powerful verb it should ever have.
   */
  if (path === '/control' && req.method === 'POST') {
    // Read the body ONCE. A request body is a stream: consuming it for `action`
    // leaves nothing for anyone else, and req.clone() after the fact clones an
    // already-drained stream — which silently made every parameter arrive as
    // undefined while the action itself worked fine.
    let body = {};
    try { body = await req.json(); } catch { /* empty body */ }
    const action = body.action ?? '';
    const ok = (extra = {}) =>
      new Response(JSON.stringify({ ok: true, action, steps, ...extra }),
        { headers: { 'content-type': 'application/json' } });

    if (action === 'pause')  { paused = true;  return ok({ paused }); }
    // How many physics steps the server takes per loop iteration — the knob that
    // decides how fast the world runs in wall-clock, which matters because a good
    // gait covers two body lengths in ~30,000 steps and that is minutes of
    // watching at the default.
    if (action === 'speed') {
      const v = Number(body.spf);
      if (Number.isFinite(v) && v >= 1 && v <= 512) args.spf = Math.round(v);
      return ok({ spf: args.spf });
    }
    if (action === 'resume') { paused = false; return ok({ paused }); }

    // A marked moment. The point is that "look at this" becomes a durable record
    // with numbers and a replayable snapshot, instead of a screenshot pasted into
    // a conversation and lost.
    if (action === 'flag') {
      const rec = {
        t: new Date().toISOString(), step: steps, note: String(body.note ?? '').slice(0, 500),
        uid: Number(body.uid ?? -1),
        alive: last.alive, gen: last.maxGeneration, lineages: last.lineages,
        meanEnergy: +last.meanEnergy.toFixed(2),
        params: {
          crowdK: world.params.regrowCrowdK, moteRegrow: world.params.moteRegrow,
          brainTax: world.params.brainTax, contract: world.params.contract,
          flowStr: world.params.flowStr, gripAniso: world.params.gripAniso,
        },
        simVersion: RUNNING.simVersion, devo: evo.devoVersion,
      };
      const snap = `${new URL('..', import.meta.url).pathname}runs/flag-${steps}.snapshot`;
      try { const r = await saveSnapshot(snap); rec.snapshot = snap; rec.bytes = r.bytes; }
      catch (e) { rec.snapshotError = e.message; }
      await Deno.writeTextFile(
        `${new URL('..', import.meta.url).pathname}runs/observations.jsonl`,
        JSON.stringify(rec) + '\n', { append: true });
      console.log(`FLAGGED at step ${steps}: ${rec.note}`);
      return ok({ flagged: true, snapshot: rec.snapshot });
    }

    // INTELLIGENT DESIGN. Scatter copies of one creature's genome across the
    // world, optionally mutated. Logged as an intervention, because it is one.
    if (action === 'implant') {
      const want = Number(body.uid ?? -1);
      let slot = -1;
      for (let o = 0; o < built.arena.P; o++) {
        if (built.arena.alive[o] && evo.uid[o] === want) { slot = o; break; }
      }
      if (slot < 0) {
        return new Response(JSON.stringify({ ok: false, error: `no living creature #${want}` }),
          { status: 404, headers: { 'content-type': 'application/json' } });
      }
      const copies = Math.max(1, Math.min(400, Math.round(Number(body.copies ?? 100))));
      const mutate = Math.max(0, Math.min(6, Number(body.mutate ?? 1)));
      const r = evo.implant(slot, { copies, mutate, step: steps });
      // ON THE RECORD. A run that has been intervened in is not a clean
      // observation of evolution, and the only thing that keeps that from being
      // forgotten a week later is that it is written down at the time.
      try {
        await Deno.writeTextFile(
          `${new URL('..', import.meta.url).pathname}runs/observations.jsonl`,
          JSON.stringify({
            t: new Date().toISOString(), kind: 'intervention', what: 'implant',
            step: steps, uid: want, copies, mutate,
            made: r.made, noRoom: r.noRoom, failedEgg: r.failedEgg,
            mintedEnergy: r.mintedEnergy,
            note: 'hand of god: genome copied into the world with yolk nobody paid for',
          }) + '\n', { append: true });
      } catch (e) { r.logError = e.message; }
      console.log(`IMPLANT #${want} x${copies} (mutate ${mutate}) -> ${r.made} placed at step ${steps}`);
      return ok(r);
    }

    if (action === 'save') {
      const r = await saveSnapshot(SNAP);
      return ok({ saved: SNAP, bytes: r.bytes });
    }

    // Both of these replace this process, which is how new code gets picked up
    // without a shell. `restart` saves first and comes back on the same world;
    // `reseed` abandons it and starts a fresh one.
    if (action === 'restart' || action === 'reseed') {
      const keep = action === 'restart';
      if (keep) { try { await saveSnapshot(SNAP); } catch (e) { console.error('save failed:', e.message); } }
      // Respond BEFORE exiting, or the browser sees a dropped connection and
      // cannot tell "restarting" from "crashed".
      queueMicrotask(async () => {
        await new Promise(r => setTimeout(r, 250));
        const script = new URL(import.meta.url).pathname;
        const rest = Deno.args.filter(a => a !== '--resume');
        const next = keep ? [...rest, '--resume'] : rest;
        console.log(`${action}: re-exec with ${next.join(' ')}`);
        try { await server.shutdown(); } catch { /* already closing */ }
        new Deno.Command(Deno.execPath(), {
          args: ['run', '-A', script, ...next],
          cwd: Deno.cwd(), stdout: 'inherit', stderr: 'inherit',
        }).spawn().unref();
        setTimeout(() => Deno.exit(0), 150);
      });
      return ok({ restarting: true, keepWorld: keep });
    }

    return new Response(JSON.stringify({ ok: false, error: `unknown action ${action}` }),
      { status: 400, headers: { 'content-type': 'application/json' } });
  }

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
  if (path === '/save' && req.method === 'POST') {
    const r = await saveSnapshot(SNAP);
    return new Response(JSON.stringify({ saved: SNAP, ...r }), {
      headers: { 'content-type': 'application/json' },
    });
  }
  if (path === '/status') {
    return new Response(JSON.stringify({
      steps, bound: BOUND, cells: N, neurons: built.arena.N,
      // The viewer builds its buffers from these, so it does not have to be
      // configured to match by hand — a mismatch is not a user error, it is
      // just a page that has not been told the shape yet.
      // 'beasts' is the ARENA WIDTH the viewer must build buffers to match,
      // not a population target — the population is whatever energy allows,
      // and bodySlots is deliberately far larger.
      beasts: ARENA_ISLANDS, cellsPerBeast: args.founderCells,
      cellBudget: CELL_BUDGET, bodySlots: BODY_SLOTS,
      // The viewer must be TOLD the arena width, not left to guess it. It had a
      // hardcoded maxCells of 40 while the server moved to 60, so every frame
      // failed the size check and the page showed "reload to resync" — which
      // reloading could not fix, because the guess was wrong every time.
      maxCells: args.maxCells, nCells: built.meta.nCells, bound: BOUND,
      nMotes: world.params.nMotes, paused, spf: args.spf,
      // Non-zero means this world has been meddled with; see evolve.implant.
      interventions: evo.interventions ?? 0, mintedEnergy: evo.mintedEnergy ?? 0,
      // What this process is RUNNING vs what is on disk NOW. If simVersion
      // differs the physics has changed and needs a restart; if pageVersion
      // differs the viewer has changed and needs a reload.
      bootId: BOOT_ID,
      simVersion: RUNNING.simVersion, pageVersion: RUNNING.pageVersion,
      // Which developmental encoding grew these bodies. A run is unreadable
      // later without it: the same world parameters mean different animals
      // under a positional readout than under a GRN.
      devo: evo.devoVersion, devoName: evo.devoName, eggExtent: evo.eggExtent,
      trace: { uid: trace.uid, slot: trace.slot, cells: trace.cells.length,
               filled: trace.filled, since: trace.since, everyN: trace.everyN },
      simStaleSince: staleSince || null,
      onDisk: await codeStamp(),
      // The resource field is what creatures chase and it drifts and morphs.
      // The viewer needs its parameters to draw it; without them it was showing
      // only the flow, which is the least photogenic layer in the world.
      resScale: world.params.resScale, resSeed: world.params.resSeed,
      driftX: world.params.driftX, driftY: world.params.driftY,
      morphRate: world.params.morphRate, dt: world.params.dt,
      flowScale: world.params.flowScale, flowStr: world.params.flowStr,
      worldSeed: world.params.seed,
      // Geography, so the viewer draws THIS world's coastline rather than a
      // default one. A viewer guessing the seed would render a plausible island
      // in the wrong place, which is worse than rendering nothing.
      heightScale: world.params.heightScale, heightSeed: world.params.heightSeed,
      mudScale: world.params.mudScale, mudSeed: world.params.mudSeed,
      lowLush: world.params.lowLush, gravity: world.params.gravity,
      warpAmt: world.params.warpAmt, ridgeAmt: world.params.ridgeAmt,
      mudBank: world.params.mudBank, flowTerrain: world.params.flowTerrain,
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
