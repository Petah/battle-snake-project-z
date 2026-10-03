import type { BTRequest, BTSnake } from '../types/BTData';
import { directions, fallbackMove, nextPosition } from './directions';
import { isFree, isHeadThreat } from './isFree';
import { MoveDirection } from '../types/MoveDirection';

interface SearchSnake { id: string; body: number[]; health: number }
export interface SentinelBoard {
    width: number; height: number; snakes: SearchSnake[]; food: Set<number>;
    hazards: Map<number, number>; hazardDamage: number;
}
const DEAD = -100000;
export function sentinelBoard(data: BTRequest): SentinelBoard {
    const encode = (point: { x: number; y: number }) => point.y * data.board.width + point.x;
    const hazards = new Map<number, number>();
    for (const point of data.board.hazards) hazards.set(encode(point), (hazards.get(encode(point)) ?? 0) + 1);
    const snake = (value: BTSnake): SearchSnake => ({ id: value.id, health: value.health, body: value.body.map(encode) });
    return { width: data.board.width, height: data.board.height, snakes: [snake(data.you), ...data.board.snakes.filter(s => s.id !== data.you.id).map(snake)],
        food: new Set(data.board.food.map(encode)), hazards, hazardDamage: data.game.ruleset.settings?.hazardDamagePerTurn ?? 0 };
}
function next(board: SentinelBoard, head: number, direction: MoveDirection): number {
    const x = head % board.width, y = Math.floor(head / board.width);
    if (direction === MoveDirection.UP) return y + 1 < board.height ? head + board.width : -1;
    if (direction === MoveDirection.DOWN) return y > 0 ? head - board.width : -1;
    if (direction === MoveDirection.LEFT) return x > 0 ? head - 1 : -1;
    return x + 1 < board.width ? head + 1 : -1;
}
function occupied(board: SentinelBoard): Set<number> {
    return new Set(board.snakes.flatMap(snake => snake.body.slice(0, -1)));
}
function choices(board: SentinelBoard, snake: SearchSnake): MoveDirection[] {
    const blocked = occupied(board);
    return directions.filter(direction => { const cell = next(board, snake.body[0], direction); return cell >= 0 && !blocked.has(cell); });
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
        other.body.slice(1).includes(snake.body[0]) ||
        (other !== snake && other.body[0] === snake.body[0] && other.body.length >= snake.body.length)));
    return { ...board, snakes, food: new Set([...board.food].filter(cell => !eaten.has(cell))) };
}

function distances(board: SentinelBoard, snake: SearchSnake, blocked: Set<number>): Int16Array {
    const distance = new Int16Array(board.width * board.height).fill(-1), queue = [snake.body[0]];
    distance[snake.body[0]] = 0;
    for (let index = 0; index < queue.length; index++) {
        const cell = queue[index];
        for (const direction of directions) {
            const neighbor = next(board, cell, direction);
            if (neighbor < 0 || distance[neighbor] >= 0 || blocked.has(neighbor)) continue;
            distance[neighbor] = distance[cell] + 1; queue.push(neighbor);
        }
    }
    return distance;
}

function score(board: SentinelBoard, id: string): number {
    const you = board.snakes.find(s => s.id === id);
    if (!you) return board.snakes.length ? DEAD : DEAD / 2;
    const enemies = board.snakes.filter(s => s !== you);
    const blocked = occupied(board), own = distances(board, you, blocked);
    const enemyDistances = enemies.map(enemy => distances(board, enemy, blocked));
    let area = 0, territory = 0, foodDistance = Infinity;
    for (let cell = 0; cell < own.length; cell++) {
        if (own[cell] < 0) continue;
        area++;
        const controlled = enemies.every((enemy, index) => enemyDistances[index][cell] < 0 || own[cell] < enemyDistances[index][cell] ||
            (own[cell] === enemyDistances[index][cell] && you.body.length > enemy.body.length));
        if (controlled) territory++;
        if (board.food.has(cell)) foodDistance = Math.min(foodDistance, own[cell] + (controlled ? 0 : 3));
    }
    const length = you.body.length, largest = Math.max(0, ...enemies.map(enemy => enemy.body.length));
    const spaceDeficit = Math.max(0, length + 2 - area);
    const hunger = you.health < 35 ? 180 : length <= largest + 1 ? 85 : 35;
    const foodValue = Number.isFinite(foodDistance) ? hunger / (foodDistance + 1) : 0;
    const starvation = foodDistance >= you.health && you.health < 25 ? (25 - you.health) * 30 : 0;
    // Saturate the area reward: once there is room to live, acquiring food and
    // controlling contested space matter more than simply orbiting open space.
    return -spaceDeficit * 350 + Math.min(area, length * 2 + 8) * 3 + territory * 0.8 +
        Math.min(5, length - largest) * 28 + length * 2 + foodValue + you.health * 0.35 - starvation;
}

export function sentinelMove(data: BTRequest): { move: MoveDirection; depth: number; nodes: number } {
    const deadline = performance.now() + Math.max(1, Math.min(25, data.game.timeout / 8));
    const board = sentinelBoard(data), id = data.you.id;
    const legal = directions.filter(direction => { const p = nextPosition(data.you.head, direction); return isFree(data, p.x, p.y); });
    const safe = legal.filter(direction => { const p = nextPosition(data.you.head, direction); return !isHeadThreat(data, p.x, p.y); });
    const candidates = safe.length ? safe : legal;
    if (!candidates.length) return { move: fallbackMove(data), depth: 0, nodes: 0 };
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
    const search = (state: SentinelBoard, depth: number): number => {
        if (performance.now() >= deadline) throw expired;
        nodes++;
        const you = state.snakes.find(s => s.id === id);
        if (!you) return state.snakes.length ? DEAD - depth : DEAD / 2;
        if (state.snakes.length === 1) return -DEAD + depth;
        if (depth === 0) return score(state, id);
        const moves = choices(state, you);
        if (!moves.length) return DEAD;
        let bestValue = -Infinity;
        for (const move of moves) bestValue = Math.max(bestValue, reply(state, move, depth, bestValue));
        return bestValue;
    };
    const reply = (state: SentinelBoard, move: MoveDirection, depth: number, alpha: number): number => {
        const enemy = state.snakes.find(s => s.id !== id), replies = choices(state, enemy);
        // A trapped opponent must still move; include all directions to resolve
        // simultaneous deaths correctly rather than assuming an instant win.
        let worst = Infinity;
        for (const response of replies.length ? replies : directions) {
            const moves = state.snakes.map(s => s.id === id ? move : response);
            worst = Math.min(worst, search(sentinelStep(state, moves), depth - 1));
            if (worst <= alpha) break;
        }
        return worst;
    };
    for (let depth = 1; depth <= 3; depth++) {
        let iterationBest = best, value = -Infinity;
        try {
            for (const { move } of ordered) {
                const nextValue = reply(board, move, depth, value);
                if (nextValue > value) { value = nextValue; iterationBest = move; }
            }
        } catch (error) { if (error !== expired) throw error; break; }
        best = iterationBest; completedDepth = depth;
    }
    return { move: best, depth: completedDepth, nodes };
}
