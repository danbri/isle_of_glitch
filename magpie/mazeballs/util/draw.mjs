/**
 * Draw developed bodies as ASCII. Run: deno run --allow-all util/draw.mjs
 *
 * A body plan is hard to check by reading numbers and easy to check by looking.
 * This renders what a genome develops into, with each cell drawn as whichever
 * of its continuous capacities dominates — M muscle, S sensor, A anchor/grip,
 * B stiff (bone), o undifferentiated tissue. Those letters are DESCRIPTIONS
 * read off the properties, exactly as lib/evolve.js describe() does for the
 * physics kernel; the genome never writes a type.
 *
 * The three genomes below are hand-written rather than evolved, and that is the
 * point: they demonstrate that bilateral symmetry, segmentation and a stiff
 * skeleton are REACHABLE from this encoding. Whether evolution actually finds
 * them is a separate question these drawings do not answer.
 *
 * See sample-drawings.md for the committed output.
 */
import { PROPS, BASIS, NB, GENOME_SIZE, develop, bond, morphology } from '../lib/devo.js';
const G = (spec) => { const g=new Float32Array(GENOME_SIZE);
  for (const [p,b,w] of spec) g[PROPS.indexOf(p)*NB + BASIS.findIndex(([n])=>n===b)] = w; return g; };
function draw(name, g) {
  const {cells} = develop(g, {extent: 3.6});
  const bonds = bond(cells);
  const m = morphology(cells, bonds);
  const W=46,H=17; const grid=Array.from({length:H},()=>Array(W).fill(' '));
  for (const c of cells) {
    const cx=Math.round((c.ap*0.5+0.5)*(W-1)), cy=Math.round((c.dv*0.5+0.5)*(H-1));
    if(cx<0||cx>=W||cy<0||cy>=H) continue;
    // glyph by what the cell is MOST of — a description, not a stored type
    const k=[['M',c.contract],['S',c.sense],['A',c.grip],['B',c.stiff]].sort((a,b)=>b[1]-a[1])[0];
    grid[cy][cx] = k[1] > 0.15 ? k[0] : 'o';
  }
  console.log(`\n${name}`);
  console.log(`  cells ${m.n}  symmetry ${m.symmetry.toFixed(2)}  segments ${m.segments}  elong ${m.elongation.toFixed(2)}  stiffSpan ${m.stiffSpan.toFixed(1)}x`);
  for (const r of grid) console.log('  ' + r.join(''));
}
// Evolved genomes, if a run has left some. `--genomes <file>` takes the JSON
// written by an evolution run: [{gen, g:[...weights]}]. Without it we draw the
// hand-written demonstrations below, which show what the encoding can REACH
// rather than what selection finds — a distinction worth keeping visible.
const gi = Deno.args.indexOf('--genomes');
if (gi >= 0 && Deno.args[gi + 1]) {
  const rows = JSON.parse(await Deno.readTextFile(Deno.args[gi + 1]));
  console.log(`=== EVOLVED genomes from ${Deno.args[gi + 1]} ===`);
  rows.forEach((r, i) => draw(`evolved #${i + 1}, generation ${r.gen}`, Float32Array.from(r.g)));
  Deno.exit(0);
}

draw('bilateral, segmented, stiff spine', G([
  ['presence','bias',1.1], ['presence','|dv|',-0.9],
  ['contract','sin3ap',2.2], ['grip','|dv|',1.4], ['stiff','|dv|',-2.2], ['stiff','bias',0.8]]));
draw('worm: narrow, strongly segmented', G([
  ['presence','bias',1.3], ['presence','|dv|',-2.6],
  ['contract','sin4ap|dv|',2.0], ['contract','sin2ap',1.8], ['stiff','ap^2',1.2]]));
draw('asymmetric (signed dv) — the control', G([
  ['presence','bias',0.9], ['presence','dv',1.5], ['contract','dv',2.0]]));
