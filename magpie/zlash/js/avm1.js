// AVM1 (ActionScript 1/2 bytecode) assembler plus a tiny tree IR so the
// runtime and the BASIC compiler don't have to think in opcodes.
import { ByteWriter } from './swf.js?v=mvm7zhkz';

export const OP = {
  End: 0x00, NextFrame: 0x04, Stop: 0x07, Pop: 0x17, Subtract: 0x0b, Multiply: 0x0c, Divide: 0x0d,
  And: 0x10, Or: 0x11, Not: 0x12, StringAdd: 0x21, GetVariable: 0x1c, SetVariable: 0x1d,
  Trace: 0x26, Return: 0x3e, Modulo: 0x3f, NewObject: 0x40, InitArray: 0x42, InitObject: 0x43,
  TypeOf: 0x44, Add2: 0x47, Less2: 0x48, Equals2: 0x49, ToNumber: 0x4a, ToString: 0x4b,
  PushDuplicate: 0x4c, GetMember: 0x4e, SetMember: 0x4f, Increment: 0x50, Decrement: 0x51,
  CallMethod: 0x52, NewMethod: 0x53, CallFunction: 0x3d, DefineLocal: 0x3c, DefineLocal2: 0x41, Delete: 0x3a,
  Greater: 0x67, StrictEquals: 0x66, StringLength: 0x14, StringExtract: 0x15,
  Push: 0x96, Jump: 0x99, GetURL2: 0x9a, If: 0x9d, DefineFunction: 0x9b, StoreRegister: 0x87, ConstantPool: 0x88,
};

export class Asm {
  constructor(w) { this.w = w || new ByteWriter(); this.labels = new Map(); this.fixups = []; this.uid = 0; }
  op(code) { this.w.u8(code); return this; }
  push(...items) {
    const b = new ByteWriter();
    for (const it of items) {
      if (typeof it === 'string') { b.u8(0); b.str(it); }
      else if (typeof it === 'boolean') { b.u8(5); b.u8(it ? 1 : 0); }
      else if (it === null) b.u8(2);
      else if (it === undefined) b.u8(3);
      else if (typeof it === 'number') {
        if (Number.isInteger(it) && it >= -2147483648 && it <= 2147483647) { b.u8(7); b.i32(it); }
        else { b.u8(6); b.f64swapped(it); }
      } else if (it && it.reg !== undefined) { b.u8(4); b.u8(it.reg); }
      else throw new Error('bad push item ' + it);
    }
    const body = b.finish();
    this.w.u8(OP.Push).u16(body.length).bytes(body);
    return this;
  }
  label(name) { if (this.labels.has(name)) throw new Error('duplicate label ' + name); this.labels.set(name, this.w.position); return this; }
  newLabel(prefix = 'L') { return `${prefix}$${this.uid++}`; }
  _branch(opc, label) {
    this.w.u8(opc).u16(2);
    const pos = this.w.position; this.w.i16(0);
    this.fixups.push({ pos, label, end: pos + 2 });
    return this;
  }
  jump(label) { return this._branch(OP.Jump, label); }
  jif(label) { return this._branch(OP.If, label); }
  // DefineFunction: header then body assembled into the same writer.
  defineFunction(name, params, bodyFn) {
    const hdr = new ByteWriter(); hdr.str(name); hdr.u16(params.length);
    for (const p of params) hdr.str(p);
    const hb = hdr.finish();
    this.w.u8(OP.DefineFunction).u16(hb.length + 2).bytes(hb);
    const sizePos = this.w.position; this.w.u16(0);
    const start = this.w.position;
    bodyFn();
    const size = this.w.position - start;
    if (size > 65535) { const e = new Error('Program too large for one AVM1 function (' + size + ' bytes)'); e.tooLarge = name; throw e; }
    this.w.patchU16(sizePos, size);
    return this;
  }
  resolve() {
    for (const f of this.fixups) {
      const target = this.labels.get(f.label);
      if (target === undefined) throw new Error('undefined label ' + f.label);
      const off = target - f.end;
      if (off < -32768 || off > 32767) { const e = new Error('branch out of range: ' + f.label); e.farLabel = f.label; throw e; }
      this.w.patchU16(f.pos, off & 0xffff);
    }
    this.fixups = [];
  }
  finish() { this.resolve(); this.w.u8(OP.End); return this.w.finish(); }
}

// ---- IR compiler ----
const BINOPS = {
  '+': [OP.Add2], '-': [OP.Subtract], '*': [OP.Multiply], '/': [OP.Divide], '%': [OP.Modulo],
  '==': [OP.Equals2], '===': [OP.StrictEquals], '<': [OP.Less2], '>': [OP.Greater],
  '!=': [OP.Equals2, OP.Not], '<=': [OP.Greater, OP.Not], '>=': [OP.Less2, OP.Not],
  '&&': [OP.And], '||': [OP.Or],
};

export class IRCompiler {
  constructor(asm) { this.asm = asm; }
  expr(e) {
    const a = this.asm;
    if (typeof e === 'number') return a.push(e);
    if (typeof e === 'string') return a.push(e);
    if (typeof e === 'boolean') return a.push(e);
    if (e === null || e === undefined) return a.push(e);
    if (!Array.isArray(e)) throw new Error('bad expr ' + JSON.stringify(e));
    const [k, ...r] = e;
    switch (k) {
      case 'n': case 's': case 'b': return a.push(r[0]);
      case 'undef': return a.push(undefined);
      case 'v': a.push(r[0]).op(OP.GetVariable); return;
      case 'reg': return a.push({ reg: r[0] });
      case 'm': this.expr(r[0]); this.expr(r[1]); a.op(OP.GetMember); return;
      case 'call': { const args = r[1] || []; for (let i = args.length - 1; i >= 0; i--) this.expr(args[i]); a.push(args.length).push(r[0]).op(OP.CallFunction); return; }
      case 'cm': { const args = r[2] || []; for (let i = args.length - 1; i >= 0; i--) this.expr(args[i]); a.push(args.length); this.expr(r[0]); this.expr(r[1]); a.op(OP.CallMethod); return; }
      case 'nm': { const args = r[2] || []; for (let i = args.length - 1; i >= 0; i--) this.expr(args[i]); a.push(args.length); this.expr(r[0]); this.expr(r[1]); a.op(OP.NewMethod); return; } // new obj.Name(args)
      case 'new': { const args = r[1] || []; for (let i = args.length - 1; i >= 0; i--) this.expr(args[i]); a.push(args.length).push(r[0]).op(OP.NewObject); return; }
      case 'op': { const ops = BINOPS[r[0]]; if (!ops) throw new Error('bad op ' + r[0]); this.expr(r[1]); this.expr(r[2]); for (const o of ops) a.op(o); return; }
      case 'not': this.expr(r[0]); a.op(OP.Not); return;
      case 'tostr': this.expr(r[0]); a.op(OP.ToString); return;
      case 'tonum': this.expr(r[0]); a.op(OP.ToNumber); return;
      case 'typeof': this.expr(r[0]); a.op(OP.TypeOf); return;
      case 'arr': { const items = r[0]; for (let i = items.length - 1; i >= 0; i--) this.expr(items[i]); a.push(items.length).op(OP.InitArray); return; }
      case 'obj': { const pairs = r[0]; for (const [kk, v] of pairs) { a.push(kk); this.expr(v); } a.push(pairs.length).op(OP.InitObject); return; }
      case 'cond': { // ['cond', c, then, else] expression
        const Lelse = a.newLabel('ce'), Lend = a.newLabel('cx');
        this.expr(r[0]); a.op(OP.Not); a.jif(Lelse); this.expr(r[1]); a.jump(Lend); a.label(Lelse); this.expr(r[2]); a.label(Lend); return;
      }
      case 'fnx': a.defineFunction('', r[0], () => { this.stmts(r[1]); }); return; // anonymous function expression
      case 'raw': r[0](a, this); return;
      default: throw new Error('unknown expr node ' + k);
    }
  }
  stmts(list) { for (const s of list) this.stmt(s); }
  stmt(s) {
    const a = this.asm;
    if (!Array.isArray(s)) throw new Error('bad stmt ' + JSON.stringify(s));
    if (Array.isArray(s[0])) return this.stmts(s);
    const [k, ...r] = s;
    switch (k) {
      case 'set': a.push(r[0]); this.expr(r[1]); a.op(OP.SetVariable); return;
      case 'setd': this.expr(r[0]); this.expr(r[1]); a.op(OP.SetVariable); return; // dynamic name
      case 'local': a.push(r[0]); this.expr(r[1]); a.op(OP.DefineLocal); return;
      case 'setm': this.expr(r[0]); this.expr(r[1]); this.expr(r[2]); a.op(OP.SetMember); return;
      case 'x': this.expr(r[0]); a.op(OP.Pop); return;
      case 'if': {
        const Lelse = a.newLabel('ie'), Lend = a.newLabel('ix');
        this.expr(r[0]); a.op(OP.Not); a.jif(r[2] ? Lelse : Lend);
        this.stmts(r[1]);
        if (r[2]) { a.jump(Lend); a.label(Lelse); this.stmts(r[2]); }
        a.label(Lend); return;
      }
      case 'while': {
        const Ltop = a.newLabel('wt'), Lend = a.newLabel('wx');
        a.label(Ltop); this.expr(r[0]); a.op(OP.Not); a.jif(Lend); this.stmts(r[1]); a.jump(Ltop); a.label(Lend); return;
      }
      case 'label': a.label(r[0]); return;
      case 'jmp': a.jump(r[0]); return;
      case 'jif': this.expr(r[0]); a.jif(r[1]); return;
      case 'jifnot': this.expr(r[0]); a.op(OP.Not); a.jif(r[1]); return;
      case 'ret': if (r.length) this.expr(r[0]); else a.push(undefined); a.op(OP.Return); return;
      case 'fn': a.defineFunction(r[0], r[1], () => { this.stmts(r[2]); }); return;
      case 'trace': this.expr(r[0]); a.op(OP.Trace); return;
      // getURL(url, target) with no flags; a url of "FSCommand:cmd" is fscommand(cmd, target)
      case 'geturl2': this.expr(r[0]); this.expr(r[1]); a.op(OP.GetURL2); a.w.u16(1).u8(0); return;
      case 'raw': r[0](a, this); return;
      case 'nop': return;
      case 'mark': if (this.marks) this.marks[r[0]] = a.w.position; return; // record a byte position (used to split big programs)
      default: throw new Error('unknown stmt node ' + k);
    }
  }
}

export function compileIR(stmts, marks = null) {
  const asm = new Asm();
  const c = new IRCompiler(asm);
  c.marks = marks;
  c.stmts(stmts);
  return asm.finish();
}

// Small helpers for building IR by hand.
export const v = (n) => ['v', n];
export const m = (o, n) => ['m', o, n];
export const call = (f, ...args) => ['call', f, args];
export const cm = (o, n, ...args) => ['cm', o, n, args];
export const nw = (c, ...args) => ['new', c, args];
export const op = (o, a, b) => ['op', o, a, b];
export const not = (a) => ['not', a];
export const set = (n, e) => ['set', n, e];
export const setm = (o, n, e) => ['setm', o, n, e];
export const local = (n, e) => ['local', n, e];
export const x = (e) => ['x', e];
export const iff = (c, t, e) => e ? ['if', c, t, e] : ['if', c, t];
export const whl = (c, b) => ['while', c, b];
export const ret = (e) => e === undefined ? ['ret'] : ['ret', e];
export const fn = (n, p, b) => ['fn', n, p, b];
export const root = () => ['v', '_root'];
export const path = (...parts) => parts.slice(1).reduce((acc, p) => m(acc, p), parts[0]);
