import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, utimes, symlink, readdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, require } from './helpers.mjs';
const { RecordingStore } = require('../dist/dashboard/RecordingStore.js');
const { DashboardServer } = require('../dist/dashboard/DashboardServer.js');
const { once } = await import('node:events');

async function directory(t) {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'snake-retention-')));
    t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}

test('retention expires old replays and removes oldest files to meet size cap, preserving active matches and symlinks', async t => {
    const dir = await directory(t), now = Date.now(), day = 86400000;
    async function file(name, size, age) { const filename = join(dir, name); await writeFile(filename, 'x'.repeat(size)); await utimes(filename, new Date(now - age), new Date(now - age)); }
    await file('active.jsonl', 8, 10 * day);
    await file('expired.json', 4, 8 * day);
    await file('older.jsonl', 12, 2 * day);
    await file('newer.jsonl', 12, day);
    await mkdir(join(dir, 'snapshots'));
    await writeFile(join(dir, 'snapshots', '0000_start.json.gz'), 'snapshot');
    await utimes(join(dir, 'snapshots', '0000_start.json.gz'), new Date(now - 8 * day), new Date(now - 8 * day));
    await writeFile(join(dir, 'keep.txt'), 'unrelated');
    await symlink(join(dir, 'keep.txt'), join(dir, 'linked.json'));
    const store = new RecordingStore(dir, file => file === join(dir, 'active.jsonl'));
    assert.deepEqual(await store.prune({ maxAgeDays: 7, maxBytes: 24 }, now), { deleted: 3, bytes: 20 });
    assert.deepEqual((await readdir(dir)).sort(), ['active.jsonl', 'keep.txt', 'linked.json', 'newer.jsonl']);
    await assert.rejects(store.prune({ maxAgeDays: 0, maxBytes: 24 }));
});

test('snapshot age uses the most recent turn and retention never deletes active files even over the cap', async t => {
    const dir = await directory(t), now = Date.now();
    await mkdir(join(dir, 'snake'));
    await writeFile(join(dir, 'snake', '0000_start.json.gz'), 'old');
    await writeFile(join(dir, 'snake', '0001_move.json.gz'), 'new');
    await utimes(join(dir, 'snake', '0000_start.json.gz'), new Date(0), new Date(0));
    const store = new RecordingStore(dir);
    assert.equal((await store.prune({ maxAgeDays: 7, maxBytes: 100 }, now)).deleted, 0);
    const active = new RecordingStore(dir, () => true);
    assert.deepEqual(await active.prune({ maxAgeDays: 7, maxBytes: 1 }, now), { deleted: 0, bytes: 6 });
});

test('dashboard runs configured retention at startup while default local dashboards retain recordings', async t => {
    const dir = await directory(t), file = join(dir, 'old.json');
    await writeFile(file, JSON.stringify(fixture())); await utimes(file, new Date(0), new Date(0));
    const local = new DashboardServer(0, { directory: dir }); await once(local.httpServer, 'listening');
    assert.equal((await local.recordings.list()).length, 1); await local.close();
    const production = new DashboardServer(0, { directory: dir, retention: { maxAgeDays: 7, maxBytes: 1024 } });
    await once(production.httpServer, 'listening'); t.after(() => production.close());
    await production.cleanupRecordings(); assert.equal((await production.recordings.list()).length, 0);
});
