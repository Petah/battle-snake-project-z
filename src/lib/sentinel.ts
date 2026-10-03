import type { BTRequest, BTSnake } from '../types/BTData';
import { directions, fallbackMove, nextPosition } from './directions';
import { isFree, isHeadThreat } from './isFree';
import { MoveDirection } from '../types/MoveDirection';

interface SearchSnake { id: string; body: number[]; health: number }
export interface SentinelBoard {
    width: number; height: number; snakes: SearchSnake[]; food: Set<number>;
    hazards: Map<number, number>; hazardDamage: number; neighbors: number[][];
}
const DEAD = -100000;
export function sentinelBoard(data: BTRequest): SentinelBoard {
    const encode = (point: { x: number; y: number }) => point.y * data.board.width + point.x;
    const hazards = new Map<number, number>();
    for (const point of data.board.hazards) hazards.set(encode(point), (hazards.get(encode(point)) ?? 0) + 1);
    const snake = (value: BTSnake): SearchSnake => ({ id: value.id, health: value.health, body: value.body.map(encode) });
    return { width: data.board.width, height: data.board.height, snakes: [snake(data.you), ...data.board.snakes.filter(s => s.id !== data.you.id).map(snake)],
        food: new Set(data.board.food.map(encode)), hazards,
        neighbors: Array.from({ length: data.board.width * data.board.height }, (_, cell) => {
            const x = cell % data.board.width, y = Math.floor(cell / data.board.width);
            return [y + 1 < data.board.height ? cell + data.board.width : -1, y > 0 ? cell - data.board.width : -1,
                x > 0 ? cell - 1 : -1, x + 1 < data.board.width ? cell + 1 : -1];
        }), hazardDamage: data.game.ruleset.settings?.hazardDamagePerTurn ?? 0 };
}
const directionIndex = { up: 0, down: 1, left: 2, right: 3 };
function next(board: SentinelBoard, head: number, direction: MoveDirection): number {
    return board.neighbors[head]?.[directionIndex[direction]] ?? -1;
}

// Duplicated segments already encode growth. Taking the maximum release time
// handles stacked tails without adding a second, fictitious growth delay.
export function sentinelClearance(board: SentinelBoard): Int16Array {
    const clear = new Int16Array(board.width * board.height);
    for (const snake of board.snakes) for (let index = 0; index < snake.body.length; index++) {
        const cell = snake.body[index]; clear[cell] = Math.max(clear[cell], snake.body.length - index);
    }
    return clear;
}
function choices(board: SentinelBoard, snake: SearchSnake, clear = sentinelClearance(board)): MoveDirection[] {
    return directions.filter(direction => { const cell = next(board, snake.body[0], direction); return cell >= 0 && clear[cell] <= 1; });
}

// Standard simultaneous movement, food/growth and collision resolution. No
// speculative food spawning: search is short and actual food is known next turn.
export function sentinelStep(board: SentinelBoard, moves: MoveDirection[]): SentinelBoard {
    const eaten = new Set<number>();
    const moved = board.snakes.map((snake, index) => {
        const head = next(board, snake.body[0], moves[index]);
        const body = [head, ...snake.body.slice(0, -1)];
        const food = board.food.has(head);
        if (food) { body.push(body[body.length - 1]); eaten.add(head); }
        return { id: snake.id, body, health: food ? 100 : snake.health - 1 - (board.hazards.get(head) ?? 0) * board.hazardDamage };
    });
    const alive = moved.filter(snake => snake.body[0] >= 0 && snake.health > 0);
    const snakes = alive.filter(snake => !alive.some(other =>
        other.body.indexOf(snake.body[0], 1) >= 0 ||
        (other !== snake && other.body[0] === snake.body[0] && other.body.length >= snake.body.length)));
    return { ...board, snakes, food: eaten.size ? new Set([...board.food].filter(cell => !eaten.has(cell))) : board.food };
}

// An optimistic mobility estimate: current bodies vacate on schedule, but
// future growth and new head paths are resolved by search, not predicted here.
export function sentinelDistances(board: SentinelBoard, snake: SearchSnake, clear = sentinelClearance(board)): Int16Array {
    const distance = new Int16Array(board.width * board.height).fill(-1);
    const queue = new Int16Array(distance.length); let count = 1;
    queue[0] = snake.body[0]; distance[snake.body[0]] = 0;
    for (let index = 0; index < count; index++) {
        const cell = queue[index], arrival = distance[cell] + 1;
        for (const neighbor of board.neighbors[cell]) {
            if (neighbor < 0 || distance[neighbor] >= 0 || clear[neighbor] > arrival) continue;
            distance[neighbor] = arrival; queue[count++] = neighbor;
        }
    }
    return distance;
}

function score(board: SentinelBoard, id: string): number {
    const you = board.snakes.find(s => s.id === id);
    if (!you) return board.snakes.length ? DEAD : DEAD / 2;
    const enemies = board.snakes.filter(s => s !== you), clear = sentinelClearance(board);
    const own = sentinelDistances(board, you, clear);
    const rival = enemies.map(enemy => sentinelDistances(board, enemy, clear));
    let area = 0, territory = 0, enemyTerritory = 0, foodDistance = Infinity;
    for (let cell = 0; cell < own.length; cell++) {
        let theirDistance = Infinity, theirLength = 0;
        for (let index = 0; index < enemies.length; index++) {
            const d = rival[index][cell];
            if (d >= 0 && (d < theirDistance || (d === theirDistance && enemies[index].body.length > theirLength))) {
                theirDistance = d; theirLength = enemies[index].body.length;
            }
        }
        if (own[cell] < 0) { if (theirDistance < Infinity) enemyTerritory++; continue; }
        area++;
        const controlled = own[cell] < theirDistance || (own[cell] === theirDistance && you.body.length > theirLength);
        if (controlled) territory++;
        else if (theirDistance < own[cell] || theirLength > you.body.length) enemyTerritory++;
        // Food an opponent can claim first is not a reliable health plan.
        // Tactical opportunities to steal it are still explored by search.
        if (controlled && board.food.has(cell)) foodDistance = Math.min(foodDistance, own[cell]);
    }
    const length = you.body.length, largest = Math.max(0, ...enemies.map(enemy => enemy.body.length)), lead = length - largest;
    const deficit = Math.max(0, length + 2 - area);
    const hunger = you.health < 30 ? 250 : you.health < 55 ? 160 : lead < 2 ? 140 : 50;
    const foodValue = Number.isFinite(foodDistance) ? hunger / (foodDistance + 1) : 0;
    const starving = foodDistance >= you.health && you.health < 25 ? (25 - you.health) * 35 : 0;
    const mobility = choices(board, you, clear).length;
    const rivalMobility = enemies.reduce((sum, snake) => sum + choices(board, snake, clear).length, 0);
    const tail = own[you.body.at(-1)] >= 0 ? 25 : 0;
    const x = you.body[0] % board.width, y = Math.floor(you.body[0] / board.width);
    const center = Math.min(2, x, y, board.width - 1 - x, board.height - 1 - y) * 6;
    return -deficit * 400 + Math.min(area, length * 2 + 8) * 3 + territory * 1.5 - enemyTerritory * 0.9 +
        Math.min(8, lead) * 45 + length * 3 + foodValue + you.health * 0.35 - starving + tail +
        mobility * 10 - (lead >= 0 ? rivalMobility * 12 : 0) + center;
}

export function sentinelMove(data: BTRequest): { move: MoveDirection; depth: number; nodes: number } {
    const deadline = performance.now() + Math.max(1, Math.min(75, data.game.timeout * 0.2 - 15));
    const board = sentinelBoard(data), id = data.you.id;
    const legal = directions.filter(direction => { const p = nextPosition(data.you.head, direction); return isFree(data, p.x, p.y); });
    const safe = legal.filter(direction => { const p = nextPosition(data.you.head, direction); return !isHeadThreat(data, p.x, p.y); });
    const candidates = safe.length ? safe : legal;
    if (!candidates.length) return { move: fallbackMove(data), depth: 0, nodes: 0 };
    if (candidates.length === 1) return { move: candidates[0], depth: 0, nodes: 0 };
    let nodes = 0;
    // Multi-snake boards use space/territory scoring with conservative head
    // avoidance. Exact joint-move search below is reserved for standard duels.
    const baseline = (direction: MoveDirection) => {
        const you = board.snakes[0], head = next(board, you.body[0], direction), food = board.food.has(head);
        const body = [head, ...you.body.slice(0, -1)]; if (food) body.push(body[body.length - 1]);
        const health = food ? 100 : you.health - 1 - (board.hazards.get(head) ?? 0) * board.hazardDamage;
        if (health <= 0) return DEAD;
        const future = { ...board, snakes: [{ ...you, body, health }, ...board.snakes.slice(1)], food: new Set([...board.food].filter(cell => cell !== head)) };
        return score(future, id);
    };
    const ordered = candidates.map(move => ({ move, value: baseline(move) })).sort((a, b) => b.value - a.value);
    let best = ordered[0].move, completedDepth = 0;
    if (board.snakes.length !== 2 || data.game.ruleset.name !== 'standard') return { move: best, depth: 0, nodes };
    const expired = Symbol('deadline');
    interface Entry { depth: number; value: number; bound: 'exact' | 'upper' | 'lower'; move?: MoveDirection }
    const table = new Map<string, Entry>();
    // Snake order is fixed in surviving duel states; identities and board
    // geometry are constant throughout this move's table.
    const key = (state: SentinelBoard) => state.snakes.map(s => `${s.health}:${s.body.join(',')}`).join('|') + '/' + [...state.food].join(',');
    const order = (state: SentinelBoard, snake: SearchSnake, clear: Int16Array, preferred?: MoveDirection) => {
        const value = (move: MoveDirection) => {
            if (move === preferred) return 10000;
            const cell = next(state, snake.body[0], move);
            let food = Infinity;
            for (const target of state.food) food = Math.min(food, Math.abs(cell % state.width - target % state.width) + Math.abs(Math.floor(cell / state.width) - Math.floor(target / state.width)));
            const exits = state.neighbors[cell].filter(n => n >= 0 && clear[n] <= 2).length;
            return (state.food.has(cell) ? 100 : 0) + 20 / (food + 1) + exits * 3;
        };
        return choices(state, snake, clear).map(move => ({ move, value: value(move) })).sort((a, b) => b.value - a.value).map(item => item.move);
    };
    const search = (state: SentinelBoard, depth: number, alpha: number, beta: number): number => {
        if (performance.now() >= deadline) throw expired;
        nodes++;
        const you = state.snakes.find(s => s.id === id);
        if (!you) return state.snakes.length ? DEAD : DEAD / 2;
        if (state.snakes.length === 1) return -DEAD;
        const position = key(state), cached = table.get(position), originalAlpha = alpha, originalBeta = beta;
        if (cached && cached.depth >= depth) {
            if (cached.bound === 'exact') return cached.value;
            if (cached.bound === 'lower') alpha = Math.max(alpha, cached.value);
            else beta = Math.min(beta, cached.value);
            if (alpha >= beta) return cached.value;
        }
        if (depth === 0) {
            const value = score(state, id);
            if (table.size < 20000) table.set(position, { depth, value, bound: 'exact' });
            return value;
        }
        const clear = sentinelClearance(state), moves = order(state, you, clear, cached?.move);
        if (!moves.length) return DEAD;
        let bestValue = -Infinity, bestMove = moves[0];
        for (const move of moves) {
            const value = reply(state, move, depth, alpha, beta, clear);
            if (value > bestValue) { bestValue = value; bestMove = move; }
            alpha = Math.max(alpha, bestValue);
            if (alpha >= beta) break;
        }
        if (table.size < 20000) table.set(position, { depth, value: bestValue, move: bestMove,
            bound: bestValue <= originalAlpha ? 'upper' : bestValue >= originalBeta ? 'lower' : 'exact' });
        return bestValue;
    };
    const reply = (state: SentinelBoard, move: MoveDirection, depth: number, alpha: number, beta: number, clear: Int16Array): number => {
        const enemy = state.snakes.find(s => s.id !== id), replies = order(state, enemy, clear);
        let worst = Infinity;
        for (const response of replies.length ? replies : directions) {
            const moves = state.snakes.map(s => s.id === id ? move : response);
            worst = Math.min(worst, search(sentinelStep(state, moves), depth - 1, alpha, beta));
            beta = Math.min(beta, worst);
            if (alpha >= beta) break;
        }
        return worst;
    };
    const clear = sentinelClearance(board);
    for (let depth = 1; depth <= 16; depth++) {
        let iterationBest = best, value = -Infinity;
        const scores: { move: MoveDirection; value: number }[] = [];
        try {
            for (const { move } of ordered) {
                const nextValue = reply(board, move, depth, value, Infinity, clear);
                scores.push({ move, value: nextValue });
                if (nextValue > value) { value = nextValue; iterationBest = move; }
            }
        } catch (error) { if (error !== expired) throw error; break; }
        best = iterationBest; completedDepth = depth;
        ordered.splice(0, ordered.length, ...scores.sort((a, b) => b.value - a.value));
        if (Math.abs(value) >= -DEAD) break;
    }
    return { move: best, depth: completedDepth, nodes };
}
