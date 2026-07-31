#!/usr/bin/env node
/**
 * Times the actual simulation step on whichever backend is selected.
 *
 *   node tools/run.js …            node tools/bench.js --backend node
 *   deno task bench --backend wasm
 *
 * Why this exists: a raw [192,12,12] matmul micro-benchmark ranked native CPU
 * fastest and WASM 4x slower, and that ranking did not survive contact with the
 * real workload — a simulation step is dozens of small ops where per-call
 * overhead dominates, not one big matmul. Benchmark the thing you actually run.
 */
import { initBackend, parseArgs, argv } from './backend.js';
import { EvoDevoSim } from '../lib/evodevo.js';

const args = parseArgs(argv(), { steps: 200, warmup: 30, backend: 'auto', seed: 1, pop: 192 });

const { pkg, backend, runtime } = await initBackend({ prefer: args.backend });
const sim = new EvoDevoSim({ seed: args.seed, config: { POP: args.pop } });
await sim.initialise();

for (let i = 0; i < args.warmup; i++) sim.step();
await sim.fitness.data();                      // drain the queue before timing

const t0 = Date.now();
for (let i = 0; i < args.steps; i++) sim.step();
await sim.fitness.data();
const ms = (Date.now() - t0) / args.steps;

// A generation is EPOCH_STEPS of the same work, which is the unit that matters
// when planning a sweep.
const perGen = ms * sim.cfg.EPOCH_STEPS / 1000;
console.log(JSON.stringify({
  runtime, pkg, backend, pop: args.pop, steps: args.steps,
  msPerStep: +ms.toFixed(3),
  secPerGeneration: +perGen.toFixed(1),
}));
sim.dispose();
