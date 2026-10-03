import { log } from './log';
import { BTData } from '../types/BTData';
import { sortedFood } from './sortedFood';
import { Pather } from './Pather';
import { weight } from './weight';

export function moveTowardsFoodPf(data: BTData) {
    const pather = new Pather(data);

    const sorted = sortedFood(data);
    if (!sorted.length) {
        log('moveTowardsFoodPf', 'no food');
        return;
    }
    for (const closest of sorted) {
        const direction = pather.pathDirection(closest.food.x, closest.food.y);
        const w = weight(data, closest.food.x, closest.food.y);
        if (direction && w > 20) {
            log('moveTowardsFoodPf', direction, closest);
            return direction;
        }
    }
    log('moveTowardsFoodPf', 'no options');
}
