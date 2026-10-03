import { BTData } from '../../types/BTData';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';
import { moveTowardsFoodPf } from '../../lib/moveTowardsFoodPf';
import { moveTowardsEnemy } from '../../lib/moveTowardsEnemy';
import { randomMove } from '../../lib/randomMove';
import { smartRandomMove } from '../../lib/smartRandomMove';
import { BaseSnake } from './base-snake';

export class Tak extends BaseSnake {
    public readonly appearance = {
            color: Color.RED,
            head: HeadType.FANG,
            tail: TailType.FRECKLED,
    };
    move(data: BTData) {
        let direction;
        let biggestSnake = 0;
        for (const snake of data.board.snakes) {
            if (snake.id == data.you.id) {
                continue;
            }
            if (snake.body.length > biggestSnake) {
                biggestSnake = snake.body.length;
            }
        }
        if (data.you.health < 20 || data.you.body.length < biggestSnake) {
            direction = moveTowardsFoodPf(data);
        }
        if (!direction) {
            direction = moveTowardsEnemy(data);
        }
        if (!direction) {
            direction = moveTowardsFoodPf(data);
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
