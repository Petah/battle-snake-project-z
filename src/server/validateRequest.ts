import { BTRequest, BTSnake, BTXY } from '../types/BTData';

export class RequestError extends Error {
    readonly status = 400;
}

function object(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coordinate(value: unknown): value is BTXY {
    return object(value) && Number.isInteger(value.x) && Number.isInteger(value.y);
}

function snake(value: unknown): value is BTSnake {
    return object(value) && typeof value.id === 'string' && value.id.length > 0 &&
        typeof value.name === 'string' && Number.isInteger(value.health) && value.health >= 0 && value.health <= 100 &&
        Array.isArray(value.body) && value.body.length > 0 && value.body.every(coordinate) &&
        coordinate(value.head) && value.head.x === value.body[0].x && value.head.y === value.body[0].y &&
        value.length === value.body.length;
}

export function validateRequest(body: unknown): BTRequest {
    if (!object(body) || !object(body.game) || typeof body.game.id !== 'string' || !body.game.id ||
        !object(body.game.ruleset) || typeof body.game.ruleset.name !== 'string' || !body.game.ruleset.name ||
        typeof body.game.ruleset.version !== 'string' ||
        !Number.isInteger(body.game.timeout) || body.game.timeout <= 0 ||
        !Number.isInteger(body.turn) || body.turn < 0 || !object(body.board) ||
        !Number.isInteger(body.board.width) || body.board.width <= 0 ||
        !Number.isInteger(body.board.height) || body.board.height <= 0 ||
        !Array.isArray(body.board.food) || !body.board.food.every(coordinate) ||
        !Array.isArray(body.board.hazards) || !body.board.hazards.every(coordinate) ||
        !Array.isArray(body.board.snakes) || !body.board.snakes.every(snake) || !snake(body.you)) {
        throw new RequestError('Invalid Battlesnake request: expected game, turn, board, and you in API v1 format.');
    }
    // Select wire fields so supplied cache/log values cannot enter strategy state.
    return {
        game: {
            ...body.game,
            id: body.game.id,
            ruleset: { ...body.game.ruleset, name: body.game.ruleset.name, version: body.game.ruleset.version },
            timeout: body.game.timeout,
        },
        turn: body.turn,
        board: {
            width: body.board.width, height: body.board.height,
            food: body.board.food, hazards: body.board.hazards, snakes: body.board.snakes,
        },
        you: body.you,
    };
}
