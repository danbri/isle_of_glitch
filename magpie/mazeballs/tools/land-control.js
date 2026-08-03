#!/usr/bin/env node
/**
 * The water-vs-land solvability control — cheapest test of the WORLD.md
 * hypothesis at the reference-policy level, before evolution or soft-body
 * physics is committed to it.
 *
 *   node tools/land-control.js
 *
 * WORLD.md's claim: sensing never paid because coverage finds stationary food in
 * a small arena, so a reflex beats a sense. The intuition is water-vs-land — a
 * short sensory horizon forces reactive behaviour, a long one lets sensing (and
 * planning) pay. The subtlety this control exposes: it is not arena SIZE that
 * matters, it is the REACH of the signal. So this measures two things with
 * hand-written reference policies (point agents, not bodies — the question is
 * about the world, not any body):
 *
 *   1. Does a sensing (gradient-climbing) policy beat coverage only when the
 *      gradient REACHES across a useful fraction of the world?
 *   2. Does advection — a current stretching a diffusing smell into a long
 *      plume — supply that reach where bare diffusion cannot?
 *
 * The chemical is a real lib/fields.js field at steady state, so every gradient
 * is the honest one the world backbone produces.
 */
import { ScalarField, advect } from '../lib/fields.js';

function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296; }
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

const GRID = 96, STEPS = 700, SPEED = 1 / 260, SRC_R = 0.045, SENSE = 0.04;

// uniform wind, as a fields.js flow, for the plume condition
const wind = (w) => ({ vel: (x, y, o = {}) => { o.vx = w; o.vy = 0; return o; } });

// Build the chemical field to steady state. reach is set by diffuse/decay; if
// windSpeed>0 the field is also advected each build-step, forming a downwind plume.
function buildField(sx, sy, diffuse, decay, windSpeed) {
  const f = new ScalarField(GRID, GRID, { diffuse, decay });
  const fl = windSpeed ? wind(windSpeed) : null;
  for (let i = 0; i < 500; i++) { f.deposit(sx, sy, 1.0); f.step(); if (fl) advect(f, fl, 0.02); }
  return f;
}

// SENSING: finite-difference gradient ascent — sample ahead-left and ahead-right,
// steer to the stronger side. The reflex a sensing animal uses; the world decides
// if it wins. A minimum-signal floor keeps it from chasing numerical dust.
function stepSensing(a, field) {
  const lx = a.x + Math.cos(a.h - 0.6) * SENSE, ly = a.y + Math.sin(a.h - 0.6) * SENSE;
  const rx = a.x + Math.cos(a.h + 0.6) * SENSE, ry = a.y + Math.sin(a.h + 0.6) * SENSE;
  const c = field.sample(a.x, a.y);
  const L = field.sample(clamp01(lx), clamp01(ly)), R = field.sample(clamp01(rx), clamp01(ry));
  if (c + L + R < 1e-4) { a.h += (a.rand() - 0.5) * 0.9; return; }   // no signal here: search
  a.h += Math.max(-0.6, Math.min(0.6, (R - L) / (c + 1e-4) * 6));    // relative gradient, bounded turn
  a.h += (a.rand() - 0.5) * 0.15;
}
// COVERAGE: serpentine lawnmower sized to the arena — the best non-sensing policy.
function stepCoverage(a) {
  if (a.turn == null) {
    if (a.x > 0.96 && Math.cos(a.h) > 0) { a.turn = clamp01(a.y + 0.05); a.next = Math.PI; }
    else if (a.x < 0.04 && Math.cos(a.h) < 0) { a.turn = clamp01(a.y + 0.05); a.next = 0; }
  }
  if (a.turn != null) { a.h = Math.PI / 2; if (a.y >= a.turn) { a.turn = null; a.h = a.next; } }
}
function stepRandom(a) { a.h += (a.rand() - 0.5) * 0.6; }

function runAgent(policy, field, sx, sy, scale, seed) {
  const rand = rng(seed);
  const a = { x: rand(), y: rand(), h: rand() * 6.283, rand, turn: null, next: 0 };
  if (policy === 'coverage') { a.x = 0.02; a.y = 0.02; a.h = 0; }
  const sp = SPEED / scale;
  for (let t = 0; t < STEPS; t++) {
    if (policy === 'sensing') stepSensing(a, field);
    else if (policy === 'coverage') stepCoverage(a);
    else stepRandom(a);
    a.x = clamp01(a.x + Math.cos(a.h) * sp);
    a.y = clamp01(a.y + Math.sin(a.h) * sp);
    if (a.x <= 0 || a.x >= 1) a.h = Math.PI - a.h;
    if (a.y <= 0 || a.y >= 1) a.h = -a.h;
    if (Math.hypot(a.x - sx, a.y - sy) < SRC_R) return t;
  }
  return STEPS;
}
function successRate(policy, scale, diffuse, decay, windSpeed, trials) {
  let found = 0;
  for (let k = 0; k < trials; k++) {
    const r = rng(0x1000 + k * 2654435761);
    // With wind, place the source downwind-ish so agents must track upstream.
    const sx = windSpeed ? 0.55 + r() * 0.3 : 0.15 + r() * 0.7, sy = 0.15 + r() * 0.7;
    const field = buildField(sx, sy, diffuse, decay, windSpeed);
    if (runAgent(policy, field, sx, sy, scale, 0x9000 + k * 40503) < STEPS) found++;
  }
  return found / trials;
}
const reachOf = (d, k) => (Math.sqrt(d / k) / GRID).toFixed(3);
const TRIALS = 40;
const line = (label, s, c, r) => {
  const adv = s - c;
  console.log(`${label}   sensing ${s.toFixed(2)}  coverage ${c.toFixed(2)}  random ${r.toFixed(2)}   ` +
    `adv ${adv >= 0 ? '+' : ''}${adv.toFixed(2)}  ${adv > 0.15 ? 'SENSING WINS' : adv < -0.15 ? 'coverage wins' : 'tie'}`);
};

console.log('=== 1. Does sensing win when the gradient REACHES? (fixed world scale 3) ===');
for (const [d, k] of [[0.16, 0.02], [0.20, 0.004], [0.24, 0.0008], [0.24, 0.00015]]) {
  const s = successRate('sensing', 3, d, k, 0, TRIALS), c = successRate('coverage', 3, d, k, 0, TRIALS), r = successRate('random', 3, d, k, 0, TRIALS);
  line(`reach ${reachOf(d, k)}`, s, c, r);
}
console.log('\n=== 2. Water->land: long-reach gradient, sweep world scale ===');
for (const scale of [0.5, 1, 2, 4, 8]) {
  const s = successRate('sensing', scale, 0.24, 0.00015, 0, TRIALS), c = successRate('coverage', scale, 0.24, 0.00015, 0, TRIALS), r = successRate('random', scale, 0.24, 0.00015, 0, TRIALS);
  line(`scale ${String(scale).padStart(3)}`, s, c, r);
}
console.log('\n=== 3. Does advection (a plume) supply reach where diffusion cannot? scale 4, short diffusion + wind ===');
for (const w of [0, 0.15, 0.4]) {
  const s = successRate('sensing', 4, 0.16, 0.02, w, TRIALS), c = successRate('coverage', 4, 0.16, 0.02, w, TRIALS), r = successRate('random', 4, 0.16, 0.02, w, TRIALS);
  line(`wind ${w.toFixed(2)}`, s, c, r);
}
