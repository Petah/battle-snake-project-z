
import { BTData } from '../../types/BTData';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';
import { moveTowardsFoodPf } from '../../lib/moveTowardsFoodPf';
import { randomMove } from '../../lib/randomMove';
import { smartRandomMove } from '../../lib/smartRandomMove';
import { moveAway } from '../../lib/moveAway';
import { BaseSnake } from './base-snake';
import { moveTowardsKill } from '../../lib/moveTowardsKill';

export class Dunno extends BaseSnake {
    public readonly appearance = {
            color: Color.NEPHRITIS,
            head: HeadType.SAND_WORM,
            tail: TailType.ROUND_BUM,
    };

    move(data: BTData) {
        let direction;
        direction = moveTowardsFoodPf(data);
        if (!direction) {
            direction = moveTowardsKill(data);
        }
        if (!direction) {
            direction = moveAway(data);
        }
        if (!direction) {
            direction = smartRandomMove(data);
        }
        if (!direction) {
            direction = randomMove(data);
        }
        return {
            move: direction,
        };
    }
}
