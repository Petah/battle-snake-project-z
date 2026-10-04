import * as path from 'node:path';
import { CommandLineParser } from '@rushstack/ts-command-line';
import { evaluationOptions } from './schedule';
import type { EvaluationOptions } from './types';

export class EvaluationCommandLine extends CommandLineParser {
    private readonly snakes;
    private readonly numbers;
    private readonly keepReplays;
    private readonly output;

    public constructor(private readonly run: (options: EvaluationOptions, directory: string) => Promise<void>) {
        super({
            toolFilename: 'evaluate',
            toolDescription: 'Run seeded standard duels and generate Elo reports. Use npm run evaluate -- [options]. Requires Node 24 and the Rules CLI; BATTLESNAKE_CLI overrides the engine path. Snake servers start automatically.',
        });
        this.snakes = this.defineStringParameter({
            parameterLongName: '--snakes', argumentName: 'NAMES',
            description: 'Comma-separated registered snake names (default: all registered snakes).',
        });
        const defaults = evaluationOptions();
        // Preserve the full numeric argument: the library's integer parser can
        // truncate fractions before our domain validation gets to reject them.
        const integer = (name: string, description: string, defaultValue: number) => this.defineStringParameter({
            parameterLongName: name, argumentName: 'NUMBER', description, defaultValue: String(defaultValue),
        });
        this.numbers = {
            rounds: integer('--rounds', 'Seeds per pairing, 1–50; each seed uses both player orders.', defaults.rounds),
            seed: integer('--seed', 'First board seed (a safe integer), incremented each round.', defaults.seed),
            width: integer('--width', 'Board width: an odd integer from 7 to 25.', defaults.width),
            height: integer('--height', 'Board height: an odd integer from 7 to 25.', defaults.height),
            timeout: integer('--timeout', 'Move timeout in milliseconds, 10–5000.', defaults.timeout),
            concurrency: integer('--concurrency', 'Parallel matches, 1–4. Keep at 1 for search-heavy snakes.', defaults.concurrency),
            maxSeconds: integer('--max-seconds', 'Wall-clock limit per game, 1–300 seconds; unfinished games are unrated.', defaults.maxSeconds),
        };
        this.keepReplays = this.defineFlagParameter({
            parameterLongName: '--keep-replays', description: 'Keep full JSONL replays with the report instead of discarding them.',
        });
        this.output = this.defineStringParameter({
            parameterLongName: '--output', argumentName: 'DIRECTORY', environmentVariable: 'EVALUATION_DIRECTORY',
            defaultValue: 'evaluations', description: 'Report directory; keeps the latest 20 completed runs.',
        });
    }

    protected override async onExecuteAsync(): Promise<void> {
        const settings: Partial<EvaluationOptions> = { keepReplays: this.keepReplays.value };
        for (const key of Object.keys(this.numbers) as (keyof typeof this.numbers)[]) {
            settings[key] = Number(this.numbers[key].value);
        }
        if (this.snakes.value !== undefined) {
            settings.snakes = this.snakes.value.split(',').map(name => name.trim());
        }
        await this.run(evaluationOptions(settings), path.resolve(this.output.value));
    }
}
