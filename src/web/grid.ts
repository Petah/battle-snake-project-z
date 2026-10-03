import { StrategyRequest, BTXY } from '../types/BTData';
import snakes from "./snakes";
import { invertColor } from '../lib/invertColor';
const Color = require('color').default;
import { clone } from '../lib/clone';

export function loadGrid(request: StrategyRequest) {
    if (!request?.body?.board || !request?.body?.you) return;
    const serialized = request;
    const context = new StrategyRequest(clone(request.body), clone(request.storage ?? {}));
    context.grid = request.grid ?? context.grid;
    context.logs.push(...(request.logs ?? []));
    request = context;
    const bottomLeft = serialized['coordinateSystem'] === 'bottom-left' || !!request.body.game.ruleset;
    const grid = $('.grid');

    const getCol = (x, y) => {
        return grid.find(`.grid-row[data-y="${y}"]`).find('.grid-col').eq(x);
    };

    console.log('Loading request', request);
    $('.data').html(JSON.stringify(request, null, 4));

    const snake = snakes.find(s => s.name == request.body.you.name);
    if (snake) {
        const tempRequest = new StrategyRequest(clone(request.body), clone(request.storage));
        try {
            console.log('Next move', snake.move(tempRequest), tempRequest);
        } catch (error) {
            console.error('Could not preview strategy', error);
        }
        for (const log of tempRequest.logs) {
            console.log(log);
        }
    }

    $('.log').html('');
    if (request.logs) {
        for (const log of request.logs) {
            $('<div>').text(log.map(l => typeof l === 'string' ? l : JSON.stringify(l, null, 4)).join(' ')).appendTo('.log');
        }
    }

    grid.html('');
    for (let rowIndex = 0; rowIndex < request.body.board.height; rowIndex++) {
        const y = bottomLeft ? request.body.board.height - 1 - rowIndex : rowIndex;
        const row = $('<div>').addClass('grid-row').attr('data-y', y).appendTo(grid);
        for (let x = 0; x < request.body.board.width; x++) {
            const gridCell = request.grid?.[y]?.[x] ?? {};
            const col = $('<div>').addClass('grid-col').css({
                backgroundColor: gridCell.color || '#000000',
                borderColor: new Color(gridCell.color || '#000000').darken(0.2).hex(),
            }).appendTo(row);
            const cellData = [];
            cellData.push(x + '/' + y);
            for (const key in gridCell) {
                if (key === 'color') {
                    continue;
                }
                cellData.push(key + ': ' + gridCell[key]);
            }
            $('<div>').addClass('weight').html(cellData.join('<br/>')).css({
                color: invertColor(gridCell.color || '#000000'),
            }).appendTo(col);
        }
    }
    for (const food of request.body.board.food) {
        const col = getCol(food.x, food.y);
        $('<div>').addClass('food').appendTo(col);
    }
    if (request.body.board.hazards) {
        for (const hazard of request.body.board.hazards) {
            const col = getCol(hazard.x, hazard.y);
            col.css({
                borderColor: '#ff0000',
            });
        }
    }
    for (const snake of request.body.board.snakes) {
        let color = '#e74c3c';
        if (snake.id == request.body.you.id) {
            color = '#2ecc71';
        } else if (request.body.you.squad && request.body.you.squad == snake.squad) {
            color = '#3c69e7';
        }
        let previousPart: BTXY;
        for (const [p, part] of snake.body.entries()) {
            const col = getCol(part.x, part.y);
            $('<div>').addClass('snake').css({
                backgroundColor: color,
                borderColor: new Color(color).darken(0.2).hex(),
                borderRadius: p == 0 ? 100 : 0,
            }).text(p === 0 ? ' ' : getArrow(part, previousPart, bottomLeft)).appendTo(col);
            previousPart = part;
        }
    }
};

function getArrow(current: BTXY, previous?: BTXY, bottomLeft = false) {
    if (previous) {
        if (current.x == previous.x - 1 && current.y == previous.y) {
            return '→';
        } else if (current.x == previous.x + 1 && current.y == previous.y) {
            return '←';
        } else if (current.x == previous.x && current.y == previous.y - 1) {
            return bottomLeft ? '↑' : '↓';
        } else if (current.x == previous.x && current.y == previous.y + 1) {
            return bottomLeft ? '↓' : '↑';
        }

    }
    return ' ';
}
