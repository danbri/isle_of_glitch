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
 * EVO-DEVO, HONESTLY SCOPED. The genome carries the brain (per-neuron tau and
 * bias, the full edge table) and the body's cell TYPES — so what a cell becomes
 * is heritable and mutable, and the sensor/muscle/interneuron mix is evolved
 * rather than fixed at a third each. What it does NOT yet carry is a
 * developmental program that grows the body plan: offspring inherit the parent's
 * cell count and ring topology. Type differentiation is heritable; morphogenesis
 * is not. lib/evodevo.js has the real developmental machinery and merging it is
 * the next step, not something this file pretends to have done.
 */

/** Deterministic PRNG so a run is a pure function of its seed. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

import {
  GENOME_SIZE, randomGenome, mutate as mutateGenome, develop, bond as bondCells,
  synapse, morphology, largestPiece,
} from './devo.js';

/**
 * A cell's TYPE is a description of its properties, not a stored fact. Whichever
 * of its continuous capacities dominates is what we call it, and if none does it
 * is an interneuron. This is the treatment CELLS.md asks for: the type is a
 * label we read off the tissue for the physics kernel's benefit, and the genome
 * never writes one.
 */
function describe(c) {
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
    sizeMutRate = 0.25, minCells = 5, maxCells = 40, topoMutRate = 0.30,
    birthOrder = 'lottery',
    devo = true, yolkFrac = 0.55, cellCost = 0.55, eggExtent = 3.0, birthMargin = 1.15,
  }) {
    this.arena = arena; this.world = world; this.cells = cells;
    this.birthEnergy = birthEnergy; this.deathEnergy = deathEnergy;
    this.mutRate = mutRate; this.mutSize = mutSize;
    this.sizeMutRate = sizeMutRate; this.topoMutRate = topoMutRate;
    this.birthOrder = birthOrder;
    this.minCells = minCells; this.maxCells = maxCells;
    this.rnd = rng(seed);
    // EVO-DEVO. Each organism carries a genome; a body is what that genome
    // develops into, never a copy of its parent's body.
    this.devo = devo;
    this.yolkFrac = yolkFrac;
    this.cellCost = cellCost;
    this.eggExtent = eggExtent;
    this.birthMargin = birthMargin;
    this.genome = new Array(arena.P).fill(null);
    this.failedEggs = 0;

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
    const dead = [];
    for (let o = 0; o < P; o++) {
      if (!arena.alive[o]) continue;
      if (total[o] <= this.deathEnergy || !Number.isFinite(total[o])) dead.push(o);
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
      const child = this.divide(p, cx[p], cy[p], step, pos);
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
      if (!this.genome[p]) this.genome[p] = randomGenome(this.rnd);
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

    const g = mutateGenome(this.genome[p], r,
      { rate: this.mutRate, size: this.mutSize });

    // The yolk is a fixed share of what the parent has managed to accumulate.
    // A poor parent lays a small egg and may lay one that cannot finish.
    const yolk = this.yolkFrac * Math.max(0, this.lastEnergy?.[p] ?? this.birthEnergy);
    const grown = develop(g, {
      extent: this.eggExtent, yolk, cellCost: this.cellCost,
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

    // Eggs are laid facing a random way, or every animal in the world would
    // share one anterior direction and the flow field would select on a
    // coincidence of the code rather than on anything the genome did.
    const th = r() * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
    const B = world.params.bound;
    const wrap = (v) => (v > B ? v - 2 * B : v < -B ? v + 2 * B : v);

    const pos = new Float32Array(n * 2), vel = new Float32Array(n * 4);
    const meta = new Int32Array(n * 4), energy = new Float32Array(n);
    const bnd = new Int32Array(n * bK).fill(-1);
    const brest = new Float32Array(n * bK);
    const bstiff = new Float32Array(n * bK).fill(1);
    const bbrit = new Float32Array(n * bK);

    for (let i = 0; i < n; i++) {
      const c = body[i];
      const wx = wrap(px + c.x * ct - c.y * st);
      const wy = wrap(py + c.x * st + c.y * ct);
      pos[i * 2] = wx; pos[i * 2 + 1] = wy;
      vel[i * 4 + 2] = cells.rad ? cells.rad[dst + i] || 0.34 : 0.34;

      const type = describe(c);
      meta[i * 4] = type; meta[i * 4 + 1] = dst + i;
      meta[i * 4 + 2] = child; meta[i * 4 + 3] = n;
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
        arena.ew[(dst + i) * K + k] = synapse(g, body[j], body[i]);
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
    const pos = new Float32Array(n * 2), vel = new Float32Array(n * 4);
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
      pos[i * 2] = wrap(ox + Math.cos(a) * rad);
      pos[i * 2 + 1] = wrap(oy + Math.sin(a) * rad);

      let type = cells.ctype[src + srcOf(i)];
      if (r() < m * 0.5) type = (r() * 4) | 0;   // neuron, sensor, muscle, anchor
      cells.ctype[dst + i] = type;
      cells.body[dst + i] = child;
      cells.bodySize[dst + i] = n;
      meta[i * 4] = type;
      meta[i * 4 + 1] = dst + i;
      meta[i * 4 + 2] = child;
      meta[i * 4 + 3] = n;
      cells.cslot[dst + i] = dst + i;
      cells.px[dst + i] = pos[i * 2]; cells.py[dst + i] = pos[i * 2 + 1];
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

  /** Lineage bookkeeping, shared by both reproduction paths. */
  bookkeep(child, p, step) {
    const uid = this.nextUid++;
    this.uid[child] = uid;
    this.parentUid[child] = this.uid[p];
    this.parent[child] = p;
    this.birthStep[child] = step;
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
