// Structural check of the AVM1 in a generated SWF: every branch must land on an instruction boundary.
import { readFileSync } from 'node:fs';
import { buildProgram } from '../js/compiler.js';
const src = readFileSync(process.argv[2], 'utf8');
const r = buildProgram(src);
const swf = r.swf;
// find DoAction tag (code 12)
let i = 21 + (() => { const nb = swf[8] >> 3; return Math.ceil((5 + nb * 4) / 8) - 1; })(); // header: 8 + rect + 2 + 2
// simpler: scan tags from offset after header
function rectLen(b) { const nb = b[0] >> 3; return Math.ceil((5 + nb * 4) / 8); }
let p = 8 + rectLen(swf.subarray(8)) + 4;
let actions = null;
while (p < swf.length) {
  const h = swf[p] | (swf[p + 1] << 8); const code = h >> 6; let len = h & 63; p += 2;
  if (len === 63) { len = swf[p] | (swf[p + 1] << 8) | (swf[p + 2] << 16) | (swf[p + 3] << 24); p += 4; }
  if (code === 12) actions = swf.subarray(p, p + len);
  p += len;
}
// disassemble
function walk(buf, start, end, depth, problems) {
  const bounds = new Set(); const branches = [];
  let q = start;
  while (q < end) {
    bounds.add(q);
    const op = buf[q];
    if (op === 0) { q += 1; continue; }
    if (op < 0x80) { q += 1; continue; }
    const len = buf[q + 1] | (buf[q + 2] << 8);
    if (op === 0x99 || op === 0x9d) { const off = (buf[q + 3] | (buf[q + 4] << 8)) << 16 >> 16; branches.push({ at: q, target: q + 5 + off, op }); }
    if (op === 0x9b) { // DefineFunction: name, nparams, names, codesize ; body follows
      let s = q + 3; while (buf[s] !== 0) s++; s++;
      const np = buf[s] | (buf[s + 1] << 8); s += 2;
      for (let k = 0; k < np; k++) { while (buf[s] !== 0) s++; s++; }
      const size = buf[s] | (buf[s + 1] << 8); s += 2;
      const bodyStart = q + 3 + len;
      walk(buf, bodyStart, bodyStart + size, depth + 1, problems);
      q = bodyStart + size; bounds.add(q); continue;
    }
    q += 3 + len;
  }
  bounds.add(end);
  for (const b of branches) if (!bounds.has(b.target) || b.target < start || b.target > end) problems.push(`depth ${depth}: ${b.op === 0x99 ? 'Jump' : 'If'} at ${b.at} -> ${b.target} not on a boundary in [${start},${end})`);
}
const problems = [];
walk(actions, 0, actions.length, 0, problems);
console.log(`${process.argv[2]}: ${actions.length} bytes of AVM1, ${problems.length} branch problems`);
for (const pr of problems.slice(0, 10)) console.log('  ' + pr);
