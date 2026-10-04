import { StrategyRequest } from '../types/BTData';
import { isFree, isFood, isOutOfBounds, occupiedSquares, isHeadThreat } from './isFree';
import { cache } from './cache';

export const BLOCKED_THRESHOLD = 10;

export function floodFill(request: StrategyRequest, x: number, y: number) {
    if (isOutOfBounds(request.body, x, y)) {
        return 0;
    }
    const counts = cache(request, 'floodFill', {});
    const key = `${x}:${y}`;
    if (counts[key] !== undefined) {
        return counts[key];
    }
    return floodFillCache(request, x, y);
}

export function floodFillCache(request: StrategyRequest, x: number, y: number) {
    const counts = cache(request, 'floodFill', {});
    const occupied: Set<string> = request.cache.occupiedSquares ??= occupiedSquares(request.body);
    const startKey = `${x}:${y}`;
    if (isOutOfBounds(request.body, x, y) || occupied.has(startKey)) {
        counts[startKey] = 0;
        return 0;
    }
    const nodes = [{ x, y }];
    const visited = new Set([startKey]);
    for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        for (const next of [
            { x: node.x + 1, y: node.y }, { x: node.x - 1, y: node.y },
            { x: node.x, y: node.y + 1 }, { x: node.x, y: node.y - 1 },
        ]) {
            const key = `${next.x}:${next.y}`;
            if (isOutOfBounds(request.body, next.x, next.y) || occupied.has(key) || visited.has(key)) {
                continue;
            }
            visited.add(key);
            nodes.push(next);
        }
    }
    for (const key of visited) {
        counts[key] = nodes.length;
    }
    return nodes.length;
}

export interface WeightOptions {
    blockHeads: boolean,
    attackHeads: boolean,
    borders?: boolean,
    snakeBodies?: boolean,
    deadEnds?: boolean,
    avoidFood?: boolean,
}

export function weight(request: StrategyRequest, x: number, y: number, options: WeightOptions): number {
    if (isOutOfBounds(request.body, x, y)) {
        return 0;
    }
    const settings = { borders: true, snakeBodies: true, deadEnds: true, avoidFood: false, ...options };
    const result = computeWeight(request, x, y, settings);
    request.grid[y][x].weight = result;
    const color = Math.round(result / 100 * 255);
    request.grid[y][x].color = `rgba(${color}, ${color}, ${color}, 1)`;
    return result;
}

function computeWeight(request: StrategyRequest, x: number, y: number, options: WeightOptions): number {
    if (!isFree(request.body, x, y, !options.blockHeads)) {
        return 0;
    }
    if (options.attackHeads && isHeadThreat(request.body, x, y)) {
        return 0;
    }
    if (request.body.board.hazards.some(hazard => hazard.x === x && hazard.y === y)) {
        return 5;
    }
    let result = 100;
    if (options.avoidFood) {
        if (isFood(request.body, x, y)) {
            result = Math.min(result, 30);
        }
    }

    // Enemy-head targets are virtual endpoints for distance/attack queries.
    // Their occupied square has no free-region count; actual first steps are checked separately.
    if (options.deadEnds && isFree(request.body, x, y)) {
        const fillCount = floodFill(request, x, y);
        if (fillCount < request.body.you.body.length) {
            result = Math.min(result, fillCount);
        }
    }

    if (options.snakeBodies) {
        for (const snake of request.body.board.snakes) {
            const body = snake.body;
            for (const [p, part] of body.entries()) {
                let tailWeight = 40;
                if (p == body.length - 1) {
                    tailWeight = 55;
                }
                if (x + 1 == part.x && y == part.y) {
                    result = Math.min(result, tailWeight);
                }
                if (x - 1 == part.x && y == part.y) {
                    result = Math.min(result, tailWeight);
                }
                if (x == part.x && y + 1 == part.y) {
                    result = Math.min(result, tailWeight);
                }
                if (x == part.x && y - 1 == part.y) {
                    result = Math.min(result, tailWeight);
                }
            }
        }
    }

    // Borders
    if (options.borders) {
        if (x == 0) {
            result = Math.min(result, 35);
        }

        if (y == 0) {
            result = Math.min(result, 35);
        }

        if (x == request.body.board.width - 1) {
            result = Math.min(result, 35);
        }

        if (y == request.body.board.height - 1) {
            result = Math.min(result, 35);
        }
    }

    result = Math.min(result, 50);
    return result;
}
