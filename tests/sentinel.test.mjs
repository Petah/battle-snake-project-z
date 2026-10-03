import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, snake, require } from './helpers.mjs';
const { sentinelBoard, sentinelStep, sentinelMove, sentinelClearance, sentinelDistances } = require('../dist/lib/sentinel.js');
const { isFree, isHeadThreat } = require('../dist/lib/isFree.js');
const { nextPosition } = require('../dist/lib/directions.js');
function board(you, enemies = [], food = []) {
    const data = fixture(); data.you = you;
    data.board = { width: 7, height: 7, snakes: [you, ...enemies], food, hazards: [] }; return data;
}
const body = points => points.map(([x, y]) => ({ x, y }));

test('Sentinel rescues a starving snake with adjacent food and leaves API input untouched', () => {
    const you = snake('you', body([[3, 3], [3, 2], [3, 1]])); you.health = 1;
    const data = board(you, [snake('enemy', body([[6, 6], [6, 5], [6, 4]]))], [{ x: 3, y: 4 }]);
    const original = structuredClone(data);
    assert.equal(sentinelMove(data).move, 'up'); assert.deepEqual(data, original);
});

test('Sentinel avoids food contested by an equal or longer head when safe alternatives exist', () => {
    const data = board(snake('you', body([[3, 3], [3, 2], [3, 1]])), [snake('enemy', body([[3, 5], [4, 5], [5, 5], [6, 5]]))], [{ x: 3, y: 4 }]);
    const result = sentinelMove(data); const p = nextPosition(data.you.head, result.move);
    assert.ok(isFree(data, p.x, p.y)); assert.equal(isHeadThreat(data, p.x, p.y), false); assert.notEqual(result.move, 'up');
});

test('Sentinel simultaneous simulation resolves head ties, size advantage and shared food correctly', () => {
    const you = snake('you', body([[2, 3], [1, 3], [0, 3]]));
    const enemy = snake('enemy', body([[4, 3], [5, 3], [6, 3]]));
    const data = board(you, [enemy], [{ x: 3, y: 3 }]);
    assert.equal(sentinelStep(sentinelBoard(data), ['right', 'left']).snakes.length, 0);
    you.body.push({ x: 0, y: 2 }); you.length++;
    const result = sentinelStep(sentinelBoard(data), ['right', 'left']);
    assert.equal(result.snakes.length, 1); assert.equal(result.snakes[0].id, 'you');
    assert.equal(result.snakes[0].body.length, 5); assert.equal(result.snakes[0].health, 100); assert.equal(result.food.size, 0);
});

test('Sentinel simulation allows vacating tails, blocks stacked tails and preserves growth stacking', () => {
    const you = snake('you', body([[2, 2], [2, 1], [1, 1], [1, 2]]));
    const data = board(you, [], [{ x: 1, y: 2 }]);
    let result = sentinelStep(sentinelBoard(data), ['left']);
    assert.equal(result.snakes.length, 1); assert.equal(result.snakes[0].body.length, 5);
    assert.equal(result.snakes[0].body.at(-1), result.snakes[0].body.at(-2));
    you.body.push({ x: 1, y: 2 }); you.length++;
    result = sentinelStep(sentinelBoard(data), ['left']); assert.equal(result.snakes.length, 0);
});

test('Sentinel simulation removes starving/out-of-bounds snakes and applies known hazard damage', () => {
    const you = snake('you', body([[0, 3], [0, 2], [0, 1]])); you.health = 10;
    const data = board(you); data.board.hazards = [{ x: 1, y: 3 }];
    assert.equal(sentinelStep(sentinelBoard(data), ['left']).snakes.length, 0);
    assert.equal(sentinelStep(sentinelBoard(data), ['right']).snakes.length, 0);
    data.board.food = [{ x: 1, y: 3 }];
    assert.equal(sentinelStep(sentinelBoard(data), ['right']).snakes[0].health, 100);
});

test('Sentinel returns a food-directed move on small boards and a valid direction when trapped', () => {
    const data = fixture();
    assert.equal(sentinelMove(data).move, 'up');
    data.you.body = body([[1, 1], [1, 0], [0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0]]);
    data.you.length = data.you.body.length;
    assert.ok(['up', 'down', 'left', 'right'].includes(sentinelMove(data).move));
});

test('Sentinel rejects a food pocket whose exits remain blocked on the next turn', () => {
    const data = board(snake('you', body([[1, 1], [1, 0], [0, 0], [0, 1]])),
        [snake('enemy', body([[0, 3], [0, 2], [1, 2], [2, 2]]))], [{ x: 0, y: 1 }]);
    assert.equal(sentinelMove(data).move, 'right');
});

test('Sentinel uses its bounded multi-snake heuristic without mutating other snakes', () => {
    const data = board(snake('you', body([[3, 3], [3, 2], [3, 1]])), [
        snake('a', body([[0, 6], [0, 5], [0, 4]])), snake('b', body([[6, 6], [6, 5], [6, 4]]))
    ], [{ x: 4, y: 3 }]);
    const original = structuredClone(data), result = sentinelMove(data);
    assert.equal(result.depth, 0); const p = nextPosition(data.you.head, result.move);
    assert.ok(isFree(data, p.x, p.y)); assert.deepEqual(data, original);
});

test('Sentinel releases unique and stacked tails at their actual turns, without a second growth delay', () => {
    const you = snake('you', body([[2, 2], [2, 1], [1, 1], [1, 2]]));
    let state = sentinelBoard(board(you));
    assert.equal(sentinelClearance(state)[1 + 2 * 7], 1);
    assert.equal(sentinelDistances(state, state.snakes[0])[1 + 2 * 7], 1);
    you.body.push({ x: 1, y: 2 }); you.length++;
    state = sentinelBoard(board(you));
    assert.equal(sentinelClearance(state)[1 + 2 * 7], 2);
    // Reaching the stacked cell immediately is forbidden; a longer route can
    // reach it after its last occupying segment has actually vacated.
    assert.ok(sentinelDistances(state, state.snakes[0])[1 + 2 * 7] > 1);
});

test('Sentinel spends no search budget on a forced safe move', () => {
    const you = snake('you', body([[0, 0], [0, 1], [1, 1], [2, 1]]));
    const data = board(you, [snake('enemy', body([[6, 6], [6, 5], [6, 4]]))]);
    const result = sentinelMove(data);
    assert.equal(result.move, 'right'); assert.equal(result.nodes, 0);
});
