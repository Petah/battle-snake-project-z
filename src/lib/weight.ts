import { gridDistance } from './gridDistance';
import { BTData } from '../types/BTData';

export const BLOCKED_THRESHOLD = 10;

export function weight(data: BTData, x: number, y: number) {
    for (const snake of data.board.snakes) {
        const body = snake.body;
        // const body = snake.body.filter((p1, i, a) => a.findIndex(p2 => p1.x == p2.x && p1.y == p2.y) === i);
        for (const [p, part] of body.entries()) {
            // Is part of snake?
            if (part.x == x && part.y == y) {
                // Is end of snake?
                if (p != body.length - 1) {
                    return 0;
                }
            }
        }
    }
    for (const snake of data.board.snakes) {
        const body = snake.body;
        for (const [p, part] of body.entries()) {
            // Is near head?
            if (snake.id != data.you.id && p == 0) {
                const distance = gridDistance(x, y, part.x, part.y);
                if (distance < 4) {
                    return distance * 10;
                }
            }
        }
    }

    return 50;
}
