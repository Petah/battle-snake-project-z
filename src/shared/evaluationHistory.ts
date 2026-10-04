import type { EvaluationReport, Standing } from '../evaluation/types';
export type EvaluationRun = Pick<EvaluationReport, 'id' | 'started' | 'finished' | 'options' | 'revision' | 'cliVersion' | 'rated' | 'scheduled' | 'rankings'>;
export interface EvaluationHistory { runs: EvaluationRun[]; skipped: number }
export type HistoryMetric = 'elo' | 'winRate' | 'score' | 'p95Ms' | 'averageMs' | 'maxMs' | 'failureRate';
export const historyMetrics: Record<HistoryMetric, string> = { elo: 'Elo', winRate: 'Win rate (%)', score: 'Score including draws (%)', p95Ms: 'P95 move latency (ms)', averageMs: 'Average move latency (ms)', maxMs: 'Maximum move latency (ms)', failureRate: 'Failed games (%)' };

export function comparisonKey(run: EvaluationRun): string {
    const o = run.options;
    // Preserve player order: Elo is applied in schedule order. Revision is
    // deliberately excluded so changes to the strategies can be compared.
    return JSON.stringify([o.snakes, o.width, o.height, o.seed, o.rounds, o.timeout, o.maxSeconds, o.concurrency, run.cliVersion]);
}
export function historyValue(row: Standing, metric: HistoryMetric): number | null {
    if (metric === 'elo') {
        return row.games ? row.elo : null;
    }
    if (metric === 'winRate') {
        return row.games ? 100 * row.wins / row.games : null;
    }
    if (metric === 'score') {
        return row.games ? 100 * (row.wins + row.draws / 2) / row.games : null;
    }
    if (metric === 'failureRate') {
        return row.games + row.failed ? 100 * row.failed / (row.games + row.failed) : null;
    }
    return row.moveCount ? row[metric] : null;
}

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
export const historyColors = ['#c5f586', '#75cfff', '#ffb980', '#db9bff', '#ff879c', '#6ee3bd', '#f4df79', '#a8afff', '#e3c4a7', '#8dcacc'];
export function historyChart(runs: EvaluationRun[], names: string[], metric: HistoryMetric): string {
    const points = runs.flatMap(run => names.flatMap(name => {
        const row = run.rankings.find(row => row.name === name); const value = row ? historyValue(row, metric) : null;
        return value === null ? [] : [value];
    }));
    if (!points.length) {
        return '<p class="hint">No measured values for this selection yet.</p>';
    }
    const percent = ['winRate', 'score', 'failureRate'].includes(metric);
    let low = percent || metric !== 'elo' ? 0 : Math.floor((Math.min(...points) - 20) / 50) * 50;
    let high = percent ? 100 : metric === 'elo' ? Math.ceil((Math.max(...points) + 20) / 50) * 50 : Math.max(1, Math.ceil(Math.max(...points) * 1.1));
    if (low === high) {
        low--; high++;
    }
    const x = (index: number) => runs.length === 1 ? 445 : 70 + index * 750 / (runs.length - 1);
    const y = (value: number) => 280 - (value - low) * 250 / (high - low);
    const parts = [`<svg viewBox="0 0 870 340" role="img" aria-label="${escape(historyMetrics[metric])} across evaluation runs"><title>${escape(historyMetrics[metric])} across evaluation runs</title>`];
    for (let tick = 0; tick <= 4; tick++) {
        const value = low + (high - low) * tick / 4;
        parts.push(`<line x1="70" x2="820" y1="${y(value)}" y2="${y(value)}" stroke="#344a37"/><text x="60" y="${y(value) + 4}" text-anchor="end" fill="#abc0ad" font-size="12">${Number(value.toFixed(1))}</text>`);
    }
    runs.forEach((run, index) => {
        if (runs.length <= 6 || index % Math.ceil(runs.length / 6) === 0 || index === runs.length - 1) {
            parts.push(`<text x="${x(index)}" y="305" text-anchor="middle" fill="#abc0ad" font-size="12">${escape(run.finished.slice(5, 10))} #${index + 1}</text>`);
        }
    });
    names.forEach((name, series) => {
        const color = historyColors[series % historyColors.length]; let previous: { x: number; y: number } | undefined;
        runs.forEach((run, index) => {
            const row = run.rankings.find(row => row.name === name), value = row ? historyValue(row, metric) : null;
            if (!row || value === null) {
                previous = undefined; return;
            }
            const point = { x: x(index), y: y(value) };
            if (previous) {
                parts.push(`<line x1="${previous.x}" y1="${previous.y}" x2="${point.x}" y2="${point.y}" stroke="${color}" stroke-width="2"/>`);
            }
            const label = `${name}: ${value.toFixed(1)} · ${new Date(run.finished).toLocaleString()} · ${run.revision} · ${row.games} rated games, ${row.failed} failed`;
            parts.push(`<circle cx="${point.x}" cy="${point.y}" r="5" fill="${color}" tabindex="0" role="button" data-run="${escape(run.id)}" data-detail="${escape(label)}" aria-label="${escape(label)}"><title>${escape(label)}</title></circle>`);
            previous = point;
        });
    });
    parts.push('<text x="445" y="332" text-anchor="middle" fill="#abc0ad" font-size="12">Completed runs, oldest → newest (equally spaced)</text></svg>');
    return parts.join('');
}
