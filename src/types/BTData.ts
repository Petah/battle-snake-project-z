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

export interface BTData extends BTRequest {
    cache: Record<string, any>;
    log?: string[];
}
