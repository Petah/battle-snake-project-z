import { Server, ServerOptions } from './Server';
import { Logger } from '../lib/log';
import { Writer } from '../lib/writeFile';
import snakes from './snakes';

Logger.enabled = process.env.DEBUG_LOGS === 'true';
Writer.enabled = process.env.RECORD_GAMES === 'true';

const options: ServerOptions = {
    saveGame: Writer.enabled,
    debugWebSockets: process.env.DEBUG_WEBSOCKETS === 'true',
    recordingDirectory: process.env.GAME_DIRECTORY,
    host: process.env.HOST,
    author: process.env.BATTLESNAKE_AUTHOR,
    version: process.env.BATTLESNAKE_VERSION,
};

const registered = Object.entries(snakes);
let selected = registered;
if (process.env.SNAKE || process.env.PORT) {
    const name = process.env.SNAKE ?? 'ProjectZ';
    selected = registered.filter(([port, SnakeType]) => port === name || SnakeType.name.toLowerCase() === name.toLowerCase());
    if (!selected.length) {
        throw new Error(`Unknown SNAKE "${name}". Choose ${registered.map(([, SnakeType]) => SnakeType.name).join(', ')}.`);
    }
}

const servers = selected.map(([defaultPort, SnakeType]) => {
    const port = Number(process.env.PORT ?? defaultPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('PORT must be an integer from 1 to 65535.');
    }
    if (options.debugWebSockets && port > 55535) {
        throw new Error('PORT must be at most 55535 when DEBUG_WEBSOCKETS=true.');
    }
    return new Server(port, () => new SnakeType(), options);
});

let shuttingDown = false;
async function shutdown() {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    await Promise.all(servers.map(server => server.close()));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
