// Spectrum-flavoured BASIC -> AVM1 IR compiler.
// Single pass: the parser emits IR as it goes. Output drops straight into runtime.js.
import { v, m, call, cm, nw, op, not, set, setm, local, x, iff, whl, ret, fn, root } from './avm1.js?v=mvlgpntz';
import { SCREEN } from './runtime.js?v=mvlgpntz';

export class BasicError extends Error {
  constructor(msg, line, col) { super(msg); this.line = line; this.col = col; }
}

const KEYWORDS = new Set(('LET PRINT INPUT IF THEN ELSE FOR TO STEP NEXT GOTO GOSUB RETURN STOP END REM CLS INK PAPER BORDER BRIGHT ' +
  'FLASH INVERSE OVER PLOT DRAW CIRCLE PAUSE BEEP RANDOMIZE RANDOMISE DIM POKE CLEAR RUN REPEAT UNTIL WHILE WEND RECT AT TAB ' +
  'AND OR NOT LINE GO SUB NEW LIST DATA READ RESTORE FX FXP SPRITE EMOJI WRAP TONE LOAD SAVE VERIFY MERGE CAT FORMAT MOVE ERASE OPEN CLOSE LPRINT LLIST COPY CONTINUE OUT DEF FN BIN ' +
  'RND INT ABS SGN SQR SIN COS TAN ATN ASN ACS EXP LN LEN STR$ VAL VAL$ CHR$ CODE INKEY$ PI PEEK IN USR ATTR POINT SCREEN$ MOUSEX MOUSEY MOUSEB TICKS').split(' '));
const IGNORED = new Set(['FLASH', 'INVERSE', 'OVER', 'POKE', 'CLEAR', 'RANDOMIZE', 'RANDOMISE', 'NEW', 'LIST', 'OUT']);
// statements skipped without looking at their arguments (tape, printer and stream commands)
const SKIPPED = new Set(['LOAD', 'SAVE', 'VERIFY', 'MERGE', 'CAT', 'FORMAT', 'MOVE', 'ERASE', 'OPEN', 'CLOSE', 'LPRINT', 'LLIST', 'COPY', 'CONTINUE', 'DEF']);

const UNICODE_MAP = { '©': 127, '£': 96, '▝': 129, '▘': 130, '▀': 131, '▗': 132, '▐': 133, '▚': 134, '▜': 135, '▖': 136, '▞': 137, '▌': 138, '▛': 139, '▄': 140, '▟': 141, '▙': 142, '█': 143 };
export function spectrumString(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (UNICODE_MAP[ch] !== undefined) out += String.fromCharCode(UNICODE_MAP[ch]);
    else if (c < 32 || c > 164) out += '?';
    else out += ch;
  }
  return out;
}

// ---- tokenizer ----
function tokenize(text, lineNo) {
  const toks = [];
  let i = 0;
  const err = (msg) => { throw new BasicError(msg, lineNo, i + 1); };
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
    const start = i;
    if (ch === '"') {
      let s = ''; i++;
      for (;;) {
        if (i >= text.length) err('Unterminated string');
        if (text[i] === '"') { if (text[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; }
        s += text[i++];
      }
      toks.push({ t: 'str', v: s, col: start + 1 }); continue;
    }
    if (ch === '#' || (ch === '0' && (text[i + 1] === 'x' || text[i + 1] === 'X'))) {
      i += ch === '#' ? 1 : 2;
      const s = i; while (i < text.length && /[0-9a-fA-F]/.test(text[i])) i++;
      if (i === s) err('Bad hex number');
      toks.push({ t: 'num', v: parseInt(text.slice(s, i), 16), col: start + 1 }); continue;
    }
    if (/[0-9.]/.test(ch) && !(ch === '.' && !/[0-9]/.test(text[i + 1] || ''))) {
      const mm = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(text.slice(i));
      i += mm[0].length;
      toks.push({ t: 'num', v: parseFloat(mm[0]), col: start + 1 }); continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let s = i; while (i < text.length && /[A-Za-z0-9_]/.test(text[i])) i++;
      if (text[i] === '$') i++;
      let word = text.slice(s, i);
      const up = word.toUpperCase();
      if (up === 'GO' ) { // GO TO / GO SUB
        const rest = /^\s*(TO|SUB)\b/i.exec(text.slice(i));
        if (rest) { i += rest[0].length; toks.push({ t: 'kw', v: 'GO' + rest[1].toUpperCase(), col: start + 1 }); continue; }
      }
      if (KEYWORDS.has(up)) {
        if (up === 'REM') { toks.push({ t: 'kw', v: 'REM', col: start + 1 }); return toks; }
        toks.push({ t: 'kw', v: up, col: start + 1 });
      } else toks.push({ t: 'id', v: word.toLowerCase(), col: start + 1 });
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') { toks.push({ t: 'op', v: two, col: start + 1 }); i += 2; continue; }
    if ('+-*/^=<>(),;:\''.includes(ch)) { toks.push({ t: 'op', v: ch, col: start + 1 }); i++; continue; }
    err(`Unexpected character '${ch}'`);
  }
  return toks;
}

// ---- compiler ----
const num = (n) => ['n', n];
const str = (s) => ['s', s];
const N = (e) => ({ ir: e, type: 'n' });
const Sx = (e) => ({ ir: e, type: 's' });
const math = (f, ...a) => cm(v('Math'), f, ...a);
const varName = (name) => 'b_' + name;

export function compileBasic(source, far = new Set(), chunks = null, trace = false) {
  const rawLines = source.split('\n');
  // pass 1: line numbers & resume indexes
  const lines = [];
  let auto = 0;
  for (let i = 0; i < rawLines.length; i++) {
    let text = rawLines[i];
    if (!text.trim()) continue;
    const mm = /^\s*(\d+)\s?/.exec(text);
    let n;
    if (mm) { n = parseInt(mm[1], 10); text = text.slice(mm[0].length); }
    else n = auto + 10;
    if (n <= auto && lines.length) throw new BasicError(`Line number ${n} out of order`, i + 1, 1);
    auto = n;
    lines.push({ n, text, src: i + 1, idx: lines.length });
  }
  const lineIdx = new Map(lines.map(l => [l.n, l.idx]));
  const lineNumbers = lines.map(l => l.n);

  const vars = new Map(); // b_name -> type
  const dims = new Set();
  const data = []; // DATA constants, in program order
  const sprites = new Map(); // SPRITE name -> rows of cell characters (compile-time bitmaps baked into the SWF)
  const emojis = new Map(); // EMOJI name -> { text, size }: rasterised by the host at compile time, baked as alpha bitmaps
  const dataAt = new Map(); // line number -> index of its first DATA item
  const resumeChunk = []; // resume index -> chunk it was emitted in (loop bodies, GOSUB returns, yields)
  const chunkOf = (idx) => (chunks ? (idx < lines.length ? chunks[idx] : (resumeChunk[idx] ?? curChunk)) : 0);
  const nChunks = chunks ? Math.max(...chunks) + 1 : 1;
  const outs = Array.from({ length: nChunks }, () => []);
  let out = outs[0]; // body of the chunk being compiled
  const splittable = []; // line idx -> true when no FOR/REPEAT/WHILE is open at its start (a chunk may begin there)
  let resumeCount = lines.length; // resume index 0..lines-1 are line starts
  const forStack = [], loopStack = [];
  let cur; // current line
  let curStmt = 1;

  const newResume = () => resumeCount++;
  // Every resume point gets a prologue in a chain of short hops: "if __pc == r goto R_r else next prologue".
  // Re-entering __run walks the chain, so no single branch has to reach across the whole function.
  let chain = 0, curChunk = 0;
  const PL = (n) => 'P' + curChunk + '_' + n;
  const resumeLabel = (r) => {
    resumeChunk[r] = curChunk;
    out.push(['jmp', 'R' + r], ['label', PL(chain)], ['jif', op('==', v('__pc'), num(r)), 'R' + r], ['jmp', PL(chain + 1)], ['label', 'R' + r]);
    chain++;
  };
  // A jump the assembler reported as out of range: set __pc and let the frame loop re-enter __run.
  const farJump = (idx) => { out.push(set('__pc', num(idx)), set('__again', num(1)), ret()); };
  const jumpTo = (idx) => { if (far.has('R' + idx) || chunkOf(idx) !== curChunk) farJump(idx); else out.push(['jmp', 'R' + idx]); };
  const yieldAt = () => { const r = newResume(); out.push(set('__pc', num(r)), ret()); resumeLabel(r); return r; };
  const budgetJump = (idx) => {
    out.push(set('__budget', op('-', v('__budget'), num(1))));
    out.push(iff(op('<=', v('__budget'), num(0)), [set('__pc', num(idx)), ret()]));
    jumpTo(idx);
  };
  const jumpToLineIdx = (idx) => { if (idx <= cur.idx) budgetJump(idx); else jumpTo(idx); };
  const targetFor = (n) => { // GOTO n jumps to first line >= n
    for (const l of lines) if (l.n >= n) return l.idx;
    return -1;
  };
  const report = (msg) => `${msg}, ${cur.n}:${curStmt}`;

  for (const line of lines) {
    cur = line; curStmt = 1;
    splittable[line.idx] = forStack.length + loopStack.length === 0;
    if (chunkOf(line.idx) !== curChunk) { // close this chunk
      farJump(line.idx); // sequential flow off the end of this chunk continues at this line, in the next chunk
      out.push(['label', PL(chain)]); // the chain's "nothing matched" exit: let the driver try the next chunk
      if (trace) out.push(['trace', ['op', '+', ['s', 'chunk ' + curChunk + ' has no resume point '], v('__pc')]]);
      out.push(set('__claimed', num(0)), ret());
      curChunk = chunkOf(line.idx); out = outs[curChunk]; chain = 0;
    }
    out.push(['mark', line.idx]);
    resumeLabel(line.idx);
    if (trace) out.push(['trace', ['s', 'line ' + line.n]]); // TRON-style: logs every line reached (Ruffle shows it at logLevel info)
    const toks = tokenize(line.text, line.src);
    const P = new Parser(toks, line, {
      vars, dims, out, data, dataAt, sprites, emojis, trace, newResume, yieldAt, jumpToLineIdx, jumpTo, resumeLabel, targetFor, lineIdx, report, forStack, loopStack,
      setStmt: (k) => { curStmt = k; },
    });
    P.statements();
  }
  if (forStack.length) throw new BasicError(`FOR ${forStack[forStack.length - 1].name} without NEXT`, cur ? cur.src : 1, 1);
  if (loopStack.length) throw new BasicError(`${loopStack[loopStack.length - 1].kind} without ${loopStack[loopStack.length - 1].kind === 'REPEAT' ? 'UNTIL' : 'WEND'}`, cur ? cur.src : 1, 1);
  out.push(['label', PL(chain)]); // end of the last prologue chain: nothing matched, fall into the exit
  if (trace) out.push(['trace', ['op', '+', ['s', 'last chunk has no resume point '], v('__pc')]]);
  out.push(x(call('__lo', str(lines.length ? `0 OK, ${lines[lines.length - 1].n}:1` : '0 OK'))), set('__done', num(1)), ret());

  // program prologue: variables, line table, dispatcher
  const prog = [];
  for (const [name, type] of vars) prog.push(set(name, type === 's' ? str('') : num(0)));
  prog.push(set('__ln', ['obj', lines.map(l => [String(l.n), num(l.idx)])]));
  prog.push(set('__data', ['arr', data.map(d => typeof d === 'string' ? str(d) : num(d))]), set('__dp', num(0)));
  // RESTORE n: index of the first DATA item at or after line n
  const dl = [...dataAt.entries()].sort((a, b) => a[0] - b[0]);
  prog.push(set('__dl', ['arr', dl.map(([ln, ix]) => ['arr', [num(ln), num(ix)]])]));
  prog.push(fn('__restore', ['_n'], [
    local('i', num(0)),
    whl(op('<', v('i'), m(v('__dl'), 'length')), [
      iff(op('>=', m(m(v('__dl'), v('i')), num(0)), v('_n')), [ret(m(m(v('__dl'), v('i')), num(1)))]),
      set('i', op('+', v('i'), num(1))),
    ]),
    ret(num(data.length)),
  ]));
  outs.forEach((o, k) => prog.push(fn('__run' + k, [], [['jmp', 'P' + k + '_0'], ...o])));
  // the driver: run the chunks in turn until one claims the current resume point (or the last one ends the program)
  const drv = [];
  outs.forEach((o, k) => { drv.push(set('__claimed', num(1)), x(call('__run' + k))); if (k < outs.length - 1) drv.push(iff(v('__claimed'), [ret()])); });
  prog.push(fn('__run', [], drv));
  return { ir: prog, lines: lines.length, resumePoints: resumeCount, vars: [...vars.keys()], sprites, emojis, splittable };
}

class Parser {
  constructor(toks, line, ctx) { this.toks = toks; this.i = 0; this.line = line; Object.assign(this, ctx); }
  err(msg, tok) { const t = tok || this.peek(); throw new BasicError(msg, this.line.src, t ? t.col : 1); }
  peek(o = 0) { return this.toks[this.i + o]; }
  next() { return this.toks[this.i++]; }
  atEnd() { return this.i >= this.toks.length; }
  isKw(k, o = 0) { const t = this.peek(o); return t && t.t === 'kw' && t.v === k; }
  isOp(k, o = 0) { const t = this.peek(o); return t && t.t === 'op' && t.v === k; }
  expectKw(k) { if (!this.isKw(k)) this.err(`Expected ${k}`); return this.next(); }
  expectOp(k) { if (!this.isOp(k)) this.err(`Expected '${k}'`); return this.next(); }
  declare(name, type) {
    const key = varName(name);
    const t = name.endsWith('$') ? 's' : 'n';
    if (type && type !== t) this.err(`Type mismatch for ${name}`);
    this.vars.set(key, t);
    return key;
  }

  // ---- statements ----
  statements(stopAtElse = false) {
    let k = 1;
    for (;;) {
      if (this.atEnd()) return;
      if (stopAtElse && this.isKw('ELSE')) return;
      if (this.isOp(':')) { this.next(); continue; }
      this.setStmt(k++);
      this.statement();
      if (this.atEnd()) return;
      if (stopAtElse && this.isKw('ELSE')) return;
      if (!this.isOp(':')) this.err('Expected end of statement');
    }
  }
  statement() {
    const t = this.peek();
    const out = this.out;
    if (t.t === 'id') return this.assignment();
    if (t.t !== 'kw') this.err('Nonsense in BASIC');
    this.next();
    switch (t.v) {
      case 'REM': this.i = this.toks.length; return;
      case 'LET': return this.assignment();
      case 'PRINT': return this.print();
      case 'INPUT': return this.input();
      case 'IF': return this.ifStmt();
      case 'FOR': return this.forStmt();
      case 'NEXT': return this.nextStmt();
      case 'GOTO': case 'GOSUB': return this.gotoStmt(t.v === 'GOSUB');
      case 'RETURN':
        out.push(set('__pc', cm(v('__gs'), 'pop')));
        if (this.trace) out.push(['trace', ['op', '+', ['s', 'RETURN to resume point '], v('__pc')]]);
        out.push(iff(op('==', v('__pc'), ['undef']), [x(call('__err', str(this.report('7 RETURN without GOSUB')))), ret()]));
        out.push(set('__budget', op('-', v('__budget'), num(1))), set('__again', num(1)), ret());
        return;
      case 'STOP': out.push(x(call('__lo', str(this.report('9 STOP statement')))), set('__done', num(1)), ret()); return;
      case 'END': out.push(x(call('__lo', str(this.report('0 OK')))), set('__done', num(1)), ret()); return;
      case 'RUN': { const idx = this.lineIdx.size ? 0 : -1; out.push(x(call('__cls'))); this.jumpToLineIdx(idx); return; }
      case 'CLS': out.push(x(call('__cls'))); return;
      case 'INK': out.push(set('__ink', this.numExpr())); return;
      case 'PAPER': out.push(set('__pap', this.numExpr())); return;
      case 'BRIGHT': out.push(set('__brt', this.numExpr())); return;
      case 'BORDER': out.push(x(call('__border', this.numExpr()))); return;
      case 'WRAP': out.push(set('__wrap', this.numExpr())); return;
      case 'PLOT': case 'DRAW': case 'CIRCLE': case 'RECT': return this.graphics(t.v);
      case 'PAUSE': {
        const e = this.numExpr();
        out.push(set('__wait', e));
        out.push(iff(op('<=', v('__wait'), num(0)), [set('__mode', num(2)), set('__wait', num(0))]));
        this.yieldAt(); return;
      }
      case 'BEEP': {
        const d = this.numExpr(); this.expectOp(',');
        const p = this.numExpr();
        out.push(local('_bd', d));
        out.push(x(call('__beep', v('_bd'), p)));
        out.push(set('__wait', math('round', op('*', v('_bd'), num(SCREEN.FPS)))));
        this.yieldAt(); return;
      }
      case 'TONE': { // TONE pitch [, seconds]: a soft chime (sine, quick decay); waits like BEEP only if seconds is given
        const pch = this.numExpr();
        out.push(x(call('__tone', pch)));
        if (this.isOp(',')) { this.next(); out.push(set('__wait', math('round', op('*', this.numExpr(), num(SCREEN.FPS))))); this.yieldAt(); }
        return;
      }
      case 'DIM': return this.dim();
      case 'SPRITE': {
        if (this.isKw('CLEAR')) { this.next(); out.push(x(call('__sprclr'))); return; }
        const t0 = this.peek(), t1 = this.peek(1), t2 = this.peek(2);
        if (t0 && t0.t === 'str' && t1 && t1.t === 'op' && t1.v === ',' && t2 && t2.t === 'str') {
          // definition: SPRITE "name", "row", "row", ...  (later definitions of the same name append rows)
          const name = this.next().v;
          const rows = this.sprites.get(name) || [];
          while (this.isOp(',')) { this.next(); const r = this.next(); if (!r || r.t !== 'str') this.err('SPRITE rows must be quoted strings', r); rows.push(r.v); }
          this.sprites.set(name, rows);
          return;
        }
        // draw: SPRITE name$, x, y [, xscale% [, yscale% [, rotation [, alpha%]]]]   (x,y = top-left in screen pixels, y downwards)
        const name = this.strExpr(); this.expectOp(',');
        const px = this.numExpr(); this.expectOp(',');
        const py = this.numExpr();
        const extra = [num(100), num(100), num(0), num(100)];
        for (let k = 0; k < 4 && this.isOp(','); k++) { this.next(); extra[k] = this.numExpr(); if (k === 0) extra[1] = extra[0]; }
        out.push(x(call('__spr', name, px, py, ...extra)));
        return;
      }
      case 'EMOJI': { // EMOJI "🙂", "name" [, size px]: the host rasterises it at compile time; use it with SPRITE "name", x, y
        const e = this.next();
        if (!e || e.t !== 'str') this.err('EMOJI needs a quoted emoji', e);
        this.expectOp(',');
        const n = this.next();
        if (!n || n.t !== 'str') this.err('EMOJI needs a quoted sprite name', n);
        let size = 48;
        if (this.isOp(',')) { this.next(); const sz = this.next(); if (!sz || sz.t !== 'num') this.err('EMOJI size must be a number', sz); size = Math.max(8, Math.min(256, sz.v)); }
        this.emojis.set(n.v, { text: e.v, size });
        return;
      }
      case 'FX': { // FX "method", args...  -> calls that MovieClip drawing-API method on the graphics layer
        const n = this.next();
        if (!n || n.t !== 'str') this.err('FX needs a quoted method name, e.g. FX "lineStyle", 2, #ff0000', n);
        if (n.v === 'chequer') { out.push(x(call('__fxchq'))); return; } // beginFill with a ZX81 chequerboard
        const args = [];
        while (this.isOp(',')) { this.next(); args.push(this.expr().ir); }
        out.push(x(['cm', ['m', ['m', v('scr'), 'inner'], 'gfx'], ['s', n.v], args]));
        return;
      }
      case 'FXP': { // FXP "property", value  -> sets a property of the graphics layer (_alpha, _rotation, _xscale ...)
        const n = this.next();
        if (!n || n.t !== 'str') this.err('FXP needs a quoted property name, e.g. FXP "_rotation", 45', n);
        this.expectOp(',');
        out.push(setm(['m', ['m', v('scr'), 'inner'], 'gfx'], ['s', n.v], this.expr().ir));
        return;
      }
      case 'DATA': {
        if (!this.dataAt.has(this.line.n)) this.dataAt.set(this.line.n, this.data.length);
        for (;;) {
          let neg = false;
          if (this.isOp('-')) { this.next(); neg = true; }
          const d = this.next();
          if (!d || (d.t !== 'num' && d.t !== 'str')) this.err('DATA items must be numbers or quoted strings', d);
          this.data.push(d.t === 'num' ? (neg ? -d.v : d.v) : spectrumString(d.v));
          if (!this.isOp(',')) return;
          this.next();
        }
      }
      case 'READ': {
        for (;;) {
          const d = this.next();
          if (!d || d.t !== 'id') this.err('READ needs a variable', d);
          const key = this.declare(d.v);
          out.push(iff(op('>=', v('__dp'), m(v('__data'), 'length')), [x(call('__err', str(this.report('E Out of DATA')))), ret()]));
          if (this.isOp('(')) { // array element
            if (!this.dims.has(d.v)) this.err(`${d.v} is not an array`, d);
            this.next();
            const idx = [this.numExpr()];
            while (this.isOp(',')) { this.next(); idx.push(this.numExpr()); }
            this.expectOp(')');
            let target = v(key);
            for (let k = 0; k < idx.length - 1; k++) target = m(target, idx[k]);
            out.push(setm(target, idx[idx.length - 1], m(v('__data'), v('__dp'))));
          } else out.push(set(key, m(v('__data'), v('__dp'))));
          out.push(set('__dp', op('+', v('__dp'), num(1))));
          if (!this.isOp(',')) return;
          this.next();
        }
      }
      case 'RESTORE': {
        if (!this.atEnd() && !this.isOp(':') && !this.isKw('ELSE')) {
          const n = this.next();
          if (n.t !== 'num') this.err('RESTORE needs a line number', n);
          out.push(set('__dp', call('__restore', num(n.v))));
        } else out.push(set('__dp', num(0)));
        return;
      }
      case 'REPEAT': { const r = this.newResume(); this.resumeLabel(r); this.loopStack.push({ kind: 'REPEAT', r }); return; }
      case 'UNTIL': {
        const l = this.loopStack.pop();
        if (!l || l.kind !== 'REPEAT') this.err('UNTIL without REPEAT');
        const c = this.expr();
        const Lend = `U$${l.r}`;
        out.push(['jif', c.ir, Lend]);
        this.budgetJump(l.r);
        out.push(['label', Lend]);
        return;
      }
      case 'WHILE': {
        const r = this.newResume(); this.resumeLabel(r);
        const c = this.expr();
        const Lend = `W$${r}`;
        out.push(['jifnot', c.ir, Lend]);
        this.loopStack.push({ kind: 'WHILE', r, Lend }); return;
      }
      case 'WEND': {
        const l = this.loopStack.pop();
        if (!l || l.kind !== 'WHILE') this.err('WEND without WHILE');
        this.budgetJump(l.r);
        out.push(['label', l.Lend]);
        return;
      }
      default:
        if (SKIPPED.has(t.v)) { while (!this.atEnd() && !this.isOp(':') && !this.isKw('ELSE')) this.next(); return; }
        if (IGNORED.has(t.v)) { // evaluate and discard any arguments
          while (!this.atEnd() && !this.isOp(':') && !this.isKw('ELSE')) { this.expr(); if (this.isOp(',') || this.isOp(';')) this.next(); }
          return;
        }
        this.err(`Unexpected ${t.v}`, t);
    }
  }
  budgetJump(idx) {
    this.out.push(set('__budget', op('-', v('__budget'), num(1))));
    this.out.push(iff(op('<=', v('__budget'), num(0)), [set('__pc', num(idx)), ret()]));
    this.jumpTo(idx);
  }
  assignment() {
    const t = this.next();
    if (t.t !== 'id') this.err('Expected variable', t);
    const name = t.v;
    const isStr = name.endsWith('$');
    if (this.isOp('(')) {
      if (!this.dims.has(name)) this.err(`${name} is not an array (use DIM first)`, t);
      this.next();
      const idx = [this.numExpr()];
      while (this.isOp(',')) { this.next(); idx.push(this.numExpr()); }
      this.expectOp(')');
      this.expectOp('=');
      const val = this.expr();
      if (val.type !== (isStr ? 's' : 'n')) this.err('Type mismatch in assignment');
      let target = v(varName(name));
      for (let k = 0; k < idx.length - 1; k++) target = m(target, idx[k]);
      this.out.push(setm(target, idx[idx.length - 1], val.ir));
      return;
    }
    this.expectOp('=');
    const val = this.expr();
    if (val.type !== (isStr ? 's' : 'n')) this.err(`Type mismatch: ${name} is ${isStr ? 'a string' : 'numeric'}`, t);
    this.out.push(set(this.declare(name), val.ir));
  }
  dim() {
    for (;;) {
      const t = this.next();
      if (!t || t.t !== 'id') this.err('Expected array name', t);
      this.expectOp('(');
      const ds = [this.numExpr()];
      while (this.isOp(',')) { this.next(); ds.push(this.numExpr()); }
      this.expectOp(')');
      this.dims.add(t.v);
      const key = this.declare(t.v);
      this.out.push(set(key, call('__dim', ['arr', ds], num(0), t.v.endsWith('$') ? str('') : num(0))));
      if (!this.isOp(',')) return;
      this.next();
    }
  }
  print() {
    const out = this.out;
    out.push(set('__tink', v('__ink')), set('__tpap', v('__pap')), set('__sbrt', v('__brt')));
    let needNl = true;
    while (!this.atEnd() && !this.isOp(':') && !this.isKw('ELSE')) {
      if (this.isOp(';')) { this.next(); needNl = false; continue; }
      if (this.isOp(',')) { this.next(); out.push(x(call('__comma'))); needNl = false; continue; }
      if (this.isOp("'")) { this.next(); out.push(x(call('__nl'))); needNl = true; continue; }
      needNl = true;
      if (this.isKw('AT')) { this.next(); const r = this.numExpr(); this.expectOp(','); const c = this.numExpr(); out.push(x(call('__pat', r, c))); continue; }
      if (this.isKw('TAB')) { this.next(); out.push(x(call('__tab', this.numExpr()))); continue; }
      if (this.colourItem(true)) continue;
      const e = this.expr();
      out.push(x(call('__pstr', e.type === 's' ? e.ir : call('__ns', e.ir))));
    }
    if (needNl) out.push(x(call('__nl')));
    out.push(set('__brt', v('__sbrt')));
  }
  colourItem(temp) {
    const t = this.peek();
    if (!t || t.t !== 'kw') return false;
    if (t.v === 'INK') { this.next(); this.out.push(set('__tink', this.numExpr())); }
    else if (t.v === 'PAPER') { this.next(); this.out.push(set('__tpap', this.numExpr())); }
    else if (t.v === 'BRIGHT') { this.next(); this.out.push(set('__brt', this.numExpr())); }
    else if (t.v === 'FLASH' || t.v === 'INVERSE' || t.v === 'OVER') { this.next(); this.numExpr(); }
    else return false;
    if (this.isOp(';') || this.isOp(',')) this.next();
    return true;
  }
  input() {
    const out = this.out;
    let prompt = '';
    for (;;) {
      if (this.atEnd() || this.isOp(':')) break;
      if (this.isOp(';') || this.isOp(',')) { this.next(); continue; }
      if (this.peek().t === 'str') { prompt += spectrumString(this.next().v); continue; }
      if (this.isKw('LINE')) this.next();
      const t = this.next();
      if (t.t !== 'id') this.err('Expected variable in INPUT', t);
      const key = this.declare(t.v);
      out.push(x(call('__inp', str(prompt), str(key), num(t.v.endsWith('$') ? 1 : 0))));
      this.yieldAt();
      prompt = '';
    }
  }
  ifStmt() {
    const c = this.expr();
    this.expectKw('THEN');
    const Lelse = `E$${this.line.idx}_${this.i}`, Lend = Lelse + 'x';
    this.out.push(['jifnot', c.ir, Lelse]);
    if (this.peek() && this.peek().t === 'num') this.gotoStmt(false); // IF x THEN 100
    else this.statements(true);
    if (this.isKw('ELSE')) {
      this.next();
      this.out.push(['jmp', Lend], ['label', Lelse]);
      if (this.peek() && this.peek().t === 'num') this.gotoStmt(false);
      else this.statements(true);
      this.out.push(['label', Lend]);
    } else this.out.push(['label', Lelse]);
  }
  gotoStmt(isSub) {
    const t = this.peek();
    if (t && t.t === 'num' && (this.peek(1) === undefined || this.isOp(':', 1) || this.isKw('ELSE', 1))) {
      this.next();
      const idx = this.targetFor(t.v);
      if (idx < 0) this.err(`Line ${t.v} not found`, t);
      if (isSub) { const r = this.newResume(); this.out.push(x(cm(v('__gs'), 'push', num(r)))); this.jumpToLineIdx(idx); this.resumeLabel(r); }
      else this.jumpToLineIdx(idx);
      return;
    }
    const e = this.numExpr(); // computed line number
    const out = this.out;
    if (isSub) { const r = this.newResume(); out.push(x(cm(v('__gs'), 'push', num(r)))); this.dynJump(e); this.resumeLabel(r); }
    else this.dynJump(e);
  }
  dynJump(e) {
    const out = this.out;
    out.push(set('__pc', m(v('__ln'), e)));
    out.push(iff(op('==', v('__pc'), ['undef']), [x(call('__err', str(this.report('N Line not found')))), ret()]));
    out.push(set('__budget', op('-', v('__budget'), num(1))), set('__again', num(1)), ret());
  }
  forStmt() {
    const t = this.next();
    if (!t || t.t !== 'id' || t.v.endsWith('$')) this.err('FOR needs a numeric variable', t);
    const key = this.declare(t.v);
    this.expectOp('=');
    const a = this.numExpr(); this.expectKw('TO'); const b = this.numExpr();
    let s = num(1);
    if (this.isKw('STEP')) { this.next(); s = this.numExpr(); }
    const to = '__fto_' + t.v, st = '__fst_' + t.v;
    this.vars.set(to, 'n'); this.vars.set(st, 'n');
    const r = this.newResume();
    const Lend = `F$${r}`;
    this.out.push(set(key, a), set(to, b), set(st, s));
    this.resumeLabel(r);
    // loop while (step >= 0 ? v <= to : v >= to)
    this.out.push(['jifnot', ['cond', op('>=', v(st), num(0)), op('<=', v(key), v(to)), op('>=', v(key), v(to))], Lend]);
    this.forStack.push({ name: t.v, key, r, Lend, to, st });
  }
  nextStmt() {
    const t = this.next();
    if (!t || t.t !== 'id') this.err('NEXT needs a variable', t);
    const f = this.forStack.pop();
    if (!f) this.err('NEXT without FOR', t);
    if (f.name !== t.v) this.err(`NEXT ${t.v} does not match FOR ${f.name}`, t);
    this.out.push(set(f.key, op('+', v(f.key), v(f.st))));
    this.budgetJump(f.r);
    this.out.push(['label', f.Lend]);
  }
  graphics(kind) {
    const out = this.out;
    out.push(set('__tink', v('__ink')), set('__tpap', v('__pap')), set('__sbrt', v('__brt')));
    while (this.colourItem(true));
    const args = [this.numExpr()];
    while (this.isOp(',')) { this.next(); args.push(this.numExpr()); }
    const need = { PLOT: 2, DRAW: 2, CIRCLE: 3, RECT: 4 }[kind];
    if (args.length < need) this.err(`${kind} needs ${need} arguments`);
    const f = { PLOT: '__plot', DRAW: '__draw', CIRCLE: '__circle', RECT: '__rectf' }[kind];
    out.push(x(call(f, ...args.slice(0, need))));
    out.push(set('__brt', v('__sbrt')));
  }

  // ---- expressions (return {ir, type}) ----
  numExpr() { const e = this.expr(); if (e.type !== 'n') this.err('Expected a number'); return e.ir; }
  strExpr() { const e = this.expr(); if (e.type !== 's') this.err('Expected a string'); return e.ir; }
  expr() { return this.orExpr(); }
  orExpr() {
    let l = this.andExpr();
    while (this.isKw('OR')) { this.next(); const r = this.andExpr(); l = N(['cond', r.ir, num(1), l.type === 's' ? ['tonum', l.ir] : l.ir]); }
    return l;
  }
  andExpr() {
    let l = this.notExpr();
    while (this.isKw('AND')) { this.next(); const r = this.notExpr(); l = { ir: ['cond', r.ir, l.ir, l.type === 's' ? str('') : num(0)], type: l.type }; }
    return l;
  }
  notExpr() {
    if (this.isKw('NOT')) { this.next(); const e = this.notExpr(); return N(['cond', e.ir, num(0), num(1)]); }
    return this.cmpExpr();
  }
  cmpExpr() {
    let l = this.addExpr();
    const ops = { '=': '==', '<>': '!=', '<': '<', '>': '>', '<=': '<=', '>=': '>=' };
    while (this.peek() && this.peek().t === 'op' && ops[this.peek().v]) {
      const o = ops[this.next().v];
      const r = this.addExpr();
      if (l.type !== r.type) this.err('Cannot compare a string with a number');
      l = N(['cond', op(o, l.ir, r.ir), num(1), num(0)]);
    }
    return l;
  }
  addExpr() {
    let l = this.mulExpr();
    while (this.isOp('+') || this.isOp('-')) {
      const o = this.next().v;
      const r = this.mulExpr();
      if (o === '-' && (l.type === 's' || r.type === 's')) this.err('Cannot subtract strings');
      if (l.type !== r.type) this.err('Cannot add a string to a number');
      l = { ir: op(o, l.ir, r.ir), type: l.type };
    }
    return l;
  }
  mulExpr() {
    let l = this.unary();
    while (this.isOp('*') || this.isOp('/')) {
      const o = this.next().v;
      const r = this.unary();
      if (l.type !== 'n' || r.type !== 'n') this.err('Arithmetic on a string');
      l = N(op(o, l.ir, r.ir));
    }
    return l;
  }
  unary() {
    if (this.isOp('-')) { this.next(); const e = this.unary(); if (e.type !== 'n') this.err('Cannot negate a string'); return N(op('-', num(0), e.ir)); }
    if (this.isOp('+')) { this.next(); return this.unary(); }
    return this.power();
  }
  power() {
    const b = this.atom();
    if (this.isOp('^')) { this.next(); const e = this.unary(); if (b.type !== 'n' || e.type !== 'n') this.err('Arithmetic on a string'); return N(math('pow', b.ir, e.ir)); }
    return b;
  }
  atom() {
    const t = this.next();
    if (!t) this.err('Unexpected end of line', this.toks[this.toks.length - 1]);
    if (t.t === 'num') return N(num(t.v));
    if (t.t === 'str') return Sx(str(spectrumString(t.v)));
    if (t.t === 'op' && t.v === '(') { const e = this.expr(); this.expectOp(')'); return e; }
    if (t.t === 'id') return this.variable(t);
    if (t.t === 'kw') return this.func(t);
    this.err('Nonsense in BASIC', t);
  }
  variable(t) {
    const name = t.v, isStr = name.endsWith('$');
    const key = this.declare(name);
    let e = { ir: v(key), type: isStr ? 's' : 'n' };
    if (this.isOp('(')) {
      this.next();
      if (this.dims.has(name)) {
        let ir = e.ir;
        ir = m(ir, this.numExpr());
        while (this.isOp(',')) { this.next(); ir = m(ir, this.numExpr()); }
        this.expectOp(')');
        e = { ir, type: e.type };
      } else if (isStr) e = this.slice(e);
      else this.err(`${name} is not an array (use DIM first)`, t);
    }
    if (e.type === 's' && this.isOp('(')) { this.next(); e = this.slice(e); } // slice of an array element
    return e;
  }
  // after '(' : a$(3), a$(2 TO 4), a$(TO 4), a$(2 TO)
  slice(e) {
    let from = null, to = null;
    if (!this.isKw('TO')) from = this.numExpr();
    if (this.isKw('TO')) {
      this.next();
      if (!this.isOp(')')) to = this.numExpr();
      this.expectOp(')');
      const f = from ? op('-', from, num(1)) : num(0);
      return Sx(to ? cm(e.ir, 'substring', f, to) : cm(e.ir, 'substring', f, m(e.ir, 'length')));
    }
    this.expectOp(')');
    return Sx(cm(e.ir, 'substr', op('-', from, num(1)), num(1)));
  }
  func(t) {
    const k = t.v;
    const arg = () => { if (this.isOp('(')) { this.next(); const e = this.expr(); this.expectOp(')'); return e; } return this.unary(); };
    const nArg = () => { const e = arg(); if (e.type !== 'n') this.err(`${k} needs a number`, t); return e.ir; };
    const sArg = () => { const e = arg(); if (e.type !== 's') this.err(`${k} needs a string`, t); return e.ir; };
    switch (k) {
      case 'RND': return N(math('random'));
      case 'PI': return N(num(Math.PI));
      case 'INKEY$': return Sx(call('__inkey'));
      case 'MOUSEX': return N(math('floor', ['cond', v('__mbTap'), v('__mbX'), m(v('scr'), '_xmouse')]));
      case 'MOUSEY': return N(op('-', num(175), math('floor', ['cond', v('__mbTap'), v('__mbY'), m(v('scr'), '_ymouse')])));
      case 'TICKS': return N(v('__t'));
      case 'MOUSEB': return N(v('__mb'));
      case 'INT': return N(math('floor', nArg()));
      case 'ASN': return N(math('asin', nArg()));
      case 'ACS': return N(math('acos', nArg()));
      case 'PEEK': nArg(); return N(num(0));
      case 'IN': nArg(); return N(num(255));
      case 'ATTR': { this.expectOp('('); this.numExpr(); this.expectOp(','); this.numExpr(); this.expectOp(')'); return N(num(56)); }
      case 'POINT': { this.expectOp('('); this.numExpr(); this.expectOp(','); this.numExpr(); this.expectOp(')'); return N(num(0)); }
      case 'SCREEN$': { this.expectOp('('); this.numExpr(); this.expectOp(','); this.numExpr(); this.expectOp(')'); return Sx(str('')); }
      case 'VAL$': return Sx(sArg());
      case 'BIN': { const d = this.next(); if (!d || d.t !== 'num') this.err('BIN needs binary digits', d); return N(num(parseInt(String(d.v), 2))); }
      case 'USR': { nArg(); return N(call('__usr', str(this.report('machine code (USR) cannot run here')))); }
      case 'FN': this.err('DEF FN / FN are not supported', t);
      case 'ABS': return N(math('abs', nArg()));
      case 'SGN': { const a = nArg(); return N(['cond', op('>', a, num(0)), num(1), ['cond', op('<', a, num(0)), num(-1), num(0)]]); }
      case 'SQR': return N(math('sqrt', nArg()));
      case 'SIN': return N(math('sin', nArg()));
      case 'COS': return N(math('cos', nArg()));
      case 'TAN': return N(math('tan', nArg()));
      case 'ATN': return N(math('atan', nArg()));
      case 'EXP': return N(math('exp', nArg()));
      case 'LN': return N(math('log', nArg()));
      case 'LEN': return N(m(sArg(), 'length'));
      case 'STR$': return Sx(call('__ns', nArg()));
      case 'VAL': return N(['tonum', sArg()]);
      case 'CHR$': return Sx(cm(v('String'), 'fromCharCode', nArg()));
      case 'CODE': return N(cm(sArg(), 'charCodeAt', num(0)));
      default: this.err(`Unexpected ${k}`, t);
    }
  }
}
