import { StrategyRequest } from '../../types/BTData';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';
import { moveTowardsFoodPf } from '../../lib/moveTowardsFoodPf';
import { randomMove } from '../../lib/randomMove';
import { smartRandomMove } from '../../lib/smartRandomMove';
import { moveAway } from '../../lib/moveAway';
import { BaseSnake, StateFunction } from './base-snake';
import { ISnake } from './snake-interface';
import { ServerMoveResponse } from '../Server';
import { MoveDirection } from '../../types/MoveDirection';

export class ProjectZ extends BaseSnake implements ISnake {
    public port: number = 9001;

    public color = Color.PINK;
    public headType = HeadType.BELUGA;
    public tailType = TailType.BLOCK_BUM;

    protected states: StateFunction[] = [
        this.getFood,
        moveAway,
        smartRandomMove,
        randomMove,
    ];

    private getFood(request: StrategyRequest): MoveDirection {
        return moveTowardsFoodPf(request, {
            blockHeads: true,
            attackHeads: true,
        }, true);
    }
}
