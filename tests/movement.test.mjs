import test from 'node:test';
import assert from 'node:assert/strict';
import { require, fixture, snake } from './helpers.mjs';

const { nextPosition, directionTo } = require('../dist/lib/directions.js');
const { randomMove } = require('../dist/lib/randomMove.js');
const { smartRandomMove } = require('../dist/lib/smartRandomMove.js');
const { moveTowardsFood } = require('../dist/lib/moveTowardsFood.js');
const { StrategyRequest } = require('../dist/types/BTData.js');
const { Pather } = require('../dist/lib/Pather.js');

test('directions use bottom-left coordinates and pathfinding returns the matching direction', () => {
    const data = { ...fixture(), cache: {} };
    const pather = new Pather(new StrategyRequest(data));
    for (const [direction, position] of [
        ['up', { x: 1, y: 2 }], ['down', { x: 1, y: 0 }],
        ['left', { x: 0, y: 1 }], ['right', { x: 2, y: 1 }],
    ]) {
        assert.deepEqual(nextPosition(data.you.head, direction), position);
        assert.equal(directionTo(data.you.head, position), direction);
        assert.equal(pather.pathToDirection([[1, 1], [position.x, position.y]]), direction);
    }
    assert.equal(pather.pathToDirection([[1, 1]]), undefined);
    assert.equal(directionTo(data.you.head, { x: 2, y: 2 }), undefined);
});

test('random, scored, food, and pathfinding helpers choose the only open tile above the head', () => {
    const data = fixture();
    data.board.snakes.push(snake('left', Array(3).fill({ x: 0, y: 1 })), snake('right', Array(3).fill({ x: 2, y: 1 })));
    for (let i = 0; i < 10; i++) {
        assert.equal(randomMove(new StrategyRequest(data)), 'up');
        assert.equal(smartRandomMove(new StrategyRequest(data)), 'up');
        assert.equal(moveTowardsFood({ ...data, cache: {} }), 'up');
        assert.equal(new Pather(new StrategyRequest(data)).pathDirection(1, 2), 'up');
    }
});

test('food below the head produces a down move, not an old numeric direction', () => {
    const data = fixture();
    data.you.body = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 0 }];
    data.you.head = data.you.body[0];
    data.board.food = [{ x: 1, y: 0 }];
    assert.equal(moveTowardsFood({ ...data, cache: {} }), 'down');
    assert.equal(new Pather(new StrategyRequest(data)).pathDirection(1, 0), 'down');
});
