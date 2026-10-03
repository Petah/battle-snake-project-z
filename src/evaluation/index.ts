import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { evaluate } from './evaluate';
import { evaluationOptions } from './schedule';

async function main() {
    const { values } = parseArgs({ options: {
        snakes: { type: 'string' }, rounds: { type: 'string' }, seed: { type: 'string' }, width: { type: 'string' }, height: { type: 'string' },
        timeout: { type: 'string' }, concurrency: { type: 'string' }, 'max-seconds': { type: 'string' },
        'keep-replays': { type: 'boolean', default: false }, output: { type: 'string' }, help: { type: 'boolean' },
    } });
    if (values.help) {
        console.log(`Usage: npm run evaluate -- [options]
  --snakes ProjectZ,Rando,Tak  Registered snakes (default: all registered snakes)
  --rounds 1                  Seeds per pairing; each seed uses both orders
  --seed 42                   First seed, incremented for each round
  --width 11 --height 11      Odd board dimensions, 7–25
  --timeout 500               Move timeout in milliseconds
  --concurrency 1             Parallel matches, 1–4
  --max-seconds 30            Wall-clock limit per game; unfinished games unrated
  --keep-replays              Keep full JSONL replay files (default: discard)
  --output evaluations        Report directory (keeps the latest 20 runs)
Requires Node 24 and the Rules CLI. BATTLESNAKE_CLI overrides its path.
Starts isolated local snake servers automatically; no npm run dev required.`);
        return;
    }
    const settings = {};
    for (const key of ['rounds', 'seed', 'width', 'height', 'timeout', 'concurrency']) if (values[key] !== undefined) settings[key] = Number(values[key]);
    if (values['max-seconds'] !== undefined) settings['maxSeconds'] = Number(values['max-seconds']);
    if (values.snakes) settings['snakes'] = values.snakes.split(',').map(name => name.trim());
    settings['keepReplays'] = values['keep-replays'];
    const options = evaluationOptions(settings);
    const localCli = path.resolve(__dirname, '../../battlesnake');
    const cli = process.env.BATTLESNAKE_CLI ?? (existsSync(localCli) ? localCli : 'battlesnake');
    const directory = path.resolve(values.output ?? process.env.EVALUATION_DIRECTORY ?? 'evaluations');
    const controller = new AbortController();
    const cancel = () => { console.log('\nStopping evaluation; saving completed results…'); controller.abort(); };
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
        if (report.status === 'cancelled') process.exitCode = 130;
        else if (report.rated < report.scheduled) process.exitCode = 1;
    } finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
