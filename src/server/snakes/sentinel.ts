import { sentinelMove } from '../../lib/sentinel';
import { StrategyRequest } from '../../types/BTData';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';
import { BaseSnake } from './base-snake';

export class Sentinel extends BaseSnake {
    public port = 9011;
    public color = Color.TEAL;
    public headType = HeadType.EVIL;
    public tailType = TailType.SHARP;
    public move(request: StrategyRequest) {
        const result = sentinelMove(request.body);
        request.log('Sentinel', result);
        return { move: result.move, shout: `Sentinel · search ${result.depth}` };
    }
}
