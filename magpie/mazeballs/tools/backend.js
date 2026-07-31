/**
 * Picks a TensorFlow.js backend for headless runs, on either Node or Deno.
 *
 * Order of preference, each skipped if unavailable:
 *
 *   webgpu     Deno exposes navigator.gpu natively (run with --unstable-webgpu),
 *              so the GPU path here is the *same backend the browser page uses*.
 *              Nothing to compile and no CUDA toolchain.
 *   node-gpu   @tensorflow/tfjs-node-gpu — CUDA. Node only, needs NVIDIA + cuDNN.
 *   node       @tensorflow/tfjs-node — native CPU. Node only.
 *   wasm       @tensorflow/tfjs-backend-wasm — portable, runs everywhere
 *              including Deno and the browser.
 *   cpu        pure JS. Always works, slowest.
 *
 * Force one with --backend webgpu|gpu|node|wasm|cpu.
 *
 * Measured with tools/bench.js on the real simulation step (not a synthetic
 * matmul), POP=192, one shared contended box, same window:
 *
 *   deno / wasm    16.0 ms/step    23.2 s per generation
 *   node / wasm    21.2 ms/step    30.8 s
 *   node / native  34.3 ms/step    49.7 s
 *   deno / cpu     57.9 ms/step    83.9 s
 *   node / cpu    100.6 ms/step   145.9 s
 *
 * WASM beats the native binding on both runtimes, and Deno beats Node on both
 * backends — so wasm is ordered ahead of the native CPU package. A raw
 * [192,12,12] matmul micro-benchmark had ranked native fastest and wasm 4x
 * slower; that ranking was wrong about the actual workload, because a step is
 * dozens of small ops where per-call overhead dominates rather than one big
 * matmul. Re-measure with bench.js before trusting this ordering on other
 * hardware or other population sizes.
 */
import { useTf } from '../lib/evodevo.js';

const isDeno = typeof globalThis.Deno !== 'undefined';
const env = (k, v) => {
  try {
    if (isDeno) { if (!Deno.env.get(k)) Deno.env.set(k, v); return; }
    if (typeof process !== 'undefined' && process.env && !process.env[k]) process.env[k] = v;
  } catch { /* env access may be denied under Deno permissions; not fatal */ }
};

const CANDIDATES = {
  webgpu: async () => {
    if (!globalThis.navigator || !navigator.gpu) throw new Error('navigator.gpu missing (Deno needs --unstable-webgpu)');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('no WebGPU adapter (no GPU on this host)');
    const tf = await load('@tensorflow/tfjs');
    await load('@tensorflow/tfjs-backend-webgpu');
    if (!(await tf.setBackend('webgpu'))) throw new Error('tfjs refused the webgpu backend');
    await tf.ready();
    return tf;
  },
  gpu: async () => pickNative('@tensorflow/tfjs-node-gpu'),
  node: async () => pickNative('@tensorflow/tfjs-node'),
  wasm: async () => {
    const tf = await load('@tensorflow/tfjs');
    await load('@tensorflow/tfjs-backend-wasm');
    if (!(await tf.setBackend('wasm'))) throw new Error('tfjs refused the wasm backend');
    await tf.ready();
    return tf;
  },
  cpu: async () => {
    const tf = await load('@tensorflow/tfjs');
    await tf.setBackend('cpu');
    await tf.ready();
    return tf;
  },
};

// Deno resolves bare specifiers only via an import map; npm: always works.
const load = async (name) => {
  const mod = isDeno ? await import(`npm:${name}@4.22.0`) : await import(name);
  return mod.default && mod.default.tensor ? mod.default : mod;
};
const pickNative = async (name) => {
  if (isDeno) throw new Error('native bindings are Node-only; use webgpu or wasm on Deno');
  const tf = await load(name);
  await tf.ready();
  return tf;
};

export async function initBackend({ prefer = 'auto', quiet = true } = {}) {
  if (quiet) env('TF_CPP_MIN_LOG_LEVEL', '2');
  // These runs are parallelised across processes, not within one. The tensors
  // are small, so intra-op threading buys almost nothing, and left at its
  // default each process spawns a full thread pool — a fleet of research agents
  // then oversubscribes the box by an order of magnitude. One thread per process
  // makes the worker arithmetic in score.js and sweep.js mean what it says.
  env('TF_NUM_INTRAOP_THREADS', '1');
  env('TF_NUM_INTEROP_THREADS', '1');
  env('OMP_NUM_THREADS', '1');

  const order = prefer !== 'auto' ? [prefer]
    : isDeno ? ['webgpu', 'wasm', 'cpu']
             : ['webgpu', 'gpu', 'wasm', 'node', 'cpu'];
  const tried = [];
  for (const name of order) {
    const fn = CANDIDATES[name];
    if (!fn) { tried.push(`${name}: unknown backend`); continue; }
    try {
      const tf = await fn();
      useTf(tf);
      return { tf, pkg: name, backend: tf.getBackend(), runtime: isDeno ? 'deno' : 'node' };
    } catch (err) {
      tried.push(`${name}: ${String(err && err.message || err).split('\n')[0]}`);
    }
  }
  throw new Error(
    'No TensorFlow.js backend available.\n' +
    (isDeno
      ? '  deno run -A --unstable-webgpu tools/run.js   # webgpu, then wasm\n'
      : '  npm install @tensorflow/tfjs               # pure JS, works everywhere\n' +
        '  npm install @tensorflow/tfjs-backend-wasm  # portable\n' +
        '  npm install @tensorflow/tfjs-node          # native CPU\n' +
        '  npm install @tensorflow/tfjs-node-gpu      # CUDA\n') +
    'Tried:\n  ' + tried.join('\n  '));
}

/** Minimal `--key value` / `--flag` parser with typed defaults. */
export function parseArgs(argv, defaults) {
  const out = { ...defaults };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    const key = (eq === -1 ? a.slice(2) : a.slice(2, eq));
    let val = eq === -1 ? undefined : a.slice(eq + 1);
    if (val === undefined) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { val = next; i++; }
    }
    if (!(key in out)) { out[key] = val === undefined ? true : val; continue; }
    const cur = out[key];
    if (typeof cur === 'boolean') out[key] = val === undefined ? true : !/^(false|0|no)$/i.test(val);
    else if (typeof cur === 'number') {
      const n = Number(val);
      if (!Number.isFinite(n)) throw new Error(`--${key} expects a number, got "${val}"`);
      out[key] = n;
    } else out[key] = val;
  }
  return out;
}

/** Runtime-agnostic argv (Node keeps argv[0..1], Deno does not). */
export const argv = () => isDeno ? Deno.args : process.argv.slice(2);
