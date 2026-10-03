import { createRequire } from 'node:module';
import { once } from 'node:events';

export const require = createRequire(import.meta.url);
const { Server } = require('../dist/server/Server.js');
process.env.NODE_ENV = 'test';

export function snake(id, body) {
    return { id, name: id, health: 90, head: body[0], length: body.length, body, latency: '0', shout: '', squad: '' };
}

export function fixture(id = 'game-a') {
    const you = snake('snake-a', [{ x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }]);
    return {
        game: { id, ruleset: { name: 'standard', version: 'v1.2.3', settings: { hazardDamagePerTurn: 14 } }, map: 'standard', timeout: 500, source: 'custom' },
        turn: 0,
        board: { width: 3, height: 3, food: [{ x: 1, y: 2 }], hazards: [], snakes: [you] },
        you,
    };
}

export async function startServer(t, factory, options = {}) {
    const server = new Server(0, factory, { host: '127.0.0.1', ...options });
    if (!server.httpServer.listening) await once(server.httpServer, 'listening');
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    return async (route, body, raw = false) => {
        const response = await fetch(base + route, {
            method: body === undefined ? 'GET' : 'POST',
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
            signal: AbortSignal.timeout(2000),
        });
        return { status: response.status, body: await response.json() };
    };
}
