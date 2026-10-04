import type { BTRequest } from '../types/BTData';
import type { ReplayFrame } from './dashboard';

const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const point = (value: unknown) => object(value) && Number.isInteger(value.x) && Number.isInteger(value.y);

export function normalizeFrame(value: unknown, origin?: ReplayFrame['origin']): ReplayFrame | undefined {
    if (!object(value)) {
        return;
    }
    const body = object(value.body) ? value.body : value;
    if (!object(body.board) || !object(body.game) || !object(body.you)) {
        return;
    }
    const board = body.board;
    if (!Number.isInteger(board.width) || !Number.isInteger(board.height) || board.width < 1 || board.height < 1 || board.width > 256 || board.height > 256 ||
        !Array.isArray(board.snakes) || !Array.isArray(board.food) || !board.food.every(point) || (!Array.isArray(board.hazards ?? []) || !(board.hazards ?? []).every(point))) {
        return;
    }
    const normalizeSnake = (snake: unknown) => {
        if (!object(snake) || typeof snake.id !== 'string' || !Array.isArray(snake.body) || !snake.body.length || !snake.body.every(point)) {
            return;
        }
        return { ...snake, name: String(snake.name ?? snake.id), health: Number.isFinite(Number(snake.health)) ? Number(snake.health) : 0, head: snake.body[0], length: snake.body.length };
    };
    const you = normalizeSnake(body.you);
    const snakes = board.snakes.map(normalizeSnake);
    if (!you || snakes.some(snake => !snake)) {
        return;
    }
    const logs = value.logs ?? body.log ?? [];
    return {
        turn: Number.isInteger(body.turn) ? body.turn : 0,
        origin: origin ?? (value.coordinateSystem === 'top-left' ? 'top-left' : value.coordinateSystem === 'bottom-left' || body.game.ruleset ? 'bottom-left' : 'top-left'),
        body: {
            ...body,
            game: { ...body.game, id: String(body.game.id ?? 'legacy'), timeout: body.game.timeout ?? 500, ruleset: { ...(object(body.game.ruleset) ? body.game.ruleset : {}), name: typeof body.game.ruleset?.name === 'string' ? body.game.ruleset.name : 'standard', version: String(body.game.ruleset?.version ?? 'legacy') } },
            board: { ...board, hazards: board.hazards ?? [], snakes }, you,
        } as BTRequest,
        logs: Array.isArray(logs) ? logs.map(line => Array.isArray(line) ? line : [line]) : [],
        grid: Array.isArray(value.grid) ? value.grid : undefined,
    };
}

