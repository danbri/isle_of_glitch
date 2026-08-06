/**
 * ENCOUNTER RATE — is the biotic channel even open?
 *
 * "Organisms are each other's dominant selective pressure" cannot be true if
 * organisms almost never meet. Every biotic mechanism in this world —
 * consumption, contest, armour, digestive matching — fires on CONTACT and only
 * on contact. If a cell spends its life with no foreign cell within reach, then
 * toughness is a pure cost, an enzyme has nothing to match against, and the
 * whole biotic economy is a set of coefficients on an event that does not
 * happen. No amount of extra runtime fixes that; it is structural.
 *
 * So this measures the event, not the coefficients:
 *
 *   reach      fraction of live cells with at least one FOREIGN cell within
 *              contact range — the probability that the biotic channel is open
 *              for you at all, right now
 *   contacts   mean number of foreign cells in range, given any
 *   selfNbrs    mean number of OWN-body cells in range, for scale: if a cell is
 *              surrounded by twenty of its own siblings and no strangers, the
 *              world is crowded and still biotically empty
 *   clumping   what fraction of neighbours are foreign — 0 means bodies are
 *              islands, 0.5 means the population is genuinely mixed
 *
 * Reads a live frame from the running server, so it costs the simulation
 * nothing and describes the world actually on screen rather than a fresh one
 * that has not settled.
 *
 *   deno run -A tools/encounter.js [--port 8899] [--samples 3]
 */
const args = Object.fromEntries(
  Deno.args.map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] ?? 'true'] : null)
    .filter(Boolean));
const PORT = Number(args.port ?? 8899);
const SAMPLES = Number(args.samples ?? 3);

const HEAD = 48;

async function readFrame() {
  const buf = await (await fetch(`http://127.0.0.1:${PORT}/frame`, { cache: 'no-store' }))
    .arrayBuffer();
  const dv = new DataView(buf);
  const steps = dv.getUint32(8, true);
  const bound = dv.getFloat32(12, true);
  let at = HEAD;
  const L = dv.getUint32(at, true); at += 4;
  at += L * 4;                                   // idx
  const pos = new Float32Array(buf.slice(at, at + L * 8)); at += L * 8;
  at += L * 4;                                   // act
  const type = new Int32Array(buf.slice(at, at + L * 4)); at += L * 4;
  at += L * 4;                                   // energy
  const uid = new Int32Array(buf.slice(at, at + L * 4)); at += L * 4;
  return { L, pos, type, uid, bound, steps };
}

/**
 * Two radii to report, because the biotic channel no longer requires collision.
 *
 * TOUCH is the sum of two cell radii — physically pressed together.
 * REACH is contestR, how far consumption and contest actually act now that the
 * channel is proximity rather than contact. The gap between the two numbers is
 * exactly what widening the radius bought, which is worth seeing rather than
 * assuming.
 */
const TOUCH = 0.34 * 2;
const REACH = Number(args.reach ?? 1.5);

function encounter(f, R) {
  const { L, pos, uid, bound } = f;
  // A hash with cell size R, so a 3x3 walk covers exactly the contact radius —
  // the same structure the kernel uses, for the same reason: anything else is
  // either wrong or quadratic.
  const cell = R;
  const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const grid = new Map();
  for (let i = 0; i < L; i++) {
    const k = key(pos[i * 2], pos[i * 2 + 1]);
    let a = grid.get(k); if (!a) { a = []; grid.set(k, a); }
    a.push(i);
  }
  let withForeign = 0, foreignTotal = 0, selfTotal = 0, counted = 0;
  const R2 = R * R;
  for (let i = 0; i < L; i++) {
    const x = pos[i * 2], y = pos[i * 2 + 1];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let fo = 0, se = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const a = grid.get(`${cx + dx},${cy + dy}`);
      if (!a) continue;
      for (const j of a) {
        if (j === i) continue;
        let ddx = pos[j * 2] - x, ddy = pos[j * 2 + 1] - y;
        if (ddx > bound) ddx -= 2 * bound; if (ddx < -bound) ddx += 2 * bound;
        if (ddy > bound) ddy -= 2 * bound; if (ddy < -bound) ddy += 2 * bound;
        if (ddx * ddx + ddy * ddy > R2) continue;
        if (uid[j] === uid[i]) se++; else fo++;
      }
    }
    counted++; foreignTotal += fo; selfTotal += se;
    if (fo > 0) withForeign++;
  }
  const nbrs = foreignTotal + selfTotal;
  return {
    live: L,
    reach: +(withForeign / Math.max(1, counted)).toFixed(4),
    contacts: +(foreignTotal / Math.max(1, counted)).toFixed(3),
    selfNbrs: +(selfTotal / Math.max(1, counted)).toFixed(3),
    clumping: +(foreignTotal / Math.max(1, nbrs)).toFixed(4),
  };
}

const rows = [];
for (let s = 0; s < SAMPLES; s++) {
  const f = await readFrame();
  const e = encounter(f, REACH);
  const t = encounter(f, TOUCH);
  e.touchReach = t.reach; e.touchContacts = t.contacts;
  rows.push(e);
  console.log(JSON.stringify({ step: f.steps, ...e }));
  if (s < SAMPLES - 1) await new Promise(r => setTimeout(r, 2500));
}

const mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
console.log('');
console.log(`reach     ${(100 * mean('reach')).toFixed(1)}%  of live cells have a stranger within contestR ${REACH}`);
console.log(`  (touch  ${(100 * mean('touchReach')).toFixed(1)}%  within ${TOUCH.toFixed(2)} — what it was before proximity)`);
console.log(`contacts  ${mean('contacts').toFixed(2)}  strangers in reach, on average (${mean('touchContacts').toFixed(2)} touching)`);
console.log(`selfNbrs  ${mean('selfNbrs').toFixed(2)}  own-body cells in range, for scale`);
console.log(`clumping  ${(100 * mean('clumping')).toFixed(1)}%  of a cell's neighbours are strangers`);
console.log('');
// The bar, stated before the number is read rather than after.
if (mean('reach') < 0.05) {
  console.log('VERDICT: the biotic channel is effectively CLOSED. Fewer than one cell in');
  console.log('twenty ever touches a stranger, so consumption, contest, armour and');
  console.log('digestive matching are coefficients on an event that does not happen.');
  console.log('Organisms cannot be the dominant selective pressure here, and running');
  console.log('longer will not change that — it is the geometry, not the economy.');
} else if (mean('reach') < 0.25) {
  console.log('VERDICT: the biotic channel is OPEN BUT THIN. Encounters happen and are');
  console.log('rare, so biotic selection is real and weak against a world that acts on');
  console.log('every cell every step.');
} else {
  console.log('VERDICT: the biotic channel is WIDE OPEN. Encounters are common enough');
  console.log('that biotic selection can plausibly dominate; whether it does is what');
  console.log('tools/who-selects.js measures.');
}
