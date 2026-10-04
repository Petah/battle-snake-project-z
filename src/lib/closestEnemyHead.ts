import { BTSnake, StrategyRequest } from '../types/BTData';
import { Path, pathTo } from './Pather';
import { isEnemy } from './isEnemy';
import { MoveDirection } from '../types/MoveDirection';

interface ClosestEnemyHead {
    snake: BTSnake,
    path: Path,
    direction: MoveDirection,
}

export function closestEnemyHead(request: StrategyRequest): ClosestEnemyHead | null {
    const closest: ClosestEnemyHead = {
        snake: null,
        path: null,
        direction: null,
    };
    for (const snake of request.body.board.snakes) {
        if (!isEnemy(request.body.you, snake)) {
            continue;
        }
        if (request.body.you.body.length > snake.body.length) {
            continue;
        }
        const path = pathTo(request, request.body.you, snake.body[0].x, snake.body[0].y, {
            blockHeads: false,
            attackHeads: true,
        });
        if (path) {
            if (!closest.path || path.distance < closest.path.distance) {
                closest.snake = snake;
                closest.path = path;
                closest.direction = path.direction;
            }
        }
    }
    return closest.snake ? closest : null;
}
