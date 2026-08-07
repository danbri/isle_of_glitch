/**
 * DIVISION OF LABOUR, LOGGED OVER TIME.
 *
 * A claim was made this evening that removing the grippiness factor from tidal
 * income should restore tissue diversity. That is a prediction, and predictions
 * that are not written down before the fact become memories of having been
 * right. This records the actual trajectory.
 *
 * The measurement that matters is not the tissue MIX — a population can be 25%
 * of each type and still be a million identical bodies. It is how many bodies
 * carry more than one tissue, and in particular how many carry BOTH a sensor
 * and a muscle, because that is the minimum parts list for a sensorimotor loop
 * and it is the project's stated critical path.
 *
 * The baseline it starts from was evolved under the OLD economy, so the first
 * hours are a population still shaped by a world that paid for grip. What is
 * being watched is the direction, not the level.
 *
 *   deno run -A tools/composition-log.js [--every 300] [--out runs/composition.jsonl]
 *
 * Reads live frames, so it costs the simulation nothing.
 */
const args = Object.fromEntries(
  Deno.args.map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] ?? 'true'] : null)
    .filter(Boolean));
const PORT = Number(args.port ?? 8899);
const EVERY = Number(args.every ?? 300) * 1000;
const OUT = args.out ?? './runs/composition.jsonl';
const HEAD = 48;

async function sample() {
  const buf = await (await fetch(`http://127.0.0.1:${PORT}/frame`, { cache: 'no-store' }))
    .arrayBuffer();
  const dv = new DataView(buf);
  const steps = dv.getUint32(8, true);
  let at = HEAD;
  const L = dv.getUint32(at, true); at += 4;
  at += L * 4 + L * 8 + L * 4;                     // idx, pos, act
  const type = new Int32Array(buf.slice(at, at + L * 4)); at += L * 4;
  at += L * 4;                                      // energy
  const uid = new Int32Array(buf.slice(at, at + L * 4));

  const total = [0, 0, 0, 0];
  const perBody = new Map();
  for (let i = 0; i < L; i++) {
    const t = type[i];
    if (t < 0 || t > 3) continue;
    total[t]++;
    let b = perBody.get(uid[i]);
    if (!b) { b = [0, 0, 0, 0]; perBody.set(uid[i], b); }
    b[t]++;
  }
  const n = total.reduce((s, v) => s + v, 0) || 1;
  const B = perBody.size || 1;
  let mono = 0, senseAndMove = 0, three = 0;
  const sizes = [];
  for (const b of perBody.values()) {
    const kinds = b.filter((v) => v > 0).length;
    if (kinds === 1) mono++;
    if (kinds >= 3) three++;
    if (b[1] > 0 && b[2] > 0) senseAndMove++;
    sizes.push(b.reduce((s, v) => s + v, 0));
  }
  sizes.sort((a, b) => a - b);
  return {
    t: new Date().toISOString(), step: steps, cells: n, bodies: perBody.size,
    neuron: +(total[0] / n).toFixed(4), sensor: +(total[1] / n).toFixed(4),
    muscle: +(total[2] / n).toFixed(4), anchor: +(total[3] / n).toFixed(4),
    monoBodies: +(mono / B).toFixed(4),
    threeTissue: +(three / B).toFixed(4),
    // THE CRITICAL-PATH NUMBER. Bodies holding the minimum parts for
    // sense -> decide -> move. Everything else here is context for this.
    senseAndMove: +(senseAndMove / B).toFixed(4),
    medianBody: sizes[sizes.length >> 1] ?? 0,
  };
}

console.log(`logging composition every ${EVERY / 1000}s to ${OUT}`);
for (;;) {
  try {
    const row = await sample();
    console.log(`step ${String(row.step).padStart(8)}  bodies ${String(row.bodies).padStart(5)}  ` +
      `n/s/m/a ${(100 * row.neuron).toFixed(0)}/${(100 * row.sensor).toFixed(0)}/` +
      `${(100 * row.muscle).toFixed(0)}/${(100 * row.anchor).toFixed(0)}%  ` +
      `one-tissue ${(100 * row.monoBodies).toFixed(0)}%  sense+move ${(100 * row.senseAndMove).toFixed(1)}%`);
    await Deno.writeTextFile(OUT, JSON.stringify(row) + '\n', { append: true });
  } catch (e) {
    // A restarting server is expected, not an error worth stopping for.
    console.log(`sample failed (${e.message}) — retrying`);
  }
  await new Promise((r) => setTimeout(r, EVERY));
}
