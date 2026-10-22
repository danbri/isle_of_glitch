// Compile every bundled example; exit non-zero if any fails.
import { buildProgram } from '../js/compiler.js';
import { EXAMPLES } from '../js/examples.js';
let bad = 0;
for (const ex of EXAMPLES) {
  try { const r = buildProgram(ex.src); console.log(`ok   ${ex.name}: ${r.bytecode} bytes AVM1`); }
  catch (e) { bad++; console.log(`FAIL ${ex.name}: ${e.message} (line ${e.line})`); }
}
process.exit(bad ? 1 : 0);
