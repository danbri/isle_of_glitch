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
  }) {
    this.arena = arena; this.world = world; this.cells = cells;
    this.birthEnergy = birthEnergy; this.deathEnergy = deathEnergy;
    this.mutRate = mutRate; this.mutSize = mutSize;
    this.rnd = rng(seed);

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
    // Anyone above the surplus threshold divides, richest first so the scarce
    // slots go to the bodies that actually earned them.
    const rich = [];
    for (let o = 0; o < P; o++)
      if (arena.alive[o] && total[o] >= this.birthEnergy) rich.push(o);
    rich.sort((a, b) => total[b] - total[a]);

    let born = 0;
    for (const p of rich) {
      const child = this.divide(p, cx[p], cy[p], step);
      if (child < 0) break;                    // arena full; the rest wait
      born++; this.births++;
    }

    return {
      alive: this.alive(), born, died: keepAlive,
      meanEnergy: this.meanOf(total),
      maxGeneration: this.maxGeneration(),
      lineages: this.countLineages(),
      births: this.births, deaths: this.deaths,
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
  divide(p, px, py, step) {
    const { arena, world, cells } = this;
    const n = arena.cnt[p];
    const child = arena.birth(n);
    if (child < 0) return -1;

    const src = arena.off[p], dst = arena.off[child];
    const K = arena.K, bK = cells.bondK;
    const m = this.mutRate, sz = this.mutSize;
    const r = this.rnd;

    // --- brain: per-neuron dynamics, then the edge table, both mutated
    for (let i = 0; i < n; i++) {
      arena.bias[dst + i] = arena.bias[src + i] + (r() < m ? (r() * 2 - 1) * sz : 0);
      // Mutate tau in log space and clamp to evodevo.js's evolved range, so a
      // mutation cannot produce a time constant the f32 integrator stalls on
      // (see the tau/epsilon note in brainarena.js).
      const tau = 1 / Math.max(arena.invTau[src + i], 1e-6);
      const tau2 = r() < m ? tau * Math.exp((r() * 2 - 1) * sz) : tau;
      arena.invTau[dst + i] = 1 / Math.min(1.89, Math.max(0.24, tau2));
      arena.stride[dst + i] = arena.stride[src + i];
      arena.state[dst + i] = 0;
      arena.act[dst + i] = 0;
    }
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < K; k++) {
        const s = arena.esrc[(src + i) * K + k];
        // Edge sources are ABSOLUTE, so a copy must be rebased into the child's
        // island or the offspring would wire itself into its parent's brain —
        // which validate() forbids and which would be telepathy besides.
        arena.esrc[(dst + i) * K + k] = s < 0 ? -1 : (s - src) + dst;
        let w = arena.ew[(src + i) * K + k];
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
        arena.ew[(dst + i) * K + k] = w;
      }
    }

    // --- body: cell types are heritable and mutable; the ring plan is not
    const pos = new Float32Array(n * 2), vel = new Float32Array(n * 2);
    const meta = new Int32Array(n * 2), energy = new Float32Array(n);
    const bond = new Int32Array(n * bK).fill(-1), brest = new Float32Array(n * bK);

    const spin = r() * Math.PI * 2;
    // Place the propagule just clear of the parent, in a random direction.
    const ox = px + Math.cos(spin) * 2.6, oy = py + Math.sin(spin) * 2.6;
    const b = world.params.bound;
    const wrap = (v) => v > b ? v - 2 * b : (v < -b ? v + 2 * b : v);

    for (let i = 0; i < n; i++) {
      const a = spin + (i / n) * Math.PI * 2;
      const rad = 1.1 * (0.9 + r() * 0.2);
      pos[i * 2] = wrap(ox + Math.cos(a) * rad);
      pos[i * 2 + 1] = wrap(oy + Math.sin(a) * rad);

      let type = cells.ctype[src + i];
      if (r() < m * 0.5) type = (r() * 3) | 0;      // what a cell becomes evolves
      cells.ctype[dst + i] = type;
      meta[i * 2] = type;
      meta[i * 2 + 1] = dst + i;                    // its brain slot
      cells.cslot[dst + i] = dst + i;
      cells.px[dst + i] = pos[i * 2]; cells.py[dst + i] = pos[i * 2 + 1];
      cells.vx[dst + i] = 0; cells.vy[dst + i] = 0;
      arena.cell[dst + i] = dst + i;
      energy[i] = 0;
    }

    // Ring bonds plus one chord, both directions, exactly as buildBodies does.
    const add = (from, to, rest) => {
      const base = from * bK;
      for (let k = 0; k < bK; k++)
        if (bond[base + k] === -1) { bond[base + k] = dst + to; brest[base + k] = rest; return; }
    };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const rest = Math.hypot(pos[i * 2] - pos[j * 2], pos[i * 2 + 1] - pos[j * 2 + 1]);
      add(i, j, rest); add(j, i, rest);
    }
    if (n >= 6) {
      const j = n >> 1;
      const rest = Math.hypot(pos[0] - pos[j * 2], pos[1] - pos[j * 2 + 1]);
      add(0, j, rest); add(j, 0, rest);
    }
    cells.bond.set(bond, dst * bK); cells.brest.set(brest, dst * bK);

    // Half the parent's cell energy goes with the propagule. Division costs.
    const half = new Float32Array(arena.cnt[p]);
    world.writeCellRange(dst, n, { pos, vel, meta, bond, brest, energy });
    world.writeCellRange(src, arena.cnt[p], { energy: half });

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
    return child;
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
    const meta = new Int32Array(n * 2);
    const energy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      cells.ctype[from + i] = -1;
      meta[i * 2] = -1; meta[i * 2 + 1] = -1;
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
