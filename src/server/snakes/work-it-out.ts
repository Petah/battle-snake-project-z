import { BTData } from '../../types/BTData';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';
import { moveTowardsFoodPf } from '../../lib/moveTowardsFoodPf';
import { moveTowardsEnemy } from '../../lib/moveTowardsEnemy';
import { smartRandomMove } from '../../lib/smartRandomMove';
import { randomMove } from '../../lib/randomMove';
import { moveAway } from '../../lib/moveAway';
import { moveTowardsTail } from '../../lib/moveTowardsTail';
import { BaseSnake } from './base-snake';

export class WorkItOut extends BaseSnake {
    public ops: ((data: BTData) => unknown)[] = [];
    public readonly appearance = {
        color: Color.BROWN,
        head: HeadType.SAND_WORM,
        tail: TailType.SHARP,
    };

    start(_data: BTData) {
        const options = [
            moveAway,
            moveTowardsEnemy,
            moveTowardsFoodPf,
            moveTowardsTail,
            randomMove,
            smartRandomMove,
        ];
        const opsCount = Math.max(1, Math.ceil(Math.random() * options.length));
        this.ops = [];
        while (this.ops.length < opsCount) {
            this.ops.push(options[Math.floor(Math.random() * options.length)]);
        }
        this.ops = this.ops.filter((v, i, a) => a.indexOf(v) === i);

        this.info = {
            name: this.constructor.name,
            ops: this.ops.map(op => op.name),
        };
    }

    move(data: BTData) {
        let direction;
        for (const op of this.ops) {
            direction = op(data);
            if (direction) {
                break;
            }
        }
        return {
            move: direction,
        };
    }
}
