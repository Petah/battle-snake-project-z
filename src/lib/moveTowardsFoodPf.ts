import { log } from './log';
import { StrategyRequest, BTXY, BTSnake } from '../types/BTData';
import { weight, WeightOptions } from './weight';
import { MoveDirection } from '../types/MoveDirection';
import { isSquad } from './isEnemy';
import { pathTo, Path } from './Pather';
import { idToInt } from './idToInt';

interface Distance {
    [snakeId: string]: Path,
}

interface Sorted {
    food: BTXY,
    distance: number,
    direction: MoveDirection,
    weight: number,
}

function sortedFood(request: StrategyRequest, weightOptions: WeightOptions): Sorted[] {
    if (!request.body.board.food.length) {
        return [];
    }
    const result: Sorted[] = [];
    for (const food of request.body.board.food) {
        const path = pathTo(request, request.body.you, food.x, food.y, weightOptions);
        if (path) {
            result.push({
                food: food,
                distance: path.distance,
                direction: path.direction,
                weight: weight(request, food.x, food.y, weightOptions)
            });
        }
    }
    result.sort((a, b) => {
        return a.distance - b.distance;
    })
    return result;
}

function isViable(closest: Sorted) {
    return closest.direction && closest.weight > 20;
}

function isSquadCloser(request: StrategyRequest, closest: Sorted, weightOptions: WeightOptions): BTSnake | null {
    for (const snake of request.body.board.snakes) {
        if (isSquad(request.body.you, snake, true)) {
            const path = pathTo(request, snake, closest.food.x, closest.food.y, weightOptions);
            if (path) {
                if (path.distance < closest.distance) {
                    return snake;
                }

                // Resolve same distance conflict
                if (path.distance == closest.distance) {
                    request.log('isSquadCloser', 'sameDistance')
                    if (idToInt(request.body.you.id) < idToInt(snake.id)) {
                        return snake;
                    }
                }
            }
        }
    }
    return null;
}

export function moveTowardsFoodPf(request: StrategyRequest, weightOptions: WeightOptions = { blockHeads: true, attackHeads: true }, ignoreCloserSquads = false) {
    const sorted = sortedFood(request, weightOptions);
    if (!sorted.length) {
        request.log('moveTowardsFoodPf', 'no food');
        return;
    }
    for (const closest of sorted) {
        if (isViable(closest)) {
            request.log('moveTowardsFoodPf', closest);
            if (ignoreCloserSquads) {
                const closerSquad = isSquadCloser(request, closest, weightOptions);
                if (closerSquad) {
                    request.log('moveTowardsFoodPf', 'closerSquad', closest, closerSquad);
                }
            }
            // Check if squad is closer
            if (!ignoreCloserSquads || !isSquadCloser(request, closest, weightOptions)) {
                request.log('moveTowardsFoodPf', closest.direction, closest.food, closest.weight, closest.distance);
                return closest.direction;
            }
        }
    }
    request.log('moveTowardsFoodPf', 'no options');
}
