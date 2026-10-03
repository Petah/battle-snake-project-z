import { BTData } from '../../types/BTData';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';
import { moveTowardsFoodPf } from '../../lib/moveTowardsFoodPf';
import { moveTowardsEnemy } from '../../lib/moveTowardsEnemy';
import { randomMove } from '../../lib/randomMove';
import { smartRandomMove } from '../../lib/smartRandomMove';
import { moveTowardsTail } from '../../lib/moveTowardsTail';
import { moveAway } from '../../lib/moveAway';
import { BaseSnake } from './base-snake';

export class TailChase extends BaseSnake {
    public readonly appearance = {
            color: Color.GREEN,
            head: HeadType.PIXEL,
            tail: TailType.HOOK,
    };
    move(data: BTData) {
        let direction;
        if (data.you.health < 20) {
            direction = moveTowardsFoodPf(data);
        }
        if (!direction) {
            direction = moveAway(data, 5);
        }
        if (!direction) {
            direction = moveTowardsTail(data);
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
