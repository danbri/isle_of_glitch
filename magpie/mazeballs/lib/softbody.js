/**
 * Soft-body evo/devo — a parallel substrate.
 *
 * The incumbent organism (lib/evodevo.js) has a morphology that cannot evolve:
 * twelve cells on a fixed line, a differential drive, two motor channels. Every
 * organism-side experiment in this project has added *parameters* to that body
 * and every one has been null. This file is the other thing you can do about
 * that — make the body itself something development discovers.
 *
 * An organism here is a clump of cells in the plane. Each cell holds a gene
 * state, reads a maternal gradient at its own position, relaxes a
 * gene-regulatory network, and from the resulting expression either divides,
 * dies, or takes a role: sensor, muscle, or plain neuron. Cells adhere to their
 * neighbours; the adhesion edges are the skeleton. Some of those edges are
 * muscles, whose rest length is driven by the CTRNN activations of the two
 * cells they connect. Ground friction is Coulomb with a static threshold and a
 * per-cell coefficient, so a travelling wave of contraction crawls.
 *
 * Development and lifetime stay two distinct stages, exactly as in the
 * incumbent: `develop()` runs once and returns a frozen phenotype; `Colony`
 * then runs that phenotype in the world and never touches the genome again.
 *
 * COMPUTE PATH. This is written as a set of *kernels* — per-particle and
 * per-edge loops with no sequential dependency between elements — over flat
 * structure-of-arrays typed buffers of fixed capacity (N_MAX cells, E_MAX
 * edges per organism, with an alive mask). That is the WGSL dispatch shape:
 * each `k*` function below is one compute pass, and the Jacobi accumulate /
 * apply split exists precisely so the constraint solve has no read-write
 * hazard between workgroups. Gauss-Seidel would be faster per iteration on a
 * CPU and impossible on a GPU, so it is not used. The host box has no GPU
 * (no `navigator.gpu` under Node 22, no Deno, no /dev/dri), so what actually
 * runs is the typed-array fallback; the shape is kept anyway because the
 * shape, not the speed, is the thing that would have to be rewritten later.
 *
 * NUMERICS. Soft bodies fail by producing NaN, not by scoring badly, and a NaN
 * that reaches a fitness function is silent corruption rather than a bad
 * result. So: velocities are clamped, per-iteration constraint corrections are
 * clamped, muscle rest lengths are capped as a *ratio* of the developed rest
 * length, and `assertFinite` scans every position and velocity on demand.
 */

/** Deterministic LCG, identical in construction to lib/evodevo.js makeRng. */
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 0x8f3d20a1;
  const step = () => (s = (Math.imul(1664525, s) + 1013904223) >>> 0);
  return { next: () => step() / 4294967296, int: () => step(), state: () => s };
}

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const gauss = (rng) => {
  // Irwin-Hall(4), rescaled: bounded tails, so a genome draw can never emit a
  // 6-sigma weight that makes the first GRN relaxation rail on step one.
  let s = 0; for (let i = 0; i < 4; i++) s += rng.next();
  return (s - 2) * 1.0;
};

/* ------------------------------------------------------------------ genes */

/**
 * Gene readout. Genes 0..18 have a phenotypic readout; 19..21 have none and
 * exist only to feed back through the regulatory matrix, which is what makes
 * the network something other than a direct genome->phenotype lookup.
 */
export const G = Object.freeze({
  // --- fate module (0..4) ------------------------------------------------
  DIV: 0,      // division propensity
  DIE: 1,      // apoptosis propensity
  POLX: 2,     // division polarity, x
  POLY: 3,     // division polarity, y
  SIZE: 4,     // cell radius modulation
  // --- role module (5..6) ------------------------------------------------
  SENSOR: 5,   // sensor role score
  MUSCLE: 6,   // muscle role score
  // --- neural module (7..14) ---------------------------------------------
  BIAS: 7,     // CTRNN bias
  TAU: 8,      // CTRNN time constant
  OUT_E: 9,    // presynaptic excitatory
  IN_E: 10,    // postsynaptic excitatory
  OUT_I: 11,   // presynaptic inhibitory
  IN_I: 12,    // postsynaptic inhibitory
  AXX: 13,     // directional synaptic axis, x
  AXY: 14,     // directional synaptic axis, y
  // Slow spike-frequency adaptation. A CTRNN cell with a single state variable
  // is a leaky integrator and settles; measured over sixteen random genomes,
  // sustained oscillation late in an episode was present in one. A second,
  // much slower state that subtracts from the cell's own drive turns the same
  // unit into a relaxation oscillator, which makes rhythm GENERIC rather than
  // lucky. Without it the muscles hold a constant length and no body crawls,
  // so this is not a capacity increase — it is the difference between a
  // substrate that has gaits and one that does not.
  ADAPT: 15,   // adaptation strength
  TAU_A: 16,   // adaptation time constant
  // --- motor module (17..18) ---------------------------------------------
  AMP: 17,     // muscle amplitude and sign
  GRIP: 18,    // ground friction, baseline coefficient
  // --- receptor module (19..22) ------------------------------------------
  RCP: 19,     // receptor weights, one per sensor channel: 19..22
  // 23 has no readout at all and exists only to feed back.
});
export const GENES = 24;

/**
 * Module boundaries, in gene index order. Used by the layout below and by any
 * future crossover operator that wants to cut on a module edge rather than
 * anywhere.
 */
export const GENE_MODULES = Object.freeze([
  { name: 'fate',     from: 0,  to: 5 },
  { name: 'role',     from: 5,  to: 7 },
  { name: 'neural',   from: 7,  to: 17 },
  { name: 'motor',    from: 17, to: 19 },
  { name: 'receptor', from: 19, to: 23 },
  { name: 'silent',   from: 23, to: 24 },
]);
/**
 * Sensor channels. 0 and 1 are exteroceptive and require the sensor role — a
 * cell has to be a sensor to smell food or feel the arena edge. 2 and 3 are
 * PROPRIOCEPTIVE (own speed, own strain) and every cell has them, because a
 * muscle cell knowing its own length is not a specialised organ, and because
 * the strain channel is what closes the loop from body back to network. A
 * disembodied CTRNN with a rank-2 recurrent matrix settles to a fixed point
 * almost surely — measured, not assumed — and a body that never oscillates
 * never crawls. The mechanical feedback loop is where the rhythm comes from.
 */
export const SENSORS = 4;   // odour mass, boundary, own speed, own strain
export const PROPRIO_FROM = 2;
/**
 * Maternal / positional inputs to the GRN: bias, x, y, radial, developmental
 * clock, local density, and then the two MORPHOGEN concentrations produced by
 * the reaction-diffusion layer.
 *
 * The last two are the point. A single graded signal can only ever give a cell
 * its coordinate; twelve cells on a line reading one gradient is a decent
 * caricature of the first hours of a fly's anteroposterior axis, and it is
 * also the ceiling of what that substrate can be. Two morphogens with
 * different diffusion rates and the right nonlinearity are a Turing system,
 * and a Turing system on a two-dimensional domain produces spots, stripes and
 * repeated units from a uniform start — symmetry, modularity and amplification
 * arrive as consequences of the kinetics rather than as things the genome has
 * to specify cell by cell.
 *
 * Wave 1 of this project already tested a Turing pair and it was null. It was
 * tested on the fixed twelve-cell line: the mechanism was present and there
 * was no morphology for it to pattern. This is the other half of that
 * experiment.
 */
export const MATERNAL = 8;
export const MAT_A = 6, MAT_H = 7;

export const DEFAULTS = Object.freeze({
  N_MAX: 64,
  E_MAX: 320,
  SEED_CELLS: 4,

  // ------------------------------------------------------------ development
  DEV_CYCLES: 14,          // growth cycles; each one is GRN + fate + mechanics
  GRN_STEPS: 6,            // relaxation steps of the regulatory network per cycle
  GRN_DT: 0.30,            // integration step of the gene-circuit equation
  LAM_MIN: 0.25, LAM_SPAN: 1.75,     // per-gene decay rate range (lambda)
  H_SCALE: 1.20,                     // per-gene threshold scale (h)
  ALPHA_MIN: 0.30, ALPHA_SPAN: 2.20, // per-gene max synthesis rate range (alpha)
  DEV_RELAX: 6,            // mechanical relaxation iterations per cycle
  DEV_SCALE: 0.13,         // length scale of the maternal coordinate gradient
  DIV_THRESH: 0.20,
  DIE_THRESH: 0.60,
  FATE_K: 6.0,             // steepness of the division / apoptosis rate curves
  MIN_CELLS: 4,            // apoptosis never takes the body below this
  DIV_JITTER: 0.10,        // fraction of a cell radius of noise on the division axis

  // ------------------------------------------------- reaction-diffusion (RD)
  // Gierer-Meinhardt on a Lagrangian particle cloud: cells carry the
  // concentrations, the Laplacian is a neighbourhood-weighted graph Laplacian
  // over the same kernel the adhesion skeleton uses, so the pattern rides on
  // the body as the body grows and deforms. There is no background mesh and no
  // Eulerian grid; the domain IS the organism.
  //
  //   dA/dt = s A^2 / H - a A + b + D_A lap(A)
  //   dH/dt = s A^2     - h H       + D_H lap(H)
  //
  // The Laplacian is normalised by neighbour weight AND divided by h^2, so it
  // is a real diffusivity operator rather than a dimensionless one: its
  // spectrum is [-2/h^2, 0]. Explicit Euler is then stable for dt*2*D/h^2 < 1,
  // and the step count is derived per genome from that bound in rdParams()
  // rather than fixed here — see RD_TIME and RD_MAX_STEPS below.
  RD_KERNEL: 1.35,         // diffusion neighbourhood, in units of the adhesion reach
  RD_CLAMP: 12.0,          // concentration ceiling; GM is superlinear and will run away
  RD_SEED: 0.06,           // amplitude of the initial concentration noise
  // Reaction-diffusion parameterisation. These are NOT the raw kinetic rates;
  // the genome addresses the bifurcation conditions directly (see rdParams).
  //
  // An earlier version FORCED nu/mu > 1, which guarantees trace(J) < 0 and so
  // forbids the Hopf bifurcation entirely — every genome was pinned to the
  // Turing-STATIONARY region and could only make standing spatial patterns.
  // That threw away the temporal-oscillation regime, which is the developmental
  // CLOCK: a tissue that oscillates in time while it grows imprints different
  // fates on cells born at different cycles, and clock-against-gradient is how
  // real segmented body plans lay down repeated units. So the ratio now spans
  // BELOW 1 as well, and oscillation is a reachable developmental dynamic
  // rather than a suppressed failure mode. rdParams keeps only the numerical
  // guards (a NaN reaching fitness is still silent corruption); it no longer
  // constrains the dynamics.
  // Pattern wavelength, in cell radii. This is the genome's handle on pattern
  // SCALE, and the diffusivities are derived from it rather than sampled — see
  // rdParams(). Bounded below by what the cell spacing can resolve: a pattern
  // finer than a couple of cells is aliasing, not morphology.
  // Lower bound is Nyquist against the cell spacing (~2 radii): a pattern below
  // ~4 radii is aliasing. Upper bound is what fits — a wavelength approaching
  // the body's own diameter has no room to repeat, and reads as no pattern at
  // all rather than as one big stripe.
  RD_WAVELEN: [4.5, 9.0],
  RD_A: [0.45, 2.20],      // activator decay mu
  RD_B: [0.0, 0.09],       // basal activator production
  RD_NU_RATIO: [0.4, 4.0],    // nu/mu. Below 1 => trace(J) > 0 => temporal oscillation (a dev clock); above 1 => the stationary Turing branch.
  // Multiple of the critical diffusion ratio. Above 1 the mode grows, but the
  // growth RATE goes to zero at the threshold, so a genome sitting just above
  // it patterns only in the limit and reads as flat inside any finite
  // developmental budget. The floor is set where growth is fast enough to
  // complete; the range is still a real dose axis for how sharp the pattern is.
  RD_SUPERCRIT: [1.35, 3.2],
  // Simulated time per developmental cycle. The sub-step count is derived from
  // this and from the explicit-Euler stability bound, per genome, rather than
  // fixed — a fast-diffusing inhibitor needs a smaller step, and picking one
  // step size for every genome means either instability at one end of the range
  // or wasted work at the other.
  RD_TIME: 5.2,
  RD_MAX_STEPS: 400,       // ceiling on that derivation, so one stiff genome cannot stall a run
  CELL_R: 0.020,
  SIZE_RANGE: 0.35,        // radius = CELL_R * (1 +- SIZE_RANGE * tanh(expr[SIZE]))
  ADHESION: 2.45,          // edge if separation < ADHESION * mean radius
  DEV_JITTER: 0,           // per-spawn jitter on the initial clump (developmental noise)

  // ---------------------------------------------------------------- neural
  // Scales the developed recurrent matrix. NOT the incumbent's 0.5, which was
  // tuned for a twelve-cell line driving a differential drive and is far too
  // low here. Measured over 16 random genomes at 800 steps: at 0.5 the largest
  // displacement in the population is 0.0033 world units in an arena 1.88
  // across — nothing moves, and more importantly nothing VARIES, so selection
  // has no locomotion to act on. Raising it destabilises the fixed points the
  // network otherwise settles into, per-cell oscillation goes 0.148 to 0.44,
  // and the best organism reaches 0.8-1.0 world units. Random genomes still
  // mostly do not walk, which is correct — locomotion should be rare at
  // generation zero. What changed is that the spread across the population is
  // now about 300x rather than absent.
  GAIN: 20.0,
  SYN_SIGMA2: 0.0060,      // distance kernel on synapses: neighbours wire together
  DIR_SCALE: 2.0,          // weight of the asymmetric direction-dependent synapse
  TAU_MIN: 0.24, TAU_SPAN: 1.65,
  TAUA_MIN: 1.20, TAUA_SPAN: 11.0,   // adaptation time constant range, seconds
  ADAPT_MAX: 6.00,                   // adaptation strength range, [0, this]
  SELF_EXC: 4.00,                    // intrinsic self-excitation range, [0, this]
  BIAS_SCALE: 1.45,
  IN_SCALE: 1.18,

  // --------------------------------------------------------------- physics
  DT: 0.015,
  ITERS: 10,               // XPBD Jacobi iterations per step
  OMEGA: 0.55,             // Jacobi under-relaxation; >1 diverges on this topology
  COMPLIANCE: 2.0e-6,      // structural springs (XPBD alpha, world-units^2/force)
  MUSCLE_THRESH: 0.15,     // an edge is a muscle if min(expr[MUSCLE]) exceeds this
  // Maximum fractional rest-length change. Doubles displacement roughly
  // linearly; MUSCLE_MIN/MUSCLE_MAX still cap the realised L/L0 at +-38%, so
  // this mostly buys how quickly a muscle saturates against that cap.
  MUSCLE_AMP: 0.8,
  MUSCLE_MIN: 0.62, MUSCLE_MAX: 1.38,  // hard cap on L/L0, whatever the drive says
  MU_MIN: 0.10, MU_MAX: 2.20,          // Coulomb friction coefficient range
  // Ground friction is applied at the VELOCITY level, not as a positional
  // budget. A positional budget with a static threshold makes quasi-static
  // crawling impossible: the per-step displacement a muscle produces is ~1e-5
  // world units, every cell falls below any threshold worth having, and the
  // whole population sits still. At the velocity level a slipping cell keeps
  // its momentum between steps, so a slow contraction still accumulates
  // displacement, and the threshold separates high-grip cells (anchors) from
  // low-grip cells (feet) instead of freezing both.
  FRIC_K: 6.0,             // Coulomb decrement = grip * FRIC_K * dt, in velocity units
  GRIP_MOD: 0.9,           // how far a cell's activation can raise or lower its grip
  DRAG: 0.96,              // per-step linear velocity retention
  V_MAX: 1.20,             // hard velocity clamp, world units / second
  DX_MAX: 0.35,            // per-iteration positional correction clamp, in cell radii
  WORLD_BOUND: 0.94,

  // ------------------------------------------------------------------ food
  FOOD: 42, FOOD_CLUSTERS: 9, FOOD_CLUSTER_SIGMA: 0.12,
  FOOD_SENSE_SIGMA2: 0.050, FOOD_EAT_SIGMA2: 0.0018,
  FOOD_CONSUME: 0.40, FOOD_REGROW: 0.09, FOOD_RELOCATE_THRESH: 0.15,

  // ----------------------------------------------------------- coevolution
  // Two soft-body species in one arena. OFF by default (COEVO false), and the
  // single-species path stays byte-identical when it is off: nothing below is
  // read, the sensor count stays SENSORS=4, and the genome layout is untouched.
  //
  // When COEVO is on, a fifth sensor channel appears — opponent mass — sensed
  // per sensor cell EXACTLY as food is (a Gaussian-weighted scalar over the
  // opposing organisms' centroids, `senseOpponents` below), sensor-role-gated
  // like the food channel. It is deliberately NOT a bearing vector: the soft
  // body has no single heading, and food itself is a scalar-per-cell field
  // whose steering emerges from the across-body gradient (sb-forage's lateral
  // test). The opponent channel is the same kind of signal, so pursuit and
  // evasion, if they evolve, are the same across-body-gradient mechanism that
  // already carries chemotaxis. Its receptor weight comes from gene 23, which
  // had no phenotypic readout before, so no genome locus is stolen from an
  // existing channel and GENOME_LEN is unchanged.
  //
  //   COEVO_ROLE          'prey' forages and loses fitness on contact;
  //                       'predator' gains fitness on contact and (by default)
  //                       does not forage. Set per species on the Colony.
  //   COEVO_SENSE_SIGMA2  width of the opponent-sensing Gaussian, mirroring
  //                       FOOD_SENSE_SIGMA2 so neither species gets a sharper
  //                       view of its opponent than of its food.
  //   COEVO_CAPTURE_SIGMA2  width of the centroid-to-centroid contact kernel
  //                       that transfers reward. Small: contact is a close
  //                       encounter, not mere co-location.
  //   COEVO_PRED_GAIN     predator fitness per contact-second at full contact.
  //   COEVO_PREY_LOSS     prey fitness lost per contact-second. Larger than the
  //                       gain so predation can dominate prey fitness variance,
  //                       the balance the incumbent coevolution found decisive.
  //   COEVO_PRED_FORAGE   fraction of normal food intake a predator receives
  //                       (0 = pure carnivore).
  //   COEVO_PREY_INTAKE   multiplier on the prey's fitness return from food.
  COEVO: false, COEVO_ROLE: 'prey',
  COEVO_SENSE_SIGMA2: 0.050, COEVO_CAPTURE_SIGMA2: 0.0040,
  COEVO_PRED_GAIN: 1.0, COEVO_PREY_LOSS: 1.5,
  COEVO_PRED_FORAGE: 0, COEVO_PREY_INTAKE: 1,
});

/**
 * Effective sensor-channel count. SENSORS (=4) is the single-species count
 * (food, boundary, own speed, own strain); a coevolutionary world appends one
 * exteroceptive opponent-mass channel at index SENSORS. Kept as a function of
 * cfg so develop() and Colony agree on the width, and so the single-species
 * path returns exactly SENSORS and nothing downstream changes shape.
 */
export const senseCount = (cfg = DEFAULTS) => SENSORS + (cfg && cfg.COEVO ? 1 : 0);
/** Channel index of the appended opponent-mass channel (only present if COEVO). */
export const OPP_CHAN = SENSORS;

/* ---------------------------------------------------------------- genome */

/**
 * A genome is the maternal-drive matrix and the gene-gene regulatory matrix,
 * which is the same pair the incumbent evolves (`morph`/`genM` and `genR`) —
 * deliberately, so that if this substrate ever gets an evolutionary loop the
 * mutation operator is the one already in the project.
 */
/**
 * GENOME LAYOUT — ordered, contiguous, grouped by module.
 *
 * The genome is one flat Float32Array, but it is not an opaque vector: every
 * offset has a name, and functionally related parameters are adjacent. This is
 * a decision about recombination, made before recombination exists, because it
 * is not retrofittable.
 *
 * Uniform per-gene crossover was already tested on the incumbent and was null.
 * That result is about the operator meeting a dense 10x10 regulatory matrix in
 * which every parameter touches everything: there were no building blocks to
 * recombine, only linkage to destroy. If Turing dynamics deliver the
 * modularity they are supposed to deliver, the operator that exploits it is a
 * one- or two-point cut preserving CONTIGUOUS blocks — and that requires the
 * blocks to exist in the layout.
 *
 *   offset                       size                 block
 *   ---------------------------------------------------------------------
 *   0                            3                    rd.activator  (D_A, decay, basal)
 *   3                            2                    rd.inhibitor  (D ratio, decay)
 *   5 + k*(MATERNAL+GENES)       MATERNAL             gene k <- maternal + morphogens
 *   5 + k*(MATERNAL+GENES) + M   GENES                gene k <- every gene
 *
 * The regulatory matrix is stored COLUMN-major: the contiguous run belonging
 * to gene k is *everything that determines gene k*, its positional drive and
 * its regulatory inputs together. A single-point cut therefore transfers whole
 * genes with their full input specification rather than slicing one gene's
 * inputs in half, and because the gene order groups modules (GENE_MODULES
 * above), a two-point cut on a module boundary transfers a whole functional
 * subsystem — the entire neural module, or the entire fate module.
 */
export const RD_BLOCK = 5;
export const GENE_KIN = 3;                 // per-gene lambda, h, alpha
export const GENE_STRIDE = GENE_KIN + MATERNAL + GENES;
export const GENOME_LEN = RD_BLOCK + GENES * GENE_STRIDE;
export const LAYOUT = Object.freeze([
  { name: 'rd.activator', from: 0, to: 3, of: ['D_A', 'decay_mu', 'basal_b'] },
  // Not the inhibitor's rates directly: nu/mu and the multiple of the critical
  // diffusion ratio, from which nu and D_H are derived. See rdParams().
  { name: 'rd.inhibitor', from: 3, to: 5, of: ['nu/mu', 'supercriticality'] },
  ...GENE_MODULES.map(m => ({
    name: `grn.${m.name}`,
    from: RD_BLOCK + m.from * GENE_STRIDE,
    to: RD_BLOCK + m.to * GENE_STRIDE,
    of: [`genes ${m.from}..${m.to - 1}, each ${MATERNAL} maternal + ${GENES} regulatory inputs`],
  })),
]);

/** Offset of the kinetic block (lambda, h, alpha) for gene k. */
export const kinOff = k => RD_BLOCK + k * GENE_STRIDE;
/** Offset of the maternal input block for gene k. */
export const matOff = k => RD_BLOCK + k * GENE_STRIDE + GENE_KIN;
/** Offset of the regulatory input block for gene k. */
export const regOff = k => RD_BLOCK + k * GENE_STRIDE + GENE_KIN + MATERNAL;

export function randomGenome(rng, cfg = DEFAULTS) {
  const buf = new Float32Array(GENOME_LEN);
  for (let i = 0; i < RD_BLOCK; i++) buf[i] = gauss(rng) * 1.0;
  for (let k = 0; k < GENES; k++) {
    const ko = kinOff(k), mo = matOff(k), ro = regOff(k);
    for (let m = 0; m < GENE_KIN; m++) buf[ko + m] = gauss(rng) * 1.0;
    for (let m = 0; m < MATERNAL; m++) buf[mo + m] = gauss(rng) * 0.85;
    for (let m = 0; m < GENES; m++) buf[ro + m] = gauss(rng) * 0.55;
  }
  return { buf };
}

/** Additive Gaussian perturbation of every locus. Used by the ε sweep. */
export function perturbGenome(genome, eps, rng) {
  const buf = Float32Array.from(genome.buf);
  for (let i = 0; i < buf.length; i++) buf[i] += gauss(rng) * eps;
  return { buf };
}

/* --------------------------------------------------------- reproduction */

/**
 * Reproduction operators for an evolutionary loop. The mutation operator is
 * `perturbGenome` above — additive bounded-Gaussian on every locus, the same
 * operator the ε sweep uses, so a mutation rate read off the gate's sensitivity
 * curve means exactly the same thing in the loop that it meant in the gate.
 * `sb-gate.js` located the usable ceiling — morphology distance saturates near
 * ε ≈ 0.75, above which a mutant carries no more information about its parent
 * than a fresh random genome would — so a selection loop must run well below it.
 */

/** Deep copy of a genome. Elitism carries a genome unchanged; cloning makes the
 * carry explicit so a later mutation of a sibling can never alias the elite. */
export function cloneGenome(genome) {
  return { buf: Float32Array.from(genome.buf) };
}

/**
 * Block-preserving one-point crossover on a LAYOUT boundary.
 *
 * The whole reason the genome is laid out as named, contiguous, module-grouped
 * blocks (see LAYOUT) rather than as an opaque vector is so that recombination
 * can transfer a *functional subsystem* — the entire reaction-diffusion
 * activator, or the entire neural module of the GRN — as an intact unit, rather
 * than slicing one gene's regulatory inputs in half. Uniform per-locus crossover
 * was already null on the incumbent precisely because that dense matrix had no
 * blocks to preserve, only linkage to shred; this operator only cuts where a
 * block ends. LAYOUT tiles [0, GENOME_LEN) contiguously, so a cut at any block's
 * `from` swaps a suffix of whole blocks and nothing is left half-copied.
 *
 * The loop does not use this by default — mutation-only tournament is the
 * primary result, matching the one selection rule that has ever moved this
 * project — but the operator lives here, tested against the layout, so a future
 * wave that wants block recombination has it rather than having to retrofit the
 * layout it depends on.
 */
export function blockCrossover(parentA, parentB, rng) {
  const buf = Float32Array.from(parentA.buf), bufB = parentB.buf;
  const cut = LAYOUT[1 + (rng.int() % (LAYOUT.length - 1))].from;
  for (let i = cut; i < buf.length; i++) buf[i] = bufB[i];
  return { buf };
}

const span = ([lo, hi], v) => lo + (hi - lo) * 0.5 * (1 + Math.tanh(v));

/**
 * Genome -> reaction-diffusion kinetic constants, constructed so that every
 * reachable genome is Turing-unstable.
 *
 * The kinetics are Gierer-Meinhardt with basal production:
 *
 *     da/dt = a^2/h - mu*a + b  + D_a lap(a)
 *     dh/dt = a^2   - nu*h      + D_h lap(h)
 *
 * Homogeneous fixed point: a* = (nu + b)/mu,  h* = a*^2/nu.  Writing
 * q = nu/(nu + b) and u = 2q - 1, the Jacobian there is
 *
 *     J11 = mu*u        J12 = -nu^2/a*^2
 *     J21 = 2a*         J22 = -nu
 *
 * and det J = mu*nu > 0 identically, so only three conditions bite:
 *
 *   (i)   trace < 0            no oscillation:  nu > mu*u, and u <= 1, so
 *                              nu > mu is sufficient whatever b is.
 *   (ii)  D_h J11 + D_a J22 > 0
 *   (iii) (D_h J11 + D_a J22)^2 > 4 D_a D_h det J
 *
 * With r = nu/mu and d = D_h/D_a, (iii) reduces to d^2 u^2 - 2 d r (u+2) + r^2 > 0,
 * whose larger root is
 *
 *     d_crit = r * ((u + 2) + 2*sqrt(u + 1)) / u^2
 *
 * which at b = 0 (u = 1) is the familiar d > (3 + 2*sqrt(2)) r ~= 5.83 r. Any
 * d above d_crit satisfies (ii) as well, since d_crit > r/u.
 *
 * So the genome does not encode nu and D_h. It encodes **r > 1** and a
 * **supercriticality multiple > 1**, and nu and D_h are derived. There is no
 * rejection step and no repair step: the map stays continuous, which matters
 * because the whole point of this substrate is to measure how far a small
 * genome change moves the phenotype.
 */
export function rdParams(genome, cfg = DEFAULTS) {
  const K = genome.buf;
  const mu = span(cfg.RD_A, K[1]);
  const b = span(cfg.RD_B, K[2]);
  const r = span(cfg.RD_NU_RATIO, K[3]);          // r<1 oscillates in time, r>1 is the Turing branch
  const nu = mu * r;
  const u = 2 * nu / (nu + b) - 1;                // (nu-b)/(nu+b); can be <= 0 once r<1
  // The critical diffusion ratio only means anything on the stationary branch
  // (r>1, u near 1). For an oscillatory genome u can approach 0 and this would
  // blow up, so the denominator and the root are floored — a guard, not a model
  // choice. The patterning branch has u near 1 and dCrit near 3+2sqrt2, which
  // these floors leave untouched.
  const dCrit = r * ((u + 2) + 2 * Math.sqrt(Math.max(1e-6, u + 1))) / Math.max(0.04, u * u);
  // Diffusion ratio, clamped to a sane band. The clamp bites only in the
  // oscillatory regime (where dCrit can diverge); the stationary branch sits at
  // d ~ 8..19 and is inside the band. Bounding d bounds D_H (which goes as
  // sqrt(d)), which keeps the derived step count and everything downstream finite.
  const d = clamp(dCrit * span(cfg.RD_SUPERCRIT, K[4]), 1, 40);

  // Diffusivities are DERIVED from the wanted pattern wavelength, not sampled.
  // At onset the fastest-growing wavenumber is k_c^2 = sqrt(det J / (D_A D_H))
  // and det J = mu*nu identically here, so fixing the wavelength and the ratio
  // fixes both diffusivities:
  //
  //     k_c = 2*pi / lambda,  D_A = mu*sqrt(r/d) / k_c^2,  D_H = d * D_A
  //
  // Sampling D_A independently instead leaves k_c wherever it falls, and a
  // Turing band outside the range the cell spacing can represent produces no
  // pattern however correct the kinetics are. Wavelength is also the thing with
  // a morphological meaning — it is how many cells wide a stripe or spot comes
  // out — so it is the right quantity for a genome to hold.
  const lambda = span(cfg.RD_WAVELEN, K[0]) * cfg.CELL_R;
  const kc2 = (2 * Math.PI / lambda) ** 2;
  const DA = mu * Math.sqrt(r / d) / kc2;
  const DH = DA * d;

  // Explicit Euler on the length-scaled Laplacian is stable for dt*2*D/h^2 < 1.
  // Derive the step from the fast species rather than fixing one globally, and
  // keep a safety factor — the reaction term is superlinear and contributes its
  // own stiffness on top of the diffusive bound.
  const hK = cfg.RD_KERNEL * cfg.ADHESION * cfg.CELL_R;
  // Two separate stiffnesses, and the step has to respect both. Diffusion:
  // dt*2*D/h^2 < 1. Reaction: the Jacobian's largest eigenvalue is O(nu), and
  // nu reaches mu*r ~ 9 at the top of the range, so a step chosen from the
  // diffusive bound alone can still be explicitly unstable — which shows up as
  // a growing oscillation and is indistinguishable, from the outside, from a
  // genuine Hopf bifurcation. It accounted for 10 of 64 'oscillating' genomes
  // whose kinetics were provably inside the Turing region.
  const dtDiff = 0.1 * (hK * hK) / Math.max(1e-12, DH);
  const dtReac = 0.2 / Math.max(1e-12, nu);
  const dtMax = Math.min(dtDiff, dtReac);
  const steps = Math.min(cfg.RD_MAX_STEPS, Math.max(4, Math.ceil(cfg.RD_TIME / dtMax)));
  const dt = cfg.RD_TIME / steps;

  return { DA, DH, a: mu, b, h: nu, r, d, dCrit, u, lambda, kc2, dt, steps };
}

/**
 * One reaction-diffusion relaxation, in place, over the living cells.
 * Kernel-shaped: a per-cell Laplacian gather, then a per-cell reaction update.
 */
function rdRelax(A, H, x, y, rad, alive, N, steps, K, cfg) {
  const lapA = new Float64Array(N), lapH = new Float64Array(N);
  const hK = cfg.RD_KERNEL * cfg.ADHESION * cfg.CELL_R;
  const h2 = hK * hK;
  for (let it = 0; it < steps; it++) {
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      let sw = 0, sa = 0, sh = 0;
      for (let j = 0; j < N; j++) {
        if (!alive[j] || j === i) continue;
        const d2 = (x[j] - x[i]) ** 2 + (y[j] - y[i]) ** 2;
        if (d2 > h2 * 2.25) continue;
        const w = Math.exp(-d2 / h2);
        sw += w; sa += w * (A[j] - A[i]); sh += w * (H[j] - H[i]);
      }
      // Normalised graph Laplacian, then divided by h^2 to restore the length
      // scale. The normalisation alone puts the eigenvalues in [-2, 0] whatever
      // the local packing, so a cell with twelve neighbours does not get a
      // stiffer equation than one with three — but it also leaves the operator
      // DIMENSIONLESS, which silently breaks the physics: the accessible
      // wavenumbers cap at k^2 = 2 regardless of how far apart the cells are,
      // and a Turing band sitting at k^2 ~ 4 then cannot be represented at all.
      // Measured: 60 of 64 genomes came out flat, with the kinetics provably
      // inside the Turing region. Dividing by h^2 makes D a diffusivity again
      // (length^2/time) and puts the band back in range.
      if (sw > 1e-9) { lapA[i] = 4 * sa / (sw * h2); lapH[i] = 4 * sh / (sw * h2); }
      else { lapA[i] = 0; lapH[i] = 0; }
    }
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      const a = A[i], hh = Math.max(1e-3, H[i]);
      const src = a * a;
      let nA = a + K.dt * (src / hh - K.a * a + K.b + K.DA * lapA[i]);
      let nH = H[i] + K.dt * (src - K.h * H[i] + K.DH * lapH[i]);
      // Gierer-Meinhardt is superlinear and will run away on a finite step.
      // Clamping is a numerical guard, not a model choice; if a genome sits
      // against the ceiling its pattern is saturated rather than divergent,
      // and assertFinite never fires downstream because of it.
      A[i] = nA > cfg.RD_CLAMP ? cfg.RD_CLAMP : (nA > 0 ? nA : 0);
      H[i] = nH > cfg.RD_CLAMP ? cfg.RD_CLAMP : (nH > 1e-3 ? nH : 1e-3);
    }
  }
}

/* ----------------------------------------------------------- development */

/**
 * Grow one organism. Returns a frozen phenotype in a body-local frame centred
 * on the clump's centroid; `Colony` places and orients it in the world.
 *
 * The loop is: read the maternal gradient at each cell's current position,
 * relax the GRN, act on the fate genes (die, divide), then let the clump relax
 * mechanically so that the next cycle's positional readings reflect the new
 * geometry. Position feeds the genes and the genes feed position; that
 * coupling is the whole point, and it is why morphology is not a genome
 * lookup.
 */
// `onCycle`, if given, is called once per developmental cycle with a plain
// snapshot of the living cells (positions, radius, activator concentration, and
// the current sensor/muscle role scores). It exists so a viewer can WATCH
// development — the Turing pattern forming, cells dividing, the clock ticking —
// from the one real develop(), not a reimplementation of it. Guarded, so it
// costs nothing on the headless path that never passes it.
export function develop(genome, cfg = DEFAULTS, rng = makeRng(1), onCycle = null) {
  const N = cfg.N_MAX;
  const x = new Float64Array(N), y = new Float64Array(N);
  const alive = new Uint8Array(N);
  const g = new Float32Array(N * GENES);
  const rad = new Float64Array(N);
  const mat = new Float32Array(MATERNAL);
  const drive = new Float32Array(GENES);
  const tmp = new Float32Array(GENES);
  const buf = genome.buf;
  const K = rdParams(genome, cfg);
  // Morphogen concentrations, carried by the cells. Seeded near the
  // homogeneous steady state of the kinetics plus noise: a Turing instability
  // AMPLIFIES noise, it does not require a prepattern, and starting at the
  // fixed point is the honest test of whether the genome's kinetics are
  // pattern-forming at all.
  const A = new Float64Array(N), H = new Float64Array(N);
  // a* = (nu + b)/mu exactly, not nu/mu — the basal term shifts the fixed point,
  // and seeding off it would hand the relaxation a transient that looks like a
  // pattern forming when it is only the system falling to its own steady state.
  const Ass = (K.h + K.b) / Math.max(1e-3, K.a), Hss = Ass * Ass / Math.max(1e-3, K.h);

  // Seed clump: a small ring, so the maternal x/y gradient has something to
  // read on cycle zero rather than a degenerate point at the origin.
  let n = 0;
  for (let i = 0; i < cfg.SEED_CELLS; i++) {
    const a = (i / cfg.SEED_CELLS) * Math.PI * 2;
    const jx = cfg.DEV_JITTER ? (rng.next() - 0.5) * 2 * cfg.DEV_JITTER : 0;
    const jy = cfg.DEV_JITTER ? (rng.next() - 0.5) * 2 * cfg.DEV_JITTER : 0;
    x[i] = Math.cos(a) * cfg.CELL_R + jx;
    y[i] = Math.sin(a) * cfg.CELL_R + jy;
    alive[i] = 1; rad[i] = cfg.CELL_R; n++;
    A[i] = Ass * (1 + (rng.next() - 0.5) * 2 * cfg.RD_SEED);
    H[i] = Hss * (1 + (rng.next() - 0.5) * 2 * cfg.RD_SEED);
  }

  const S = cfg.DEV_SCALE;
  const born = new Int32Array(N).fill(-1);   // cycle a cell was created

  for (let cyc = 0; cyc < cfg.DEV_CYCLES; cyc++) {
    // --- reaction-diffusion relaxes on the current domain -------------------
    // Before the genes read their inputs, not after: the pattern is part of
    // the positional information, and the domain it relaxes on is whatever
    // shape the last cycle's divisions and deaths produced.
    rdRelax(A, H, x, y, rad, alive, N, K.steps, K, cfg);

    // --- kernel: maternal read + GRN relaxation, one invocation per cell ----
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      // Local density: how many living cells sit within two radii. Contact
      // inhibition needs a signal to inhibit on, and this is the cheapest one
      // that is genuinely about the shape of the body rather than about the
      // cell's own coordinates.
      let dens = 0;
      for (let j = 0; j < N; j++) {
        if (!alive[j] || j === i) continue;
        const dx = x[j] - x[i], dy = y[j] - y[i];
        if (dx * dx + dy * dy < (2.2 * cfg.CELL_R) ** 2) dens++;
      }
      const r2 = (x[i] * x[i] + y[i] * y[i]) / (S * S);
      mat[0] = 1;
      mat[1] = clamp(x[i] / S, -3, 3);
      mat[2] = clamp(y[i] / S, -3, 3);
      mat[3] = Math.exp(-0.5 * r2);
      mat[4] = cyc / Math.max(1, cfg.DEV_CYCLES - 1);
      mat[5] = Math.min(1.5, dens / 6);
      // The morphogens, log-compressed so a saturated activator does not swamp
      // every other input to the network.
      mat[MAT_A] = Math.log1p(A[i]);
      mat[MAT_H] = Math.log1p(H[i]);
      for (let k = 0; k < GENES; k++) {
        let s = 0; const mo = matOff(k);
        for (let m = 0; m < MATERNAL; m++) s += mat[m] * buf[mo + m];
        drive[k] = s;
      }
      const base = i * GENES;
      // Gene circuit dynamics in the Crombach/Jaeger form, kept as three
      // SEPARATE terms rather than fused into one relaxation constant:
      //
      //     dC_k/dt = alpha_k * sigma(sum_m W_mk C_m + drive_k + h_k)
      //               - lambda_k * C_k
      //
      // The incumbent's develop() is `g += 0.19 * (tanh(g W + drive) - g)`:
      // synthesis and decay fused, one global rate, no per-gene threshold and
      // no per-gene maximum synthesis rate. Every gene there has identical
      // dynamics and differs only in its weights, which is exactly the
      // asymmetry worth removing — the lifetime CTRNN already has per-node tau
      // and bias, so development was the crippled half of the same equation.
      // These three parameters per gene are what let different genes sit in
      // different dynamical regimes.
      for (let it = 0; it < cfg.GRN_STEPS; it++) {
        for (let k = 0; k < GENES; k++) {
          let s = drive[k]; const ro = regOff(k), ko = kinOff(k);
          for (let m = 0; m < GENES; m++) s += g[base + m] * buf[ro + m];
          const lam = cfg.LAM_MIN + cfg.LAM_SPAN / (1 + Math.exp(-buf[ko]));
          const h = buf[ko + 1] * cfg.H_SCALE;
          const alpha = cfg.ALPHA_MIN + cfg.ALPHA_SPAN / (1 + Math.exp(-buf[ko + 2]));
          tmp[k] = g[base + k] + cfg.GRN_DT * (alpha * Math.tanh(s + h) - lam * g[base + k]);
        }
        for (let k = 0; k < GENES; k++) g[base + k] = clamp(tmp[k], -8, 8);
      }
    }

    // --- kernel: apoptosis, one invocation per cell ------------------------
    // Evaluated against a snapshot count so that "never below MIN_CELLS" does
    // not depend on the order cells are visited in.
    let liveCount = n;
    for (let i = 0; i < N; i++) {
      if (!alive[i] || born[i] === cyc) continue;
      // Fate is a RATE, not a threshold. A hard threshold on an expression
      // value that is nearly uniform across a body makes growth all-or-none:
      // measured, cell counts came out bimodal at exactly 4 (the seed clump)
      // or exactly 64 (the capacity), with nothing in between and therefore no
      // morphological variation to select on. A logistic rate spreads the
      // distribution, and it is also the honest model — division is stochastic
      // in real tissue, which is precisely the developmental noise that
      // quantity (1) below is built to measure.
      if (rng.next() < fateP(Math.tanh(g[i * GENES + G.DIE]), cfg.DIE_THRESH, cfg.FATE_K)
          && liveCount > cfg.MIN_CELLS) {
        alive[i] = 0; liveCount--; n--;
      }
    }

    // --- kernel: division, one invocation per cell -------------------------
    // Writes into the first free slot (the "dead" slots left by apoptosis are
    // reused, which is what the alive mask buys). Collected first, applied
    // after, so a daughter cannot itself divide within the same cycle.
    const wantDivide = [];
    for (let i = 0; i < N; i++) {
      if (!alive[i] || born[i] === cyc) continue;
      if (rng.next() < fateP(Math.tanh(g[i * GENES + G.DIV]), cfg.DIV_THRESH, cfg.FATE_K))
        wantDivide.push(i);
    }
    for (const i of wantDivide) {
      if (n >= N) break;
      let slot = -1;
      for (let s = 0; s < N; s++) if (!alive[s]) { slot = s; break; }
      if (slot < 0) break;
      const e = i * GENES;
      let px = Math.tanh(g[e + G.POLX]), py = Math.tanh(g[e + G.POLY]);
      px += (rng.next() - 0.5) * cfg.DIV_JITTER;
      py += (rng.next() - 0.5) * cfg.DIV_JITTER;
      const len = Math.sqrt(px * px + py * py) || 1;
      px /= len; py /= len;
      const off = rad[i] * 0.62;
      const cx = x[i], cy = y[i];
      x[i] = cx - px * off; y[i] = cy - py * off;
      x[slot] = cx + px * off; y[slot] = cy + py * off;
      alive[slot] = 1; rad[slot] = rad[i]; born[slot] = cyc; n++;
      // Concentrations, not amounts: a daughter starts at the mother's local
      // morphogen level and the field re-relaxes next cycle. The tiny
      // asymmetry is what lets a division event seed a new pattern element
      // instead of copying one exactly.
      A[slot] = A[i] * (1 + (rng.next() - 0.5) * 0.02);
      H[slot] = H[i] * (1 + (rng.next() - 0.5) * 0.02);
      // Daughter inherits the mother's gene state. It differentiates because it
      // is somewhere else and therefore reads a different maternal gradient —
      // positional information, not an inheritance rule.
      for (let k = 0; k < GENES; k++) g[slot * GENES + k] = g[e + k];
    }

    // --- kernel: cell radius from expression -------------------------------
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      rad[i] = cfg.CELL_R * (1 + cfg.SIZE_RANGE * Math.tanh(g[i * GENES + G.SIZE]));
    }

    // --- mechanical relaxation of the clump --------------------------------
    relaxClump(x, y, rad, alive, N, cfg.DEV_RELAX, cfg);

    if (onCycle) {
      const idx = []; for (let i = 0; i < N; i++) if (alive[i]) idx.push(i);
      onCycle({
        cycle: cyc, cells: idx.length,
        x: idx.map(i => x[i]), y: idx.map(i => y[i]), rad: idx.map(i => rad[i]),
        A: idx.map(i => A[i]),
        sensor: idx.map(i => Math.tanh(g[i * GENES + G.SENSOR])),
        muscle: idx.map(i => Math.tanh(g[i * GENES + G.MUSCLE])),
      });
    }
  }

  // Final expression, and a compacted index list. Everything downstream reads
  // `idx`, so the O(n^2) neural and collision passes cost alive^2 rather than
  // N_MAX^2 — the alive mask is a storage decision, not a compute one.
  const expr = new Float32Array(N * GENES);
  for (let i = 0; i < N * GENES; i++) expr[i] = Math.tanh(g[i]);
  const idx = [];
  for (let i = 0; i < N; i++) if (alive[i]) idx.push(i);

  // Recentre on the body centroid so spawn placement means what it says.
  let cx = 0, cy = 0;
  for (const i of idx) { cx += x[i]; cy += y[i]; }
  cx /= idx.length; cy /= idx.length;
  for (const i of idx) { x[i] -= cx; y[i] -= cy; }

  /* ---------------------------------------------------- adhesion skeleton */
  const ei = new Int32Array(cfg.E_MAX), ej = new Int32Array(cfg.E_MAX);
  const L0 = new Float64Array(cfg.E_MAX), amp = new Float64Array(cfg.E_MAX);
  const kind = new Uint8Array(cfg.E_MAX);      // 1 = passive, 2 = muscle
  let nE = 0;
  for (let a = 0; a < idx.length && nE < cfg.E_MAX; a++) {
    for (let b = a + 1; b < idx.length && nE < cfg.E_MAX; b++) {
      const i = idx[a], j = idx[b];
      const d = Math.sqrt((x[j] - x[i]) * (x[j] - x[i]) + (y[j] - y[i]) * (y[j] - y[i]));
      const reach = cfg.ADHESION * 0.5 * (rad[i] + rad[j]);
      if (d > reach || d < 1e-6) continue;
      ei[nE] = i; ej[nE] = j; L0[nE] = d;
      const mi = expr[i * GENES + G.MUSCLE], mj = expr[j * GENES + G.MUSCLE];
      if (Math.min(mi, mj) > cfg.MUSCLE_THRESH) {
        kind[nE] = 2;
        amp[nE] = cfg.MUSCLE_AMP *
          Math.tanh(0.5 * (expr[i * GENES + G.AMP] + expr[j * GENES + G.AMP]));
      } else { kind[nE] = 1; amp[nE] = 0; }
      nE++;
    }
  }

  /* --------------------------------------------------------------- CTRNN */
  // Same construction as the incumbent's develop(): an excitatory outer
  // product minus an inhibitory one, gated by a distance kernel — except the
  // distances are now the body's real geometry rather than a fixed line, so
  // wiring is a consequence of morphology.
  const nA = idx.length;
  const W = new Float64Array(nA * nA);
  const bias = new Float64Array(nA), tau = new Float64Array(nA);
  const tauA = new Float64Array(nA), adapt = new Float64Array(nA);
  const NS = senseCount(cfg);
  const win = new Float64Array(nA * NS);
  const grip = new Float64Array(nA);
  const isSensor = new Uint8Array(nA);
  for (let a = 0; a < nA; a++) {
    const i = idx[a], e = i * GENES;
    bias[a] = expr[e + G.BIAS] * cfg.BIAS_SCALE;
    tau[a] = cfg.TAU_MIN + cfg.TAU_SPAN / (1 + Math.exp(-expr[e + G.TAU]));
    tauA[a] = cfg.TAUA_MIN + cfg.TAUA_SPAN / (1 + Math.exp(-expr[e + G.TAU_A]));
    // Every cell adapts to some degree; the gene sets how much. Gating
    // adaptation on a positive expression value made oscillators rare (one
    // body in sixteen), and a substrate whose gaits are that rare is one
    // where behaviour is mostly "does this genome move at all", which is a
    // binary trait and a terrible thing to select on.
    adapt[a] = cfg.ADAPT_MAX * (0.5 + 0.5 * expr[e + G.ADAPT]);
    // Grip, log-spaced through a steep sigmoid rather than linearly through
    // the expression value. Linear mapping put every cell in one body at
    // roughly the same coefficient — measured, 0.37 to 0.94 across a
    // sixty-four cell organism — and uniform friction is isotropic friction,
    // which cannot propel anything. What locomotion needs is a body that
    // separates into anchors and feet, so the mapping is made to separate.
    const gk = 1 / (1 + Math.exp(-4.0 * expr[e + G.GRIP]));
    grip[a] = cfg.MU_MIN * Math.pow(cfg.MU_MAX / cfg.MU_MIN, gk);
    const sg = Math.max(0, expr[e + G.SENSOR]);
    isSensor[a] = sg > 0.15 ? 1 : 0;
    for (let c = 0; c < NS; c++) {
      // Proprioceptive channels [PROPRIO_FROM, SENSORS) are not organs and are
      // ungated; the exteroceptive channels — food (0), boundary (1) and, when
      // COEVO is on, opponent (SENSORS) — require the sensor role. The opponent
      // channel's receptor weight reads gene 23, previously silent.
      const isProprio = c >= PROPRIO_FROM && c < SENSORS;
      const gate = isProprio ? 1 : sg;
      win[a * NS + c] = gate * expr[e + G.RCP + c] * cfg.IN_SCALE;
    }
  }
  for (let a = 0; a < nA; a++) {
    const i = idx[a];
    for (let b = 0; b < nA; b++) {
      const j = idx[b];
      const dx = x[j] - x[i], dy = y[j] - y[i];
      const d2 = dx * dx + dy * dy;
      const k = Math.exp(-d2 / cfg.SYN_SIGMA2);
      const w = (expr[i * GENES + G.OUT_E] * expr[j * GENES + G.IN_E]
               - expr[i * GENES + G.OUT_I] * expr[j * GENES + G.IN_I]) * k * 2.0;
      // Directional coupling. The symmetric outer-product term above is what
      // the incumbent builds, and on its own it is rank two: its dynamics are
      // fixed points. Adding a term that depends on the *direction* from the
      // presynaptic cell to the postsynaptic one makes W asymmetric —
      // W[a][b] != W[b][a], because the unit vector flips — which is the
      // standard way a spatially embedded network gets travelling waves rather
      // than a settled equilibrium. The axis is itself a developed property,
      // so which way the wave runs is morphology's business.
      const d = Math.sqrt(d2);
      const dirw = d > 1e-9
        ? ((dx / d) * expr[i * GENES + G.AXX] + (dy / d) * expr[i * GENES + G.AXY]) * k * cfg.DIR_SCALE
        : 0;
      W[a * nA + b] = (w + dirw) * (cfg.GAIN / 2.0);       // W[from, to]
    }
    // Self-excitation, NOT scaled by GAIN. Together with the slow adaptation
    // state this is the cell's intrinsic oscillator, and the region that
    // oscillates is specific: measured on the isolated unit, a self-weight
    // below 2 never oscillates at any adaptation strength, and above 2 with
    // adaptation over ~1.5 it oscillates at full amplitude. The developed
    // self-weight used to be ~0.16, which is why gaits were one body in
    // sixteen. Spanning [0, SELF_EXC] puts a real fraction of random genomes
    // on each side of that line, which is what makes "does it move" a graded
    // trait rather than a coin flip.
    W[a * nA + a] += cfg.SELF_EXC * (0.5 + 0.5 * expr[i * GENES + G.OUT_E]);
  }

  // Remap edge endpoints into the compact index space.
  const back = new Int32Array(N).fill(-1);
  for (let a = 0; a < nA; a++) back[idx[a]] = a;
  const cei = new Int32Array(nE), cej = new Int32Array(nE);
  for (let e = 0; e < nE; e++) { cei[e] = back[ei[e]]; cej[e] = back[ej[e]]; }

  // Compact geometry.
  const px = new Float64Array(nA), py = new Float64Array(nA), pr = new Float64Array(nA);
  for (let a = 0; a < nA; a++) { px[a] = x[idx[a]]; py[a] = y[idx[a]]; pr[a] = rad[idx[a]]; }

  let ext = 0, muscles = 0;
  for (let a = 0; a < nA; a++) ext = Math.max(ext, Math.sqrt(px[a] * px[a] + py[a] * py[a]));
  for (let e = 0; e < nE; e++) if (kind[e] === 2) muscles++;
  let sensors = 0; for (let a = 0; a < nA; a++) sensors += isSensor[a];

  // Morphogen field, compacted, plus two readouts of the pattern itself.
  // `patternCV` is the coefficient of variation of the activator across the
  // body: ~0 means the field went homogeneous (no Turing instability, the
  // genome's kinetics are outside the unstable region) and a large value means
  // the tissue is patterned. `patternDomains` counts connected runs of
  // above-mean activator over the adhesion graph — spots, in other words, and
  // therefore a direct count of repeated units.
  const pa = new Float64Array(nA), ph = new Float64Array(nA);
  for (let a = 0; a < nA; a++) { pa[a] = A[idx[a]]; ph[a] = H[idx[a]]; }
  let ma = 0; for (let a = 0; a < nA; a++) ma += pa[a]; ma /= Math.max(1, nA);
  let va = 0; for (let a = 0; a < nA; a++) va += (pa[a] - ma) ** 2; va = Math.sqrt(va / Math.max(1, nA));
  const patternCV = ma > 1e-6 ? va / ma : 0;
  const patternDomains = countDomains(pa, ma, cei, cej, nE, nA);

  return {
    n: nA, x: px, y: py, rad: pr, nSens: NS,
    nE, ei: cei, ej: cej, L0: L0.slice(0, nE), amp: amp.slice(0, nE), kind: kind.slice(0, nE),
    W, bias, tau, tauA, adapt, win, grip, isSensor, A: pa, H: ph, rd: K,
    stats: { cells: nA, edges: nE, muscles, sensors, extent: ext,
             area: polyArea(px, py, nA), patternCV, patternDomains },
  };
}

/** Logistic fate probability: 0.5 at the threshold, steepness FATE_K. */
const fateP = (e, thresh, k) => 1 / (1 + Math.exp(-k * (e - thresh)));

/** Connected components of {cell : A > mean} over the adhesion graph. */
function countDomains(A, mean, ei, ej, nE, n) {
  const hot = new Uint8Array(n);
  for (let a = 0; a < n; a++) hot[a] = A[a] > mean ? 1 : 0;
  const par = new Int32Array(n); for (let a = 0; a < n; a++) par[a] = a;
  const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let e = 0; e < nE; e++) {
    const i = ei[e], j = ej[e];
    if (!hot[i] || !hot[j]) continue;
    const ri = find(i), rj = find(j); if (ri !== rj) par[ri] = rj;
  }
  const seen = new Set();
  for (let a = 0; a < n; a++) if (hot[a]) seen.add(find(a));
  return seen.size;
}

/** Convex-hull-free spread measure: mean squared radius, in cell-radius units. */
function polyArea(x, y, n) {
  let s = 0; for (let i = 0; i < n; i++) s += x[i] * x[i] + y[i] * y[i];
  return n ? s / n : 0;
}

/**
 * Mechanical relaxation of the growing clump: overlap repulsion plus adhesive
 * attraction toward contact. Jacobi, like the lifetime solver, and clamped the
 * same way — a division that lands two cells on top of each other must not be
 * able to launch them.
 */
function relaxClump(x, y, rad, alive, N, iters, cfg) {
  const ax = new Float64Array(N), ay = new Float64Array(N);
  const cnt = new Int32Array(N);
  const cap = cfg.DX_MAX * cfg.CELL_R;
  for (let it = 0; it < iters; it++) {
    ax.fill(0); ay.fill(0); cnt.fill(0);
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < N; j++) {
        if (!alive[j]) continue;
        let dx = x[j] - x[i], dy = y[j] - y[i];
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-9) { dx = 1e-4; dy = 0; d = 1e-4; }
        const rest = rad[i] + rad[j];
        const reach = cfg.ADHESION * 0.5 * rest;
        if (d > reach) continue;
        // Overlap is corrected fully; adhesion pulls only weakly, so the clump
        // packs rather than collapsing to a point.
        const C = d - rest;
        const k = C > 0 ? 0.18 : 1.0;
        let corr = clamp(-0.5 * C * k, -cap, cap);
        const nx = dx / d, ny = dy / d;
        ax[i] -= nx * corr; ay[i] -= ny * corr;
        ax[j] += nx * corr; ay[j] += ny * corr;
        cnt[i]++; cnt[j]++;
      }
    }
    for (let i = 0; i < N; i++) {
      if (!alive[i] || !cnt[i]) continue;
      x[i] += ax[i] / cnt[i]; y[i] += ay[i] / cnt[i];
    }
  }
}

/* ---------------------------------------------------------------- world */

export function makeWorld(cfg = DEFAULTS, rng = makeRng(0x8f3d20a1)) {
  const bound = cfg.WORLD_BOUND * 0.92;
  const centres = [];
  for (let i = 0; i < cfg.FOOD_CLUSTERS; i++)
    centres.push([(rng.next() * 1.72) - 0.86, (rng.next() * 1.72) - 0.86]);
  const fx = new Float64Array(cfg.FOOD), fy = new Float64Array(cfg.FOOD);
  for (let i = 0; i < cfg.FOOD; i++) {
    const c = centres[i % Math.max(1, centres.length)] || [0, 0];
    const j = () => (rng.next() + rng.next() + rng.next() - 1.5) * (cfg.FOOD_CLUSTER_SIGMA / 1.5);
    fx[i] = clamp(c[0] + j(), -bound, bound);
    fy[i] = clamp(c[1] + j(), -bound, bound);
  }
  return { fx, fy, n: cfg.FOOD };
}

/* --------------------------------------------------------------- colony */

/**
 * P developed organisms in one arena, sharing one depleting food field —
 * matched to how the incumbent evaluates a population, so that the noise a
 * repeatability measure sees here has the same structure it has there.
 *
 * Storage is fixed-capacity structure-of-arrays across organisms: particle o*S
 * ... o*S+n-1 belongs to organism o, where S is the per-organism stride. Dead
 * slots are simply never indexed.
 */
export class Colony {
  constructor(phenos, world, cfg = DEFAULTS) {
    this.cfg = cfg; this.world = world; this.ph = phenos;
    this.P = phenos.length;
    // Effective sensor width. All phenotypes in one colony develop under one
    // cfg, so they share it; fall back to SENSORS when a pheno predates nSens.
    this.NS = phenos.length && phenos[0].nSens ? phenos[0].nSens : senseCount(cfg);
    const S = this.S = Math.max(1, ...phenos.map(p => p.n));
    const T = this.P * S;
    this.px = new Float64Array(T); this.py = new Float64Array(T);
    this.qx = new Float64Array(T); this.qy = new Float64Array(T);   // predicted
    this.vx = new Float64Array(T); this.vy = new Float64Array(T);
    this.ax = new Float64Array(T); this.ay = new Float64Array(T);   // Jacobi accumulator
    this.cnt = new Int32Array(T);
    this.rad = new Float64Array(T); this.grip = new Float64Array(T);
    this.ny = new Float64Array(T); this.act = new Float64Array(T);
    this.ad = new Float64Array(T);      // slow adaptation state
    this.strain = new Float64Array(T);
    this.sens = new Float64Array(T * this.NS);
    this.stock = new Float64Array(world.n).fill(1);
    this.foodX = Float64Array.from(world.fx); this.foodY = Float64Array.from(world.fy);
    // Per-organism accumulators.
    this.startX = new Float64Array(this.P); this.startY = new Float64Array(this.P);
    this.path = new Float64Array(this.P);
    this.intake = new Float64Array(this.P);
    this.lastCX = new Float64Array(this.P); this.lastCY = new Float64Array(this.P);
    this.occ = Array.from({ length: this.P }, () => new Set());
    // Collision candidate lists, rebuilt once per step.
    this.colI = new Int32Array(this.P * 512); this.colJ = new Int32Array(this.P * 512);
    this.colN = new Int32Array(this.P);
    this.lam = new Float64Array(this.P * cfg.E_MAX);
    this.steps = 0;
    // Directedness control (see kSense). null = intact food sense; 'mean'/'const'
    // ablate the food-bearing channel. Off by default, so nothing that does not
    // set it sees any change in behaviour.
    this.foodAblate = null;

    // -------------------------------------------------------- coevolution
    // All inert unless a two-species driver sets them (sbCoevoStep). `role`
    // selects predator vs prey fitness accounting; `opponentCentroids` is the
    // opposing colony's per-organism [x, y, n] handed in each step, and reads
    // as "nothing in sight" (opponent channel 0, no contact) when null — which
    // is exactly the single-species case, so nothing changes when COEVO is off.
    this.role = cfg.COEVO ? cfg.COEVO_ROLE : null;
    this.opponentCentroids = null;
    this.contact = new Float64Array(this.P);   // integrated contact-seconds
    // Opponent-channel ablation, mirroring foodAblate: 'mean'/'const'/null. This
    // is the decisive instrument — blinding the opponent sense on an evolved
    // population and measuring the change in capture/escape.
    this.oppAblate = null;
  }

  /** Place every organism: random position, random body orientation, zero state. */
  spawn(rng) {
    const cfg = this.cfg, S = this.S, b = cfg.WORLD_BOUND * 0.72;
    this.px.fill(0); this.py.fill(0); this.vx.fill(0); this.vy.fill(0);
    this.ny.fill(0); this.act.fill(0); this.ad.fill(0); this.strain.fill(0);
    this.path.fill(0); this.intake.fill(0); this.contact.fill(0);
    this.stock.fill(1);
    this.foodX.set(this.world.fx); this.foodY.set(this.world.fy);
    this.steps = 0;
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o];
      const ox = (rng.next() * 2 - 1) * b, oy = (rng.next() * 2 - 1) * b;
      const th = rng.next() * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      let cx = 0, cy = 0;
      for (let a = 0; a < p.n; a++) {
        const t = o * S + a;
        this.px[t] = ox + p.x[a] * c - p.y[a] * s;
        this.py[t] = oy + p.x[a] * s + p.y[a] * c;
        this.rad[t] = p.rad[a]; this.grip[t] = p.grip[a];
        cx += this.px[t]; cy += this.py[t];
      }
      cx /= p.n; cy /= p.n;
      this.startX[o] = cx; this.startY[o] = cy;
      this.lastCX[o] = cx; this.lastCY[o] = cy;
      this.occ[o].clear();
    }
  }

  centroid(o) {
    const p = this.ph[o], S = this.S;
    let cx = 0, cy = 0;
    for (let a = 0; a < p.n; a++) { cx += this.px[o * S + a]; cy += this.py[o * S + a]; }
    return [cx / p.n, cy / p.n];
  }

  /* ---- kernel: sensory read (per cell, only where a sensor role exists) --- */
  kSense() {
    const cfg = this.cfg, S = this.S, W = this.world, NS = this.NS;
    const s2 = cfg.FOOD_SENSE_SIGMA2;
    // Opponent sensing is only wired when there is a channel for it AND an
    // opposing population handed in this step. Off => the opponent channel (if
    // present) reads zero, and the single-species path never enters this branch.
    const os2 = cfg.COEVO_SENSE_SIGMA2;
    const opp = (NS > SENSORS && this.opponentCentroids) ? this.opponentCentroids : null;
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o];
      for (let a = 0; a < p.n; a++) {
        const t = o * S + a, b = t * NS;
        const X = this.px[t], Y = this.py[t];
        // Proprioception, every cell.
        this.sens[b + 2] = Math.tanh(Math.sqrt(this.vx[t] * this.vx[t] + this.vy[t] * this.vy[t]) * 3.0);
        this.sens[b + 3] = Math.tanh(this.strain[t] * 6.0);
        // Exteroception, sensor cells only. The food scan is the most expensive
        // kernel in the step, so skipping it for non-sensors is also why a
        // sparse sensor field costs less than a dense one.
        if (!p.isSensor[a]) {
          this.sens[b] = 0; this.sens[b + 1] = 0;
          if (NS > SENSORS) this.sens[b + OPP_CHAN] = 0;
          continue;
        }
        let mass = 0;
        for (let f = 0; f < W.n; f++) {
          const d2 = (this.foodX[f] - X) ** 2 + (this.foodY[f] - Y) ** 2;
          mass += Math.exp(-d2 / s2) * this.stock[f];
        }
        this.sens[b] = Math.tanh(mass * 0.16);
        this.sens[b + 1] = Math.tanh(Math.max(0, Math.max(Math.abs(X), Math.abs(Y)) - 0.70) * 3.2);
        // Opponent mass — the opposing species sensed EXACTLY as food is: a
        // Gaussian-weighted scalar over the opponents' centroids, at THIS
        // sensor cell's position. Different sensor cells sit at different body
        // positions, so the across-cell gradient is what a body would steer up
        // (pursuit) or down (evasion), the same mechanism chemotaxis uses.
        if (opp) {
          let om = 0;
          for (let q = 0; q < opp.n; q++) {
            const d2 = (opp.x[q] - X) ** 2 + (opp.y[q] - Y) ** 2;
            om += Math.exp(-d2 / os2);
          }
          this.sens[b + OPP_CHAN] = Math.tanh(om * 0.16);
        }
      }
    }
    // Optional ablation of the OPPONENT channel, the decisive blind-vs-intact
    // instrument. Same two removals as foodAblate: 'mean' replaces every sensor
    // cell's opponent reading with the population mean (removes the spatial
    // gradient pursuit/evasion would ride, injects nothing), 'const' pins it to
    // zero. Only meaningful when the channel exists and opponents are present.
    if (this.oppAblate && NS > SENSORS && opp) {
      if (this.oppAblate === 'const') {
        for (let o = 0; o < this.P; o++) {
          const p = this.ph[o];
          for (let a = 0; a < p.n; a++) if (p.isSensor[a]) this.sens[(o * S + a) * NS + OPP_CHAN] = 0;
        }
      } else {
        let sum = 0, cnt = 0;
        for (let o = 0; o < this.P; o++) {
          const p = this.ph[o];
          for (let a = 0; a < p.n; a++) if (p.isSensor[a]) { sum += this.sens[(o * S + a) * NS + OPP_CHAN]; cnt++; }
        }
        const m = cnt ? sum / cnt : 0;
        for (let o = 0; o < this.P; o++) {
          const p = this.ph[o];
          for (let a = 0; a < p.n; a++) if (p.isSensor[a]) this.sens[(o * S + a) * NS + OPP_CHAN] = m;
        }
      }
    }
    // Optional ablation of the FOOD-bearing sensor channel (index 0), for the
    // directedness controls in tools/sb-forage.js. Default (null) leaves the
    // read untouched, so gate/turing/displacement-evolve behaviour is identical.
    //   'mean'  : replace every sensor cell's food channel with the current
    //             population mean of that channel — removes the spatial gradient
    //             a body would steer up (and the temporal signal klinokinesis
    //             would ride) while keeping the network in its operating regime
    //             and the ambient level intact. This is the `blindConst`-style
    //             information-removal-without-noise-injection the incumbent
    //             analysis settled on.
    //   'const' : pin the food channel to 0 for every sensor cell — removes the
    //             level as well, the harsher control.
    if (this.foodAblate) {
      if (this.foodAblate === 'const') {
        for (let o = 0; o < this.P; o++) {
          const p = this.ph[o];
          for (let a = 0; a < p.n; a++) if (p.isSensor[a]) this.sens[(o * S + a) * NS] = 0;
        }
      } else {
        let sum = 0, cnt = 0;
        for (let o = 0; o < this.P; o++) {
          const p = this.ph[o];
          for (let a = 0; a < p.n; a++) if (p.isSensor[a]) { sum += this.sens[(o * S + a) * NS]; cnt++; }
        }
        const m = cnt ? sum / cnt : 0;
        for (let o = 0; o < this.P; o++) {
          const p = this.ph[o];
          for (let a = 0; a < p.n; a++) if (p.isSensor[a]) this.sens[(o * S + a) * NS] = m;
        }
      }
    }
  }

  /* ---- kernel: CTRNN update (per cell) ----------------------------------- */
  kNeural() {
    const cfg = this.cfg, S = this.S, dt = cfg.DT, NS = this.NS;
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o], n = p.n, base = o * S;
      for (let a = 0; a < n; a++)
        this.act[base + a] = Math.tanh(this.ny[base + a] + p.bias[a] - p.adapt[a] * this.ad[base + a]);
      for (let b = 0; b < n; b++) {
        let rec = 0;
        for (let a = 0; a < n; a++) rec += this.act[base + a] * p.W[a * n + b];
        let inp = 0;
        const wb = b * NS, sb = (base + b) * NS;
        for (let c = 0; c < NS; c++) inp += p.win[wb + c] * this.sens[sb + c];
        const t = base + b;
        this.ny[t] += (rec + inp - this.ny[t]) / p.tau[b] * dt;
        // The state is a tanh argument; letting it run to 1e3 buys nothing and
        // costs the only thing that turns finite arithmetic into NaN.
        this.ny[t] = clamp(this.ny[t], -12, 12);
        // Adaptation chases the cell's own output on a much longer timescale;
        // that lag is the oscillator.
        this.ad[t] += (this.act[t] - this.ad[t]) / p.tauA[b] * dt;
      }
    }
  }

  /* ---- kernel: XPBD predict + Jacobi solve + friction (per cell/edge) ---- */
  kPhysics() {
    const cfg = this.cfg, S = this.S, dt = cfg.DT;
    const a2 = cfg.COMPLIANCE / (dt * dt);

    // predict
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o], base = o * S;
      for (let a = 0; a < p.n; a++) {
        const t = base + a;
        let vX = this.vx[t] * cfg.DRAG, vY = this.vy[t] * cfg.DRAG;
        const sp = Math.sqrt(vX * vX + vY * vY);
        if (sp > cfg.V_MAX) { vX *= cfg.V_MAX / sp; vY *= cfg.V_MAX / sp; }
        this.vx[t] = vX; this.vy[t] = vY;
        this.qx[t] = this.px[t] + vX * dt;
        this.qy[t] = this.py[t] + vY * dt;
      }
    }

    // collision candidate list, once per step
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o], base = o * S;
      let m = 0; const cb = o * 512;
      for (let a = 0; a < p.n && m < 512; a++) {
        for (let b = a + 1; b < p.n && m < 512; b++) {
          const dx = this.qx[base + b] - this.qx[base + a];
          const dy = this.qy[base + b] - this.qy[base + a];
          const rr = (this.rad[base + a] + this.rad[base + b]) * 1.05;
          if (dx * dx + dy * dy < rr * rr) { this.colI[cb + m] = a; this.colJ[cb + m] = b; m++; }
        }
      }
      this.colN[o] = m;
    }

    this.lam.fill(0);
    const cap = cfg.DX_MAX * cfg.CELL_R;
    for (let it = 0; it < cfg.ITERS; it++) {
      this.ax.fill(0); this.ay.fill(0); this.cnt.fill(0);
      // per-edge kernel
      for (let o = 0; o < this.P; o++) {
        const p = this.ph[o], base = o * S, lb = o * cfg.E_MAX;
        for (let e = 0; e < p.nE; e++) {
          const i = base + p.ei[e], j = base + p.ej[e];
          let dx = this.qx[j] - this.qx[i], dy = this.qy[j] - this.qy[i];
          let d = Math.sqrt(dx * dx + dy * dy);
          if (!(d > 1e-9)) { dx = 1e-5; dy = 0; d = 1e-5; }
          let L = p.L0[e];
          if (p.kind[e] === 2) {
            const u = Math.tanh(this.act[i] + this.act[j]);
            L = L * clamp(1 + p.amp[e] * u, cfg.MUSCLE_MIN, cfg.MUSCLE_MAX);
          }
          const C = d - L;
          const dl = (-C - a2 * this.lam[lb + e]) / (2 + a2);
          this.lam[lb + e] += dl;
          // Inlined clamp and a single reciprocal. This line runs ITERS times
          // per edge per step — roughly fifty thousand times a step at the
          // population sizes this has to reach — so a call and a second divide
          // are not rounding error here.
          const corr = dl < -cap ? -cap : (dl > cap ? cap : dl);
          const inv = 1 / d, nx = dx * inv, ny = dy * inv;
          this.ax[i] -= nx * corr; this.ay[i] -= ny * corr;
          this.ax[j] += nx * corr; this.ay[j] += ny * corr;
          this.cnt[i]++; this.cnt[j]++;
        }
        // per-pair kernel: non-penetration
        const cb = o * 512, m = this.colN[o];
        for (let k = 0; k < m; k++) {
          const i = base + this.colI[cb + k], j = base + this.colJ[cb + k];
          let dx = this.qx[j] - this.qx[i], dy = this.qy[j] - this.qy[i];
          let d = Math.sqrt(dx * dx + dy * dy);
          if (!(d > 1e-9)) { dx = 1e-5; dy = 0; d = 1e-5; }
          const rest = this.rad[i] + this.rad[j];
          if (d >= rest) continue;
          const c0 = 0.5 * (d - rest);
          const corr = c0 < -cap ? -cap : (c0 > cap ? cap : c0);
          const inv = 1 / d, nx = dx * inv, ny = dy * inv;
          this.ax[i] += nx * corr; this.ay[i] += ny * corr;
          this.ax[j] -= nx * corr; this.ay[j] -= ny * corr;
          this.cnt[i]++; this.cnt[j]++;
        }
      }
      // per-cell kernel: apply the averaged correction. Jacobi, so the read
      // above and the write here are separate passes and no cell sees a
      // partially updated neighbour.
      for (let o = 0; o < this.P; o++) {
        const p = this.ph[o], base = o * S;
        for (let a = 0; a < p.n; a++) {
          const t = base + a;
          if (!this.cnt[t]) continue;
          this.qx[t] += cfg.OMEGA * this.ax[t] / this.cnt[t];
          this.qy[t] += cfg.OMEGA * this.ay[t] / this.cnt[t];
        }
      }
    }

    // friction + world bound + velocity update, per cell
    const B = cfg.WORLD_BOUND;
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o], base = o * S;
      for (let a = 0; a < p.n; a++) {
        const t = base + a;
        // Velocity implied by the constraint solve, then Coulomb friction on
        // it: below the static threshold the cell is anchored, above it the
        // cell slips by the excess and keeps the remainder as momentum. Grip
        // is a developed per-cell property, so which cells are feet and which
        // are anchors is something morphology decides.
        let vX = (this.qx[t] - this.px[t]) / dt, vY = (this.qy[t] - this.py[t]) / dt;
        // Grip is MODULATED by the cell's own activation: a cell can plant or
        // lift. Without this, per-cell friction is a static property and a
        // gait made of one muscle is reciprocal, so Purcell's scallop applies
        // and the net displacement over a cycle is zero however hard the
        // muscle pulls. Grip modulation phase-locked to contraction is the
        // cheapest way out of that, and it is also what a foot is.
        const gm = 1 + cfg.GRIP_MOD * this.act[t];
        const fv = this.grip[t] * (gm > 0.05 ? gm : 0.05) * cfg.FRIC_K * dt;
        const sp = Math.sqrt(vX * vX + vY * vY);
        if (sp <= fv) { vX = 0; vY = 0; }
        else { const s = 1 - fv / sp; vX *= s; vY *= s; }
        if (sp > cfg.V_MAX) { const s = cfg.V_MAX / sp; vX *= s; vY *= s; }
        let X = this.px[t] + vX * dt, Y = this.py[t] + vY * dt;
        if (X > B) { X = B; } else if (X < -B) { X = -B; }
        if (Y > B) { Y = B; } else if (Y < -B) { Y = -B; }
        this.vx[t] = (X - this.px[t]) / dt;
        this.vy[t] = (Y - this.py[t]) / dt;
        this.px[t] = X; this.py[t] = Y;
      }
      // proprioceptive strain, for the next step's sensory read
      for (let a = 0; a < p.n; a++) this.strain[base + a] = 0;
      const c2 = new Int32Array(p.n);
      for (let e = 0; e < p.nE; e++) {
        const i = p.ei[e], j = p.ej[e];
        const d = Math.sqrt((this.px[base + j] - this.px[base + i]) * (this.px[base + j] - this.px[base + i]) + (this.py[base + j] - this.py[base + i]) * (this.py[base + j] - this.py[base + i]));
        const s = (d - p.L0[e]) / p.L0[e];
        this.strain[base + i] += s; this.strain[base + j] += s;
        c2[i]++; c2[j]++;
      }
      for (let a = 0; a < p.n; a++) if (c2[a]) this.strain[base + a] /= c2[a];
    }
  }

  /* ---- kernel: feeding and the food field -------------------------------- */
  kFood() {
    const cfg = this.cfg, W = this.world, dt = cfg.DT;
    // A predator's foraging return is scaled by COEVO_PRED_FORAGE (0 = pure
    // carnivore). Its centroid still DRAWS food down the same way — otherwise a
    // predator sitting on a patch would freeze it for the prey — the scaling
    // only touches how much fitness the predator banks from feeding.
    const forageK = this.role === 'predator' ? cfg.COEVO_PRED_FORAGE : 1;
    const draw = new Float64Array(W.n);
    for (let o = 0; o < this.P; o++) {
      const [cx, cy] = this.centroid(o);
      let best = 0;
      for (let f = 0; f < W.n; f++) {
        const d2 = (this.foodX[f] - cx) ** 2 + (this.foodY[f] - cy) ** 2;
        const k = Math.exp(-d2 / cfg.FOOD_EAT_SIGMA2);
        draw[f] += k;
        const e = k * this.stock[f];
        if (e > best) best = e;
      }
      this.intake[o] += best * dt * forageK;
      // trajectory readouts
      const d = Math.sqrt((cx - this.lastCX[o]) * (cx - this.lastCX[o]) + (cy - this.lastCY[o]) * (cy - this.lastCY[o]));
      this.path[o] += d;
      this.lastCX[o] = cx; this.lastCY[o] = cy;
      // spatial occupancy on a 12x12 grid over the arena
      const gx = Math.min(11, Math.max(0, ((cx + 0.94) / 1.88 * 12) | 0));
      const gy = Math.min(11, Math.max(0, ((cy + 0.94) / 1.88 * 12) | 0));
      this.occ[o].add(gy * 12 + gx);
    }
    for (let f = 0; f < W.n; f++) {
      let s = this.stock[f];
      s += ((1 - s) * cfg.FOOD_REGROW - draw[f] * s * cfg.FOOD_CONSUME) * dt;
      s = clamp(s, 0, 1);
      if (cfg.FOOD_RELOCATE_THRESH > 0 && s < cfg.FOOD_RELOCATE_THRESH) {
        // Deterministic relocation from the step counter and the patch index —
        // no RNG draw here, so an episode is reproducible from the spawn seed
        // alone regardless of how many organisms happened to feed.
        const h = Math.imul(f * 2654435761 ^ this.steps * 40503, 2246822519) >>> 0;
        this.foodX[f] = ((h & 0xffff) / 65536 * 2 - 1) * cfg.WORLD_BOUND * 0.87;
        this.foodY[f] = (((h >>> 16) & 0xffff) / 65536 * 2 - 1) * cfg.WORLD_BOUND * 0.87;
        s = 1;
      }
      this.stock[f] = s;
    }
  }

  /* ---- kernel: contact with the opposing species ------------------------- */
  // Integrated contact-seconds per organism — the ONE physical quantity read
  // identically from both sides (predator: prey caught; prey: times caught),
  // which is what lets a predator generation and a prey generation sit on a
  // single tournament axis. Contact is a close encounter of centroids, matched
  // to how food is eaten (centroid-based), through the capture kernel. Nearest
  // opponent only — `max`, not sum — so a prey pinned between two predators is
  // not double-counted, mirroring the incumbent's contact definition.
  kContact() {
    const opp = this.opponentCentroids;
    if (!opp) return;
    const cfg = this.cfg, dt = cfg.DT, cs2 = cfg.COEVO_CAPTURE_SIGMA2;
    for (let o = 0; o < this.P; o++) {
      const [cx, cy] = this.centroid(o);
      let best = 0;
      for (let q = 0; q < opp.n; q++) {
        const d2 = (opp.x[q] - cx) ** 2 + (opp.y[q] - cy) ** 2;
        const k = Math.exp(-d2 / cs2);
        if (k > best) best = k;
      }
      this.contact[o] += best * dt;
    }
  }

  /** Per-organism centroids, packed as {x, y, n} — the representation the
   *  opposing colony senses and measures contact against. */
  centroids() {
    const x = new Float64Array(this.P), y = new Float64Array(this.P);
    for (let o = 0; o < this.P; o++) { const c = this.centroid(o); x[o] = c[0]; y[o] = c[1]; }
    return { x, y, n: this.P };
  }

  step() {
    this.kSense();
    this.kNeural();
    this.kPhysics();
    this.kFood();
    this.kContact();
    this.steps++;
  }

  /** Scan every position and velocity. Throws rather than returning a score. */
  assertFinite(where = '') {
    for (let o = 0; o < this.P; o++) {
      const p = this.ph[o], base = o * this.S;
      for (let a = 0; a < p.n; a++) {
        const t = base + a;
        if (!Number.isFinite(this.px[t]) || !Number.isFinite(this.py[t]) ||
            !Number.isFinite(this.vx[t]) || !Number.isFinite(this.vy[t]) ||
            !Number.isFinite(this.ny[t]) || !Number.isFinite(this.ad[t]))
          throw new Error(`non-finite state at step ${this.steps} organism ${o} cell ${a} ${where}`);
      }
    }
  }

  /** Behavioural traits, one row per organism. */
  traits() {
    const out = [];
    for (let o = 0; o < this.P; o++) {
      const [cx, cy] = this.centroid(o);
      out.push({
        displacement: Math.sqrt((cx - this.startX[o]) * (cx - this.startX[o]) + (cy - this.startY[o]) * (cy - this.startY[o])),
        path: this.path[o],
        speed: this.path[o] / Math.max(1e-9, this.steps * this.cfg.DT),
        occupancy: this.occ[o].size,
        intake: this.intake[o],
        contact: this.contact[o],
      });
    }
    return out;
  }
}

/** Run one episode. Returns per-organism trait rows. */
export function episode(colony, steps, { checkEvery = 50 } = {}) {
  for (let s = 0; s < steps; s++) {
    colony.step();
    if (checkEvery && s % checkEvery === 0) colony.assertFinite();
  }
  colony.assertFinite('end');
  return colony.traits();
}

/* ----------------------------------------------------------- coevolution */

/**
 * Copy the live food field from its owner (the prey — they are what depletes
 * it) to the other colony, so the two share ONE world rather than two that
 * drift apart as patches are eaten and relocated. Mirrors evodevo's
 * coevoSyncWorld.
 */
export function sbCoevoSyncWorld(owner, other) {
  other.foodX.set(owner.foodX);
  other.foodY.set(owner.foodY);
  other.stock.set(owner.stock);
}

/**
 * Advance both species by one step, simultaneously. Both centroid snapshots are
 * taken BEFORE either steps, so each species reacts to the other's position at
 * the same instant — stepping one and letting the second read the first's
 * already-updated centroids would hand the second a half-step of precognition,
 * exactly the asymmetry a tournament would later read as one side "winning".
 * The prey own the food field; the predators are synced to it after the step.
 */
export function sbCoevoStep(prey, pred) {
  prey.opponentCentroids = pred.centroids();
  pred.opponentCentroids = prey.centroids();
  prey.step();
  pred.step();
  sbCoevoSyncWorld(prey, pred);
}

/** Run one coevolutionary episode of `steps` from the current bodies. NaN-safe
 *  in the same spirit as the single-species episode: assertFinite is scanned
 *  periodically on both colonies and throws rather than letting a NaN reach
 *  fitness. */
export function sbCoevoEpisode(prey, pred, steps, { checkEvery = 50 } = {}) {
  for (let s = 0; s < steps; s++) {
    sbCoevoStep(prey, pred);
    if (checkEvery && s % checkEvery === 0) { prey.assertFinite(); pred.assertFinite(); }
  }
  prey.assertFinite('end'); pred.assertFinite('end');
}
