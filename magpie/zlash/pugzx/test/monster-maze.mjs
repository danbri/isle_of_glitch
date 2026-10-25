// Gameplay invariants for the real BASIC example, run on PUGZX (the same checks as tools/check-monster-maze.js for the Flash compiler).
// Run: node pugzx/test/monster-maze.mjs [path/to/monster-maze.bas]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TestMachine as BasicTestRuntime, seedRandom } from './harness.mjs';
import { EXAMPLES } from '../examples.js';

const source = readFileSync(process.argv[2] || new URL('../../examples/monster-maze.bas', import.meta.url), 'utf8');
const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];

function reachable(maze, start) {
  const queue = [start], seen = new Set([start.join(',')]);
  for (let i = 0; i < queue.length; i++) {
    for (const [dr, dc] of directions) {
      const r = queue[i][0] + dr, c = queue[i][1] + dc, key = `${r},${c}`;
      if (r < 1 || r > 16 || c < 1 || c > 15 || maze[r][c] === 1 || seen.has(key)) continue;
      seen.add(key); queue.push([r, c]);
    }
  }
  return seen;
}

function checkMaze(vm, label) {
  const s = vm.state, maze = s.b_m;
  assert.equal(maze.length, 18, `${label}: north/south border allocation`);
  let exits = 0, passages = 0;
  for (let r = 0; r <= 17; r++) {
    assert.equal(maze[r].length, 17, `${label}: west/east border allocation`);
    for (let c = 0; c <= 16; c++) {
      assert.ok([0, 1, 2].includes(maze[r][c]), `${label}: valid cell ${r},${c}`);
      if (r === 0 || r === 17 || c === 0 || c === 16) assert.equal(maze[r][c], 1, `${label}: closed border ${r},${c}`);
      if (maze[r][c] !== 1) passages++;
      if (maze[r][c] === 2) exits++;
    }
  }
  const seen = reachable(maze, [s.b_pr, s.b_pc]);
  assert.equal(exits, 1, `${label}: exactly one exit`);
  assert.equal(maze[s.b_ex][s.b_ey], 2, `${label}: exit coordinates`);
  assert.ok(seen.has(`${s.b_ex},${s.b_ey}`), `${label}: exit reachable from player`);
  assert.equal(seen.size, passages, `${label}: no disconnected passages`);
  assert.ok(seen.has(`${s.b_rr},${s.b_rc}`), `${label}: Rex reachable from player`);
  assert.equal(maze[s.b_rr][s.b_rc], 0, `${label}: Rex starts in a passage`);
  assert.notDeepEqual([s.b_rr, s.b_rc], [s.b_pr, s.b_pc], `${label}: distinct player/Rex starts`);
}

function fixture({ row = 8, column = 8, facing = 0 } = {}) {
  const vm = new BasicTestRuntime(source).start(), s = vm.state;
  for (let r = 0; r <= 17; r++) for (let c = 0; c <= 16; c++) {
    s.b_m[r][c] = r === 0 || r === 17 || c === 0 || c === 16 ? 1 : 0;
  }
  Object.assign(s, {
    b_pr: row, b_pc: column, b_f: facing, b_st: 0, b_rr: 1, b_rc: 1,
    b_nt: 1e9, b_mv: 1, __pc: s.__ln[420], __gs: [], __wait: 0, __mode: 0,
    __kbuf: '', __again: 0,
  });
  vm.keyUp();
  return vm;
}

function check(name, fn) { fn(); console.log(`ok   ${name}`); }

if (!process.argv[2]) check('browser bundle matches the tested BASIC source', () => {
  assert.equal(EXAMPLES.find(example => example.name === '3D Monster Maze').src.trim(), source.trim());
});

check('128 seeded mazes: bounded generation, sealed border, connected exit and Rex', () => {
  for (let seed = 1; seed <= 128; seed++) {
    checkMaze(new BasicTestRuntime(source, { random: seedRandom(seed) }).start(), `seed ${seed}`);
  }
});

check('degenerate random sources still produce playable mazes', () => {
  for (const value of [0, 0.25, 0.5, 0.75, 0.999999]) {
    checkMaze(new BasicTestRuntime(source, { random: () => value }).start(), `constant RND ${value}`);
  }
});

check('held forward input cannot cross any outer wall', () => {
  for (const position of [
    { row: 1, column: 8, facing: 0 }, { row: 8, column: 15, facing: 1 },
    { row: 16, column: 8, facing: 2 }, { row: 8, column: 1, facing: 3 },
  ]) {
    const vm = fixture(position);
    vm.keyDown('w'); vm.frame(40); vm.keyUp();
    assert.deepEqual([vm.state.b_pr, vm.state.b_pc], [position.row, position.column]);
    assert.equal(vm.state.b_st, 0);
  }
});

check('forward movement advances to a corridor but stops at an interior wall', () => {
  const vm = fixture(), s = vm.state;
  s.b_m[6][8] = 1;
  vm.keyDown('w'); vm.frame(40); vm.keyUp();
  assert.deepEqual([s.b_pr, s.b_pc], [7, 8]);
  assert.equal(s.b_st, 1);
});

check('turning keys and uppercase aliases turn once until released', () => {
  for (const [keys, turn] of [
    [['ArrowLeft', 'a', 'A', 'o', 'O', '5'], 3],
    [['ArrowRight', 'd', 'D', 'p', 'P', '8'], 1],
    [['ArrowDown', 's', 'S'], 2],
  ]) {
    for (const key of keys) {
      const vm = fixture();
      vm.keyDown(key); vm.frame(30);
      assert.equal(vm.state.b_f, turn, `held ${key}`);
      vm.keyUp(); vm.frame(4); vm.tap(key, 4);
      assert.equal(vm.state.b_f, turn * 2 % 4, `second press ${key}`);
    }
  }
});

check('held walking has an eight-tick cooldown, including OS key repeat', () => {
  for (const repeatEvents of [false, true]) {
    const vm = fixture(), moves = [];
    let steps = 0;
    vm.keyDown('w');
    for (let frame = 0; frame < 22; frame++) {
      if (repeatEvents) vm.keyDown('w');
      vm.frame();
      if (vm.state.b_st !== steps) { moves.push(vm.state.__t); steps = vm.state.b_st; }
    }
    vm.keyUp();
    assert.ok(moves.length >= 3, 'held forward keeps walking');
    for (let i = 1; i < moves.length; i++) assert.ok(moves[i] - moves[i - 1] >= 8, 'walk repeat is rate limited');
  }
});

check('cursor and legacy forward aliases, including capitals, move forward', () => {
  for (const key of ['ArrowUp', 'w', 'W', 'q', 'Q', '7']) {
    const vm = fixture();
    vm.tap(key, 4);
    assert.deepEqual([vm.state.b_pr, vm.state.b_pc], [7, 8], key);
  }
});

check('four pointer controls match keyboard actions and held turns do not spin', () => {
  for (const [x, turn] of [[32, 3], [160, 1], [224, 2]]) {
    const vm = fixture();
    vm.pointerDown(x, 176); vm.frame(30);
    assert.equal(vm.state.b_f, turn);
    vm.pointerUp(); vm.frame(4);
    vm.pointerDown(x, 176); vm.frame(4); vm.pointerUp();
    assert.equal(vm.state.b_f, turn * 2 % 4);
  }
  const vm = fixture();
  vm.state.b_m[6][8] = 1;
  vm.pointerDown(96, 176); vm.frame(40); vm.pointerUp();
  assert.deepEqual([vm.state.b_pr, vm.state.b_pc], [7, 8]);
  assert.equal(vm.state.b_st, 1);
});

check('brief clicks entirely between frames reach all four pointer controls', () => {
  for (const [x, facing, steps] of [[32, 3, 0], [96, 0, 1], [160, 1, 0], [224, 2, 0]]) {
    const vm = fixture();
    vm.click(x, 176);
    vm.frame(12);
    assert.equal(vm.state.b_f, facing, `click at x=${x}`);
    assert.equal(vm.state.b_st, steps, `click at x=${x} is consumed once`);
  }
});

check('brief clicks survive paused frames and are consumed on resuming BASIC', () => {
  for (const [x, facing, steps] of [[32, 3, 0], [96, 0, 1], [160, 1, 0], [224, 2, 0]]) {
    const vm = fixture();
    vm.state.__wait = 3;
    vm.click(x, 176);
    vm.frame(3);
    assert.equal(vm.state.b_f, 0, 'paused frames do not execute BASIC');
    assert.equal(vm.state.b_st, 0);
    vm.frame(12);
    assert.equal(vm.state.b_f, facing, `queued click at x=${x}`);
    assert.equal(vm.state.b_st, steps, `queued click at x=${x} is consumed once`);
  }
});

check('brief clicks use their press position after the released pointer moves', () => {
  const buttons = [[32, 3, 0, 160], [96, 0, 1, 224], [160, 1, 0, 32], [224, 2, 0, 96]];
  for (const [x, facing, steps, otherX] of buttons) {
    for (const [newX, newY] of [[otherX, 176], [400, 80]]) {
      for (const wait of [0, 3]) {
        const vm = fixture();
        vm.state.__wait = wait;
        vm.click(x, 176);
        vm.pointerMove(newX, newY);
        vm.frame(wait + 12);
        assert.equal(vm.state.b_f, facing, `click x=${x}, then pointer ${newX},${newY}`);
        assert.equal(vm.state.b_st, steps, 'the original clicked button acts exactly once');
      }
    }
  }
});

check('a held pointer uses live coordinates as it moves between buttons', () => {
  const vm = fixture();
  vm.pointerDown(32, 176);
  vm.pointerMove(160, 176); vm.frame(4);
  assert.equal(vm.state.b_f, 1, 'held pointer already moved right before first frame');
  vm.pointerMove(32, 176); vm.frame(4);
  assert.equal(vm.state.b_f, 0, 'dragging back to left turns left');
  vm.pointerMove(400, 80); vm.frame(4);
  assert.equal(vm.state.b_f, 0, 'dragging outside the controls stops steering');
  vm.pointerMove(96, 176); vm.frame(4);
  assert.deepEqual([vm.state.b_pr, vm.state.b_pc], [7, 8], 'dragging onto forward walks');
  vm.pointerUp();
});

check('pointer input outside the control strip does not steer the player', () => {
  for (const [x, y] of [[32, 155], [32, 192], [-1, 176], [256, 176]]) {
    const vm = fixture();
    vm.pointerDown(x, y); vm.frame(12); vm.pointerUp();
    assert.equal(vm.state.b_f, 0);
    assert.equal(vm.state.b_st, 0);
  }
});

check('title can be entered using only a pointer press and release', () => {
  const vm = new BasicTestRuntime(source);
  vm.until(() => vm.screen.includes('3D MONSTER MAZE'));
  vm.frame(4); vm.pointerDown(128, 80); vm.frame(4); vm.pointerUp();
  vm.until(state => state.b_nt > 0);
  checkMaze(vm, 'pointer start');
});

check('a brief click entirely between frames enters the title screen', () => {
  const vm = new BasicTestRuntime(source);
  vm.until(() => vm.screen.includes('3D MONSTER MAZE'));
  vm.frame(4); vm.click(128, 80);
  vm.until(state => state.b_nt > 0);
  checkMaze(vm, 'brief pointer start');
});

check('Rex appears ahead but is hidden behind a wall or behind the player', () => {
  for (const obstruction of ['none', 'wall', 'behind']) {
    const vm = fixture(), s = vm.state;
    s.b_rr = obstruction === 'behind' ? 10 : 6; s.b_rc = 8;
    if (obstruction === 'wall') s.b_m[7][8] = 1;
    vm.frame(4);
    assert.equal(s.b_seen, obstruction === 'none' ? 1 : 0, obstruction);
    assert.equal(vm.sprites.length, obstruction === 'none' ? 1 : 0, obstruction);
  }
});

check('entering an exit wins and increases difficulty', () => {
  const vm = fixture(), s = vm.state;
  s.b_m[7][8] = 2;
  const escapes = s.b_won, delay = s.b_rt0;
  vm.tap('w');
  vm.until(() => vm.screen.includes('YOU HAVE ESCAPED'));
  assert.equal(s.b_won, escapes + 1);
  assert.equal(s.b_rt0, Math.max(8, delay - 3));
  vm.until(() => vm.screen.some(text => /CONTINUE|GO ON/.test(text)));
  vm.continue();
  vm.until(() => vm.screen.includes('3D MONSTER MAZE'));
  vm.continue();
  vm.until(state => state.b_nt > state.__t && state.b_st === 0);
  checkMaze(vm, 'after escape restart');
});

check('walking into Rex loses and offers a fresh round', () => {
  const vm = fixture(), s = vm.state;
  s.b_rr = 7; s.b_rc = 8;
  vm.tap('w');
  vm.until(() => vm.screen.includes("REX'S LUNCH"));
  vm.until(() => vm.screen.some(text => /TRY AGAIN|RETRY/.test(text)));
  vm.continue();
  vm.until(() => vm.screen.includes('3D MONSTER MAZE'));
  assert.equal(s.b_won, 0);
});

check('a held walking key cannot skip the victory screen', () => {
  const vm = fixture(), s = vm.state;
  s.b_m[7][8] = 2;
  vm.keyDown('w'); vm.frame(100);
  assert.ok(vm.screen.includes('YOU HAVE ESCAPED'));
  assert.ok(!vm.screen.includes('3D MONSTER MAZE'));
  vm.keyUp(); vm.frame(8);
  assert.ok(vm.screen.includes('YOU HAVE ESCAPED'), 'release alone does not dismiss the result');
  vm.continue();
  vm.until(() => vm.screen.includes('3D MONSTER MAZE'));
});
