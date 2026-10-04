import { directionTo } from './directions';
import { weight, BLOCKED_THRESHOLD, WeightOptions } from './weight';
import { StrategyRequest, BTSnake } from '../types/BTData';
import { isOutOfBounds, isFree } from './isFree';
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
    if (isOutOfBounds(request.body, x, y) || isOutOfBounds(request.body, snake.head.x, snake.head.y)) {
        return null;
    }
    const settings = { borders: true, snakeBodies: true, deadEnds: true, avoidFood: false, ...weightOptions };
    const key = JSON.stringify(settings);
    const grids = request.cache.pathfindingGrids ??= {};
    if (!grids[key]) {
        const matrix = [];
        const costs = [];
        for (let row = 0; row < request.body.board.height; row++) {
            matrix[row] = [];
            costs[row] = [];
            for (let column = 0; column < request.body.board.width; column++) {
                const w = weight(request, column, row, settings);
                matrix[row][column] = w > BLOCKED_THRESHOLD ? FREE : BLOCKED;
                costs[row][column] = 100 - w;
            }
        }
        grids[key] = new PF.Grid(request.body.board.width, request.body.board.height, matrix, costs);
    }
    // Searches mutate nodes; the pinned fork's clone also preserves weighted costs.
    const grid = grids[key].clone();
    const path: Array<[number, number]> = pf.findPath(snake.body[0].x, snake.body[0].y, x, y, grid);
    if (!path || !path.length) {
        return null;
    }
    const direction = pathToDirection(path, snake);
    if (!direction || !isFree(request.body, path[1][0], path[1][1], false, snake)) {
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
    pathDirection(x: number, y: number) {
        return pathTo(this.data, this.data.you, x, y)?.direction;
    }
    pathToDirection(path: Array<[number, number]>) {
        return pathToDirection(path, this.data.you);
    }
}
