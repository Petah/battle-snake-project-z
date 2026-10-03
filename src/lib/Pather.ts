import { directionTo } from './directions';
import { weight, BLOCKED_THRESHOLD, WeightOptions } from './weight';
import { StrategyRequest, BTSnake } from '../types/BTData';
import { MoveDirection } from '../types/MoveDirection';

const PF = require('pathfinding');

const pf = new PF.AStarFinder({
    allowDiagonal: false,
    useCost: true,
});

const BLOCKED = 1;
const FREE = 0;

export interface Path {
    path: Array<[number, number]>,
    distance: number,
    direction: MoveDirection,
}

export function pathTo(request: StrategyRequest, snake: BTSnake, x: number, y: number, weightOptions: WeightOptions = { blockHeads: true, attackHeads: true }): Path | null {
    const matrix = [];
    const costs = [];
    for (let y = 0; y < request.body.board.height; y++) {
        matrix[y] = [];
        costs[y] = [];
        for (let x = 0; x < request.body.board.width; x++) {
            const w = weight(request, x, y, weightOptions);
            matrix[y][x] = w > BLOCKED_THRESHOLD ? FREE : BLOCKED;
            costs[y][x] = 100 - w;
        }
    }
    const grid = new PF.Grid(request.body.board.width, request.body.board.height, matrix, costs);
    const path: Array<[number, number]> = pf.findPath(snake.body[0].x, snake.body[0].y, x, y, grid);
    if (!path || !path.length) {
        return null;
    }
    const direction = pathToDirection(path, snake);
    if (!direction) {
        return null;
    }
    return {
        path,
        direction,
        distance: path.length,
    }
}

export function pathToDirection(path: Array<[number, number]>, snake: BTSnake): MoveDirection | undefined {
    return path.length > 1 ? directionTo(snake.head, { x: path[1][0], y: path[1][1] }) : undefined;
}

export class Pather {
    constructor(private data: StrategyRequest) {}
    pathDirection(x: number, y: number) { return pathTo(this.data, this.data.you, x, y)?.direction; }
    pathToDirection(path: Array<[number, number]>) { return pathToDirection(path, this.data.you); }
}
