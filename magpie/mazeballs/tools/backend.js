/**
 * Picks a TensorFlow.js backend for headless runs.
 *
 * Prefers the native `@tensorflow/tfjs-node` when it is installed, falls back to
 * the pure-JS `@tensorflow/tfjs` CPU backend. Neither is a hard dependency, so
 * the browser page can import the library without dragging in a Node package.
 */
import { useTf } from '../lib/evodevo.js';

export async function initBackend({ prefer = 'auto', quiet = true } = {}) {
  if (quiet) process.env.TF_CPP_MIN_LOG_LEVEL ??= '2';
  const tried = [];
  const order = prefer === 'cpu' ? ['@tensorflow/tfjs']
              : prefer === 'node' ? ['@tensorflow/tfjs-node']
              : ['@tensorflow/tfjs-node', '@tensorflow/tfjs'];
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
    '  npm install @tensorflow/tfjs          # pure JS, works everywhere\n' +
    '  npm install @tensorflow/tfjs-node     # native, faster\n' +
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
