import { isFree } from './isFree';
import { log } from './log';
import { BTData } from '../types/BTData';
import { directions, nextPosition } from './directions';
import { shuffle } from './shuffle';

export function randomMove(data: BTData) {
    const options = [...directions];
    shuffle(options);
    for (const direction of options) {
        const { x, y } = nextPosition(data.you.head, direction);
        if (isFree(data, x, y)) {
            log('randomMove', direction);
            return direction;
        }
    }
    log('randomMove', 'no-options');
}
