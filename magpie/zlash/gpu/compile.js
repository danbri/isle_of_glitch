// ZX GPU: compiles ZX Flash BASIC (see ../SPEC.md) to a JavaScript state machine.
// The whole program becomes one function holding a switch over resume points; variables are
// locals of the closure around it. GO TO and loops set pc and continue; HALT, PAUSE, BEEP and
// INPUT return 1 (yield to the next frame); a backward jump that finds the frame's time used up
// returns 2 (carry on next frame); the end of the program returns 0.

export class CompileError extends Error {
  constructor(msg, line, col) { super(msg); this.line = line; this.col = col; }
}

const KEYWORDS = new Set(('ABS ACS AND ASN AT ATN ATTR BEEP BIN BORDER BRIGHT CAT CHR$ CIRCLE CLEAR CLOSE CLS CODE ' +
  'CONTINUE COPY COS DATA DEF DIM DRAW ELSE EMOJI END ERASE EXP FLASH FN FOR FORMAT FX FXP GO GOSUB GOTO HALT IF IN ' +
  'INK INKEY$ INPUT INT INVERSE KEEP KEPT KEY LEN LET LINE LIST LLIST LN LOAD LOADER LPRINT MERGE MOUSEB MOUSEX MOUSEY ' +
  'MOVE NEW NEXT NOT OPEN OR OUT OVER PAPER PAUSE PEEK PI PLOT POINT POKE PRINT RANDOMISE RANDOMIZE READ RECT REM ' +
  'REPEAT RESTORE RETURN RND RUN SAVE SCREEN$ SGN SIN SPRITE SQR STEP STOP STR$ SUB TAB TAN THEN TICKS TO TONE UNTIL ' +
  'USR VAL VAL$ VERIFY WEND WHILE WRAP').split(' '));
const IGNORED = new Set(['FLASH', 'INVERSE', 'OVER', 'POKE', 'CLEAR', 'RANDOMIZE', 'RANDOMISE', 'NEW', 'LIST', 'OUT']);
const SKIPPED = new Set(['LOAD', 'SAVE', 'VERIFY', 'MERGE', 'CAT', 'FORMAT', 'MOVE', 'ERASE', 'OPEN', 'CLOSE', 'LPRINT', 'LLIST', 'COPY', 'CONTINUE', 'DEF']);
const FX_METHODS = new Set(['lineStyle', 'lineGradientStyle', 'moveTo', 'lineTo', 'curveTo', 'beginFill', 'beginGradientFill', 'beginBitmapFill', 'endFill', 'clear', 'chequer']);
const BUDGET = 4000;

// string literals become machine characters (SPEC 2, 10.6)
const BLOCKS = { '©': 127, '£': 96, '▝': 129, '▘': 130, '▀': 131, '▗': 132, '▐': 133, '▚': 134, '▜': 135, '▖': 136, '▞': 137, '▌': 138, '▛': 139, '▄': 140, '▟': 141, '▙': 142, '█': 143 };
export function machineString(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    out += BLOCKS[ch] !== undefined ? String.fromCharCode(BLOCKS[ch]) : (c < 32 || c > 164 ? '?' : ch);
  }
  return out;
}

function lex(text, src) {
  const toks = [];
  let i = 0;
  const fail = (m) => { throw new CompileError(m, src, i + 1); };
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
    const col = i + 1;
    if (ch === '"') {
      let s = ''; i++;
      for (;;) {
        if (i >= text.length) fail('Unterminated string');
        if (text[i] === '"') { if (text[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; }
        s += text[i++];
      }
      toks.push({ t: 'str', v: s, col }); continue;
    }
    if (ch === '#' || (ch === '0' && /[xX]/.test(text[i + 1] || ''))) {
      i += ch === '#' ? 1 : 2;
      const s = i; while (i < text.length && /[0-9a-fA-F]/.test(text[i])) i++;
      if (i === s) fail('Bad hex number');
      toks.push({ t: 'num', v: parseInt(text.slice(s, i), 16), col }); continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[i + 1] || ''))) {
      const mm = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(text.slice(i));
      i += mm[0].length;
      toks.push({ t: 'num', v: parseFloat(mm[0]), raw: mm[0], col }); continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const s = i; while (i < text.length && /[A-Za-z0-9_]/.test(text[i])) i++;
      if (text[i] === '$') i++;
      const word = text.slice(s, i), up = word.toUpperCase();
      if (up === 'GO') {
        const m = /^\s*(TO|SUB)\b/i.exec(text.slice(i));
        if (m) { i += m[0].length; toks.push({ t: 'kw', v: 'GO' + m[1].toUpperCase(), col }); continue; }
      }
      if (KEYWORDS.has(up)) {
        toks.push({ t: 'kw', v: up, col });
        if (up === 'REM') return toks;
      } else toks.push({ t: 'id', v: word.toLowerCase(), col });
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') { toks.push({ t: 'op', v: two, col }); i += 2; continue; }
    if ('+-*/^=<>(),;:\''.includes(ch)) { toks.push({ t: 'op', v: ch, col }); i++; continue; }
    fail(`Unexpected character '${ch}'`);
  }
  return toks;
}

const jsName = (name) => (name.endsWith('$') ? 's_' + name.slice(0, -1) : 'n_' + name);

export function compile(source) {
  const lines = [];
  let last = 0;
  source.split('\n').forEach((raw, k) => {
    if (!raw.trim()) return;
    const m = /^\s*(\d+)\s?/.exec(raw);
    let n, text = raw;
    if (m) { n = parseInt(m[1], 10); text = raw.slice(m[0].length); } else n = last + 10;
    if (n <= last && lines.length) throw new CompileError(`Line number ${n} out of order`, k + 1, 1);
    last = n;
    lines.push({ n, text, src: k + 1, idx: lines.length });
  });

  const names = new Set();     // every variable mentioned
  const dims = new Set();      // names given a DIM before this point in the text
  const forVars = new Set();
  const data = [], dataAt = [];
  const sprites = {}, emojis = {};
  let nextLabel = lines.length + 1;
  const END = lines.length;     // label after the last line
  const label = () => nextLabel++;
  const code = [];
  const forStack = [], loopStack = [];
  const firstAtOrAfter = (n) => { for (const l of lines) if (l.n >= n) return l.idx; return -1; };

  for (const line of lines) {
    code.push(`case ${line.idx}:`);
    const P = new LineCompiler(lex(line.text, line.src), line, {
      names, dims, forVars, data, dataAt, sprites, emojis, label, code, forStack, loopStack, firstAtOrAfter,
      nextLineLabel: line.idx + 1 < lines.length ? line.idx + 1 : END,
    });
    P.statements(false);
  }
  if (forStack.length) throw new CompileError(`FOR ${forStack.at(-1).name} without NEXT`, lines.at(-1)?.src || 1, 1);
  if (loopStack.length) throw new CompileError(`${loopStack.at(-1).kind} without ${loopStack.at(-1).kind === 'REPEAT' ? 'UNTIL' : 'WEND'}`, lines.at(-1)?.src || 1, 1);

  const decls = [...names].map(n => `${jsName(n)}=${n.endsWith('$') ? '""' : '0'}`);
  for (const f of forVars) decls.push(`ft_${f}=0`, `fs_${f}=0`);
  const lineTable = '{' + lines.map(l => `${l.n}:${l.idx}`).join(',') + '}';
  const lastWhere = lines.length ? `"0 OK, ${lines.at(-1).n}:1"` : '"0 OK"';
  const js = `"use strict";
const EA = [], LN = ${lineTable};
const STR = (x) => typeof x === "string" ? x : "";
const SGN = (x) => x > 0 ? 1 : x < 0 ? -1 : 0;
let ${decls.length ? decls.join(', ') + ',' : ''} pc = 0, bud = ${BUDGET};
const gs = [];
function run() {
  bud = ${BUDGET};
  try {
    for (;;) switch (pc) {
${code.map(l => '      ' + l).join('\n')}
      case ${END}: R.report(${lastWhere}); return 0;
      default: R.report("program fault: no resume point " + pc); return 0;
    }
  } catch (e) { if (e === R.STOP) return 0; throw e; }
}
function peek(name) { switch (name) { ${[...names].map(n => `case ${JSON.stringify(n)}: return ${jsName(n)};`).join(' ')} } }
return { run, peek };`;
  const dataLines = dataAt.sort((a, b) => a[0] - b[0]);
  return { js, data, dataLines, sprites, emojis, lines: lines.length, lineNumbers: lines.map(l => l.n) };
}

// instantiate a compiled program against a machine (R)
export function instantiate(compiled, R) {
  return new Function('R', compiled.js)(R);
}

class LineCompiler {
  constructor(toks, line, ctx) { this.toks = toks; this.i = 0; this.line = line; this.stmt = 1; Object.assign(this, ctx); }
  fail(msg, tok) { const t = tok || this.peek() || this.toks.at(-1); throw new CompileError(msg, this.line.src, t ? t.col : 1); }
  peek(o = 0) { return this.toks[this.i + o]; }
  next() { return this.toks[this.i++]; }
  atEnd() { return this.i >= this.toks.length; }
  isKw(k, o = 0) { const t = this.peek(o); return !!t && t.t === 'kw' && t.v === k; }
  isOp(k, o = 0) { const t = this.peek(o); return !!t && t.t === 'op' && t.v === k; }
  endOfStmt() { return this.atEnd() || this.isOp(':') || this.isKw('ELSE'); }
  expectKw(k) { if (!this.isKw(k)) this.fail(`Expected ${k}`); return this.next(); }
  expectOp(k) { if (!this.isOp(k)) this.fail(`Expected '${k}'`); return this.next(); }
  emit(s) { this.code.push(s); }
  where() { return `"${this.line.n}:${this.stmt}"`; }
  use(name) { this.names.add(name); return jsName(name); }
  // a jump: forward ones go straight there; backward ones spend the frame's budget first
  jump(target, backward) {
    if (!backward) return `pc=${target};continue;`;
    return `if(--bud<0){bud=${BUDGET};if(R.over()){pc=${target};return 2;}}pc=${target};continue;`;
  }
  jumpLine(idx) { return this.jump(idx, idx <= this.line.idx); }
  yieldHere() { const r = this.label(); this.emit(`pc=${r};return 1;`); this.emit(`case ${r}:`); }

  statements(stopAtElse) {
    for (;;) {
      if (this.atEnd()) return;
      if (stopAtElse && this.isKw('ELSE')) return;
      if (this.isOp(':')) { this.next(); continue; }
      this.statement();
      this.stmt++;
      if (this.atEnd()) return;
      if (stopAtElse && this.isKw('ELSE')) return;
      if (!this.isOp(':')) this.fail('Expected end of statement');
    }
  }

  statement() {
    const t = this.peek();
    if (t.t === 'id') return this.assignment();
    if (t.t !== 'kw') this.fail('Nonsense in BASIC');
    this.next();
    switch (t.v) {
      case 'REM': this.i = this.toks.length; return;
      case 'LET': return this.assignment();
      case 'PRINT': return this.print();
      case 'INPUT': return this.input();
      case 'IF': return this.ifStmt();
      case 'FOR': return this.forStmt();
      case 'NEXT': return this.nextStmt();
      case 'GOTO': case 'GOSUB': return this.goStmt(t.v === 'GOSUB');
      case 'RETURN': this.emit(`pc=gs.pop();if(pc===undefined)R.fail("7 RETURN without GOSUB, "+${this.where()});continue;`); return;
      case 'STOP': this.emit(`R.report("9 STOP statement, "+${this.where()});return 0;`); return;
      case 'END': this.emit(`R.report("0 OK, "+${this.where()});return 0;`); return;
      case 'RUN': this.emit(`R.cls();${this.jump(0, true)}`); return;
      case 'CLS': this.emit('R.cls();'); return;
      case 'LOADER': { const n = this.endOfStmt() ? '""' : this.str(); this.emit(`R.loader(${n});return 0;`); return; }
      case 'INK': this.emit(`R.ink=${this.num()};`); return;
      case 'PAPER': this.emit(`R.pap=${this.num()};`); return;
      case 'BRIGHT': this.emit(`R.brt=${this.num()};`); return;
      case 'BORDER': this.emit(`R.border(${this.num()});`); return;
      case 'WRAP': this.emit(`R.wrap=${this.num()};`); return;
      case 'PLOT': case 'DRAW': case 'CIRCLE': case 'RECT': return this.graphics(t.v);
      case 'KEEP': { const n = this.str(); this.expectOp(','); this.emit(`R.keep(${n},${this.num()});`); return; }
      case 'HALT': this.yieldHere(); return;
      case 'PAUSE': this.emit(`R.pause(${this.num()});`); this.yieldHere(); return;
      case 'BEEP': { const d = this.num(); this.expectOp(','); this.emit(`R.beep(${d},${this.num()});`); this.yieldHere(); return; }
      case 'TONE': {
        const p = this.num();
        if (this.isOp(',')) { this.next(); this.emit(`R.tone(${p},${this.num()});`); this.yieldHere(); } else this.emit(`R.tone(${p});`);
        return;
      }
      case 'DIM': return this.dim();
      case 'SPRITE': return this.sprite();
      case 'EMOJI': {
        const e = this.next(); if (!e || e.t !== 'str') this.fail('EMOJI needs a quoted emoji', e);
        this.expectOp(',');
        const n = this.next(); if (!n || n.t !== 'str') this.fail('EMOJI needs a quoted sprite name', n);
        let size = 48;
        if (this.isOp(',')) { this.next(); const s = this.next(); if (!s || s.t !== 'num') this.fail('EMOJI size must be a number', s); size = Math.max(8, Math.min(256, s.v)); }
        this.emojis[n.v] = { text: e.v, size };
        return;
      }
      case 'FX': {
        const n = this.next(); if (!n || n.t !== 'str') this.fail('FX needs a quoted method name', n);
        if (!FX_METHODS.has(n.v)) this.fail(`FX can only call the drawing methods ${[...FX_METHODS].join(', ')}`, n);
        const args = [];
        while (this.isOp(',')) { this.next(); args.push(this.expr().js); }
        this.emit(`R.fx.${n.v}(${args.join(',')});`);
        return;
      }
      case 'FXP': {
        const n = this.next(); if (!n || n.t !== 'str') this.fail('FXP needs a quoted property name', n);
        this.expectOp(',');
        this.emit(`R.fxp(${JSON.stringify(n.v)},${this.expr().js});`);
        return;
      }
      case 'DATA': {
        this.dataAt.push([this.line.n, this.data.length]);
        for (;;) {
          let neg = false;
          if (this.isOp('-')) { this.next(); neg = true; }
          const d = this.next();
          if (!d || (d.t !== 'num' && d.t !== 'str')) this.fail('DATA items must be numbers or quoted strings', d);
          this.data.push(d.t === 'num' ? (neg ? -d.v : d.v) : machineString(d.v));
          if (!this.isOp(',')) return;
          this.next();
        }
      }
      case 'READ': {
        for (;;) {
          const t2 = this.next(); if (!t2 || t2.t !== 'id') this.fail('READ needs a variable', t2);
          if (this.isOp('(')) { const tgt = this.element(t2); this.emit(`${tgt}=R.read(${this.where()});`); }
          else this.emit(`${this.use(t2.v)}=R.read(${this.where()});`);
          if (!this.isOp(',')) return;
          this.next();
        }
      }
      case 'RESTORE': {
        if (!this.endOfStmt()) { const n = this.next(); if (n.t !== 'num') this.fail('RESTORE needs a line number', n); this.emit(`R.restore(${n.v});`); }
        else this.emit('R.restore(-1);');
        return;
      }
      case 'REPEAT': { const r = this.label(); this.emit(`case ${r}:`); this.loopStack.push({ kind: 'REPEAT', r }); return; }
      case 'UNTIL': {
        const l = this.loopStack.pop(); if (!l || l.kind !== 'REPEAT') this.fail('UNTIL without REPEAT');
        this.emit(`if(!(${this.expr().js})){${this.jump(l.r, true)}}`);
        return;
      }
      case 'WHILE': {
        const r = this.label(), end = this.label();
        this.emit(`case ${r}:`);
        this.emit(`if(!(${this.expr().js})){pc=${end};continue;}`);
        this.loopStack.push({ kind: 'WHILE', r, end });
        return;
      }
      case 'WEND': {
        const l = this.loopStack.pop(); if (!l || l.kind !== 'WHILE') this.fail('WEND without WHILE');
        this.emit(this.jump(l.r, true));
        this.emit(`case ${l.end}:`);
        return;
      }
      default:
        if (SKIPPED.has(t.v)) { while (!this.endOfStmt()) this.next(); return; }
        if (IGNORED.has(t.v)) {
          while (!this.endOfStmt()) { this.emit(`void (${this.expr().js});`); if (this.isOp(',') || this.isOp(';')) this.next(); }
          return;
        }
        this.fail(`Unexpected ${t.v}`, t);
    }
  }

  assignment() {
    const t = this.next(); if (t.t !== 'id') this.fail('Expected variable', t);
    const isStr = t.v.endsWith('$');
    let target;
    if (this.isOp('(')) target = this.element(t, true);
    else target = this.use(t.v);
    this.expectOp('=');
    const e = this.expr();
    if (e.type !== (isStr ? 's' : 'n')) this.fail(`Type mismatch: ${t.v} is ${isStr ? 'a string' : 'numeric'}`, t);
    this.emit(`${target}=${e.js};`);
  }
  // an array element as an assignment target (missing rows are made, so writes never crash)
  element(t) {
    if (!this.dims.has(t.v)) this.fail(`${t.v} is not an array (use DIM first)`, t);
    this.expectOp('(');
    const idx = [this.num()];
    while (this.isOp(',')) { this.next(); idx.push(this.num()); }
    this.expectOp(')');
    let s = this.use(t.v);
    for (let k = 0; k < idx.length - 1; k++) s = `(${s}[${idx[k]}]??=[])`;
    return `${s}[${idx.at(-1)}]`;
  }
  dim() {
    for (;;) {
      const t = this.next(); if (!t || t.t !== 'id') this.fail('Expected array name', t);
      this.expectOp('(');
      const ds = [this.num()];
      while (this.isOp(',')) { this.next(); ds.push(this.num()); }
      this.expectOp(')');
      this.dims.add(t.v);
      this.emit(`${this.use(t.v)}=R.dim([${ds.join(',')}],${t.v.endsWith('$') ? '""' : '0'});`);
      if (!this.isOp(',')) return;
      this.next();
    }
  }
  sprite() {
    if (this.isKw('CLEAR')) { this.next(); this.emit('R.sprclr();'); return; }
    const t0 = this.peek(), t1 = this.peek(1), t2 = this.peek(2);
    if (t0 && t0.t === 'str' && t1 && t1.t === 'op' && t1.v === ',' && t2 && t2.t === 'str') {
      const name = this.next().v;
      const rows = this.sprites[name] || (this.sprites[name] = []);
      while (this.isOp(',')) { this.next(); const r = this.next(); if (!r || r.t !== 'str') this.fail('SPRITE rows must be quoted strings', r); rows.push(r.v); }
      return;
    }
    const name = this.str(); this.expectOp(',');
    const x = this.num(); this.expectOp(',');
    const y = this.num();
    const extra = ['100', null, '0', '100'];
    for (let k = 0; k < 4 && this.isOp(','); k++) { this.next(); extra[k] = this.num(); }
    if (extra[1] === null) extra[1] = extra[0];
    this.emit(`R.spr(${name},${x},${y},${extra.join(',')});`);
  }
  print() {
    this.emit('R.pbegin();');
    let nl = true;
    while (!this.endOfStmt()) {
      if (this.isOp(';')) { this.next(); nl = false; continue; }
      if (this.isOp(',')) { this.next(); this.emit('R.comma();'); nl = false; continue; }
      if (this.isOp("'")) { this.next(); this.emit('R.nl();'); nl = true; continue; }
      nl = true;
      if (this.isKw('AT')) { this.next(); const r = this.num(); this.expectOp(','); this.emit(`R.at(${r},${this.num()});`); continue; }
      if (this.isKw('TAB')) { this.next(); this.emit(`R.tab(${this.num()});`); continue; }
      if (this.colourItem()) continue;
      const e = this.expr();
      this.emit(e.type === 's' ? `R.pstr(${e.js});` : `R.pstr(R.ns(${e.js}));`);
    }
    this.emit(`R.pend(${nl ? 1 : 0});`);
  }
  colourItem() {
    const t = this.peek();
    if (!t || t.t !== 'kw') return false;
    if (t.v === 'INK') { this.next(); this.emit(`R.tink=${this.num()};`); }
    else if (t.v === 'PAPER') { this.next(); this.emit(`R.tpap=${this.num()};`); }
    else if (t.v === 'BRIGHT') { this.next(); this.emit(`R.brt=${this.num()};`); }
    else if (t.v === 'FLASH' || t.v === 'INVERSE' || t.v === 'OVER') { this.next(); this.emit(`void (${this.num()});`); }
    else return false;
    if (this.isOp(';') || this.isOp(',')) this.next();
    return true;
  }
  graphics(kind) {
    this.emit('R.pbegin();');
    while (this.colourItem());
    const args = [this.num()];
    while (this.isOp(',')) { this.next(); args.push(this.num()); }
    const need = { PLOT: 2, DRAW: 2, CIRCLE: 3, RECT: 4 }[kind];
    if (args.length < need) this.fail(`${kind} needs ${need} arguments`);
    this.emit(`R.${kind.toLowerCase()}(${args.slice(0, need).join(',')});R.gend();`);
  }
  input() {
    let prompt = '';
    for (;;) {
      if (this.atEnd() || this.isOp(':')) break;
      if (this.isOp(';') || this.isOp(',')) { this.next(); continue; }
      if (this.peek().t === 'str') { prompt += machineString(this.next().v); continue; }
      if (this.isKw('LINE')) this.next();
      const t = this.next(); if (!t || t.t !== 'id') this.fail('Expected variable in INPUT', t);
      const v = this.use(t.v);
      this.emit(`R.input(${JSON.stringify(prompt)},${t.v.endsWith('$') ? 1 : 0},(x)=>{${v}=x;});`);
      this.yieldHere();
      prompt = '';
    }
  }
  ifStmt() {
    const c = this.expr();
    this.expectKw('THEN');
    const els = this.label();
    this.emit(`if(!(${c.js})){pc=${els};continue;}`);
    if (this.peek() && this.peek().t === 'num') this.goStmt(false); else this.statements(true);
    if (this.isKw('ELSE')) {
      this.next();
      const end = this.label();
      this.emit(`pc=${end};continue;`);
      this.emit(`case ${els}:`);
      if (this.peek() && this.peek().t === 'num') this.goStmt(false); else this.statements(true);
      this.emit(`case ${end}:`);
    } else {
      // no ELSE: a false IF skips the rest of the line, which is exactly where els is
      this.emit(`case ${els}:`);
    }
  }
  goStmt(isSub) {
    const t = this.peek();
    let jump;
    if (t && t.t === 'num' && (this.peek(1) === undefined || this.isOp(':', 1) || this.isKw('ELSE', 1))) {
      this.next();
      const idx = this.firstAtOrAfter(t.v);
      if (idx < 0) this.fail(`Line ${t.v} not found`, t);
      jump = this.jumpLine(idx);
    } else {
      const e = this.num();
      jump = `{const t_=LN[${e}];if(t_===undefined)R.fail("N Line not found, "+${this.where()});${this.jump('t_', true)}}`;
    }
    if (isSub) { const r = this.label(); this.emit(`gs.push(${r});${jump}`); this.emit(`case ${r}:`); }
    else this.emit(jump);
  }
  forStmt() {
    const t = this.next(); if (!t || t.t !== 'id' || t.v.endsWith('$')) this.fail('FOR needs a numeric variable', t);
    const v = this.use(t.v);
    this.expectOp('=');
    const a = this.num(); this.expectKw('TO'); const b = this.num();
    let s = '1';
    if (this.isKw('STEP')) { this.next(); s = this.num(); }
    this.forVars.add(t.v);
    const head = this.label(), end = this.label();
    this.emit(`${v}=${a};ft_${t.v}=${b};fs_${t.v}=${s};`);
    this.emit(`case ${head}:`);
    this.emit(`if(!(fs_${t.v}>=0?${v}<=ft_${t.v}:${v}>=ft_${t.v})){pc=${end};continue;}`);
    this.forStack.push({ name: t.v, head, end });
  }
  nextStmt() {
    const t = this.next(); if (!t || t.t !== 'id') this.fail('NEXT needs a variable', t);
    const f = this.forStack.pop();
    if (!f) this.fail('NEXT without FOR', t);
    if (f.name !== t.v) this.fail(`NEXT ${t.v} does not match FOR ${f.name}`, t);
    this.emit(`${jsName(t.v)}+=fs_${t.v};${this.jump(f.head, true)}`);
    this.emit(`case ${f.end}:`);
  }

  // ---- expressions: {js, type} ----
  num() { const e = this.expr(); if (e.type !== 'n') this.fail('Expected a number'); return e.js; }
  str() { const e = this.expr(); if (e.type !== 's') this.fail('Expected a string'); return e.js; }
  expr() { return this.orExpr(); }
  orExpr() {
    let l = this.andExpr();
    while (this.isKw('OR')) { this.next(); const r = this.andExpr(); l = { js: `((${r.js})?1:${l.type === 's' ? `+(${l.js})` : `(${l.js})`})`, type: 'n' }; }
    return l;
  }
  andExpr() {
    let l = this.notExpr();
    while (this.isKw('AND')) { this.next(); const r = this.notExpr(); l = { js: `((${r.js})?(${l.js}):${l.type === 's' ? '""' : '0'})`, type: l.type }; }
    return l;
  }
  notExpr() {
    if (this.isKw('NOT')) { this.next(); const e = this.notExpr(); return { js: `((${e.js})?0:1)`, type: 'n' }; }
    return this.cmpExpr();
  }
  cmpExpr() {
    let l = this.addExpr();
    const ops = { '=': '===', '<>': '!==', '<': '<', '>': '>', '<=': '<=', '>=': '>=' };
    while (this.peek() && this.peek().t === 'op' && ops[this.peek().v]) {
      const o = ops[this.next().v];
      const r = this.addExpr();
      if (l.type !== r.type) this.fail('Cannot compare a string with a number');
      l = { js: `((${l.js})${o}(${r.js})?1:0)`, type: 'n' };
    }
    return l;
  }
  addExpr() {
    let l = this.mulExpr();
    while (this.isOp('+') || this.isOp('-')) {
      const o = this.next().v;
      const r = this.mulExpr();
      if (o === '-' && (l.type === 's' || r.type === 's')) this.fail('Cannot subtract strings');
      if (l.type !== r.type) this.fail('Cannot add a string to a number');
      l = { js: `(${l.js}${o}${r.js})`, type: l.type };
    }
    return l;
  }
  mulExpr() {
    let l = this.unary();
    while (this.isOp('*') || this.isOp('/')) {
      const o = this.next().v;
      const r = this.unary();
      if (l.type !== 'n' || r.type !== 'n') this.fail('Arithmetic on a string');
      l = { js: `(${l.js}${o}${r.js})`, type: 'n' };
    }
    return l;
  }
  unary() {
    if (this.isOp('-')) { this.next(); const e = this.unary(); if (e.type !== 'n') this.fail('Cannot negate a string'); return { js: `(-${e.js})`, type: 'n' }; }
    if (this.isOp('+')) { this.next(); return this.unary(); }
    return this.power();
  }
  power() {
    const b = this.atom();
    if (this.isOp('^')) { this.next(); const e = this.unary(); if (b.type !== 'n' || e.type !== 'n') this.fail('Arithmetic on a string'); return { js: `Math.pow(${b.js},${e.js})`, type: 'n' }; }
    return b;
  }
  atom() {
    const t = this.next();
    if (!t) this.fail('Unexpected end of line');
    if (t.t === 'num') return { js: String(t.v), type: 'n' };
    if (t.t === 'str') return { js: JSON.stringify(machineString(t.v)), type: 's' };
    if (t.t === 'op' && t.v === '(') { const e = this.expr(); this.expectOp(')'); return e; }
    if (t.t === 'id') return this.variable(t);
    if (t.t === 'kw') return this.func(t);
    this.fail('Nonsense in BASIC', t);
  }
  variable(t) {
    const name = t.v, isStr = name.endsWith('$');
    const v = this.use(name);
    let e = { js: v, type: isStr ? 's' : 'n' };
    if (this.isOp('(')) {
      if (this.dims.has(name)) {
        this.next();
        const idx = [this.num()];
        while (this.isOp(',')) { this.next(); idx.push(this.num()); }
        this.expectOp(')');
        let s = v;
        for (let k = 0; k < idx.length - 1; k++) s = `(${s}[${idx[k]}]??EA)`;
        s = `${s}[${idx.at(-1)}]`;
        e = isStr ? { js: `STR(${s})`, type: 's' } : { js: `(${s}??0)`, type: 'n' };
      } else if (isStr) { this.next(); e = this.slice(e); }
      else this.fail(`${name} is not an array (use DIM first)`, t);
    }
    if (e.type === 's' && this.isOp('(')) { this.next(); e = this.slice(e); }
    return e;
  }
  // after '(' : s$(3), s$(2 TO 4), s$(TO 4), s$(2 TO)
  slice(e) {
    let from = '1', to = null;
    if (!this.isKw('TO')) from = this.num();
    if (this.isKw('TO')) {
      this.next();
      if (!this.isOp(')')) to = this.num();
      this.expectOp(')');
      return { js: `R.slice(${e.js},${from},${to === null ? 'Infinity' : to})`, type: 's' };
    }
    this.expectOp(')');
    return { js: `R.slice(${e.js},${from},${from})`, type: 's' };
  }
  func(t) {
    const k = t.v;
    const arg = () => { if (this.isOp('(')) { this.next(); const e = this.expr(); this.expectOp(')'); return e; } return this.unary(); };
    const n = () => { const e = arg(); if (e.type !== 'n') this.fail(`${k} needs a number`, t); return e.js; };
    const s = () => { const e = arg(); if (e.type !== 's') this.fail(`${k} needs a string`, t); return e.js; };
    const N = (js) => ({ js, type: 'n' }), S = (js) => ({ js, type: 's' });
    const pair = () => { this.expectOp('('); const a = this.num(); this.expectOp(','); const b = this.num(); this.expectOp(')'); return `(void ${a},void ${b})`; };
    switch (k) {
      case 'RND': return N('Math.random()');
      case 'PI': return N(String(Math.PI));
      case 'INKEY$': return S('R.inkey()');
      case 'MOUSEX': return N('R.mousex()');
      case 'MOUSEY': return N('R.mousey()');
      case 'MOUSEB': return N('R.mb');
      case 'TICKS': return N('R.t');
      case 'KEPT': return N(`R.kept(${s()})`);
      case 'KEY': return N(`R.key(${s()})`);
      case 'INT': return N(`Math.floor(${n()})`);
      case 'ABS': return N(`Math.abs(${n()})`);
      case 'SGN': return N(`SGN(${n()})`);
      case 'SQR': return N(`Math.sqrt(${n()})`);
      case 'SIN': return N(`Math.sin(${n()})`);
      case 'COS': return N(`Math.cos(${n()})`);
      case 'TAN': return N(`Math.tan(${n()})`);
      case 'ATN': return N(`Math.atan(${n()})`);
      case 'ASN': return N(`Math.asin(${n()})`);
      case 'ACS': return N(`Math.acos(${n()})`);
      case 'EXP': return N(`Math.exp(${n()})`);
      case 'LN': return N(`Math.log(${n()})`);
      case 'PEEK': return N(`R.peek(${n()})`);
      case 'IN': return N(`(void ${n()},255)`);
      case 'ATTR': return N(`(${pair()},56)`);
      case 'POINT': return N(`(${pair()},0)`);
      case 'SCREEN$': return S(`(${pair()},"")`);
      case 'LEN': return N(`(${s()}).length`);
      case 'STR$': return S(`R.ns(${n()})`);
      case 'VAL': return N(`R.val(${s()})`);
      case 'VAL$': return S(s());
      case 'CHR$': return S(`String.fromCharCode(${n()})`);
      case 'CODE': return N(`(${s()}).charCodeAt(0)`);
      case 'BIN': { const d = this.next(); if (!d || d.t !== 'num') this.fail('BIN needs binary digits', d); return N(String(parseInt(d.raw ?? String(d.v), 2))); }
      case 'USR': { const a = n(); return N(`(void ${a},R.fail("machine code (USR) cannot run here, "+${this.where()}))`); }
      case 'FN': this.fail('DEF FN / FN are not supported', t);
      default: this.fail(`Unexpected ${k}`, t);
    }
  }
}
