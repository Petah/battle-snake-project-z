import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { fixture, require } from './helpers.mjs';
const { renderBoard } = require('../dist/web/board.js');
const { normalizeFrame } = require('../dist/shared/replay.js');
const { SocketMonitor } = require('../dist/web/SocketMonitor.js');

test('SVG board renders API v1 coordinates, hazards, body arrows, and escaped names', () => {
    const body = fixture(); body.board.hazards = [{ x: 2, y: 2 }]; body.you.name = '<script>alert(1)</script>';
    const $ = load(renderBoard(normalizeFrame(body)), { xml: true });
    assert.equal($('rect[data-y="0"]').first().attr('y'), '2');
    assert.equal($('rect[data-y="2"]').first().attr('y'), '0');
    assert.ok($('text').toArray().some(node => $(node).text() === '↑'));
    assert.ok($('title').toArray().some(node => $(node).text().startsWith('Hazard')));
    assert.equal($('script').length, 0);
});

test('replays retain legacy orientation and safely reject empty or malformed frames', () => {
    const body = fixture(); delete body.game.ruleset;
    const frame = normalizeFrame(body);
    const $ = load(renderBoard(frame), { xml: true });
    assert.equal(frame.origin, 'top-left');
    assert.equal($('rect[data-y="0"]').first().attr('y'), '0');
    assert.ok($('text').toArray().some(node => $(node).text() === '↓'));
    assert.equal(normalizeFrame(null), undefined);
    assert.equal(normalizeFrame({ ...body, board: { ...body.board, hazards: {} } }), undefined);
    body.game.ruleset = { name: 17 }; body.you.health = 'bad';
    assert.equal(normalizeFrame(body).body.game.ruleset.name, 'standard');
    assert.equal(normalizeFrame(body).body.you.health, 0);
});

test('socket monitor reconnects and cancels pending connections on disable', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const sockets = [], states = [], frames = [];
    class FakeSocket { constructor() { sockets.push(this); } close() { this.onclose?.(); } }
    const original = globalThis.WebSocket; globalThis.WebSocket = FakeSocket; t.after(() => { globalThis.WebSocket = original; });
    const monitor = new SocketMonitor((...state) => states.push(state), frame => frames.push(frame));
    t.after(() => monitor.close());
    monitor.start([{ name: 'Test', websocketUrl: 'ws://localhost:19001' }]);
    sockets[0].onopen();
    sockets[0].onmessage({ data: JSON.stringify({ data: { body: fixture() } }) });
    sockets[0].onmessage({ data: 'invalid' });
    assert.equal(frames.length, 1); assert.deepEqual(states.at(-1), ['Test', 'connected']);
    sockets[0].close(); t.mock.timers.tick(1000); assert.equal(sockets.length, 2);
    sockets[1].close(); monitor.close(); t.mock.timers.tick(30000); assert.equal(sockets.length, 2);
});
