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
import { assert, assertEquals } from 'jsr:@std/assert@1';

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

/**
 * Compile both shaders on a real device.
 *
 * The backtick checks above are about the JS string surviving; this is about the
 * WGSL inside it being valid — and specifically about the contract on
 * WGSL_FIELD, which is shared verbatim between the simulation and the renderer
 * and therefore may not name a uniform. Adding a time-varying resource field
 * that read `P.worldTime` straight from the simulation's uniform broke that:
 * the block parsed fine on its own and in the compute shader, and took the
 * whole render shader down with "unresolved value 'P'". Nothing textual would
 * catch it. Compiling both against a device does.
 */
import { WGSL_FIELD } from './world_gpu.js';

const HAS_GPU = !!(globalThis.navigator?.gpu && await navigator.gpu.requestAdapter());

Deno.test({
  name: 'the shared field block names no uniform — both shaders compile',
  ignore: !HAS_GPU,
  async fn() {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();

    const errors = [];
    device.addEventListener?.('uncapturederror', e => errors.push(e.error?.message ?? String(e.error)));

    // The renderer's WGSL, lifted from world.html exactly as the page builds it.
    const html = await Deno.readTextFile(new URL('../world.html', import.meta.url));
    const open = html.indexOf('const RENDER = /* wgsl */`');
    assert(open >= 0, 'could not find the RENDER shader in world.html');
    const start = open + 'const RENDER = /* wgsl */`'.length;
    const end = html.indexOf('\n`;', start);
    assert(end > start, 'could not find the end of the RENDER shader');
    const render = html.slice(start, end).replace('${WGSL_FIELD}', WGSL_FIELD);

    device.pushErrorScope('validation');
    const mod = device.createShaderModule({ code: render, label: 'render-under-test' });
    const info = await mod.getCompilationInfo?.();
    const fatal = (info?.messages ?? []).filter(m => m.type === 'error');
    const scope = await device.popErrorScope();

    assertEquals(fatal.map(m => `${m.lineNum}: ${m.message}`), [],
      'the render shader does not compile');
    assert(!scope, `render shader validation error: ${scope?.message}`);

    // WGSL_FIELD must also stand alone, with no uniform in scope at all.
    device.pushErrorScope('validation');
    const bare = device.createShaderModule({
      code: WGSL_FIELD + '\n@compute @workgroup_size(1) fn probe() { _ = fbm(vec2<f32>(0.0), 1u); }',
      label: 'field-alone',
    });
    const bareInfo = await bare.getCompilationInfo?.();
    const bareFatal = (bareInfo?.messages ?? []).filter(m => m.type === 'error');
    await device.popErrorScope();
    assertEquals(bareFatal.map(m => `${m.lineNum}: ${m.message}`), [],
      'WGSL_FIELD does not compile on its own — it is referencing something external');

    device.destroy();
  },
});
