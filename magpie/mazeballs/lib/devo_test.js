/**
 * Development tests. Run: deno test lib/devo_test.js
 *
 * The claim under test is not "bodies come out pretty". It is that the
 * structures we care about — bilateral symmetry, repeated segments, stiff
 * skeleton against compliant tissue — are REACHABLE from this encoding without
 * being imposed by it. Both must hold: a genome that specifies an asymmetric
 * body must be able to, or symmetry is a constant rather than an outcome.
 *
 * That distinction is the one this codebase has repeatedly got wrong, most
 * recently by paying bodies to grow and then reporting the growth as evolution.
 */
import { assert, assertEquals, assertAlmostEquals } from 'jsr:@std/assert@1';
import {
  PROPS, BASIS, NB, GENOME_SIZE, randomGenome, express,
  develop, bond, mutate, morphology,
} from './devo.js';

/** A genome with every weight zero except the named (property, basis) pairs. */
function genome(spec) {
  const g = new Float32Array(GENOME_SIZE);
  for (const [prop, basis, w] of spec) {
    const p = PROPS.indexOf(prop), b = BASIS.findIndex(([n]) => n === basis);
    assert(p >= 0, `no property ${prop}`);
    assert(b >= 0, `no basis ${basis}`);
    g[p * NB + b] = w;
  }
  return g;
}

Deno.test('development is a pure function of the genome', () => {
  const g = randomGenome(mulberry(1));
  const a = develop(g), b = develop(g);
  assertEquals(a.cells.length, b.cells.length);
  for (let i = 0; i < a.cells.length; i++) {
    assertAlmostEquals(a.cells[i].x, b.cells[i].x, 1e-12);
    assertAlmostEquals(a.cells[i].contract, b.cells[i].contract, 1e-12);
  }
});

Deno.test('a genome that cannot tell left from right builds a symmetric body', () => {
  // Only |dv| and ap terms: the expression is even in dv, so the body must be
  // mirror-symmetric. This is symmetry as a CONSEQUENCE of the encoding the
  // genome chose, not a symmetry operator applied to it.
  const g = genome([
    ['presence', 'bias', 1.0],
    ['contract', '|dv|', 2.0],
    ['contract', 'ap', 1.2],
    ['grip', '|dv|', -1.5],
    ['stiff', 'ap^2', 1.0],
  ]);
  const { cells } = develop(g);
  assert(cells.length > 20, `only ${cells.length} cells`);
  const m = morphology(cells);
  assert(m.symmetry > 0.95, `expected near-perfect symmetry, got ${m.symmetry.toFixed(3)}`);
});

Deno.test('a genome that CAN tell left from right builds an asymmetric body', () => {
  // The control. If this also came out symmetric, the previous test would be
  // measuring the lattice rather than the genome, and symmetry would be
  // something the machinery imposes rather than something evolution finds.
  const g = genome([
    ['presence', 'bias', 0.9],
    ['presence', 'dv', 1.6],        // signed: keeps one side, drops the other
    ['contract', 'dv', 2.0],
  ]);
  const { cells } = develop(g);
  assert(cells.length > 10, `only ${cells.length} cells`);
  const m = morphology(cells);
  assert(m.symmetry < 0.5, `expected asymmetry, got ${m.symmetry.toFixed(3)}`);
});

Deno.test('a periodic term produces repeated segments along the axis', () => {
  const plain = develop(genome([
    ['presence', 'bias', 1.0],
    ['contract', 'ap', 1.5],
  ]));
  const segmented = develop(genome([
    ['presence', 'bias', 1.0],
    ['contract', 'sin3ap', 2.5],
  ]));
  const a = morphology(plain.cells), b = morphology(segmented.cells);
  assert(b.segments > a.segments,
    `periodic genome should be more segmented: ${b.segments} vs ${a.segments}`);
  assert(b.segments >= 3, `expected repeated modules, got ${b.segments}`);
});

Deno.test('presence shapes the outline, so morphology is evolvable', () => {
  const blob = develop(genome([['presence', 'bias', 1.2]]));
  // Narrow in dv, long in ap: a worm rather than a disc.
  const worm = develop(genome([
    ['presence', 'bias', 1.2],
    ['presence', '|dv|', -3.0],
  ]));
  const mb = morphology(blob.cells), mw = morphology(worm.cells);
  assert(mw.elongation > mb.elongation * 1.5,
    `worm genome should elongate: ${mw.elongation.toFixed(2)} vs ${mb.elongation.toFixed(2)}`);
  assert(worm.cells.length < blob.cells.length, 'a narrower body should have fewer cells');
});

Deno.test('bonds take their material from the cells they join', () => {
  // Stiffness varying along the axis gives stiff struts and compliant joints
  // out of one continuum, which is what "bone" and "sinew" mean here.
  const g = genome([
    ['presence', 'bias', 1.2],
    ['stiff', 'sin3ap', 2.5],
  ]);
  const { cells } = develop(g);
  const bonds = bond(cells);
  assert(bonds.length > cells.length, `too few bonds: ${bonds.length} for ${cells.length} cells`);
  const m = morphology(cells, bonds);
  assert(m.stiffSpan > 8, `expected a wide stiffness range, got ${m.stiffSpan.toFixed(1)}x`);
  // Stiff matter must be brittle matter, or rigidity is free.
  const stiffest = bonds.reduce((a, b) => b.stiff > a.stiff ? b : a);
  const softest = bonds.reduce((a, b) => b.stiff < a.stiff ? b : a);
  assert(stiffest.brittle > softest.brittle, 'stiffer bonds should be more brittle');
});

Deno.test('bonds are symmetric in their endpoints', () => {
  // Newton's third law depends on this: the asymmetric version of exactly this
  // calculation in the muscle code injected energy every step and drove bodies
  // to NaN. Both endpoints must derive the same number.
  const { cells } = develop(randomGenome(mulberry(4)));
  const bonds = bond(cells);
  for (const b of bonds) {
    const s = (cells[b.i].stiff + cells[b.j].stiff) * 0.5;
    assertAlmostEquals(b.stiff, Math.pow(4, s), 1e-9);
  }
});

Deno.test('development can fail when the yolk runs out', () => {
  // eggs.md: reproduction must be a process in time that CAN fail. A body that
  // is always built is a point-event wearing a costume.
  const g = genome([['presence', 'bias', 1.5]]);
  const full = develop(g, { yolk: Infinity });
  const starved = develop(g, { yolk: 4.0, cellCost: 0.6 });
  assert(starved.aborted, 'development with too little yolk should abort');
  assert(starved.cells.length < full.cells.length,
    `starved body should be smaller: ${starved.cells.length} vs ${full.cells.length}`);
  assert(starved.spent <= 4.0, `spent ${starved.spent} more than the yolk held`);
});

Deno.test('development is scale-free in the egg', () => {
  // The same genome makes the same SHAPE in a bigger egg, because the gradients
  // are normalised. Egg size is therefore a maternal investment decision, not a
  // different animal.
  const g = genome([
    ['presence', 'bias', 1.0],
    ['presence', '|dv|', -1.4],
    ['contract', 'ap', 1.5],
  ]);
  const small = morphology(develop(g, { extent: 2.4 }).cells);
  const big = morphology(develop(g, { extent: 4.8 }).cells);
  assert(big.n > small.n, 'a bigger egg should hold more cells');
  assertAlmostEquals(big.elongation, small.elongation, 0.35);
});

Deno.test('mutation moves the phenotype without destroying it', () => {
  const rnd = mulberry(9);
  let g = randomGenome(rnd);
  const base = develop(g).cells.length;
  assert(base > 10, 'seed genome should build a body');
  let survived = 0, changed = 0;
  for (let k = 0; k < 60; k++) {
    const m = mutate(g, rnd);
    const n = develop(m).cells.length;
    if (n > 0) survived++;
    if (n !== base) changed++;
  }
  // Most mutants must be viable, or the encoding is too brittle to evolve...
  assert(survived > 45, `only ${survived}/60 mutants built a body`);
  // ...and some must differ, or it is too rigid to explore.
  assert(changed > 5, `only ${changed}/60 mutants differed from the parent`);
});

Deno.test('nothing here exposes a size knob', () => {
  // METHODS.md: body size, module count and symmetry order are outcomes the
  // loop reads, never inputs it sets. The previous code exposed maxCells and
  // then ran a sweep of it as an experiment; this asserts the door is shut.
  const g = randomGenome(mulberry(3));
  const out = develop(g);
  const m = morphology(out.cells, bond(out.cells));
  for (const k of ['n', 'symmetry', 'segments', 'elongation', 'stiffSpan']) {
    assert(k in m, `morphology should report ${k} as an outcome`);
  }
  // develop() takes egg geometry and yolk — maternal investment — but no count
  // of cells, segments, or limbs anywhere.
  const src = develop.toString();
  for (const banned of ['nCells', 'cellCount', 'nSegments', 'symmetryOrder']) {
    assert(!src.includes(banned), `develop() accepts a size knob: ${banned}`);
  }
});

/** Deterministic PRNG so these tests do not depend on the platform's. */
function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
