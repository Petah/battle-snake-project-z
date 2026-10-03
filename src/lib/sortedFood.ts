import { gridDistance } from './gridDistance';
import { log } from './log';
import { BTXY, BTRequest } from '../types/BTData';

interface Distance {
    [snakeId: string]: number,
}

interface Sorted {
    food: BTXY,
    distance: number,
    distances: Distance,
}

export function sortedFood(data: BTRequest): Sorted[] {
    if (!data.board.food.length) {
        return [];
    }
    const result: Sorted[] = [];
    for (const food of data.board.food) {
        const distances: Distance = {};
        for (const snake of data.board.snakes) {
            distances[snake.id] = gridDistance(snake.body[0].x, snake.body[0].y, food.x, food.y)
        }

        result.push({
            food: food,
            distance: distances[data.you.id],
            distances,
        });
    }
    result.sort((a, b) => {
        return a.distance - b.distance;
    })
    return result;
}
