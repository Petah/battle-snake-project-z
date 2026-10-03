import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { require } from './helpers.mjs';
const { applyElo } = require('../dist/evaluation/ratings.js');
const { evaluationOptions, schedule } = require('../dist/evaluation/schedule.js');
const { evaluate, standings } = require('../dist/evaluation/evaluate.js');
const { runMatch } = require('../dist/evaluation/runMatch.js');
const { htmlReport } = require('../dist/evaluation/report.js');
const { DashboardServer } = require('../dist/dashboard/DashboardServer.js');

async function directory(t) {
    const dir = await mkdtemp(join(tmpdir(), 'snake-evaluation-test-'));
    t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}
async function engine(dir, mode = 'win') {
    const file = join(dir, `engine-${mode}`);
    await writeFile(file, `#!${process.execPath}
const fs = require('node:fs');
if (process.argv.includes('--help')) process.exit(0);
const args = process.argv.slice(2), output = args[args.indexOf('--output') + 1];
const names = args.filter(value => value.startsWith('--name=')).map(value => value.slice(7));
const mode = ${JSON.stringify(mode)};
if (mode === 'hang') { setInterval(() => {}, 1000); }
else {
    const frames = [0, 1, 2].map(turn => ({ turn, board: { snakes: names.map(name => ({ name, latency: turn ? '7' : '0' })) } }));
    if (mode !== 'incomplete') frames.push({ winnerName: mode === 'draw' ? '' : names[0], isDraw: mode === 'draw' });
    fs.writeFileSync(output, frames.map(frame => JSON.stringify(frame)).join('\\n') + '\\n');
    if (mode === 'error') console.error('ERROR: request timed out');
    if (mode === 'exit') process.exitCode = 1;
}
`, { mode: 0o700 }); return file;
}

test('Elo updates conserve total rating and draws reward the lower rated snake', () => {
    const ratings = new Map(['A', 'B'].map(name => [name, { name, elo: 1500, games: 0, wins: 0, draws: 0, losses: 0 }]));
    applyElo(ratings, { players: ['A', 'B'], winner: 'A' });
    assert.equal(ratings.get('A').elo, 1516); assert.equal(ratings.get('B').elo, 1484);
    applyElo(ratings, { players: ['B', 'A'], draw: true });
    assert.ok(ratings.get('B').elo > 1484); assert.equal(ratings.get('A').elo + ratings.get('B').elo, 3000);
    assert.equal(ratings.get('A').wins, 1); assert.equal(ratings.get('B').losses, 1);
    assert.equal(ratings.get('A').draws, 1); assert.equal(ratings.get('A').games, 2);
    assert.throws(() => applyElo(ratings, { players: ['A', 'B'], winner: 'C' }));
});

test('schedule balances every pairing and seed in both orders; invalid options are rejected', () => {
    const options = evaluationOptions({ rounds: 2 }); const duels = schedule(options);
    assert.equal(duels.length, 180);
    for (let index = 0; index < duels.length; index += 2) {
        assert.deepEqual(duels[index].players, [...duels[index + 1].players].reverse());
        assert.equal(duels[index].seed, duels[index + 1].seed);
        assert.equal(duels[index].seed, 42 + duels[index].round);
    }
    assert.deepEqual(evaluationOptions({ snakes: ['projectz', 'rando'] }).snakes, ['ProjectZ', 'Rando']);
    for (const invalid of [{ snakes: ['Rando'] }, { snakes: ['Rando', 'rando'] }, { snakes: ['Rando', 'unknown'] }, { width: 10 }, { rounds: 0 }, { concurrency: 5 }, { seed: Number.MAX_SAFE_INTEGER, rounds: 2 }]) assert.throws(() => evaluationOptions(invalid));
});

test('rankings use schedule order, exclude failures from Elo, and aggregate latency percentiles', () => {
    const matches = [
        { index: 0, players: ['A', 'B'], status: 'rated', winner: 'A', latency: { A: { count: 20, total: 29, max: 10, histogram: { 1: 19, 10: 1 } } } },
        { index: 1, players: ['B', 'A'], status: 'rated', draw: true, latency: {} },
        { index: 2, players: ['A', 'B'], status: 'failed', winner: 'B', latency: {} }
    ];
    const ranking = standings(['A', 'B'], matches);
    assert.deepEqual(ranking, standings(['A', 'B'], [...matches].reverse()));
    const a = ranking.find(row => row.name === 'A');
    assert.equal(a.games, 2); assert.equal(a.failed, 1); assert.equal(a.p95Ms, 1); assert.equal(a.maxMs, 10); assert.equal(a.averageMs, 1.45);
});

test('engine outcomes distinguish wins, draws, communication failures and incomplete runs', async t => {
    const dir = await directory(t), options = evaluationOptions({ snakes: ['ProjectZ', 'Rando'] });
    const duel = schedule(options)[0], urls = new Map(duel.players.map(name => [name, 'http://127.0.0.1:1']));
    for (const mode of ['win', 'draw', 'error', 'incomplete', 'exit']) {
        const file = join(dir, `${mode}.jsonl`);
        const result = await runMatch(await engine(dir, mode), duel, options, urls, file, new AbortController().signal);
        assert.equal(result.status, mode === 'win' || mode === 'draw' ? 'rated' : 'failed', mode);
        if (mode === 'win') { assert.equal(result.winner, 'ProjectZ'); assert.equal(result.latency.ProjectZ.count, 2); }
        if (mode === 'draw') { assert.equal(result.draw, true); assert.equal(result.winner, undefined); }
        if (mode === 'error') assert.match(result.error, /communication/);
        await assert.rejects(access(file));
    }
});

test('hung matches are bounded and cancellation stops the engine', async t => {
    const dir = await directory(t), cli = await engine(dir, 'hang');
    const options = evaluationOptions({ snakes: ['ProjectZ', 'Rando'], maxSeconds: 1 });
    const duel = schedule(options)[0], urls = new Map(), controller = new AbortController();
    const result = await runMatch(cli, duel, options, urls, join(dir, 'timeout.jsonl'), controller.signal);
    assert.equal(result.status, 'failed'); assert.match(result.error, /exceeded 1 seconds/);
    const running = runMatch(cli, duel, options, urls, join(dir, 'cancel.jsonl'), controller.signal);
    setTimeout(() => controller.abort(), 50);
    assert.equal((await running).status, 'cancelled');
});

test('evaluation publishes reports, serves dashboard rankings, and preserves latest on cancellation', async t => {
    const dir = await directory(t), cli = await engine(dir), output = join(dir, 'evaluations');
    const report = await evaluate({ snakes: ['ProjectZ', 'Rando'], rounds: 2, concurrency: 2 }, { cli, directory: output });
    assert.equal(report.scheduled, 4); assert.equal(report.rated, 4);
    for (const row of report.rankings) { assert.equal(row.wins, 2); assert.equal(row.losses, 2); assert.equal(row.games, 4); }
    assert.equal((await readdir(join(output, report.id))).length, 2);
    assert.deepEqual(JSON.parse(await readFile(join(output, 'latest.json'), 'utf8')), JSON.parse(JSON.stringify(report)));
    const server = new DashboardServer(0, { directory: join(dir, 'games'), evaluationDirectory: output, cli });
    await once(server.httpServer, 'listening'); t.after(() => server.close());
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const response = await fetch(`${base}/api/evaluation/latest`);
    assert.equal(response.status, 200); assert.equal((await response.json()).id, report.id);
    const controller = new AbortController(); controller.abort();
    const cancelled = await evaluate({ snakes: ['ProjectZ', 'Rando'] }, { cli, directory: output, signal: controller.signal });
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.completed, 0);
    assert.equal(JSON.parse(await readFile(join(output, 'latest.json'), 'utf8')).id, report.id);
    const unsafe = htmlReport({ ...report, revision: '</script><script>alert(1)</script>' });
    assert.ok(!unsafe.includes('</script><script>alert(1)</script>'));
});

test('dashboard explains when no local evaluation exists', async t => {
    const dir = await directory(t);
    const server = new DashboardServer(0, { directory: join(dir, 'games'), evaluationDirectory: join(dir, 'missing') });
    await once(server.httpServer, 'listening'); t.after(() => server.close());
    const response = await fetch(`http://127.0.0.1:${server.httpServer.address().port}/api/evaluation/latest`);
    assert.equal(response.status, 404); assert.match((await response.json()).error, /evaluate/);
});

test('report retention keeps twenty finished runs and skips another active evaluation', async t => {
    const dir = await directory(t), output = join(dir, 'evaluations');
    for (let index = 0; index < 21; index++) {
        const folder = join(output, `2020-01-01T00-00-${String(index).padStart(2, '0')}-000-run`);
        await mkdir(folder, { recursive: true }); await writeFile(join(folder, 'report.html'), 'finished');
    }
    const active = join(output, '2019-01-01T00-00-00-000-active'); await mkdir(active);
    await evaluate({ snakes: ['ProjectZ', 'Rando'], keepReplays: true }, { cli: await engine(dir), directory: output });
    const folders = (await readdir(output, { withFileTypes: true })).filter(entry => entry.isDirectory());
    assert.equal(folders.length, 21); await access(active);
    await assert.rejects(access(join(output, '2020-01-01T00-00-00-000-run')));
    const latest = JSON.parse(await readFile(join(output, 'latest.json'), 'utf8'));
    assert.equal((await readdir(join(output, latest.id, 'replays'))).length, 2);
});
