/**
 * Picks a TensorFlow.js backend for headless runs.
 *
 * Order of preference: CUDA (`tfjs-node-gpu`), then native CPU (`tfjs-node`),
 * then pure JS (`tfjs`). None is a hard dependency — each is tried in turn and
 * skipped if absent or unloadable — so the browser page can import the library
 * without dragging in a Node package, and a machine without CUDA simply falls
 * through to the next option.
 *
 *   --backend gpu     force @tensorflow/tfjs-node-gpu   (needs NVIDIA + CUDA/cuDNN)
 *   --backend node    force @tensorflow/tfjs-node       (native CPU)
 *   --backend cpu     force @tensorflow/tfjs            (pure JS, works anywhere)
 */
import { useTf } from '../lib/evodevo.js';

export async function initBackend({ prefer = 'auto', quiet = true } = {}) {
  if (quiet) process.env.TF_CPP_MIN_LOG_LEVEL ??= '2';
  // These runs are parallelised across processes, not within one. The tensors
  // here are small ([192,12,12]) so intra-op threading buys almost nothing, and
  // left at its default each process spawns a full thread pool — a sweep or a
  // fleet of research agents then oversubscribes the box by an order of
  // magnitude and every run slows down. One thread per process makes the
  // worker-count arithmetic in score.js and sweep.js mean what it says.
  // Set before the backend is imported: TensorFlow reads these at load.
  process.env.TF_NUM_INTRAOP_THREADS ??= '1';
  process.env.TF_NUM_INTEROP_THREADS ??= '1';
  process.env.OMP_NUM_THREADS ??= '1';
  const tried = [];
  const order = prefer === 'cpu' ? ['@tensorflow/tfjs']
              : prefer === 'node' ? ['@tensorflow/tfjs-node']
              : prefer === 'gpu' ? ['@tensorflow/tfjs-node-gpu']
              : ['@tensorflow/tfjs-node-gpu', '@tensorflow/tfjs-node', '@tensorflow/tfjs'];
  for (const name of order) {
    try {
      const mod = await import(name);
      const tf = mod.default && mod.default.tensor ? mod.default : mod;
      await tf.ready();
      useTf(tf);
      return { tf, pkg: name, backend: tf.getBackend() };
    } catch (err) {
      tried.push(`${name}: ${String(err && err.message || err).split('\n')[0]}`);
    }
  }
  throw new Error(
    'No TensorFlow.js backend available. Install one:\n' +
    '  npm install @tensorflow/tfjs           # pure JS, works everywhere\n' +
    '  npm install @tensorflow/tfjs-node      # native CPU, ~3.6x faster\n' +
    '  npm install @tensorflow/tfjs-node-gpu  # CUDA, needs NVIDIA + cuDNN\n' +
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
