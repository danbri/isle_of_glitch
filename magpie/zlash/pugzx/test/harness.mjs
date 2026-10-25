// A headless PUGZX machine with the interface the gameplay checks use: state.b_<name> reads and
// writes BASIC variables, keys and pointer go in as a player would press them, frame() is one
// 50 Hz tick, and screen lists the strings printed since the last CLS.
import { Machine } from '../machine.js';

export function seedRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 0x100000000; };
}

const NAMED = { ArrowLeft: [37, '\x08'], ArrowRight: [39, '\x09'], ArrowDown: [40, '\x0a'], ArrowUp: [38, '\x0b'], Enter: [13, '\r'] };

export class TestMachine {
  constructor(source, { random = seedRandom(1) } = {}) {
    this.screen = [];
    this.m = new Machine(source, { random, store: new Map() });
    const pstr = this.m.pstr.bind(this.m), cls = this.m.cls.bind(this.m);
    this.m.pstr = (s) => { this.screen.push(String(s)); pstr(s); };
    this.m.cls = () => { this.screen = []; cls(); };
    this.held = null;
    const m = this.m;
    this.state = new Proxy({}, {
      get: (_, k) => {
        if (k === '__t') return m.t;
        if (k === '__ln') return new Proxy({}, { get: (_, n) => Number(n) });
        if (k === '__wait') return m.wait;
        if (k === '__mode') return m.mode;
        if (typeof k === 'string' && k.startsWith('b_')) return m.prog.peek(k.slice(2));
        return undefined;
      },
      set: (_, k, v) => {
        if (k === '__pc') m.prog.jump(v);
        else if (k === '__wait') m.wait = v;
        else if (k === '__mode') m.mode = v;
        else if (k === '__kbuf') m.kbuf = v;
        else if (typeof k === 'string' && k.startsWith('b_')) m.prog.poke(k.slice(2), v);
        return true;
      },
    });
  }
  get sprites() { return this.m.sprites; }
  frame(count = 1) { for (let i = 0; i < count; i++) this.m.frame(performance.now()); }
  until(predicate, maxFrames = 200) {
    for (let i = 0; i < maxFrames; i++) { if (predicate(this.state)) return; this.frame(); }
    throw new Error(`Condition not reached in ${maxFrames} frames`);
  }
  keyDown(key) {
    const [id, ch] = NAMED[key] || [key.toUpperCase().charCodeAt(0), key];
    if (this.held !== null && this.held !== id) this.m.keyUp(this.held);
    this.held = id;
    this.m.keyDown({ id, ch });
  }
  keyUp() { if (this.held !== null) this.m.keyUp(this.held); this.held = null; }
  tap(key, frames = 1) { this.keyDown(key); this.frame(frames); this.keyUp(); }
  pointerMove(x, y) { this.m.mouseMove(x, y); }
  pointerDown(x, y) { this.m.mouseDown(x, y); }
  pointerUp() { this.m.mouseUp(); }
  click(x, y) { this.pointerDown(x, y); this.pointerUp(); }
  continue() { this.keyUp(); this.pointerUp(); this.frame(4); this.tap(' ', 4); }
  start() {
    this.until(() => this.screen.includes('3D MONSTER MAZE'));
    this.continue();
    this.until(state => state.b_nt > 0);
    return this;
  }
}
