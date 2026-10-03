import test from 'node:test';
import assert from 'node:assert/strict';
import { require, fixture, snake, startServer } from './helpers.mjs';
const { StrategyRequest } = require('../dist/types/BTData.js');
const { weight, floodFill } = require('../dist/lib/weight.js');
const { isFree, isHeadThreat } = require('../dist/lib/isFree.js');
const { randomMove } = require('../dist/lib/randomMove.js');
const { smartRandomMove } = require('../dist/lib/smartRandomMove.js');
const { fallbackMove } = require('../dist/lib/directions.js');
const { pathTo } = require('../dist/lib/Pather.js');
const { simulateMove } = require('../dist/lib/lookAhead.js');
const { BaseSnake } = require('../dist/server/snakes/base-snake.js');
const options = { blockHeads: true, attackHeads: true, deadEnds: false, borders: false, snakeBodies: false };

function board(you, others = [], size = 5) {
    const data = fixture();
    data.you = you;
    data.board = { width: size, height: size, food: [], hazards: [], snakes: [you, ...others] };
    return data;
}

test('off-board scoring and flood-fill return zero without indexing or annotating the grid', () => {
    const request = new StrategyRequest(fixture());
    const before = structuredClone(request.grid);
    for (const [x, y] of [[-1, 0], [0, -1], [3, 0], [0, 3], [NaN, 1], [0.5, 1]]) {
        assert.equal(weight(request, x, y, options), 0);
        assert.equal(floodFill(request, x, y), 0);
        assert.equal(pathTo(request, request.you, x, y), null);
    }
    assert.deepEqual(request.grid, before);
});

test('flood-fill caches only connected free squares; occupied squares remain zero in either query order', () => {
    for (const occupiedFirst of [true, false]) {
        const request = new StrategyRequest(fixture());
        if (occupiedFirst) assert.equal(floodFill(request, 1, 1), 0);
        assert.equal(floodFill(request, 2, 2), 7);
        assert.equal(floodFill(request, 1, 1), 0);
        assert.equal(floodFill(request, 1, 0), 0);
        assert.equal(floodFill(request, 0, 0), 7); // the unique tail vacates
        assert.equal(floodFill(request, -1, 0), 0);
    }
});

test('flood-fill distinguishes regions separated by a body wall', () => {
    const you = snake('you', [{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 0 }]);
    const wall = snake('wall', [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 2 }]);
    const request = new StrategyRequest(board(you, [wall], 3));
    assert.equal(floodFill(request, 0, 2), 1);
    assert.equal(floodFill(request, 2, 2), 3);
    assert.equal(floodFill(request, 1, 1), 0);
});

test('random, scored, fallback and pathfinding moves agree on a vacating tail and reject a stacked tail', () => {
    const you = snake('you', [{ x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }]);
    const data = board(you, [], 2);
    assert.equal(isFree(data, 0, 1), true);
    assert.equal(randomMove(new StrategyRequest(data)), 'left');
    assert.equal(smartRandomMove(new StrategyRequest(data), options), 'left');
    assert.equal(fallbackMove(data), 'left');
    assert.equal(pathTo(new StrategyRequest(data), you, 0, 1, options).direction, 'left');
    data.you.body.push({ x: 0, y: 1 }); data.you.length++;
    assert.equal(isFree(data, 0, 1), false);
    assert.equal(weight(new StrategyRequest(data), 0, 1, options), 0);
    assert.equal(randomMove(new StrategyRequest(data)), undefined);
    assert.equal(pathTo(new StrategyRequest(data), you, 0, 1, options), null);
});

test('opponent tails use their own lengths; duplicated tails and former heads remain blocked', () => {
    const you = snake('you', [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 3 }]);
    const opponent = snake('other', [{ x: 2, y: 1 }, { x: 2, y: 0 }, { x: 1, y: 0 }]);
    const data = board(you, [opponent]);
    assert.equal(isFree(data, 1, 0), true);
    assert.equal(isFree(data, 2, 1), false);
    assert.equal(pathTo(new StrategyRequest(data), you, 2, 1, { ...options, blockHeads: false }), null);
    opponent.body.push({ x: 1, y: 0 }); opponent.length++;
    assert.equal(isFree(data, 1, 0), false);
});

test('squad body overlap requires the active squad ruleset and explicit permission', () => {
    const you = snake('you', [{ x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }]);
    const other = snake('other', [{ x: 2, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
    you.squad = other.squad = 'blue';
    const data = board(you, [other]);
    data.game.ruleset.settings.squad = { allowBodyCollisions: true };
    assert.equal(isFree(data, 2, 0), false);
    data.game.ruleset.name = 'squad';
    assert.equal(isFree(data, 2, 0), true);
    assert.equal(isFree(data, 1, 0), false);
    data.game.ruleset.settings.squad.allowBodyCollisions = false;
    assert.equal(isFree(data, 2, 0), false);
});

test('head-to-head scoring rejects equal and longer legal opponents, permits shorter opponents, and ignores impossible reversals', () => {
    const you = snake('you', [{ x: 1, y: 2 }, { x: 1, y: 1 }, { x: 1, y: 0 }]);
    for (const length of [2, 3, 4]) {
        const opponent = snake('other', [{ x: 3, y: 2 }, ...Array(length - 1).fill({ x: 3, y: 1 })]);
        const data = board(you, [opponent]);
        assert.equal(isHeadThreat(data, 2, 2), length >= 3);
        assert.equal(weight(new StrategyRequest(data), 2, 2, options) === 0, length >= 3);
    }
    const opponent = snake('other', [{ x: 3, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }]);
    assert.equal(isHeadThreat(board(you, [opponent]), 2, 2), false);
});

test('lookahead removes one tail, grows by stacking the new tail, consumes food, and leaves its input unchanged', () => {
    const data = fixture();
    const before = structuredClone(data);
    const result = simulateMove(data, 'up');
    assert.equal(result.dead, false);
    assert.equal(result.data.you.health, 100);
    assert.equal(result.data.you.length, 4);
    assert.deepEqual(result.data.you.body, [{ x: 1, y: 2 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 0 }]);
    assert.deepEqual(result.data.board.food, []);
    assert.deepEqual(data, before);
    assert.equal(isFree(result.data, 1, 0), false);
    assert.equal(simulateMove(data, 'down').dead, true);
});

test('server replaces valid but colliding or losing head-to-head directions with an available move', async t => {
    class UnsafeSnake extends BaseSnake { move() { return { move: 'right' }; } }
    const request = await startServer(t, () => new UnsafeSnake());
    const you = snake('you', [{ x: 1, y: 2 }, { x: 1, y: 1 }, { x: 1, y: 0 }]);
    const other = snake('other', [{ x: 3, y: 2 }, { x: 3, y: 1 }, { x: 3, y: 0 }]);
    assert.equal((await request('/move', board(you, [other]))).body.move, 'up');
    const occupied = snake('wall', Array(3).fill({ x: 2, y: 2 }));
    assert.equal((await request('/move', board(you, [occupied]))).body.move, 'up');
});

test('cached path searches remain independent across targets', () => {
    const data = fixture();
    data.board.width = data.board.height = 5;
    const request = new StrategyRequest(data);
    const first = pathTo(request, data.you, 4, 4, options);
    assert.ok(first);
    assert.ok(pathTo(request, data.you, 4, 0, options));
    assert.deepEqual(pathTo(request, data.you, 4, 4, options), first);
});

test('the pinned weighted pathfinder preserves expensive-tile avoidance when cloning grids', () => {
    const PF = require('pathfinding');
    const costs = [[0, 0, 0, 0, 0], [0, 200, 200, 200, 0], [0, 0, 0, 0, 0]];
    const grid = new PF.Grid(5, 3, Array.from({ length: 3 }, () => Array(5).fill(0)), costs);
    const finder = new PF.AStarFinder({ allowDiagonal: false, useCost: true });
    for (let iteration = 0; iteration < 2; iteration++) {
        const path = finder.findPath(0, 1, 4, 1, grid.clone());
        assert.equal(path.length, 7);
        assert.ok(path.every(([x, y]) => costs[y][x] === 0));
    }
});

test('virtual enemy-head distance targets do not inherit flood-fill counts or allow stepping onto a head', () => {
    const you = snake('you', [{ x: 1, y: 2 }, { x: 1, y: 1 }, { x: 1, y: 0 }]);
    const other = snake('other', [{ x: 3, y: 2 }, { x: 3, y: 1 }, { x: 3, y: 0 }]);
    const request = new StrategyRequest(board(you, [other]));
    const path = pathTo(request, you, 3, 2, { blockHeads: false, attackHeads: false });
    assert.equal(path.direction, 'right');
    assert.equal(floodFill(request, 3, 2), 0);
    assert.equal(isFree(request, 3, 2), false);
});
