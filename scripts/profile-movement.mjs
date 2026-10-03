import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
const require = createRequire(import.meta.url);
const { StrategyRequest } = require('../dist/types/BTData.js');
const { weight } = require('../dist/lib/weight.js');
const { pathTo } = require('../dist/lib/Pather.js');

// A repeatable local workload: score the entire board, then search three paths
// using the same per-request caches. These timings are observations, not CI gates.
for (const size of [11, 19, 25]) {
    const you = {
        id: 'you', name: 'you', health: 90, length: 3, head: { x: 1, y: 1 },
        body: [{ x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }],
    };
    const data = {
        game: { id: 'profile', ruleset: { name: 'standard', version: 'v1.2.3' }, timeout: 500 },
        turn: 5, board: { width: size, height: size, food: [], hazards: [], snakes: [you] }, you,
    };
    const durations = [];
    for (let iteration = 0; iteration < 55; iteration++) {
        const start = performance.now();
        const request = new StrategyRequest(data);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) weight(request, x, y, { blockHeads: true, attackHeads: true });
        for (const target of [{ x: size - 1, y: size - 1 }, { x: 0, y: size - 1 }, { x: size - 1, y: 0 }]) pathTo(request, you, target.x, target.y);
        if (iteration >= 5) durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    const round = value => Number(value.toFixed(2));
    console.log(JSON.stringify({ board: `${size}x${size}`, samples: durations.length,
        medianMs: round(durations[24]), p95Ms: round(durations[47]), maxMs: round(durations.at(-1)), timeoutMs: data.game.timeout }));
}
