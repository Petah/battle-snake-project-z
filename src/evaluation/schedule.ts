import registry from '../server/snakes';
import type { Duel, EvaluationOptions } from './types';
export function evaluationOptions(value: Partial<EvaluationOptions> = {}): EvaluationOptions {
    const registered = Object.values(registry).map(Snake => Snake.name);
    const options: EvaluationOptions = { snakes: registered, rounds: 1, seed: 42, width: 11, height: 11, timeout: 500, concurrency: 1, maxSeconds: 30, keepReplays: false, ...value };
    if (!Array.isArray(options.snakes) || options.snakes.length < 2 || options.snakes.length > 16) throw new Error('Select at least two registered snakes.');
    options.snakes = options.snakes.map(name => {
        const found = typeof name === 'string' && registered.find(item => item.toLowerCase() === name.toLowerCase());
        if (!found) throw new Error(`Unknown snake: ${name}. Choose ${registered.join(', ')}.`);
        return found;
    });
    if (new Set(options.snakes).size !== options.snakes.length) throw new Error('Select each snake only once.');
    if (!Number.isInteger(options.rounds) || options.rounds < 1 || options.rounds > 50) throw new Error('Rounds must be an integer from 1 to 50.');
    if (!Number.isSafeInteger(options.seed) || !Number.isSafeInteger(options.seed + (options.rounds - 1))) throw new Error('Seed must be a safe integer.');
    for (const size of [options.width, options.height]) if (!Number.isInteger(size) || size < 7 || size > 25 || size % 2 !== 1) throw new Error('Board dimensions must be odd integers from 7 to 25.');
    if (!Number.isInteger(options.timeout) || options.timeout < 10 || options.timeout > 5000) throw new Error('Move timeout must be 10–5000 ms.');
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 4) throw new Error('Concurrency must be 1–4.');
    if (!Number.isInteger(options.maxSeconds) || options.maxSeconds < 1 || options.maxSeconds > 300) throw new Error('Maximum match duration must be 1–300 seconds.');
    if (typeof options.keepReplays !== 'boolean') throw new Error('keepReplays must be a boolean.');
    return options;
}
export function schedule(options: EvaluationOptions): Duel[] {
    const matches: Duel[] = [];
    for (let round = 0; round < options.rounds; round++) {
        for (let i = 0; i < options.snakes.length; i++) for (let j = i + 1; j < options.snakes.length; j++) {
            const players: [string, string] = [options.snakes[i], options.snakes[j]];
            for (const order of [players, [...players].reverse() as [string, string]]) matches.push({ index: matches.length, round, seed: options.seed + round, players: order });
        }
    }
    return matches;
}
