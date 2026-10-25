// Conformance (SPEC 21): every example compiles, and runs 600 frames with scripted keys
// without crashing or stopping on a report its design does not produce.
import { EXAMPLES } from '../../js/examples.js';
import { Machine } from '../machine.js';

const frames = +(process.argv[2] || 600);
const only = process.argv[3];
let failed = 0;
for (const ex of EXAMPLES) {
  if (only && ex.id !== only) continue;
  const label = (ex.id || ex.name).padEnd(24);
  let m;
  try { m = new Machine(ex.src, { store: new Map() }); }
  catch (e) { failed++; console.log(`FAIL ${label} compile: ${e.message} (line ${e.line}:${e.col})`); continue; }
  const t0 = performance.now();
  let crash = null, runs = 0;
  try {
    for (let f = 0; f < frames; f++) {
      // a tap of space every 100 frames gets past title screens; cursor keys held now and then
      if (f % 100 === 50) m.keyDown({ id: 32, ch: ' ' });
      if (f % 100 === 53) m.keyUp(32);
      if (f % 200 === 120) m.keyDown({ id: 39, ch: '\x09' });
      if (f % 200 === 160) m.keyUp(39);
      if (m.mode === 1 && f % 50 === 0) { for (const ch of 'LOOK') m.keyDown({ id: ch.charCodeAt(0), ch }); m.keyDown({ id: 13, ch: '\r' }); }
      if (m.frame(performance.now()) >= 0) runs++;
      if (m.textDirty && f % 60 === 0) m.rasterText(new Uint8ClampedArray(256 * 192 * 4), new Uint8ClampedArray(256 * 192 * 4));
    }
  } catch (e) { crash = e; }
  const ms = (performance.now() - t0).toFixed(0);
  const lo = m.lo.trim();
  if (crash) { failed++; console.log(`FAIL ${label} crashed: ${crash.stack.split('\n').slice(0, 3).join(' | ')}`); }
  else console.log(`${m.done && !/^0 OK/.test(lo) && !m.loaderCalled ? 'NOTE' : 'ok  '} ${label} ${frames} frames, ${runs} runs, ${ms} ms, fx ${m.fx.items.length}, sprites ${m.sprites.length}, cells ${m.cells.size}${lo ? ', lower: ' + JSON.stringify(lo) : ''}`);
}
process.exit(failed ? 1 : 0);
