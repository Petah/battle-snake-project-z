import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readdir, readFile, rm, rename, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import registry from '../server/snakes';
import { Server } from '../server/Server';
import { applyElo, Rating } from './ratings';
import { evaluationOptions, schedule } from './schedule';
import { runMatch } from './runMatch';
import { htmlReport } from './report';
import type { EvaluationOptions, EvaluationReport, Latency, MatchResult } from './types';
const exec = promisify(execFile);

export function standings(names: string[], matches: MatchResult[]) {
    const ratings = new Map<string, Rating>(names.map(name => [name, { name, elo: 1500, games: 0, wins: 0, draws: 0, losses: 0 }]));
    // Parallel games are always rated in schedule order, never completion order.
    for (const match of [...matches].sort((a, b) => a.index - b.index)) if (match.status === 'rated') applyElo(ratings, match);
    return [...ratings.values()].map(rating => {
        const latency: Latency = { count: 0, total: 0, max: 0, histogram: {} };
        let failed = 0;
        for (const match of matches) {
            if (match.status === 'failed' && match.players.includes(rating.name)) failed++;
            const sample = match.latency[rating.name];
            if (!sample) continue;
            latency.count += sample.count; latency.total += sample.total; latency.max = Math.max(latency.max, sample.max);
            for (const [ms, count] of Object.entries(sample.histogram)) latency.histogram[ms] = (latency.histogram[ms] ?? 0) + count;
        }
        let cumulative = 0, p95Ms = 0;
        for (const [ms, count] of Object.entries(latency.histogram).sort(([a], [b]) => Number(a) - Number(b))) {
            cumulative += count; if (cumulative >= latency.count * 0.95) { p95Ms = Number(ms); break; }
        }
        return { ...rating, failed, averageMs: latency.count ? latency.total / latency.count : 0, p95Ms, maxMs: latency.max, moveCount: latency.count };
    }).sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name));
}

export interface EvaluationConfig {
    cli: string; directory: string; signal?: AbortSignal;
    progress?: (completed: number, total: number, result: MatchResult) => void;
}
export async function evaluate(value: Partial<EvaluationOptions>, config: EvaluationConfig): Promise<EvaluationReport> {
    const options = evaluationOptions(value);
    let cliVersion: string;
    try {
        await exec(config.cli, ['--help'], { timeout: 3000 });
        const candidates = config.cli.includes(path.sep) ? [path.resolve(config.cli)] : (process.env.PATH ?? '').split(path.delimiter).map(folder => path.join(folder, config.cli));
        const binary = candidates.find(file => existsSync(file));
        cliVersion = binary ? `Rules CLI SHA-256 ${createHash('sha256').update(await readFile(binary)).digest('hex')}` : 'Rules CLI';
    }
    catch { throw new Error('Rules CLI unavailable. Put battlesnake in this project or set BATTLESNAKE_CLI to an executable.'); }
    let revision = 'unknown';
    try { revision = (await exec('git', ['describe', '--always', '--dirty'], { timeout: 3000 })).stdout.trim(); } catch { /* Git is optional for exported builds. */ }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    config.signal?.addEventListener('abort', cancel, { once: true });
    if (config.signal?.aborted) cancel();
    const planned = schedule(options), signal = controller.signal;
    const started = new Date().toISOString(), id = `${started.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const directory = path.resolve(config.directory), folder = path.join(directory, id);
    await mkdir(folder, { recursive: true });
    const scratch = options.keepReplays ? path.join(folder, 'replays') : await mkdtemp(path.join(tmpdir(), 'snake-evaluation-'));
    if (options.keepReplays) await mkdir(scratch);
    const servers: Server[] = [], urls = new Map<string, string>();
    const results: MatchResult[] = [];
    let next = 0, completed = 0;
    try {
        for (const name of options.snakes) {
            const Snake = Object.values(registry).find(item => item.name === name);
            const server = new Server(0, () => new Snake(), { host: '127.0.0.1', version: revision }); servers.push(server);
            if (!server.httpServer.listening) await once(server.httpServer, 'listening');
            urls.set(name, `http://127.0.0.1:${(server.httpServer.address() as { port: number }).port}`);
        }
        const workers = Array.from({ length: options.concurrency }, async () => {
            try {
                while (!signal.aborted && next < planned.length) {
                    const duel = planned[next++];
                    const result = await runMatch(config.cli, duel, options, urls, path.join(scratch, `${String(duel.index).padStart(4, '0')}.jsonl`), signal);
                    results[duel.index] = result;
                    config.progress?.(++completed, planned.length, result);
                }
            } catch (error) { controller.abort(); throw error; }
        });
        const settled = await Promise.allSettled(workers);
        const rejected = settled.find(result => result.status === 'rejected');
        if (rejected?.status === 'rejected') throw rejected.reason;
    } finally {
        config.signal?.removeEventListener('abort', cancel);
        await Promise.all(servers.map(server => server.close()));
        if (!options.keepReplays) await rm(scratch, { recursive: true, force: true });
    }
    const matches = results.filter(Boolean);
    const report: EvaluationReport = { formatVersion: 1, id, started, finished: new Date().toISOString(), options, revision, cliVersion,
        status: signal.aborted ? 'cancelled' : 'finished', scheduled: planned.length, completed: matches.length,
        rated: matches.filter(match => match.status === 'rated').length, matches, rankings: standings(options.snakes, matches) };
    const json = JSON.stringify(report, null, 2);
    await writeFile(path.join(folder, 'report.json'), json);
    await writeFile(path.join(folder, 'report.html'), htmlReport(report));
    // Publish only completed reports. A cancelled run remains in its own folder.
    if (report.status === 'finished') {
        const temporary = path.join(directory, `${id}.latest.tmp`);
        await writeFile(temporary, json);
        await rename(temporary, path.join(directory, 'latest.json'));
        await writeFile(path.join(directory, 'latest.html'), htmlReport(report));
    }
    // Compact reports are cheap; keep twenty runs. Replays are opt-in and removed
    // with their run, rather than accumulating forever.
    const candidates = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}T[\w-]+$/.test(entry.name));
    // Another local evaluator may still be writing its run. Only prune reports
    // that have finished publishing their HTML as well as their JSON.
    const entries = (await Promise.all(candidates.map(async entry => {
        try { return (await stat(path.join(directory, entry.name, 'report.html'))).isFile() ? entry : undefined; }
        catch { return undefined; }
    }))).filter(Boolean).sort((a, b) => b.name.localeCompare(a.name));
    for (const old of entries.slice(20)) if (old.name !== id) await rm(path.join(directory, old.name), { recursive: true });
    return report;
}
