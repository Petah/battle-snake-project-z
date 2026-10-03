import { StrategyRequest } from '../../types/BTData';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';
import { BaseSnake } from './base-snake';
import { lookAhead } from '../../lib/lookAhead';
import { ISnake } from './snake-interface';
import { ServerMoveResponse } from '../Server';

export class LookAhead extends BaseSnake implements ISnake {
    public port: number = 9010;

    public color = Color.PLUM;
    public headType = HeadType.EVIL;
    public tailType = TailType.SHARP;

    public move(request: StrategyRequest): ServerMoveResponse | null {
        return {
            move: lookAhead(request.body),
        };
    }
}
