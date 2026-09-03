/**
 * Development 2.0 — a gene regulatory network growing a body inside an egg.
 *
 * Replaces the positional readout in `devo.js`, which was a painting operator:
 * every cell property was a weighted sum of nine fixed basis functions of two
 * maternal coordinates, evaluated on a hex disc. It had no time, no signalling,
 * no diffusion and no growth, and it produced — measured over 64 living genomes
 * at generation 22 — bodies of elongation p50 = p90 = max = 1.15, identical to
 * random founders. The map could reach elongation 4.0 with hand-made genomes and
 * evolution never found it, because `presence` thresholded on a disc has a hard
 * prior toward "the whole disc". See DEVELOPMENT-2.md.
 *
 * WHAT IS DIFFERENT, AND WHY EACH PIECE IS THERE
 *
 * 1. THE BODY GROWS. Development starts from ONE cell at the centre of the egg
 *    and adds cells over time where the network says to grow. Morphology is
 *    therefore the RECORD OF A PROCESS rather than a thresholded function, and an
 *    elongated body is what you get by growing preferentially along an axis —
 *    which is one gene being high at one pole. That is the whole point: the thing
 *    Dev 1.0 made improbable, this makes cheap.
 *
 * 2. GENE PRODUCTS DIFFUSE, AT DIFFERENT RATES. Without transport each cell's
 *    network runs independently and the only spatial information available is the
 *    maternal gradient — Dev 1.0 with extra steps. Turing patterns need a slow
 *    activator against a fast inhibitor, so the diffusion rate is per-product and
 *    evolved, spanning two decades.
 *
 * 3. CONCENTRATIONS ARE NON-NEGATIVE, WITH PRODUCTION AND DECAY. A CTRNN's tanh
 *    would give negative concentrations, which are meaningless, and would lose
 *    degradation — which is what oscillators are built from. The form is
 *
 *      dc_g/dt = P * sigmoid(bias_g + SUM_k w_gk * c_src(g,k))  -  decay_g * c_g
 *                                                               +  D_g * laplacian
 *
 *    which is CTRNN-shaped (same gather-and-squash) but positivity-preserving.
 *    Mutual exclusion — the motif that breaks symmetry — is just w_ab < 0 and
 *    w_ba < 0, falling out of weight sign rather than being a special case.
 *
 * 4. THE NETWORK IS SPARSE. A dense 256-gene network is 65,536 weights and
 *    evolution explores none of it. K regulators per gene, exactly as the brain
 *    has K incoming edges per neuron, with structural mutation moving the edges.
 *    Real transcription factors have few targets; this is not only a budget cut.
 *
 * 5. THE AXES ARE MATERNAL, NOT NOISE. Noise-driven symmetry breaking gives a
 *    RANDOM side each generation — a coin flip, not a coordinate system, and
 *    selection cannot act on it. The mother is a physical object with a heading,
 *    so she deposits an oriented egg: that gives AP, its perpendicular gives DV,
 *    deterministically and heritably. Noise is still present (gene 3) and is what
 *    lets a Turing instability choose a phase, but it is not asked to do a job it
 *    cannot do.
 *
 * WHAT IS DELIBERATELY STILL ABSENT
 *
 * Development happens as an internal integration AT BIRTH, not as an egg sitting
 * in the world developing over real time while things eat it. That second thing
 * is the eggs.md programme and it is a separate, larger change to reproduction.
 * This module is the encoding; it does not yet make eggs physical.
 */

// Imported, never restated. SPACING and the synapse basis are shared with
// devo.js because both encodings feed the same bond() and the same arena, and
// this codebase has already lost a day to two copies of SPACING drifting apart
// (bond() looked for neighbours closer than the lattice actually placed them, so
// every developed body came out with zero bonds — no skeleton, no brain).
import { SPACING, SYN_BASIS, NSYN, SYN_RANGE } from './devo.js';
// RE-EXPORTED, not just imported. The genome viewer reads the encoding's shape
// off whichever module actually ran — D.SYN_BASIS, D.NSYN — and devo2 imported
// these for its own use without passing them on, so the endpoint threw
// "Cannot read properties of undefined (reading 'map')" and the browser showed
// a 500 as "could not load genome". The synapse basis genuinely IS shared with
// devo.js; sharing it means re-exporting it, not hiding it.
export { SPACING, SYN_BASIS, NSYN, SYN_RANGE };

/** Gene products. The sketch numbers them 0-255; 64 is what actually evolves in
 *  a reasonable number of generations, and every reserved index below is defined
 *  as an offset so widening this does not renumber anything. */
export const NGENE = 64;

/** Regulators per gene. The brain uses 12 incoming edges; genes need fewer. */
export const K = 6;

/**
 * Egg radius, in world units. MUCH larger than a compact body of maxCells, and
 * that is the whole point — Dev 1.0's egg was the size of the body it contained,
 * so growth filled the shell and every animal was a disc. The egg has to afford
 * a shape before a genome can choose one. `evolve.js` reads this rather than
 * carrying its own default, so the two cannot disagree.
 */
export const DEFAULT_EXTENT = 12;

/**
 * NEURON TIME CONSTANTS, and why the fast end matters more than it looks.
 *
 * The CTRNN integrates `state += (acc - state) * dt / tau`, so `dt / tau` is the
 * fraction of the way a neuron moves toward its input each step. With dt = 0.015
 * and the old floor of tau = 0.018 s that ratio reached **0.83**: the fastest
 * neurons jumped almost the whole way to their input every step, which is not a
 * leaky integrator at all — it is a comparator, and it produces square waves
 * whatever the weights do. The scope showing hard-edged traces was not aliasing
 * (it samples every step now, 33 Hz Nyquist); the dynamics really are that.
 *
 * A smooth curve needs dt/tau well below 1, and a gait usable by the body needs
 * a period in the 0.3-3 Hz band the drag time constants allow (REGIME.md). Both
 * point at the same place: keep the fast end near 0.05 s rather than 0.018 s.
 *
 * Expressed as centre and half-width in decades so the shape of the distribution
 * is one decision rather than two magic endpoints.
 */
// MEASURED, not guessed. Sweeping the range over 24 developed bodies, sampling
// every step (33 Hz Nyquist), with jumpiness = mean|step| / range:
//
//     0.018-1.80s   jumpy 1.000   med 33.3 Hz   in-band  1-13%
//     0.063-1.00s   jumpy 1.000   med 33.3 Hz   in-band  1-16%
//     0.126-1.26s   jumpy 0.065   med  1.72 Hz  in-band    34%
//     0.239-1.51s   jumpy 0.025   med  0.33 Hz  in-band    49%
//
// It is a cliff, not a gradient. Above dt/tau ~ 0.12 every trace is a perfect
// square wave flipping at the sample rate — the neurons were comparators. Below
// it they are integrators, and the rhythm drops into the 0.3-3 Hz band the drag
// time constants can actually convert into travel (REGIME.md).
//
// 0.126-1.26s is chosen over the smoother 0.239-1.51s because 1.72 Hz is a more
// useful gait frequency than 0.33 Hz and it keeps a faster end for reflexes.
export let TAU_MID = 0.4;
export let TAU_DECADES = 0.5;        // -> 0.126 s .. 1.26 s, dt/tau 0.012 .. 0.119
export function tauOf(x) { return TAU_MID * Math.pow(10, x * TAU_DECADES); }
/** Experiment knob, not a world parameter — the right range is found by
 *  sweeping it in situ, exactly as devo.js does for the synapse scale. */
export function setTauRange(mid, decades) { TAU_MID = mid; TAU_DECADES = decades; }

// --- reserved gene indices -------------------------------------------------
// Maternal. These are BOUNDARY CONDITIONS: clamped from geometry every step,
// never integrated, so they cannot be regulated away. The sketch's "000".
export const G_AP    = 0;   // anterior-posterior, 0..1 along the egg's heading
export const G_DV    = 1;   // dorsal-ventral, 0..1 across it
export const G_RAD   = 2;   // distance from the centre, 0 at core, 1 at shell
export const G_NOISE = 3;   // fixed per-site noise — the symmetry-breaking seed
// CROWDING — how enclosed this cell is, 0 alone to 1 fully surrounded. Not
// maternal: a signal from the cell's own neighbourhood, sampled every step.
//
// This exists because of a measured failure. Without it, growth is isotropic:
// every cell with a free neighbour and enough `grow` extends, so a body expands
// as a disc from its seed and elongation cannot exceed the aspect of a circle
// however good the network is. Selection on elongation for 30 generations moved
// Dev 2.0 not at all (1.30 -> 1.30) while Dev 1.0 managed 1.15 -> 1.39.
//
// A tip is a cell with few occupied neighbours. Exposing crowding as an INPUT
// lets a genome grow only where it is uncrowded — apical growth, filaments,
// branches — or ignore it and stay a blob. Reachable, not imposed: the founder
// seeding below leans on it, and mutation is free to weight it to zero.
export const G_CROWD = 4;
export const N_MATERNAL = 5;

// Outputs. Read off as cell properties once development finishes. A fixed
// readout block over an evolved network: the interface to the rest of the
// pipeline (describe(), bond(), synapse()) is unchanged, so this module can be
// swapped in without touching the arena.
export const OUT_BASE = 8;
export const OUTPUTS = ['grow', 'survive', 'contract', 'sense', 'grip', 'stiff', 'tau', 'bias',
                        'senseTune', 'divideAngle', 'spacing', 'dispersal',
                        'toughness', 'tag', 'enzyme',
                        // DENSITY — what the cell is made of, gaseous to leaden.
                        // Not a role and not a behaviour: a material property
                        // whose consequence is that inertia and drag no longer
                        // scale together, so which ways of moving work at all
                        // becomes something a body can be built into rather
                        // than something the kernel decides.
                        'density',
                        // FUSE — how readily this cell merges with a neighbour
                        // made of the same stuff, during the relaxation phase
                        // that ends development. Nothing here names a joint or
                        // a limb: a joint is what is LEFT where fusion did not
                        // happen, at the boundary between unlike tissue.
                        'fuse'];
export const G_GROW    = OUT_BASE + 0;
/**
 * SURVIVE — whether this cell is still part of the body when the egg hatches.
 *
 * Shape does not have to come only from where growth happened. Real embryos
 * carve as much as they build: interdigital webbing is REMOVED by apoptosis, not
 * un-grown, and differential adhesion sorts tissue that was laid down uniformly.
 *
 * This matters here for a specific reason. Patterning across a field — stripes,
 * bands, gap-gene domains — needs a FIELD to pattern: a fly reads its gradients
 * across thousands of nuclei that already exist. A body extruded one cell at a
 * time from a growing tip never has that field, which is the leading suspect for
 * why segments measure ~0 under pure tip growth. Cleavage mode fills the egg so
 * a field exists, and `survive` is then what makes a filled egg into a shape
 * rather than a disc.
 */
export const G_SURVIVE = OUT_BASE + 1;
/** Compass tuning: magnitude is acuity, sign picks northness vs eastness. One
 *  gene for both because a sensor that knows nothing has no axis to choose. */
export const G_SENSETUNE = OUT_BASE + 8;

/** Top of the range is reserved for environmental signals (the sketch's 201-255).
 *  Nothing writes these yet; they exist so the numbering is stable when they do. */
export const N_EXTERNAL = 8;
export const EXT_BASE = NGENE - N_EXTERNAL;

// --- genome layout ---------------------------------------------------------
// Per gene: K source indices, K weights, bias, log-decay, log-diffusion.
// Then a trailing block of NSYN synapse coefficients — see synapse() below.
export const GENE_STRIDE = 2 * K + 3;
export const OFF_SRC   = 0;
export const OFF_W     = K;
export const OFF_BIAS  = 2 * K;
export const OFF_DECAY = 2 * K + 1;
export const OFF_DIFF  = 2 * K + 2;
export const GRN_SIZE  = NGENE * GENE_STRIDE;
export const SYN_OFF   = GRN_SIZE;
export const GENOME_SIZE = GRN_SIZE + NSYN;

/**
 * The weight of a synapse from cell `a` to cell `b`.
 *
 * Deliberately the SAME basis and the same range as `devo.js`, imported rather
 * than restated: the brain is wired from what the two endpoint cells are made
 * of, and Dev 2.0 changes what determines a cell's properties, not what a
 * synapse is. Sharing the definition also means the antisymmetric `axial` and
 * `lateral` terms — the ones that let a CTRNN oscillate at all, and which cost
 * this project a measured retraction to discover — cannot drift out of sync
 * between the two encodings.
 *
 * The coefficients live in a trailing block of the genome rather than being
 * expressed by the GRN. Expressing them would be the more elegant story, but a
 * synapse weight is a function of a PAIR of cells and the GRN produces per-cell
 * concentrations; folding pairwise structure into it is a separate design
 * problem, and doing it badly would silently break the connectome. Recorded as
 * an open question rather than smuggled in.
 */
export function synapse(genome, a, b) {
  let s = 0;
  for (let k = 0; k < NSYN; k++) s += genome[SYN_OFF + k] * SYN_BASIS[k][1](a, b);
  return SYN_RANGE * Math.tanh(s);
}

/**
 * PRODUCTION ACTIVATION — logistic vs tanh, and why the answer is not obvious.
 *
 * Two sigmoids are in common use for CTRNNs and they are NOT interchangeable in
 * general: the logistic maps to (0, 1) and tanh to (-1, +1). Randall Beer's work
 * on CTRNN dynamics treats the two as related by an affine reparameterisation —
 * a network in one form maps to a network in the other with adjusted weights and
 * biases — so they span the same dynamics but NOT the same search space, which is
 * what matters to evolution.
 *
 * The distinction bites differently in our two uses:
 *
 * HERE (the GRN). A concentration cannot be negative, so the output range must be
 * [0, inf) and tanh is unavailable as-is. Rescaling it to (0,1) gives
 *
 *     (tanh(x) + 1) / 2  ==  sigmoid(2x)                     [exactly]
 *
 * so for THIS use, "logistic vs tanh" collapses to a pure GAIN factor of two. It
 * is not a shape choice at all, which is worth knowing before anyone sweeps it as
 * though it were. `prodGain` exposes it as the continuous knob it really is, and
 * 1.0 and 2.0 are the two named conventions.
 *
 * THE BRAIN (`brainarena_gpu.js`) is the case where the choice is substantive,
 * and it currently uses tanh. There the difference is CENTREDNESS: tanh is odd,
 * so a silent network is quiescent and excitation and inhibition are symmetric
 * about zero; the logistic outputs 0.5 for zero input, so a network with no drive
 * is half-on and every weight has to fight that offset. Given the measurement
 * that 40% of brain cells sit pinned at a rail, this is worth a controlled test
 * rather than an assumption — but it is a BRAIN experiment, not a GRN one, and
 * changing it changes what every evolved genome means.
 */
const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, x))));

/** Named conventions for `prodGain`. See the note above: for a [0,1] output these
 *  differ only by gain, and tanh-rescaled is exactly logistic at gain 2. */
export const PROD_GAIN = { logistic: 1.0, tanhRescaled: 2.0 };

/** Decay rate in 1/s. Spans a decade and a half either side of 1, so a product
 *  can be a fast transient or a stable determinant. */
const decayOf = (g, i) => 0.6 * Math.pow(10, clamp(g[i * GENE_STRIDE + OFF_DECAY], -1.2, 1.2));

/** Diffusion coefficient. TWO DECADES is not generosity — a Turing instability
 *  needs the activator and the inhibitor to differ by roughly an order of
 *  magnitude, so the reachable span must comfortably contain that ratio. */
const diffOf = (g, i) => 0.02 * Math.pow(10, clamp(g[i * GENE_STRIDE + OFF_DIFF], -1, 2));

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

/** Source gene for regulator k of gene i, as an index into 0..NGENE-1. Stored as
 *  a float so one flat Float32Array is the whole genome and the existing
 *  mutation machinery keeps working; rounded on read. */
function srcOf(genome, i, k) {
  const v = genome[i * GENE_STRIDE + OFF_SRC + k];
  if (!Number.isFinite(v) || v < 0) return -1;               // a silenced edge
  const s = Math.floor(v) % NGENE;
  return s < 0 ? -1 : s;
}

/**
/**
 * Development on CONTINUOUS space. There is no lattice.
 *
 * Both encodings used to lay cells on a hex lattice inside the egg and hand the
 * result to continuous physics. It looked tidy and it was a lie: a hex lattice
 * fixes every cell's neighbour count at four to six by construction, so every
 * body came out a triangulated truss. Measured consequence — bodies deformed
 * 3.4% of their own length under muscle, because contracting one bond is
 * resisted by the other five, and the "body axis" taken from two arbitrary
 * lattice neighbours pointed a meaningless direction per cell.
 *
 * Nothing in the biology asks for that. A daughter cell goes where the mother
 * puts it, at a distance the mother's chemistry sets, and the tissue is as
 * regular or as ragged as that chemistry makes it. Connectivity then FOLLOWS
 * from where cells actually are, so a strung-out filament has degree two and
 * deforms freely while a packed sheet has degree six and holds its shape —
 * both reachable, neither imposed.
 */

/** Nominal cell separation, and the unit `spacing` expression varies around.
 *  Shared with bond() in devo.js, which connects by DISTANCE — so a body whose
 *  cells sit further apart than the bond reach is genuinely less connected, and
 *  that is the point rather than a bug. */
export { SPACING as NOMINAL_SPACING };

export function develop(genome, {
  yolk = 1e9, cellCost = 1.0, extent = 12,
  ms = 12000, dtMs = 40, maxCells = 60, rnd = Math.random,
  canalised = true,
  mode = 'grow',
  cleaveFrac = 0.35,
  divRate = 1.6,
  surviveThresh = 0.5,
  // How many rounds of fusion end development. 0 hands over the raw grain of
  // cells, which is what every body before this was.
  condense = 0,
  baseRadius = 0.34,
  maxRadius = 3.0,        // in units of baseRadius
  // WATCHING DEVELOPMENT HAPPEN, rather than being handed the corpse.
  //
  // develop() is one synchronous call that returns a finished body, so anything
  // wanting to SHOW growth had to either re-develop to a series of shorter
  // horizons — wasteful, and quadratic in the number of frames — or block until
  // the whole thing finished and display the end state. Neither shows the
  // process, which is the only interesting thing about a developmental encoding.
  //
  // onStep is called every `stepEvery` timesteps with a live view of the arrays.
  // It is READ-ONLY by contract: it must not retain or mutate them, because they
  // are the working buffers and will be overwritten on the next tick. A caller
  // that wants to keep a frame copies it.
  //
  // Purely observational — with onStep unset nothing about this function changes,
  // which is verified against the previous implementation across ten genomes.
  onStep = null,
  stepEvery = 8,
  // PLUMPING UP AFTER DIVISION — the G1 phase, and the fix for the clock.
  //
  // Cytoplasm is divided rather than created, so every division halves every
  // gene product in both cells and concentration falls as 2^-divisions. Measured
  // against that, the network restores state at a median decay of about 1.04,
  // i.e. ~0.96 s, while divisions arrive every ~0.6 s at full grow. Dilution
  // outruns synthesis, so the dominant signal in the embryo is how many times a
  // cell has divided — a clock — and the maternal gradients are swamped: they
  // correlate with expression at 0.07-0.13 where age correlates at 0.60-0.63.
  //
  // A real cell grows back to size before dividing again. `mass` halves at
  // division and recovers toward 1 by feeding on a nutrient soup assumed
  // abundant inside the egg — this is about VOLUME, not energy, and the energy
  // cost of a cell is still charged against the yolk exactly as before. A cell
  // cannot divide until it has plumped up.
  //
  // This is deliberately not a rate knob. Slowing divRate would also slow
  // dilution and would be a number chosen to produce a result; gating on
  // recovery is a mechanism, and the division rate that falls out of it is
  // whatever the chemistry can sustain.
  plump = false,
  plumpRate = 1.2,
  // SYNCYTIAL DIVISION — nuclei divide, cytoplasm does not.
  //
  // Jaeger's gap-gene work is on the Drosophila syncytial blastoderm, where
  // nuclei divide WITHOUT cytokinesis: there are no cell membranes yet, the
  // cytoplasm is shared, and gap-gene products form a genuine field across the
  // whole embryo that a nucleus reads its position in.
  //
  // This model does the opposite. Every division halves every gene product in
  // both cells, which is correct for a cell with a wall and is the dilution
  // measured to outrun synthesis — decay ~0.96 s against divisions every ~0.6 s
  // — turning the embryo into a clock: expression correlates with age at 0.60
  // and with the maternal axes at 0.08.
  //
  // With syncytial on, a daughter COPIES its mother's concentrations instead of
  // splitting them. Nothing is diluted, so a gradient laid down early survives
  // division and position can compete with age. It is not free: gene product is
  // created rather than conserved, which is a real departure and is why it is an
  // option rather than the default. The energy cost of a cell is still charged
  // against the yolk exactly as before, so no ENERGY is minted — the friction
  // law is untouched. What is relaxed is mass conservation of signalling
  // molecules, which this model never tracked as a budget in the first place.
  syncytial = false,
  // AN AMBIENT MEDIUM — the thing danbri actually asked for, and which the
  // syncytial option above does not provide.
  //
  // In the fly's blastoderm there are no cell walls yet, so a gene product
  // expressed at one position enters a shared cytoplasm and changes the
  // chemistry every other nucleus is reading. Jaeger's gap-gene models are of
  // exactly that: a field across the embryo, and nuclei reading their position
  // in it.
  //
  // What this model had instead was cell-to-cell exchange between neighbours
  // within REACH. That is a medium only in the sense that a chain of buckets is
  // a river: nothing travels further than adjacency allows, and a gradient can
  // only be built by relay.
  //
  // `ambient` adds a real field: a grid over the egg, one layer per gene, that
  // cells secrete into and draw from, and which diffuses on its own. Transfer is
  // MASS CONSERVING by construction — what a cell gains the field loses, summed
  // per bin — so unlike the syncytial copy this creates nothing. The only source
  // is synthesis and the only sink is decay, exactly as before.
  ambient = false,
  ambRes = 24,        // grid cells across the egg
  ambK = 2.0,         // how fast a cell equilibrates with the medium around it
  ambDiff = 1.0,      // scales each gene's own diffusion rate on the grid
  // THE CONTINUUM NEEDS SOURCES, or it is only a drain.
  //
  // The first version of the medium carried gene products and nothing else, and
  // it made the clock WORSE — age correlation 0.645 to 0.790 — because cells
  // equilibrated into a mostly empty field and lost concentration faster than
  // before. A shared medium with nothing in it is a sink.
  //
  // Two more layers, and these are the ones with sources. SUGAR is the egg's
  // provisioned soup: a finite stock, diffusing, that cells draw on to
  // synthesise. Synthesis was already losing to dilution; now it has fuel, and
  // running out of fuel is a real end to growth rather than an arbitrary yolk
  // counter. HEAT sets the rate everything runs at, warm going faster, and
  // diffuses from a boundary the world can set.
  //
  // Both are scalar fields on the same grid, and both are consumed or conducted
  // rather than conjured — the sugar a cell burns leaves the bin it stood in.
  sugar = 0,          // initial sugar per grid bin; 0 = no metabolic limit, as before
  sugarDiff = 0.6,
  sugarPerSynth = 0.02,
  heat = 0,           // ambient heat, 0 = no thermal modulation
  heatDiff = 1.4,
  heatQ10 = 2.0,      // rate multiplier per unit of heat above the reference
  heatRef = 1.0,
  // TWO FRAMES, AND THAT IS THE POINT.
  //
  // Gene products live in EGG coordinates. A product concentrated in the
  // egg's southwest quadrant stays southwest however the egg tumbles, because
  // the egg is what it is dissolved in.
  //
  // Heat does not. It comes from the world through the shell, so it is a
  // WORLD-frame quantity sampled at the egg's position — and if the egg is
  // swirling in mud that is icy on one side and lukewarm on the other, the warm
  // face sweeps around the egg's own frame while the chemistry stays put.
  //
  // That is a source of asymmetry nothing else here provides. A static gradient
  // gives every embryo the same axis; a rotating one gives each embryo a
  // different phase relationship between its chemistry and its warmth, decided
  // by how it happened to be tumbling. heatGrad sets how uneven the outside is,
  // heatSpin how fast the egg turns in it, in turns per second.
  heatGrad = 0,
  heatSpin = 0,
  heatPhase = 0,
} = {}) {
  const dt = dtMs / 1000;
  const nStep = Math.max(1, Math.round(ms / dtMs));
  const cap = Math.max(4, maxCells);

  // Per-cell continuous state. Parallel arrays rather than objects: this is the
  // hot loop of every birth in the world.
  const X = new Float32Array(cap), Y = new Float32Array(cap);
  const conc = new Float32Array(cap * NGENE);
  const next = new Float32Array(cap * NGENE);
  const ready = new Float32Array(cap);
  const noise = new Float32Array(cap);
  // WHICH CELL EACH CELL CAME FROM. Nothing appears from nowhere: every cell
  // but the zygote budded from a specific mother, and that is a fact about the
  // world worth keeping rather than an implementation detail. Local indices
  // here; evolve.js maps them onto durable 64-bit ids.
  const mother = new Int32Array(cap).fill(-1);
  // Cell volume, 1 = fully grown. Only consulted when `plump` is on.
  const mass = new Float32Array(cap).fill(1);
  let n = 0;

  // CANALISATION — developmental noise derived from the genome, so the same
  // genome develops the same body every time. Measured before this: within-genome
  // sd 0.264 against between-genome 0.084, i.e. heritability 0.093, and directed
  // selection on morphology ran DOWNHILL because it was chasing lucky
  // developments. See the note this replaces.
  let rndDev = rnd;
  if (canalised) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < genome.length; i++) {
      h ^= Math.imul(Math.round(genome[i] * 4096) | 0, 16777619);
      h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
    }
    let st = (h || 1) >>> 0;
    rndDev = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  }

  // Per-gene constants, hoisted out of the per-cell loop.
  const decay = new Float32Array(NGENE), diff = new Float32Array(NGENE);
  const bias = new Float32Array(NGENE);
  const src = new Int32Array(NGENE * K), w = new Float32Array(NGENE * K);
  for (let g = 0; g < NGENE; g++) {
    decay[g] = decayOf(genome, g);
    diff[g] = diffOf(genome, g);
    bias[g] = genome[g * GENE_STRIDE + OFF_BIAS];
    for (let k = 0; k < K; k++) {
      src[g * K + k] = srcOf(genome, g, k);
      w[g * K + k] = genome[g * GENE_STRIDE + OFF_W + k];
    }
  }

  // Signalling reach. Diffusion and crowding are both PROXIMITY questions now,
  // not adjacency-on-a-lattice questions.
  const REACH = SPACING * 1.6, REACH2 = REACH * REACH;
  const out = (i, k) => 2 * Math.tanh(conc[i * NGENE + OUT_BASE + k]) - 1;

  const setMaternal = (i) => {
    const b = i * NGENE;
    conc[b + G_AP] = 0.5 * (X[i] / extent + 1);
    conc[b + G_DV] = 0.5 * (Y[i] / extent + 1);
    conc[b + G_RAD] = Math.min(1, Math.hypot(X[i], Y[i]) / extent);
    conc[b + G_NOISE] = noise[i];
    let occ = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = X[j] - X[i], dy = Y[j] - Y[i];
      if (dx * dx + dy * dy < REACH2) occ++;
    }
    // Six neighbours within reach is a packed sheet; that is the reference.
    conc[b + G_CROWD] = Math.min(1, occ / 6);
  };

  X[0] = 0; Y[0] = 0; noise[0] = rndDev(); n = 1;
  setMaternal(0);
  let spent = cellCost, aborted = false;
  const cleaveSteps = Math.round(nStep * cleaveFrac);

  // NEIGHBOUR LISTS, BUILT ONCE PER TIMESTEP.
  //
  // The diffusion term below used to scan all n cells for every cell AND for
  // every one of the 64 genes, so a step cost n * n * NGENE distance tests for a
  // neighbour set that does not depend on the gene at all. That is why
  // development was quadratic with a large constant, why the world can only
  // afford 12,000 ms and 60 cells at a birth, and why a 588-cell body took 41
  // seconds.
  //
  // Two changes, neither of which alters a result. The neighbour set is hoisted
  // out of the gene loop, which alone removes a factor of NGENE. And it is found
  // through a uniform grid of REACH-sized bins instead of a full scan, which
  // removes the factor of n.
  //
  // IDENTICAL OUTPUT IS THE REQUIREMENT, not merely similar. Floating-point
  // addition is not associative, so the accumulation order has to be preserved
  // exactly — the bins are walked and the resulting indices SORTED ASCENDING, so
  // each cell sums its neighbours in the same order the full scan did.
  const nbrIdx = [], nbrWgt = [];
  const bin = new Map();
  const rebuildNeighbours = () => {
    bin.clear();
    const cell = REACH;
    for (let i = 0; i < n; i++) {
      const key = (Math.floor(X[i] / cell) << 16) ^ (Math.floor(Y[i] / cell) & 0xffff);
      let a = bin.get(key);
      if (!a) { a = []; bin.set(key, a); }
      a.push(i);
    }
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(X[i] / cell), gy = Math.floor(Y[i] / cell);
      const idx = [], wgt = [];
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const a = bin.get(((gx + ox) << 16) ^ ((gy + oy) & 0xffff));
        if (!a) continue;
        for (const j of a) {
          if (j === i) continue;
          const dx = X[j] - X[i], dy = Y[j] - Y[i];
          const d2 = dx * dx + dy * dy;
          if (d2 >= REACH2) continue;
          idx.push(j);
        }
      }
      idx.sort((p, q) => p - q);            // the full scan's order, restored
      for (const j of idx) {
        const dx = X[j] - X[i], dy = Y[j] - Y[i];
        wgt.push(1 - Math.sqrt(dx * dx + dy * dy) / REACH);
      }
      nbrIdx[i] = idx; nbrWgt[i] = wgt;
    }
  };

  // Births SINCE THE LAST REPORT, not since the last step. Cleared when the
  // callback fires rather than each tick — clearing per step dropped every
  // division that happened between reports, which at stepEvery 8 lost seven
  // eighths of them and made a body of 1,169 cells look like 162 divisions.
  // The medium: NGENE layers of an ambRes x ambRes grid over the egg.
  const AR = ambient ? Math.max(4, ambRes | 0) : 0;
  const amb = ambient ? new Float32Array(AR * AR * NGENE) : null;
  const ambNext = ambient ? new Float32Array(AR * AR * NGENE) : null;
  const ambFlux = ambient ? new Float32Array(AR * AR * NGENE) : null;
  // The two sourced layers. Sugar starts stocked and is spent; heat starts
  // uniform and conducts.
  const sug = (ambient && sugar > 0) ? new Float32Array(AR * AR).fill(sugar) : null;
  const sugNext = sug ? new Float32Array(AR * AR) : null;
  const hot = (ambient && heat > 0) ? new Float32Array(AR * AR).fill(heat) : null;
  const hotNext = hot ? new Float32Array(AR * AR) : null;
  // Drive the shell from outside. Bins within a bin-width of the egg's edge are
  // held at the external temperature for their direction, which rotates if the
  // egg is spinning. Interior bins are reached only by conduction, so a big egg
  // has a cold core and a small one equilibrates.
  const driveShell = (t) => {
    if (!hot || heatGrad <= 0) return;
    const ang = heatPhase + 2 * Math.PI * heatSpin * t * dt;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    for (let gy = 0; gy < AR; gy++) {
      for (let gx = 0; gx < AR; gx++) {
        const x = ((gx + 0.5) / AR * 2 - 1), y = ((gy + 0.5) / AR * 2 - 1);
        const r = Math.hypot(x, y);
        if (r < 1 - 2.0 / AR) continue;            // interior: conduction only
        if (r > 1.0) { continue; }                  // outside the shell
        // Warm on the side the gradient points at, cold opposite.
        hot[gy * AR + gx] = heat + heatGrad * ((x * ux + y * uy) / Math.max(1e-6, r));
      }
    }
  };
  // How fast chemistry runs here, and whether there is fuel to run it. Read per
  // cell each step, written by the layers above.
  // How fast each cell's chemistry runs this step, from the heat and sugar it is
  // standing in. 1.0 when neither layer is on, so the default is untouched.
  const cellRate = new Float32Array(cap).fill(1);
  // A CONTINUOUS FIELD, SAMPLED BILINEARLY — not a grid of pigeonholes.
  //
  // The first version snapped each cell to the bin containing it, so a cell that
  // drifted across a bin boundary saw its ambient step. That is a lattice
  // wearing a field's name, and this project has spent real effort keeping
  // lattices out of the physics — the spatial hash is explicitly a query radius
  // and not a grid for the same reason.
  //
  // Storage must be discrete somewhere; nothing is representable otherwise. What
  // makes the field continuous is that a position between four samples reads a
  // weighted blend of them, and deposits back in the same proportions. The
  // weights sum to one, so mass is still conserved exactly.
  //
  // Returns the four bin indices and their weights for a position.
  const ambW = [0, 0, 0, 0], ambI = [0, 0, 0, 0];
  const ambAt = (x, y) => {
    const fx = Math.min(AR - 1.0001, Math.max(0, (x / extent + 1) * 0.5 * AR - 0.5));
    const fy = Math.min(AR - 1.0001, Math.max(0, (y / extent + 1) * 0.5 * AR - 0.5));
    const gx = Math.floor(fx), gy = Math.floor(fy);
    const tx = fx - gx, ty = fy - gy;
    const gx1 = Math.min(AR - 1, gx + 1), gy1 = Math.min(AR - 1, gy + 1);
    ambI[0] = gy * AR + gx;   ambW[0] = (1 - tx) * (1 - ty);
    ambI[1] = gy * AR + gx1;  ambW[1] = tx * (1 - ty);
    ambI[2] = gy1 * AR + gx;  ambW[2] = (1 - tx) * ty;
    ambI[3] = gy1 * AR + gx1; ambW[3] = tx * ty;
  };

  const bornSinceReport = [];
  for (let t = 0; t < nStep && !aborted; t++) {
    rebuildNeighbours();
    // ---- regulation, gather-style, out of place
    for (let i = 0; i < n; i++) {
      const b = i * NGENE;
      const ni = nbrIdx[i], nw = nbrWgt[i], nn = ni.length;
      for (let g = N_MATERNAL; g < NGENE; g++) {
        let net = bias[g];
        const wb = g * K;
        for (let k = 0; k < K; k++) {
          const sg = src[wb + k];
          if (sg >= 0) net += w[wb + k] * conc[b + sg];
        }
        let lap = 0;
        if (diff[g] > 0) {
          // Weighted by proximity: a cell twice as far away signals less. On a
          // lattice every neighbour was equidistant and this was a plain mean.
          // The set and the weights are the same for every gene, so they are
          // computed once per step above rather than 64 times per cell here.
          let acc = 0, cnt = 0;
          for (let q = 0; q < nn; q++) {
            const wgt = nw[q];
            acc += conc[ni[q] * NGENE + g] * wgt; cnt += wgt;
          }
          if (cnt > 0) lap = diff[g] * (acc / cnt - conc[b + g]);
        }
        // Synthesis runs at the local rate — warm and fed is fast, cold or
        // starved is slow. Decay and diffusion are not scaled: a cell that
        // cannot synthesise still loses what it has, which is the whole point of
        // fuel mattering.
        const made = sigmoid(net) * cellRate[i];
        if (sug && made > 0) {
          // Charge the ground the cell is standing on, spread over the same four
          // samples it read from, so fuel is spent where it is used.
          ambAt(X[i], Y[i]);
          const cost = made * sugarPerSynth * dt;
          for (let k = 0; k < 4; k++) {
            const bi = ambI[k];
            sug[bi] = Math.max(0, sug[bi] - cost * ambW[k]);
          }
        }
        const c = conc[b + g] + dt * (made - decay[g] * conc[b + g] + lap);
        next[b + g] = c > 0 ? (c < 40 ? c : 40) : 0;
      }
    }
    for (let i = 0; i < n; i++) {
      const b = i * NGENE;
      for (let g = N_MATERNAL; g < NGENE; g++) conc[b + g] = next[b + g];
      setMaternal(i);
    }

    if (ambient) {
      // 1. Exchange, in two passes so it conserves exactly. Each cell computes
      //    what it would take from the medium; the bins are debited by the sum
      //    of what their occupants took, so nothing is created or lost.
      ambFlux.fill(0);
      for (let i = 0; i < n; i++) {
        ambAt(X[i], Y[i]);
        const b = i * NGENE;
        // Local rate: how warm it is here and whether there is fuel, both read
        // at the cell's exact position rather than at a bin's centre.
        let rate = 1;
        if (hot || sug) {
          let h = 0, sgr = 0;
          for (let k = 0; k < 4; k++) {
            if (hot) h += hot[ambI[k]] * ambW[k];
            if (sug) sgr += sug[ambI[k]] * ambW[k];
          }
          if (hot) rate *= Math.pow(heatQ10, h - heatRef);
          if (sug) rate *= sgr / (sgr + 0.25);
        }
        cellRate[i] = rate;
        for (let g = N_MATERNAL; g < NGENE; g++) {
          let here = 0;
          for (let k = 0; k < 4; k++) here += amb[ambI[k] * NGENE + g] * ambW[k];
          const f = ambK * (here - conc[b + g]) * dt;
          conc[b + g] = Math.max(0, conc[b + g] + f);
          // Debited in the same proportions it was read, so the weights cancel
          // and nothing is created by the interpolation.
          for (let k = 0; k < 4; k++) ambFlux[ambI[k] * NGENE + g] += f * ambW[k];
        }
      }
      for (let k = 0; k < AR * AR * NGENE; k++) amb[k] = Math.max(0, amb[k] - ambFlux[k]);

      // 2. The medium diffuses on its own, at each gene's own rate. This is what
      //    makes it a field rather than a set of buckets: a product reaches
      //    cells its maker never touched.
      for (let gy = 0; gy < AR; gy++) {
        for (let gx = 0; gx < AR; gx++) {
          const c = (gy * AR + gx) * NGENE;
          const l = (gy * AR + Math.max(0, gx - 1)) * NGENE;
          const r = (gy * AR + Math.min(AR - 1, gx + 1)) * NGENE;
          const u = (Math.max(0, gy - 1) * AR + gx) * NGENE;
          const d = (Math.min(AR - 1, gy + 1) * AR + gx) * NGENE;
          for (let g = N_MATERNAL; g < NGENE; g++) {
            const lap = amb[l + g] + amb[r + g] + amb[u + g] + amb[d + g] - 4 * amb[c + g];
            ambNext[c + g] = Math.max(0, amb[c + g] + ambDiff * diff[g] * lap * dt);
          }
        }
      }
      amb.set(ambNext);

      // The sourced layers conduct too. Sugar spreads slowly, heat quickly —
      // which is why a warm patch is broad and a fed patch is local.
      const spread = (src, dst, k) => {
        for (let gy = 0; gy < AR; gy++) {
          for (let gx = 0; gx < AR; gx++) {
            const c = gy * AR + gx;
            const lap = src[gy * AR + Math.max(0, gx - 1)] + src[gy * AR + Math.min(AR - 1, gx + 1)]
                      + src[Math.max(0, gy - 1) * AR + gx] + src[Math.min(AR - 1, gy + 1) * AR + gx]
                      - 4 * src[c];
            dst[c] = Math.max(0, src[c] + k * lap * dt);
          }
        }
        src.set(dst);
      };
      if (sug) spread(sug, sugNext, sugarDiff);
      if (hot) { driveShell(t); spread(hot, hotNext, heatDiff); }
    }

    if (plump) {
      for (let i = 0; i < n; i++) {
        if (mass[i] < 1) mass[i] = Math.min(1, mass[i] + dt * plumpRate);
      }
    }

    // ---- division, in continuous space
    const cleaving = mode === 'cleave' && t < cleaveSteps;
    const born = n;
    for (let i = 0; i < born && n < cap; i++) {
      if (!cleaving) {
        ready[i] += dt * conc[i * NGENE + G_GROW] * divRate;
        if (ready[i] < 1) continue;
        // NOT YET BACK TO FULL SIZE: hold the readiness and wait.
        //
        // Gated on the CONCENTRATION the cell actually lost, not on an abstract
        // volume. A first version tracked a separate `mass` that halved and
        // recovered on its own clock, and it changed nothing at all — recovery
        // took 0.375 s against a division interval of 0.6 s, so the gate never
        // fired, and mass was not what dilution had damaged in any case.
        if (plump) {
          let tot = 0;
          const bb = i * NGENE;
          for (let g = N_MATERNAL; g < NGENE; g++) tot += conc[bb + g];
          if (tot < mass[i]) continue;          // mass[i] holds the pre-division total
        }
        ready[i] -= 1;
      }
      if (spent + cellCost > yolk) { aborted = true; break; }

      // WHERE THE DAUGHTER GOES. Outward from the local crowd — a cell divides
      // into the space available — rotated by an angle the chemistry sets, so a
      // genome can grow straight filaments, curl, or branch. Distance is set by
      // the mother too, so tissue can be packed or strung out; that is what
      // decides connectivity, and therefore whether the body is a stiff truss or
      // a deformable chain.
      let cx = 0, cy = 0, cnt = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = X[j] - X[i], dy = Y[j] - Y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 < REACH2 * 4) { cx += dx; cy += dy; cnt++; }
      }
      let ax, ay;
      if (cnt > 0 && (cx || cy)) {
        const L = Math.hypot(cx, cy) || 1;
        ax = -cx / L; ay = -cy / L;                      // away from the crowd
      } else {
        const a0 = noise[i] * Math.PI * 2;
        ax = Math.cos(a0); ay = Math.sin(a0);
      }
      const turn = out(i, 9) * Math.PI;                  // divideAngle gene
      const jitter = (rndDev() - 0.5) * 0.35;
      const th = Math.atan2(ay, ax) + turn + jitter;
      const sp = SPACING * (0.62 + 0.55 * (out(i, 10) + 1));   // spacing gene
      const nx = X[i] + Math.cos(th) * sp, ny = Y[i] + Math.sin(th) * sp;

      if (Math.hypot(nx, ny) > extent) continue;         // the shell
      // Refuse to place a cell inside another. Physics would push them apart at
      // birth, but a body that starts interpenetrating explodes on step one.
      let clash = false;
      for (let j = 0; j < n; j++) {
        const dx = X[j] - nx, dy = Y[j] - ny;
        if (dx * dx + dy * dy < (SPACING * 0.55) ** 2) { clash = true; break; }
      }
      if (clash) continue;

      const d = n++;
      if (plump) {
        // Remember what this lineage had before the split: both cells must
        // rebuild to it before either divides again.
        let tot = 0; const bb = i * NGENE;
        for (let g = N_MATERNAL; g < NGENE; g++) tot += conc[bb + g];
        mass[i] = tot; mass[d] = tot;
      }
      if (onStep) bornSinceReport.push(d);
      X[d] = nx; Y[d] = ny; noise[d] = rndDev(); ready[d] = 0;
      mother[d] = i;
      spent += cellCost;
      // Cytoplasm is divided, not created — unless the embryo is syncytial, in
      // which case the nucleus divides and the shared cytoplasm does not.
      const bs = i * NGENE, bd = d * NGENE;
      if (syncytial) {
        for (let g = N_MATERNAL; g < NGENE; g++) conc[bd + g] = conc[bs + g];
      } else {
        for (let g = N_MATERNAL; g < NGENE; g++) {
          const half = conc[bs + g] * 0.5;
          conc[bd + g] = half; conc[bs + g] = half;
        }
      }
      setMaternal(d);
    }

    // A live view of the embryo, for anything that wants to watch rather than
    // wait. Arrays are the working buffers — see the note on onStep.
    if (onStep && (t % stepEvery === 0 || t === nStep - 1)) {
      onStep({ t, nStep, n, X, Y, mother, born: bornSinceReport, aborted });
      bornSinceReport.length = 0;
    }
  }

  // ---- read the body off the finished chemistry
  const sculpt = mode === 'cleave';
  const cells = [];
  let culled = 0;
  for (let i = 0; i < n; i++) {
    if (sculpt && out(i, 1) < 2 * surviveThresh - 1) { culled++; continue; }
    cells.push({
      // -1 marks the zygote: the one cell in a body that did not bud from
      // another cell in that body. Its own parent is in the PARENT body.
      mother: mother[i], localIndex: i,
      x: X[i], y: Y[i], ap: X[i] / extent, dv: Y[i] / extent,
      contract: out(i, 2), sense: out(i, 3), grip: out(i, 4), stiff: out(i, 5),
      tau: tauOf(out(i, 6)),
      bias: out(i, 7),
      senseTune: out(i, 8),
      // How far this cell's lineage throws its eggs. A life-history trait
      // with a real tradeoff — far escapes kin competition but lands on
      // unknown ground, near keeps known-good ground but competes with your
      // own offspring — so it is evolved, not chosen. It was a hardcoded 9.
      dispersal: out(i, 11),
      // How hard this cell is to take. Nutrition is NOT here: it is read
      // from the cell's own energy, because being worth eating is a
      // consequence of carrying energy and not a trait to opt out of.
      toughness: out(i, 12),
      // What this cell is made of, and what it can break down. Mapped to
      // 0..1 rather than -1..1 because they are positions on a shared axis,
      // and a match is a distance along it.
      tag: 0.5 * (out(i, 13) + 1),
      enzyme: 0.5 * (out(i, 14) + 1),
      // 0..1, mapped log-scaled onto densLo..densHi by the kernel. 0.5 is the
      // geometric middle and is neutrally buoyant, so an unexpressed gene
      // leaves the cell exactly where the old massless world had it.
      density: 0.5 * (out(i, 15) + 1),
      fuse: 0.5 * (out(i, 16) + 1),
      // Every cell leaves development the same size. Relaxation below is what
      // makes some of them big.
      radius: baseRadius,
    });
  }
  // ---- RELAXATION: the embryo simplifies before it has to work -----------
  //
  // Development lays down a body one cell at a time and every cell comes out the
  // same size, so a body was a crowd of identical grains. Real embryos do not
  // hand over what they built: tissue condenses, like fuses with like, and what
  // is left between unlike regions is a joint.
  //
  // WHAT MERGES. Two bonded cells fuse when they are made of similar stuff AND
  // both are willing, willingness being the `fuse` gene. Similarity is measured
  // over the material properties only - density, toughness, tag, stiffness -
  // not over what the cells DO, because fusing by role would be the kernel
  // deciding that muscle belongs with muscle. A uniform stretch of tissue
  // condenses into one large node; a boundary between two materials does not
  // fuse, and the small cells left along it articulate. Joints are a residue.
  //
  // WHAT IS CONSERVED. Area, exactly: a merged cell has radius sqrt(r1^2+r2^2),
  // so mass is conserved and nothing is minted. Every other property is an
  // area-weighted mean, so a big node made of ten cells counts as ten cells
  // worth of whatever they were.
  const relaxed = condense > 0 ? condenseBody(cells, {
    condense, maxRadius: maxRadius * baseRadius, extent,
  }) : cells;

  return { cells: relaxed, spent, aborted, steps: nStep, culled, laid: n,
           merged: cells.length - relaxed.length };
}

/**
 * Greedy area-conserving fusion over the neighbour graph.
 *
 * Deliberately NOT iterative-to-convergence: each pass merges the best
 * available partner for each cell and then stops, so the result is a body with
 * a range of sizes rather than one that has collapsed to a few blobs. `condense`
 * sets how many passes run, which is how far the body is allowed to simplify.
 */
function condenseBody(cells, { condense, maxRadius, extent }) {
  let live = cells.map((c) => ({ ...c }));
  const passes = Math.max(1, Math.round(condense));

  for (let pass = 0; pass < passes; pass++) {
    const n = live.length;
    if (n < 2) break;
    // Material distance. Capacities are deliberately absent - see above.
    const unlike = (a, b) => Math.hypot(
      (a.density - b.density) * 1.6,
      (a.toughness - b.toughness),
      (a.tag - b.tag),
      (Math.tanh(a.stiff) - Math.tanh(b.stiff)) * 0.5,
    );
    const gone = new Uint8Array(n);
    const out = [];
    // Nearest-neighbour pairing in space; a cell only fuses with something it
    // is touching, so this respects the body's actual geometry.
    for (let i = 0; i < n; i++) {
      if (gone[i]) continue;
      const a = live[i];
      let best = -1, bestScore = 0;
      for (let j = i + 1; j < n; j++) {
        if (gone[j]) continue;
        const b = live[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > (a.radius + b.radius) * 1.35) continue;      // not touching
        const rNew = Math.sqrt(a.radius * a.radius + b.radius * b.radius);
        if (rNew > maxRadius) continue;                       // a cell has a limit
        // Willingness is the MEAN of the pair, not the product. A product of
        // two numbers that both sit near zero by default is a gate that never
        // opens - measured median fuse was 0.097, so no pair ever cleared the
        // threshold and 2% of cells merged over three passes.
        const score = 0.5 * (a.fuse + b.fuse) * Math.exp(-unlike(a, b) * 4);
        if (score > bestScore) { bestScore = score; best = j; }
      }
      if (best < 0 || bestScore < 0.25) { out.push(a); continue; }
      const b = live[best];
      gone[i] = 1; gone[best] = 1;
      const wa = a.radius * a.radius, wb = b.radius * b.radius, wt = wa + wb;
      const mix = (k) => (a[k] * wa + b[k] * wb) / wt;
      out.push({
        ...a,
        // The merged cell keeps the elder's identity so lineage stays traceable.
        mother: a.localIndex <= b.localIndex ? a.mother : b.mother,
        localIndex: Math.min(a.localIndex, b.localIndex),
        x: mix('x'), y: mix('y'),
        radius: Math.sqrt(wt),                       // area conserved exactly
        contract: mix('contract'), sense: mix('sense'), grip: mix('grip'),
        stiff: mix('stiff'), tau: mix('tau'), bias: mix('bias'),
        senseTune: mix('senseTune'), dispersal: mix('dispersal'),
        toughness: mix('toughness'), tag: mix('tag'), enzyme: mix('enzyme'),
        density: mix('density'), fuse: mix('fuse'),
      });
    }
    if (out.length === n) break;                     // nothing fused; done
    live = out;
    for (const c of live) { c.ap = c.x / extent; c.dv = c.y / extent; }
  }
  return live;
}

/**
 * A random genome that actually develops into something.
 *
 * A uniformly random network almost always either never reaches the growth
 * threshold (a one-cell embryo) or saturates it everywhere (a filled disc — the
 * exact failure Dev 1.0 had). So the growth gene is seeded with a positive bias
 * and a maternal input, which makes founders grow SOMETHING without prescribing
 * a shape: which direction, how far, and whether growth is patterned are all
 * left to the network.
 */
/**
 * Founder seeding constants. Exposed as an options object because these are
 * EXPERIMENT KNOBS, not world parameters — the values that make a founder
 * population viable are found by sweeping them, not by reasoning, and a sweep
 * needs them addressable. Same treatment `devo.js` gives `setSynRange`.
 */
export const SEED_DEFAULTS = {
  edgeProb: 0.35,      // fraction of regulator slots live at birth
  weightScale: 2.5,    // spread of regulator weights
  biasSpread: 2.0,     // spread of per-gene bias
  biasOffset: -1.2,    // pushes most genes off at birth
  decaySpread: 0.8,
  diffSpread: 1.0,
  growBias: 0.2,
  growCrowd: -4.0,     // negative = grow where UNCROWDED, i.e. at a tip
  growSelf: 0.8,       // autocatalysis, so a tip sustains itself
  growAp: 0.6,         // a little polarity, so growth has a preferred end
  growDecay: 0.25,
  growDiff: -0.7,
  // Survival defaults ON. A founder whose survive gene sits near zero has its
  // whole embryo culled in cleave mode, which is not an interesting way to fail;
  // apoptosis should be something regulation REACHES for, not the default state
  // of matter. Mutation is free to carve from here.
  surviveBias: 1.2,
  fuseBias: 1.0,
  fuseDecay: 0.0,
  surviveDecay: 0.0,
  surviveDiff: -0.5,
  // CONTRACTILITY MUST EXIST BEFORE IT CAN BE SELECTED ON.
  //
  // Measured on 64 living genomes: 49 of 64 bodies had ZERO contractility,
  // mean 0.061 per cell against 0.141 for grip. The generic bias offset leaves
  // every unseeded output mostly off, so founders were born with almost no
  // muscle — and evolution cannot select for a capacity that is not in the
  // population. Grip drifted up because it pays; contract had nothing to drift
  // FROM.
  //
  // This is the variation, not the outcome. Whether muscle survives is still
  // entirely up to the economy, and the honest expectation is that it decays
  // again unless moving pays.
  contractBias: 0.6,
  contractDecay: 0.0,
  contractDiff: -0.4,
  // A PROTO-CENTRAL-PATTERN-GENERATOR, on the same argument as contractBias.
  //
  // SYN_BASIS carries an antisymmetric 'axial' term, (b.ap - a.ap), which
  // exists so a genome can excite down the body and inhibit back up it — the
  // asymmetry a travelling wave needs, and the note in devo.js says so
  // explicitly. It has never been seeded, so founders draw it near zero along
  // with everything else, and a CPG has to be invented from nothing.
  //
  // Measured motivation: the same bodies move 69x further under an imposed
  // travelling wave (p50 1.249) than under their own brains (p50 0.018). The
  // body plan and the physics can locomote; nothing is driving them.
  //
  // This is variation, not outcome — mutation is free to weight it to zero,
  // and whether a gait survives is still the economy's decision.
  axialSyn: 2.5,
  // BEING EDIBLE IS THE DEFAULT; BEING INEDIBLE IS THE INVESTMENT.
  //
  // Measured before this: nutrition was exactly 0.000 across every living
  // genome — mean, sd and p90 all zero — because an unseeded output gene sits at
  // concentration ~0, maps to -1, and clamps to nothing. Consumption was
  // therefore a no-op: take = max(0, effort - toughness) * nutrition is always
  // zero when nothing is worth eating. The same failure as contractility, which
  // took 49 of 64 bodies having no muscle to notice.
  //
  // The default is also backwards if left at zero. Living tissue IS energy-rich;
  // an animal is made of the same stuff it eats. So nutrition starts HIGH and
  // toughness starts at nothing, which puts the population in the state that has
  // something to escalate FROM: everything edible, nothing armoured.
  toughnessBias: -0.8,
  toughnessDecay: 0.0,
};

export function randomGenome(rnd = Math.random, opts = {}) {
  const o = { ...SEED_DEFAULTS, ...opts };
  const g = new Float32Array(GENOME_SIZE);
  for (let i = 0; i < NGENE; i++) {
    const b = i * GENE_STRIDE;
    for (let k = 0; k < K; k++) {
      // Most edges silenced at birth; a sparse network is the starting point,
      // and structural mutation adds edges where they earn their keep.
      g[b + OFF_SRC + k] = rnd() < o.edgeProb ? Math.floor(rnd() * NGENE) : -1;
      g[b + OFF_W + k] = (rnd() * 2 - 1) * o.weightScale;
    }
    g[b + OFF_BIAS] = (rnd() * 2 - 1) * o.biasSpread + o.biasOffset;
    g[b + OFF_DECAY] = (rnd() * 2 - 1) * o.decaySpread;
    g[b + OFF_DIFF] = (rnd() * 2 - 1) * o.diffSpread;
  }
  // Growth: reachable from the start, shape unspecified.
  //
  // SELF-LIMITING BY CONSTRUCTION. The first version seeded a positive bias and
  // zero decay, so production ran forever and every embryo grew until it hit the
  // cell cap — 200 of 200, filling the egg, elongation p50 0.90. Growth must be a
  // TRANSIENT the network has to keep paying for: with decay the steady state is
  // sigmoid(net)/decay, division halves it below threshold, and a tip must
  // actively re-produce to grow again. That turns "grow" from a switch into a
  // rate, which is what lets one end of a body keep growing while another stops.
  // FUSE defaults ON, for the same reason survival does: a body whose fuse gene
  // sits at zero hands over the raw grain of cells it developed, which is the
  // one outcome we already know is uninteresting. Mutation is free to carve
  // articulation back in, and that is where joints come from.
  const fb = (OUT_BASE + 16) * GENE_STRIDE;
  g[fb + OFF_BIAS] = o.fuseBias;
  g[fb + OFF_DECAY] = o.fuseDecay;

  const gb = G_GROW * GENE_STRIDE;
  g[gb + OFF_BIAS] = o.growBias;
  g[gb + OFF_SRC + 0] = G_CROWD; g[gb + OFF_W + 0] = o.growCrowd;  // grow at a TIP
  g[gb + OFF_SRC + 1] = G_GROW;  g[gb + OFF_W + 1] = o.growSelf;   // self-sustaining
  g[gb + OFF_SRC + 2] = G_AP;    g[gb + OFF_W + 2] = o.growAp;
  g[gb + OFF_DECAY] = o.growDecay;
  g[gb + OFF_DIFF] = o.growDiff;                                   // stays local

  const sb = G_SURVIVE * GENE_STRIDE;
  g[sb + OFF_BIAS] = o.surviveBias;
  g[sb + OFF_DECAY] = o.surviveDecay;
  g[sb + OFF_DIFF] = o.surviveDiff;

  const cb = (OUT_BASE + 2) * GENE_STRIDE;      // contract
  g[cb + OFF_BIAS] = o.contractBias;
  g[cb + OFF_DECAY] = o.contractDecay;
  g[cb + OFF_DIFF] = o.contractDiff;

  const tb = (OUT_BASE + 12) * GENE_STRIDE;    // toughness
  g[tb + OFF_BIAS] = o.toughnessBias;
  g[tb + OFF_DECAY] = o.toughnessDecay;

  // SYNAPSE COEFFICIENTS. Not optional and not zero-able: `synapse()` returns
  // SYN_RANGE * tanh(sum), so an all-zero block gives every edge weight exactly
  // zero and the whole population is born brain-dead. This repo has a commit
  // named "the brains were dead"; same magnitude as devo.js so the two encodings
  // start their connectomes on equal terms.
  for (let k = 0; k < NSYN; k++) g[SYN_OFF + k] = (rnd() * 2 - 1) * 0.9;
  // SYN_BASIS index 8 is 'axial'. Sign is random per founder: a wave has to
  // travel one way or the other and neither is privileged.
  g[SYN_OFF + 8] = (rnd() < 0.5 ? -1 : 1) * o.axialSyn;
  return g;
}

/**
 * Mutation: weights and rates drift, and EDGES MOVE.
 *
 * Structural mutation is not decoration. A regulatory network's interesting
 * property is its topology — which gene regulates which — and a mutation
 * operator that only perturbs weights explores a fixed graph forever.
 */
export function mutate(genome, rnd = Math.random, { rate = 0.12, size = 0.3, structural = 0.02 } = {}) {
  const g = Float32Array.from(genome);
  for (let i = 0; i < NGENE; i++) {
    const b = i * GENE_STRIDE;
    for (let k = 0; k < K; k++) {
      if (rnd() < structural) {
        // rewire, silence, or wake an edge
        g[b + OFF_SRC + k] = rnd() < 0.3 ? -1 : Math.floor(rnd() * NGENE);
        if (g[b + OFF_SRC + k] >= 0 && rnd() < 0.5) g[b + OFF_W + k] = (rnd() * 2 - 1) * 2.5;
      }
      if (rnd() < rate) g[b + OFF_W + k] += (rnd() * 2 - 1) * size * 2.5;
    }
    if (rnd() < rate) g[b + OFF_BIAS] += (rnd() * 2 - 1) * size * 2;
    if (rnd() < rate) g[b + OFF_DECAY] = clamp(g[b + OFF_DECAY] + (rnd() * 2 - 1) * size, -1.2, 1.2);
    if (rnd() < rate) g[b + OFF_DIFF] = clamp(g[b + OFF_DIFF] + (rnd() * 2 - 1) * size, -1, 2);
  }
  // The connectome mutates too, or the brain is frozen at whatever the founder
  // happened to draw while the body evolves around it.
  for (let k = 0; k < NSYN; k++) {
    if (rnd() < rate) g[SYN_OFF + k] = clamp(g[SYN_OFF + k] + (rnd() * 2 - 1) * size, -6, 6);
  }
  return g;
}
