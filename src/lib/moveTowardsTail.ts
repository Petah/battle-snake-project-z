import { log } from './log';
import { BTRequest, StrategyRequest } from '../types/BTData';
import { pathTo } from './Pather';
import { WeightOptions } from './weight';

// @todo don't move if near bigger snake
export function moveTowardsTail(request: StrategyRequest, weightOptions: WeightOptions = { blockHeads: true, attackHeads: true }) {
    const path = pathTo(request, request.body.you, request.body.you.body[request.body.you.body.length - 1].x, request.body.you.body[request.body.you.body.length - 1].y, weightOptions);
    if (path) {
        request.log('moveTowardsTail', path.direction);
        return path.direction;
    }
    request.log('moveTowardsTail', 'no options');
}
