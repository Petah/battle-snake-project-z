import { StrategyRequest } from '../types/BTData';
import { gridDistance } from './gridDistance';
import { pathTo } from './Pather';

const closestBlocked = (request: StrategyRequest, sx: number, sy: number) => {
    let distance;
    let closest = 10000;
    for (const snake of request.body.board.snakes) {
        for (const part of snake.body) {
            distance = gridDistance(sx, sy, part.x, part.y);
            if (distance < closest) {
                closest = distance;
            }
        }
    }
    for (let x = 0; x < request.body.board.width; x++) {
        distance = gridDistance(sx, sy, x, -1);
        if (distance < closest) {
            closest = distance;
        }
        distance = gridDistance(sx, sy, x, request.body.board.height + 1);
        if (distance < closest) {
            closest = distance;
        }
    }
    for (let y = 0; y < request.body.board.height; y++) {
        distance = gridDistance(sx, sy, -1, y);
        if (distance < closest) {
            closest = distance;
        }
        distance = gridDistance(sx, sy, request.body.board.width + 1, y);
        if (distance < closest) {
            closest = distance;
        }
    }
    return closest;
};

export function moveAway(request: StrategyRequest, minDistance = null) {
    const furthestAway = {
        x: null,
        y: null,
        distance: null,
        pathDirection: null,
    };
    const grid = [];
    for (let y = 0; y < request.body.board.height; y++) {
        const row = [];
        for (let x = 0; x < request.body.board.width; x++) {
            row[x] = closestBlocked(request, x, y);
            if (furthestAway.distance === null || row[x] > furthestAway.distance) {
                const path = pathTo(request, request.body.you, x, y, {
                    blockHeads: true,
                    attackHeads: true,
                });
                if (path) {
                    furthestAway.x = x;
                    furthestAway.y = y;
                    furthestAway.distance = row[x];
                    furthestAway.pathDirection = path.direction;
                }
            }
        }
        grid[y] = row;
    }

    if (minDistance !== null) {
        for (const snake of request.body.board.snakes) {
            if (snake.id == request.body.you.id) {
                continue;
            }
            const path = pathTo(request, request.body.you, snake.body[0].x, snake.body[0].y, {
                blockHeads: true,
                attackHeads: true,
            });
            if (path && path.distance <= minDistance) {
                request.log('moveAway', 'minDistance', furthestAway);
                return furthestAway.pathDirection;
            }
        }
        request.log('moveAway', 'minDistance', 'no need');
        return;
    }

    if (furthestAway) {
        request.log('moveAway', furthestAway);
        return furthestAway.pathDirection;
    }
    request.log('moveAway', 'no options');
}
