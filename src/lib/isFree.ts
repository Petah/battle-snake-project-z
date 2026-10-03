import { BTRequest } from "../types/BTData";

export function isOutOfBounds(data: BTRequest, x: number, y: number) {
    if (x < 0) {
        return true;
    }
    if (y < 0) {
        return true;
    }
    if (x >= data.board.width) {
        return true;
    }
    if (y >= data.board.height) {
        return true;
    }
    return false;
}

export function isFree(data: BTRequest, x: number, y: number) {
    if (isOutOfBounds(data, x, y)) {
        return false;
    }
    for (const snake of data.board.snakes) {
        for (const part of snake.body) {
            if (part.x == x && part.y == y) {
                return false;
            }
        }
        // if (snake.id != data.you.id) {
        //     if (x >= snake.body[0].x - 1 &&
        //         x <= snake.body[0].x + 1 &&
        //         y >= snake.body[0].y - 1 &&
        //         y <= snake.body[0].y + 1) {
        //         return false;
        //     }
        // }
    }
    return true;
}

export function isFood(data: BTRequest, x: number, y: number) {
    for (const food of data.board.food) {
        if (food.x == x && food.y == y) {
            return true;
        }
    }
    return false;
}
