import { gridDistance } from './gridDistance';
import { BTRequest, StrategyRequest } from '../types/BTData';
import { isFree, isFood } from './isFree';
import { cache } from './cache';
import { isEnemy, isSquad } from './isEnemy';

export const BLOCKED_THRESHOLD = 10;

export function floodFill(request: StrategyRequest, x: number, y: number) {
    const c = cache(request, 'floodFill', {});
    const key = x + ':' + y;
    if (!c[key]) {
        c[key] = floodFillCache(request, x, y);
    }
    return c[key];
}

export function floodFillCache(request: StrategyRequest, x: number, y: number) {
    let count = 0;
    const nodes = [];
    nodes.push({
        x,
        y,
    });
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (isFree(request.body, node.x, node.y)) {
            count++;
            if (!nodes.find(n => n.x == node.x + 1 && n.y == node.y)) {
                nodes.push({
                    x: node.x + 1,
                    y: node.y,
                });
            }
            if (!nodes.find(n => n.x == node.x - 1 && n.y == node.y)) {
                nodes.push({
                    x: node.x - 1,
                    y: node.y,
                });
            }
            if (!nodes.find(n => n.x == node.x && n.y == node.y + 1)) {
                nodes.push({
                    x: node.x,
                    y: node.y + 1,
                });
            }
            if (!nodes.find(n => n.x == node.x && n.y == node.y - 1)) {
                nodes.push({
                    x: node.x,
                    y: node.y - 1,
                });
            }
        }
    }
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const key = node.x + ':' + node.y;
        request.cache.floodFill[key] = count;
    }
    return count;
};

const isDeadEnd = (data: BTRequest, x: number, y: number) => {
    if (!isFree(data, x - 1, y) && !isFree(data, x + 1, y) && !isFree(data, x, y - 1) && !isFree(data, x, y + 1)) {
        return true;
    }
    return false;
};

const isTail = (data: BTRequest, x: number, y: number) => {
    for (const snake of data.board.snakes) {
        const part = snake.body[data.you.body.length - 1];
        if (x == part.x && y == part.y) {
            return true;
        }
    }
    return false;
};

const isOwnTail = (data: BTRequest, x: number, y: number) => {
    const part = data.you.body[data.you.body.length - 1];
    if (x == part.x && y == part.y) {
        return true;
    }
    return false;
};

const isNearTail = (data: BTRequest, x: number, y: number) => {
    for (const snake of data.board.snakes) {
        const body = snake.body;
        const part = body[body.length - 1];
        if (x == part.x && y == part.y) {
            return true;
        }
        if (x + 1 == part.x && y == part.y) {
            return true;
        }
        if (x - 1 == part.x && y == part.y) {
            return true;
        }
        if (x == part.x && y + 1 == part.y) {
            return true;
        }
        if (x == part.x && y - 1 == part.y) {
            return true;
        }
    }
    return false;
};

export interface WeightOptions {
    blockHeads: boolean,
    attackHeads: boolean,
    borders?: boolean,
    snakeBodies?: boolean,
    deadEnds?: boolean,
    avoidFood?: boolean,
}

export function weight(request: StrategyRequest, x: number, y: number, options: WeightOptions): number {
    if (options.borders === undefined) {
        options.borders = true;
    }
    if (options.snakeBodies === undefined) {
        options.snakeBodies = true;
    }
    if (options.deadEnds === undefined) {
        options.deadEnds = true;
    }
    if (options.avoidFood === undefined) {
        options.avoidFood = false;
    }

    request.grid[y][x].weight = computeWeight(request, x, y, options);

    const color = Math.round((request.grid[y][x].weight) / 100 * 255);
    request.grid[y][x].color = `rgba(${color}, ${color}, ${color}, 1)`;

    return request.grid[y][x].weight;
}

function computeWeight(request: StrategyRequest, x: number, y: number, options: WeightOptions): number {
    if (request.body.board.hazards) {
        for (const hazard of request.body.board.hazards) {
            if (hazard.x == x && hazard.y == y) {
                return 5;
            }
        }
    }

    let result = 100;
    for (const snake of request.body.board.snakes) {
        for (const [p, part] of snake.body.entries()) {
            // Is part of snake?
            if (part.x == x && part.y == y) {
                // Is end of snake?
                if (p != snake.body.length - 1) {
                    // Is head of snake, and head blocking?
                    if (p === 0 && !options.blockHeads) {
                        continue;
                    }
                    // Check squad mode
                    if (isSquad(request.body.you, snake, false)) {
                        continue;
                    }
                    // Is tail stacked
                    if (snake.body.length > 3 && p == snake.body.length - 2 && (snake.body[snake.body.length - 1].x == snake.body[snake.body.length - 2].x && snake.body[snake.body.length - 1].y == snake.body[snake.body.length - 2].y)) {
                        continue;
                    }
                    return 0;
                }
            }
        }
    }

    // if (isOwnTail(request.body, x, y)) {
    //     return 100;
    // }

    // if (isNearTail(request.body, x, y)) {
    //     return 75;
    // }
    if (options.avoidFood) {
        if (isFood(request.body, x, y)) {
            result = Math.min(result, 30);
        }
    }

    if (options.deadEnds) {
        if (isDeadEnd(request.body, x, y) && !isNearTail(request.body, x, y)) {
            return 1;
        }

        const fillCount = floodFill(request, x, y);
        if (fillCount < request.body.you.body.length) {
            result = Math.min(result, fillCount);
        }
    }

    if (options.attackHeads) {
        for (const snake of request.body.board.snakes) {
            const body = snake.body;
            for (const [p, part] of body.entries()) {
                // Is near head?
                if (snake.id != request.body.you.id && p == 0 && snake.body.length >= request.body.you.body.length) {
                    const distance = gridDistance(x, y, part.x, part.y);
                    if (distance < 3) {
                        result = Math.min(result, distance * 10);
                    }
                }
            }
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
