import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { gzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture, require } from './helpers.mjs';
const { DashboardServer } = require('../dist/dashboard/DashboardServer.js');
const { RecordingStore } = require('../dist/dashboard/RecordingStore.js');
const { validateMatch, MatchManager } = require('../dist/dashboard/MatchManager.js');

test('dashboard endpoints match registered server ports, including gaps in the roster', () => {
    const { defaultSnakes } = require('../dist/shared/dashboard.js');
    const { default: registry } = require('../dist/server/snakes.js');
    assert.deepEqual(defaultSnakes.map(snake => snake.name), Object.values(registry).map(Snake => Snake.name));
    for (const [port, Snake] of Object.entries(registry)) {
        const endpoint = defaultSnakes.find(snake => snake.name === Snake.name);
        assert.equal(new URL(endpoint.url).port, port);
        assert.equal(new URL(endpoint.websocketUrl).port, String(Number(port) + 10000));
        assert.equal(new Snake().port, Number(port));
    }
});

async function directory(t) {
    const dir = await mkdtemp(join(tmpdir(), 'project-z-dashboard-'));
    t.after(() => rm(dir, { recursive: true, force: true })); return await realpath(dir);
}
async function dashboard(t, options) {
    const server = new DashboardServer(0, options); await once(server.httpServer, 'listening');
    t.after(() => server.close()); const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    return { server, base, request: (route, options) => fetch(base + route, { signal: AbortSignal.timeout(5000), ...options }) };
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function until(check) {
    for (let i = 0; i < 100; i++) { const result = await check(); if (result) return result; await delay(25); }
    throw new Error('Timed out waiting for match');
}

test('recording store reads legacy JSON, current gzip snapshots, and CLI replays; deletes one selection', async t => {
    const dir = await directory(t), body = fixture(), legacy = fixture(); delete legacy.game.ruleset;
    await writeFile(join(dir, 'legacy.json'), JSON.stringify({ start: legacy, moves: [null, { ...legacy, turn: 1 }] }));
    await mkdir(join(dir, 'game', 'snake'), { recursive: true });
    await writeFile(join(dir, 'game', 'snake', '0000_start.json.gz'), gzipSync(JSON.stringify({ body, coordinateSystem: 'bottom-left', logs: [['hello']] })));
    await writeFile(join(dir, 'match.jsonl'), `${JSON.stringify(body)}\n${JSON.stringify({ ...body, turn: 1 })}\n{"winnerName":"ProjectZ"}\n`);
    await writeFile(join(dir, 'invalid.json'), '{}');
    await symlink(join(dir, 'legacy.json'), join(dir, 'linked.json'));
    const store = new RecordingStore(dir);
    assert.equal((await store.list()).length, 4);
    assert.equal((await store.read(store.id('legacy.json'))).frames[0].origin, 'top-left');
    const snapshots = await store.read(store.id('game/snake'));
    assert.equal(snapshots.frames[0].origin, 'bottom-left'); assert.deepEqual(snapshots.frames[0].logs, [['hello']]);
    const match = await store.read(store.id('match.jsonl')); assert.equal(match.frames.length, 2); assert.equal(match.winner, 'ProjectZ');
    for (const invalid of ['../outside.json', '', 'linked.json', 'invalid.json']) await assert.rejects(store.read(store.id(invalid)));
    await store.delete(store.id('game/snake'));
    assert.equal((await store.list()).length, 3); assert.ok(await readFile(join(dir, 'legacy.json')));
    const protectedStore = new RecordingStore(dir, file => file === join(dir, 'match.jsonl'));
    await assert.rejects(protectedStore.delete(store.id('match.jsonl')), error => error.status === 409);
});

test('dashboard serves SvelteKit assets with bootstrap hashes, analyzes boards, and rejects cross-site, foreign-host and invalid requests', async t => {
    const dir = await directory(t); await writeFile(join(dir, 'game.json'), JSON.stringify(fixture()));
    const { request, base } = await dashboard(t, { directory: dir, cli: '/missing/cli' });
    const page = await request('/'); assert.equal(page.status, 200);
    const html = await page.text(); assert.match(html, /Start match/);
    const csp = page.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/); assert.match(csp, /'sha256-/); assert.doesNotMatch(csp, /unsafe-inline/);
    assert.match(csp, /style-src-attr 'unsafe-hashes' 'sha256-/);
    const asset = html.match(/(?:\.\/|\/)_app\/immutable\/[^" ]+\.js/)[0];
    assert.equal((await request(new URL(asset, base).pathname)).status, 200);
    const config = await (await request('/api/config')).json(); assert.equal(config.cliAvailable, false);
    assert.deepEqual(config.snakes.map(snake => snake.name), Object.values(require('../dist/server/snakes.js').default).map(Snake => Snake.name));
    const [recording] = await (await request('/api/recordings')).json();
    const analysis = await request(`/api/recordings/${recording.id}/analyze`, json('POST', { frame: 0 }));
    assert.equal(analysis.status, 200); assert.equal((await analysis.json()).length, 3);
    assert.equal((await request(`/api/recordings/${recording.id}/analyze`, json('POST', { frame: -1 }))).status, 400);
    assert.equal((await request('/api/matches', json('POST', {}))).status, 400);
    assert.equal((await request('/api/recordings', { headers: { Origin: 'https://evil.example' } })).status, 403);
    const foreignHostStatus = await new Promise(resolve => { httpRequest(new URL('/api/recordings', base), { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).end(); });
    assert.equal(foreignHostStatus, 403);
    assert.equal((await request(`/api/recordings/${recording.id}`, { method: 'DELETE', headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await request(`/api/recordings/${recording.id}`)).status, 200);
});

test('CLI matches stream frames, protect active recordings, stop processes, and enforce concurrent limits', async t => {
    const dir = await directory(t), cli = join(dir, 'cli');
    const source = `#!${process.execPath}\nconst fs=require('node:fs'); if(process.argv.includes('--help')) process.exit(0); const args=process.argv.slice(2); const output=args[args.indexOf('--output')+1]; fs.writeFileSync(output,${JSON.stringify(JSON.stringify(fixture()) + '\n')}); setInterval(()=>{},1000);`;
    await writeFile(cli, source, { mode: 0o700 });
    const snake = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"apiversion":"1"}'); });
    snake.listen(0, '127.0.0.1'); await once(snake, 'listening'); t.after(() => new Promise(resolve => snake.close(resolve)));
    const { request, server, base } = await dashboard(t, { directory: dir, cli });
    const options = { width: 11, height: 11, seed: 42, timeout: 500, gametype: 'solo', snakes: [{ name: '--bad; $(echo injected)', url: `http://127.0.0.1:${snake.address().port}` }] };
    assert.equal(validateMatch(options).snakes[0].name, options.snakes[0].name);
    assert.throws(() => validateMatch({ ...options, snakes: [{ name: 'Bad', url: 'file:///tmp/test' }] }));
    const responses = await Promise.all(Array.from({ length: 5 }, () => request('/api/matches', json('POST', options))));
    assert.equal(responses.filter(response => response.status === 201).length, 4); assert.equal(responses.filter(response => response.status === 409).length, 1);
    const state = await responses.find(response => response.status === 201).json();
    await until(() => server.matches.get(state.id).frame);
    const abort = new AbortController(); const events = await fetch(`${base}/api/matches/${state.id}/events`, { signal: abort.signal });
    const reader = events.body.getReader(); assert.match(new TextDecoder().decode((await reader.read()).value), /"turn":0/); abort.abort();
    assert.equal((await request(`/api/recordings/${state.recordingId}`, { method: 'DELETE' })).status, 409);
    const stopped = await (await request(`/api/matches/${state.id}/stop`, json('POST', {}))).json(); assert.equal(stopped.status, 'stopped');
    await until(() => !server.matches.isActive(join(dir, 'matches', `${state.id}.jsonl`)));
    assert.equal((await request(`/api/recordings/${state.recordingId}`, { method: 'DELETE' })).status, 200);
    for (const other of server.matches.list()) server.matches.stop(other.id);
    const unavailable = { ...options, snakes: [{ name: 'Offline', url: 'http://127.0.0.1:1' }] };
    assert.equal((await request('/api/matches', json('POST', unavailable))).status, 422);
});

test('completed CLI processes retain winner and replay frames; a missing executable reports an actionable failure', async t => {
    const dir = await directory(t), cli = join(dir, 'cli');
    await writeFile(cli, `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.writeFileSync(args[args.indexOf('--output')+1],${JSON.stringify(JSON.stringify(fixture()) + '\n' + JSON.stringify({ winnerName: 'Test' }) + '\n')});`, { mode: 0o700 });
    const snake = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"apiversion":"1"}'); });
    snake.listen(0, '127.0.0.1'); await once(snake, 'listening'); t.after(() => new Promise(resolve => snake.close(resolve)));
    const options = { width: 11, height: 11, seed: 42, timeout: 500, gametype: 'solo', snakes: [{ name: 'Test', url: `http://127.0.0.1:${snake.address().port}` }] };
    const { server } = await dashboard(t, { directory: dir, cli });
    const started = await server.matches.start(options);
    const completed = await until(() => { const state = server.matches.get(started.id); return state.status === 'finished' && state; });
    assert.equal(completed.winner, 'Test'); assert.equal(completed.frame.turn, 0);
    assert.equal((await server.recordings.read(completed.recordingId)).winner, 'Test');
    const { server: missing } = await dashboard(t, { directory: dir, cli: join(dir, 'missing') });
    const failed = await missing.matches.start(options);
    await until(() => missing.matches.get(failed.id).status === 'failed');
    assert.match(missing.matches.get(failed.id).error, /BATTLESNAKE_CLI/);
});


test('shutdown cancels a match pending snake availability checks', async t => {
    const dir = await directory(t);
    let respond;
    const incoming = new Promise(resolve => { respond = resolve; });
    const snake = createServer((_req, res) => respond(res));
    snake.listen(0, '127.0.0.1'); await once(snake, 'listening'); t.after(() => new Promise(resolve => snake.close(resolve)));
    const manager = new MatchManager('/missing/cli', dir);
    const starting = manager.start({ width: 11, height: 11, seed: 42, timeout: 500, gametype: 'solo', snakes: [{ name: 'Test', url: `http://127.0.0.1:${snake.address().port}` }] });
    const response = await incoming; await manager.close(); response.setHeader('Content-Type', 'application/json'); response.end('{"apiversion":"1"}');
    await assert.rejects(starting, error => error.status === 503);
    assert.equal(manager.list().length, 0);
});

test('oversized active CLI recordings stop their writer process before unlimited growth', async t => {
    const dir = await directory(t), cli = join(dir, 'cli');
    await writeFile(cli, `#!${process.execPath}\nconst fs=require('node:fs'); const args=process.argv.slice(2);const output=args[args.indexOf('--output')+1];fs.writeFileSync(output,${JSON.stringify(JSON.stringify(fixture()) + '\n')}); setTimeout(()=>{const fd=fs.openSync(output,'r+');fs.ftruncateSync(fd,100*1024*1024+1);fs.closeSync(fd);},300);setInterval(()=>{},1000);`, { mode: 0o700 });
    const snake = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"apiversion":"1"}'); });
    snake.listen(0, '127.0.0.1'); await once(snake, 'listening'); t.after(() => new Promise(resolve => snake.close(resolve)));
    const { server } = await dashboard(t, { directory: dir, cli });
    const state = await server.matches.start({ width: 11, height: 11, seed: 42, timeout: 500, gametype: 'solo', snakes: [{ name: 'Test', url: `http://127.0.0.1:${snake.address().port}` }] });
    await until(() => server.matches.get(state.id).status === 'stopped');
    assert.match(server.matches.get(state.id).error, /100 MB limit/);
    await until(() => !server.matches.isActive(join(dir, 'matches', `${state.id}.jsonl`)));
});
