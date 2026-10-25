// Behaviour check: the Lisp written in BASIC (examples/lisp.bas) must answer correctly on ZX GPU.
import { EXAMPLES } from '../../js/examples.js';
import { Machine } from '../machine.js';

const ex = EXAMPLES.find(e => e.id === 'lisp');
const m = new Machine(ex.src, { store: new Map() });
const screen = () => { // the text the terminal shows, row by row
  const rows = [];
  for (let r = 0; r < 24; r++) { let s = ''; for (let c = 0; c < 32; c++) { const cell = m.cells.get((r + m.sr) * 32 + c); s += cell ? String.fromCharCode(cell.code) : ' '; } rows.push(s); }
  return rows.join('\n');
};
const frames = (n) => { for (let i = 0; i < n; i++) m.frame(performance.now()); };
const type = (text) => {
  for (const ch of text) {
    const id = ch === '\r' ? 13 : ch.toUpperCase().charCodeAt(0);
    m.keyDown({ id, ch }); frames(2); m.keyUp(id); frames(2);
  }
};
const until = (re, max = 20000) => { for (let i = 0; i < max; i++) { frames(10); if (re.test(screen().replace(/\s+/g, ' '))) return true; } return false; };
let ok = true;
const check = (what, expr, re) => {
  type(expr + '\r');
  const hit = until(re);
  console.log(`${hit ? 'ok  ' : 'FAIL'} ${what}`);
  if (!hit) { ok = false; console.log(screen()); }
};
until(/UP AND DOWN FOR EXAMPLES/);
check('arithmetic', '(+ 1 2 3)', /\* \(\+ 1 2 3\) 6 \*/);
check('recursion: (FACT 10)', '(FACT 10)', /3628800/);
check('lists: (REVERSE ...)', "(REVERSE '(A B C))", /\(C B A\)/);
check('lambda and MAPCAR', "(MAPCAR (LAMBDA (X) (* X X)) '(1 2 3))", /\(1 4 9\)/);
check('a query over the RDF store', "(QUERY '(SELECT (?X ?C) WHERE (?X A ?C) (?C RDFS:SUBCLASSOF PERSON)))", /\(\(NED MINER\) \(VEGA ASTRA\)\)/);
process.exit(ok ? 0 : 1);
