/**
 * Development, off the main thread, streaming as it goes.
 *
 * develop() is one synchronous call that can take minutes for a large body, so
 * anything running it on the page froze the browser and then displayed a
 * finished corpse. The process is the interesting part of a developmental
 * encoding, and it was the part nobody could see.
 *
 * This runs it in a worker and posts a frame every `stepEvery` timesteps: the
 * live positions, and which cells were born since the last frame. The page stays
 * responsive throughout and can draw growth as it happens.
 *
 * WHAT IS SENT, AND WHY IT IS SHAPED THIS WAY. Positions go as a transferable
 * Float32Array rather than an array of objects — a 10,000-cell body is 80 KB as
 * floats and several megabytes as objects, and structured-cloning the latter
 * every frame would cost more than the development. `born` is the daughters, and
 * `mother` their mothers, so the page can draw the division that produced each
 * one rather than merely noticing a new dot.
 *
 * DEATH IS NOT STREAMED, because in this model it does not happen during
 * development. `survive` is applied ONCE at hatching — the embryo grows, and then
 * cells below the threshold are carved away in a single pass. Showing a trickle
 * of deaths during growth would be a prettier lie. The final message carries the
 * culled set so the carve can be drawn as the single event it is.
 */
import { develop } from './devo2.js';

self.onmessage = async (e) => {
  const { genome, opts } = e.data;
  const g = Float32Array.from(genome);
  let frame = 0;

  const post = (payload, transfer) => self.postMessage(payload, transfer);

  let result;
  try {
    result = develop(g, {
      ...opts,
      stepEvery: opts.stepEvery ?? 6,
      onStep: (s) => {
        // Copy: these are the working buffers and are about to be overwritten.
        const xy = new Float32Array(s.n * 2);
        for (let i = 0; i < s.n; i++) { xy[i * 2] = s.X[i]; xy[i * 2 + 1] = s.Y[i]; }
        const born = Int32Array.from(s.born);
        const mums = new Int32Array(born.length);
        for (let k = 0; k < born.length; k++) mums[k] = s.mother[born[k]];
        post({ kind: 'frame', frame: frame++, t: s.t, nStep: s.nStep, n: s.n,
               xy, born, mums }, [xy.buffer, born.buffer, mums.buffer]);
      },
    });
  } catch (err) {
    post({ kind: 'error', message: String(err && err.message || err) });
    return;
  }

  // The finished body, with the types the rest of the pipeline would read.
  const n = result.cells.length;
  const xy = new Float32Array(n * 2), type = new Int32Array(n), idx = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const c = result.cells[i];
    xy[i * 2] = c.x; xy[i * 2 + 1] = c.y;
    idx[i] = c.localIndex ?? i;
    // describe() is imported by the page, not here — send the raw capacities and
    // let one implementation of the labelling rule serve both.
    type[i] = 0;
  }
  // Stride 4, not 3: density joins the capacities because it is what the viewer
  // draws as value, and radius rides alongside because relaxation made it vary.
  const caps = new Float32Array(n * 4);
  const radius = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = result.cells[i];
    caps[i * 4] = c.sense; caps[i * 4 + 1] = c.contract;
    caps[i * 4 + 2] = c.grip; caps[i * 4 + 3] = c.density ?? 0.5;
    radius[i] = c.radius ?? 0.34;
  }
  post({ kind: 'done', n, xy, caps, idx, radius, merged: result.merged ?? 0,
         aborted: !!result.aborted },
       [xy.buffer, caps.buffer, idx.buffer, type.buffer, radius.buffer]);
};
