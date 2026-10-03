import { BTData } from '../../types/BTData';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';
import { moveTowardsFoodPf } from '../../lib/moveTowardsFoodPf';
import { moveTowardsEnemy } from '../../lib/moveTowardsEnemy';
import { randomMove } from '../../lib/randomMove';
import { moveAway } from '../../lib/moveAway';
import { smartRandomMove } from '../../lib/smartRandomMove';
import { BaseSnake } from './base-snake';

export class KeepAway extends BaseSnake {
    public readonly appearance = {
            color: Color.YELLOW,
            head: HeadType.DEAD,
            tail: TailType.CURLED,
    };
    move(data: BTData) {
        let direction;
        if (data.you.health < 10) {
            direction = moveTowardsFoodPf(data);
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
