import { StrategyRequest } from '../../types/BTData';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';
import { moveTowardsFoodPf } from '../../lib/moveTowardsFoodPf';
import { randomMove } from '../../lib/randomMove';
import { smartRandomMove } from '../../lib/smartRandomMove';
import { moveTowardsTail } from '../../lib/moveTowardsTail';
import { moveAway } from '../../lib/moveAway';
import { BaseSnake, StateFunction } from './base-snake';
import { ISnake } from './snake-interface';
import { closestEnemyHead } from '../../lib/closestEnemyHead';
import { MoveDirection } from '../../types/MoveDirection';

export class TailChase extends BaseSnake implements ISnake {
    public port: number = 9005;

    public color = Color.GREEN;
    public headType = HeadType.PIXEL;
    public tailType = TailType.HOOK;

    protected states: StateFunction[] = [
        this.getFood,
        this.runAwayRandom,
        this.chaseTail,
        smartRandomMove,
        randomMove,
    ];

    private getFood(request: StrategyRequest): MoveDirection {
        if (request.body.you.health < request.body.board.width || request.body.you.health < request.body.board.height) {
            request.log('TailChase', 'gettingFood');
            return moveTowardsFoodPf(request, {
                blockHeads: true,
                attackHeads: true,
                borders: false,
                snakeBodies: false,
                deadEnds: false,
            }, true);
        }
    }

    private chaseTail(request: StrategyRequest): MoveDirection {
        return moveTowardsTail(request, {
            blockHeads: true,
            attackHeads: false,
            borders: false,
            snakeBodies: false,
            deadEnds: false,
            avoidFood: true,
        });
    }

    private runAwayRandom(request: StrategyRequest): MoveDirection {
        const closest = closestEnemyHead(request);
        if (closest && closest.path.distance <= 4) {
            return smartRandomMove(request, {
                blockHeads: true,
                attackHeads: false,
            });
        }
    }

    private runAway(request: StrategyRequest): MoveDirection {
        const closest = closestEnemyHead(request);
        if (closest && closest.path.distance <= 4) {
            return moveAway(request);
        }
    }
}
