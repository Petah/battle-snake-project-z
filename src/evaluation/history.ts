import { lstat, readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { EvaluationReport } from './types';
import type { EvaluationHistory, EvaluationRun } from '../shared/evaluationHistory';

export async function evaluationHistory(directory: string): Promise<EvaluationHistory> {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { runs: [], skipped: 0 }; throw error; }
    const runs: EvaluationRun[] = [];
    let skipped = 0;
    for (const entry of entries) {
        if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}T[\w-]+$/.test(entry.name)) continue;
        const file = path.join(directory, entry.name, 'report.json');
        try {
            const info = await lstat(file);
            if (!info.isFile() || info.size > 32 * 1024 * 1024) { skipped++; continue; }
            const report: EvaluationReport = JSON.parse(await readFile(file, 'utf8'));
            if (report.status === 'cancelled') continue;
            if (report.formatVersion !== 1 || report.status !== 'finished' || report.id !== entry.name || !Number.isFinite(Date.parse(report.finished)) ||
                !Array.isArray(report.options?.snakes) || !Array.isArray(report.rankings) ||
                !report.rankings.every(row => typeof row.name === 'string' && ['elo', 'games', 'wins', 'draws', 'losses', 'failed', 'p95Ms', 'averageMs', 'maxMs', 'moveCount'].every(key => Number.isFinite(row[key])))) {
                skipped++; continue;
            }
            const { id, started, finished, options, revision, cliVersion, rated, scheduled, rankings } = report;
            runs.push({ id, started, finished, options, revision, cliVersion, rated, scheduled, rankings });
        } catch (error) {
            // A folder without a report is usually an evaluation still in progress.
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') skipped++;
        }
    }
    runs.sort((a, b) => Date.parse(a.finished) - Date.parse(b.finished) || a.id.localeCompare(b.id));
    return { runs: runs.slice(-20), skipped };
}
