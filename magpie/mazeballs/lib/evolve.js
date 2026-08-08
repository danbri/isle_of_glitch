/**
 * Evolution: death by starvation, reproduction from surplus, descent by copy.
 *
 * WHAT IS AND IS NOT A PRIMITIVE HERE. There is no fitness function, no
 * generation barrier, and no species. A body dies when its cells have spent
 * more energy than they captured, and it reproduces when they have captured a
 * surplus — both are consequences of the energy the GPU already accounts per
 * cell, not scores assigned from outside. Nothing ranks organisms against each
 * other. The only relation this file creates is DESCENT: who was copied from
 * whom, which is a physical fact about how a body came to exist, and the one
 * relation WORLD.md allows as real.
 *
 * That makes selection implicit and continuous. There is no "next generation" —
 * bodies die and are born at whatever moment their energy crosses a threshold,
 * so lineages overlap and the population is never synchronised. `generation`
 * below is a per-lineage depth counter for reading the tree, never a cohort.
 *
 * WHY THIS IS ON THE CPU. Everything per-step stays GPU-resident; this does not.
 * Birth and death are structural — they allocate slots, rewrite a genome, and
 * append to a lineage — and they happen thousands of times less often than a
 * physics step. One small readback per tick (positions and per-cell energy) buys
 * all of it, and only the changed organisms' slices are written back. The
 * per-step loop still never leaves the GPU.
 *
 * EVO-DEVO. A body is what a genome DEVELOPS into, never a copy of its parent's
 * body, so morphology is heritable and mutable rather than fixed at birth. Two
 * encodings are selectable (`devoVersion`, see ENCODINGS below):
 *
 *   1  devo.js  — a positional readout. Cell properties are a weighted sum of
 *                 nine fixed basis functions of two maternal coordinates,
 *                 sampled on a hex disc. No time, no signalling, no division.
 *   2  devo2.js — a sparse gene regulatory network running in time inside an
 *                 egg, with diffusion between neighbours, that GROWS a body by
 *                 division. The default. See DEVELOPMENT-2.md.
 *
 * The earlier note here — that offspring inherit the parent's cell count and
 * ring topology, and that morphogenesis is not heritable — described the state
 * before either encoding landed, and is withdrawn.
 */

/** Deterministic PRNG so a run is a pure function of its seed. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

import {
  bond as bondCells, morphology, largestPiece,
} from './devo.js';
import { packMeta, packSize } from './world_gpu.js';
import { Lineage, CELLZERO } from './lineage.js';
import * as DEVO1 from './devo.js';
import * as DEVO2 from './devo2.js';

/**
 * The developmental encodings, selectable per world.
 *
 * `bond()`, `morphology()` and `largestPiece()` are NOT part of this — they are
 * shared by both and imported once above. What differs between encodings is how
 * a genome becomes a set of cells with properties; how those cells are wired
 * into a skeleton, and how that skeleton is measured, is common ground.
 *
 * Both modules expose the same five names with the same signatures, which is a
 * constraint on any future encoding rather than a coincidence: `develop`,
 * `randomGenome`, `mutate`, `synapse`, `GENOME_SIZE`, plus a `DEFAULT_EXTENT`
 * saying how big an egg it needs. Dev 1.0 wants 3.0 and Dev 2.0 wants 12, and
 * getting that wrong is the difference between an animal and a disc.
 */
const ENCODINGS = {
  1: { lib: DEVO1, extent: 3.0, name: 'devo1-positional' },
  2: { lib: DEVO2, extent: DEVO2.DEFAULT_EXTENT, name: 'devo2-grn' },
};

/**
 * A cell's TYPE is a description of its properties, not a stored fact. Whichever
 * of its continuous capacities dominates is what we call it, and if none does it
 * is an interneuron. This is the treatment CELLS.md asks for: the type is a
 * label we read off the tissue for the physics kernel's benefit, and the genome
 * never writes one.
 */
// EXPORTED, because anything that needs to know what a cell IS must use THIS
// rule and not a copy of it. The type is read off the capacities, so a second
// implementation with a slightly different threshold would silently disagree
// with the world about what a body is made of — and disagreements between two
// copies of one rule are the most expensive class of bug in this codebase.
export function describe(c) {
  const CELL_NEURON = 0, CELL_SENSOR = 1, CELL_MUSCLE = 2, CELL_ANCHOR = 3;
  let best = CELL_NEURON, v = 0.15;                   // below this it is just tissue
  if (c.sense > v) { best = CELL_SENSOR; v = c.sense; }
  if (c.contract > v) { best = CELL_MUSCLE; v = c.contract; }
  if (c.grip > v) { best = CELL_ANCHOR; v = c.grip; }
  return best;
}

export class Evolver {
  /**
   * @param {object} o
   * @param {BrainArena} o.arena
   * @param {WorldGPU} o.world
   * @param {object} o.cells      the CPU-side arrays from buildBodies
   * @param {number} [o.birthEnergy=9]  per-body surplus that triggers division
   * @param {number} [o.deathEnergy=0]  per-body level at which a body starves
   * @param {number} [o.mutRate=0.14]   fraction of genome entries perturbed
   * @param {number} [o.mutSize=0.32]   size of a perturbation
   */
  constructor({
    arena, world, cells, seed = 7,
    birthEnergy = 9, deathEnergy = 0, mutRate = 0.14, mutSize = 0.32,
    // SENESCENCE. Bodies die at approximately maxAge steps, with variance, and
    // that is the whole mechanism. See the note above the death block.
    maxAge = 25000, ageSpread = 0.35,
    sizeMutRate = 0.25, minCells = 5, maxCells = 40, topoMutRate = 0.30,
    birthOrder = 'lottery',
    devo = true, yolkFrac = 0.55, cellCost = 0.55, eggExtent = null, birthMargin = 1.15,
    devoVersion = 2, devoOpts = {}, lineageLog = null, dispersal = 9,
  }) {
    this.arena = arena; this.world = world; this.cells = cells;
    this.birthEnergy = birthEnergy; this.deathEnergy = deathEnergy;
    this.maxAge = maxAge; this.ageSpread = ageSpread;
    this.mutRate = mutRate; this.mutSize = mutSize;
    this.sizeMutRate = sizeMutRate; this.topoMutRate = topoMutRate;
    this.birthOrder = birthOrder;
    this.minCells = minCells; this.maxCells = maxCells;
    this.rnd = rng(seed);
    // EVO-DEVO. Each organism carries a genome; a body is what that genome
    // develops into, never a copy of its parent's body.
    this.devo = devo;
    // The developmental encoding. `eggExtent` defaults to whatever the chosen
    // encoding asks for rather than to a constant, because the right egg size is
    // a property of how the encoding builds a body — Dev 1.0 samples a fixed
    // disc and wants 3.0; Dev 2.0 grows into open space and wants 12, and giving
    // it 3.0 reproduces the exact disc-shaped bodies it exists to escape.
    const enc = ENCODINGS[devoVersion] ?? ENCODINGS[2];
    this.devoVersion = devoVersion;
    this.devoName = enc.name;
    this.D = enc.lib;
    this.devoOpts = devoOpts;
    this.yolkFrac = yolkFrac;
    this.cellCost = cellCost;
    this.eggExtent = eggExtent ?? enc.extent;
    this.birthMargin = birthMargin;
    this.dispersal = dispersal;
    // Mean expressed dispersal per body, read off the developed tissue.
    this.dispersalOf = new Float32Array(arena.P);
    this.genome = new Array(arena.P).fill(null);
    this.failedEggs = 0;
    // Cell identity and descent. Nothing appears from nowhere; see lineage.js.
    this.lineageLog = lineageLog ?? new Lineage();
    this.bookOf = new Float64Array(arena.P).fill(-1);   // which lifebook a body carries

    const P = arena.P;
    // Lineage. parent[-1] means a founder; these are the substrate for the
    // ancestral tournament and for the family tree the lab notes ask for.
    // IDENTITY, and why a slot index is not one. Arena slots are recycled: when
    // a body dies its slot is handed to an unrelated newborn. So "parent = slot
    // 41" stops meaning anything the moment slot 41 is reused, and a family tree
    // built on slot indices quietly rewires itself into nonsense. Every organism
    // therefore gets a uid that is never reused, and descent is recorded between
    // uids. Slot arrays below describe the CURRENT occupant only.
    this.uid = new Int32Array(P).fill(-1);
    this.parentUid = new Int32Array(P).fill(-1);
    this.parent = new Int32Array(P).fill(-1);  // parent's SLOT at time of birth
    this.birthStep = new Int32Array(P);
    // How long each body gets. Drawn once at birth so a body has a fate rather
    // than a per-tick coin flip — the difference matters because a hazard rate
    // gives an exponential lifetime distribution with many very short lives,
    // and a drawn lifespan gives a peak at maxAge, which is what "dies at about
    // n" means.
    this.lifespan = new Float32Array(P).fill(maxAge);
    this.generation = new Int32Array(P);
    this.lineage = new Int32Array(P);          // founder uid, carried down a line
    this.nextUid = 0;

    // The birth log is the family tree, and it survives slot reuse because it
    // is keyed on uids. This is the substrate the ancestral tournament needs:
    // who descended from whom is a physical fact about how a body came to be.
    this.history = [];
    this.historyCap = 200000;

    for (let o = 0; o < P; o++) {
      if (!arena.alive[o]) continue;
      this.uid[o] = this.nextUid++;
      this.lineage[o] = this.uid[o];
    }

    this.births = 0; this.deaths = 0; this.ticks = 0;
    this.blockedBirths = 0; this.warnedBlocked = false;
    this.founders = this.alive();
  }

  alive() {
    let n = 0;
    for (let o = 0; o < this.arena.P; o++) if (this.arena.alive[o]) n++;
    return n;
  }

  /**
   * One evolutionary tick: read energy, starve the bankrupt, divide the rich.
   * Call every few hundred physics steps, not every step.
   * @returns {object} what happened, for the HUD and for logging
   */
  async tick(step) {
    const { arena, world, cells } = this;
    const { pos, energy } = await world.readCells();
    this.ticks++;

    // Per-body energy is a SUM over its cells. No organism-level quantity is
    // stored anywhere in the simulation; it exists only here, as arithmetic.
    const P = arena.P;
    const total = new Float32Array(P);
    const cx = new Float32Array(P), cy = new Float32Array(P);
    for (let o = 0; o < P; o++) {
      if (!arena.alive[o]) { total[o] = -Infinity; continue; }
      const from = arena.off[o], n = arena.cnt[o];
      let e = 0, sx = 0, sy = 0;
      for (let i = from; i < from + n; i++) {
        e += energy[i]; sx += pos[i * 2]; sy += pos[i * 2 + 1];
      }
      total[o] = e; cx[o] = sx / n; cy[o] = sy / n;
    }

    // ------------------------------------------------------------ death
    //
    // TWO WAYS TO DIE, and until now there was one.
    //
    // STARVATION was the only cause, and in a world where bodies sit at 92% of
    // their energy ceiling it almost never fires. Measured: a mean lifetime of
    // 218,640 steps, an arena 95.9% full, and births exactly tracking deaths
    // because a birth can only happen when a slot frees. Generation time was
    // therefore set by how rarely something happened to starve — 83,517 steps
    // per generation, which is 65 generations in 5.4 million steps.
    //
    // SENESCENCE is the second. A body is allotted a span at birth, gaussian
    // around maxAge, and dies when it runs out. Drawn once rather than rolled
    // per tick on purpose: a per-tick hazard gives an exponential distribution
    // with a mass of very short lives, while a drawn span gives a peak at
    // maxAge, which is what "dies at about n" actually means.
    //
    // NOT GENOMIC, and that is deliberate. Every other capacity here is evolved,
    // but an evolvable lifespan has one optimum — longer — so evolution would
    // set it to infinity and restore exactly the regime this removes. Tissue
    // wearing out is a property of the physics, like brainTax, not a strategy a
    // lineage may opt out of.
    const dead = [];
    for (let o = 0; o < P; o++) {
      if (!arena.alive[o]) continue;
      if (total[o] <= this.deathEnergy || !Number.isFinite(total[o])) { dead.push(o); continue; }
      if (this.maxAge > 0 && (step - this.birthStep[o]) > this.lifespan[o]) {
        dead.push(o);
        this.agedOut = (this.agedOut ?? 0) + 1;
      }
    }
    // Never let the world empty out: a population of zero cannot recover, and a
    // run that silently ends is worse than one that visibly stagnates.
    const living = this.alive();
    const keepAlive = Math.max(0, Math.min(dead.length, living - 8));
    for (let i = 0; i < keepAlive; i++) { this.cull(dead[i]); this.deaths++; }

    // ------------------------------------------------------------ birth
    const rich = [];
    for (let o = 0; o < P; o++) {
      // Threshold PER CELL, so a large body is not permanently barred from
      // dividing simply for having more cells to fill. A flat threshold made
      // size strictly worse and would have masked whatever growth is worth.
      // THRESHOLD TIED TO WHAT REPRODUCTION ACTUALLY COSTS, not to a stale
      // reference body. This was birthEnergy * (cnt / 12) — the 12 dating from
      // when every body WAS 12 cells. Development now builds ~33, so the bar rose
      // to 50 while a body's mean energy sat at 22: the typical creature could
      // never reproduce and the population bled out through the rich tail only.
      //
      // What a birth needs is enough yolk to build the child, and yolk is
      // yolkFrac of the parent's energy: yolkFrac * E >= cellCost * n. Requiring
      // a margin above that keeps reproduction a real threshold rather than a
      // formality, and it now scales with the true cost instead of a constant
      // someone chose for a body size that no longer exists.
      const need = Math.max(
        this.birthEnergy,
        (this.cellCost * arena.cnt[o] / Math.max(0.05, this.yolkFrac)) * this.birthMargin);
      if (arena.alive[o] && total[o] >= need) rich.push(o);
    }

    // WHO GETS THE SCARCE SLOTS, among those that already earned the right.
    //
    // Sorting by energy and serving the richest first is a SECOND selection on
    // top of the threshold, and a far harsher one: when slots are scarce only
    // the extreme tail ever reproduces. Run long enough that fixes one lineage
    // and the population goes clonal — observed collapsing from 600 founders to
    // a SINGLE surviving line, after which adaptation depends entirely on new
    // mutation because there is no standing variation left to select on. That
    // is a well-known route to stagnation, and it was imposed by the scheduler
    // rather than by anything about the world.
    //
    // The lottery keeps the threshold — a body must still have paid for itself
    // — and then draws at random among those that have. Selection stays, the
    // second unintended winner-takes-all does not.
    if (this.birthOrder === 'rich') {
      rich.sort((a, b) => total[b] - total[a]);
    } else {
      for (let i = rich.length - 1; i > 0; i--) {
        const j = (this.rnd() * (i + 1)) | 0;
        [rich[i], rich[j]] = [rich[j], rich[i]];
      }
    }

    // What each body is worth this tick, so development can size the yolk from
    // the parent's actual means rather than a constant.
    this.lastEnergy = total;

    let born = 0, blocked = 0;
    for (const p of rich) {
      // DISPERSAL. An offspring laid on top of its parent competes with it for
      // the same patch immediately, and with crowding suppression that is a
      // shared starvation rather than a shared meal. Measured at the extreme: a
      // world bootstrapped from one cell divides once and then both bodies sit
      // at equilibrium forever, never reaching the birth threshold again.
      //
      // Offspring are therefore placed a body-scale distance away, in a
      // direction the parent does not choose. This is not a behaviour and not
      // parental care — it is where an egg ends up when it is not glued on.
      const dAng = this.rnd() * Math.PI * 2;
      // HOW FAR, IN UNITS OF A REAL LENGTH. This was a constant 9 that I picked
      // by sweeping until a bootstrap worked — a knob nobody chose wearing the
      // name of a trait.
      //
      // The base is ten average cell widths of THIS parent, which is a length
      // the world actually contains rather than one I invented. On top of that a
      // gene scales it, because how far to throw your eggs is a life-history
      // trait with a real tradeoff — far escapes kin competition but lands on
      // unknown ground, near keeps known-good ground but competes with your own
      // offspring. Noise is gaussian, not uniform: a spread of landing places
      // with a mode, which is what scattering looks like.
      let wsum = 0, wn = 0;
      for (let i = 0; i < arena.cnt[p]; i++) {
        const r = cells.rad ? cells.rad[arena.off[p] + i] : 0.34;
        if (r > 0) { wsum += r * 2; wn++; }
      }
      const cellW = wn ? wsum / wn : 0.68;
      const gene = this.dispersalOf ? (this.dispersalOf[p] ?? 0) : 0;
      // Box-Muller, clamped so a tail draw cannot fling an egg across the world.
      const u1 = Math.max(1e-9, this.rnd()), u2 = this.rnd();
      const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const dR = Math.max(cellW,
        cellW * 10 * (0.5 + 1.5 * (0.5 * (gene + 1))) * (1 + 0.3 * Math.max(-2, Math.min(2, gauss))));
      const bnd = this.world?.params?.bound ?? 64;
      const wrapc = (v) => v > bnd ? v - 2 * bnd : (v < -bnd ? v + 2 * bnd : v);
      const child = this.divide(
        p, wrapc(cx[p] + Math.cos(dAng) * dR), wrapc(cy[p] + Math.sin(dAng) * dR), step, pos);
      // -2 is a failed egg: development ran out of yolk or specified a body too
      // small to live. That is a normal outcome and the parent simply lost the
      // investment. -1 is the arena refusing room, which is a real failure and
      // must still stop the loop loudly.
      if (child === -2) continue;
      if (child < 0) { blocked++; break; }
      born++; this.births++;
    }
    // A birth that cannot find room is not a normal outcome, it is the arena
    // failing, and it must never be silent again. Fragmentation stopped
    // evolution for thousands of ticks while every other number looked healthy.
    this.blockedBirths += blocked;
    if (blocked && !this.warnedBlocked) {
      this.warnedBlocked = true;
      const holes = arena.free.map(h => h[1]).sort((a, b) => b - a);
      console.warn(`[evolve] a birth found no contiguous room: ${holes.reduce((s, v) => s + v, 0)} ` +
        `slots free across ${holes.length} holes, largest ${holes[0] ?? 0}. ` +
        `Size the arena with buildBodies({ maxCells }) for the bodies evolution can reach.`);
    }

    return {
      alive: this.alive(), born, died: keepAlive,
      meanEnergy: this.meanOf(total),
      maxGeneration: this.maxGeneration(),
      lineages: this.countLineages(),
      births: this.births, deaths: this.deaths, blockedBirths: this.blockedBirths,
    };
  }

  /**
   * Copy a parent into a free slot with mutation, and halve the parent's energy.
   *
   * Reproduction through a single act of copying is what makes the offspring
   * CLONAL, which is what makes cooperation between its cells stable — the
   * snowflake-yeast argument. It also costs: the parent pays half its surplus,
   * so dividing is an energy event, not a free win.
   */
  divide(p, px, py, step, livePos = null) {
    if (this.devo) {
      if (!this.genome[p]) this.genome[p] = this.D.randomGenome(this.rnd);
      return this.divideDevo(p, px, py, step);
    }
    return this.divideCopy(p, px, py, step, livePos);
  }

  /**
   * Reproduction as development: mutate the genome, lay an egg with yolk, and
   * build whatever that genome specifies. The child's body is NOT derived from
   * the parent's body — only from the parent's genome — so acquired shape
   * cannot be inherited and the size of the offspring is an outcome of
   * development rather than a mutated cell count.
   *
   * Development can FAIL. If the yolk runs out before enough cells are built,
   * or the genome specifies a body too small to be viable, the egg is lost and
   * the parent has spent the investment anyway. eggs.md asks for exactly this:
   * reproduction as a process in time and space that can fail, rather than a
   * point-event that always succeeds.
   */
  divideDevo(p, px, py, step) {
    const { arena, world, cells } = this;
    const r = this.rnd;
    const bK = cells.bondK, K = arena.K;

    const g = this.D.mutate(this.genome[p], r,
      { rate: this.mutRate, size: this.mutSize });

    // Eggs are laid facing a random way, or every animal in the world would
    // share one anterior direction and the flow field would select on a
    // coincidence of the code rather than on anything the genome did.
    //
    // Drawn HERE, before development, because the egg's bearing is not only
    // where the hatchling will point. Development happens inside the egg, in
    // the egg's own coordinates, and the world's heat reaches it through the
    // shell — so which face of the embryo is the warm one depends on which way
    // the egg is lying. Gene products stay in the quadrant they were made in;
    // the warmth does not.
    const th = r() * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);

    // The yolk is a fixed share of what the parent has managed to accumulate.
    // A poor parent lays a small egg and may lay one that cannot finish.
    const yolk = this.yolkFrac * Math.max(0, this.lastEnergy?.[p] ?? this.birthEnergy);
    const grown = this.D.develop(g, {
      extent: this.eggExtent, yolk, cellCost: this.cellCost,
      maxCells: this.maxCells,
      // The egg's bearing in the world, so the shell's warm side is where the
      // world actually put it. Inert unless the thermal layer is switched on.
      heatPhase: th,
      ...this.devoOpts,
    });
    let body = grown.cells;
    if (body.length > this.maxCells) body = body.slice(0, this.maxCells);
    // One organism, not two. Development may specify tissue in separate lobes;
    // only the largest connected piece is built.
    const whole = largestPiece(body, bondCells(body, { maxDegree: bK }));
    body = whole.cells;
    const bonds = whole.bonds;
    if (body.length < this.minCells) { this.failedEggs++; return -2; }

    const n = body.length;
    const child = arena.birth(n);
    if (child < 0) return -1;
    const dst = arena.off[child];

    const B = world.params.bound;
    const wrap = (v) => (v > B ? v - 2 * B : v < -B ? v + 2 * B : v);

    // pos is a POSE: xy, then theta and omega. See world_gpu.js binding 1.
    const pos = new Float32Array(n * 4), vel = new Float32Array(n * 4);
    const meta = new Int32Array(n * 4), energy = new Float32Array(n);
    const bnd = new Int32Array(n * bK).fill(-1);
    const brest = new Float32Array(n * bK);
    const bstiff = new Float32Array(n * bK).fill(1);
    const bbrit = new Float32Array(n * bK);
    // The continuous capacities the physics actually scales by. `describe()`
    // still assigns a label for the kernel's discrete needs (sensing, anchor
    // grip), but contraction is proportional to THIS, so a cell that narrowly
    // lost the argmax still pulls its bonds in proportion to how contractile
    // it is. Negative expression means no capacity, not reverse capacity.
    // Normalise ap over the body that actually developed, not over the egg —
    // a body occupying one end of a large egg would otherwise get a phase
    // gradient compressed into a fraction of a cycle.
    let apLo = Infinity, apHi = -Infinity;
    for (let i = 0; i < n; i++) { const a = body[i].ap; if (a < apLo) apLo = a; if (a > apHi) apHi = a; }
    const apSpan = Math.max(1e-6, apHi - apLo);

    // A NEW CHAPTER. The egg copies its parent's lifebook with variation, and
    // that is where a line divides. Cells inside a body share it and are
    // therefore clonal.
    const book = this.lineageLog.book(this.bookOf[p] ?? -1, step);
    this.bookOf[child] = book;
    // The zygote's parent is a cell in the PARENT body, not in this one — that
    // is what makes the egg continuous with its mother rather than spontaneous.
    const parentSeed = (cells.uid && arena.alive[p] && arena.cnt[p] > 0)
      ? cells.uid[arena.off[p]] : CELLZERO;
    const localId = new Float64Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      const c = body[i];
      const wx = wrap(px + c.x * ct - c.y * st);
      const wy = wrap(py + c.x * st + c.y * ct);
      pos[i * 4] = wx; pos[i * 4 + 1] = wy;
      // A hatchling points the way its egg was pointing. Development works in
      // egg coordinates and does not yet emit a per-cell heading, so the egg's
      // own orientation is the only honest thing to seed from — and it gives a
      // fresh body a coherent axis to ratchet along instead of every cell
      // pointing a different way. The bond twist coupling maintains it.
      pos[i * 4 + 2] = th;
      pos[i * 4 + 3] = 0;
      vel[i * 4 + 2] = cells.rad ? cells.rad[dst + i] || 0.34 : 0.34;

      const type = describe(c);
      // Negative expression is no capacity, not reverse capacity.
      const con = Math.max(0, c.contract), gri = Math.max(0, c.grip);
      // The cell's position along the body axis, normalised 0..1 over THIS
      // body. A travelling wave is a phase gradient along that axis, so the
      // kernel needs it per cell; c.ap is already what development laid the
      // cell out against, so this is a re-encoding, not a new fact.
      const apN = (c.ap - apLo) / apSpan;
      // Mint identity. devo2 hands back which cell each cell budded from as a
      // LOCAL index; cells are emitted in creation order, so a mother always
      // already has its id by the time its daughter is minted.
      const mom = (c.mother >= 0 && localId[c.mother] >= 0) ? localId[c.mother] : parentSeed;
      const cid = this.lineageLog.cell(mom, -1, book, step);
      localId[i] = cid;
      if (cells.uid) {
        cells.uid[dst + i] = cid;
        cells.parentA[dst + i] = mom;
        cells.parentB[dst + i] = -1;
        cells.lifebook[dst + i] = book;
      }
      // senseTune IS the cell's sense gene. packMeta documents it as a signed
      // value whose MAGNITUDE is acuity and whose SIGN picks the world axis —
      // which is exactly the shape of `c.sense`. Nobody ever wired the two
      // together, so `c.senseTune ?? 0` was 0 for every cell ever developed, and
      // therefore senseAcuity() was 0 everywhere in the world.
      //
      // That is not a small miscalibration. All three sense channels read
      //   mix(noise, signal, acuity)
      // so at acuity 0 every sensor in the world has been reading PURE NOISE —
      // the compass, the terrain channel and creature perception alike — while
      // senseCost, which is also scaled by acuity, charged nothing for it.
      // Sensing was free, universal, and informationless. It is the best
      // available explanation for why no closed sense->decide->move loop has
      // ever appeared here.
      meta[i * 4] = packMeta(type, con, gri, apN, c.senseTune ?? c.sense ?? 0);
      meta[i * 4 + 1] = dst + i;
      meta[i * 4 + 2] = child;
      meta[i * 4 + 3] = packSize(n, c.tag ?? 0.5, Math.max(0, c.toughness ?? 0), c.enzyme ?? 0.5);
      if (cells.contractility) cells.contractility[dst + i] = con;
      if (cells.grippiness) cells.grippiness[dst + i] = gri;
      cells.ctype[dst + i] = type;
      cells.body[dst + i] = child; cells.bodySize[dst + i] = n;
      cells.cslot[dst + i] = dst + i;
      cells.px[dst + i] = wx; cells.py[dst + i] = wy;
      cells.vx[dst + i] = 0; cells.vy[dst + i] = 0;
      if (cells.rad) cells.rad[dst + i] = 0.34;
      arena.cell[dst + i] = dst + i;
      arena.bias[dst + i] = c.bias;
      arena.invTau[dst + i] = 1 / Math.max(0.05, c.tau);
      arena.state[dst + i] = 0; arena.act[dst + i] = 0;
      energy[i] = 0;
    }

    const deg = new Int32Array(n);
    const adj = Array.from({ length: n }, () => []);
    for (const b of bonds) {
      if (b.i >= n || b.j >= n) continue;
      adj[b.i].push(b.j); adj[b.j].push(b.i);
      if (deg[b.i] < bK) {
        const k = deg[b.i]++;
        bnd[b.i * bK + k] = dst + b.j; brest[b.i * bK + k] = b.rest;
        bstiff[b.i * bK + k] = b.stiff; bbrit[b.i * bK + k] = b.brittle;
      }
      if (deg[b.j] < bK) {
        const k = deg[b.j]++;
        bnd[b.j * bK + k] = dst + b.i; brest[b.j * bK + k] = b.rest;
        bstiff[b.j * bK + k] = b.stiff; bbrit[b.j * bK + k] = b.brittle;
      }
    }

    // The brain is the body's own connectivity: a cell may only synapse onto
    // cells it is physically bonded to, so wiring has length and modularity is
    // anatomical rather than a designed prior. Weights are EXPRESSED from what
    // the two endpoints are made of, never stored per edge, so a child that
    // developed a different body is not wearing its parent's connectome.
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < K; k++) {
        arena.esrc[(dst + i) * K + k] = -1;
        arena.ew[(dst + i) * K + k] = 0;
      }
      let k = 0;
      for (const j of adj[i]) {
        if (k >= K) break;
        arena.esrc[(dst + i) * K + k] = dst + j;
        arena.ew[(dst + i) * K + k] = this.D.synapse(g, body[j], body[i]);
        k++;
      }
    }

    // THE PARENT PAYS THE YOLK. This was computed and then never deducted, so
    // reproduction was free: a parent could lay egg after egg without ever
    // getting poorer, each one a juvenile starting at zero energy that mostly
    // starved. Deaths ran about 20% above births indefinitely and no lineage
    // got past generation 3. An unpriced capability is the same error as an
    // energy mint wearing different clothes.
    const pn = arena.cnt[p], src = arena.off[p];
    const parentLeft = Math.max(0, (this.lastEnergy?.[p] ?? 0) - yolk) / Math.max(1, pn);
    world.writeCellRange(src, pn, { energy: new Float32Array(pn).fill(parentLeft) });

    // Whatever the yolk did not spend on construction is what the hatchling has
    // to live on. Building tissue consumes energy — that is where the loss in
    // this conversion goes, and every conversion has to lose something.
    energy.fill(Math.max(0, yolk - grown.spent) / n);

    // The brain the genome just expressed has to reach the GPU, or the kernel
    // keeps running whatever was in these slots before.
    world.brains.writeBrainRange(arena, dst, n);

    cells.bond.set(bnd, dst * bK); cells.brest.set(brest, dst * bK);
    world.writeCellRange(dst, n, {
      pos, vel, meta, bond: bnd, brest, bstiff, bbrittle: bbrit, energy,
    });

    // Carry the child's expressed dispersal, so ITS offspring travel the
    // distance its own tissue specifies.
    { let dsum = 0; for (const c of body) dsum += (c.dispersal ?? 0);
      this.dispersalOf[child] = body.length ? dsum / body.length : 0; }
    this.genome[child] = g;
    this.bookkeep(child, p, step);
    return child;
  }

  divideCopy(p, px, py, step, livePos = null) {
    const { arena, world, cells } = this;
    const pn = arena.cnt[p];

    // MORPHOGENESIS, such as it is: body size is heritable and mutates by one
    // cell at a time. Without this the body plan is frozen — only brains and
    // cell types could evolve — and there is no structural axis for complexity
    // to grow along at all. A body that grows gains digestive efficiency
    // (see world_gpu.js) and pays more total brain tax, so the size that pays
    // is discovered rather than set.
    let n = pn;
    if (this.rnd() < this.sizeMutRate) n += this.rnd() < 0.5 ? -1 : 1;
    n = Math.max(this.minCells, Math.min(this.maxCells, n));

    const child = arena.birth(n);
    if (child < 0) return -1;

    const src = arena.off[p], dst = arena.off[child];
    const K = arena.K, bK = cells.bondK;
    const m = this.mutRate, sz = this.mutSize;
    const r = this.rnd;

    // Cells map around the ring proportionally, so a child with one more cell
    // interpolates its parent's plan rather than truncating it. src(i) is the
    // parent cell this child cell is a copy of.
    const srcOf = (i) => Math.min(pn - 1, Math.floor(i * pn / n));

    // --- brain: per-neuron dynamics, then the edge table, both mutated
    for (let i = 0; i < n; i++) {
      const si = srcOf(i);
      arena.bias[dst + i] = arena.bias[src + si] + (r() < m ? (r() * 2 - 1) * sz : 0);
      // Mutate tau in log space and clamp to evodevo.js's evolved range, so a
      // mutation cannot produce a time constant the f32 integrator stalls on
      // (see the tau/epsilon note in brainarena.js).
      const tau = 1 / Math.max(arena.invTau[src + si], 1e-6);
      const tau2 = r() < m ? tau * Math.exp((r() * 2 - 1) * sz) : tau;
      arena.invTau[dst + i] = 1 / Math.min(1.89, Math.max(0.24, tau2));
      arena.stride[dst + i] = arena.stride[src + i];
      arena.state[dst + i] = 0;
      arena.act[dst + i] = 0;
    }
    for (let i = 0; i < n; i++) {
      const si = srcOf(i);
      for (let k = 0; k < K; k++) {
        const s = arena.esrc[(src + si) * K + k];
        // Edge sources are ABSOLUTE, so a copy must be rebased into the child's
        // island or the offspring would wire itself into its parent's brain —
        // which validate() forbids and which would be telepathy besides.
        // Rebase into the child's island, and remap through the size change so
        // an edge still points at the corresponding cell rather than off the
        // end of a smaller body.
        arena.esrc[(dst + i) * K + k] = s < 0 ? -1
          : dst + Math.min(n - 1, Math.floor((s - src) * n / pn));
        let w = arena.ew[(src + si) * K + k];
        if (s >= 0 && r() < m) w += (r() * 2 - 1) * sz;
        // Structural mutation: an edge may appear or vanish, so connectivity
        // itself evolves rather than only its weights.
        if (r() < m * 0.25) {
          if (s < 0) {
            arena.esrc[(dst + i) * K + k] = dst + ((r() * n) | 0);
            w = (r() * 2 - 1) * 1.2;
          } else {
            arena.esrc[(dst + i) * K + k] = -1; w = 0;
          }
        }
        // CLAMPED. A weight is a random walk with no restoring force and
        // nothing else bounds it. Over enough generations the sum over K edges
        // reaches magnitudes where the integrator produces infinities, and once
        // a brain state is non-finite it stays that way and spreads along every
        // edge out of it. It takes thousands of generations to bite, which is
        // exactly long enough to surface as an unexplained failure in a long run
        // rather than as a bug while developing.
        arena.ew[(dst + i) * K + k] = Math.max(-12, Math.min(12, w));
      }
    }

    // --- body: TOPOLOGY is heritable now, not just size and cell type
    //
    // The bond graph IS the body plan. Previously it was rebuilt as a ring plus
    // one chord every time, so every creature in every generation had the same
    // shape and the only structural freedom was how many cells were in the ring
    // — one dimension, with a saturating payoff, which is why it plateaued. A
    // graph is combinatorial instead: chains, lobes, branches and dense clumps
    // are all reachable, and none of them is written down anywhere.
    //
    // Shape is not placed, it is GROWN. Cells start jittered inside a small disc
    // and the bond springs pull them into whatever configuration the graph
    // implies. Nothing computes a layout; morphology is what the physics settles
    // into, which is the only way it stays a consequence rather than a design.
    const pos = new Float32Array(n * 4), vel = new Float32Array(n * 4);
    const meta = new Int32Array(n * 4), energy = new Float32Array(n);
    const bond = new Int32Array(n * bK).fill(-1), brest = new Float32Array(n * bK);

    const spin = r() * Math.PI * 2;
    const ox = px + Math.cos(spin) * 2.6, oy = py + Math.sin(spin) * 2.6;
    const b = world.params.bound;
    const wrap = (v) => v > b ? v - 2 * b : (v < -b ? v + 2 * b : v);

    // Inherit the parent's graph, remapped through any size change.
    const adj = Array.from({ length: n }, () => new Set());
    for (let i = 0; i < n; i++) {
      const si = srcOf(i);
      for (let k = 0; k < bK; k++) {
        const pj = cells.bond[(src + si) * bK + k];
        if (pj < 0) continue;
        const rel = pj - src;
        const cj = Math.min(n - 1, Math.floor(rel * n / pn));
        if (cj !== i) { adj[i].add(cj); adj[cj].add(i); }
      }
    }
    // A newly added cell arrives attached to its neighbours, or it would be a
    // free-floating cell that is nominally part of a body it cannot feel.
    for (let i = 0; i < n; i++) {
      if (adj[i].size === 0) {
        const a = (i + 1) % n, c = (i + n - 1) % n;
        adj[i].add(a); adj[a].add(i); adj[i].add(c); adj[c].add(i);
      }
    }

    // Enforce the per-cell bond budget SYMMETRICALLY, before anything reads it.
    //
    // Inheritance can hand a cell more neighbours than it has slots: when a
    // child is smaller than its parent, several parent cells remap onto one
    // child cell and their edges pile up. The write loop below silently keeps
    // the first bondK, which drops the rest — and drops them in ONE DIRECTION
    // only, so the partner still lists a bond that no longer exists. That is
    // both a disconnection and an asymmetric spring pair, which is exactly the
    // Newton's-third-law violation the physics tests exist to catch.
    const enforceCap = () => {
      for (let i = 0; i < n; i++) {
        while (adj[i].size > bK) {
          const victim = [...adj[i]].pop();
          adj[i].delete(victim); adj[victim].delete(i);
        }
      }
    };
    enforceCap();

    // Structural mutation: rewire, add, or drop a connection.
    const degree = (i) => adj[i].size;
    // Add bonds LOCALLY — between two cells that already share a neighbour.
    //
    // Joining arbitrary pairs makes graphs that cannot be embedded in the plane
    // with every edge at the one rest length, so the body is permanently
    // frustrated: it cannot reach a configuration that satisfies its own bonds
    // and sits stretched forever. Measured on a long run, the median bond was
    // 4.7x its rest length and the tail reached 56x, with the springs winning
    // against flow drag by three orders of magnitude — the stretch was not a
    // force imbalance, it was a graph with no solution.
    //
    // Triangle closure keeps additions local, which keeps the graph roughly
    // planar and therefore satisfiable, and is what cells physically do: they
    // adhere to neighbours, not to arbitrary distant cells.
    const tryAdd = () => {
      const i = (r() * n) | 0;
      const nbrs = [...adj[i]];
      if (nbrs.length < 2) return;
      const j = nbrs[(r() * nbrs.length) | 0];
      const k = nbrs[(r() * nbrs.length) | 0];
      if (j === k || adj[j].has(k) || degree(j) >= bK || degree(k) >= bK) return;
      adj[j].add(k); adj[k].add(j);
    };
    const tryDrop = () => {
      const i = (r() * n) | 0;
      if (adj[i].size === 0) return;
      const list = [...adj[i]];
      const j = list[(r() * list.length) | 0];
      adj[i].delete(j); adj[j].delete(i);
    };
    for (let t = 0; t < 2; t++) {
      if (r() < this.topoMutRate) tryAdd();
      if (r() < this.topoMutRate) tryDrop();
    }

    // A body must stay ONE connected component — that is what makes it a body
    // at all, and WORLD.md defines a creature as exactly that. A mutation that
    // severs it would produce an organism that is physically two things.
    //
    // Repaired by MERGING COMPONENTS, not by patching stray cells. An earlier
    // version walked from cell 0, then attached anything unreached to a reached
    // host and marked it done — which silently left disconnected CLUSTERS
    // intact, because attaching one member of a cluster says nothing about the
    // rest of it. 4 bodies in 130 came out fragmented. Recomputing components
    // and joining each to the first is the version that actually terminates
    // with one component.
    const componentOf = () => {
      const comp = new Int32Array(n).fill(-1);
      let c = 0;
      for (let start = 0; start < n; start++) {
        if (comp[start] >= 0) continue;
        const st = [start]; comp[start] = c;
        while (st.length) {
          const i = st.pop();
          for (const j of adj[i]) if (comp[j] < 0) { comp[j] = c; st.push(j); }
        }
        c++;
      }
      return { comp, count: c };
    };

    for (let guard = 0; guard < n * 2; guard++) {
      enforceCap();                          // merging can push a cell over budget
      const { comp, count } = componentOf();
      if (count <= 1) break;
      // Join some cell of the next component to some cell of the first, freeing
      // a slot by force if both ends are saturated — a body that cannot be
      // reconnected any other way is worse than one that loses a bond.
      // Join the CLOSEST available pair across the split, using the parent's
      // geometry as the guide. An arbitrary join is a long-range shortcut the
      // body can never satisfy.
      let a = -1, b = -1, best = Infinity;
      for (let i = 0; i < n; i++) {
        if (comp[i] !== 0 || adj[i].size >= bK) continue;
        for (let j = 0; j < n; j++) {
          if (comp[j] !== 1 || adj[j].size >= bK) continue;
          const si = src + srcOf(i), sj = src + srcOf(j);
          const d = (cells.px[si] - cells.px[sj]) ** 2 + (cells.py[si] - cells.py[sj]) ** 2;
          if (d < best) { best = d; a = i; b = j; }
        }
      }
      // Nothing in this component had a free slot, so free one by force. Guard
      // the empty case: a cell with no bonds at all has nothing to give up, and
      // [...adj[x]][0] on an empty set is undefined, which crashed here on a
      // long run the moment an isolated cell appeared.
      const freeSlot = (x) => {
        if (x < 0 || adj[x].size === 0) return;
        const v = [...adj[x]][0];
        adj[x].delete(v); adj[v].delete(x);
      };
      if (a < 0) { a = comp.indexOf(0); freeSlot(a); }
      if (b < 0) { b = comp.indexOf(1); freeSlot(b); }
      if (a < 0 || b < 0) { break; }        // nothing to join; leave it alone
      adj[a].add(b); adj[b].add(a);
    }

    // Place cells jittered in a disc; the springs do the rest.
    const spread = 0.55 * Math.sqrt(n);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, rad = spread * Math.sqrt(r());
      pos[i * 4] = wrap(ox + Math.cos(a) * rad);
      pos[i * 4 + 1] = wrap(oy + Math.sin(a) * rad);
      pos[i * 4 + 2] = spin;    // the offspring points where it budded
      pos[i * 4 + 3] = 0;

      let type = cells.ctype[src + srcOf(i)];
      if (r() < m * 0.5) type = (r() * 4) | 0;   // neuron, sensor, muscle, anchor
      cells.ctype[dst + i] = type;
      cells.body[dst + i] = child;
      cells.bodySize[dst + i] = n;
      meta[i * 4] = packMeta(type, type === 2 ? 1 : 0, type === 3 ? 1 : 0);
      meta[i * 4 + 1] = dst + i;
      meta[i * 4 + 2] = child;
      // The copy path has no developed properties: middling meat, no armour.
      meta[i * 4 + 3] = packSize(n, 0.5, 0.0, 0.5);
      // This path has no developed properties to read, so the label IS the
      // capacity here. Writing it explicitly matters: arena slots are
      // recycled, and without this a newborn would inherit whatever
      // contractility the previous tenant of these slots happened to have.
      cells.cslot[dst + i] = dst + i;
      cells.px[dst + i] = pos[i * 4]; cells.py[dst + i] = pos[i * 4 + 1];
      cells.vx[dst + i] = 0; cells.vy[dst + i] = 0;
      arena.cell[dst + i] = dst + i;
      energy[i] = 0;
    }

    // Rest length is GENOMIC: inherited from the parent's genome and mutated,
    // never measured from the parent's body.
    //
    // It was measured, briefly, and that was Lamarckism — the giraffe stretches
    // its neck reaching, and its calf is born with the stretched neck written in
    // as its specification. It was introduced to fix geometric frustration and it
    // did, by copying acquired state: a body pulled out of shape by the current
    // passed that shape on as an instruction. Descent copies the genome, and what
    // living does to a body must not flow back into it.
    //
    // The consequence is that an unsatisfiable body plan now STAYS unsatisfiable
    // instead of quietly relaxing into whatever the physics could manage. That is
    // correct and it is harder: selection has to do the work of finding graphs
    // that can be built, which is what selection is for.
    const REST = 0.62;                      // what a bond mutation invents

    // The parent's genomic rest for the bond nearest this pair, perturbed. Falls
    // back to the default for a connection mutation has just invented, which has
    // no ancestor to inherit from.
    const inheritRest = (ci, cj) => {
      const si = src + srcOf(ci);
      for (let k = 0; k < bK; k++) {
        const pj = cells.bond[si * bK + k];
        if (pj < 0) continue;
        const rel = Math.min(n - 1, Math.floor((pj - src) * n / pn));
        if (rel !== cj) continue;
        let v = cells.brest[si * bK + k];
        if (!(v > 0)) v = REST;
        if (r() < m) v *= Math.exp((r() * 2 - 1) * sz);   // scale, so log-space
        return Math.min(1.6, Math.max(0.35, v));
      }
      return REST;
    };
    enforceCap();                            // nothing below may truncate
    for (let i = 0; i < n; i++) {
      let k = 0;
      for (const j of adj[i]) {
        bond[i * bK + k] = dst + j;
        brest[i * bK + k] = inheritRest(i, j);
        k++;
      }
    }

    world.brains.writeBrainRange(arena, dst, n);

    cells.bond.set(bond, dst * bK); cells.brest.set(brest, dst * bK);

    // Half the parent's cell energy goes with the propagule. Division costs.
    const half = new Float32Array(pn);
    world.writeCellRange(dst, n, { pos, vel, meta, bond, brest, energy });
    world.writeCellRange(src, pn, { energy: half });

    this.bookkeep(child, p, step);
    return child;
  }

  /**
   * CELLZERO. The one self-creating cell, and the root every id traces back to.
   *
   * A fresh world starts from a single founder whose cells are all descendants
   * of it. Development is already division from a zygote, so "everything
   * descends from one cell" is true from the first step without needing
   * in-world division to exist yet.
   *
   * A RESUMED world does not call this: it inherits whatever ancestry its
   * snapshot carries, which may be none. History lost is a fact about that run,
   * recorded as parent -1, and is preferable to inventing a lineage that did
   * not happen.
   */
  async seedOrigin(o, step = 0, { place = true } = {}) {
    const { arena, cells } = this;
    if (!arena.alive[o] || !cells.uid) return null;

    // WHERE LIFE STARTS. The resource field is patchy, so a founder dropped at a
    // fixed point is a lottery on the ground beneath it — measured, one founder
    // starves (mean energy -18.8) while four hundred scattered ones thrive
    // (+10.2), because some of the four hundred happen to land somewhere fed.
    //
    // Placing the first cell where the world can support it is a boundary
    // condition, not a thumb on the scale: it says life began somewhere
    // favourable, which is not a controversial claim. Everything after it has to
    // earn its own ground.
    if (place && this.world?.readMotes) {
      try {
        const m = await this.world.readMotes();
        const nM = m.stock.length;
        let bx = 0, by = 0, best = -1;
        for (let t = 0; t < 64 && nM > 0; t++) {
          const c = (Math.floor(this.rnd() * nM)) % nM;
          const px = m.pos[c * 2], py = m.pos[c * 2 + 1];
          let sum = 0;
          for (let j = 0; j < nM; j += Math.max(1, (nM / 400) | 0)) {
            const dx = m.pos[j * 2] - px, dy = m.pos[j * 2 + 1] - py;
            if (dx * dx + dy * dy < 36) sum += m.stock[j];
          }
          if (sum > best) { best = sum; bx = px; by = py; }
        }
        if (best > 0) {
          const off0 = arena.off[o], n0 = arena.cnt[o];
          let cx = 0, cy = 0;
          for (let i = 0; i < n0; i++) { cx += cells.px[off0 + i]; cy += cells.py[off0 + i]; }
          cx /= n0; cy /= n0;
          // Only the cells MOVE here — they keep the headings they had. Writing
          // a full pose would zero theta and omega, so this goes through the
          // xy-only path.
          const posXY = new Float32Array(n0 * 2);
          for (let i = 0; i < n0; i++) {
            cells.px[off0 + i] += bx - cx; cells.py[off0 + i] += by - cy;
            posXY[i * 2] = cells.px[off0 + i]; posXY[i * 2 + 1] = cells.py[off0 + i];
          }
          this.world.writeCellRange(off0, n0, { posXY });
        }
      } catch { /* no motes in this world; leave it where it is */ }
    }
    // ONE ROOT. Founder 0 is cellzero and makes itself; any others are its
    // children, seeded at step 0 rather than grown. That keeps the claim intact:
    // exactly one cell in this world's history was self-created. A populated
    // start is a statement about where the recording begins, not about anything
    // else creating itself.
    const root = this.originRoot ?? null;
    const book = this.lineageLog.book(root ? root.book : -1, step);
    this.bookOf[o] = book;
    const off = arena.off[o], n = arena.cnt[o];
    // The first cell makes itself; every other cell in the founding body is its
    // descendant. That is a claim about this body, not a claim that a 12-cell
    // ring is a plausible zygote — see the note in serve-world about founders.
    let seed;
    if (!root) {
      this.lineageLog.cell(-1, -1, book, step);      // cellzero, self-created
      seed = CELLZERO;
      this.originRoot = { book, cell: CELLZERO };
    } else {
      seed = root.cell;
    }
    // Founders are not born through divide(), so they never got a span there.
    // Without this they are immortal and the oldest lineages never turn over.
    this.lifespan[o] = this.drawLifespan();
    this.birthStep[o] = step;
    for (let i = 0; i < n; i++) {
      const id = (!root && i === 0) ? CELLZERO : this.lineageLog.cell(seed, -1, book, step);
      cells.uid[off + i] = id;
      cells.parentA[off + i] = (!root && i === 0) ? -1 : seed;
      cells.parentB[off + i] = -1;
      cells.lifebook[off + i] = book;
    }
    // CELLZERO IS ENDOWED. A lone founder has no margin: it must feed itself up
    // past the birth threshold before anything else can exist, and at cap 3.0 a
    // cell of energy against a per-body threshold of 18 that is a slow climb
    // from a standing start — measured, it simply sat at 6.0 and never divided.
    //
    // This is a BOUNDARY CONDITION, not a mint. The world already has one: a sun
    // of fixed inflow. Giving the first cell a packed lunch is the same kind of
    // statement — energy that entered at the edge of the model, once, and
    // dissipates like all the rest. Every joule after this traces to the sun.
    if (!root && this.world?.writeCellRange) {
      const e = new Float32Array(n).fill(this.world.params?.eCap ?? 3.0);
      this.world.writeCellRange(off, n, { energy: e });
      if (this.lastEnergy) this.lastEnergy[o] = (this.world.params?.eCap ?? 3.0) * n;
    }
    return book;
  }

  /**
   * INTELLIGENT DESIGN — stamp copies of one creature's genome across the world.
   *
   * This is a HAND OF GOD and is not pretending otherwise. It hands out yolk
   * that no parent paid for, so it MINTS ENERGY, which is the one thing
   * energy-speculative-friction.md forbids the world to do on its own. That is
   * the price of the tool and the reason every use of it is written to the
   * observation log and counted in `interventions`: any measurement taken from
   * a run that has been intervened in is not a measurement of evolution, and
   * has to say so or be retracted.
   *
   * Why have it at all: a genome that dies out because it landed badly is not
   * the same as a genome that cannot make a living, and there is no way to tell
   * those apart by watching. Replaying one design into a hundred different
   * addresses — the same body against mud, coast, upland and open water at once
   * — separates the design from its luck in one step. It is a controlled
   * transplant, and the control is that all hundred are the same genome.
   *
   * @param {number} p        arena slot of the creature to copy
   * @param {object} o
   * @param {number} o.copies how many to scatter
   * @param {number} o.mutate multiplier on the usual mutation rate; 0 = clones
   * @param {number} o.step   world step, for the lineage record
   */
  implant(p, { copies = 100, mutate = 1, step = 0, genome = null } = {}) {
    const { arena } = this;
    if (!arena.alive[p] || !this.genome[p]) {
      return { ok: false, error: 'that creature is no longer in the world' };
    }
    const keepRate = this.mutRate, keepSize = this.mutSize;
    const keepE = this.lastEnergy ? this.lastEnergy[p] : null;
    // A DESIGNED genome, borrowing a living slot as its donor. The slot is only
    // ever a place to stand: divideDevo reads the genome from it, so swapping
    // one in and putting the original back is the whole mechanism, and the
    // occupant is untouched either way. Restored in the same synchronous block
    // as the swap, so nothing can observe the world mid-substitution.
    const keepG = this.genome[p];
    if (genome && genome.length === keepG.length) {
      this.genome[p] = Float32Array.from(genome);
    }
    // mutate 0 gives literal clones — a hundred identical bodies in a hundred
    // places, which is the cleanest form of the question "was it the design or
    // the address?"
    this.mutRate = Math.min(1, this.mutRate * mutate);
    this.mutSize = this.mutSize * mutate;
    // Each copy gets a standard egg's worth of yolk instead of a share of the
    // donor's savings, so a poor donor is not punished for being copied and the
    // hundred are comparable to each other.
    if (this.lastEnergy) this.lastEnergy[p] = this.birthEnergy / Math.max(0.05, this.yolkFrac);

    const B = this.world.params.bound;
    let made = 0, noRoom = 0, failedEgg = 0;
    for (let k = 0; k < copies; k++) {
      const x = (this.rnd() * 2 - 1) * B, y = (this.rnd() * 2 - 1) * B;
      const c = this.divideDevo(p, x, y, step);
      if (c >= 0) made++;
      else if (c === -1) noRoom++;
      else failedEgg++;
    }

    this.mutRate = keepRate; this.mutSize = keepSize;
    this.genome[p] = keepG;
    if (this.lastEnergy) this.lastEnergy[p] = keepE;
    this.interventions = (this.interventions ?? 0) + 1;
    // Energy conjured, stated in the world's own units so the size of the lie
    // is on the record rather than merely its existence.
    this.mintedEnergy = (this.mintedEnergy ?? 0) + made * this.birthEnergy;
    return { ok: true, made, noRoom, failedEgg,
             interventions: this.interventions, mintedEnergy: this.mintedEnergy };
  }

  /**
   * A body's allotted span, in steps. Gaussian around maxAge, clamped so no
   * body is born already dead and none is effectively immortal.
   */
  drawLifespan() {
    if (!(this.maxAge > 0)) return Infinity;
    const u1 = Math.max(1e-9, this.rnd()), u2 = this.rnd();
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const span = this.maxAge * (1 + this.ageSpread * Math.max(-2.5, Math.min(2.5, g)));
    return Math.max(this.maxAge * 0.15, span);
  }

  /** Lineage bookkeeping, shared by both reproduction paths. */
  bookkeep(child, p, step) {
    const uid = this.nextUid++;
    this.uid[child] = uid;
    this.parentUid[child] = this.uid[p];
    this.parent[child] = p;
    this.birthStep[child] = step;
    this.lifespan[child] = this.drawLifespan();
    this.generation[child] = this.generation[p] + 1;
    this.lineage[child] = this.lineage[p];
    if (this.history.length < this.historyCap) {
      this.history.push({
        uid, parentUid: this.uid[p], slot: child,
        generation: this.generation[child], lineage: this.lineage[child], step,
      });
    }
  }

  /**
   * Remove an organism's cells from the world before its slot is freed.
   *
   * Marking the type negative is what makes a cell absent rather than merely
   * unowned: the hash skips it, physics skips it, sensing skips it, and the
   * renderer skips it. Without this a corpse keeps competing for the ground it
   * died on. Must be called BEFORE arena.death(), which clears off/cnt.
   */
  vacate(o) {
    const { arena, world, cells } = this;
    if (!arena.alive[o]) return;
    const from = arena.off[o], n = arena.cnt[o];
    const meta = new Int32Array(n * 4);
    const energy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      cells.ctype[from + i] = -1;
      cells.body[from + i] = -1;
      cells.bodySize[from + i] = 0;
      meta[i * 4] = -1; meta[i * 4 + 1] = -1; meta[i * 4 + 2] = -1;
    }
    world.writeCellRange(from, n, { meta, energy });
  }

  /**
   * Remove an organism entirely: out of the world, then out of the arena.
   *
   * Always use this rather than arena.death() directly. death() clears off/cnt,
   * so afterwards there is no way to find the cells that need vacating — the
   * order is not a style preference, it is the only order that works.
   */
  cull(o) {
    this.vacate(o);
    this.arena.death(o);
    this.uid[o] = -1;                          // the slot no longer names anyone
  }

  meanOf(total) {
    let s = 0, n = 0;
    for (let o = 0; o < total.length; o++)
      if (Number.isFinite(total[o])) { s += total[o]; n++; }
    return n ? s / n : 0;
  }

  maxGeneration() {
    let g = 0;
    for (let o = 0; o < this.arena.P; o++)
      if (this.arena.alive[o]) g = Math.max(g, this.generation[o]);
    return g;
  }

  /**
   * How many founding lines still have living descendants.
   *
   * This is the honest measure of whether anything is happening: it can only
   * fall, and a sweep to a handful means some lineages out-reproduced the rest.
   * It presumes no species — a lineage is just "descended from this founder",
   * which is descent and nothing more.
   */
  countLineages() {
    const seen = new Set();
    for (let o = 0; o < this.arena.P; o++)
      if (this.arena.alive[o]) seen.add(this.lineage[o]);
    return seen.size;
  }
}
