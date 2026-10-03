import { WebSocketClient } from "../WebSocketClient";
import snakes from "../snakes";
import { GameManager } from '../GameManager';
import { AngularScope } from '../angular-scope';
import { response } from 'express';
import { Game } from '../Game';
import { log } from '../../lib/log';
import app from '../app';

interface RootControllerScope extends AngularScope {
    gameManager: GameManager,
    webSocketClients: WebSocketClient[],
    options: Options,
    watching: boolean,

    start: () => void,
    stop: () => void,
    watch: (gameId: string) => void,
    updateAutoStart: () => void,
    percentWins: (wins: number) => void,
    getAverageMoves: () => number,
    sortGames: (sort: string) => void,
}

interface Options {
    boardWidth: number,
    boardHeight: number,
    startingFood: number,
    foodSpawnTime: number,
    autoStart: boolean,
    enabledSnakes: EnabledSnake,
    orderGames: string,
    concurrentGames: number,
    showConfig: boolean,
}

interface EnabledSnake {
    [id: string]: number;
}
export const RootController = [
    '$scope',
    '$http',
    function (
        $scope: RootControllerScope,
        $http,
    ) {
        $scope.gameManager = new GameManager();
        $scope.webSocketClients = snakes.map(snake => {
            return new WebSocketClient(snake, snakes, $scope.gameManager, $scope);
        });
        try {
            $scope.options = JSON.parse(localStorage.getItem('options'));
        } catch (error) {
            console.error('Error parsing local storage options', error, localStorage.getItem('options'));
        }
        $scope.options = $.extend({
            boardWidth: 10,
            boardHeight: 10,
            startingFood: 10,
            foodSpawnTime: 10,
            autoStart: false,
            enabledSnakes: {},
            orderGames: 'index',
            concurrentGames: 1,
            showConfig: false,
        }, $scope.options || {});

        let started = false;
        let pendingGames = 0;

        $scope.start = () => {
            let gamesToStart = $scope.options.concurrentGames - $scope.gameManager.getRunningGames().length;
            log.verbose('Starting games', gamesToStart);
            while (gamesToStart > 0) {
                gamesToStart--;
                pendingGames++;
                started = true;
                const config = {
                    width: $scope.options.boardWidth,
                    height: $scope.options.boardHeight,
                    food: $scope.options.startingFood,
                    MaxTurnsToNextFoodSpawn: $scope.options.foodSpawnTime,
                    snakes: [],
                };
                for (const snakeName in $scope.options.enabledSnakes) {
                    const snakeCount = $scope.options.enabledSnakes[snakeName];
                    for (let i = 0; i < snakeCount; i++) {
                        const webSocketClient = $scope.webSocketClients.find(w => w.snake.name == snakeName);
                        config.snakes.push(webSocketClient.snake.config);
                    }
                }
                if (!config.snakes.length) {
                    log('No enabled snakes');
                    return;
                }
                log.verbose('Initializing game');
                let game: Game;
                $http({
                    url: 'http://localhost:3005/games',
                    method: 'POST',
                    data: config,
                })
                    .then((response) => {
                        game = $scope.gameManager.initGame(response.data.ID);
                        log.verbose('Starting game', game.id);
                        return $http({
                            url: `http://localhost:3005/games/${game.id}/start`,
                            method: 'POST',
                        });
                    })
                    .then(() => {
                        log.verbose('Started game', game.id);
                        game.started = new Date();
                        game.pending = false;
                        pendingGames--;
                    })
                    .catch((error) => console.error(error));
            }
        };

        $scope.start();

        $scope.$on('end', () => {
            // @todo allow concurrent games
            // @todo abandon stalled games
            if (started && pendingGames < $scope.options.concurrentGames && $scope.options.autoStart) {
                log.verbose('Auto starting game');
                $scope.start();
            }
        });

        $scope.stop = () => {
            started = false;
        };

        $scope.watch = (gameId) => {
            $scope.watching = true;
            $('#board').attr('src', `http://localhost:3009?engine=http://localhost:3005&game=${gameId}`);
        };

        $scope.getAverageMoves = () => {
            return Math.round($scope.gameManager.games.reduce((c, n) => c + n.moves, 0) / $scope.gameManager.games.length);
        };

        $scope.$watch('options', () => {
            localStorage.setItem('options', JSON.stringify($scope.options));
        }, true);

        $scope.percentWins = (wins) => {
            let sum = 0;
            for (const webSocketClient of $scope.webSocketClients) {
                sum += webSocketClient.snake.wins;
            }
            if (sum === 0) {
                return 0;
            }
            return (100 / sum * wins).toFixed(1);
        };

        $scope.sortGames = (sort: string) => {
            if ($scope.options.orderGames == sort) {
                $scope.options.orderGames = '-' + sort;
            } else {
                $scope.options.orderGames = sort;
            }
        };

        setInterval(() => {
            $scope.$apply();
        }, 500);
    },
];