import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { require, fixture, startServer } from './helpers.mjs';

const snakes = require('../dist/server/snakes.js').default;
const { BaseSnake } = require('../dist/server/snakes/base-snake.js');
const { Writer } = require('../dist/lib/writeFile.js');

for (const SnakeType of Object.values(snakes)) {
    test(`${SnakeType.name} serves API v1 metadata and a complete game lifecycle`, async t => {
        const request = await startServer(t, () => new SnakeType(), { author: 'test-author', version: 'test-version' });
        const info = await request('/');
        assert.equal(info.status, 200);
        assert.equal(info.body.apiversion, '1');
        assert.match(info.body.color, /^#[0-9a-f]{6}$/i);
        assert.equal(typeof info.body.head, 'string');
        assert.equal(typeof info.body.tail, 'string');
        assert.equal(info.body.author, 'test-author');
        assert.equal(info.body.version, 'test-version');
        assert.equal(info.body.headType, undefined);
        assert.equal(info.body.tailType, undefined);
        const data = fixture();
        assert.deepEqual(await request('/start', data), { status: 200, body: {} });
        const move = await request('/move', { ...data, turn: 1 });
        assert.equal(move.status, 200);
        assert.ok(['up', 'down', 'left', 'right'].includes(move.body.move));
        const end = structuredClone(data);
        end.board.snakes = [];
        end.you.body[0].x = -1;
        end.you.head.x = -1;
        end.you.health = 0;
        assert.deepEqual(await request('/end', end), { status: 200, body: {} });
        assert.deepEqual(await request('/end', end), { status: 200, body: {} });
        assert.equal((await request('/unknown')).status, 404);
    });
}

class CounterSnake extends BaseSnake {
    count = 0;
    starts = 0;
    start() { this.starts++; }
    move(data) {
        assert.deepEqual(data.cache, {});
        assert.equal(data.log, undefined);
        data.cache.used = true;
        return { move: ++this.count === 1 ? 'up' : 'right', shout: String(this.starts) };
    }
}

test('isolates games and snake IDs, ignores duplicate starts, initializes missing starts, and cleans up', async t => {
    const request = await startServer(t, () => new CounterSnake());
    const a = fixture('game-a');
    const b = fixture('game-b');
    const c = fixture('game-a');
    c.you.id = 'snake-b';
    for (const data of [a, b, c]) {
        assert.equal((await request('/start', data)).status, 200);
        assert.deepEqual((await request('/move', data)).body, { move: 'up', shout: '1' });
    }
    await request('/start', a);
    assert.deepEqual((await request('/move', a)).body, { move: 'right', shout: '1' });
    await request('/end', a);
    assert.deepEqual((await request('/move', b)).body, { move: 'right', shout: '1' });
    assert.deepEqual((await request('/move', c)).body, { move: 'right', shout: '1' });
    assert.deepEqual((await request('/move', { ...a, cache: { injected: true }, log: ['injected'] })).body, { move: 'up', shout: '1' });
});

test('rejects malformed JSON and incomplete or inconsistent API requests promptly', async t => {
    const request = await startServer(t, () => new CounterSnake());
    assert.equal((await request('/move', '{', true)).status, 400);
    const invalid = [ {}, { ...fixture(), turn: -1 }, { ...fixture(), you: {} } ];
    const missingHazards = fixture();
    delete missingHazards.board.hazards;
    invalid.push(missingHazards);
    const badHead = fixture();
    badHead.you.head = { x: 2, y: 2 };
    invalid.push(badHead);
    const badLength = fixture();
    badLength.you.length = 99;
    invalid.push(badLength);
    for (const body of invalid) {
        for (const route of ['/start', '/move', '/end']) assert.equal((await request(route, body)).status, 400);
    }
});

test('strategy errors and invalid moves fall back to an available tile; trapped boards still return a direction', async t => {
    t.mock.method(console, 'error', () => {});
    for (const result of [undefined, { move: 0 }, { move: 'diagonal' }, 'throw']) {
        class BrokenSnake extends BaseSnake {
            move() { if (result === 'throw') throw new Error('strategy error'); return result; }
        }
        const request = await startServer(t, () => new BrokenSnake());
        const data = fixture();
        data.you.body = [{ x: 1, y: 2 }, { x: 1, y: 1 }, { x: 1, y: 0 }];
        data.you.head = data.you.body[0];
        assert.deepEqual((await request('/move', data)).body, { move: 'left' });
        data.board.width = 1;
        data.you.body = [{ x: 0, y: 2 }, { x: 0, y: 1 }, { x: 0, y: 0 }];
        data.you.head = data.you.body[0];
        assert.deepEqual((await request('/move', data)).body, { move: 'up' });
    }
});

test('initialization errors complete /start and still produce a fallback on /move', async t => {
    t.mock.method(console, 'error', () => {});
    class BrokenStart extends BaseSnake {
        start() { throw new Error('initialization error'); }
        move() { throw new Error('uninitialized'); }
    }
    const request = await startServer(t, () => new BrokenStart());
    assert.equal((await request('/start', fixture())).status, 500);
    assert.deepEqual((await request('/move', fixture())).body, { move: 'up' });
});

test('caps shouts at 256 characters', async t => {
    class ShoutingSnake extends BaseSnake {
        move() { return { move: 'up', shout: 'a'.repeat(300) }; }
    }
    const request = await startServer(t, () => new ShoutingSnake());
    assert.equal((await request('/move', fixture())).body.shout.length, 256);
});

test('records concurrent games under distinct safe filenames without internal caches or injected logs', async t => {
    const directory = await mkdtemp(join(tmpdir(), 'snake-recordings-'));
    Writer.enabled = true;
    t.after(async () => { Writer.enabled = false; await rm(directory, { recursive: true, force: true }); });
    const request = await startServer(t, () => new CounterSnake(), { saveGame: true, recordingDirectory: directory });
    for (const id of ['../game-a', 'game-b']) {
        const data = { ...fixture(id), cache: { injected: true }, log: ['injected'] };
        await request('/start', data);
        await request('/move', data);
        await request('/end', data);
    }
    const files = await readdir(directory);
    assert.equal(files.length, 2);
    for (const file of files) {
        const recording = JSON.parse(await readFile(join(directory, file), 'utf8'));
        assert.equal(recording.apiVersion, '1');
        assert.equal(recording.coordinateSystem, 'bottom-left');
        assert.equal(recording.start.cache, undefined);
        assert.equal(recording.start.log, undefined);
        assert.equal(recording.moves[0].cache, undefined);
        assert.equal(recording.end.cache, undefined);
    }
});
