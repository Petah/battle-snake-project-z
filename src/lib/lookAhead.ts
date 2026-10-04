import { BTRequest } from '../types/BTData';
import { MoveDirection } from '../types/MoveDirection';
import { isFree, isFood, isHeadThreat } from './isFree';
import { directions, nextPosition } from './directions';
import { log } from './log';
import { shuffle } from './shuffle';

// Simulate our known move. Opponent future positions remain a conservative
// snapshot; this is a bounded survival heuristic, not a full multiplayer solver.
export function simulateMove(data: BTRequest, direction: MoveDirection) {
    const head = nextPosition(data.you.head, direction);
    const eats = isFood(data, head.x, head.y);
    const body = [head, ...data.you.body.slice(0, -1).map(part => ({ ...part }))];
    if (eats) {
        body.push({ ...body[body.length - 1] });
    }
    const hazardCount = data.board.hazards.filter(part => part.x === head.x && part.y === head.y).length;
    const health = eats ? 100 : data.you.health - 1 - hazardCount * (data.game.ruleset?.settings?.hazardDamagePerTurn ?? 0);
    const you = { ...data.you, body, head, length: body.length, health };
    return {
        dead: !isFree(data, head.x, head.y) || isHeadThreat(data, head.x, head.y) || health <= 0,
        food: eats,
        data: {
            ...data, turn: data.turn + 1, you,
            board: {
                ...data.board,
                food: data.board.food.filter(part => part.x !== head.x || part.y !== head.y),
                snakes: data.board.snakes.map(snake => snake.id === you.id ? you : snake),
            },
        },
    };
}

export function lookAhead(data: BTRequest) {
    const start = performance.now();
    const deadline = start + Math.max(1, Math.min(50, data.game.timeout / 4));
    const choices = [...directions];
    shuffle(choices);
    let best: { direction?: MoveDirection; depth: number; food: number } = { depth: -1, food: -1 };
    for (const direction of choices) {
        const next = simulateMove(data, direction);
        if (next.dead) {
            continue;
        }
        const result = search(next.data, 1, deadline);
        const food = result.food + Number(next.food);
        if (result.depth > best.depth || (result.depth === best.depth && food > best.food)) {
            best = { direction, depth: result.depth, food };
        }
    }
    log('lookAhead', best, performance.now() - start);
    return best.direction;
}

function search(data: BTRequest, depth: number, deadline: number): { depth: number; food: number } {
    let best = { depth, food: 0 };
    if (depth >= 7 || performance.now() >= deadline) {
        return best;
    }
    for (const direction of directions) {
        if (performance.now() >= deadline) {
            break;
        }
        const next = simulateMove(data, direction);
        if (next.dead) {
            continue;
        }
        const result = search(next.data, depth + 1, deadline);
        const food = result.food + Number(next.food);
        if (result.depth > best.depth || (result.depth === best.depth && food > best.food)) {
            best = { depth: result.depth, food };
        }
    }
    return best;
}
