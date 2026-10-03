import { spawn } from 'node:child_process';
import { open, unlink } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import type { Duel, EvaluationOptions, Latency, MatchResult } from './types';

export async function runMatch(cli: string, duel: Duel, options: EvaluationOptions, urls: Map<string, string>, file: string, signal: AbortSignal): Promise<MatchResult> {
    const started = Date.now();
    const result: MatchResult = { ...duel, status: 'failed', turns: 0, durationMs: 0, latency: {} };
    if (signal.aborted) return { ...result, status: 'cancelled', error: 'Evaluation cancelled.' };
    const args = ['play', '--gametype', 'standard', '--width', String(options.width), '--height', String(options.height),
        '--seed', String(duel.seed), '--timeout', String(options.timeout), '--duration', '0', '--output', file,
        ...duel.players.flatMap(name => [`--name=${name}`, `--url=${urls.get(name)}`])];
    const child = spawn(cli, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let diagnostics = '', offset = 0, partial = '', readError: string, terminal: { winnerName?: string; isDraw?: boolean }, frames = 0;
    let reading: Promise<void>;
    let finished = false;
    let force: NodeJS.Timeout;
    const decoder = new StringDecoder('utf8');
    const kill = (error: string, cancelled = false) => {
        if (finished) return;
        result.error = error;
        if (cancelled) result.status = 'cancelled';
        child.kill('SIGTERM');
        force ??= setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 1000);
        force.unref();
    };
    const log = (bytes: Buffer) => {
        const text = bytes.toString();
        diagnostics = (diagnostics + text).slice(-4000);
        if (/\bERROR\b|timed?\s*out|context deadline exceeded|connection refused|invalid response|failed to/i.test(diagnostics)) readError = 'Engine communication error; match excluded from ratings.';
    };
    child.stdout.on('data', log); child.stderr.on('data', log);
    const consume = (line: string) => {
        if (!line.trim()) return;
        const value = JSON.parse(line);
        if (value.board && Number.isInteger(value.turn)) {
            frames++;
            result.turns = Math.max(result.turns, value.turn);
            for (const snake of value.board.snakes ?? []) {
                // The initial board's latency is a placeholder, not a measured move.
                if (value.turn === 0 || !duel.players.includes(snake.name)) continue;
                const ms = Number(snake.latency);
                if (!Number.isFinite(ms) || ms < 0) continue;
                const stats: Latency = result.latency[snake.name] ??= { count: 0, total: 0, max: 0, histogram: {} };
                stats.count++; stats.total += ms; stats.max = Math.max(stats.max, ms);
                const bucket = String(Math.round(ms)); stats.histogram[bucket] = (stats.histogram[bucket] ?? 0) + 1;
            }
        }
        if (typeof value.isDraw === 'boolean' || typeof value.winnerName === 'string') terminal = value;
    };
    const read = (): Promise<void> => {
        if (reading) return reading;
        reading = (async () => {
            let handle;
            try {
                handle = await open(file, 'r');
                if ((await handle.stat()).size > 100 * 1024 * 1024) { readError = 'Recording exceeded 100 MiB.'; kill(readError); return; }
                const buffer = Buffer.alloc(64 * 1024);
                let bytesRead: number;
                do {
                    ({ bytesRead } = await handle.read(buffer, 0, buffer.length, offset)); offset += bytesRead;
                    partial += decoder.write(buffer.subarray(0, bytesRead));
                    const lines = partial.split('\n'); partial = lines.pop() ?? '';
                    for (const line of lines) consume(line);
                    if (partial.length > 1024 * 1024) { readError = 'Engine emitted an oversized JSON line.'; kill(readError); return; }
                } while (bytesRead === buffer.length);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { readError = 'Engine recording was invalid or unreadable.'; kill(readError); }
            } finally { await handle?.close(); }
        })().finally(() => { reading = undefined; });
        return reading;
    };
    const abort = () => kill('Evaluation cancelled.', true);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const limit = setTimeout(() => kill(`Match exceeded ${options.maxSeconds} seconds; excluded from ratings.`), options.maxSeconds * 1000);
    const poll = setInterval(() => { void read(); }, 100);
    try {
        const code = await new Promise<number>(resolve => {
            child.once('error', error => { result.error = `Rules CLI could not start: ${error.message}`; });
            child.once('close', code => resolve(code));
        });
        finished = true;
        clearInterval(poll); clearTimeout(limit); clearTimeout(force);
        // A poll may have started before the engine wrote its final result.
        // Let it finish, then read any bytes appended before process exit.
        await reading;
        await read();
        if (partial.trim()) { try { consume(partial); } catch { readError = 'Incomplete engine recording.'; } }
        if (result.status !== 'cancelled') {
            result.error ??= readError;
            if (code !== 0) result.error ??= `Rules CLI exited with code ${code}: ${diagnostics.trim().slice(-500)}`;
            if (!terminal || frames < 2 || (!terminal.isDraw && !duel.players.includes(terminal.winnerName))) result.error ??= 'Engine did not produce a complete duel result.';
            if (!result.error) { result.status = 'rated'; result.draw = terminal.isDraw === true; if (!result.draw) result.winner = terminal.winnerName; }
        }
    } finally {
        clearInterval(poll); clearTimeout(limit); clearTimeout(force); signal.removeEventListener('abort', abort);
        if (!finished) { child.kill('SIGKILL'); }
        if (!options.keepReplays) await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
        result.durationMs = Date.now() - started;
    }
    return result;
}
