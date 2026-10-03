import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { DashboardServer } from './DashboardServer';
import type { SnakeEndpoint } from '../shared/dashboard';

const port = Number(process.env.DASHBOARD_PORT ?? 9000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DASHBOARD_PORT must be an integer from 1 to 65535.');
const localCli = path.resolve(__dirname, '../../battlesnake');
let snakes: SnakeEndpoint[] | undefined;
if (process.env.DASHBOARD_SNAKES) {
    snakes = JSON.parse(process.env.DASHBOARD_SNAKES);
    if (!Array.isArray(snakes) || snakes.some(snake => !snake?.name || !snake?.url)) throw new Error('DASHBOARD_SNAKES must be a JSON array of { name, url, websocketUrl? }.');
}
const retentionEnabled = process.env.NODE_ENV === 'production' || process.env.RECORDING_RETENTION_DAYS !== undefined || process.env.RECORDING_MAX_BYTES !== undefined;
const retention = retentionEnabled ? {
    maxAgeDays: Number(process.env.RECORDING_RETENTION_DAYS ?? 7),
    maxBytes: Number(process.env.RECORDING_MAX_BYTES ?? 1024 * 1024 * 1024),
} : undefined;
if (retention && (!Number.isFinite(retention.maxAgeDays) || retention.maxAgeDays <= 0 || !Number.isSafeInteger(retention.maxBytes) || retention.maxBytes <= 0)) {
    throw new Error('RECORDING_RETENTION_DAYS and RECORDING_MAX_BYTES must be positive numbers; bytes must be an integer.');
}
const dashboard = new DashboardServer(port, {
    host: process.env.DASHBOARD_HOST ?? '127.0.0.1', allowedHosts: process.env.DASHBOARD_ALLOWED_HOSTS?.split(',').map(host => host.trim()), directory: process.env.GAME_DIRECTORY,
    retention, cli: process.env.BATTLESNAKE_CLI ?? (existsSync(localCli) ? localCli : 'battlesnake'), snakes,
});
let closing = false;
async function close() { if (closing) return; closing = true; await dashboard.close(); }
process.once('SIGINT', close);
process.once('SIGTERM', close);
