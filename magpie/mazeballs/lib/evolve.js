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
    sizeMutRate = 0.25, minCells = 5, maxCells = 40, topoMutRate = 0.30,
    birthOrder = 'lottery',
  }) {
    this.arena = arena; this.world = world; this.cells = cells;
    this.birthEnergy = birthEnergy; this.deathEnergy = deathEnergy;
    this.mutRate = mutRate; this.mutSize = mutSize;
    this.sizeMutRate = sizeMutRate; this.topoMutRate = topoMutRate;
    this.birthOrder = birthOrder;
    this.minCells = minCells; this.maxCells = maxCells;
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
    for (let o = 0; o < P; o++)
      // Threshold PER CELL, so a large body is not permanently barred from
      // dividing simply for having more cells to fill. A flat threshold made
      // size strictly worse and would have masked whatever growth is worth.
      if (arena.alive[o] && total[o] >= this.birthEnergy * (arena.cnt[o] / 12)) rich.push(o);

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

    let born = 0, blocked = 0;
    for (const p of rich) {
      const child = this.divide(p, cx[p], cy[p], step, pos);
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
        arena.ew[(dst + i) * K + k] = w;
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
      if (r() < m * 0.5) type = (r() * 3) | 0;
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

    // Rest length is INHERITED FROM THE PARENT'S REALISED GEOMETRY, not a
    // constant.
    //
    // A single uniform rest length silently demands that every evolvable graph
    // be embeddable in the plane at that one spacing. Almost none are: measured
    // on an evolved population, every cell had saturated to degree 4, and four
    // neighbours at a fixed 0.62 in 2D requires a lattice. The result was 88% of
    // bonds stretched with 6% compressed and a whole-body minimum strain of
    // 1.12 — the fingerprint of a graph that does not fit, since a frustrated
    // network under real forces shows compression balancing tension. Median
    // strain reached 4.7x and the bodies could never reach the shape their
    // genome specified.
    //
    // Taking the rest length a bond ACTUALLY sits at in the parent makes the
    // configuration satisfiable by construction, which is exactly why bodies
    // straight out of buildBodies (whose rests are their true initial spacing)
    // hold at strain 1.00 under every stiffness from 10 to 400. Shape still
    // comes from topology plus physics rather than a genome-encoded geometry —
    // what a bond remembers is where the tissue rested, which is what a rest
    // length is supposed to mean.
    const REST = 0.62;                      // for bonds mutation just invented
    const bound2 = world.params.bound;
    const mi = (v) => v > bound2 ? v - 2 * bound2 : (v < -bound2 ? v + 2 * bound2 : v);
    const parentDist = (ci, cj) => {
      if (!livePos) return REST;
      const a = src + srcOf(ci), b2 = src + srcOf(cj);
      if (a === b2) return REST;
      const d = Math.hypot(mi(livePos[b2 * 2] - livePos[a * 2]),
                           mi(livePos[b2 * 2 + 1] - livePos[a * 2 + 1]));
      // Clamped: a bond the parent was itself dragging far out of shape should
      // not be inherited as a permanent instruction to stay that long.
      return Math.min(1.6, Math.max(0.35, d));
    };
    enforceCap();                            // nothing below may truncate
    for (let i = 0; i < n; i++) {
      let k = 0;
      for (const j of adj[i]) {
        bond[i * bK + k] = dst + j;
        brest[i * bK + k] = parentDist(i, j);
        k++;
      }
    }

    cells.bond.set(bond, dst * bK); cells.brest.set(brest, dst * bK);

    // Half the parent's cell energy goes with the propagule. Division costs.
    const half = new Float32Array(pn);
    world.writeCellRange(dst, n, { pos, vel, meta, bond, brest, energy });
    world.writeCellRange(src, pn, { energy: half });

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
