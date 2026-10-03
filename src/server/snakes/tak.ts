import { StrategyRequest } from '../../types/BTData';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';
import { moveTowardsFoodPf } from '../../lib/moveTowardsFoodPf';
import { moveTowardsEnemy } from '../../lib/moveTowardsEnemy';
import { randomMove } from '../../lib/randomMove';
import { smartRandomMove } from '../../lib/smartRandomMove';
import { BaseSnake, StateFunction } from './base-snake';
import { ISnake } from './snake-interface';
import { isEnemy } from '../../lib/isEnemy';
import { MoveDirection } from '../../types/MoveDirection';

export class Tak extends BaseSnake implements ISnake {
    public port: number = 9004;

    public color = Color.RED;
    public headType = HeadType.FANG;
    public tailType = TailType.FRECKLED;

    protected states: StateFunction[] = [
        this.getFoodIfSmaller,
        moveTowardsEnemy,
        this.getFood,
        smartRandomMove,
        randomMove,
    ];

    private getFoodIfSmaller(request: StrategyRequest): MoveDirection {
        let biggestSnake = 0;
        for (const snake of request.body.board.snakes) {
            if (!isEnemy(request.body.you, snake)) {
                continue;
            }
            if (snake.body.length > biggestSnake) {
                biggestSnake = snake.body.length;
            }
        }
        if (request.body.you.health < 15 || request.body.you.body.length < biggestSnake) {
            return moveTowardsFoodPf(request, {
                blockHeads: true,
                attackHeads: true,
            }, true);
        }
    }

    private getFood(request: StrategyRequest): MoveDirection {
        return moveTowardsFoodPf(request, {
            blockHeads: true,
            attackHeads: true,
        }, true);
    }
}
