/**
 * Guards the WGSL template literals against a mistake that has now broken this
 * build four times: a backtick inside a shader comment.
 *
 * The shaders are JS template literals, so a stray backtick — usually from
 * quoting an identifier the way the surrounding prose does — silently ENDS the
 * string. The failure surfaces as a JS syntax error pointing at whatever word
 * follows, which says nothing about shaders and reads like a corrupted file.
 * It is a two-second fix that costs ten minutes to find, every time.
 *
 * Run: deno test lib/shader_syntax_test.js
 */
import { assert } from 'jsr:@std/assert@1';

const FILES = ['./world_gpu.js', './brainarena_gpu.js', '../world.html'];

/** Extract every `/* wgsl *\/`-tagged template literal body. */
function wgslBlocks(src) {
  const out = [];
  const re = /\/\* wgsl \*\/`/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const end = src.indexOf('`', start);
    out.push({ start, body: end === -1 ? src.slice(start) : src.slice(start, end), closed: end !== -1 });
  }
  return out;
}

for (const rel of FILES) {
  Deno.test(`no stray backticks in the WGSL of ${rel}`, async () => {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    const blocks = wgslBlocks(src);
    assert(blocks.length > 0, `no /* wgsl */ template found in ${rel}`);

    for (const b of blocks) {
      assert(b.closed, `an unterminated WGSL template literal in ${rel}`);
      // A correctly-closed block ends at the FIRST backtick, so a stray one
      // inside truncates the shader. The tell is that the block no longer
      // contains the entry points or helpers it should.
      assert(!b.body.includes('`'), `backtick inside the WGSL of ${rel}`);
    }

    // Each shader must still contain a real entry point or shared function. A
    // premature close would leave a fragment that passes the checks above.
    const all = blocks.map(b => b.body).join('\n');
    assert(/@compute|@vertex|@fragment|^fn /m.test(all),
      `the WGSL in ${rel} contains no entry point — the literal probably closed early`);
  });
}
