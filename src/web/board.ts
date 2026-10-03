import type { ReplayFrame } from '../shared/dashboard';

const palette = ['#c5f586', '#a2cbff', '#ffbd87', '#d0a8ee', '#ff8f9e', '#7bdcc2', '#e7d684', '#98b6a5', '#eaaa81', '#d1dce1'];
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export function snakeColor(id: string): string {
    let hash = 0;
    for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length];
}
export function displayY(frame: ReplayFrame, y: number) { return frame.origin === 'bottom-left' ? frame.body.board.height - 1 - y : y; }

export function renderBoard(frame: ReplayFrame, weights = false): string {
    const { board } = frame.body;
    const cells: string[] = [];
    for (let y = 0; y < board.height; y++) for (let x = 0; x < board.width; x++) {
        const value = Number(frame.grid?.[y]?.[x]?.weight);
        const intensity = Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value)) / 100 * 115) + 35 : 35;
        const fill = weights ? `rgb(${intensity},${intensity},${intensity})` : (x + y) % 2 ? '#25352a' : '#293a2d';
        const row = displayY(frame, y);
        cells.push(`<rect data-x="${x}" data-y="${y}" x="${x}" y="${row}" width="1" height="1" fill="${fill}" stroke="#3e5040" stroke-width=".018"><title>${x}, ${y}${Number.isFinite(value) ? ` · weight ${value}` : ''}</title></rect>`);
        if (weights && Number.isFinite(value)) cells.push(`<text x="${x + 0.5}" y="${row + 0.66}" text-anchor="middle" fill="#d9e4da" font-size=".26">${value}</text>`);
    }
    for (const hazard of board.hazards) cells.push(`<rect x="${hazard.x}" y="${displayY(frame, hazard.y)}" width="1" height="1" fill="#e28d62" fill-opacity=".22" stroke="#e5a174" stroke-width=".045"><title>Hazard · ${hazard.x}, ${hazard.y}</title></rect>`);
    for (const food of board.food) cells.push(`<circle cx="${food.x + 0.5}" cy="${displayY(frame, food.y) + 0.5}" r=".19" fill="#ff846a"><title>Food</title></circle>`);
    for (const snake of board.snakes) {
        const color = snakeColor(snake.id);
        for (let index = snake.body.length - 1; index >= 0; index--) {
            const part = snake.body[index];
            const row = displayY(frame, part.y);
            cells.push(`<rect x="${part.x + 0.08}" y="${row + 0.08}" width=".84" height=".84" rx="${index === 0 ? '.24' : '.12'}" fill="${color}" stroke="#192b1d" stroke-width=".04"><title>${escape(snake.name)} · ${index === 0 ? 'head' : `segment ${index}`}</title></rect>`);
            if (index === 0) cells.push(`<circle cx="${part.x + 0.36}" cy="${row + 0.39}" r=".055" fill="#192b1d"/><circle cx="${part.x + 0.64}" cy="${row + 0.39}" r=".055" fill="#192b1d"/>`);
            else {
                const previous = snake.body[index - 1];
                const dx = previous.x - part.x;
                const dy = displayY(frame, previous.y) - row;
                const arrow = dx === 1 ? '→' : dx === -1 ? '←' : dy === 1 ? '↓' : dy === -1 ? '↑' : '';
                if (arrow) cells.push(`<text x="${part.x + 0.5}" y="${row + 0.65}" text-anchor="middle" fill="#253422" font-size=".4">${arrow}</text>`);
            }
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Battlesnake board, turn ${frame.turn}" viewBox="0 0 ${board.width} ${board.height}">${cells.join('')}</svg>`;
}
