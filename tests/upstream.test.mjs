import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { require, fixture, snake } from './helpers.mjs';

const { StrategyRequest } = require('../dist/types/BTData.js');
const { isEnemy, isSquad } = require('../dist/lib/isEnemy.js');
const { moveTowardsFoodPf } = require('../dist/lib/moveTowardsFoodPf.js');
const { weight } = require('../dist/lib/weight.js');
const { idToInt } = require('../dist/lib/idToInt.js');
const { Aldo } = require('../dist/server/snakes/aldo.js');

const options = { blockHeads: true, attackHeads: false, borders: false, snakeBodies: false, deadEnds: false };

test('preserves upstream squad recognition and leaves food for a closer teammate', () => {
    const body = fixture();
    body.board.width = body.board.height = 7;
    body.board.food = [{ x: 4, y: 1 }];
    body.you.squad = 'blue';
    const teammate = { ...snake('teammate', [{ x: 3, y: 1 }, { x: 3, y: 0 }, { x: 2, y: 0 }]), squad: 'blue' };
    body.board.snakes.push(teammate);
    assert.equal(isEnemy(body.you, teammate), false);
    assert.equal(isSquad(body.you, teammate, false), true);
    assert.equal(moveTowardsFoodPf(new StrategyRequest(body), options, true), undefined);
    assert.ok(['up', 'down', 'left', 'right'].includes(moveTowardsFoodPf(new StrategyRequest(body), options, false)));
});

test('preserves upstream hazard weighting and deterministic ID ordering', () => {
    const body = fixture();
    body.board.hazards = [{ x: 1, y: 2 }];
    assert.equal(weight(new StrategyRequest(body), 1, 2, options), 5);
    for (const id of ['snake-a', 'snake-b', '1234']) {
        assert.equal(idToInt(id), parseInt(createHash('md5').update(id).digest('hex'), 16));
    }
});

test('Aldo keeps its upstream traversal with API v1 vertical directions', () => {
    const body = fixture();
    body.you.body = [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }];
    body.you.head = body.you.body[0];
    assert.equal(new Aldo().move(new StrategyRequest(body)).move, 'down');
});
