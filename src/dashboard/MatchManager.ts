import { spawn, execFile, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, open, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { MatchOptions, MatchState, SnakeEndpoint } from '../shared/dashboard';
import { DashboardError, normalizeFrame, maxRecordingBytes } from './RecordingStore';

type Runtime = { state: MatchState; child: ChildProcess; file: string; offset: number; partial: string; decoder: StringDecoder; timer?: NodeJS.Timeout; reading?: Promise<void>; lifetime?: NodeJS.Timeout };

export function validateMatch(value: unknown): MatchOptions {
    const options = value as MatchOptions;
    if (!options || !['standard', 'solo'].includes(options.gametype) ||
        !Number.isInteger(options.width) || options.width < 7 || options.width > 25 || options.width % 2 === 0 ||
        !Number.isInteger(options.height) || options.height < 7 || options.height > 25 || options.height % 2 === 0 ||
        !Number.isSafeInteger(options.seed) || !Number.isInteger(options.timeout) || options.timeout < 10 || options.timeout > 5000 ||
        !Array.isArray(options.snakes) || options.snakes.length < (options.gametype === 'solo' ? 1 : 2) ||
        options.snakes.length > (options.gametype === 'solo' ? 1 : 16)) {
        throw new DashboardError('Choose an odd board size from 7 to 25, a valid seed and timeout, and one solo snake or 2–16 standard players.');
    }
    const snakes: SnakeEndpoint[] = options.snakes.map(snake => {
        if (!snake || typeof snake.name !== 'string' || !snake.name.trim() || snake.name.length > 64 || typeof snake.url !== 'string') throw new DashboardError('Every snake needs a name and HTTP URL.');
        let url: URL;
        try { url = new URL(snake.url); } catch { throw new DashboardError('Every snake needs a valid HTTP URL.'); }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new DashboardError('Snake URLs must use HTTP or HTTPS without credentials.');
        return { name: snake.name.trim(), url: url.toString() };
    });
    return { width: options.width, height: options.height, seed: options.seed, timeout: options.timeout, gametype: options.gametype, snakes };
}

export class MatchManager extends EventEmitter {
    private runs = new Map<string, Runtime>();
    private pending = 0;
    private closing = false;
    constructor(public readonly cli: string, private directory: string, private duration = 100) { super(); }
    isActive = (file: string) => [...this.runs.values()].some(run => run.file === file && !!run.child.pid && run.child.exitCode === null && run.child.signalCode === null);
    list() { return [...this.runs.values()].map(run => run.state).reverse(); }
    get(id: string) { const run = this.runs.get(id); if (!run) throw new DashboardError('Match not found.', 404); return run.state; }
    async available(): Promise<boolean> {
        return new Promise(resolve => execFile(this.cli, ['--help'], { timeout: 2000 }, error => resolve(!error)));
    }

    async start(value: unknown): Promise<MatchState> {
        if (this.closing) throw new DashboardError('The dashboard is shutting down.', 503);
        const options = validateMatch(value);
        if (this.pending + this.list().filter(state => state.status === 'running').length >= 4) throw new DashboardError('Stop a running match before starting another. Four matches can run at once.', 409);
        this.pending++;
        try {
            await Promise.all(options.snakes.map(async snake => {
                try {
                    const response = await fetch(snake.url, { signal: AbortSignal.timeout(2000) });
                    const metadata = await response.json();
                    if (!response.ok || metadata.apiversion !== "1") throw new Error("API v1 metadata missing");
                } catch { throw new DashboardError(`${snake.name} is unavailable at ${snake.url}. Start the snake server or update its HTTP URL.`, 422); }
            }));
            if (this.runs.size >= 50) {
                const oldest = [...this.runs.values()].find(run => run.state.status !== 'running');
                if (oldest) this.runs.delete(oldest.state.id);
            }
            const id = randomUUID();
            const folder = path.join(this.directory, 'matches');
            await mkdir(folder, { recursive: true });
            const file = path.join(await realpath(folder), `${id}.jsonl`);
            if (this.closing) throw new DashboardError('The dashboard is shutting down.', 503);
            const args = ['play', '--width', String(options.width), '--height', String(options.height), '--gametype', options.gametype,
                '--seed', String(options.seed), '--timeout', String(options.timeout), '--duration', String(this.duration), '--output', file,
                ...options.snakes.flatMap(snake => [`--name=${snake.name}`, `--url=${snake.url}`])];
            const child = spawn(this.cli, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
            const state: MatchState = { id, options, created: new Date().toISOString(), status: 'running', logs: [], recordingId: Buffer.from(path.join('matches', `${id}.jsonl`)).toString('base64url') };
            const run: Runtime = { state, child, file, offset: 0, partial: '', decoder: new StringDecoder('utf8') };
            this.runs.set(id, run);
            const output = (bytes: Buffer) => {
                state.logs.push(...bytes.toString().split('\n').filter(Boolean));
                state.logs = state.logs.slice(-40).map(line => line.slice(0, 2000));
            };
            child.stdout.on('data', output);
            child.stderr.on('data', output);
            let finished = false;
            const finish = async (error?: string) => {
                if (finished) return;
                finished = true;
                clearInterval(run.timer); clearTimeout(run.lifetime);
                await this.read(run);
                if (state.status === 'running') state.status = error ? 'failed' : 'finished';
                if (error && state.status !== 'stopped') state.error = error;
                this.emit('change', id);
            };
            child.once('error', error => { void finish(`Rules CLI could not start: ${error.message}. Set BATTLESNAKE_CLI to an executable CLI path.`); });
            child.once('close', code => { void finish(code && state.status !== 'stopped' ? `Rules CLI exited with code ${code}. ${state.logs.at(-1) ?? ''}` : undefined); });
            run.timer = setInterval(() => { void this.read(run).then(() => this.emit('change', id)); }, 150);
            run.lifetime = setTimeout(() => { state.error = 'Match exceeded the 15-minute local limit.'; this.stop(id); }, 15 * 60 * 1000);
            return state;
        } finally { this.pending--; }
    }

    private read(run: Runtime): Promise<void> {
        if (run.reading) return run.reading;
        run.reading = (async () => {
            let file;
            try {
                file = await open(run.file, 'r');
                if ((await file.stat()).size > maxRecordingBytes) {
                    run.state.error = 'Match stopped because its recording reached the 100 MB limit.';
                    this.stop(run.state.id);
                    return;
                }
                const buffer = Buffer.alloc(64 * 1024);
                let bytesRead: number;
                do {
                    ({ bytesRead } = await file.read(buffer, 0, buffer.length, run.offset));
                    run.offset += bytesRead;
                    run.partial += run.decoder.write(buffer.subarray(0, bytesRead));
                    const lines = run.partial.split('\n');
                    run.partial = lines.pop() ?? '';
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const value = JSON.parse(line);
                            const frame = normalizeFrame(value, 'bottom-left');
                            if (frame) run.state.frame = frame;
                            if (typeof value.winnerName === 'string') run.state.winner = value.winnerName;
                            else if (value.isDraw) run.state.winner = 'Draw';
                        } catch { /* Ignore a malformed engine line while keeping later frames readable. */ }
                    }
                } while (bytesRead === buffer.length);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') run.state.error = 'Could not read the live match recording.';
            } finally { await file?.close(); }
        })().finally(() => { run.reading = undefined; });
        return run.reading;
    }

    stop(id: string) {
        const run = this.runs.get(id);
        if (!run) throw new DashboardError('Match not found.', 404);
        if (run.child.exitCode !== null || run.child.signalCode !== null) return run.state;
        if (run.state.status === 'running') run.state.status = 'stopped';
        clearInterval(run.timer); clearTimeout(run.lifetime);
        run.child.kill('SIGTERM');
        const force = setTimeout(() => { if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGKILL'); }, 2000);
        force.unref();
        this.emit('change', id);
        return run.state;
    }

    async close() {
        this.closing = true;
        const children = [...this.runs.values()].filter(run => run.child.exitCode === null && run.child.signalCode === null);
        const waits = children.map(run => new Promise<void>(resolve => run.child.once('close', () => resolve())));
        for (const run of children) this.stop(run.state.id);
        await Promise.all(waits);
        this.removeAllListeners();
    }
}
