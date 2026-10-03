import { isFree } from './isFree';
import { log } from './log';
import { BTData } from '../types/BTData';
import { directions as moveDirections, nextPosition } from './directions';
import { shuffle } from './shuffle';
import { weight } from './weight';

export function smartRandomMove(data: BTData) {
    let directions = moveDirections.map(direction => ({ direction, weight: 0 }));

    for (const d of directions) {
        const { x, y } = nextPosition(data.you.head, d.direction);

        if (isFree(data, x, y)) {
            d.weight = weight(data, x, y);
        }
    }
    directions = directions
        .filter(d => d.weight > 0)
        .sort((a, b) => b.weight - a.weight);
    if (!directions.length) {
        log('smartRandomMove', 'no-options');
        return;
    }
    const bestWeight = directions[0].weight;
    directions = directions.filter(d => d.weight == bestWeight);
    shuffle(directions);
    log('smartRandomMove', directions);
    return directions[0].direction;
}
