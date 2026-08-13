/**
 * Is lineage collapse driven by the LIFESPAN CAP rather than by competition?
 *
 * A three-day run collapsed from 279 lineages to 3, and the three survivors were
 * near-evenly matched - 97% of the maximum entropy for three lines - so nothing
 * won. The death ledger said why it might be: 80% of deaths were the age cap,
 * not starvation and not contest.
 *
 * That suggests a lineage does not lose a competition, it fails to replace
 * itself before its members time out - a branching process with a hard
 * lifetime, which sheds lines to drift whatever their quality. If so, the lever
 * that matters is variance in reproductive success, not the payoff landscape.
 *
 * THE TEST. Run the same world at several maxAge values and watch two things:
 * the share of deaths that are age rather than starvation, and how fast
 * EFFECTIVE lineages fall. If the cap is doing the work, a longer cap should
 * shift deaths toward starvation and slow the loss. If diversity collapses just
 * as fast with a long cap, the hypothesis is wrong and competition or drift in
 * something else is responsible.
 *
 * Effective lineages rather than the count, because a count of twelve says
 * nothing about whether that is twelve equal lines or one line and eleven
 * stragglers.
 *
 *   deno run -A --unstable-webgpu tools/maxage-sweep.js [--steps 60000]
 */
import { buildBodies } from '../lib/bodies.js';
import { BrainArenaGPU } from '../lib/brainarena_gpu.js';
import { WorldGPU } from '../lib/world_gpu.js';
import { Evolver } from '../lib/evolve.js';

const arg = (k, d) => { const i = Deno.args.indexOf(`--${k}`); return i >= 0 ? Number(Deno.args[i + 1]) : d; };
const STEPS = arg('steps', 60000);
const SEEDS = arg('seeds', 2);
const AGES = [12500, 25000, 100000];

console.log(`maxAge sweep: ${AGES.join(', ')} over ${STEPS.toLocaleString()} steps, ${SEEDS} seed(s) each`);
console.log('age cap   seed   alive  lineages  effective  entropy   deaths  byAge%  births');

for (const maxAge of AGES) {
  for (let s = 0; s < SEEDS; s++) {
    const seed = 900 + s * 17;
    // HEADROOM MATTERS OR THIS MEASURES THE WRONG THING. With bodySlots equal
    // to the founder count the population starts at its ceiling and almost
    // nothing can be born - 21 births in 3,000 steps - so every world looks the
    // same whatever the lifespan is. Three times the founders leaves room for
    // the thing being measured to actually happen.
    const built = buildBodies({ beasts: 300, cells: 12, bound: 66, maxCells: 60,
                                bodySlots: 900, seed });
    const brains = await BrainArenaGPU.create(built.arena);
    const world = new WorldGPU(brains, built.cells, { bound: 66 });
    const evo = new Evolver({
      arena: built.arena, world, cells: built.cells,
      seed, maxAge, ageSpread: 0.35,
    });

    let done = 0;
    while (done < STEPS) {
      const chunk = Math.min(500, STEPS - done);
      world.step(chunk);
      done += chunk;
      try { await evo.tick(done); } catch { /* a failed tick is not a failed run */ }
      // Eggs are laid by the pump, not by tick, so it has to be driven here too
      // or the world simply never reproduces.
      try { evo.pump(done, 4); } catch { /* same */ }
    }

    const L = evo.lineageStats();
    const deaths = evo.deaths || 1;
    const byAge = 100 * (evo.agedOut ?? 0) / deaths;
    console.log(
      `${String(maxAge).padStart(7)}  ${String(seed).padStart(5)}  ` +
      `${String(evo.alive()).padStart(5)}  ${String(L.count).padStart(8)}  ` +
      `${String(L.effective).padStart(9)}  ${String(L.entropyBits).padStart(7)}  ` +
      `${String(deaths).padStart(6)}  ${byAge.toFixed(0).padStart(5)}%  ${String(evo.births).padStart(6)}`);

    world.destroy?.(); brains.destroy?.();
  }
}
console.log('\nIf a longer cap shifts deaths toward starvation AND holds effective lineages up,');
console.log('the collapse is attrition under the lifespan. If effective falls the same either');
console.log('way, it is not the cap and this hypothesis is wrong.');
