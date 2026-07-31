/**
 * Evo/Devo Field — simulation core.
 *
 * No DOM, no WebGL, no globals. The browser page and the headless Node runners
 * both import this file, so there is exactly one implementation of the biology.
 *
 * TensorFlow.js is injected rather than imported, because the browser gets it
 * from a CDN script tag as a global while Node gets it from a package:
 *
 *   browser  useTf(window.tf)
 *   node     useTf(await import('@tensorflow/tfjs'))            // pure JS, CPU
 *   node     useTf(await import('@tensorflow/tfjs-node'))       // native, faster
 *
 * Every random draw goes through an injected seedable RNG, so a run is
 * reproducible from its seed alone — necessary if sweeps are going to be
 * compared against each other rather than against noise.
 */

let tf = (typeof globalThis !== 'undefined' && globalThis.tf) || null;

/** Provide the TensorFlow.js implementation. Accepts a module or a namespace. */
export function useTf(lib) {
  tf = lib && lib.default && lib.default.tensor ? lib.default : lib;
  return tf;
}
function T() {
  if (!tf) throw new Error('TensorFlow.js has not been provided — call useTf(tf) first');
  return tf;
}

export const DEFAULTS = Object.freeze({
  POP: 192, CELLS: 12, GENES: 10, SENSORS: 8,
  FOOD: 42, HAZARDS: 18, OBSTACLES: 8,
  DT: 0.018, EPOCH_STEPS: 1450, DEV_STEPS: 48,
  ELITES: 10, WORLD_BOUND: 0.94, AGENT_RADIUS: 0.017,
  VIEW_STRIDE: 9, TRAIL_POINTS: 300,
  // A patch grazed by one agent empties in ~3s of sim time and takes ~15s to
  // come back. An epoch is 26s, so a squatter starves and a forager does not.
  FOOD_CONSUME: 0.40, FOOD_REGROW: 0.09,
  ACC_COLS: 9,
  // Scales the developed recurrent matrix. 2.0 was the original and rails the
  // network; 0.5 puts the mean max-row-sum near 1.2, where tanh is still steep.
  GAIN: 0.5, SAT_LEVEL: 0.95, WALL_LEVEL: 0.93,
  MUTATION: 0.10, MUTATE_R: 0.16, MUTATE_M: 0.22,
});

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Deterministic LCG. Also used to seed TensorFlow's random ops. */
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 0x8f3d20a1;
  const step = () => (s = (Math.imul(1664525, s) + 1013904223) >>> 0);
  return { next: () => step() / 4294967296, int: () => step(), state: () => s };
}

/* ------------------------------------------------------------------ world */

export function makeWorld(cfg = DEFAULTS, rng = makeRng(0x8f3d20a1)) {
  const obstacles = [[-.57,-.35,.13],[-.42,.36,.095],[-.04,-.08,.115],[.18,.50,.10],
                     [.46,.17,.14],[.60,-.48,.105],[-.03,.70,.075],[.69,.68,.08]];
  const clearPoint = (x, y, margin = .08) =>
    obstacles.every(o => Math.hypot(x - o[0], y - o[1]) > o[2] + margin);
  // Always returns exactly `count` points: after `guard` rejections the
  // clearance test is dropped, so callers can rely on the length.
  const points = (count) => {
    const out = []; let guard = 0;
    while (out.length < count) {
      const x = (rng.next() * 1.72) - .86, y = (rng.next() * 1.72) - .86;
      if (clearPoint(x, y) || ++guard > 4000) out.push([x, y]);
    }
    return out;
  };
  return { obstacles, food: points(cfg.FOOD), hazards: points(cfg.HAZARDS) };
}

/* -------------------------------------------------------------- sensors */

// Sensor vector layout, used by the ablation masks.
//   0,1 food direction (body frame)   2 food mass
//   3,4 toxin direction (body frame)  5 toxin mass
//   6   wall/obstacle proximity       7 own energy
export const SENSOR_GROUPS = Object.freeze({
  food: [0, 1, 2], toxin: [3, 4, 5], wall: [6], energy: [7],
});

export function keepAllBut(groups, cfg = DEFAULTS) {
  const m = new Array(cfg.SENSORS).fill(1);
  for (const g of groups) for (const i of SENSOR_GROUPS[g]) m[i] = 0;
  return m;
}

/** The ablation conditions the diagnostics run. */
export function conditions(cfg = DEFAULTS) {
  return [
    { key:'baseline', label:'baseline',              note:'same genomes, fresh spawns' },
    { key:'blind',    label:'all senses scrambled',  mask:keepAllBut(['food','toxin','wall','energy'], cfg), note:'is the loop closed at all?' },
    { key:'noFood',   label:'food sense scrambled',  mask:keepAllBut(['food'], cfg),  note:'chemotaxis removed' },
    { key:'noToxin',  label:'toxin sense scrambled', mask:keepAllBut(['toxin'], cfg), note:'avoidance removed' },
    { key:'noWall',   label:'wall sense scrambled',  mask:keepAllBut(['wall'], cfg),  note:'obstacle/edge cue removed' },
    { key:'lesion',   label:'recurrence lesioned',   lesion:true, note:'off-diagonal W zeroed; reactive only' },
    { key:'novel',    label:'novel field layout',    novel:true,  note:'never selected on this layout' },
  ];
}

export function makeMods(mask, lesion, cfg = DEFAULTS, rng = makeRng(7)) {
  if (!mask && !lesion) return null;
  const m = { lesion: !!lesion };
  if (mask) {
    const perm = Array.from({ length: cfg.POP }, (_, i) => i);
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    m.keep = T().tensor2d([mask], [1, cfg.SENSORS]);
    m.drop = T().tensor2d([mask.map(v => 1 - v)], [1, cfg.SENSORS]);
    m.perm = T().tensor1d(perm, 'int32');
  }
  return m;
}
export const disposeMods = m => {
  if (m) { m.keep && m.keep.dispose(); m.drop && m.drop.dispose(); m.perm && m.perm.dispose(); }
};

/* ------------------------------------------------------------ statistics */

export const mean = a => { let t = 0; for (let i = 0; i < a.length; i++) t += a[i]; return t / a.length; };
export const meanOf = (a, n) => { let t = 0; for (let i = 0; i < n; i++) t += a[i]; return t / n; };
export const sd = a => { const m = mean(a); let t = 0; for (let i = 0; i < a.length; i++) t += (a[i] - m) ** 2; return Math.sqrt(t / Math.max(1, a.length - 1)); };
export const median = a => { const s = Array.from(a).sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
// The fitness distribution is severely skewed — a few agents find food and most
// never do — so the population mean is mostly noise around zero. The mean of the
// top quartile tracks the part of the population selection acts on.
export const topQuartile = a => {
  const s = Array.from(a).sort((x, y) => y - x), n = Math.max(1, Math.round(s.length / 4));
  let t = 0; for (let i = 0; i < n; i++) t += s[i]; return t / n;
};

/* --------------------------------------------------------- serialisation */

// Genomes travel as base64 float32 rather than JSON numbers: ~135KB instead of
// ~250KB, and it round-trips the exact bits rather than decimal approximations.
const B64 = {
  encode(a) {
    const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    if (typeof btoa === 'function') {
      let s = ''; const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      return btoa(s);
    }
    return Buffer.from(bytes).toString('base64');   // Node
  },
  decode(str) {
    let bytes;
    if (typeof atob === 'function') {
      const bin = atob(str); bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      const b = Buffer.from(str, 'base64');
      bytes = new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    }
    if (bytes.length % 4) throw new Error('genome block is not a whole number of floats');
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  },
};
const validPoints = (arr, n) => Array.isArray(arr) && arr.length === n &&
  arr.every(p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
const allFinite = a => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };

/* ---------------------------------------------------------------- the sim */

export class EvoDevoSim {
  /**
   * @param {object} opts
   * @param {object} [opts.config]  overrides merged over DEFAULTS
   * @param {number} [opts.seed]    seeds genomes, spawns, mutation and the world
   * @param {object} [opts.world]   reuse an existing layout instead of generating one
   */
  constructor(opts = {}) {
    this.cfg = Object.freeze({ ...DEFAULTS, ...(opts.config || {}) });
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.rng = makeRng(this.seed);
    this.worldRng = makeRng(this.seed ^ 0x5bf03635);
    this.world = opts.world || makeWorld(this.cfg, this.worldRng);
    this.gen = 0; this.stepNo = 0; this.selected = 0;
    this.mutation = this.cfg.MUTATION; this.gain = this.cfg.GAIN;
    this.mods = null; this.recording = false; this.accSteps = 0; this.analysing = false;
    this.snapshotPending = false; this.lastSnapshot = null;
    this.makeConstants(); this.makeVariables(); this.resetLineage();
  }

  /* seeded wrappers so every run is reproducible from `seed` alone */
  rn(shape, m = 0, s = 1) { return T().randomNormal(shape, m, s, 'float32', this.rng.int()); }
  ru(shape, a = 0, b = 1, dtype = 'float32') { return T().randomUniform(shape, a, b, dtype, this.rng.int()); }

  v(t) { const x = T().variable(t); t.dispose(); return x; }

  makeConstants() {
    const C = this.cfg, W = this.world, tf = T();
    this.food = tf.tensor2d(W.food, [C.FOOD, 2]);
    this.haz = tf.tensor2d(W.hazards, [C.HAZARDS, 2]);
    this.obs = tf.tensor2d(W.obstacles.map(o => [o[0], o[1]]), [C.OBSTACLES, 2]);
    this.obsR = tf.tensor1d(W.obstacles.map(o => o[2]));
    const p = []; for (let i = 0; i < C.CELLS; i++) p.push(-1 + 2 * i / (C.CELLS - 1));
    this.cellPos = tf.tensor1d(p);
    this.morph = tf.tensor3d(p.flatMap(x => [1, x, x * x]), [1, C.CELLS, 3]);
    const dk = []; for (let i = 0; i < C.CELLS; i++) for (let j = 0; j < C.CELLS; j++) dk.push(Math.exp(-Math.abs(i - j) / 3.1));
    this.distKernel = tf.tensor3d(dk, [1, C.CELLS, C.CELLS]);
    const eye = []; for (let i = 0; i < C.CELLS; i++) for (let j = 0; j < C.CELLS; j++) eye.push(i === j ? 1 : 0);
    this.eye = tf.tensor3d(eye, [1, C.CELLS, C.CELLS]);
    const emb = []; for (let i = 0; i < C.SENSORS; i++) { const a = (i / C.SENSORS) * Math.PI * 2; emb.push(Math.cos(a), Math.sin(a)); }
    this.sensorEmb = tf.tensor3d(emb, [1, C.SENSORS, 2]);
  }

  makeVariables() {
    const C = this.cfg, tf = T();
    this.genR = this.v(this.rn([C.POP, C.GENES, C.GENES], 0, .38));
    this.genM = this.v(this.rn([C.POP, 3, C.GENES], 0, .75));
    this.bias = this.v(tf.zeros([C.POP, C.CELLS])); this.tau = this.v(tf.ones([C.POP, C.CELLS]));
    this.W = this.v(tf.zeros([C.POP, C.CELLS, C.CELLS]));
    this.Win = this.v(tf.zeros([C.POP, C.SENSORS, C.CELLS]));
    this.Wout = this.v(tf.zeros([C.POP, C.CELLS, 2]));
    this.expr = this.v(tf.zeros([C.POP, C.CELLS, C.GENES])); this.color = this.v(tf.zeros([C.POP, 3]));
    this.pos = this.v(tf.zeros([C.POP, 2])); this.vel = this.v(tf.zeros([C.POP, 2]));
    this.angle = this.v(tf.zeros([C.POP])); this.omega = this.v(tf.zeros([C.POP]));
    this.energy = this.v(tf.ones([C.POP])); this.fitness = this.v(tf.zeros([C.POP]));
    this.neural = this.v(tf.zeros([C.POP, C.CELLS]));
    this.foodStock = this.v(tf.ones([C.FOOD]));
    this.acc = this.v(tf.zeros([C.POP, C.ACC_COLS]));
  }

  async initialise() { await this.develop(); this.resetBodies(); await this.warmup(); }

  /** Fresh random genomes, keeping the current world. */
  async randomiseGenomes() {
    const C = this.cfg, tf = T();
    tf.tidy(() => {
      this.genR.assign(this.rn([C.POP, C.GENES, C.GENES], 0, .38));
      this.genM.assign(this.rn([C.POP, 3, C.GENES], 0, .75));
    });
    this.gen = 0; this.resetLineage();
    await this.develop(); this.resetBodies();
  }
  async warmup() { for (let i = 0; i < 3; i++) this.step(); const z = T().sum(this.pos); await z.data(); z.dispose(); this.resetBodies(); }

  dispose() {
    for (const k of ['food','haz','obs','obsR','cellPos','morph','distKernel','eye','sensorEmb',
      'genR','genM','bias','tau','W','Win','Wout','expr','color','pos','vel','angle','omega',
      'energy','fitness','neural','foodStock','acc'])
      if (this[k] && !this[k].isDisposed) this[k].dispose();
  }

  /* ------------------------------------------------------ lineage */
  resetLineage() {
    const C = this.cfg;
    this.founder = new Int32Array(C.POP).map((_, i) => i);
    this.genomeId = new Int32Array(C.POP).map((_, i) => i);
    this.nextGenomeId = C.POP; this.eliteStreak = new Map();
  }
  advanceLineage(topIdx, choiceIdx) {
    const C = this.cfg, E = C.ELITES, f = new Int32Array(C.POP), g = new Int32Array(C.POP);
    for (let k = 0; k < E; k++) { f[k] = this.founder[topIdx[k]]; g[k] = this.genomeId[topIdx[k]]; }
    for (let c = 0; c < C.POP - E; c++) { const p = topIdx[choiceIdx[c]]; f[E + c] = this.founder[p]; g[E + c] = this.nextGenomeId++; }
    this.founder = f; this.genomeId = g;
    const s = new Map();
    for (let k = 0; k < E; k++) s.set(g[k], (this.eliteStreak.get(g[k]) || 0) + 1);
    this.eliteStreak = s;
  }
  lineageStats() {
    const E = this.cfg.ELITES;
    let streak = 0; for (const v of this.eliteStreak.values()) if (v > streak) streak = v;
    return {
      founders: new Set(this.founder).size,
      eliteFounders: new Set(Array.from(this.founder.slice(0, E))).size,
      streak,
    };
  }

  /* ------------------------------------------------------ world */
  reseedWorld() {
    const C = this.cfg, tf = T();
    this.world = makeWorld(C, this.worldRng);
    this.food.dispose(); this.haz.dispose();
    this.food = tf.tensor2d(this.world.food, [C.FOOD, 2]);
    this.haz = tf.tensor2d(this.world.hazards, [C.HAZARDS, 2]);
  }
  /** Run `fn` against a layout the population was never selected on, then restore. */
  async withNovelWorld(fn) {
    const C = this.cfg, tf = T();
    const old = this.world, oldFood = this.food, oldHaz = this.haz;
    this.world = makeWorld(C, this.worldRng);
    this.food = tf.tensor2d(this.world.food, [C.FOOD, 2]);
    this.haz = tf.tensor2d(this.world.hazards, [C.HAZARDS, 2]);
    try { return await fn(); }
    finally {
      this.food.dispose(); this.haz.dispose();
      this.world = old; this.food = oldFood; this.haz = oldHaz;
    }
  }

  /* ------------------------------------------------------ body state */
  resetBodies() {
    const C = this.cfg, tf = T();
    tf.tidy(() => {
      this.pos.assign(this.ru([C.POP, 2], -.82, .82));
      this.vel.assign(tf.zerosLike(this.vel));
      this.angle.assign(this.ru([C.POP], -Math.PI, Math.PI));
      this.omega.assign(tf.zerosLike(this.omega));
      this.energy.assign(this.ru([C.POP], .85, 1.15));
      this.fitness.assign(tf.zerosLike(this.fitness));
      this.neural.assign(this.rn([C.POP, C.CELLS], 0, .08));
      this.foodStock.assign(tf.onesLike(this.foodStock));
    });
    this.stepNo = 0;
  }
  /** A reusable starting condition, so conditions can be compared pairwise. */
  makeInit() {
    const C = this.cfg, tf = T();
    return tf.tidy(() => ({
      pos: tf.keep(this.ru([C.POP, 2], -.82, .82)),
      angle: tf.keep(this.ru([C.POP], -Math.PI, Math.PI)),
      energy: tf.keep(this.ru([C.POP], .85, 1.15)),
      neural: tf.keep(this.rn([C.POP, C.CELLS], 0, .08)),
    }));
  }
  applyInit(i) {
    const tf = T();
    tf.tidy(() => {
      this.pos.assign(i.pos); this.angle.assign(i.angle);
      this.energy.assign(i.energy); this.neural.assign(i.neural);
      this.vel.assign(tf.zerosLike(this.vel)); this.omega.assign(tf.zerosLike(this.omega));
      this.fitness.assign(tf.zerosLike(this.fitness)); this.foodStock.assign(tf.onesLike(this.foodStock));
    });
    this.stepNo = 0;
  }
  disposeInit(i) { for (const k in i) i[k].dispose(); }
  saveState() {
    const keys = ['pos','vel','angle','omega','energy','fitness','neural','foodStock','acc'];
    const s = { stepNo: this.stepNo }; for (const k of keys) s[k] = this[k].clone(); return s;
  }
  restoreState(s) {
    for (const k in s) { if (k === 'stepNo') { this.stepNo = s[k]; continue; } this[k].assign(s[k]); s[k].dispose(); }
  }

  /* ------------------------------------------------------ development */
  async develop() {
    const C = this.cfg, tf = T();
    let g = tf.zeros([C.POP, C.CELLS, C.GENES]);
    const drive = tf.tidy(() => tf.matMul(tf.tile(this.morph, [C.POP, 1, 1]), this.genM));
    for (let i = 0; i < C.DEV_STEPS; i++) {
      const next = tf.tidy(() => {
        const reg = tf.matMul(g, this.genR);
        return g.add(tf.tanh(reg.add(drive)).sub(g).mul(.19));
      });
      g.dispose(); g = next;
    }
    tf.tidy(() => {
      const e = tf.tanh(g); this.expr.assign(e);
      const sl = k => e.slice([0, 0, k], [C.POP, C.CELLS, 1]).squeeze([2]);
      this.bias.assign(sl(0).mul(1.45));
      this.tau.assign(tf.sigmoid(sl(1)).mul(1.65).add(.24));
      const le = sl(2), li = sl(3), re = sl(4), ri = sl(5);
      let w = le.expandDims(2).mul(re.expandDims(1)).sub(li.expandDims(2).mul(ri.expandDims(1))).mul(this.distKernel).mul(2.0);
      w = w.add(sl(9).expandDims(2).mul(this.eye).mul(.65));
      // Recurrent gain. At the original 2.0 the largest absolute row sum of W
      // averages ~5, which parks a tanh network's fixed points where the
      // nonlinearity is flat: cells rail and sensory input cannot move them.
      this.W.assign(w.mul(this.gain / 2.0));
      const receptor = tf.stack([sl(6), sl(7)], 2);
      const se = tf.tile(this.sensorEmb, [C.POP, 1, 1]);
      this.Win.assign(tf.matMul(se, receptor.transpose([0, 2, 1])).mul(1.18));
      const cp = tf.tile(this.cellPos.expandDims(0), [C.POP, 1]), motor = sl(8);
      this.Wout.assign(tf.stack([tf.tanh(motor.sub(cp.mul(1.4))), tf.tanh(motor.add(cp.mul(1.4)))], 2));
      this.color.assign(tf.stack([sl(2).mean(1), sl(6).mean(1), sl(8).mean(1)], 1).mul(1.2).add(.6).clipByValue(.12, 1));
    });
    drive.dispose(); g.dispose();
  }

  /* ------------------------------------------------------ physics */
  // `weights` scales each source's contribution, so the food sense tracks live
  // patches rather than the bare geometry of where food used to be.
  field(pos, points, sigma2, weights) {
    const rel = points.expandDims(0).sub(pos.expandDims(1));
    const d2 = rel.square().sum(2);
    let w = d2.div(-sigma2).exp();
    if (weights) w = w.mul(weights.expandDims(0));
    const mass = w.sum(1).add(1e-5);
    const vec = rel.mul(w.expandDims(2)).sum(1).div(mass.expandDims(1));
    return { rel, d2, w, mass, vec };
  }

  step() {
    const C = this.cfg, tf = T(), mods = this.mods;
    tf.tidy(() => {
      const food = this.field(this.pos, this.food, .050, this.foodStock);
      const haz = this.field(this.pos, this.haz, .036, null);
      const orel = this.pos.expandDims(1).sub(this.obs.expandDims(0));
      const od = tf.sqrt(orel.square().sum(2).add(1e-6));
      const on = orel.div(od.expandDims(2));
      const orange = this.obsR.add(.13).expandDims(0);
      const ostr = tf.relu(orange.sub(od)).div(orange);
      const repel = on.mul(ostr.expandDims(2)).sum(1);
      const c = tf.cos(this.angle), s = tf.sin(this.angle);
      const body = v => [
        v.slice([0,0],[-1,1]).squeeze([1]).mul(c).add(v.slice([0,1],[-1,1]).squeeze([1]).mul(s)),
        v.slice([0,1],[-1,1]).squeeze([1]).mul(c).sub(v.slice([0,0],[-1,1]).squeeze([1]).mul(s)),
      ];
      const fb = body(food.vec), hb = body(haz.vec), rb = body(repel);
      const boundary = tf.relu(this.pos.abs().max(1).sub(.70)).mul(3.2);
      let sensors = tf.stack([fb[0], fb[1], tf.tanh(food.mass.mul(.16)),
        hb[0], hb[1], tf.tanh(haz.mass.mul(.18)),
        tf.tanh(boundary.add(rb[0].abs().mul(.4))), this.energy.sub(.7)], 1);
      // Ablation: dropped channels are replaced by another agent's values for
      // the same channels — information destroyed, distribution preserved.
      if (mods && mods.keep) sensors = sensors.mul(mods.keep).add(tf.gather(sensors, mods.perm).mul(mods.drop));
      const Weff = (mods && mods.lesion) ? this.W.mul(this.eye) : this.W;
      const act = tf.tanh(this.neural.add(this.bias));
      const rec = tf.matMul(act.expandDims(1), Weff).squeeze([1]);
      const inp = tf.matMul(sensors.expandDims(1), this.Win).squeeze([1]);
      const ny = this.neural.add(rec.add(inp).sub(this.neural).div(this.tau).mul(C.DT));
      this.neural.assign(ny);
      const motor = tf.matMul(tf.tanh(ny).expandDims(1), this.Wout).squeeze([1]).tanh();
      const left = motor.slice([0,0],[-1,1]).squeeze([1]), right = motor.slice([0,1],[-1,1]).squeeze([1]);
      const thrust = left.add(right).mul(.5), turn = right.sub(left);
      const ax = c.mul(thrust).mul(.72).add(repel.slice([0,0],[-1,1]).squeeze([1]).mul(.95));
      const ay = s.mul(thrust).mul(.72).add(repel.slice([0,1],[-1,1]).squeeze([1]).mul(.95));
      let nv = this.vel.mul(.982).add(tf.stack([ax, ay], 1).mul(C.DT));
      const speed = tf.sqrt(nv.square().sum(1).add(1e-6));
      nv = nv.div(tf.maximum(speed.div(.34), tf.onesLike(speed)).expandDims(1));
      const no = this.omega.mul(.91).add(turn.mul(.055));
      this.omega.assign(no);
      // Wrapped to [-pi, pi]: the heading is integrated every step and would
      // otherwise drift far enough for float32 cos/sin to lose precision.
      const wrapped = this.angle.add(no).add(turn.mul(C.DT * .42)).add(Math.PI);
      this.angle.assign(wrapped.sub(wrapped.div(2 * Math.PI).floor().mul(2 * Math.PI)).sub(Math.PI));
      let np = this.pos.add(nv.mul(C.DT));
      const nrel = np.expandDims(1).sub(this.obs.expandDims(0));
      const nd = tf.sqrt(nrel.square().sum(2).add(1e-6));
      const nn = nrel.div(nd.expandDims(2));
      const pen = tf.relu(this.obsR.add(C.AGENT_RADIUS).expandDims(0).sub(nd));
      np = np.add(nn.mul(pen.expandDims(2)).sum(1));
      const hit = np.abs().greater(C.WORLD_BOUND).toFloat();
      np = np.clipByValue(-C.WORLD_BOUND, C.WORLD_BOUND);
      nv = nv.mul(tf.onesLike(hit).sub(hit.mul(1.72)));
      this.pos.assign(np); this.vel.assign(nv);
      // Feeding draws the patch down; the patch regrows logistically toward 1.
      const k = food.d2.div(-.0018).exp();
      const eat = k.mul(this.foodStock.expandDims(0)).max(1);
      const draw = k.sum(0);
      const stock = this.foodStock;
      this.foodStock.assign(stock.add(
        stock.mul(-1).add(1).mul(C.FOOD_REGROW)
          .sub(draw.mul(stock).mul(C.FOOD_CONSUME))
          .mul(C.DT)).clipByValue(0, 1));
      const tox = haz.d2.div(-.0015).exp().max(1);
      const cost = thrust.abs().mul(.015).add(turn.abs().mul(.009)).add(.013);
      const en = this.energy.add(eat.mul(.42).sub(tox.mul(.62)).sub(cost).mul(C.DT)).clipByValue(0, 1.4);
      this.energy.assign(en);
      this.fitness.assign(this.fitness.add(
        eat.sub(tox.mul(1.35)).add(speed.mul(.018)).add(en.greater(.04).toFloat().mul(.003)).mul(C.DT)));
      if (this.recording) {
        // Pooled regression accumulators for the taxis measures.
        this.acc.assign(this.acc.add(tf.stack([
          fb[1], fb[1].square(), fb[1].mul(turn),
          hb[1], hb[1].square(), hb[1].mul(turn),
          turn, turn.square(), fb[0]], 1)));
      }
    });
    this.stepNo++;
    if (this.recording) this.accSteps++;
  }

  /* ------------------------------------------------------ evolution */
  mutateTensor(parent, scale) {
    const tf = T();
    const mask = this.ru(parent.shape).less(this.mutation).toFloat();
    return parent.add(this.rn(parent.shape, 0, scale).mul(mask));
  }
  async evolve() {
    const C = this.cfg, tf = T();
    const top = tf.topk(this.fitness, C.ELITES, true);
    const choice = this.ru([C.POP - C.ELITES], 0, C.ELITES, 'int32');
    const [topIdx, choiceIdx] = await Promise.all([top.indices.data(), choice.data()]);
    tf.tidy(() => {
      const eliteR = tf.gather(this.genR, top.indices), eliteM = tf.gather(this.genM, top.indices);
      const parentIdx = tf.gather(top.indices, choice);
      const childrenR = this.mutateTensor(tf.gather(this.genR, parentIdx), C.MUTATE_R);
      const childrenM = this.mutateTensor(tf.gather(this.genM, parentIdx), C.MUTATE_M);
      this.genR.assign(tf.concat([eliteR, childrenR], 0).clipByValue(-3.2, 3.2));
      this.genM.assign(tf.concat([eliteM, childrenM], 0).clipByValue(-4, 4));
    });
    top.values.dispose(); top.indices.dispose(); choice.dispose();
    this.advanceLineage(topIdx, choiceIdx);
    this.gen++; this.selected = 0;
    await this.develop(); this.resetBodies();
  }

  /* ------------------------------------------------------ analysis */
  resetAccumulators() { const tf = T(); tf.tidy(() => this.acc.assign(tf.zerosLike(this.acc))); this.accSteps = 0; }

  /**
   * One evaluation episode. `yieldEvery` > 0 hands control back periodically so a
   * browser stays responsive; headless runs pass 0 and go flat out.
   */
  async evaluate({ steps, init, mods = null, record = false, onProgress = null, yieldEvery = 32 }) {
    if (init) this.applyInit(init);
    this.mods = mods; this.recording = record;
    if (record) this.resetAccumulators();
    for (let i = 0; i < steps; i++) {
      this.step();
      if (yieldEvery && (i % yieldEvery) === yieldEvery - 1) {
        await T().nextFrame();
        if (onProgress) onProgress(i + 1);
      }
    }
    const f = new Float32Array(await this.fitness.data());
    this.mods = null; this.recording = false;
    if (onProgress) onProgress(steps);
    return f;
  }

  async taxisStats() {
    if (!this.accSteps) return null;
    const C = this.cfg, raw = await this.acc.data(), K = C.ACC_COLS, n = this.accSteps;
    const col = j => { let t = 0; for (let i = 0; i < C.POP; i++) t += raw[i * K + j]; return t; };
    const N = n * C.POP;
    const corr = (sx, sxx, sy, syy, sxy, cnt) => {
      const cov = cnt * sxy - sx * sy, vx = cnt * sxx - sx * sx, vy = cnt * syy - sy * sy;
      return (vx <= 1e-9 || vy <= 1e-9) ? 0 : cov / Math.sqrt(vx * vy);
    };
    const sT = col(6), sTT = col(7);
    const food = corr(col(0), col(1), sT, sTT, col(2), N);
    const toxin = corr(col(3), col(4), sT, sTT, col(5), N);
    let strongFood = 0;
    for (let i = 0; i < C.POP; i++) {
      const g = j => raw[i * K + j];
      if (Math.abs(corr(g(0), g(1), g(6), g(7), g(2), n)) > 0.2) strongFood++;
    }
    return { food, toxin, forwardBias: col(8) / N, strongFood, samples: N };
  }

  // `gain` is the mean over agents of the largest absolute row sum of W, which
  // bounds how much the recurrent term can amplify: above ~1 the tanh fixed
  // points sit in the flat region and the cell stops responding to input.
  async networkStats() {
    const C = this.cfg, tf = T();
    const t = tf.tidy(() => tf.stack([
      tf.tanh(this.neural).abs().greater(C.SAT_LEVEL).toFloat().mean(),
      this.W.abs().sum(2).max(1).mean(),
      this.pos.abs().max(1).greater(C.WALL_LEVEL).toFloat().mean(),
    ]));
    const perAgent = tf.tidy(() => tf.tanh(this.neural).abs().greater(C.SAT_LEVEL).toFloat().mean(1));
    const [d, sat, fit] = await Promise.all([t.data(), perAgent.data(), this.fitness.data()]);
    t.dispose(); perAgent.dispose();
    const n = sat.length, ms = mean(sat), mf = mean(fit);
    let sab = 0, sa = 0, sb = 0;
    for (let i = 0; i < n; i++) { const da = sat[i] - ms, db = fit[i] - mf; sab += da * db; sa += da * da; sb += db * db; }
    return { saturation: d[0], gain: d[1], atWall: d[2], satFitCorr: (sa < 1e-12 || sb < 1e-12) ? 0 : sab / Math.sqrt(sa * sb) };
  }

  async populationStats() {
    const tf = T();
    const t = tf.tidy(() => tf.stack([
      tf.moments(this.genR, [0]).variance.mean().sqrt(),
      tf.moments(this.genM, [0]).variance.mean().sqrt(),
      tf.moments(this.expr, [0]).variance.mean().sqrt(),
      tf.moments(this.color, [0]).variance.mean().sqrt(),
    ]));
    const d = await t.data(); t.dispose();
    return Object.assign({ genomeSigma: (d[0] + d[1]) / 2, exprSigma: d[2], colorSigma: d[3] }, this.lineageStats());
  }

  /* ------------------------------------------------------ population files */
  // The field layout travels with the genomes. Without it an imported
  // population is scored on a different world, which quietly breaks whatever
  // comparison the file was saved to make.
  async exportPopulation() {
    const C = this.cfg;
    const [gr, gm] = await Promise.all([this.genR.data(), this.genM.data()]);
    return {
      format: 'evodevo-population', version: 1,
      saved: new Date().toISOString(),
      config: { POP: C.POP, GENES: C.GENES, CELLS: C.CELLS, SENSORS: C.SENSORS, FOOD: C.FOOD, HAZARDS: C.HAZARDS },
      generation: this.gen, gain: this.gain, mutation: this.mutation, seed: this.seed,
      world: { food: this.world.food, hazards: this.world.hazards },
      lineage: {
        founder: Array.from(this.founder), genomeId: Array.from(this.genomeId),
        nextGenomeId: this.nextGenomeId, streak: Array.from(this.eliteStreak.entries()),
      },
      genR: B64.encode(new Float32Array(gr)),
      genM: B64.encode(new Float32Array(gm)),
    };
  }

  async importPopulation(p) {
    const C = this.cfg, tf = T();
    if (!p || p.format !== 'evodevo-population') throw new Error('not an Evo/Devo population file');
    if (p.version > 1) throw new Error('saved by a newer version of this page');
    const c = p.config || {};
    if (c.POP !== C.POP || c.GENES !== C.GENES || c.CELLS !== C.CELLS)
      throw new Error(`saved for a different configuration (pop ${c.POP}, genes ${c.GENES}, cells ${c.CELLS})`);
    const gr = B64.decode(p.genR), gm = B64.decode(p.genM);
    const needR = C.POP * C.GENES * C.GENES, needM = C.POP * 3 * C.GENES;
    if (gr.length !== needR) throw new Error(`genR is ${gr.length} floats, expected ${needR}`);
    if (gm.length !== needM) throw new Error(`genM is ${gm.length} floats, expected ${needM}`);
    if (!allFinite(gr) || !allFinite(gm)) throw new Error('genome contains NaN or Infinity');

    tf.tidy(() => {
      this.genR.assign(tf.tensor3d(gr, [C.POP, C.GENES, C.GENES]));
      this.genM.assign(tf.tensor3d(gm, [C.POP, 3, C.GENES]));
    });
    let worldRestored = false;
    if (p.world && validPoints(p.world.food, C.FOOD) && validPoints(p.world.hazards, C.HAZARDS)) {
      this.world = { obstacles: this.world.obstacles, food: p.world.food, hazards: p.world.hazards };
      this.food.dispose(); this.haz.dispose();
      this.food = tf.tensor2d(this.world.food, [C.FOOD, 2]);
      this.haz = tf.tensor2d(this.world.hazards, [C.HAZARDS, 2]);
      worldRestored = true;
    }
    const L = p.lineage;
    if (L && Array.isArray(L.founder) && L.founder.length === C.POP &&
        Array.isArray(L.genomeId) && L.genomeId.length === C.POP) {
      this.founder = Int32Array.from(L.founder);
      this.genomeId = Int32Array.from(L.genomeId);
      this.nextGenomeId = Number.isFinite(L.nextGenomeId) ? L.nextGenomeId : C.POP;
      this.eliteStreak = new Map(Array.isArray(L.streak) ? L.streak : []);
    } else this.resetLineage();

    if (Number.isFinite(p.gain)) this.gain = clamp(p.gain, 0.1, 3);
    if (Number.isFinite(p.mutation)) this.mutation = clamp(p.mutation, 0.01, 0.3);
    this.gen = Number.isFinite(p.generation) ? p.generation : 0;
    await this.develop(); this.resetBodies();
    return { worldRestored, generation: this.gen, gain: this.gain, mutation: this.mutation, saved: p.saved };
  }

  snapshot(selected) {
    const C = this.cfg, tf = T();
    if (this.snapshotPending) return false;
    this.snapshotPending = true;
    const view = tf.tidy(() => {
      const speed = tf.sqrt(this.vel.square().sum(1).add(1e-6)).expandDims(1);
      return tf.concat([this.pos, this.angle.expandDims(1), this.energy.expandDims(1),
        this.fitness.expandDims(1), speed, this.color], 1);
    });
    // Saturation and wall-pinning ride along in the existing readback rather
    // than costing a second GPU round trip per frame.
    const diag = tf.tidy(() => tf.stack([
      this.fitness.max(), this.fitness.mean(), this.energy.mean(), this.foodStock.mean(),
      tf.tanh(this.neural).abs().greater(C.SAT_LEVEL).toFloat().mean(),
      this.pos.abs().max(1).greater(C.WALL_LEVEL).toFloat().mean(),
    ]));
    const inspect = tf.tidy(() => tf.concat([
      tf.gather(this.expr, selected).flatten(),
      tf.gather(this.neural, selected).flatten(),
      tf.gather(this.W, selected).flatten()]));
    const stock = this.foodStock.clone();
    Promise.all([view.data(), diag.data(), inspect.data(), stock.data()])
      .then(([v, d, i, s]) => {
        this.lastSnapshot = { view: new Float32Array(v), diag: new Float32Array(d),
          inspect: new Float32Array(i), stock: new Float32Array(s) };
      })
      .catch(err => { console.warn('snapshot readback failed', err); })
      .finally(() => { view.dispose(); diag.dispose(); inspect.dispose(); stock.dispose(); this.snapshotPending = false; });
    return true;
  }
}

/* ------------------------------------------------------------ diagnostics */

/**
 * The full ablation suite, with no UI attached. Returns plain data; the page
 * renders it and the headless runners serialise it.
 *
 * Every condition replays the same genomes from the same starting positions,
 * so a difference is the condition and not spawn luck.
 */
export async function diagnose(sim, opts = {}) {
  const {
    steps = 600, restarts = 3, onProgress = null, yieldEvery = 32,
    conditionList = conditions(sim.cfg), seed = 0x51ed,
  } = opts;
  const C = sim.cfg;
  // A dedicated stream, so running diagnostics does not shift the sim's own RNG
  // and change what the next generation would have been.
  const rng = makeRng(seed);
  const total = steps * restarts * conditionList.length;
  let done = 0;

  sim.analysing = true;
  const saved = sim.saveState();
  const results = {};
  for (const c of conditionList) results[c.key] = { pop: [], elite: [], top: [], all: null };
  // The taxis measure is also recorded under the fully scrambled condition,
  // which has the same autocorrelation structure but no real coupling. That run
  // is the empirical null the baseline has to beat.
  let taxis = null, taxisNull = null, network = null;
  try {
    for (let r = 0; r < restarts; r++) {
      const init = sim.makeInit();
      for (const cond of conditionList) {
        const mods = makeMods(cond.mask, cond.lesion, C, rng);
        const record = (r === 0 && (cond.key === 'baseline' || cond.key === 'blind'));
        const cb = onProgress ? n => onProgress({
          fraction: (done + n) / total, restart: r + 1, restarts, condition: cond.label,
        }) : null;
        const runIt = () => sim.evaluate({ steps, init, mods, record, onProgress: cb, yieldEvery });
        const fit = cond.novel ? await sim.withNovelWorld(runIt) : await runIt();
        disposeMods(mods);
        done += steps;
        results[cond.key].pop.push(mean(fit));
        results[cond.key].elite.push(meanOf(fit, C.ELITES));
        results[cond.key].top.push(topQuartile(fit));
        if (record) {
          const t = await sim.taxisStats();
          if (cond.key === 'baseline') {
            results.baseline.all = fit; taxis = t;
            // Measured here, on a settled network. Taken after restoreState it
            // would read the freshly-reset state, where nothing has railed yet
            // and saturation always reports ~0.
            network = await sim.networkStats();
          } else taxisNull = t;
        }
      }
      sim.disposeInit(init);
    }
  } finally {
    sim.restoreState(saved); sim.analysing = false;
  }

  const base = mean(results.baseline.top);
  const drop = key => (base - mean(results[key].top)) / Math.abs(base);
  const table = conditionList.map(c => ({
    key: c.key, label: c.label, note: c.note || '',
    pop: mean(results[c.key].pop), elite: mean(results[c.key].elite), top: mean(results[c.key].top),
    delta: c.key === 'baseline' ? 0 : (mean(results[c.key].top) - base) / Math.abs(base),
  }));
  const all = results.baseline.all;
  const eliteAdvantage = all
    ? (sd(all) > 1e-9 ? (meanOf(all, C.ELITES) - median(all)) / sd(all) : 0)
    : null;

  return {
    steps, restarts, base, table, taxis, taxisNull, eliteAdvantage,
    drops: Object.fromEntries(conditionList.filter(c => c.key !== 'baseline').map(c => [c.key, drop(c.key)])),
    network: network || await sim.networkStats(),
    population: await sim.populationStats(),
    generation: sim.gen, gain: sim.gain, mutation: sim.mutation,
    // Fitness accrues at up to ~1 per second of sim time, so the floor for
    // "worth interpreting" scales with how long the episode ran.
    interpretable: base >= 0.03 * steps * C.DT,
    ceiling: steps * C.DT,
  };
}

/** Evolve for `generations`, optionally reporting progress. Returns the sim. */
export async function evolveFor(sim, generations, opts = {}) {
  const { onGeneration = null, yieldEvery = 0 } = opts;
  for (let g = 0; g < generations; g++) {
    sim.resetBodies();
    for (let i = 0; i < sim.cfg.EPOCH_STEPS; i++) {
      sim.step();
      if (yieldEvery && (i % yieldEvery) === yieldEvery - 1) await T().nextFrame();
    }
    // Read the epoch's result before evolving: evolve() ends by resetting the
    // bodies, which zeroes fitness, so reading afterwards always reports 0.
    let best = 0;
    if (onGeneration) { const t = sim.fitness.max(); best = (await t.data())[0]; t.dispose(); }
    await sim.evolve();
    if (onGeneration) await onGeneration({ generation: sim.gen, best });
  }
  return sim;
}
