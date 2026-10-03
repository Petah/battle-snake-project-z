import { weight, BLOCKED_THRESHOLD, floodFill } from '../lib/weight';
import { closestFood } from '../lib/closestFood';
import { BTData } from '../types/BTData';
import { sortedFood } from '../lib/sortedFood';
import { moveAway } from '../lib/moveAway';
import { smartRandomMove } from '../lib/smartRandomMove';
import { moveTowardsEnemy } from '../lib/moveTowardsEnemy';
import { moveTowardsFoodPf } from '../lib/moveTowardsFoodPf';

export function loadGrid() {
    const PF = require('pathfinding');

    // const colors = ['#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#34495e'];
    const grid = $('.grid');

    const getCol = (x, y) => {
        return grid.find(`.row[data-y="${y}"]`).find('.col').eq(x);
    };

    const BLOCKED = 1;
    const FREE = 0;

    const pf = new PF.AStarFinder({
        allowDiagonal: false,
        useCost: true,
    });

    const drawBoard = (data: BTData) => {
        data = {
            ...data, cache: {},
            board: { ...data.board, hazards: data.board.hazards ?? [] },
            you: { ...data.you, head: data.you.head ?? data.you.body[0], length: data.you.length ?? data.you.body.length },
        };
        $('.log').html('');
        if (data.log) {
            for (const log of data.log) {
                $('<div>').text(log).appendTo('.log');
            }
        }

        grid.html('');
        const matrix = [];
        const costs = [];
        for (let rowIndex = 0; rowIndex < data.board.height; rowIndex++) {
            // Old recordings used a top-left origin; API v1 recordings use bottom-left.
            const y = data.game.ruleset ? data.board.height - 1 - rowIndex : rowIndex;
            matrix[y] = [];
            costs[y] = [];
            const row = $('<div>').addClass('row').attr('data-y', y).appendTo(grid);
            for (let x = 0; x < data.board.width; x++) {
                const w = weight(data, x, y, true);
                matrix[y][x] = w > BLOCKED_THRESHOLD ? FREE : BLOCKED;
                costs[y][x] = 100 - w;
                const col = $('<div>').addClass('col').css({
                    backgroundColor: `rgba(0, 0, 0, ${(100 - w) / 100})`,
                }).appendTo(row);
                $('<div>').addClass('weight').html(x + '/' + y + '<br/>w:' + w + '<br/>' + (matrix[y][x] == FREE ? 'FREE' : 'BLOCKED') + '<br/>c:' + costs[y][x]).css({
                    color: w < 60 ? 'white' : 'black',
                }).appendTo(col);
            }
        }
        for (const food of data.board.food) {
            const col = getCol(food.x, food.y);
            $('<div>').addClass('food').appendTo(col);
        }
        for (const snake of data.board.snakes) {
            const color = snake.id == data.you.id ? '#2ecc71' : '#e74c3c';
            for (const [p, part] of snake.body.entries()) {
                const col = getCol(part.x, part.y);
                $('<div>').addClass('snake').css({
                    backgroundColor: color,
                    borderRadius: p == 0 ? 100 : 0,
                }).text(' ').appendTo(col);
            }
        }

        console.log(moveTowardsFoodPf(data));
    };

    // const hasWayOut = (data: BTData, path) => {
    //     const matrix = [];
    //     const costs = [];
    //     for (var y = 0; y < data.board.height; y++) {
    //         matrix[y] = [];
    //         costs[y] = [];
    //         for (var x = 0; x < data.board.width; x++) {
    //             const w = weight(data, x, y);
    //             matrix[y][x] = w > 0 ? FREE : BLOCKED;
    //             costs[y][x] = 100 - w;
    //         }
    //     }
    //     for (const [i, p] of path.entries()) {
    //         matrix[p[1]][p[0]] = BLOCKED;
    //     }

    //     const pfGrid = new PF.Grid(data.board.width, data.board.height, matrix, costs);
    //     for (const food of data.board.food) {
    //         const wayOutPath = pf.findPath(data.you.body[0].x, data.you.body[0].y, food.x, food.y, pfGrid.clone());
    //         console.log(wayOutPath);
    //     }
    // }

    let game = null;
    let loadedGameFile = '';
    const loadGame = (gameFile, turn = null) => {
        $('.moves').html('');
        $.getJSON('../games/' + gameFile).done((response) => {
            game = response;
            loadedGameFile = gameFile;
            if (turn) {
                drawBoard(game.moves[turn]);
            } else {
                drawBoard(game.start);
            }
            for (const move of game.moves) {
                if (!move || !move.turn) {
                    continue;
                }
                $('<div>').addClass('move').data('turn', move.turn).text('Move ' + move.turn).appendTo('.moves');
            }
        }).fail((xhr, textStatus, errorThrown) => {
            $('.log').text(textStatus + ': ' + errorThrown);
            console.error(textStatus, errorThrown);
        });
    };

    $('.game').click(function () {
        const gameFile = $(this).data('game');
        loadGame(gameFile);
    });

    const urlParams = new URLSearchParams(window.location.search);
    const queryGame = urlParams.get('game');
    const queryTurn = urlParams.get('turn');
    if (queryGame) {
        loadGame(queryGame, queryTurn);
    } else {
        $('.game:last').click();
    }

    $('.moves').on('click', '.move', function () {
        const turn = $(this).data('turn');
        drawBoard(game.moves[turn]);
        const url = new URL(window.location.href);
        url.searchParams.set('game', loadedGameFile);
        url.searchParams.set('turn', String(turn));
        const newUrl = url.toString();
        window.history.pushState({
            path: newUrl,
        }, '', newUrl);
    });
};
