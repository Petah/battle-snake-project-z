import * as fs from 'node:fs';
import * as path from 'node:path';
import { gzipSync } from 'node:zlib';
import { StrategyRequest } from '../types/BTData';

export const Writer = { enabled: false };

export function writeFile(id: string, json: unknown, directory = path.resolve(__dirname, '../../games')) {
    if (!Writer.enabled) {
        return;
    }
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, id + '.json'), JSON.stringify(json, null, 4));
}

export function writeTurnFile(snakeName: string, type: 'start' | 'move' | 'end', request: StrategyRequest,
    directory = path.resolve(__dirname, '../../games')) {
    if (!Writer.enabled) {
        return;
    }
    const index = type === 'start' ? '0000' : type === 'end' ? '9999' : String(request.turn + 1).padStart(4, '0');
    const folder = path.join(directory, encodeURIComponent(request.game.id).replace(/\./g, '%2E'),
        `${encodeURIComponent(snakeName).replace(/\./g, '%2E')}_${encodeURIComponent(request.you.id).replace(/\./g, '%2E')}`);
    fs.mkdirSync(folder, { recursive: true });
    const snapshot = {
        apiVersion: '1', coordinateSystem: 'bottom-left',
        body: request.body, storage: request.storage, grid: request.grid, logs: request.logs,
    };
    fs.writeFileSync(path.join(folder, `${index}_${type}.json.gz`), gzipSync(JSON.stringify(snapshot)));
}
