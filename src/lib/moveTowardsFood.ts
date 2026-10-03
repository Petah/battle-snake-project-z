import { shuffle } from './shuffle';
import { gridDistance } from './gridDistance';
import { isFree } from './isFree';
import { log } from './log';
import { BTData } from '../types/BTData';
import { closestFood } from './closestFood';
import { directions, nextPosition } from './directions';

export function moveTowardsFood(data: BTData) {
    const closest = closestFood(data);
    if (!closest) {
        log('moveTowardsFood', 'no food');
        return;
    }

    const options = [...directions];
    shuffle(options);
    for (const direction of options) {
        const { x, y } = nextPosition(data.you.head, direction);
        if (isFree(data, x, y) && gridDistance(x, y, closest.food.x, closest.food.y) < closest.distance) {
            log('moveTowardsFood', direction, data.you.body[0].x, data.you.body[0].y, closest);
            return direction;
        }
    }
    log('moveTowardsFood', 'no options');
}
