// node tools/build.js prog.bas out.swf
import { readFileSync, writeFileSync } from 'node:fs';
import { buildProgram } from '../js/compiler.js';
const [src, dst] = process.argv.slice(2);
const r = buildProgram(readFileSync(src, 'utf8'));
writeFileSync(dst, r.swf);
console.log(`${dst}: ${r.swf.length} bytes, ${r.bytecode} bytes of AVM1, ${r.lines} lines, vars: ${r.vars.join(' ')}`);
