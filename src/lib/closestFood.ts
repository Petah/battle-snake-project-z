import { gridDistance } from './gridDistance';
import { BTXY, BTRequest } from '../types/BTData';

interface Closest {
    food: BTXY,
    distance: number,
}

export function closestFood(data: BTRequest): Closest {
    const closest: Closest = {
        food: null,
        distance: 100000,
    };
    if (!data.board.food.length) {
        return null;
    }
    for (const food of data.board.food) {
        const distance = gridDistance(data.you.body[0].x, data.you.body[0].y, food.x, food.y);
        if (distance < closest.distance) {
            closest.food = food;
            closest.distance = distance;
        }
    }
    return closest;
}
