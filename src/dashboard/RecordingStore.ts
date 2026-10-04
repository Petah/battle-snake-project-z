import { readdir, readFile, stat, lstat, realpath, unlink, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { normalizeFrame } from '../shared/replay';
export { normalizeFrame } from '../shared/replay';
import type { Recording, Replay, ReplayFrame } from '../shared/dashboard';

export class DashboardError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}
export const maxRecordingBytes = 100 * 1024 * 1024;
const maxBytes = maxRecordingBytes;
export interface RecordingRetention { maxAgeDays: number; maxBytes: number }

export class RecordingStore {
    public readonly root: string;
    constructor(directory: string, private active: (file: string) => boolean = () => false) {
        this.root = path.resolve(directory);
    }
    id(relative: string) {
        return Buffer.from(relative).toString('base64url');
    }

    private async resolve(id: string) {
        if (!/^[A-Za-z0-9_-]+$/.test(id)) {
            throw new DashboardError('Recording not found.', 404);
        }
        const relative = Buffer.from(id, 'base64url').toString();
        const file = path.resolve(this.root, relative);
        if (!file.startsWith(this.root + path.sep) || relative !== path.relative(this.root, file)) {
            throw new DashboardError('Recording not found.', 404);
        }
        try {
            const actual = await realpath(file);
            const root = await realpath(this.root);
            if (!actual.startsWith(root + path.sep) || (await lstat(file)).isSymbolicLink()) {
                throw new DashboardError('Recording not found.', 404);
            }
            return actual;
        } catch (error) {
            if (error instanceof DashboardError) {
                throw error;
            }
            throw new DashboardError('Recording not found.', 404);
        }
    }

    async list(): Promise<Recording[]> {
        const recordings: Recording[] = [];
        const walk = async (directory: string, depth: number) => {
            let entries;
            try {
                entries = await readdir(directory, { withFileTypes: true });
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                    return;
                } throw error;
            }
            if (depth > 0 && entries.some(entry => entry.isFile() && /^\d+_start\.json\.gz$/.test(entry.name))) {
                const info = await stat(directory);
                const relative = path.relative(this.root, directory);
                recordings.push({ id: this.id(relative), name: relative, modified: info.mtime.toISOString(), kind: 'snapshots', canDelete: !this.active(await realpath(directory)) });
                return;
            }
            for (const entry of entries) {
                if (entry.isSymbolicLink()) {
                    continue;
                }
                const file = path.join(directory, entry.name);
                if (entry.isDirectory() && depth < 3) {
                    await walk(file, depth + 1);
                } else if (entry.isFile() && /\.jsonl?$/.test(entry.name)) {
                    const info = await stat(file);
                    const relative = path.relative(this.root, file);
                    recordings.push({ id: this.id(relative), name: relative, modified: info.mtime.toISOString(), kind: entry.name.endsWith('.jsonl') ? 'match' : 'json', canDelete: !this.active(await realpath(file)) });
                }
            }
        };
        await walk(this.root, 0);
        return recordings.sort((a, b) => b.modified.localeCompare(a.modified));
    }

    private async known(id: string) {
        const recording = (await this.list()).find(item => item.id === id);
        if (!recording) {
            throw new DashboardError('Recording not found.', 404);
        }
        return { recording, file: await this.resolve(id) };
    }

    async read(id: string): Promise<Replay> {
        const { recording, file } = await this.known(id);
        const frames: ReplayFrame[] = [];
        let total = 0;
        const load = async (filename: string, compressed = false) => {
            const info = await stat(filename);
            total += info.size;
            if (total > maxBytes) {
                throw new DashboardError('This recording is too large to load.', 413);
            }
            const bytes = await readFile(filename);
            const contents = compressed ? gunzipSync(bytes, { maxOutputLength: maxBytes - total + bytes.length }) : bytes;
            if (compressed) {
                total += contents.length - bytes.length;
            }
            if (total > maxBytes) {
                throw new DashboardError('This recording is too large to load.', 413);
            }
            return contents.toString('utf8');
        };
        const add = (value: unknown, origin?: ReplayFrame['origin']) => {
            const frame = normalizeFrame(value, origin); if (frame) {
                frames.push(frame);
            }
        };
        let winner: string;
        try {
            if (recording.kind === 'snapshots') {
                for (const name of (await readdir(file)).filter(name => /^\d+_(start|move|end)\.json\.gz$/.test(name)).sort()) {
                    const snapshot = path.join(file, name);
                    if ((await lstat(snapshot)).isSymbolicLink()) {
                        continue;
                    }
                    add(JSON.parse(await load(snapshot, true)));
                }
            } else if (recording.kind === 'match') {
                for (const line of (await load(file)).split('\n').filter(Boolean)) {
                    let value;
                    try {
                        value = JSON.parse(line);
                    } catch {
                        continue;
                    } // live files may end with a partial line
                    add(value, 'bottom-left');
                    if (typeof value.winnerName === 'string') {
                        winner = value.winnerName;
                    } else if (value.isDraw) {
                        winner = 'Draw';
                    }
                }
            } else {
                const value = JSON.parse(await load(file));
                if (value.start && Array.isArray(value.moves)) {
                    const origin = value.coordinateSystem ?? (value.start.game?.ruleset ? 'bottom-left' : 'top-left');
                    add(value.start, origin);
                    for (const move of value.moves) {
                        if (move) {
                            add(move, origin);
                        }
                    }
                    if (value.end) {
                        add(value.end, origin);
                    }
                } else {
                    add(value);
                }
            }
        } catch (error) {
            if (error instanceof DashboardError) {
                throw error;
            }
            throw new DashboardError('Could not read this recording. The file may be incomplete or invalid.', 422);
        }
        if (!frames.length) {
            throw new DashboardError('This recording does not contain a playable board.', 422);
        }
        return { id, name: recording.name, frames, winner };
    }

    async prune(policy: RecordingRetention, now = Date.now()) {
        if (!Number.isFinite(policy.maxAgeDays) || policy.maxAgeDays <= 0 || !Number.isSafeInteger(policy.maxBytes) || policy.maxBytes <= 0) {
            throw new DashboardError('Recording retention requires a positive age and byte limit.');
        }
        const candidates = [];
        for (const recording of await this.list()) {
            const file = await this.resolve(recording.id);
            let size = 0;
            let modified = 0;
            if (recording.kind === 'snapshots') {
                for (const name of await readdir(file)) {
                    if (!/^\d+_(start|move|end)\.json\.gz$/.test(name)) {
                        continue;
                    }
                    const info = await lstat(path.join(file, name));
                    if (!info.isFile()) {
                        continue;
                    }
                    size += info.size; modified = Math.max(modified, info.mtimeMs);
                }
            } else {
                const info = await stat(file);
                size = info.size; modified = info.mtimeMs;
            }
            candidates.push({ ...recording, size, modified });
        }
        let bytes = candidates.reduce((sum, item) => sum + item.size, 0);
        let deleted = 0;
        const cutoff = now - policy.maxAgeDays * 24 * 60 * 60 * 1000;
        for (const candidate of candidates.sort((a, b) => a.modified - b.modified)) {
            if (!candidate.canDelete || (candidate.modified >= cutoff && bytes <= policy.maxBytes)) {
                continue;
            }
            try {
                await this.delete(candidate.id);
            } catch (error) {
                if (error instanceof DashboardError && error.status === 409) {
                    continue;
                }
                if (!(error instanceof DashboardError && error.status === 404)) {
                    throw error;
                }
            }
            bytes -= candidate.size; deleted++;
        }
        return { deleted, bytes };
    }

    async delete(id: string) {
        const { recording, file } = await this.known(id);
        if (!recording.canDelete || this.active(file)) {
            throw new DashboardError('Stop the match before deleting its recording.', 409);
        }
        if (recording.kind === 'snapshots') {
            await rm(file, { recursive: true });
        } else {
            await unlink(file);
        }
    }
}
