<html ng-app="battleSnake" ng-controller="RootController">

<head>
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" integrity="sha384-JcKb8q3iqJ61gNV9KGb8thSsNjpSL0n8PARn9HuZOnIxN0hoP+VmmDGMN5t9UJ0Z" crossorigin="anonymous">
</head>

<body ng-cloak>
    <div class="container-fluid">
        <div class="row">
            <div ng-class="{'col-md-5': watching, 'col-md-12': !watching}">
                <div class="form-group mt-3">
                    <button ng-click="options.showConfig = !options.showConfig" class="btn btn-primary btn-sm">Config</button>
                    <button ng-click="start()" class="btn btn-primary btn-sm">Start</button>
                    <button ng-click="stop()" class="btn btn-primary btn-sm">Stop</button>
                    <input type="checkbox" ng-model="options.autoStart" /> Auto Start
                </div>
                <div ng-show="options.showConfig">
                    <div class="form-group">
                        <label for="boardWidth">Board width</label>
                        <input type="number" step="1" class="form-control" id="boardWidth" ng-model="options.boardWidth" />
                    </div>
                    <div class="form-group">
                        <label for="boardHeight">Board height</label>
                        <input type="number" step="1" class="form-control" id="boardHeight" ng-model="options.boardHeight" />
                    </div>
                    <div class="form-group">
                        <label for="startingFood">Starting food</label>
                        <input type="number" step="1" class="form-control" id="startingFood" ng-model="options.startingFood" />
                    </div>
                    <div class="form-group">
                        <label for="foodSpawnTime">Max turns to food spawn</label>
                        <input type="number" step="1" class="form-control" id="foodSpawnTime" ng-model="options.foodSpawnTime" />
                    </div>
                    <div class="form-group">
                        <label for="concurrentGames">Concurrent Games</label>
                        <input type="number" step="1" class="form-control" id="concurrentGames" ng-model="options.concurrentGames" />
                    </div>
                </div>

                <table class="table table-striped table-sm border">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Amount</th>
                            <th>Port</th>
                            <th>Wins</th>
                            <th>Wins Percent</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr ng-repeat="webSocketClient in webSocketClients | orderBy: '-snake.wins'">
                            <td>{{ webSocketClient.snake.name }}</td>
                            <td>
                                <span ng-show="!options.showConfig">{{ options.enabledSnakes[webSocketClient.snake.name] || '' }}</span>
                                <input ng-show="options.showConfig" type="number" step="1" class="form-control form-control-sm" ng-model="options.enabledSnakes[webSocketClient.snake.name]" />
                            </td>
                            <td>{{ webSocketClient.snake.port }}</td>
                            <td>{{ webSocketClient.snake.wins }}</td>
                            <td>{{ percentWins(webSocketClient.snake.wins) }}%</td>
                        </tr>
                    </tbody>
                </table>

                <div>
                    <small>average moves:</small> {{ getAverageMoves() }}
                    <small>total games:</small> {{ gameManager.games.length }}
                    <small>running games:</small> {{ gameManager.getRunningGames().length }}
                </div>
                <table class="table table-striped table-sm border">
                    <thead>
                        <tr>
                            <th></th>
                            <th ng-click="sortGames('index')">Game</th>
                            <th ng-click="sortGames('id')">ID</th>
                            <th ng-click="sortGames('moves')">Moves</th>
                            <th ng-click="sortGames('started')">Started</th>
                            <th ng-click="sortGames('finished')">Finished</th>
                            <th ng-click="sortGames('winner.name')">Winner</th>
                            <th>Snakes</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr ng-repeat="game in gameManager.games | orderBy: options.orderGames | limitTo: 10">
                            <td><button ng-click="watch(game.id)" class="btn btn-sm btn-primary">Watch</button></td>
                            <td>{{ game.index + 1 }}</td>
                            <td>{{ game.id }}</td>
                            <td>{{ game.moves }}</td>
                            <td>{{ game.started | date: 'mediumTime' }}</td>
                            <td>{{ game.finished | date: 'mediumTime' }}</td>
                            <td>{{ game.winner.name }}</td>
                            <td>
                                <div ng-repeat="snake in game.snakes">
                                    <small>name:</small> {{ snake.name }}
                                    <small>health: </small> {{ snake.health }}
                                    <small>length: </small> {{ snake.body.length }}
                                    <small>alive: </small> {{ snake.alive ? 'Yes' : 'No' }}
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="col-md-7" ng-show="watching">
                <iframe frameborder="0" id="board" width="100%" height="800px" src="http://localhost:3009"></iframe>
            </div>
        </div>
    </div>

    <script src="https://code.jquery.com/jquery-3.5.1.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/popper.js@1.16.1/dist/umd/popper.js"></script>
    <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.js"></script>
    <script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.8.0/angular.js"></script>
    <script src="bundle.js?cache=<?= time(); ?>"></script>
</body>

</html>