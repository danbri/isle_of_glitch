// Small headless executor for the compiler IR, for game-logic regression checks.
// This is not a Flash renderer or AVM1 emulator. It executes the emitted BASIC
// control flow plus the real runtime's DIM, input and frame-loop functions;
// drawing and sound are recorded/stubbed. avmcheck.js covers bytecode branches.
import { compileBasic } from '../js/basic.js';
import { runtimeIR, runtimeVars } from '../js/runtime.js';

function flatten(body) {
  const out = [], labels = new Map();
  let serial = 0;
  function emit(list) {
    for (const node of list) {
      if (Array.isArray(node[0])) { emit(node); continue; }
      const [kind, ...args] = node;
      if (kind === 'if') {
        const other = `test_else_${serial++}`, end = `test_end_${serial++}`;
        out.push(['jifnot', args[0], other]); emit(args[1]);
        out.push(['jmp', end], ['label', other]);
        if (args[2]) emit(args[2]);
        out.push(['label', end]);
      } else if (kind === 'while') {
        const start = `test_loop_${serial++}`, end = `test_end_${serial++}`;
        out.push(['label', start], ['jifnot', args[0], end]); emit(args[1]);
        out.push(['jmp', start], ['label', end]);
      } else out.push(node);
    }
  }
  emit(body);
  out.forEach((node, index) => { if (node[0] === 'label') labels.set(node[1], index); });
  return { out, labels };
}

const runtime = runtimeIR([]);
const realFunctions = new Set(['__dim', '__inkey', '__kchar', '__more']);
const runtimeFunctions = runtime.filter(node => node[0] === 'fn' && realFunctions.has(node[1]));
const keyboardBody = runtime.find(node => node[0] === 'setm' && node[2] === 'onKeyDown')[3];
const mouseDownBody = runtime.find(node => node[0] === 'setm' && node[2] === 'onMouseDown')[3];
const mouseUpBody = runtime.find(node => node[0] === 'setm' && node[2] === 'onMouseUp')[3];
const mouseInitializers = runtime.filter(node => node[0] === 'set' && node[1].startsWith('__mb'));
const frameBody = runtime.find(node => node[0] === 'setm' && node[2] === 'onEnterFrame')[3];

export function seedRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

export class BasicTestRuntime {
  constructor(source, { random = seedRandom(1), strictArrays = true } = {}) {
    this.strictArrays = strictArrays;
    this.steps = 0;
    this.stepLimit = 20000000;
    this.screen = [];
    this.sprites = [];
    this.held = false;
    this.keyCode = 0;
    this.ascii = 0;
    this.state = { ...runtimeVars(), __gs: [], __kbuf: '' };
    const state = this.state;
    let clock = 0; state.getTimer = () => (clock += 5); // a stand-in clock: every reading is 5 ms later
    state.Math = Object.create(Math);
    state.Math.random = random;
    state.String = String;
    state.Key = {
      getCode: () => this.keyCode,
      getAscii: () => this.ascii,
      isDown: code => this.held && code === this.keyCode,
    };
    const noop = () => undefined;
    state.scr = { inner: { gfx: new Proxy({}, { get: () => noop }) }, _xmouse: 0, _ymouse: 0 };
    for (const name of ['__border', '__pat', '__tab', '__comma', '__nl', '__beep', '__tone', '__fxchq']) state[name] = noop;
    state.__cls = () => { this.screen = []; this.sprites = []; };
    state.__pstr = value => { this.screen.push(String(value)); };
    state.__ns = value => String(value);
    state.__spr = (...args) => { this.sprites.push(args); };
    state.__sprclr = () => { this.sprites = []; };
    state.__err = state.__lo = message => { throw new Error(`BASIC report: ${message}`); };
    this.runCode(flatten([...runtimeFunctions, ...mouseInitializers]), Object.create(null));
    this.onKeyDown = this.expression(keyboardBody, Object.create(null));
    this.onMouseDown = this.expression(mouseDownBody, Object.create(null));
    this.onMouseUp = this.expression(mouseUpBody, Object.create(null));
    this.onEnterFrame = this.expression(frameBody, Object.create(null));
    const program = compileBasic(source);
    this.runCode(flatten(program.ir), Object.create(null));
  }

  get(name, local) { return Object.hasOwn(local, name) ? local[name] : this.state[name]; }
  set(name, value, local) {
    if (Object.hasOwn(local, name)) local[name] = value;
    else this.state[name] = value;
  }
  member(object, key) {
    if (this.strictArrays && Array.isArray(object) && typeof key === 'number') {
      if (!Number.isInteger(key) || key < 0 || key >= object.length) {
        throw new Error(`Out-of-bounds BASIC array read: index ${key}, length ${object.length}`);
      }
    }
    return object == null ? undefined : object[key];
  }
  expression(node, local) {
    if (!Array.isArray(node)) return node;
    const [kind, ...args] = node;
    const e = value => this.expression(value, local);
    switch (kind) {
      case 'n': case 's': case 'b': return args[0];
      case 'undef': return undefined;
      case 'v': return this.get(args[0], local);
      case 'm': return this.member(e(args[0]), e(args[1]));
      case 'arr': return args[0].map(e);
      case 'obj': return Object.fromEntries(args[0].map(([key, value]) => [key, e(value)]));
      case 'not': return !e(args[0]);
      case 'tonum': return Number(e(args[0]));
      case 'tostr': return String(e(args[0]));
      case 'cond': return e(args[0]) ? e(args[1]) : e(args[2]);
      case 'op': {
        const a = e(args[1]), b = e(args[2]);
        switch (args[0]) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return a / b;
          case '%': return a % b;
          case '==': return a == b; // AVM1 Equals2 uses coercion.
          case '===': return a === b;
          case '!=': return a != b;
          case '<': return a < b;
          case '>': return a > b;
          case '<=': return a <= b;
          case '>=': return a >= b;
          case '&&': return Boolean(a && b);
          case '||': return Boolean(a || b);
          default: throw new Error(`Unsupported IR operator ${args[0]}`);
        }
      }
      case 'call': {
        const fn = this.get(args[0], local);
        if (typeof fn !== 'function') throw new Error(`Missing runtime function ${args[0]}`);
        return fn(...(args[1] || []).map(e));
      }
      case 'cm': {
        const object = e(args[0]), key = e(args[1]);
        return object[key](...(args[2] || []).map(e));
      }
      case 'fnx': return this.makeFunction(args[0], args[1]);
      default: throw new Error(`Unsupported IR expression ${kind}`);
    }
  }
  makeFunction(parameters, body) {
    const code = flatten(body);
    return (...args) => {
      const local = Object.create(null);
      parameters.forEach((name, index) => { local[name] = args[index]; });
      return this.runCode(code, local);
    };
  }
  runCode({ out, labels }, local) {
    for (let i = 0; i < out.length; i++) {
      if (++this.steps > this.stepLimit) throw new Error(`Execution exceeded ${this.stepLimit} IR instructions`);
      const [kind, ...args] = out[i];
      const e = node => this.expression(node, local);
      const jump = label => {
        if (!labels.has(label)) throw new Error(`Unknown IR label ${label}`);
        return labels.get(label);
      };
      switch (kind) {
        case 'set': this.set(args[0], e(args[1]), local); break;
        case 'setd': this.set(e(args[0]), e(args[1]), local); break;
        case 'local': local[args[0]] = e(args[1]); break;
        case 'setm': e(args[0])[e(args[1])] = e(args[2]); break;
        case 'x': e(args[0]); break;
        case 'fn': this.state[args[0]] = this.makeFunction(args[1], args[2]); break;
        case 'jmp': i = jump(args[0]); break;
        case 'jif': if (e(args[0])) i = jump(args[1]); break;
        case 'jifnot': if (!e(args[0])) i = jump(args[1]); break;
        case 'ret': return args.length ? e(args[0]) : undefined;
        case 'label': case 'mark': case 'nop': case 'trace': case 'geturl2': break;
        default: throw new Error(`Unsupported IR statement ${kind}`);
      }
    }
  }
  frame(count = 1) { for (let i = 0; i < count; i++) { this.steps = 0; this.onEnterFrame(); } } // the cap is per frame: a runaway frame, not a long program
  until(predicate, maxFrames = 200) {
    for (let i = 0; i < maxFrames; i++) {
      if (predicate(this.state)) return;
      this.frame();
    }
    throw new Error(`Condition not reached in ${maxFrames} frames (BASIC pc=${this.state.__pc})`);
  }
  keyDown(key) {
    const codes = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13 };
    this.keyCode = codes[key] || key.toUpperCase().charCodeAt(0);
    this.ascii = Object.hasOwn(codes, key) ? (key === 'Enter' ? 13 : 0) : key.charCodeAt(0);
    this.held = true;
    this.onKeyDown();
  }
  keyUp() { this.held = false; }
  tap(key, frames = 1) { this.keyDown(key); this.frame(frames); this.keyUp(); }
  pointerMove(x, y) {
    this.state.scr._xmouse = x;
    this.state.scr._ymouse = y;
  }
  pointerDown(x, y) {
    this.pointerMove(x, y);
    this.onMouseDown();
  }
  pointerUp() { this.onMouseUp(); }
  click(x, y) { this.pointerDown(x, y); this.pointerUp(); }
  continue() {
    this.keyUp(); this.pointerUp(); this.frame(4);
    this.tap(' ', 4);
  }
  start() {
    this.until(() => this.screen.includes('3D MONSTER MAZE'));
    this.continue();
    this.until(state => state.b_nt > 0);
    return this;
  }
}
