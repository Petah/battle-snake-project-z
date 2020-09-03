import { BTData, initBTData } from '../types/BTData';
import snakes from "../server/snakes";
import { invertColor } from '../lib/invertColor';

interface MoveData {
    body: BTData,
    logs: string[],
}

export function loadGrid(moveJson) {
    const grid = $('.grid');

    const getCol = (x, y) => {
        return grid.find('.row').eq(y).find('.col').eq(x);
    };

    const drawBoard = (moveJson: MoveData) => {
        console.log('Loading move JSON', moveJson);
        $('.data').html(JSON.stringify(moveJson, null, 4));

        const snake = snakes.find(s => s.name == moveJson.body.you.name);
        if (snake) {
            console.log('Next move', snake.move(moveJson.body));
        }

        $('.log').html('');
        if (moveJson.logs) {
            for (const log of moveJson.logs) {
                $('<div>').text(log).appendTo('.log');
            }
        }

        grid.html('');
        for (var y = 0; y < moveJson.body.board.height; y++) {
            const row = $('<div>').addClass('row').appendTo(grid);
            for (var x = 0; x < moveJson.body.board.width; x++) {
                const col = $('<div>').addClass('col').css({
                    backgroundColor: moveJson.body.grid[y][x].color,
                }).appendTo(row);
                const cellData = [];
                cellData.push(x + '/' + y);
                for (const key in moveJson.body.grid[y][x]) {
                    if (key === 'color') {
                        continue;
                    }
                    cellData.push(key + ': ' + moveJson.body.grid[y][x][key]);
                }
                $('<div>').addClass('weight').html(cellData.join('<br/>')).css({
                    color: invertColor(moveJson.body.grid[y][x].color),
                }).appendTo(col);
                // $('<div>').addClass('weight').html(x + '/' + y + '<br/>w:' + w + '<br/>' + (matrix[y][x] == FREE ? 'FREE' : 'BLOCKED') + '<br/>c:' + costs[y][x]).css({
                //     color: w < 60 ? 'white' : 'black',
                // }).appendTo(col);
            }
        }
        for (const food of moveJson.body.board.food) {
            const col = getCol(food.x, food.y);
            $('<div>').addClass('food').appendTo(col);
        }
        for (const snake of moveJson.body.board.snakes) {
            const color = snake.id == moveJson.body.you.id ? '#2ecc71' : '#e74c3c';
            for (const [p, part] of snake.body.entries()) {
                const col = getCol(part.x, part.y);
                $('<div>').addClass('snake').css({
                    backgroundColor: color,
                    borderRadius: p == 0 ? 100 : 0,
                }).text(' ').appendTo(col);
            }
        }
    };

    drawBoard(moveJson);
};