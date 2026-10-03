import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, snake, require } from './helpers.mjs';
const { vesperBoard, vesperStep, vesperMove, evaluate } = require('../dist/lib/vesper.js');
const { isFree, isHeadThreat } = require('../dist/lib/isFree.js');
const { nextPosition } = require('../dist/lib/directions.js');

function board(you, enemies = [], food = [], size = 7) {
    const data = fixture(); data.you = you;
    data.board = { width: size, height: size, snakes: [you, ...enemies], food, hazards: [] }; return data;
}
const body = points => points.map(([x, y]) => ({ x, y }));

test('Vesper returns a valid, non-mutating move and reports its search depth', () => {
    const data = board(snake('you', body([[3, 3], [3, 2], [3, 1]])), [snake('enemy', body([[0, 6], [0, 5], [0, 4]]))], [{ x: 5, y: 5 }]);
    const original = structuredClone(data);
    const result = vesperMove(data);
    const p = nextPosition(data.you.head, result.move);
    assert.ok(isFree(data, p.x, p.y)); assert.ok(result.depth >= 1); assert.ok(result.nodes > 0);
    assert.deepEqual(data, original);
});

test('Vesper takes adjacent food when starving', () => {
    const you = snake('you', body([[3, 3], [3, 2], [3, 1]])); you.health = 2;
    const data = board(you, [snake('enemy', body([[6, 6], [6, 5], [6, 4]]))], [{ x: 2, y: 3 }]);
    assert.equal(vesperMove(data).move, 'left');
});

test('Vesper declines food contested by a longer head when a safe alternative exists', () => {
    const data = board(snake('you', body([[3, 3], [3, 2], [3, 1]])), [snake('enemy', body([[3, 5], [4, 5], [5, 5], [6, 5]]))], [{ x: 3, y: 4 }]);
    const result = vesperMove(data); const p = nextPosition(data.you.head, result.move);
    assert.ok(isFree(data, p.x, p.y)); assert.equal(isHeadThreat(data, p.x, p.y), false); assert.notEqual(result.move, 'up');
});

test('Vesper moves into a head-to-head it wins when it is longer and the rival is cornered', () => {
    // Enemy in the corner with its only exit next to our head; we are longer so the collision kills only it.
    const you = snake('you', body([[2, 0], [3, 0], [4, 0], [5, 0], [6, 0]]));
    const enemy = snake('enemy', body([[0, 0], [0, 1], [0, 2]]));
    const data = board(you, [enemy], [{ x: 6, y: 6 }]);
    const result = vesperMove(data);
    assert.ok(['left', 'up'].includes(result.move));
});

test('Vesper time-aware flood fill accepts a pocket that opens as its own tail moves', () => {
    // Spiral: the only exit cell is the tail, which vacates in time. A static fill would call this a trap.
    const you = snake('you', body([[1, 1], [1, 0], [0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1]]));
    const data = board(you, [], [{ x: 6, y: 6 }], 5);
    data.board.width = 3; data.board.height = 3; data.board.food = [];
    const result = vesperMove(data);
    assert.equal(result.move, 'right');
});

test('Vesper step resolves ties, growth, starvation and body collisions like the standard rules', () => {
    const you = snake('you', body([[2, 3], [1, 3], [0, 3]]));
    const enemy = snake('enemy', body([[4, 3], [5, 3], [6, 3]]));
    const data = board(you, [enemy], [{ x: 3, y: 3 }]);
    assert.equal(vesperStep(vesperBoard(data), ['right', 'left']).snakes.length, 0);
    you.body.push({ x: 0, y: 2 }); you.length++;
    const result = vesperStep(vesperBoard(data), ['right', 'left']);
    assert.equal(result.snakes.length, 1); assert.equal(result.snakes[0].id, 'you');
    assert.equal(result.snakes[0].body.length, 5); assert.equal(result.snakes[0].health, 100); assert.equal(result.food.size, 0);
    const starving = snake('you', body([[0, 3], [0, 2], [0, 1]])); starving.health = 1;
    assert.equal(vesperStep(vesperBoard(board(starving)), ['right']).snakes.length, 0);
    assert.equal(vesperStep(vesperBoard(board(starving)), ['left']).snakes.length, 0);
});

test('Vesper blocks a stacked tail for one turn after eating', () => {
    const you = snake('you', body([[2, 2], [2, 1], [1, 1], [1, 2]]));
    const data = board(you, [], []);
    assert.equal(vesperStep(vesperBoard(data), ['left']).snakes.length, 1);
    you.body.push({ x: 1, y: 2 }); you.length++;
    assert.equal(vesperStep(vesperBoard(data), ['left']).snakes.length, 0);
});

test('Vesper evaluation prefers more territory and penalises cramped space', () => {
    const open = vesperBoard(board(snake('you', body([[3, 3], [3, 2], [3, 1]])), [snake('enemy', body([[0, 6], [0, 5], [0, 4]]))]));
    const cramped = vesperBoard(board(snake('you', body([[0, 0], [1, 0], [1, 1], [0, 1]])), [snake('enemy', body([[2, 0], [2, 1], [2, 2], [1, 2], [0, 2]]))]));
    assert.ok(evaluate(open, 'you') > evaluate(cramped, 'you'));
    assert.ok(evaluate({ ...open, snakes: open.snakes.slice(1) }, 'you') < -100000);
});

test('Vesper handles three or more snakes and small boards within a bounded budget', () => {
    const data = board(snake('you', body([[3, 3], [3, 2], [3, 1]])), [
        snake('a', body([[0, 6], [0, 5], [0, 4]])), snake('b', body([[6, 6], [6, 5], [6, 4]])),
    ], [{ x: 4, y: 3 }]);
    const started = performance.now(); const result = vesperMove(data);
    assert.ok(performance.now() - started < data.game.timeout * 0.6);
    const p = nextPosition(data.you.head, result.move); assert.ok(isFree(data, p.x, p.y));
    const tiny = fixture(); assert.ok(['up', 'down', 'left', 'right'].includes(vesperMove(tiny).move));
    tiny.you.body = body([[1, 1], [1, 0], [0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0]]); tiny.you.length = 9;
    assert.ok(['up', 'down', 'left', 'right'].includes(vesperMove(tiny).move));
});
