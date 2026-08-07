/**
 * One CTRNN arena for the whole world — every beast's brain in one flat buffer.
 *
 * WHY ONE BUFFER. Brains vary in size per creature (a 6-neuron genome and a
 * 40-neuron genome are both legal), and there may be thousands of them. Padding
 * every brain to a worst-case max wastes most of the buffer and still branches
 * per organism in the update. Instead: one neuron arena, and organism `o` owns
 * the half-open slot range [off[o], off[o]+cnt[o]). One kernel updates every
 * neuron in the world identically, with no per-organism branch.
 *
 * A SLOT IS A CELL. A neuron is not an abstract index — it is a cell in the
 * world that happens to have CTRNN-like behaviour, a subtype alongside muscle
 * and sensor cells, with a position, a body, and everything else a cell has.
 * So `cell[slot]` maps every neuron slot to the world cell it IS, and that
 * mapping is part of the arena's state, not an optional decoration: without it
 * an activation cannot be drawn, a tapped cell cannot report whether it thinks,
 * and a sensor cell cannot know which slot to drive. What the update KERNEL
 * needs is narrower than what the arena knows — the two passes below never read
 * `cell`, which is why they stay branch-free — but that is a property of the
 * arithmetic, not a claim that the data model is body-blind.
 *
 * The reverse direction (cell -> slot) deliberately lives on the cell side, as
 * a `brainSlot` field that is EMPTY for cells that do not think. The arena does
 * not know how many cells exist in the world and should not have to.
 *
 * (The analogy between these and gene-regulatory-network graphs, which are also
 * CTRNN-shaped, is set aside for now — same idiom, different subtype, later.)
 *
 * ISLANDS. Each organism is an ISLAND: its edges may only address slots inside
 * its own range. Sharing a buffer is a storage and dispatch decision, not a
 * claim that beasts share a mind — a synapse leaping between two unrelated
 * bodies has no chemical or contact basis and WORLD.md's first law forbids it.
 * The constraint is enforced when wiring (`connect`) and checked wholesale by
 * `validate()`; the step kernel does NOT re-check, because a bounds test per
 * edge per step is pure cost once the invariant holds. Edge sources are stored
 * ABSOLUTE (not island-relative) so the kernel never has to look up an
 * organism's offset — the island rule is a wiring-time invariant, not a
 * read-time one.
 *
 * FIXED DEGREE. Every neuron has exactly K incoming edge slots, so the edge
 * table is a dense [N,K] array rather than a variable-degree graph — the latter
 * is the thing that does not parallelise. Real connectivity is sparser than K:
 * an unused slot is src=-1 and contributes nothing. Sparsity is expressed by
 * empty slots, not by a ragged structure.
 *
 * PRECISION IS f32, DELIBERATELY. WGSL has no f64 at all, so f32 is what the
 * GPU will compute in whatever we do here. Storing state as f64 on the CPU and
 * porting later would mean testing at a precision the real runtime never has,
 * and discovering the rounding surprises after the port. f32 now, everywhere,
 * including the snapshot.
 *
 * The integrator is the leaky-integrator Euler form already used in
 * lib/evodevo.js:
 *
 *     act   = tanh(state + bias)
 *     state += (SUM w*act[src] + ext - state) * dt / tau
 *
 * split into two passes (activation, then accumulate) exactly as it would be
 * dispatched in WGSL: pass 1 writes every activation, pass 2 gathers K of them
 * per neuron. Computing tanh inline per edge instead would cost K tanh calls
 * per neuron rather than one.
 *
 * A NOTE ON tau AND f32. dt/tau is the increment scale, and f32's epsilon is
 * RELATIVE (~6e-8 for a state of order 1). With dt=0.015 and tau in [0.24,
 * 1.89]s — evodevo.js's evolved range — dt/tau is 8e-3..6e-2 and there is no
 * problem. Push tau toward an hour and dt/tau falls to ~4e-6, so near
 * equilibrium the increment drops below epsilon and the addition is silently
 * discarded: the integrator does not merely lose precision, it STALLS, at a
 * point that depends on the state's magnitude. That is what `stride` is
 * reserved for — updating a slow class every N steps with dt_eff = N*dt keeps
 * dt_eff/tau resolvable. Nothing in this file acts on stride yet (all zero =
 * every step); it exists so the slow-signalling cell classes can arrive without
 * a snapshot format migration.
 */

const MAGIC = 0x414e5242;            // 'BRNA' little-endian — full arena
const MAGIC_STATE = 0x534e5242;      // 'BRNS'                — state delta only
const VERSION = 1;
const HEADER_BYTES = 32;
const STATE_HEADER_BYTES = 24;
const EMPTY = -1;                     // edge slot with no source

/* ------------------------------------------------------------------- arena */

export class BrainArena {
  /**
   * @param {object} [o]
   * @param {number} [o.neurons=4096]  neuron slot capacity (N)
   * @param {number} [o.degree=16]     incoming edges per neuron (K)
   * @param {number} [o.organisms=512] organism slot capacity (P)
   * @param {number} [o.dt=0.015]      integration step, seconds — matches softbody DT
   */
  constructor({ neurons = 4096, degree = 16, organisms = 512, dt = 0.015 } = {}) {
    this.N = neurons; this.K = degree; this.P = organisms;
    // f32-rounded at construction, not merely stored as f32. dt is what the GPU
    // will multiply by, in f32; holding an f64 dt on the CPU would make the CPU
    // and GPU integrate at fractionally different rates, and would make a
    // snapshot round trip lossy (0.015 returns as 0.014999999664723873, which
    // drifts a restored run away from the one it resumed).
    this.dt = Math.fround(dt);
    this.steps = 0;
    // Bumped by every structural change (birth, death, wiring). A watcher that
    // holds a full snapshot can poll cheap state deltas for as long as this
    // matches, and re-fetches the topology only when it moves. See snapshotState.
    this.topologyEpoch = 0;

    // --------------------------------------------------------- per neuron
    this.state = new Float32Array(this.N);      // membrane state (current)
    this.next = new Float32Array(this.N);       // double buffer, as ScalarField does
    this.act = new Float32Array(this.N);        // tanh(state + bias), pass-1 output
    this.bias = new Float32Array(this.N);
    // 1/tau, not tau: the kernel multiplies rather than divides, which is both
    // cheaper and one less place for a divide-by-zero to appear on the GPU.
    this.invTau = new Float32Array(this.N);
    this.stride = new Uint32Array(this.N);      // reserved multi-rate class; 0 = every step
    // Which world cell each slot IS. EMPTY until bound — an arena can be wired
    // and stepped before the bodies exist (tests, ancestor replay), but nothing
    // can be rendered or sensed until this is filled in.
    this.cell = new Int32Array(this.N).fill(EMPTY);

    // ---------------------------------------------------------- per edge
    this.esrc = new Int32Array(this.N * this.K).fill(EMPTY);
    this.ew = new Float32Array(this.N * this.K);

    // ------------------------------------------------------ per organism
    this.off = new Int32Array(this.P).fill(EMPTY);
    this.cnt = new Int32Array(this.P);
    this.alive = new Uint8Array(this.P);

    // Free list of holes as [offset, count] pairs, kept sorted by offset so
    // free() can coalesce with its neighbours. Allocation happens on birth —
    // rare, CPU-side bookkeeping — so first-fit is ample and the simplicity is
    // worth more than the packing.
    this.free = [[0, this.N]];
  }

  /* ------------------------------------------------------------ lifecycle */

  /**
   * Claim `n` contiguous neuron slots for a new organism.
   * @returns {number} organism index, or -1 if no slot or no room.
   */
  birth(n) {
    if (n <= 0) throw new Error(`birth(${n}): brains need at least one neuron`);
    let o = -1;
    for (let i = 0; i < this.P; i++) if (!this.alive[i]) { o = i; break; }
    if (o === EMPTY) return EMPTY;

    // BEST FIT, not first fit.
    //
    // This took the first hole large enough and left the remainder behind. With
    // bodies varying from 2 to 60 cells and constant birth/death churn, that
    // shreds the arena: every oversized hole a small body lands in leaves a
    // sliver, and slivers are never reusable by anything but the smallest
    // bodies. Coalescing does not save you — it can only merge holes that are
    // ADJACENT, and scattered deaths do not produce adjacent holes.
    //
    // Measured on the live world when this was found: 541 cell slots free, room
    // for roughly 43 more bodies at the observed 12.5 cells each, and births
    // being refused anyway because no single hole was big enough. The space was
    // there; it was in the wrong shape.
    //
    // Taking the SMALLEST hole that fits keeps the large ones intact for the
    // large bodies that actually need contiguity, and puts each sliver-producing
    // allocation where the sliver is smallest.
    let best = -1, bestC = Infinity;
    for (let h = 0; h < this.free.length; h++) {
      const fc = this.free[h][1];
      if (fc < n || fc >= bestC) continue;
      best = h; bestC = fc;
      if (fc === n) break;                // exact fit; nothing can beat it
    }
    if (best >= 0) {
      const h = best, [fo, fc] = this.free[h];
      if (fc === n) this.free.splice(h, 1);
      else this.free[h] = [fo + n, fc - n];
      this.off[o] = fo; this.cnt[o] = n; this.alive[o] = 1;
      this.topologyEpoch++;
      // A recycled range carries the previous tenant's state and edges. Clear
      // it, or a newborn inherits a dead beast's synapses — and, worse, edges
      // pointing outside its own island.
      this.clearRange(fo, n);
      return o;
    }
    return EMPTY;                       // arena full
  }

  /** Release an organism's slots back to the free list, coalescing holes. */
  death(o) {
    if (!this.alive[o]) return;
    const fo = this.off[o], fc = this.cnt[o];
    this.clearRange(fo, fc);
    this.alive[o] = 0; this.off[o] = EMPTY; this.cnt[o] = 0;
    this.topologyEpoch++;

    let i = 0;
    while (i < this.free.length && this.free[i][0] < fo) i++;
    this.free.splice(i, 0, [fo, fc]);
    // Coalesce with the following hole, then the preceding one, so a long
    // birth/death churn cannot fragment the arena into unusable slivers.
    if (i + 1 < this.free.length && this.free[i][0] + this.free[i][1] === this.free[i + 1][0]) {
      this.free[i][1] += this.free[i + 1][1];
      this.free.splice(i + 1, 1);
    }
    if (i > 0 && this.free[i - 1][0] + this.free[i - 1][1] === this.free[i][0]) {
      this.free[i - 1][1] += this.free[i][1];
      this.free.splice(i, 1);
    }
  }

  clearRange(o, n) {
    this.state.fill(0, o, o + n); this.next.fill(0, o, o + n);
    this.act.fill(0, o, o + n); this.bias.fill(0, o, o + n);
    this.invTau.fill(0, o, o + n); this.stride.fill(0, o, o + n);
    this.cell.fill(EMPTY, o, o + n);
    this.esrc.fill(EMPTY, o * this.K, (o + n) * this.K);
    this.ew.fill(0, o * this.K, (o + n) * this.K);
  }

  /* -------------------------------------------------------------- wiring */

  /** Set neuron `i` of organism `o` (island-relative index) to tau/bias. */
  setNeuron(o, i, { tau = 1, bias = 0 } = {}) {
    if (tau <= 0) throw new Error(`setNeuron: tau must be > 0, got ${tau}`);
    const s = this.slot(o, i);
    this.invTau[s] = 1 / tau; this.bias[s] = bias;
    this.topologyEpoch++;
  }

  /**
   * Wire island-relative `from` -> `to` within organism `o`, in edge slot `k`.
   * Both endpoints are island-relative, so a caller cannot express a cross-body
   * edge even by accident: `slot()` bounds-checks against this organism's range
   * and the stored absolute index is derived, never supplied.
   */
  connect(o, from, to, weight, k) {
    if (k < 0 || k >= this.K) throw new Error(`connect: edge slot ${k} outside degree ${this.K}`);
    const src = this.slot(o, from), dst = this.slot(o, to);
    this.esrc[dst * this.K + k] = src;
    this.ew[dst * this.K + k] = weight;
    this.topologyEpoch++;
  }

  /**
   * Bind neuron `i` of organism `o` to the world cell it is. The caller owns
   * the reverse mapping (cell.brainSlot = the returned slot).
   * @returns {number} the absolute slot, so the caller can store it cell-side.
   */
  bindCell(o, i, cellId) {
    const s = this.slot(o, i);
    this.cell[s] = cellId;
    this.topologyEpoch++;
    return s;
  }

  /** The world cell a slot is, or -1 if unbound. */
  cellOf(slot) { return this.cell[slot]; }

  /** World cell ids of organism `o`'s neurons, island-relative order. */
  cellsOf(o) { return this.cell.subarray(this.off[o], this.off[o] + this.cnt[o]); }

  /** Island-relative index -> absolute slot, bounds-checked. */
  slot(o, i) {
    if (!this.alive[o]) throw new Error(`organism ${o} is not alive`);
    if (i < 0 || i >= this.cnt[o]) throw new Error(`neuron ${i} outside organism ${o}'s ${this.cnt[o]}`);
    return this.off[o] + i;
  }

  /**
   * Check the island invariant across the whole arena: every live edge points
   * inside its own organism's range, and no edge belongs to a dead slot. The
   * step kernel assumes this; call it after wiring and after restore.
   * @returns {string[]} violations, empty when sound.
   */
  validate() {
    const bad = [];
    const owner = new Int32Array(this.N).fill(EMPTY);
    for (let o = 0; o < this.P; o++)
      if (this.alive[o]) owner.fill(o, this.off[o], this.off[o] + this.cnt[o]);

    for (let d = 0; d < this.N; d++) {
      for (let k = 0; k < this.K; k++) {
        const s = this.esrc[d * this.K + k];
        if (s === EMPTY) continue;
        if (owner[d] === EMPTY) { bad.push(`edge on dead slot ${d}`); continue; }
        if (s < 0 || s >= this.N) { bad.push(`edge ${d}.${k} source ${s} out of arena`); continue; }
        if (owner[s] !== owner[d])
          bad.push(`edge ${d}.${k}: organism ${owner[d]} -> ${owner[s]} crosses islands`);
      }
    }
    return bad;
  }

  /* ---------------------------------------------------------------- step */

  /**
   * One integration step over every neuron in the arena.
   *
   * Both passes are free of sequential dependency between neurons — pass 1 is
   * elementwise, pass 2 gathers from `act` (last pass's output, never this
   * pass's) and writes `next`. That is the natural two-dispatch WGSL shape;
   * nothing here reads a value another neuron wrote in the same pass.
   *
   * @param {Float32Array|null} ext  per-neuron external drive (sensors), or null
   */
  step(ext = null) {
    const { N, K, state, next, act, bias, invTau, esrc, ew, dt } = this;

    for (let i = 0; i < N; i++) act[i] = Math.tanh(state[i] + bias[i]);

    for (let i = 0; i < N; i++) {
      let acc = ext ? ext[i] : 0;
      const base = i * K;
      for (let k = 0; k < K; k++) {
        const s = esrc[base + k];
        if (s !== EMPTY) acc += ew[base + k] * act[s];
      }
      next[i] = state[i] + (acc - state[i]) * dt * invTau[i];
    }

    this.state.set(next);
    this.steps++;
  }

  /** Activations of organism `o`, island-relative — what motors/logging read. */
  readAct(o) {
    return this.act.subarray(this.off[o], this.off[o] + this.cnt[o]);
  }

  /* ------------------------------------------------------------ snapshot */

  /**
   * Serialise the whole arena to one binary blob.
   *
   * Binary, not JSON: these arrays reach tens of megabytes at target scale, and
   * JSON round-trips roughly 3x larger and far slower to parse — which matters
   * because the browser polls these to watch a headless Deno run.
   *
   * The free list is NOT stored; `restore` rebuilds it from the organism table,
   * so there is one source of truth for what is allocated and no way for the
   * two to disagree across a round trip.
   *
   * Little-endian is assumed and asserted at restore. Every platform this
   * targets (arm64/x64 Deno, every WebGPU browser) is little-endian; typed
   * arrays use host order, so a big-endian host would silently misread rather
   * than fail, and an explicit magic check turns that into an error.
   */
  snapshot() {
    const { N, K, P } = this;
    const bytes = HEADER_BYTES
      + 4 * N * 6            // state, bias, invTau, act, stride, cell
      + 4 * N * K * 2        // esrc, ew
      + 4 * P * 2 + P;       // off, cnt, alive
    const buf = new ArrayBuffer(bytes);
    const head = new DataView(buf);
    head.setUint32(0, MAGIC, true);
    head.setUint32(4, VERSION, true);
    head.setUint32(8, N, true);
    head.setUint32(12, K, true);
    head.setUint32(16, P, true);
    head.setUint32(20, this.steps, true);
    head.setFloat32(24, this.dt, true);
    head.setUint32(28, this.topologyEpoch, true);

    let at = HEADER_BYTES;
    const put = (arr) => {
      new Uint8Array(buf, at, arr.byteLength).set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
      at += arr.byteLength;
    };
    // `act` is stored even though step() recomputes it, so a restored arena is
    // readable (readAct, the debug inspector) before it has taken a step.
    put(this.state); put(this.bias); put(this.invTau); put(this.act); put(this.stride);
    put(this.cell);
    put(this.esrc); put(this.ew);
    put(this.off); put(this.cnt); put(this.alive);
    return new Uint8Array(buf);
  }

  /**
   * Serialise ONLY what changes every step: the membrane state and activations.
   *
   * Measured at 10k beasts x 32 neurons with K=16, a full snapshot is 45 MB, of
   * which 41 MB is the edge table — and edges move only on birth or mutation
   * while `state` moves every step. Polling the whole arena to watch a run means
   * re-sending the topology thousands of times for nothing. This delta is 2.6 MB
   * at that size: the browser fetches a full snapshot once, then polls these.
   *
   * `topologyEpoch` is the guard. A delta only applies to an arena whose
   * structure has not moved since; when it has, restoreState refuses and the
   * watcher knows to re-fetch the full snapshot rather than silently painting
   * activations onto a body plan that no longer exists.
   */
  snapshotState() {
    const { N } = this;
    const buf = new ArrayBuffer(STATE_HEADER_BYTES + 4 * N * 2);
    const head = new DataView(buf);
    head.setUint32(0, MAGIC_STATE, true);
    head.setUint32(4, VERSION, true);
    head.setUint32(8, N, true);
    head.setUint32(12, this.steps, true);
    head.setUint32(16, this.topologyEpoch, true);
    let at = STATE_HEADER_BYTES;
    for (const arr of [this.state, this.act]) {
      new Uint8Array(buf, at, arr.byteLength).set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
      at += arr.byteLength;
    }
    return new Uint8Array(buf);
  }

  /**
   * Apply a `snapshotState()` delta onto this arena in place.
   * @throws if the delta came from a differently-shaped arena or a different
   *         topology epoch — see snapshotState for why that must be fatal.
   */
  restoreState(bytes) {
    const head = new DataView(bytes.buffer, bytes.byteOffset);
    if (head.getUint32(0, true) !== MAGIC_STATE)
      throw new Error('not a BrainArena state delta (bad magic)');
    if (head.getUint32(4, true) !== VERSION) throw new Error('state delta version mismatch');
    const N = head.getUint32(8, true);
    if (N !== this.N) throw new Error(`state delta is for ${N} neurons, arena has ${this.N}`);
    const epoch = head.getUint32(16, true);
    if (epoch !== this.topologyEpoch)
      throw new Error(`state delta is epoch ${epoch}, arena is ${this.topologyEpoch} — refetch the full snapshot`);

    this.steps = head.getUint32(12, true);
    let at = bytes.byteOffset + STATE_HEADER_BYTES;
    for (const arr of [this.state, this.act]) {
      new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).set(new Uint8Array(bytes.buffer, at, arr.byteLength));
      at += arr.byteLength;
    }
    this.next.set(this.state);
  }

  /** Rebuild an arena from `snapshot()` bytes. */
  static restore(bytes) {
    const buf = bytes.buffer, base = bytes.byteOffset;
    const head = new DataView(buf, base);
    if (head.getUint32(0, true) !== MAGIC)
      throw new Error('not a BrainArena snapshot (bad magic — or a big-endian host)');
    const version = head.getUint32(4, true);
    if (version !== VERSION) throw new Error(`snapshot version ${version}, expected ${VERSION}`);

    const N = head.getUint32(8, true), K = head.getUint32(12, true), P = head.getUint32(16, true);
    const a = new BrainArena({ neurons: N, degree: K, organisms: P, dt: head.getFloat32(24, true) });
    a.steps = head.getUint32(20, true);
    a.topologyEpoch = head.getUint32(28, true);

    let at = base + HEADER_BYTES;
    const take = (arr) => {
      new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength).set(new Uint8Array(buf, at, arr.byteLength));
      at += arr.byteLength;
    };
    take(a.state); take(a.bias); take(a.invTau); take(a.act); take(a.stride);
    take(a.cell);
    take(a.esrc); take(a.ew);
    take(a.off); take(a.cnt); take(a.alive);
    a.next.set(a.state);

    // Rebuild the free list from what the organism table says is occupied.
    const used = new Uint8Array(N);
    for (let o = 0; o < P; o++)
      if (a.alive[o]) used.fill(1, a.off[o], a.off[o] + a.cnt[o]);
    a.free = [];
    let run = -1;
    for (let i = 0; i <= N; i++) {
      const u = i < N ? used[i] : 1;
      if (!u && run < 0) run = i;
      else if (u && run >= 0) { a.free.push([run, i - run]); run = -1; }
    }
    return a;
  }
}
