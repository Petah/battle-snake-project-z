import { weight, BLOCKED_THRESHOLD } from './weight';
import { BTData } from '../types/BTData';
import { directionTo } from './directions';

const PF = require('pathfinding');

const pf = new PF.AStarFinder({
    allowDiagonal: false,
    useCost: true,
});

const BLOCKED = 1;
const FREE = 0;

export class Pather {
    private pfGrid;

    constructor(
        private data: BTData,
        private blockHeads = true,
    ) {
        const matrix = [];
        const costs = [];
        for (let y = 0; y < data.board.height; y++) {
            matrix[y] = [];
            costs[y] = [];
            for (let x = 0; x < data.board.width; x++) {
                const w = weight(data, x, y, blockHeads);
                matrix[y][x] = w > BLOCKED_THRESHOLD ? FREE : BLOCKED;
                costs[y][x] = 100 - w;
            }
        }
        this.pfGrid = new PF.Grid(data.board.width, data.board.height, matrix, costs);
    }

    pathTo(x: number, y: number) {
        return pf.findPath(this.data.you.body[0].x, this.data.you.body[0].y, x, y, this.pfGrid.clone());
    }

    pathToDirection(path: number[][]) {
        if (path.length < 2) return;
        return directionTo(this.data.you.head, { x: path[1][0], y: path[1][1] });
    }

    pathDirection(x: number, y: number) {
        const path = this.pathTo(x, y);
        return this.pathToDirection(path);
    }
}
