import { vesperMove } from '../../lib/vesper';
import { StrategyRequest } from '../../types/BTData';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';
import { BaseSnake } from './base-snake';

export class Vesper extends BaseSnake {
    public port = 9012;
    public color = Color.AMETHYST;
    public headType = HeadType.FANG;
    public tailType = TailType.HOOK;
    public move(request: StrategyRequest) {
        const result = vesperMove(request.body);
        request.log('Vesper', result);
        return { move: result.move, shout: `Vesper · depth ${result.depth} · ${result.nodes} nodes` };
    }
}
