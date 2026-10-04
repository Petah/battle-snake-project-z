import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { evaluate } from './evaluate';
import { EvaluationCommandLine } from './EvaluationCommandLine';
import type { EvaluationOptions } from './types';

async function runEvaluation(options: EvaluationOptions, directory: string): Promise<void> {
    const localCli = path.resolve(__dirname, '../../battlesnake');
    const cli = process.env.BATTLESNAKE_CLI ?? (existsSync(localCli) ? localCli : 'battlesnake');
    const controller = new AbortController();
    const cancel = () => {
        console.log('\nStopping evaluation; saving completed results…'); controller.abort();
    };
    process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
    // Keep per-turn request logs out of benchmark output. Strategy errors remain visible.
    process.env.NODE_ENV = 'production'; process.env.REQUEST_LOGS = 'false';
    try {
        console.log(`Evaluating ${options.snakes.length} snakes: ${options.rounds * options.snakes.length * (options.snakes.length - 1)} duels, concurrency ${options.concurrency}.`);
        const report = await evaluate(options, { cli, directory, signal: controller.signal,
            progress: (done, total, result) => console.log(`[${done}/${total}] ${result.players.join(' vs ')} · seed ${result.seed} · ${result.status === 'rated' ? result.draw ? 'draw' : `${result.winner} wins` : result.error} · ${result.turns} turns`),
        });
        console.table(report.rankings.map(row => ({ snake: row.name, Elo: row.elo.toFixed(1), games: row.games, wins: row.wins, draws: row.draws, losses: row.losses,
            score: row.games ? `${(100 * (row.wins + row.draws / 2) / row.games).toFixed(1)}%` : '—', p95_ms: row.p95Ms, failed: row.failed })));
        console.log(`Report: ${path.join(directory, report.id, 'report.html')}\nResults: ${path.join(directory, report.id, 'report.json')}`);
        if (report.status === 'cancelled') {
            process.exitCode = 130;
        } else if (report.rated < report.scheduled) {
            process.exitCode = 1;
        }
    } finally {
        process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
    }
}
void new EvaluationCommandLine(runEvaluation).executeAsync();
