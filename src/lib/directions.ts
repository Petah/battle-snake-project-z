import { isFree, isHeadThreat } from './isFree';
import { BTRequest, BTXY } from '../types/BTData';
import { MoveDirection } from '../types/MoveDirection';

export const directions = [MoveDirection.UP, MoveDirection.DOWN, MoveDirection.LEFT, MoveDirection.RIGHT];

const offsets: Record<MoveDirection, BTXY> = {
    up: { x: 0, y: 1 },
    down: { x: 0, y: -1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

export function isDirection(value: unknown): value is MoveDirection {
    return directions.includes(value as MoveDirection);
}

export function nextPosition(head: BTXY, direction: MoveDirection): BTXY {
    const offset = offsets[direction];
    return { x: head.x + offset.x, y: head.y + offset.y };
}

export function directionTo(head: BTXY, target: BTXY): MoveDirection | undefined {
    return directions.find(direction => {
        const next = nextPosition(head, direction);
        return next.x === target.x && next.y === target.y;
    });
}

export function fallbackMove(data: BTRequest): MoveDirection {
    const head = data.you.head;
    const candidates = directions.filter(direction => {
        const { x, y } = nextPosition(head, direction);
        return isFree(data, x, y);
    });
    const safe = candidates.find(direction => {
        const { x, y } = nextPosition(head, direction);
        return !isHeadThreat(data, x, y);
    }) ?? candidates[0];
    if (safe) {
        return safe;
    }
    // A trapped snake still needs a valid response. Continue forward if possible.
    return data.you.body[1] ? directionTo(data.you.body[1], head) ?? MoveDirection.UP : MoveDirection.UP;
}
