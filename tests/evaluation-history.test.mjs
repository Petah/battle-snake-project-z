import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { require } from './helpers.mjs';
const { evaluationHistory } = require('../dist/evaluation/history.js');
const { comparisonKey, historyChart, historyValue } = require('../dist/shared/evaluationHistory.js');
const { DashboardServer } = require('../dist/dashboard/DashboardServer.js');
function run(index, changes = {}) {
    const finished = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
    return { formatVersion: 1, id: `${finished.replace(/[:.]/g, '-')}-test`, started: finished, finished,
        options: { snakes: ['ProjectZ', 'Rando'], width: 11, height: 11, seed: 42, rounds: 1, timeout: 500, maxSeconds: 30, concurrency: 1, keepReplays: false },
        status: 'finished', revision: 'abc123', cliVersion: 'engine', rated: 2, scheduled: 2,
        rankings: [{ name: 'ProjectZ', elo: 1516, games: 2, wins: 1, draws: 1, losses: 0, failed: 0, averageMs: 2, p95Ms: 4, maxMs: 6, moveCount: 10 }], matches: [{ bulky: 'not needed by history' }], ...changes };
}
async function directory(t) {
    const dir = await mkdtemp(join(tmpdir(), 'snake-history-')); t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}
async function save(dir, report) { const folder = join(dir, report.id); await mkdir(folder); await writeFile(join(folder, 'report.json'), JSON.stringify(report)); }

test('history reads completed reports chronologically, caps at twenty and omits match payloads', async t => {
    const dir = await directory(t);
    assert.deepEqual(await evaluationHistory(join(dir, 'missing')), { runs: [], skipped: 0 });
    for (let index = 24; index >= 0; index--) await save(dir, run(index));
    await save(dir, run(25, { status: 'cancelled' }));
    await mkdir(join(dir, run(26).id)); // Running evaluation.
    const result = await evaluationHistory(dir);
    assert.equal(result.runs.length, 20); assert.equal(result.skipped, 0);
    assert.equal(result.runs[0].id, run(5).id); assert.equal(result.runs.at(-1).id, run(24).id);
    assert.equal(result.runs[0].matches, undefined);
});

test('history skips malformed reports and symlinks; dashboard exposes compact history', async t => {
    const dir = await directory(t); await save(dir, run(0));
    await save(dir, run(1, { rankings: [{}] }));
    const bad = join(dir, run(2).id); await mkdir(bad); await writeFile(join(bad, 'report.json'), '{');
    const linked = join(dir, run(3).id); await mkdir(linked); await symlink(join(dir, run(0).id, 'report.json'), join(linked, 'report.json'));
    await symlink(join(dir, run(0).id), join(dir, run(4).id));
    const server = new DashboardServer(0, { evaluationDirectory: dir, directory: join(dir, 'games') });
    await once(server.httpServer, 'listening'); t.after(() => server.close());
    const response = await fetch(`http://127.0.0.1:${server.httpServer.address().port}/api/evaluation/history`);
    assert.equal(response.status, 200);
    const history = await response.json(); assert.equal(history.runs.length, 1); assert.equal(history.skipped, 3);
});

test('comparison settings exclude revisions but include schedule order, engine and budgets', () => {
    const base = run(0), key = comparisonKey(base);
    assert.equal(comparisonKey(run(1, { revision: 'new-code' })), key);
    assert.equal(comparisonKey({ ...base, options: { ...base.options, keepReplays: true } }), key);
    for (const options of [{ snakes: ['Rando', 'ProjectZ'] }, { seed: 43 }, { rounds: 2 }, { timeout: 100 }, { maxSeconds: 20 }, { concurrency: 2 }, { width: 13 }, { height: 13 }]) {
        assert.notEqual(comparisonKey({ ...base, options: { ...base.options, ...options } }), key);
    }
    assert.notEqual(comparisonKey({ ...base, cliVersion: 'different engine' }), key);
});

test('history metrics distinguish win rate from draw-adjusted score and do not invent missing measurements', () => {
    const row = run(0).rankings[0];
    assert.equal(historyValue(row, 'winRate'), 50); assert.equal(historyValue(row, 'score'), 75);
    assert.equal(historyValue({ ...row, failed: 2 }, 'failureRate'), 50);
    assert.equal(historyValue({ ...row, games: 0 }, 'elo'), null);
    assert.equal(historyValue({ ...row, games: 0 }, 'winRate'), null);
    assert.equal(historyValue({ ...row, moveCount: 0 }, 'p95Ms'), null);
    assert.equal(historyValue({ ...row, p95Ms: 0 }, 'p95Ms'), 0);
});

test('chart preserves gaps, renders single runs, and escapes labels', () => {
    const first = run(0), missing = run(1, { rankings: [] }), last = run(2, { revision: '<script>unsafe</script>' });
    const chart = historyChart([first, missing, last], ['ProjectZ'], 'elo');
    assert.equal((chart.match(/<circle /g) ?? []).length, 2);
    assert.equal((chart.match(/stroke-width="2"/g) ?? []).length, 0); // No line over an absent snake.
    assert.ok(chart.includes('&lt;script&gt;unsafe&lt;/script&gt;')); assert.ok(!chart.includes('<script>'));
    assert.equal((historyChart([first, last], ['ProjectZ'], 'elo').match(/stroke-width="2"/g) ?? []).length, 1);
    assert.ok(historyChart([first], ['ProjectZ'], 'elo').includes('cx="445"'));
    assert.match(historyChart([], [], 'elo'), /No measured values/);
});
