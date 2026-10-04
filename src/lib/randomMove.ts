import { isFree, isHeadThreat } from './isFree';
import { log } from './log';
import { StrategyRequest } from '../types/BTData';
import { directions, nextPosition } from './directions';
import { shuffle } from './shuffle';

export function randomMove(data: StrategyRequest) {
    const options = [...directions];
    shuffle(options);
    let available;
    for (const direction of options) {
        const { x, y } = nextPosition(data.you.head, direction);
        if (isFree(data, x, y)) {
            available ??= direction;
            if (isHeadThreat(data, x, y)) {
                continue;
            }
            log('randomMove', direction);
            return direction;
        }
    }
    log('randomMove', 'no-options');
    return available;
}
