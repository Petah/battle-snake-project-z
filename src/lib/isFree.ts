import { BTRequest, BTSnake } from '../types/BTData';
import { gridDistance } from './gridDistance';

export function isOutOfBounds(data: BTRequest, x: number, y: number) {
    return !Number.isInteger(x) || !Number.isInteger(y) ||
        x < 0 || y < 0 || x >= data.board.width || y >= data.board.height;
}

export function allowsBodyCollision(data: BTRequest, snake: BTSnake, perspective = data.you) {
    return snake.id !== perspective.id && !!perspective.squad && snake.squad === perspective.squad &&
        data.game.ruleset?.name === 'squad' && data.game.ruleset.settings?.squad?.allowBodyCollisions === true;
}

export function boardSnakes(data: BTRequest): BTSnake[] {
    return data.board.snakes.some(snake => snake.id === data.you.id) ? data.board.snakes : [...data.board.snakes, data.you];
}

export function occupiedSquares(data: BTRequest, ignoreEnemyHeads = false, perspective = data.you): Set<string> {
    const occupied = new Set<string>();
    for (const snake of boardSnakes(data)) {
        if (allowsBodyCollision(data, snake, perspective)) continue;
        // Movement removes exactly one final segment before collision checks.
        // A duplicated tail is still occupied by its penultimate segment.
        for (let index = 0; index < snake.body.length - 1; index++) {
            if (ignoreEnemyHeads && index === 0 && snake.id !== perspective.id) continue;
            const part = snake.body[index];
            occupied.add(`${part.x}:${part.y}`);
        }
    }
    return occupied;
}

export function isFree(data: BTRequest, x: number, y: number, ignoreEnemyHeads = false, perspective = data.you) {
    if (isOutOfBounds(data, x, y)) return false;
    for (const snake of boardSnakes(data)) {
        if (allowsBodyCollision(data, snake, perspective)) continue;
        for (let index = 0; index < snake.body.length - 1; index++) {
            if (ignoreEnemyHeads && index === 0 && snake.id !== perspective.id) continue;
            if (snake.body[index].x === x && snake.body[index].y === y) return false;
        }
    }
    return true;
}

export function isHeadThreat(data: BTRequest, x: number, y: number) {
    return data.board.snakes.some(snake => snake.id !== data.you.id &&
        !allowsBodyCollision(data, snake) &&
        snake.body.length >= data.you.body.length && gridDistance(x, y, snake.body[0].x, snake.body[0].y) === 1 &&
        isFree(data, x, y, false, snake));
}

export function isFood(data: BTRequest, x: number, y: number) {
    return data.board.food.some(food => food.x === x && food.y === y);
}
