import * as fs from 'node:fs';
import * as path from 'node:path';

export const Writer = { enabled: false };

export function writeFile(id: string, json: unknown, directory = path.resolve(__dirname, '../../games')) {
    if (!Writer.enabled) return;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, id + '.json'), JSON.stringify(json, null, 4));
}
