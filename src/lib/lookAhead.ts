import { BTRequest, BTSnake } from '../types/BTData';
import { MoveDirection } from '../types/MoveDirection';
import { isOutOfBounds, isFood } from './isFree';
import { log } from './log';
import { shuffle } from './shuffle';

export function lookAhead(data: BTRequest) {
    const directions = [MoveDirection.LEFT, MoveDirection.RIGHT, MoveDirection.UP, MoveDirection.DOWN];
    shuffle(directions);

    const start = new Date().getTime();
    const recurse = recurseDirections(data, 0, 7);
    log('lookAhead', 'recurse', recurse, new Date().getTime() - start);
    return recurse.direction;
}

function recurseDirections(data: BTRequest, depth, limit, chain = []) {
    const bestDirection = {
        direction: null,
        depth: depth,
        weight: 0,
        chain: chain,
    };
    if (depth >= limit) {
        // log('lookAhead', 'reached limit', bestDirection);
        return bestDirection;
    }
    const allDirections = tryAllDirections(data);
    for (const direction in allDirections) {
        const result = allDirections[direction];
        // @todo need to recursively add weights
        const resultWeight = weight(result);
        log('lookAhead', 'depth', chain.concat(direction), depth, result.dead, resultWeight);
        // log('lookAhead', 'depth', chain.concat(direction), depth, result.dead, result.data);
        if (!result.dead) {
            // @todo push to stack and do breadth first
            const nextBestDirection = recurseDirections(result.data, depth + 1, limit, chain.concat(direction));
            if (nextBestDirection.depth > bestDirection.depth || (nextBestDirection.depth == bestDirection.depth && resultWeight > bestDirection.weight)) {
                bestDirection.depth = nextBestDirection.depth;
                bestDirection.chain = nextBestDirection.chain;
                bestDirection.direction = direction;
                bestDirection.weight = resultWeight;
            }
        }
    }
    return bestDirection;
}

function getBestDirection(data: BTRequest) {
    const directions = [MoveDirection.LEFT, MoveDirection.RIGHT, MoveDirection.UP, MoveDirection.DOWN];
    shuffle(directions);

    const allDirections = tryAllDirections(data);
    return prioritize(allDirections, [
        r => !r.dead && r.food,
        r => r.food,
        r => !r.dead,
    ]);
}

function prioritize(allDirections, callbacks) {
    for (const callback of callbacks) {
        for (const direction in allDirections) {
            const result = allDirections[direction];
            if (callback(result)) {
                return direction;
            }
        }
    }
    return null;
}

function weight(result) {
    if (result.food) {
        return 1;
    }
    return 0;
}

function tryAllDirections(data: BTRequest) {
    const directions = [MoveDirection.LEFT, MoveDirection.RIGHT, MoveDirection.UP, MoveDirection.DOWN];
    shuffle(directions);
    const results = {};
    for (const direction of directions) {
        // @todo use faster clone
        const clonedData = JSON.parse(JSON.stringify(data));
        // @todo need to remove food if eaten
        moveSnakeInDirection(clonedData, clonedData.you, direction);
        results[direction] = {
            // @todo check for head on head kill
            data: clonedData,
            // @todo check for my head
            dead: isDead(clonedData, clonedData.you, clonedData.you.body[0].x, clonedData.you.body[0].y),
            food: isFood(clonedData, clonedData.you.body[0].x, clonedData.you.body[0].y),
        };
    }
    return results;
}

function isDead(data: BTRequest, you: BTSnake, x: number, y: number) {
    if (isOutOfBounds(data, x, y)) {
        return true;
    }
    for (const snake of data.board.snakes) {
        for (let i = 0; i < snake.body.length; i++) {
            if (i == 0 && snake.id == you.id) {
                continue;
            }
            if (snake.body[i].x == x && snake.body[i].y == y) {
                return true;
            }
        }
    }
    return false;
}

function moveAllSnakes(data: BTRequest) {
    const clonedData = JSON.parse(JSON.stringify(data));
    for (const snake of data.board.snakes) {

    }
}

function moveSnakeInDirection(data: BTRequest, snake: BTSnake, direction: MoveDirection) {
    for (let i = snake.body.length - 1; i > 0; i--) {
        snake.body[i].x = snake.body[i - 1].x;
        snake.body[i].y = snake.body[i - 1].y;
    }
    switch (direction) {
        case MoveDirection.UP:
            snake.body[0].y += 1;
            break;

        case MoveDirection.DOWN:
            snake.body[0].y -= 1;
            break;

        case MoveDirection.LEFT:
            snake.body[0].x -= 1;
            break;

        case MoveDirection.RIGHT:
            snake.body[0].x += 1;
            break;
    }
    if (snake.id === data.you.id) {
        for (let i = 0; i < data.board.snakes.length; i++) {
            if (data.board.snakes[i].id == snake.id) {
                data.board.snakes[i] = snake;
            }
        }
    }
    // @todo grow when eating food
}
