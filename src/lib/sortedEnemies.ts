import { gridDistance } from './gridDistance';
import { BTRequest, BTSnake } from '../types/BTData';

interface Sorted {
    snake: BTSnake,
    distance: number,
}

export function sortedEnemies(data: BTRequest): Sorted[] {
    if (!data.board.snakes.length) {
        return [];
    }
    const result = [];
    for (const snake of data.board.snakes) {
        if (snake.id == data.you.id) {
            continue;
        }
        result.push({
            snake: snake,
            distance: gridDistance(data.you.body[0].x, data.you.body[0].y, snake.body[0].x, snake.body[0].y),
        });
    }
    result.sort((a, b) => {
        return a.distance - b.distance;
    })
    return result;
}
