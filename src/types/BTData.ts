export interface BTXY {
    x: number;
    y: number;
}

export interface SnakeAppearance {
    color: string;
    head: string;
    tail: string;
}

export interface BTSnake {
    id: string;
    name: string;
    health: number;
    body: BTXY[];
    head: BTXY;
    length: number;
    latency?: string;
    shout?: string;
    squad?: string;
    customizations?: SnakeAppearance;
}

export interface BTRulesetSettings {
    foodSpawnChance?: number;
    minimumFood?: number;
    hazardDamagePerTurn?: number;
    royale?: { shrinkEveryNTurns: number };
    squad?: {
        allowBodyCollisions: boolean;
        sharedElimination: boolean;
        sharedHealth: boolean;
        sharedLength: boolean;
    };
}

export interface BTGame {
    id: string;
    ruleset: { name: string; version: string; settings?: BTRulesetSettings };
    timeout: number;
    map?: string;
    source?: string;
}

// The API request contains no application caches or debug logs.
export interface BTRequest {
    game: BTGame;
    turn: number;
    board: {
        width: number;
        height: number;
        food: BTXY[];
        hazards: BTXY[];
        snakes: BTSnake[];
    };
    you: BTSnake;
}

export type BTBoard = BTRequest['board'];

// Strategy state stays separate from the incoming API object. Storage lasts for
// one game/snake pair; caches, grid annotations, and logs last for one request.
export class StrategyRequest {
    public cache: Record<string, any> = {};
    public grid: Record<string, any>[][];
    public readonly logs: any[][] = [];

    constructor(public body: BTRequest, public storage: Record<string, any> = {}) {
        this.grid = Array.from({ length: body.board.height }, () =>
            Array.from({ length: body.board.width }, () => ({})));
    }

    get game() { return this.body.game; }
    get turn() { return this.body.turn; }
    get board() { return this.body.board; }
    get you() { return this.body.you; }

    log(...args: any[]) { this.logs.push(args); }
}

export interface BTData extends BTRequest {
    cache: Record<string, any>;
    log?: string[];
}
