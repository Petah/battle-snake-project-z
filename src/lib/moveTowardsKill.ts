import { StrategyRequest } from '../types/BTData';
import { pathTo } from './Pather';
import { MoveDirection } from '../types/MoveDirection';

export function moveTowardsKill(request: StrategyRequest): MoveDirection {
    const closest = {
        snake: null,
        path: null,
    };
    for (const snake of request.body.board.snakes) {
        if (snake.id == request.body.you.id) {
            continue;
        }
        if (snake.body.length >= request.body.you.body.length) {
            continue;
        }
        const path = pathTo(request, request.body.you, snake.body[0].x, snake.body[0].y, {
            blockHeads: false,
            attackHeads: true,
        });
        if (path && path.distance <= 3) {
            if (!closest.path || path.distance < closest.path.distance) {
                closest.snake = snake;
                closest.path = path;
            }
        }
    }
    if (closest.path) {
        if (closest.path.direction) {
            request.log('moveTowardsKill', closest.path.direction);
            return closest.path.direction;
        } else {
            request.log('moveTowardsKill', 'no direction');
        }
    } else {
        request.log('moveTowardsKill', 'no closest');
    }
    request.log('moveTowardsKill', 'no options');
}
