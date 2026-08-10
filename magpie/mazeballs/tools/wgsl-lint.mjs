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
// A HAND-MAINTAINED LIST IS A GUARD THAT GOES STALE. lib/devo-gpu.js carried
// three WGSL kernels for a day without being covered, and the omission cost the
// exact bug this file exists to prevent: a backtick inside a shader comment,
// which ends the JS template literal and produces a syntax error pointing at a
// line that looks fine. The lint reported clean while the file would not parse.
//
// Any file that contains WGSL is scanned now, found rather than listed.
const FILES = await (async () => {
  // Deno, not node: this script is run by the same runtime as the world, and
  // the first attempt at discovery used node's readdirSync, which is simply
  // undefined here. The try/catch swallowed the ReferenceError and the lint
  // quietly scanned nothing while still printing that it was clean - a guard
  // that reports success when it has checked no files is worse than a stale
  // list, because a stale list at least fails loudly when you look at it.
  const out = ['world.html'];
  const root = new URL('../', import.meta.url);
  for (const dir of ['lib', 'tools']) {
    try {
      for await (const e of Deno.readDir(new URL(dir, root))) {
        if (!e.isFile || !/\.m?js$/.test(e.name)) continue;
        const rel = `${dir}/${e.name}`;
        let src = '';
        try { src = await Deno.readTextFile(new URL(rel, root)); } catch { continue; }
        // The marker every shader in this project carries.
        if (/@compute|@vertex|@fragment/.test(src)) out.push(rel);
      }
    } catch { /* directory absent; nothing to scan */ }
  }
  return out;
})();
const OPEN = /\/\*\s*wgsl\s*\*\/\s*`|(?:SHADER|RENDER|WGSL_[A-Z]+|[A-Z_]*WGSL)\s*=\s*(?:\/\*[^*]*\*\/\s*)?`/;

// A GUARD THAT CHECKED NOTHING MUST NOT REPORT SUCCESS.
//
// This script uses Deno's file APIs, and it was run with `node` for a whole
// session. Every call printed "0 file(s) clean" and returned zero, so it looked
// like a passing check while reading not one line - and a real backtick bug
// shipped past it into lib/devo-gpu.js.
//
// Scanning nothing is now an error, loudly, with the reason.
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
if (scanned === 0) {
  console.error('wgsl-lint: scanned NOTHING. This script needs Deno (it uses Deno.readDir);');
  console.error('  run it as `deno run -A tools/wgsl-lint.mjs`. Reporting clean here would be a lie.');
  if (typeof Deno !== 'undefined') Deno.exit(2); else process.exit(2);
}
console.log(`wgsl-lint: ${scanned} file(s) clean — no backticks inside shader comments`);
