/**
 * What a cell looks like, from what a cell IS.
 *
 * Every viewer here used to pick one of four fixed RGB constants by running
 * describe() and taking the argmax. That is winner-takes-all twice over: a cell
 * with 0.51 contract and 0.49 grip drew the identical terracotta as one with
 * 1.0 and 0.0, and a body whose cells all narrowly favoured the same capacity
 * drew as a single flat colour. Measured on the wizard gallery, four of sixteen
 * tiles hid their contractility entirely behind the label — seed 12451 has 116
 * cells that can contract and none labelled muscle.
 *
 * HSV separates the questions instead of collapsing them:
 *
 *   HUE          what the cell DOES. The three capacities are weights on three
 *                anchors around the colour circle and the hue is the direction
 *                of their sum, so a half-muscle half-anchor cell lands between
 *                terracotta and plum rather than snapping to one of them.
 *
 *   SATURATION   how COMMITTED it is. The length of that same sum against its
 *                total, so a cell that does one thing strongly is vivid and one
 *                that hedges across all three is stone grey. An undifferentiated
 *                cell now looks undifferentiated instead of looking like a
 *                neuron.
 *
 *   VALUE        what it is MADE of. Density, log-scaled the way the kernel
 *                reads it: gaseous is pale and airy, leaden is dark. This is the
 *                property that decides which ways of moving are available to a
 *                body, so it should be visible at a glance.
 *
 * Size is not in here because size is drawn as size — radius became a real
 * per-cell quantity when development gained its relaxation phase, so a large
 * node looks large and needs no colour channel spent on it.
 *
 * ONE DEFINITION, TWO CONSUMERS. The WGSL and the JS below compute the same
 * thing, for the same reason the field shader is exported rather than
 * duplicated: a viewer that draws a different quantity from the one the
 * simulation holds is a plausible lie, and every reading taken off it is wrong
 * in a way that looks fine.
 */

// Where each capacity sits on the colour circle, in turns. Chosen to keep the
// old palette's associations — jade sensor, terracotta muscle, plum anchor — so
// anyone who has been reading these pictures for months is not relearning them.
export const HUE_SENSE = 0.44;      // jade
export const HUE_CONTRACT = 0.045;  // terracotta
export const HUE_GRIP = 0.79;       // plum

export const COLOUR_WGSL = /* wgsl */`
fn hsv2rgb(h: f32, s: f32, v: f32) -> vec3<f32> {
  let k = vec3<f32>(5.0, 3.0, 1.0);
  let p = abs(fract(vec3<f32>(h) + k / 6.0) * 6.0 - 3.0);
  return v * mix(vec3<f32>(1.0), clamp(p - 1.0, vec3<f32>(0.0), vec3<f32>(1.0)), s);
}

// sense/contract/grip are capacities, not labels; density is 0..1 as the genome
// expresses it, with 0.5 the neutrally buoyant middle.
fn cellColour(sense: f32, contract: f32, grip: f32, density: f32) -> vec3<f32> {
  let a = max(sense, 0.0);
  let b = max(contract, 0.0);
  let c = max(grip, 0.0);
  let tot = a + b + c;
  var dir = vec2<f32>(0.0, 0.0);
  let TAU = 6.283185307;
  dir = dir + a * vec2<f32>(cos(${HUE_SENSE} * TAU), sin(${HUE_SENSE} * TAU));
  dir = dir + b * vec2<f32>(cos(${HUE_CONTRACT} * TAU), sin(${HUE_CONTRACT} * TAU));
  dir = dir + c * vec2<f32>(cos(${HUE_GRIP} * TAU), sin(${HUE_GRIP} * TAU));
  let mag = length(dir);
  var hue = 0.0;
  if (mag > 1e-6) { hue = fract(atan2(dir.y, dir.x) / TAU + 1.0); }
  // Commitment: how far the capacities point one way, times how much capacity
  // there is at all. A cell with nothing to say is grey rather than black.
  let commit = select(0.0, mag / tot, tot > 1e-6);
  let sat = clamp(commit * clamp(tot * 1.6, 0.0, 1.0), 0.0, 0.92);
  // Gaseous pale, leaden dark. Never fully dark: a cell must stay visible.
  let val = mix(0.97, 0.42, clamp(density, 0.0, 1.0));
  return hsv2rgb(hue, sat, val);
}
`;

function hsv2rgb(h, s, v) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(Math.min(k, 4 - k), 1));
  };
  return [f(5), f(3), f(1)];
}

/** The same mapping in JS, for canvas viewers. Returns [r,g,b] in 0..1. */
export function cellColour(sense, contract, grip, density = 0.5) {
  const a = Math.max(sense || 0, 0), b = Math.max(contract || 0, 0), c = Math.max(grip || 0, 0);
  const tot = a + b + c;
  const TAU = Math.PI * 2;
  let dx = 0, dy = 0;
  dx += a * Math.cos(HUE_SENSE * TAU); dy += a * Math.sin(HUE_SENSE * TAU);
  dx += b * Math.cos(HUE_CONTRACT * TAU); dy += b * Math.sin(HUE_CONTRACT * TAU);
  dx += c * Math.cos(HUE_GRIP * TAU); dy += c * Math.sin(HUE_GRIP * TAU);
  const mag = Math.hypot(dx, dy);
  const hue = mag > 1e-6 ? ((Math.atan2(dy, dx) / TAU) + 1) % 1 : 0;
  const commit = tot > 1e-6 ? mag / tot : 0;
  const sat = Math.max(0, Math.min(0.92, commit * Math.min(1, tot * 1.6)));
  const val = 0.97 + (0.42 - 0.97) * Math.max(0, Math.min(1, density ?? 0.5));
  return hsv2rgb(hue, sat, val);
}

/** CSS, for canvas fillStyle. */
export function cellCss(sense, contract, grip, density = 0.5) {
  const [r, g, b] = cellColour(sense, contract, grip, density);
  const q = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${q(r)},${q(g)},${q(b)})`;
}

/**
 * A legend, for viewers that want to explain themselves. Returned as data
 * rather than markup so each viewer can draw it in its own idiom.
 */
export const COLOUR_LEGEND = [
  ['hue', 'what it does — jade senses, terracotta contracts, plum grips, and mixtures land between'],
  ['saturation', 'how committed it is — vivid does one thing, grey hedges across all three'],
  ['value', 'what it is made of — pale is gaseous, dark is leaden'],
  ['size', 'the radius relaxation gave it — large nodes are fused tissue'],
];
