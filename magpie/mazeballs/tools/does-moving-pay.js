/**
 * DOES MOVING PAY?
 *
 * Sensing was measured to be a net loss, then fixed to break-even. But sensing
 * can only ever pay THROUGH movement: knowing where the food is buys nothing if
 * going there is not worth the trip. So this is the prior link in the same
 * chain, and if it fails, the sensor result is explained and no amount of
 * sensory tuning will change it.
 *
 * The measurement tracks bodies by UID across a window — never by arena slot,
 * because slots are recycled and a recycled slot reads as a body teleporting.
 * That mistake has already cost this project one retracted locomotion result.
 *
 *   displacement   how far the body's centre moved, minimum-image on the torus
 *   dEnergy        change in its mean energy per cell over the same window
 *
 * and then the correlation between them, plus the top-vs-bottom quartile
 * comparison, which is the form the earlier crowding work used and is more
 * robust to the long tail of bodies that barely move at all.
 *
 * THE CONTROL THAT MATTERS. Displacement includes being CARRIED — the current
 * is a transport system and most of what drifts is not swimming. So the common
 * drift is estimated as the population median displacement vector and
 * subtracted, leaving motion relative to the medium. Without that subtraction
 * this measures the weather.
 *
 *   deno run -A tools/does-moving-pay.js [--window 25]
 */
const args = Object.fromEntries(
  Deno.args.map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] ?? 'true'] : null)
    .filter(Boolean));
const PORT = Number(args.port ?? 8899);
const WINDOW = Number(args.window ?? 25) * 1000;
const HEAD = 48;

async function snapshot() {
  const buf = await (await fetch(`http://127.0.0.1:${PORT}/frame`, { cache: 'no-store' }))
    .arrayBuffer();
  const dv = new DataView(buf);
  const steps = dv.getUint32(8, true);
  const bound = dv.getFloat32(12, true);
  let at = HEAD;
  const L = dv.getUint32(at, true); at += 4;
  at += L * 4;
  const pos = new Float32Array(buf.slice(at, at + L * 8)); at += L * 8;
  at += L * 4;
  const type = new Int32Array(buf.slice(at, at + L * 4)); at += L * 4;
  const energy = new Float32Array(buf.slice(at, at + L * 4)); at += L * 4;
  const uid = new Int32Array(buf.slice(at, at + L * 4));

  const b = new Map();
  for (let i = 0; i < L; i++) {
    const t = type[i];
    if (t < 0 || t > 3) continue;
    let o = b.get(uid[i]);
    if (!o) { o = { x: 0, y: 0, e: 0, n: 0, sensor: 0, muscle: 0 }; b.set(uid[i], o); }
    o.x += pos[i * 2]; o.y += pos[i * 2 + 1]; o.e += energy[i]; o.n++;
    if (t === 1) o.sensor++;
    if (t === 2) o.muscle++;
  }
  for (const o of b.values()) { o.x /= o.n; o.y /= o.n; o.e /= o.n; }
  return { b, steps, bound };
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

const A = await snapshot();
console.log(`tracking ${A.b.size} bodies by uid over ${WINDOW / 1000}s of wall clock…`);
await new Promise((r) => setTimeout(r, WINDOW));
const B = await snapshot();

const bound = B.bound;
const wrap = (d) => (d > bound ? d - 2 * bound : d < -bound ? d + 2 * bound : d);

const raw = [];
for (const [uid, a] of A.b) {
  const b = B.b.get(uid);
  if (!b) continue;                       // died, or was never the same body
  raw.push({ dx: wrap(b.x - a.x), dy: wrap(b.y - a.y), dE: b.e - a.e,
             sensor: b.sensor > 0, muscle: b.muscle > 0 });
}
if (raw.length < 30) { console.log(`only ${raw.length} bodies survived the window`); Deno.exit(0); }

// Common drift, subtracted. Without this the measurement is about the weather.
const mx = median(raw.map((r) => r.dx)), my = median(raw.map((r) => r.dy));
for (const r of raw) {
  r.d = Math.hypot(r.dx - mx, r.dy - my);
  r.dRaw = Math.hypot(r.dx, r.dy);
}

const corr = (xs, ys) => {
  const mxx = mean(xs), myy = mean(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mxx, b = ys[i] - myy;
    num += a * b; dx2 += a * a; dy2 += b * b;
  }
  return num / Math.max(1e-12, Math.sqrt(dx2 * dy2));
};

const byD = [...raw].sort((a, b) => a.d - b.d);
const q = Math.max(1, Math.floor(byD.length / 4));
const movers = byD.slice(-q), sitters = byD.slice(0, q);
const dM = mean(movers.map((r) => r.dE)), dS = mean(sitters.map((r) => r.dE));
const se = Math.sqrt(sd(movers.map((r) => r.dE)) ** 2 / movers.length +
                     sd(sitters.map((r) => r.dE)) ** 2 / sitters.length);

console.log(`\nsteps ${A.steps.toLocaleString()} -> ${B.steps.toLocaleString()}, ` +
  `${raw.length} bodies survived and kept their identity\n`);
console.log(`common drift subtracted:   ${Math.hypot(mx, my).toFixed(3)} world units ` +
  `(median displacement of the whole population — the current, not swimming)`);
console.log(`displacement after drift:  p50 ${median(raw.map((r) => r.d)).toFixed(3)}  ` +
  `p90 ${[...raw.map((r) => r.d)].sort((a, b) => a - b)[Math.floor(0.9 * raw.length)].toFixed(3)}`);
console.log(`\ncorrelation, displacement vs energy change:  ${corr(raw.map((r) => r.d), raw.map((r) => r.dE)).toFixed(3)}`);
console.log(`top quartile movers   dEnergy ${dM >= 0 ? '+' : ''}${dM.toFixed(4)}  (n=${movers.length})`);
console.log(`bottom quartile sitters dEnergy ${dS >= 0 ? '+' : ''}${dS.toFixed(4)}  (n=${sitters.length})`);
console.log(`difference ${(dM - dS) >= 0 ? '+' : ''}${(dM - dS).toFixed(4)} +-${(2 * se).toFixed(4)}`);

console.log('');
if (Math.abs(dM - dS) <= 2 * se) {
  console.log('VERDICT: moving is NEUTRAL. Movers and sitters end the window equally');
  console.log('well off, so locomotion buys nothing — and sensing, which can only pay');
  console.log('THROUGH movement, has nothing to pay into. That is a complete');
  console.log('explanation of the sensor result and it is upstream of any sensory tuning.');
} else if (dM < dS) {
  console.log('VERDICT: moving COSTS. Movers end poorer than sitters, so locomotion is');
  console.log('selected against and a sense organ that steers it is worse than useless.');
} else {
  console.log('VERDICT: moving PAYS. Movers end richer, so there is a return for');
  console.log('locomotion to capture — and therefore something for perception to aim at.');
}
