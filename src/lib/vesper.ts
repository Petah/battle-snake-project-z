import type { BTRequest, BTSnake } from '../types/BTData';
import { directions, fallbackMove, nextPosition } from './directions';
import { isFree, isHeadThreat } from './isFree';
import { MoveDirection } from '../types/MoveDirection';

// Vesper: a search-based strategy for standard boards.
//
// Ideas combined here:
//  * Time-aware flood fill. A body segment blocks a cell only until the turn
//    its owner's tail vacates it, so corridors that open up in time count as
//    space. Duplicated tail segments already encode growth, so a tail that
//    stays put after eating is blocked one extra turn automatically.
//  * Two-sided space accounting. Both our reachable region and the rival's are
//    measured; a rival short of room is scored as nearly dead, so search finds
//    cut-offs that pay off beyond its horizon. Voronoi territory with
//    length-aware tie breaking and rival mobility add steady pressure.
//  * Duels: iterative-deepening maximin over simultaneous moves with alpha-beta
//    pruning, a per-request transposition table, and heuristic move ordering
//    for both snakes, with a budget proportional to the request timeout.
//  * Three or more snakes: the nearest rival answers adversarially, the others
//    follow a cheap greedy policy, so the search stays tractable while still
//    respecting the snake most likely to interfere.

interface Snake { id: string; body: number[]; health: number }
export interface VesperBoard {
    width: number; height: number; snakes: Snake[]; food: Set<number>;
    hazards: Map<number, number>; hazardDamage: number; neighbors: number[][];
}

const WIN = 1_000_000;
const LOSS = -1_000_000;
const directionIndex: Record<MoveDirection, number> = { up: 0, down: 1, left: 2, right: 3 };

export function vesperBoard(data: BTRequest): VesperBoard {
    const { width, height } = data.board;
    const encode = (point: { x: number; y: number }) => point.y * width + point.x;
    const hazards = new Map<number, number>();
    for (const point of data.board.hazards) hazards.set(encode(point), (hazards.get(encode(point)) ?? 0) + 1);
    const convert = (value: BTSnake): Snake => ({ id: value.id, health: value.health, body: value.body.map(encode) });
    const others = data.board.snakes.filter(snake => snake.id !== data.you.id);
    const neighbors = Array.from({ length: width * height }, (_, cell) => {
        const x = cell % width, y = (cell - x) / width;
        return [y + 1 < height ? cell + width : -1, y > 0 ? cell - width : -1, x > 0 ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1];
    });
    return {
        width, height, snakes: [convert(data.you), ...others.map(convert)],
        food: new Set(data.board.food.map(encode)), hazards, neighbors,
        hazardDamage: data.game.ruleset.settings?.hazardDamagePerTurn ?? 0,
    };
}

export function neighbor(board: VesperBoard, cell: number, direction: MoveDirection): number {
    return board.neighbors[cell]?.[directionIndex[direction]] ?? -1;
}

// Turn at which each cell becomes passable: 0 for empty cells, otherwise the
// number of moves until the owning tail has moved past it.
export function clearance(board: VesperBoard): Int16Array {
    const clear = new Int16Array(board.width * board.height);
    for (const snake of board.snakes) {
        const length = snake.body.length;
        for (let index = 0; index < length; index++) {
            const cell = snake.body[index], turns = length - index;
            if (turns > clear[cell]) clear[cell] = turns;
        }
    }
    return clear;
}

function legalMoves(board: VesperBoard, snake: Snake, clear = clearance(board)): MoveDirection[] {
    const cells = board.neighbors[snake.body[0]];
    return directions.filter(direction => { const cell = cells[directionIndex[direction]]; return cell >= 0 && clear[cell] <= 1; });
}

// Standard rules: move, feed, starve, then resolve collisions simultaneously.
export function vesperStep(board: VesperBoard, moves: MoveDirection[]): VesperBoard {
    let eaten: Set<number> | undefined;
    const moved = board.snakes.map((snake, index) => {
        const head = neighbor(board, snake.body[0], moves[index]);
        const body = [head, ...snake.body.slice(0, -1)];
        const ate = head >= 0 && board.food.has(head);
        if (ate) { body.push(body[body.length - 1]); (eaten ??= new Set()).add(head); }
        const health = ate ? 100 : snake.health - 1 - (head >= 0 ? (board.hazards.get(head) ?? 0) * board.hazardDamage : 0);
        return { id: snake.id, body, health };
    });
    const alive = moved.filter(snake => snake.body[0] >= 0 && snake.health > 0);
    const snakes = alive.filter(snake => !alive.some(other =>
        other.body.indexOf(snake.body[0], 1) >= 0 ||
        (other !== snake && other.body[0] === snake.body[0] && other.body.length >= snake.body.length)));
    const removed = eaten;
    const food = removed ? new Set([...board.food].filter(cell => !removed.has(cell))) : board.food;
    return { ...board, snakes, food };
}

// Time-aware BFS distances from a snake's head. Cells are entered once their
// occupant has had time to vacate them.
export function distances(board: VesperBoard, snake: Snake, clear: Int16Array): Int16Array {
    const size = board.width * board.height;
    const distance = new Int16Array(size).fill(-1), queue = new Int16Array(size);
    let count = 1; queue[0] = snake.body[0]; distance[snake.body[0]] = 0;
    for (let index = 0; index < count; index++) {
        const cell = queue[index], arrival = distance[cell] + 1;
        for (const next of board.neighbors[cell]) {
            if (next < 0 || distance[next] >= 0 || clear[next] > arrival) continue;
            distance[next] = arrival; queue[count++] = next;
        }
    }
    return distance;
}

export function evaluate(board: VesperBoard, id: string, depth = 0): number {
    const you = board.snakes.find(snake => snake.id === id);
    if (!you) return board.snakes.length ? LOSS - depth : LOSS / 2;
    const enemies = board.snakes.filter(snake => snake !== you);
    const clear = clearance(board);
    const own = distances(board, you, clear);
    const rivals = enemies.map(enemy => distances(board, enemy, clear));
    const length = you.body.length;

    let area = 0, territory = 0, enemyTerritory = 0, foodDistance = Infinity;
    const enemyArea = new Int32Array(enemies.length);
    for (let cell = 0; cell < own.length; cell++) {
        let theirDistance = Infinity, theirLength = 0;
        for (let index = 0; index < enemies.length; index++) {
            const d = rivals[index][cell];
            if (d < 0) continue;
            enemyArea[index]++;
            if (d < theirDistance || (d === theirDistance && enemies[index].body.length > theirLength)) { theirDistance = d; theirLength = enemies[index].body.length; }
        }
        if (own[cell] < 0) { if (theirDistance < Infinity) enemyTerritory++; continue; }
        area++;
        const controlled = own[cell] < theirDistance || (own[cell] === theirDistance && length > theirLength);
        if (controlled) {
            territory++;
            if (board.food.has(cell) && own[cell] < foodDistance) foodDistance = own[cell];
        } else if (theirDistance < own[cell] || theirLength > length) enemyTerritory++;
    }

    const longest = Math.max(0, ...enemies.map(enemy => enemy.body.length));
    const lead = length - longest;

    // Space: being short of room is catastrophic; surplus beyond ~2x length matters little.
    const deficit = Math.max(0, length + 1 - area);
    const tail = own[you.body[you.body.length - 1]] >= 0 ? 30 : 0;
    const spaceScore = -deficit * 450 + Math.min(area, length * 2 + 6) * 4 + tail;

    // A rival that cannot fit its own body into its reachable region is close to dead.
    let trapScore = 0;
    for (let index = 0; index < enemies.length; index++) {
        const shortfall = Math.max(0, enemies[index].body.length + 1 - enemyArea[index]);
        trapScore += Math.min(shortfall, 12) * 90;
    }

    // Territory: our Voronoi share minus theirs.
    const territoryScore = territory * 1.5 - enemyTerritory * 1.0;

    // Food: urgency rises as health falls or when we are not comfortably longest.
    let hunger = 35;
    if (you.health < 30) hunger = 260;
    else if (you.health < 55) hunger = 150;
    else if (lead < 2) hunger = 150;
    else if (lead < 4) hunger = 70;
    const foodScore = Number.isFinite(foodDistance) ? hunger / (foodDistance + 1) : 0;
    const starving = Number.isFinite(foodDistance)
        ? (foodDistance >= you.health ? (you.health < 20 ? 600 : 150) : 0)
        : (you.health < 15 ? 600 : 0);

    // Length lead is the lever that wins head-to-heads and Voronoi ties.
    const lengthScore = Math.max(-8, Math.min(8, lead)) * 45 + length * 3;

    // Mobility: our options are worth keeping, and theirs are worth taking when we can press.
    const mobility = legalMoves(board, you, clear).length;
    let rivalMobility = 0;
    for (const enemy of enemies) rivalMobility += legalMoves(board, enemy, clear).length;
    const mobilityScore = mobility * 10 - rivalMobility * (lead >= 0 ? 12 : 4);

    // Mild centre preference to avoid wall hugging.
    const x = you.body[0] % board.width, y = (you.body[0] - x) / board.width;
    const centreScore = Math.min(x, y, board.width - 1 - x, board.height - 1 - y, 2) * 6;

    const hazardPenalty = (board.hazards.get(you.body[0]) ?? 0) * board.hazardDamage * 2;

    return spaceScore + trapScore + territoryScore + foodScore - starving + lengthScore + mobilityScore + centreScore - hazardPenalty + you.health * 0.3;
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
    if (legal.length === 1) return { move: legal[0], depth: 0, nodes: 0, value: 0 };

    const you = board.snakes[0];
    const enemies = board.snakes.slice(1);
    const manhattan = (a: number, b: number) => Math.abs(a % board.width - b % board.width) + Math.abs(Math.floor(a / board.width) - Math.floor(b / board.width));
    // Only the nearest rival is searched adversarially; the rest follow a greedy policy.
    const rival = enemies.length ? enemies.reduce((best, enemy) => manhattan(enemy.body[0], you.body[0]) < manhattan(best.body[0], you.body[0]) ? enemy : best) : undefined;
    const bystanders = enemies.filter(enemy => enemy !== rival);

    let nodes = 0;
    const expired = Symbol('deadline');

    // Cheap heuristic ordering shared by both sides: transposition move first,
    // then food, then the number of exits from the destination.
    const order = (state: VesperBoard, snake: Snake, clear: Int16Array, preferred?: MoveDirection): MoveDirection[] => {
        const moves = legalMoves(state, snake, clear);
        if (moves.length < 2) return moves;
        const value = (move: MoveDirection) => {
            if (move === preferred) return 10000;
            const cell = state.neighbors[snake.body[0]][directionIndex[move]];
            let food = Infinity;
            for (const target of state.food) { const d = manhattan(cell, target); if (d < food) food = d; }
            let exits = 0;
            for (const next of state.neighbors[cell]) if (next >= 0 && clear[next] <= 2) exits++;
            return (state.food.has(cell) ? 100 : 0) + 20 / (food + 1) + exits * 3;
        };
        return moves.map(move => ({ move, value: value(move) })).sort((a, b) => b.value - a.value).map(item => item.move);
    };

    // Greedy policy for snakes we do not search: most exits, food if adjacent.
    const greedy = (state: VesperBoard, snake: Snake, clear: Int16Array): MoveDirection => order(state, snake, clear)[0] ?? MoveDirection.UP;

    interface Entry { depth: number; value: number; bound: 'exact' | 'upper' | 'lower'; move?: MoveDirection }
    const table = new Map<string, Entry>();
    const key = (state: VesperBoard) => state.snakes.map(s => `${s.health}:${s.body.join(',')}`).join('|') + '/' + [...state.food].join(',');

    const search = (state: VesperBoard, depth: number, alpha: number, beta: number): number => {
        if (performance.now() >= deadline) throw expired;
        nodes++;
        const me = state.snakes.find(snake => snake.id === id);
        if (!me) return LOSS - depth;
        if (state.snakes.length === 1 && enemies.length) return WIN + depth;
        const position = key(state), cached = table.get(position), originalAlpha = alpha, originalBeta = beta;
        if (cached && cached.depth >= depth) {
            if (cached.bound === 'exact') return cached.value;
            if (cached.bound === 'lower') alpha = Math.max(alpha, cached.value);
            else beta = Math.min(beta, cached.value);
            if (alpha >= beta) return cached.value;
        }
        if (depth === 0) {
            const value = evaluate(state, id, depth);
            if (table.size < 30000) table.set(position, { depth, value, bound: 'exact' });
            return value;
        }
        const clear = clearance(state);
        const myMoves = order(state, me, clear, cached?.move);
        if (!myMoves.length) return LOSS - depth + 1;
        const foe = rival ? state.snakes.find(snake => snake.id === rival.id) : undefined;
        let best = -Infinity, bestMove = myMoves[0];
        for (const move of myMoves) {
            const value = foe ? reply(state, me, foe, move, depth, alpha, beta, clear) : advance(state, me, undefined, move, undefined, depth, alpha, beta, clear);
            if (value > best) { best = value; bestMove = move; }
            if (best > alpha) alpha = best;
            if (alpha >= beta) break;
        }
        if (table.size < 30000) table.set(position, { depth, value: best, move: bestMove,
            bound: best <= originalAlpha ? 'upper' : best >= originalBeta ? 'lower' : 'exact' });
        return best;
    };

    const reply = (state: VesperBoard, me: Snake, foe: Snake, move: MoveDirection, depth: number, alpha: number, beta: number, clear: Int16Array): number => {
        const responses = order(state, foe, clear);
        let worst = Infinity;
        // A trapped rival still moves; include every direction so simultaneous deaths resolve correctly.
        for (const response of responses.length ? responses : directions) {
            const value = advance(state, me, foe, move, response, depth, alpha, beta, clear);
            if (value < worst) worst = value;
            if (worst < beta) beta = worst;
            if (alpha >= beta) break;
        }
        return worst;
    };

    const advance = (state: VesperBoard, me: Snake, foe: Snake | undefined, move: MoveDirection, response: MoveDirection | undefined, depth: number, alpha: number, beta: number, clear: Int16Array): number => {
        const moves = state.snakes.map(snake => snake === me ? move : snake === foe ? response as MoveDirection : greedy(state, snake, clear));
        return search(vesperStep(state, moves), depth - 1, alpha, beta);
    };

    // Root: evaluate each legal move against the rival's best reply, deepening while time remains.
    const safe = legal.filter(direction => { const p = nextPosition(data.you.head, direction); return !isHeadThreat(data, p.x, p.y); });
    let ordered = [...legal].sort((a, b) => Number(safe.includes(b)) - Number(safe.includes(a)));
    let best = ordered[0], bestValue = -Infinity, completedDepth = 0;
    const rootClear = clearance(board);
    const maxDepth = enemies.length === 0 ? 12 : bystanders.length ? 6 : 16;
    for (let depth = 1; depth <= maxDepth; depth++) {
        const scores: { move: MoveDirection; value: number }[] = [];
        try {
            let alpha = -Infinity;
            for (const move of ordered) {
                const foe = rival ? board.snakes.find(snake => snake.id === rival.id) : undefined;
                const value = foe ? reply(board, you, foe, move, depth, alpha, Infinity, rootClear) : advance(board, you, undefined, move, undefined, depth, alpha, Infinity, rootClear);
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
