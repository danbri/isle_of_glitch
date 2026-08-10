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
import { encodeWorld, decodeHeader, decodeBody } from '../lib/snapshot.js';

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
    devo: 2, founders: 300, maxAge: 25000, ageSpread: 0.35,
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

/**
 * THE REGIME LOG — where the physics changed under a world that kept running.
 *
 * `--resume` restores cells, genomes, energies and lineages, and the code that
 * moves them is whatever is on disk at boot. So a long-lived world's history is
 * a sequence of different physics with no record of the boundaries: a body at
 * step 5.6M evolved under rules that a body at step 2M never met, and nothing
 * says where one ended.
 *
 * That is acceptable while the world is being balanced and end-to-end progress
 * is the question — it is not acceptable silently. Every boot appends the step
 * it resumed at, the simVersion it is running, and the full parameter set. The
 * history then reads as a list of regimes rather than one undifferentiated run,
 * and any measurement can be checked against which regimes it spans.
 *
 * runs/archive/ already stamps each manifest with simVersion and all 82
 * parameters, so an archived genome knows its own physics. This supplies the
 * boundaries between them.
 */
async function logRegime() {
  try {
    const rec = {
      t: new Date().toISOString(), event: 'boot',
      step: steps, simVersion: RUNNING.simVersion, bootId: BOOT_ID,
      resumed: Deno.args.includes('--resume'),
      args: { cells: args.cells, bound: args.bound, maxAge: args.maxAge,
              ageSpread: args.ageSpread, spf: args.spf },
      params: { ...world.params },
    };
    await Deno.writeTextFile(
      `${new URL('..', import.meta.url).pathname}runs/regimes.jsonl`,
      JSON.stringify(rec) + '\n', { append: true });
    console.log(`regime logged: sim ${RUNNING.simVersion} from step ${steps.toLocaleString()}`);
  } catch (e) { console.error('regime log failed:', e.message); }
}
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
// The format lives in lib/snapshot.js so the browser can write the same bytes.
// See the note there: two implementations of one binary format drift silently.
const SNAP_MAGIC = 0x324e5257;                  // 'WRN2'
const SNAP_MAGIC_V1 = 0x314e5257;               // 'WRN1' — pre-packed cmeta

/**
 * INTERVENTIONS, RECORDED. A tune with no baseline beside it is an anecdote:
 * the world moves on its own, so "I changed X and Y went up" means nothing
 * without what Y was doing before and over how many steps. Held in memory for
 * the life of the process, which is the honest lifetime of a claim about one
 * continuous run.
 */
const EXPERIMENTS = [];

/**
 * The parameters a running world will accept, and the one place that decides.
 * Both /control tune and the experiment recorder go through here, so an
 * experiment cannot apply something tune would have refused.
 *
 * NOT tunable, deliberately: wrapY changes the world's topology, and hashCell
 * and bucketM size the spatial hash. Changing either under a running population
 * is not an intervention, it is a different world wearing the same step count.
 */
const TUNABLE = new Set([
  'flowStr', 'flowScale', 'drag', 'springK', 'contract', 'damp', 'bondDamp',
  'mudFlow', 'mudSlip', 'mudFog', 'flowDry', 'flowTerrain', 'gravity',
  'highSap', 'lowLush', 'tidalYield', 'senseTerrain', 'harvest', 'brainTax',
  'muscleCost', 'gripBase', 'gripMod', 'gripHold', 'gripAniso', 'fricK',
  'contestRate', 'toughCost', 'dietWidth', 'absorbTradeoff', 'crowdK',
  'regrowCrowdK', 'moteRegrow', 'senseOther', 'senseRange', 'compass',
  'twistK', 'vortK', 'angDrag',
  'massRef', 'densLo', 'densHi', 'mediumDens',
  'foreignReach', 'foreignPush',
  'tempPole', 'tempEq', 'tempLapse', 'tempOpt', 'tempTol', 'tempCost',
  'contactK', 'sapRate',
]);
function applyTune(params) {
  const patch = {}, rejected = [];
  for (const [k, v] of Object.entries(params ?? {})) {
    if (!TUNABLE.has(k)) { rejected.push(k); continue; }
    const n = Number(v);
    if (Number.isFinite(n)) patch[k] = n;
  }
  if (Object.keys(patch).length) world.writeParams(patch);
  return { applied: patch, rejected };
}

async function saveSnapshot(path) {
  const { pos, energy, theta } = await world.readCells();
  await brains.readState(built.arena);          // pull GPU state into the arena
  const out = encodeWorld({
    pos, energy, theta, arenaBlob: built.arena.snapshot(),
    cells: built.cells, evo, n: N, bondK: built.cells.bondK,
    steps, bound: BOUND, arenaIslands: ARENA_ISLANDS, founderCells: args.founderCells,
  });

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
  return { bytes: out.byteLength, steps };
}

async function loadSnapshot(path) {
  const raw = await Deno.readFile(path);
  const h = decodeHeader(raw);
  if (h.n !== N) {
    throw new Error(`snapshot has ${h.n} cell slots, this world has ${N} — start with the same --beasts/--cells`);
  }

  const { BrainArena } = await import('../lib/brainarena.js');
  const restored = BrainArena.restore(h.arenaBlob);
  built.arena.state.set(restored.state); built.arena.bias.set(restored.bias);
  built.arena.invTau.set(restored.invTau); built.arena.act.set(restored.act);
  built.arena.esrc.set(restored.esrc); built.arena.ew.set(restored.ew);
  built.arena.off.set(restored.off); built.arena.cnt.set(restored.cnt);
  built.arena.alive.set(restored.alive); built.arena.cell.set(restored.cell);
  built.arena.free = restored.free.map(hh => [hh[0], hh[1]]);

  const c = built.cells;
  const { pos, energy, theta, legacy } = decodeBody(raw, h.bodyOffset, c, evo, N, h.legacy ?? 0);
  if (legacy) {
    console.warn(`[resume] this snapshot is WRN${legacy}: it carries no per-cell material, ` +
      `radius or heading. Types, bonds, lineages and positions are restored; capacities ` +
      `and density come from the freshly built founders and radius defaults to 0.34. ` +
      `Treat measurements from this world as contaminated.`);
  }

  steps = h.steps;
  evo.births = h.births;
  evo.deaths = h.deaths;
  evo.nextUid = h.nextUid;

  // Push everything back to the GPU.
  const vel = new Float32Array(N * 4);
  // RESUMING USED TO STRIP EVERY CELL OF ITS MATERIAL.
  //
  // cmeta.x is a PACKED word - type in the low bits, then sense acuity,
  // contractility, grippiness and axial position - and this wrote the bare
  // ctype into it, so a resumed cell came back as a type with no capacities at
  // all. cmeta.w is packed the same way and got the bare bodySize, losing
  // density, toughness, tag and enzyme. vel.z is the cell's RADIUS and this
  // wrote a zero-filled array over it.
  //
  // Measured on a resumed world before the fix: 78.2% of 24,326 live cells had
  // radius exactly 0. A radius-0 cell has no contact, because contact tests
  // myR + otherR, and under the mass law its mass falls to the clamp floor. Most
  // of the population was a massless ghost that still ate, bonded and bred.
  //
  // It went unnoticed for so long because the CPU mirrors stayed correct: every
  // readout that reads built.cells - the frame, the archive, the analytics -
  // showed healthy material while the GPU the physics actually runs on had
  // none. The two only disagreed after a resume, and a resume looks like
  // nothing happening.
  const meta = new Int32Array(N * 4);
  for (let i = 0; i < N; i++) {
    meta[i * 4] = c.metaX ? c.metaX[i] : c.ctype[i];
    meta[i * 4 + 1] = c.cslot[i];
    meta[i * 4 + 2] = c.body[i];
    meta[i * 4 + 3] = c.metaW ? c.metaW[i] : c.bodySize[i];
    // The cell's own size, or the base radius if this world predates it. Never
    // zero: zero is not a small cell, it is a cell the physics cannot see.
    //
    // AND THE CPU MIRROR IS REPAIRED TOO, not just the upload. buildBodies
    // places beasts*cells cells - about 5,000 of a 25,020-slot arena - and sets
    // a radius only for those. A resume then marks 24,000 slots live from the
    // snapshot, and every slot the builder never touched kept rad 0 forever.
    // Repairing only the GPU copy would leave the frame, the archive and the
    // analytics all still reporting zeros, because they read this array.
    if (c.rad && !(c.rad[i] > 0)) c.rad[i] = 0.34;
    vel[i * 4 + 2] = c.rad ? c.rad[i] : 0.34;
    // The heading the world was saved with. Restoring xy and re-randomising
    // theta would silently rotate every body, and theta is the frame the
    // anisotropic traction is applied in.
    pose[i * 4] = pos[i * 2]; pose[i * 4 + 1] = pos[i * 2 + 1];
    pose[i * 4 + 2] = theta ? theta[i] : 0;
    pose[i * 4 + 3] = 0;
    c.px[i] = pos[i * 2]; c.py[i] = pos[i * 2 + 1];
  }
  // posXY, not pos: the snapshot format predates headings and stores xy only,
  // so writing it as a full pose would zero every cell's theta. Restored cells
  // keep the headings the freshly-built world gave them.
  // Full pose now, not posXY: the snapshot carries theta, so there is nothing
  // to protect from being zeroed and the headings come back with the bodies.
  world.writeCellRange(0, N, { pos: pose, vel, meta, bond: c.bond, brest: c.brest, energy });
  brains.writeState(built.arena);
  return { steps, alive: evo.alive() };
}
let last = { alive: evo.alive(), born: 0, died: 0, meanEnergy: 0, maxGeneration: 0, lineages: evo.alive(), genStats: null, linStats: null, birthStats: null };
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
      agedOut: evo.agedOut ?? 0, maxAge: evo.maxAge,
      simVersion: RUNNING.simVersion,
    };
    await Deno.writeTextFile(METRICS, JSON.stringify(rec) + '\n', { append: true });
    await archiveIfDue(last.maxGeneration);
  } catch (e) { console.error('metrics failed:', e.message); }
}

/**
 * THE ARCHIVE — genomes every N generations, and the world they lived in.
 *
 * A long run currently leaves nothing behind but numbers. The genomes that
 * produced them are overwritten as slots recycle, so a lineage that was
 * interesting at generation 30 is unrecoverable at generation 60 — and this
 * project's own preferred instrument is an ANCESTRAL TOURNAMENT, which needs
 * exactly that: the same lineage from two points in time, raced against itself.
 * Without an archive, ascent cannot be measured at all, only asserted.
 *
 * WHAT IS KEPT, and why not "the best".
 *
 * Ranking by energy would archive whatever is currently winning, and this world
 * has been measured descending toward small still monocultures — so "best" by
 * that measure is the least interesting thing in it. Instead one REPRESENTATIVE
 * PER LINEAGE is kept, chosen for what is scarce: tissue count first, then
 * whether the body can close a sensorimotor loop, then size. That preserves the
 * shape of the population rather than its winner, and it is what a tournament
 * between eras needs.
 *
 * THE WORLD GOES WITH IT. A genome is only meaningful against the physics and
 * the terrain it evolved in — the same genome in a world with different
 * geography is a different animal — so a snapshot is written alongside, and the
 * parameters are recorded in the manifest.
 *
 * SNAPSHOTS ARE PRUNED, genomes are not. A snapshot is ~4.4 MB and a manifest is
 * kilobytes, so every archive keeps its genomes forever and only the most recent
 * few keep their world, plus every tenth generation permanently as a coarse
 * backbone.
 */
const ARCHIVE_EVERY = Number(args.archiveEvery ?? 5);
const ARCHIVE_KEEP_WORLDS = Number(args.archiveKeepWorlds ?? 6);
const ARCHIVE_DIR = `${new URL('..', import.meta.url).pathname}runs/archive`;
let lastArchivedGen = -1;

async function archiveIfDue(gen) {
  if (!Number.isFinite(gen) || gen < 0) return;
  if (lastArchivedGen >= 0 && gen < lastArchivedGen + ARCHIVE_EVERY) return;
  lastArchivedGen = gen;
  try {
    await Deno.mkdir(ARCHIVE_DIR, { recursive: true });

    // One representative per lineage, chosen for what is RARE. See the note.
    const A = built.arena, C = built.cells;
    const best = new Map();
    for (let o = 0; o < A.P; o++) {
      if (!A.alive[o] || !evo.genome[o]) continue;
      const k = [0, 0, 0, 0];
      let n = 0;
      // THE CONTINUOUS MATERIAL, not only the argmax label.
      //
      // `mix` counts which of four labels won a winner-takes-all argmax, and
      // that is the representation this project has been removing everywhere
      // else: a body of cells that all narrowly favour one capacity archives
      // identically to one that is committed to it, and contractility hides
      // entirely behind a label it lost. It stays for readers that expect it;
      // these are what the world actually runs on.
      let sSense = 0, sCon = 0, sGrip = 0, sDens = 0, sRad = 0, sTough = 0;
      let rMin = Infinity, rMax = 0, dMin = Infinity, dMax = 0;
      for (let i = A.off[o]; i < A.off[o] + A.cnt[o]; i++) {
        const t = C.ctype[i];
        if (t < 0 || t >= 4) continue;
        k[t]++; n++;
        const mx = C.metaX ? C.metaX[i] : 0, mw = C.metaW ? C.metaW[i] : 0;
        sSense += ((mx >> 2) & 31) / 31;
        sCon   += ((mx >> 8) & 255) / 255;
        sGrip  += ((mx >> 16) & 255) / 255;
        sTough += ((mw >> 16) & 63) / 63;
        const d = ((mw >> 22) & 63) / 63;
        sDens += d;
        if (d < dMin) dMin = d; if (d > dMax) dMax = d;
        const r = C.rad ? C.rad[i] : 0.34;
        sRad += r;
        if (r < rMin) rMin = r; if (r > rMax) rMax = r;
      }
      if (!n) continue;
      const material = {
        sense: +(sSense / n).toFixed(4), contract: +(sCon / n).toFixed(4),
        grip: +(sGrip / n).toFixed(4), toughness: +(sTough / n).toFixed(4),
        // density is 0..1 as the genome expresses it; the kernel maps it
        // log-scaled onto densLo..densHi, which params records.
        density: +(sDens / n).toFixed(4), densityMin: +dMin.toFixed(4), densityMax: +dMax.toFixed(4),
        // Radius varies only since development gained its relaxation phase; a
        // flat min==max==massRef marks a body from before that.
        radius: +(sRad / n).toFixed(4), radiusMin: +rMin.toFixed(4), radiusMax: +rMax.toFixed(4),
      };
      const tissues = k.filter((v) => v > 0).length;
      const score = tissues * 1000 + (k[1] > 0 && k[2] > 0 ? 500 : 0) + n;
      const lin = evo.lineage[o];
      const cur = best.get(lin);
      if (!cur || score > cur.score) {
        best.set(lin, { score, slot: o, uid: evo.uid[o], generation: evo.generation[o],
                        lineage: lin, cells: n, tissues, material,
                        mix: { neuron: k[0], sensor: k[1], muscle: k[2], anchor: k[3] },
                        senseAndMove: k[1] > 0 && k[2] > 0 });
      }
    }
    if (!best.size) return;

    // NAMED BY WORLD AS WELL AS GENERATION. gen-NNNN alone is not unique: every
    // reseed restarts generation counting, so a new world's gen-0015 silently
    // OVERWRITES the previous world's gen-0015 - and the two sit in the same
    // step range, so nothing downstream can tell them apart either. Observed as
    // an archive series whose step count went backwards.
    const tag = `gen-${String(gen).padStart(4, '0')}-${BOOT_ID}`;
    const manifest = {
      t: new Date().toISOString(), step: steps, generation: gen,
      // WHICH REPRESENTATION THIS IS. Archives written before the pose, mass
      // and relaxation work describe a different world with the same field
      // names, and a reader has no other way to tell. 1 = the original
      // label-and-genome form; 2 = continuous material, per-cell radius and
      // density, and the ancestor-depth distribution.
      repr: 2,
      // WHICH WORLD THIS IS. Archives are named by generation and the directory
      // now holds two runs, so gen-0201 from a world that reached 2.3M steps
      // sorts beside gen-0013 from the one that replaced it. A reader charting
      // the index without this draws a chimera - the step count jumping
      // backwards is the only other clue.
      bootId: BOOT_ID,
      alive: last.alive, lineages: last.lineages, meanEnergy: +last.meanEnergy.toFixed(3),
      // generation above is a MAX over living bodies and moves in jumps; this
      // is the distribution it hides.
      genStats: last.genStats ?? null,
      // Lineage COUNT hides whether one line holds the population. See
      // Evolver.lineageStats.
      linStats: last.linStats ?? null,
      simVersion: RUNNING.simVersion, devo: evo.devoVersion, encoding: evo.devoName ?? 'devo2-grn',
      // The physics a genome evolved under. Without it an archived genome is a
      // string of floats with no world to mean anything in.
      params: { ...world.params },
      creatures: [...best.values()].map((b) => ({
        uid: b.uid, generation: b.generation, lineage: b.lineage,
        cells: b.cells, tissues: b.tissues, senseAndMove: b.senseAndMove, mix: b.mix,
        material: b.material,
        genome: Array.from(evo.genome[b.slot]).map((v) => +v.toFixed(5)),
      })),
    };
    await Deno.writeTextFile(`${ARCHIVE_DIR}/${tag}.json`, JSON.stringify(manifest));

    // AND THE INDEX, WHICH NOTHING HAD EVER WRITTEN.
    //
    // runs/archive/index.json is the only way a reader discovers what archives
    // exist - analytics.html walks it, and so does the MCP world_archives tool.
    // It was a hand-committed file listing 40 archives ending at gen-0129, so
    // every archive written since was invisible to both: the analytics page
    // charted a series that had stopped growing, and looked static because it
    // WAS static. Rebuilt from the directory on every archive, sorted, so the
    // index cannot drift from what is on disk.
    try {
      const names = [];
      for await (const e of Deno.readDir(ARCHIVE_DIR)) {
        if (e.isFile && /^gen-\d+(-[a-z0-9-]+)?\.json$/.test(e.name)) names.push(e.name);
      }
      names.sort();
      await Deno.writeTextFile(`${ARCHIVE_DIR}/index.json`, JSON.stringify(names));
    } catch (e) { console.error('archive index:', e.message); }

    // The world it lived in. Pruned below; the genomes above never are.
    const snap = `${ARCHIVE_DIR}/${tag}.snapshot`;
    try { await saveSnapshot(snap); } catch (e) { console.error('archive snapshot:', e.message); }

    // Keep the most recent few worlds, plus every tenth generation as a coarse
    // backbone so the deep past is still replayable at lower resolution.
    const snaps = [];
    for await (const e of Deno.readDir(ARCHIVE_DIR)) {
      if (e.isFile && e.name.endsWith('.snapshot')) snaps.push(e.name);
    }
    snaps.sort();
    const keep = new Set(snaps.slice(-ARCHIVE_KEEP_WORLDS));
    for (const nm of snaps) {
      const g = Number(nm.match(/gen-(\d+)/)?.[1] ?? -1);
      if (keep.has(nm) || (g >= 0 && g % 10 === 0)) continue;
      try { await Deno.remove(`${ARCHIVE_DIR}/${nm}`); } catch { /* already gone */ }
      // AND ITS RING. saveSnapshot writes a companion trace ring of the same
      // size beside every snapshot, so pruning only the .snapshot files halves
      // nothing — the directory still grows at the full rate, quietly.
      for await (const e2 of Deno.readDir(ARCHIVE_DIR)) {
        if (e2.isFile && e2.name.startsWith(nm) && e2.name !== nm) {
          try { await Deno.remove(`${ARCHIVE_DIR}/${e2.name}`); } catch { /* gone */ }
        }
      }
    }
    console.log(`archived ${tag}: ${manifest.creatures.length} lineage representatives at step ${steps}`);
  } catch (e) { console.error('archive failed:', e.message); }
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
    // EGGS DROP CONTINUOUSLY, a couple per pass, instead of a tick emptying the
    // whole queue at once. Development is ~6 ms of synchronous JS per egg, so
    // the batch form showed up as the world animating for two seconds and then
    // hanging for two. This is the same total work laid down flat.
    if (!ticking) {
      // Drain proportionally to the backlog. A fixed two per pass cannot work
      // off a queue that a burst has pushed to a thousand, and a queue that
      // never drains means reproduction is limited by this constant rather than
      // by the world - which is a scheduler deciding who breeds.
      try {
        const q = evo.pendingEggs ?? 0;
        const perPass = Math.max(args.eggsPerPass ?? 2, Math.min(12, Math.ceil(q / 100)));
        evo.pump(steps, perPass);
      }
      catch (e) { console.error('pump failed:', e.message); }
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

const FRAME_MAGIC = 0x334d5257;   // 'RWM3' — dynamic and static split by epoch
const HEAD = 56;

/**
 * A frame is positions, activations and cell types — split into the part that
 * changes every step and the part that changes only when something is born or
 * dies.
 *
 * It used to send everything every frame. Measured at 23,403 live cells that is
 * 898 KB per frame, of which 531 KB — the live-cell index list, the types, the
 * uids and the bond pairs — is byte-identical to the frame before unless the
 * population changed. At ~14 frames a second on loopback that is most of the
 * bandwidth and most of the client's decode, and it was the reason the viewer
 * sat at 11 fps.
 *
 * THE EPOCH IS births + deaths. It is exactly the quantity that changes when the
 * live SET changes, which is what makes this safe: same epoch means the same
 * cells are alive, in the same order, so the index list, the types, the uids and
 * the bond graph are all still correct. The client sends the epoch it holds as
 * ?have=; if it matches, the static block is omitted.
 *
 * WHY NOT AN OUT-OF-BAND ENDPOINT. That was tried, for bonds, and it is recorded
 * a few lines below: the viewer held a bond list from one instant and positions
 * from another, and drew lines between cells that were never bonded. The static
 * block still travels IN the frame and still describes the same instant as the
 * positions — it is elided only when the client provably already has that exact
 * block. Nothing is ever assembled from two different moments.
 *
 * Layout, v3 ('RWM3'), dynamic first so the static tail can simply be cut off:
 *
 *   HEAD 56  ... u32 hasStatic at offset 48
 *   u32 L
 *   f32 pos[L*2]     f32 act[L]     f32 energy[L]      <- every frame
 *   u16 theta[L]     (padded to 4)                     <- every frame
 *   i32 idx[L]       i32 type[L]    i32 uid[L]         <- only when hasStatic
 *   i32 matW[L]      f32 radius[L]                     <- only when hasStatic
 *   u32 pairCount    i32 pairs[pairCount]              <- only when hasStatic
 *
 * THETA IS TWO BYTES, NOT FOUR. It changes every step, so it rides in the
 * dynamic block where a f32 would have cost 25% of the frame; a u16 over
 * -pi..pi resolves to 0.0001 rad, which is far finer than a pixel. matW and
 * radius change only at birth, so they cost nothing on a steady epoch.
 *
 * Offset 52 carries a FORMAT VERSION. It was reserved and unused, and a viewer
 * parsing the old layout against the new one silently reads garbage rather
 * than failing, which is the worst way for a protocol change to go wrong.
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
// The live-cell index list and the bond pairs, held for as long as the epoch
// they describe. See buildFrame.
let topoCache = null;
// When a viewer last asked for a frame. Framing is skipped when nothing is
// watching — see frameLoop.
let lastFrameWant = -1e9;
const FRAME_MS = 40;

/**
 * @param {number} have  the topology epoch the caller already holds, or -1.
 *   When it matches the frame's epoch the static block is omitted — see the
 *   layout note above buildFrame.
 */
async function frame(have = -1) {
  lastFrameWant = performance.now();
  const pick = (f) => (have >= 0 && have === f.epoch ? f.dyn : f.full);
  // ANSWER FROM THE CACHE, ALWAYS, IF THERE IS ONE.
  //
  // This used to build on demand whenever the cache was older than FRAME_MS.
  // Building a frame costs two GPU readbacks, measured at 554-1619ms while
  // other jobs share the device — so a viewer asking for a frame every ~70ms
  // was really waiting up to 1.6 SECONDS, at random. That variance is the jank:
  // not a low frame rate but an unpredictable one.
  //
  // The cache is now kept warm by the loop below instead, so a request never
  // waits on the GPU. The frame may be a little old; it arrives on time, and a
  // steady stream of slightly-late frames reads as smooth motion where an
  // erratic stream of fresh ones does not.
  if (cached) return pick(cached);
  if (inFlight) return inFlight.then(pick);      // only before the first frame
  inFlight = buildFrame().then(f => {
    cached = f; cachedAt = performance.now(); inFlight = null; return f;
  }).catch(e => { inFlight = null; throw e; });
  return inFlight.then(pick);
}

// Rebuild continuously, off the request path. One build at a time — the GPU is
// already the scarce resource and queueing more readbacks against it makes every
// one of them slower.
(async function frameLoop() {
  while (running) {
    // NOBODY WATCHING, NOBODY PAYS.
    //
    // Framing is two GPU readbacks, and a readback stalls the pipeline the
    // simulation is trying to fill. Running it unconditionally meant a headless
    // evolution run — the whole point of which is steps per second — spent a
    // fraction of every second serving a viewer that did not exist.
    //
    // Display rate and simulation rate are different numbers with different
    // targets: 60/s is plenty for a screen, while evolution wants thousands.
    // Chaining them is the mistake; this unchains the idle case.
    const watched = (performance.now() - lastFrameWant) < 2000;
    if (!paused && !inFlight && watched) {
      inFlight = buildFrame().then(f => {
        cached = f; cachedAt = performance.now(); inFlight = null;
        return f;
      }).catch(() => { inFlight = null; return null; });
      await inFlight;
    }
    await new Promise(r => setTimeout(r, FRAME_MS));
  }
})();

async function buildFrame() {
  const { pos, energy, theta } = await world.readCells();
  // readAct, not readState: this uses only the activations, and readState also
  // copies the whole neuron-state buffer — 100 KB a frame across the bus, on the
  // readback that gates how often the world can be watched. (Codex spotted this.)
  const { act } = await brains.readAct();

  // Live bond pairs, computed HERE so they describe the same instant as the
  // positions above. Sending them out-of-band (the /bonds endpoint) meant the
  // viewer held a bond list from one moment and positions from another, and
  // with tens of thousands of births constantly recycling slots those lists
  // disagreed about which cells belong to which body. The result was lines
  // drawn between cells that were never bonded — arbitrary pairs, which is
  // exactly why they ignored the renderer's length cull. Diagnosed twice as
  // something else (dead cells, then over-stretched bodies) before the strain
  // measurement came back clean at 1.00 and ruled the physics out.
  // BOTH OF THESE ARE FUNCTIONS OF THE EPOCH, so they are computed once per
  // epoch rather than once per frame. Each was an O(N x bondK) scan building a
  // plain array with push(), running ~25 times a second, fully synchronous — and
  // synchronous work here blocks the HTTP handler, which is what put an 800ms
  // tail on requests that should be served from a cache in a millisecond.
  const epoch = evo.births + evo.deaths;
  if (!topoCache || topoCache.epoch !== epoch) {
    const bond = built.cells.bond, bondK = built.cells.bondK;
    const ctype = built.cells.ctype;
    let nLive = 0, nPair = 0;
    for (let i = 0; i < N; i++) {
      if (ctype[i] < 0) continue;
      nLive++;
      for (let k = 0; k < bondK; k++) {
        const j = bond[i * bondK + k];
        if (j < 0 || j <= i || ctype[j] < 0) continue;
        nPair += 2;
      }
    }
    const liveIdx = new Int32Array(nLive), P32 = new Int32Array(nPair);
    let li = 0, pi = 0;
    for (let i = 0; i < N; i++) {
      if (ctype[i] < 0) continue;
      liveIdx[li++] = i;
      for (let k = 0; k < bondK; k++) {
        const j = bond[i * bondK + k];
        if (j < 0 || j <= i || ctype[j] < 0) continue;
        P32[pi++] = i; P32[pi++] = j;
      }
    }
    topoCache = { epoch, liveIdx, P32 };
  }
  const { liveIdx, P32 } = topoCache;

  // LIVE CELLS ONLY.
  //
  // The frame carried every arena slot — 72,000 of them — while typically ~9,000
  // are alive. 87% of a 2.2MB payload was dead space, and that payload is what
  // made a frame take 0.7s to build and 1.8s of world time to arrive, which in
  // turn aliased the brain trace by thirty-two times. Sending an index with each
  // live cell costs 4 bytes and removes seven eighths of the message.
  const L = liveIdx.length;
  // idx(4) + pos(8) + act(4) + type(4) + energy(4) + uid(4) per live cell.
  // Sized for five of those six once, which threw only when the bond pairs
  // overran the end — an error about a typed array length, nowhere near the
  // arithmetic that caused it.
  // Dynamic: pos(8) + act(4) + energy(4). Static: idx(4) + type(4) + uid(4),
  // then the pair count and the pairs.
  // Dynamic gains theta as u16, padded so the static block stays 4-aligned.
  const THETA = ((L * 2) + 3) & ~3;
  const DYN = 4 + L * (8 + 4 + 4) + THETA;
  // Static gains matW (the packed material word: density, toughness, tag,
  // enzyme) and radius. Both change only at birth, so they ride the epoch.
  const STAT = L * (4 + 4 + 4 + 4 + 4) + 4 + P32.byteLength;
  const buf = new ArrayBuffer(HEAD + DYN + STAT);
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
  dv.setUint32(40, epoch, true);
  dv.setFloat32(44, world.params.flowScale, true);
  dv.setUint32(48, 1, true);           // this buffer carries the static block
  // Format 2: theta in the dynamic block, matW and radius in the static one.
  dv.setUint32(52, 2, true);

  let at = HEAD;
  new DataView(buf).setUint32(at, L, true); at += 4;
  {
    const p2 = new Float32Array(buf, at, L * 2);
    for (let k = 0; k < L; k++) { const i = liveIdx[k]; p2[k * 2] = pos[i * 2]; p2[k * 2 + 1] = pos[i * 2 + 1]; }
    at += L * 8;
  }
  // Per-CELL activation: the browser draws cells, not slots, so resolve the
  // cell -> brain-slot indirection here rather than shipping the slot table.
  const cellAct = new Float32Array(N);
  const cellType = new Int32Array(N);
  // THE PACKED MATERIAL WORD, not the 0..3 argmax label.
  //
  // The viewer has always had a continuous colour path - hue from which
  // capacities a cell has, saturation from how committed it is - but it was
  // gated on receiving the packed word, and this frame only ever carried the
  // label. So every page in watch mode fell through to four flat colours while
  // a page running its own sim showed the real thing. Reported as the palette
  // looking simplistic, and it was: the information was on the server the whole
  // time and the wire dropped it.
  //
  // Costs nothing extra: this is the same 4 bytes per cell the label used, in a
  // block that is only resent when the epoch changes.
  const cellMat = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const t = built.cells.ctype[i];
    cellType[i] = t;
    cellMat[i] = built.cells.metaX ? built.cells.metaX[i] : t;
    const slot = built.cells.cslot[i];
    cellAct[i] = (t >= 0 && slot >= 0) ? act[slot] : 0;
  }
  {
    const a2 = new Float32Array(buf, at, L);
    for (let k = 0; k < L; k++) a2[k] = cellAct[liveIdx[k]];
    at += L * 4;
    const e2 = new Float32Array(buf, at, L);
    for (let k = 0; k < L; k++) e2[k] = energy[liveIdx[k]];
    at += L * 4;
    // Heading, quantised. theta is kept in [-pi, pi] by the kernel, so this is
    // a straight affine map with no wrapping to get wrong.
    const th2 = new Uint16Array(buf, at, L);
    const TAU = Math.PI * 2;
    for (let k = 0; k < L; k++) {
      const t = theta ? theta[liveIdx[k]] : 0;
      th2[k] = Math.max(0, Math.min(65535, Math.round(((t + Math.PI) / TAU) * 65535)));
    }
    at += THETA;
  }
  // ---- end of the dynamic block; everything below is constant for this epoch.
  const statAt = at;
  new Int32Array(buf, at, L).set(Int32Array.from(liveIdx)); at += L * 4;
  {
    const t2 = new Int32Array(buf, at, L);
    for (let k = 0; k < L; k++) t2[k] = cellMat[liveIdx[k]];
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
  // MATERIAL AND SIZE. matW is cmeta.w - density, toughness, tag, enzyme - and
  // radius is what development's relaxation phase left the cell. Neither was on
  // the wire at all, so a watching page could not colour by what a cell is MADE
  // of, nor draw a fused node any bigger than a grain. Both change only at
  // birth, so they ride the epoch and cost nothing on a steady frame.
  {
    const w2 = new Int32Array(buf, at, L);
    for (let k = 0; k < L; k++) w2[k] = built.cells.metaW ? built.cells.metaW[liveIdx[k]] : 0;
    at += L * 4;
    const r2 = new Float32Array(buf, at, L);
    for (let k = 0; k < L; k++) r2[k] = built.cells.rad ? built.cells.rad[liveIdx[k]] : 0.34;
    at += L * 4;
  }

  new DataView(buf).setUint32(at, P32.length, true); at += 4;
  new Int32Array(buf, at, P32.length).set(P32);

  // Two views of ONE build. The dynamic-only variant is the same bytes with the
  // static tail cut off and the flag cleared, so the two cannot describe
  // different instants — there is only one instant here.
  const full = new Uint8Array(buf);
  full.atStep = steps;
  const dyn = new Uint8Array(statAt);
  dyn.set(full.subarray(0, statAt));
  new DataView(dyn.buffer).setUint32(48, 0, true);
  return { full, dyn, epoch, atStep: steps };
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
await logRegime();

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

  // The designed-creature library. Static, small, and read by the Extras panel.
  // SAVED WORLDS, for the load UI. Lists what can be resumed from: the live
  // autosave, the pruned archive snapshots, and anything deliberately kept.
  if (path === '/saves') {
    const root = `${new URL('..', import.meta.url).pathname}runs`;
    const out = [];
    const scan = async (dir, kind) => {
      try {
        for await (const e of Deno.readDir(dir)) {
          if (!e.isFile || !e.name.endsWith('.snapshot')) continue;
          const p = `${dir}/${e.name}`;
          const st = await Deno.stat(p);
          out.push({ kind, name: e.name, path: p, bytes: st.size,
                     mtime: st.mtime?.toISOString() ?? null });
        }
      } catch { /* directory may not exist yet */ }
    };
    await scan(root, 'autosave');
    await scan(`${root}/archive`, 'archive');
    await scan(`${root}/keep`, 'kept');
    // Manifests carry the genomes and the parameters and are never pruned, so
    // they are listed even where the snapshot beside them has been.
    const manifests = [];
    try {
      for await (const e of Deno.readDir(`${root}/archive`)) {
        if (e.isFile && e.name.endsWith('.json')) manifests.push(e.name);
      }
    } catch { /* none yet */ }
    manifests.sort();
    out.sort((a, b) => (b.mtime ?? '').localeCompare(a.mtime ?? ''));
    return new Response(JSON.stringify({ saves: out, manifests, current: SNAP }),
      { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }

  if (path === '/creatures') {
    try {
      const txt = await Deno.readTextFile(
        `${new URL('..', import.meta.url).pathname}lib/creatures.json`);
      return new Response(txt, {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    } catch {
      return new Response(JSON.stringify({ creatures: [] }),
        { headers: { 'content-type': 'application/json' } });
    }
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
    // Four floats a mote now, not three. Capacity has to travel with the mote:
    // motes differ in size by up to fifty times, so a viewer holding only the
    // stock cannot tell a drained megamote from a full ordinary one, and would
    // draw them identically.
    const buf = new ArrayBuffer(8 + n * 16);
    new Uint32Array(buf, 0, 2).set([n, 0]);
    const f = new Float32Array(buf, 8);
    for (let i = 0; i < n; i++) {
      f[i * 4] = m.pos[i * 2];
      f[i * 4 + 1] = m.pos[i * 2 + 1];
      f[i * 4 + 2] = m.stock[i];
      f[i * 4 + 3] = m.cap[i];
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
      // A designed genome, if one was sent. Length-checked against the running
      // encoding: a genome from a different devo version would develop into
      // nonsense or throw, and the message would name neither.
      let designed = null;
      if (Array.isArray(body.genome)) {
        const want = evo.genome[slot]?.length ?? 0;
        if (body.genome.length !== want) {
          return new Response(JSON.stringify({ ok: false,
            error: `genome is ${body.genome.length} floats, this world runs ${want}` }),
            { status: 400, headers: { 'content-type': 'application/json' } });
        }
        designed = body.genome;
      }
      const r = evo.implant(slot, { copies, mutate, step: steps, genome: designed });
      r.designed = body.designName ?? null;
      // ON THE RECORD. A run that has been intervened in is not a clean
      // observation of evolution, and the only thing that keeps that from being
      // forgotten a week later is that it is written down at the time.
      try {
        await Deno.writeTextFile(
          `${new URL('..', import.meta.url).pathname}runs/observations.jsonl`,
          JSON.stringify({
            t: new Date().toISOString(), kind: 'intervention', what: 'implant',
            step: steps, uid: want, copies, mutate, designed: body.designName ?? null,
            made: r.made, noRoom: r.noRoom, failedEgg: r.failedEgg,
            mintedEnergy: r.mintedEnergy,
            note: 'hand of god: genome copied into the world with yolk nobody paid for',
          }) + '\n', { append: true });
      } catch (e) { r.logError = e.message; }
      console.log(`IMPLANT #${want} x${copies} (mutate ${mutate}) -> ${r.made} placed at step ${steps}`);
      return ok(r);
    }

    // A PHYSICS KNOB, applied to the shared world. Whitelisted: this is a live
    // control surface on a running experiment, and an arbitrary key would let a
    // stray field name land somewhere in the uniform block with no complaint.
    if (action === 'experiment') {
      const name = String(body.name ?? '').trim();
      if (!name) {
        return new Response(JSON.stringify({ ok: false, error: 'an experiment needs a name' }),
          { status: 400, headers: { 'content-type': 'application/json' } });
      }
      // Tune at the same instant the baseline is taken, so the record and the
      // change cannot disagree about when it happened.
      const { applied, rejected } = applyTune(body.params);
      EXPERIMENTS.push({
        name, step: steps, t: new Date().toISOString(),
        params: body.params ?? null,
        base: {
          alive: last.alive, lineages: last.lineages,
          effective: last.linStats?.effective ?? null,
          meanEnergy: last.meanEnergy, blockedBirths: evo.blockedBirths,
          pendingEggs: evo.pendingEggs ?? 0,
        },
      });
      return ok({ name, step: steps, applied, rejected });
    }

    if (action === 'tune') {
      // One whitelist, defined at TUNABLE. This branch used to keep its own
      // copy, which is how it went stale: every parameter added with the pose
      // and mass work was silently rejected for days because only one of the
      // two lists was updated.
      const { applied: patch, rejected } = applyTune(body.params);
      // Tuning is an intervention in the same sense implant is — a run whose
      // parameters moved under it is not a run at one setting — so it goes in
      // the log rather than only into memory.
      if (Object.keys(patch).length) {
        try {
          await Deno.writeTextFile(
            `${new URL('..', import.meta.url).pathname}runs/observations.jsonl`,
            JSON.stringify({ t: new Date().toISOString(), kind: 'tune', step: steps, patch }) + '\n',
            { append: true });
        } catch { /* logging must not break the control */ }
      }
      return ok({ applied: patch, rejected });
    }

    if (action === 'save') {
      const r = await saveSnapshot(SNAP);
      return ok({ saved: SNAP, bytes: r.bytes });
    }

    // Both of these replace this process, which is how new code gets picked up
    // without a shell. `restart` saves first and comes back on the same world;
    // `reseed` abandons it and starts a fresh one.
    // LOAD A SAVED WORLD. Re-execs against a chosen snapshot rather than the
    // live autosave, so an experiment can be rewound without losing what is
    // running: the current world is saved under runs/keep first, always, because
    // "load that other one" should never be a way to destroy this one.
    if (action === 'load') {
      const want = String(body.path ?? '');
      const root = `${new URL('..', import.meta.url).pathname}runs`;
      if (!want.startsWith(root) || !want.endsWith('.snapshot')) {
        return new Response(JSON.stringify({ ok: false, error: 'path must be a snapshot under runs/' }),
          { status: 400, headers: { 'content-type': 'application/json' } });
      }
      try { await Deno.stat(want); }
      catch { return new Response(JSON.stringify({ ok: false, error: 'no such snapshot' }),
        { status: 404, headers: { 'content-type': 'application/json' } }); }

      let kept = null;
      try {
        await Deno.mkdir(`${root}/keep`, { recursive: true });
        kept = `${root}/keep/before-load-step${steps}.snapshot`;
        await saveSnapshot(kept);
      } catch (e) { console.error('pre-load save failed:', e.message); }

      queueMicrotask(async () => {
        await new Promise((r) => setTimeout(r, 250));
        const script = new URL(import.meta.url).pathname;
        const rest = Deno.args.filter((a) => a !== '--resume' && a !== '--snapshot');
        console.log(`load: re-exec from ${want}`);
        try { await server.shutdown(); } catch { /* already closing */ }
        new Deno.Command(Deno.execPath(), {
          args: ['run', '-A', script, ...rest, '--snapshot', want, '--resume'],
          cwd: Deno.cwd(), stdout: 'inherit', stderr: 'inherit',
        }).spawn().unref();
        setTimeout(() => Deno.exit(0), 150);
      });
      return ok({ loading: want, currentSavedTo: kept });
    }

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
    const have = Number(url.searchParams.get('have') ?? -1);
    return new Response(await frame(Number.isFinite(have) ? have : -1), {
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
  if (path === '/experiments') {
    return new Response(JSON.stringify({ runs: EXPERIMENTS }),
      { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
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
      maxAge: evo.maxAge, agedOut: evo.agedOut ?? 0,
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
      // generation is the MAX over living bodies - a ratchet held up by one
      // deep survivor. genStats is the distribution it hides: lineages advance
      // at different rates, so ancestor depth is a spread, not a number.
      // The physics added since the pose/mass work. Absent from here, any
      // report built off /status silently claimed they were at defaults.
      drag: world.params.drag, springK: world.params.springK, contract: world.params.contract,
      wrapY: world.params.wrapY, tempCost: world.params.tempCost,
      twistK: world.params.twistK, vortK: world.params.vortK, angDrag: world.params.angDrag,
      massRef: world.params.massRef, densLo: world.params.densLo, densHi: world.params.densHi,
      mediumDens: world.params.mediumDens,
      foreignReach: world.params.foreignReach, foreignPush: world.params.foreignPush,
      pendingEggs: evo.pendingEggs ?? 0,
      generation: last.maxGeneration, lineages: last.lineages,
      genStats: last.genStats ?? null,
      // Lineage COUNT hides whether one line holds the population.
      linStats: last.linStats ?? null,
      // Birth outcomes BY REASON. See Evolver.birthStats.
      birthStats: last.birthStats ?? null,
      // The SHAPE of the free space, not just the count of refusals.
      freeStats: built.arena.freeStats ? built.arena.freeStats() : null,
      // BIRTHS THE ARENA REFUSED. Tracked since fragmentation once stopped
      // evolution for thousands of ticks while every other number looked
      // healthy — but only ever reported through a console warning that fires
      // ONCE per process, so a run could be strangling and say nothing. It is a
      // headline number: it is the difference between a population limited by
      // energy, which is the design, and one limited by bookkeeping, which is a
      // bug wearing the same clothes.
      blockedBirths: last.blockedBirths ?? 0,
      // Ran out of the per-tick laying budget, not out of arena room.
      deferredBirths: evo.deferredBirths ?? 0,
      // FRAME PUBLISHING, OBSERVABLE. Codex's point, and a fair one: without
      // these you can infer the frame contract from timing but not verify it,
      // because a cached frame can be older than the request that receives it.
      // frameAgeMs is how stale the cached frame is right now; cachedFrameStep
      // is the world step it actually depicts; frameEveryMs is the cadence the
      // background builder is aiming at. A viewer or an auditor can then say
      // exactly which step it is looking at rather than which step it asked at.
      frameEveryMs: FRAME_MS,
      cachedFrameStep: cached?.atStep ?? null,
      frameAgeMs: cached ? Math.round(performance.now() - cachedAt) : null,
      framing: (performance.now() - lastFrameWant) < 2000,
      meanEnergy: last.meanEnergy, organisms: evo.nextUid,
    }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }

  // Static files, confined to the project directory.
  try {
    // A DIRECTORY MEANS ITS INDEX. Every other static host does this, so a link
    // to /lab/ works on GitHub Pages and 404'd here - which reads as a broken
    // link in the app rather than as a server that resolves paths differently
    // from the one the same files are published on.
    let p2 = path;
    if (p2.endsWith('/')) p2 += 'index.html';
    const full = new URL('.' + p2, `file://${ROOT}`).pathname;
    if (!full.startsWith(ROOT)) return new Response('no', { status: 403 });
    const body = await Deno.readFile(full);
    const ext = p2.slice(p2.lastIndexOf('.'));
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
