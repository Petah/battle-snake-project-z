import type { BTRequest, BTSnake } from '../types/BTData';
import { directions, fallbackMove, nextPosition } from './directions';
import { isFree, isHeadThreat } from './isFree';
import { MoveDirection } from '../types/MoveDirection';

// Vesper: a search-based strategy for standard boards.
//
// Ideas combined here:
//  * Time-aware flood fill. A body segment blocks a cell only until the turn
//    its owner's tail vacates it, so corridors that open up in time count as
//    space. This avoids both over-caution (refusing safe pockets) and the
//    classic "chase a tail that stacks after eating" trap, which is handled
//    by delaying the tail cell by one turn whenever a snake has just eaten.
//  * Voronoi territory with length-aware tie breaking, plus the opponent's
//    own territory and mobility as negative terms, so a longer Vesper
//    actively squeezes rivals instead of merely surviving next to them.
//  * Duels: iterative-deepening maximin over simultaneous moves with
//    alpha-beta pruning and previous-iteration move ordering, using a budget
//    proportional to the request timeout rather than a fixed 25 ms.
//  * Three or more snakes: the nearest rival answers adversarially, the
//    others follow a cheap greedy policy, so the search stays tractable while
//    still respecting the snake most likely to interfere.

interface Snake { id: string; body: number[]; health: number; ate: boolean }
export interface VesperBoard {
    width: number; height: number; snakes: Snake[]; food: Set<number>;
    hazards: Map<number, number>; hazardDamage: number;
}

const WIN = 1_000_000;
const LOSS = -1_000_000;

export function vesperBoard(data: BTRequest): VesperBoard {
    const encode = (point: { x: number; y: number }) => point.y * data.board.width + point.x;
    const hazards = new Map<number, number>();
    for (const point of data.board.hazards) hazards.set(encode(point), (hazards.get(encode(point)) ?? 0) + 1);
    const convert = (value: BTSnake): Snake => {
        const body = value.body.map(encode);
        // A duplicated tail means the snake grew this turn and the tail stays put.
        const ate = body.length >= 2 && body[body.length - 1] === body[body.length - 2];
        return { id: value.id, health: value.health, body, ate };
    };
    const others = data.board.snakes.filter(snake => snake.id !== data.you.id);
    return {
        width: data.board.width, height: data.board.height,
        snakes: [convert(data.you), ...others.map(convert)],
        food: new Set(data.board.food.map(encode)), hazards,
        hazardDamage: data.game.ruleset.settings?.hazardDamagePerTurn ?? 0,
    };
}

export function neighbor(board: VesperBoard, cell: number, direction: MoveDirection): number {
    const x = cell % board.width, y = (cell - x) / board.width;
    switch (direction) {
        case MoveDirection.UP: return y + 1 < board.height ? cell + board.width : -1;
        case MoveDirection.DOWN: return y > 0 ? cell - board.width : -1;
        case MoveDirection.LEFT: return x > 0 ? cell - 1 : -1;
        default: return x + 1 < board.width ? cell + 1 : -1;
    }
}

// Turn at which each cell becomes passable: 0 for empty cells, otherwise the
// number of moves until the owning tail has moved past it.
function clearance(board: VesperBoard): Int16Array {
    const clear = new Int16Array(board.width * board.height);
    for (const snake of board.snakes) {
        const length = snake.body.length;
        for (let index = 0; index < length; index++) {
            const turns = length - index + (snake.ate ? 1 : 0);
            if (turns > clear[snake.body[index]]) clear[snake.body[index]] = turns;
        }
    }
    return clear;
}

function legalMoves(board: VesperBoard, snake: Snake): MoveDirection[] {
    const clear = clearance(board);
    return directions.filter(direction => {
        const cell = neighbor(board, snake.body[0], direction);
        return cell >= 0 && clear[cell] <= 1;
    });
}

// Standard rules: move, feed, starve, then resolve collisions simultaneously.
export function vesperStep(board: VesperBoard, moves: MoveDirection[]): VesperBoard {
    const eaten = new Set<number>();
    const moved = board.snakes.map((snake, index) => {
        const head = neighbor(board, snake.body[0], moves[index]);
        const body = [head, ...snake.body.slice(0, -1)];
        const ate = head >= 0 && board.food.has(head);
        if (ate) { body.push(body[body.length - 1]); eaten.add(head); }
        const health = ate ? 100 : snake.health - 1 - (head >= 0 ? (board.hazards.get(head) ?? 0) * board.hazardDamage : 0);
        return { id: snake.id, body, health, ate };
    });
    const alive = moved.filter(snake => snake.body[0] >= 0 && snake.health > 0);
    const snakes = alive.filter(snake => !alive.some(other =>
        other.body.slice(1).includes(snake.body[0]) ||
        (other !== snake && other.body[0] === snake.body[0] && other.body.length >= snake.body.length)));
    return { ...board, snakes, food: new Set([...board.food].filter(cell => !eaten.has(cell))) };
}

interface Analysis { area: number; territory: number; foodDistance: number; tailReachable: boolean; enemyArea: number; enemyMobility: number }

// One pass computes everything the evaluation needs:
//  - time-aware reachable area for us (and for the strongest rival),
//  - Voronoi territory via simultaneous multi-source BFS from every head,
//  - distance to the nearest food we would reach before any rival.
function analyse(board: VesperBoard, you: Snake): Analysis {
    const size = board.width * board.height, clear = clearance(board);
    const enemies = board.snakes.filter(snake => snake !== you);
    const owner = new Int8Array(size).fill(-1), dist = new Int16Array(size).fill(-1);
    const queue: number[] = [];
    const heads = [you, ...enemies];
    for (let index = 0; index < heads.length; index++) {
        owner[heads[index].body[0]] = index; dist[heads[index].body[0]] = 0; queue.push(heads[index].body[0]);
    }
    const contested = new Uint8Array(size);
    let territory = 0, enemyArea = 0, foodDistance = Infinity;
    const yourTail = you.body[you.body.length - 1];
    let tailReachable = false, area = 0;
    for (let index = 0; index < queue.length; index++) {
        const cell = queue[index], from = owner[cell], step = dist[cell] + 1;
        if (from < 0) continue;
        for (const direction of directions) {
            const next = neighbor(board, cell, direction);
            if (next < 0) continue;
            if (clear[next] > step) continue;
            if (dist[next] < 0) {
                dist[next] = step; owner[next] = from; queue.push(next);
            } else if (dist[next] === step && owner[next] !== from && owner[next] >= 0) {
                // Simultaneous arrival: the longer snake keeps the cell; equal lengths contest it.
                const current = heads[owner[next]], challenger = heads[from];
                if (challenger.body.length > current.body.length) owner[next] = from;
                else if (challenger.body.length === current.body.length) contested[next] = 1;
            }
        }
    }
    // Our reachable area ignores rivals' claims: it is the region we could fill if left alone.
    const reach = new Int16Array(size).fill(-1); const stack = [you.body[0]]; reach[you.body[0]] = 0;
    for (let index = 0; index < stack.length; index++) {
        const cell = stack[index], step = reach[cell] + 1;
        for (const direction of directions) {
            const next = neighbor(board, cell, direction);
            if (next < 0 || reach[next] >= 0 || clear[next] > step) continue;
            reach[next] = step; stack.push(next); area++;
            if (next === yourTail) tailReachable = true;
        }
    }
    let enemyMobility = 0;
    for (let cell = 0; cell < size; cell++) {
        if (owner[cell] === 0 && !contested[cell]) {
            territory++;
            if (board.food.has(cell) && dist[cell] < foodDistance) foodDistance = dist[cell];
        } else if (owner[cell] > 0) enemyArea++;
    }
    for (const enemy of enemies) for (const direction of directions) {
        const next = neighbor(board, enemy.body[0], direction);
        if (next >= 0 && clear[next] <= 1) enemyMobility++;
    }
    return { area, territory, foodDistance, tailReachable, enemyArea, enemyMobility };
}

export function evaluate(board: VesperBoard, id: string, depth = 0): number {
    const you = board.snakes.find(snake => snake.id === id);
    if (!you) return board.snakes.length ? LOSS - depth : LOSS / 2;
    const enemies = board.snakes.filter(snake => snake !== you);
    const { area, territory, foodDistance, tailReachable, enemyArea, enemyMobility } = analyse(board, you);
    const length = you.body.length, longest = Math.max(0, ...enemies.map(enemy => enemy.body.length));
    const lead = length - longest;

    // Space: being short of room is catastrophic; surplus beyond ~2x length matters little.
    const needed = length + 1;
    const spaceDeficit = Math.max(0, needed - area);
    const spaceScore = -spaceDeficit * 400 + Math.min(area, length * 2 + 6) * 4 + (tailReachable ? 30 : 0);

    // Territory: our Voronoi share minus theirs, scaled so it matters once space is safe.
    const territoryScore = territory * 1.5 - enemyArea * 0.9;

    // Food: urgency rises as health falls or when we are not comfortably longest.
    let hunger = 20;
    if (you.health < 30) hunger = 220;
    else if (you.health < 55) hunger = 110;
    else if (lead < 2) hunger = 90;
    else if (lead < 4) hunger = 45;
    const foodScore = Number.isFinite(foodDistance) ? hunger / (foodDistance + 1) : 0;
    const starving = Number.isFinite(foodDistance) && foodDistance >= you.health ? (you.health < 20 ? 500 : 120) : 0;

    // Length lead is the lever that wins head-to-heads and Voronoi ties.
    const lengthScore = Math.max(-6, Math.min(6, lead)) * 30 + length * 3;

    // Rivals with few moves are about to be cut off. Press when we are at least as long.
    const pressure = enemies.length && lead >= 0 ? (12 - Math.min(12, enemyMobility)) * 6 : 0;

    // Mild centre preference in early/mid game to avoid wall hugging.
    const x = you.body[0] % board.width, y = (you.body[0] - x) / board.width;
    const edge = Math.min(x, y, board.width - 1 - x, board.height - 1 - y);
    const centreScore = Math.min(edge, 2) * 6;

    const hazardPenalty = (board.hazards.get(you.body[0]) ?? 0) * board.hazardDamage * 2;

    return spaceScore + territoryScore + foodScore - starving + lengthScore + pressure + centreScore - hazardPenalty + you.health * 0.3;
}

export interface VesperResult { move: MoveDirection; depth: number; nodes: number; value: number }

export function vesperMove(data: BTRequest): VesperResult {
    const started = performance.now();
    const timeout = data.game.timeout || 500;
    // Leave headroom for network latency and engine processing. All local snakes
    // share one Node process, so a modest budget also keeps opponents responsive.
    const override = Number(process.env.VESPER_BUDGET_MS);
    const budget = override > 0 ? override : Math.max(10, Math.min(140, timeout * 0.3 - 30));
    const deadline = started + budget;
    const board = vesperBoard(data), id = data.you.id;

    const legal = directions.filter(direction => { const p = nextPosition(data.you.head, direction); return isFree(data, p.x, p.y); });
    if (!legal.length) return { move: fallbackMove(data), depth: 0, nodes: 0, value: LOSS };

    const you = board.snakes[0];
    const enemies = board.snakes.slice(1);
    // Rival ordering: closest head first. Only the nearest rival is searched adversarially.
    const distance = (a: number, b: number) => Math.abs(a % board.width - b % board.width) + Math.abs(Math.floor(a / board.width) - Math.floor(b / board.width));
    const rival = enemies.length ? enemies.reduce((best, enemy) => distance(enemy.body[0], you.body[0]) < distance(best.body[0], you.body[0]) ? enemy : best) : undefined;
    const bystanders = enemies.filter(enemy => enemy !== rival);

    let nodes = 0;
    const expired = Symbol('deadline');

    // Greedy policy for snakes we do not search: the legal move with the best
    // one-ply evaluation from their perspective, with heads treated as blocked.
    const greedy = (state: VesperBoard, snake: Snake): MoveDirection => {
        const moves = legalMoves(state, snake);
        if (!moves.length) return MoveDirection.UP;
        if (moves.length === 1) return moves[0];
        let best = moves[0], bestValue = -Infinity;
        for (const move of moves) {
            const next = vesperStep(state, state.snakes.map(other => other === snake ? move : anyLegal(state, other)));
            const value = evaluate(next, snake.id, 1);
            if (value > bestValue) { bestValue = value; best = move; }
        }
        return best;
    };
    // Placeholder move for snakes whose choice is irrelevant to a one-ply greedy estimate.
    const anyLegal = (state: VesperBoard, snake: Snake): MoveDirection => legalMoves(state, snake)[0] ?? MoveDirection.UP;

    const order = (state: VesperBoard, snake: Snake, preferred?: MoveDirection): MoveDirection[] => {
        const moves = legalMoves(state, snake);
        if (preferred && moves.includes(preferred)) return [preferred, ...moves.filter(move => move !== preferred)];
        return moves;
    };

    const search = (state: VesperBoard, depth: number, alpha: number, beta: number): number => {
        if (performance.now() >= deadline) throw expired;
        nodes++;
        const me = state.snakes.find(snake => snake.id === id);
        if (!me) return LOSS - depth;
        if (state.snakes.length === 1 && enemies.length) return WIN + depth;
        if (depth === 0) return evaluate(state, id, depth);
        const myMoves = order(state, me);
        if (!myMoves.length) return LOSS - depth + 1;
        const foe = rival ? state.snakes.find(snake => snake.id === rival.id) : undefined;
        let best = -Infinity;
        for (const move of myMoves) {
            const value = foe ? reply(state, me, foe, move, depth, alpha, beta) : advance(state, me, undefined, move, undefined, depth, alpha, beta);
            if (value > best) best = value;
            if (best > alpha) alpha = best;
            if (alpha >= beta) break;
        }
        return best;
    };

    const reply = (state: VesperBoard, me: Snake, foe: Snake, move: MoveDirection, depth: number, alpha: number, beta: number): number => {
        const responses = order(state, foe);
        let worst = Infinity;
        // A trapped rival still moves; include every direction so simultaneous deaths resolve correctly.
        for (const response of responses.length ? responses : directions) {
            const value = advance(state, me, foe, move, response, depth, alpha, beta);
            if (value < worst) worst = value;
            if (worst < beta) beta = worst;
            if (alpha >= beta) break;
        }
        return worst;
    };

    const advance = (state: VesperBoard, me: Snake, foe: Snake | undefined, move: MoveDirection, response: MoveDirection | undefined, depth: number, alpha: number, beta: number): number => {
        const moves = state.snakes.map(snake => snake === me ? move : snake === foe ? response as MoveDirection : greedy(state, snake));
        return search(vesperStep(state, moves), depth - 1, alpha, beta);
    };

    // Root: evaluate each legal move against the rival's best reply, deepening while time remains.
    const safe = legal.filter(direction => { const p = nextPosition(data.you.head, direction); return !isHeadThreat(data, p.x, p.y); });
    let ordered = [...legal].sort((a, b) => Number(safe.includes(b)) - Number(safe.includes(a)));
    let best = ordered[0], bestValue = -Infinity, completedDepth = 0;
    const maxDepth = enemies.length === 0 ? 10 : bystanders.length ? 4 : 8;
    for (let depth = 1; depth <= maxDepth; depth++) {
        const scores: { move: MoveDirection; value: number }[] = [];
        try {
            let alpha = -Infinity;
            for (const move of ordered) {
                const foe = rival ? board.snakes.find(snake => snake.id === rival.id) : undefined;
                const value = foe ? reply(board, you, foe, move, depth, alpha, Infinity) : advance(board, you, undefined, move, undefined, depth, alpha, Infinity);
                scores.push({ move, value });
                if (value > alpha) alpha = value;
            }
        } catch (error) {
            if (error !== expired) throw error;
            break;
        }
        scores.sort((a, b) => b.value - a.value);
        ordered = scores.map(score => score.move);
        best = scores[0].move; bestValue = scores[0].value; completedDepth = depth;
        // A forced win or an unavoidable loss will not change with more depth.
        if (bestValue >= WIN || bestValue <= LOSS) break;
    }
    return { move: best, depth: completedDepth, nodes, value: bestValue };
}
