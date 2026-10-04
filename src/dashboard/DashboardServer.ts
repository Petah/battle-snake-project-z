import express from 'express';
import * as http from 'node:http';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { evaluationHistory } from '../evaluation/history';
import { defaultSnakes, SnakeEndpoint } from '../shared/dashboard';
import { StrategyRequest } from '../types/BTData';
import { weight, WeightOptions } from '../lib/weight';
import { RecordingStore, DashboardError, RecordingRetention } from './RecordingStore';
import { MatchManager } from './MatchManager';

export interface DashboardOptions {
    host?: string; directory?: string; cli?: string; snakes?: SnakeEndpoint[]; turnDuration?: number; allowedHosts?: string[]; retention?: RecordingRetention; evaluationDirectory?: string;
}
export class DashboardServer {
    readonly httpServer: http.Server;
    readonly matches: MatchManager;
    readonly recordings: RecordingStore;
    private cleanupTimer?: NodeJS.Timeout;
    private cleanup?: Promise<unknown>;
    private closing = false;
    constructor(port: number, private options: DashboardOptions = {}) {
        const directory = path.resolve(options.directory ?? path.join(__dirname, '../../games'));
        this.matches = new MatchManager(options.cli ?? 'battlesnake', directory, options.turnDuration);
        this.recordings = new RecordingStore(directory, this.matches.isActive);
        if (options.retention) {
            void this.cleanupRecordings();
            this.cleanupTimer = setInterval(() => {
                void this.cleanupRecordings();
            }, 5 * 60 * 1000);
            this.cleanupTimer.unref();
            this.matches.on('change', id => {
                if (!this.closing && this.matches.get(id).status !== 'running') {
                    void this.cleanupRecordings();
                }
            });
        }
        const app = express();
        app.disable('x-powered-by');
        // The local dashboard has no cross-origin API. Prevent another website
        // from using the browser to start a CLI process or delete local replays.
        app.use((request, response, next) => {
            const hostname = request.hostname;
            const hosts = options.allowedHosts ?? ['localhost', '127.0.0.1', '[::1]', options.host ?? '127.0.0.1'];
            if (!hosts.includes(hostname)) {
                response.status(403).json({ error: 'Use the configured dashboard hostname.' }); return;
            }
            const origin = request.get('origin');
            if (request.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${request.protocol}://${request.get('host')}`)) {
                response.status(403).json({ error: 'Use the dashboard from its own URL.' }); return;
            }
            response.set('X-Content-Type-Options', 'nosniff');
            response.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; frame-ancestors 'none'");
            next();
        });
        app.use(express.json({ limit: '64kb' }));
        app.get('/api/evaluation/history', async (_request, response) => {
            response.json(await evaluationHistory(path.resolve(options.evaluationDirectory ?? path.join(__dirname, '../../evaluations'))));
        });
        app.get('/api/evaluation/latest', async (_request, response) => {
            try {
                const file = path.join(path.resolve(options.evaluationDirectory ?? path.join(__dirname, '../../evaluations')), 'latest.json');
                response.json(JSON.parse(await readFile(file, 'utf8')));
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                    throw new DashboardError('No evaluation yet. Run npm run evaluate to create rankings.', 404);
                }
                throw error;
            }
        });
        app.get('/api/config', async (_request, response) => response.json({ snakes: options.snakes ?? defaultSnakes, cliAvailable: await this.matches.available() }));
        app.get('/api/recordings', async (_request, response) => response.json(await this.recordings.list()));
        app.get('/api/recordings/:id', async (request, response) => response.json(await this.recordings.read(request.params.id)));
        app.delete('/api/recordings/:id', async (request, response) => {
            await this.recordings.delete(request.params.id); response.json({ deleted: true });
        });
        app.post('/api/recordings/:id/analyze', async (request, response) => {
            const replay = await this.recordings.read(request.params.id);
            const index = request.body?.frame;
            if (!Number.isInteger(index) || index < 0 || index >= replay.frames.length) {
                throw new DashboardError('Select a valid replay frame.');
            }
            const keys = ['blockHeads', 'attackHeads', 'borders', 'snakeBodies', 'deadEnds', 'avoidFood'];
            const settings = { blockHeads: true, attackHeads: true, ...(request.body?.options ?? {}) };
            if (keys.some(key => settings[key] !== undefined && typeof settings[key] !== 'boolean') || Object.keys(settings).some(key => !keys.includes(key))) {
                throw new DashboardError('Scoring options must be booleans.');
            }
            const context = new StrategyRequest(replay.frames[index].body);
            for (let y = 0; y < context.board.height; y++) {
                for (let x = 0; x < context.board.width; x++) {
                    weight(context, x, y, settings as WeightOptions);
                }
            }
            response.json(context.grid);
        });
        app.get('/api/matches', (_request, response) => response.json(this.matches.list()));
        app.post('/api/matches', async (request, response) => response.status(201).json(await this.matches.start(request.body)));
        app.get('/api/matches/:id', (request, response) => response.json(this.matches.get(request.params.id)));
        app.post('/api/matches/:id/stop', (request, response) => response.json(this.matches.stop(request.params.id)));
        app.get('/api/matches/:id/events', (request, response) => {
            const id = request.params.id;
            this.matches.get(id);
            response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
            response.flushHeaders();
            const send = (changedId = id) => {
                if (changedId === id) {
                    response.write(`data: ${JSON.stringify(this.matches.get(id))}\n\n`);
                }
            };
            const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 15000);
            this.matches.on('change', send);
            send();
            request.on('close', () => {
                clearInterval(heartbeat); this.matches.off('change', send);
            });
        });
        const assets = path.resolve(__dirname, '../../dashboard-dist');
        app.get(['/', '/index.html'], async (_request, response) => {
            const html = await readFile(path.join(assets, 'index.html'), 'utf8');
            // Authorize only the exact bootstrap scripts emitted by SvelteKit.
            // Re-read on navigation so a local rebuild cannot leave stale hashes.
            const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
                .filter(match => match[1].trim())
                .map(match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
            // Kit's accessible navigation announcer uses this fixed style attribute.
            // Permit that exact value without allowing other inline styles.
            const announcerStyle = 'position: absolute; left: 0; top: 0; clip: rect(0 0 0 0); clip-path: inset(50%); overflow: hidden; white-space: nowrap; width: 1px; height: 1px';
            const styleHash = createHash('sha256').update(announcerStyle).digest('base64');
            response.set('Content-Security-Policy', `default-src 'self'; script-src 'self' ${hashes.join(' ')}; style-src 'self'; style-src-attr 'unsafe-hashes' 'sha256-${styleHash}'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; frame-ancestors 'none'`);
            response.type('html').send(html);
        });
        app.use(express.static(assets));
        app.use((_request, response) => response.status(404).json({ error: 'Not found.' }));
        app.use((error, _request, response, _next) => {
            response.status(error.status ?? 500).json({ error: error.status ? error.message : 'The dashboard could not complete this request.' });
        });
        this.httpServer = app.listen(port, options.host ?? '127.0.0.1', () => {
            const address = this.httpServer.address();
            console.log(`Dashboard: http://${options.host ?? '127.0.0.1'}:${typeof address === 'object' ? address?.port : port}`);
        });
    }
    cleanupRecordings(): Promise<unknown> {
        if (!this.options.retention) {
            return Promise.resolve();
        }
        if (!this.cleanup) {
            this.cleanup = this.recordings.prune(this.options.retention).then(result => {
                if (result.deleted) {
                    console.log(`Recording retention removed ${result.deleted} replay(s); ${result.bytes} bytes remain.`);
                }
                return result;
            }).catch(error => {
                console.error('Recording retention failed:', error);
            }).finally(() => {
                this.cleanup = undefined;
            });
        }
        return this.cleanup;
    }
    async close() {
        this.closing = true;
        clearInterval(this.cleanupTimer);
        await this.matches.close();
        await this.cleanup;
        this.httpServer.closeAllConnections();
        await new Promise<void>((resolve, reject) => this.httpServer.close(error => error ? reject(error) : resolve()));
    }
}
