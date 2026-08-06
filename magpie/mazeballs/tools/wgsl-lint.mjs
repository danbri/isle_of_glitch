/**
 * The same mistake, three times: a BACKTICK inside a WGSL comment.
 *
 * The shaders live in JS template literals, so one backtick in a shader comment
 * — the natural way to write `f` in prose — silently ends the string. The file
 * then fails to parse with something like "Unexpected identifier 'f'", pointing
 * at the comment rather than at the string it broke, and the page does not boot
 * at all: a 300x150 canvas and an empty HUD, which looks nothing like a
 * punctuation error and reads as a WebGPU failure.
 *
 * A comment saying "do not do this" has been ignored twice. This is a check.
 *
 *   deno run -A tools/wgsl-lint.mjs
 *
 * THE RULE, and why it is exactly this one: inside a shader literal, the first
 * unescaped backtick ends the string, full stop. A backtick that appears in a
 * `//` comment there is therefore ALWAYS a bug — there is no legitimate reason
 * to write one — while a backtick ending the literal normally sits in code.
 * Checking for "backtick in a WGSL comment" catches every real instance and
 * cannot fire on correct code, which is what makes it worth running.
 */
const FILES = ['world.html', 'lib/world_gpu.js', 'lib/brainarena_gpu.js', 'lib/devo2.js'];
const OPEN = /\/\*\s*wgsl\s*\*\/\s*`|(?:SHADER|RENDER|WGSL_[A-Z]+|[A-Z_]*WGSL)\s*=\s*(?:\/\*[^*]*\*\/\s*)?`/;

let bad = 0, scanned = 0;
for (const f of FILES) {
  let src;
  try { src = await Deno.readTextFile(new URL(`../${f}`, import.meta.url)); }
  catch { continue; }
  scanned++;
  const lines = src.split('\n');
  let inWgsl = false;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!inWgsl) { if (OPEN.test(ln)) inWgsl = true; continue; }
    const tick = ln.indexOf('`');
    if (tick < 0) continue;
    const slashes = ln.indexOf('//');
    if (slashes >= 0 && slashes < tick) {
      console.error(`${f}:${i + 1}  backtick in a shader comment — this ENDS the template literal`);
      console.error(`    ${ln.trim()}`);
      bad++;
      continue;                 // keep scanning; there may be more than one
    }
    inWgsl = false;             // a backtick in code is the literal closing
  }
}

if (bad) {
  console.error(`\n${bad} backtick(s) that would stop the page booting. Use plain words, not \\u0060.`);
  Deno.exit(1);
}
console.log(`wgsl-lint: ${scanned} file(s) clean — no backticks inside shader comments`);
