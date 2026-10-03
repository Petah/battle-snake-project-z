import { AngularScope } from '../angular-scope';
import { loadGrid } from '../grid';
import { weight, WeightOptions } from '../../lib/weight';
import { StrategyRequest } from '../../types/BTData';

interface DebugControllerScope extends AngularScope {
    request: StrategyRequest,
    recomputeWeights: (...any: any[]) => void,
    weightOptions: WeightOptions,
}

export const DebugController = [
    '$scope',
    function (
        $scope: DebugControllerScope,
    ) {
        $scope.weightOptions = {
            blockHeads: false,
            attackHeads: false,
            borders: false,
            snakeBodies: false,
            deadEnds: false,
            avoidFood: false,
        }
        $scope.$watch('request', () => {
            if (!$scope.request?.body) return;
            const serialized = $scope.request;
            const { body, storage } = serialized;
            if (!(serialized instanceof StrategyRequest)) {
                $scope.request = Object.assign(new StrategyRequest(body, storage ?? {}), serialized);
            }
            loadGrid($scope.request);
        });

        $scope.recomputeWeights = () => {
            if (!$scope.request?.body) return;
            $scope.request.cache = {};
            console.log('Recompute weights');
            for (let y = 0; y < $scope.request.body.board.height; y++) {
                for (let x = 0; x < $scope.request.body.board.width; x++) {
                    $scope.request.grid[y][x].weight = weight($scope.request, x, y, $scope.weightOptions);
                }
            }
            loadGrid($scope.request);
        };
    },
];
