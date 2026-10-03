<?php
function readJsonFile($file)
{
    $content = gzfile($file);
    $content = implode($content);
    if (!$content) {
        throw new \Exception('Could not load file: ' . $file);
    }
    $content = json_decode($content, true);
    if (json_last_error()) {
        throw new \Exception('JSON error: ' . json_last_error_msg());
    }
    return $content;
}

$selectedGame = $_GET['game'] ?? null;
$selectedSnake = $_GET['snake'] ?? null;
$selectedTurn = $_GET['turn'] ?? '0000';

$moveJson = null;
$files = glob(__DIR__ . '/../games/*', GLOB_ONLYDIR);
usort($files, function ($a, $b) {
    return filemtime($b) <=> filemtime($a);
});
$files = array_slice($files, 0, 15);
$files = array_map(function ($path) use (&$moveJson, $selectedGame, $selectedSnake, $selectedTurn) {
    return [
        'path' => $path,
        'gameId' => basename($path),
        'mtime' => filemtime($path),
        'snakes' => array_map(function ($snakePath) use ($path, &$moveJson, $selectedGame, $selectedSnake, $selectedTurn) {
            $start = readJsonFile($snakePath . '/0000_start.json.gz');
            $moves = array_map(function ($movePath) {
                return trim(preg_replace('/_|move|start|end|.json.gz/', ' ', basename($movePath)));
            }, glob($snakePath . '/*.json.gz'));
            natsort($moves);
            $moves = array_combine($moves, $moves);
            if (basename($path) == $selectedGame && $start['body']['you']['id'] == $selectedSnake && isset($moves[$selectedTurn])) {
                $name = 'move';
                if ($selectedTurn == '0000') {
                    $name = 'start';
                }
                if ($selectedTurn == '9999') {
                    $name = 'end';
                }
                $moveJson = readJsonFile($snakePath . '/' . $moves[$selectedTurn] . '_' . $name . '.json.gz');
            }
            return [
                'id' => $start['body']['you']['id'],
                'name' => $start['body']['you']['name'],
                'moves' => $moves,
            ];
        }, glob($path . '/*', GLOB_ONLYDIR)),
    ];
}, $files);

// Keep the older whole-game JSON replays alongside compressed per-turn snapshots.
foreach (glob(__DIR__ . '/../games/*.json') as $file) {
    $recording = json_decode(file_get_contents($file), true);
    if (!isset($recording['start']['you'], $recording['moves'])) continue;
    $gameId = basename($file);
    $you = $recording['start']['you'];
    $turns = ['0000' => $recording['start']];
    foreach ($recording['moves'] as $move) {
        if (!$move) continue;
        $turns[str_pad($move['turn'] + 1, 4, '0', STR_PAD_LEFT)] = $move;
    }
    if (isset($recording['end'])) $turns['9999'] = $recording['end'];
    if ($selectedGame === $gameId && (!$selectedSnake || $selectedSnake === $you['id']) && isset($turns[$selectedTurn])) {
        $selectedSnake = $you['id'];
        $body = $turns[$selectedTurn];
        $body['board']['hazards'] = $body['board']['hazards'] ?? [];
        $body['you']['head'] = $body['you']['head'] ?? $body['you']['body'][0];
        $body['you']['length'] = $body['you']['length'] ?? count($body['you']['body']);
        $moveJson = [
            'body' => $body, 'storage' => new stdClass(),
            'logs' => array_map(function ($line) { return is_array($line) ? $line : [$line]; }, $body['log'] ?? []),
            'coordinateSystem' => $recording['coordinateSystem'] ?? 'top-left',
        ];
    }
    $files[] = [
        'path' => $file, 'gameId' => $gameId, 'mtime' => filemtime($file),
        'snakes' => [['id' => $you['id'], 'name' => $you['name'], 'moves' => array_combine(array_keys($turns), array_keys($turns))]],
    ];
}
usort($files, function ($a, $b) { return $b['mtime'] <=> $a['mtime']; });
$files = array_slice($files, 0, 15);
?>
<html ng-app="battleSnake" ng-controller="DebugController" ng-init="request = <?= htmlentities(json_encode($moveJson)); ?>">

<head>
    <!-- @todo use a cache buster -->
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" integrity="sha384-JcKb8q3iqJ61gNV9KGb8thSsNjpSL0n8PARn9HuZOnIxN0hoP+VmmDGMN5t9UJ0Z" crossorigin="anonymous">
    <link rel="stylesheet" href="styles.css?cache=<?= md5_file(__DIR__ . '/styles.css'); ?>" />
</head>

<body>
    <div class="wrapper">
        <div>
            <div class="grid">
            </div>
            <div>
                <button type="button" class="btn btn-sm btn-primary" ng-click="recomputeWeights()">Compute weights</button>
                <input type="checkbox" ng-model="weightOptions.blockHeads" /> Block heads
                <input type="checkbox" ng-model="weightOptions.attackHeads" /> Attack heads
                <input type="checkbox" ng-model="weightOptions.snakeBodies" /> Snake bodies
                <input type="checkbox" ng-model="weightOptions.borders" /> Borders
                <input type="checkbox" ng-model="weightOptions.deadEnds" /> Dead ends
                <input type="checkbox" ng-model="weightOptions.avoidFood" /> Avoid food
            </div>
        </div>
        <div class="scroll">
            <div class="games">
                <a class="btn btn-sm btn-danger" href="debug-delete.php">Delete</a>
                <?php foreach ($files as $file) : ?>
                    <div>
                        <small><?= date(DATE_ISO8601, $file['mtime']); ?></small>
                        <div>
                            <?php foreach ($file['snakes'] as $snake) : ?>
                                <a href="?game=<?= rawurlencode((string) $file['gameId']); ?>&snake=<?= rawurlencode((string) $snake['id']); ?>"><?= $snake['name']; ?></a>
                            <?php endforeach; ?>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>
        <div class="scroll">
                <a class="btn btn-sm btn-primary" href="?game=<?= rawurlencode((string) $selectedGame); ?>&snake=<?= rawurlencode((string) $selectedSnake); ?>&turn=<?= str_pad($selectedTurn + 1, 4, '0', STR_PAD_LEFT); ?>">Next</a>
                <a class="btn btn-sm btn-primary" href="?game=<?= rawurlencode((string) $selectedGame); ?>&snake=<?= rawurlencode((string) $selectedSnake); ?>&turn=<?= str_pad($selectedTurn - 1, 4, '0', STR_PAD_LEFT); ?>">Previous</a>
            <div class="moves">
                <?php foreach ($files as $file) : ?>
                    <?php if ($selectedGame !== $file['gameId']) continue; ?>
                    <?php foreach ($file['snakes'] as $snake) : ?>
                        <?php if ($selectedSnake !== $snake['id']) continue; ?>
                        <?php foreach ($snake['moves'] as $move) : ?>
                            <div>
                                <a href="?game=<?= rawurlencode((string) $file['gameId']); ?>&snake=<?= rawurlencode((string) $snake['id']); ?>&turn=<?= $move; ?>"><?= $move; ?></a>

                            </div>
                        <?php endforeach; ?>
                    <?php endforeach; ?>
                <?php endforeach; ?>
            </div>
        </div>
        <pre class="scroll">
            <div class="log"></div>
        </pre>
        <pre class="scroll">
            <div class="data"></div>
        </pre>
    </div>
    <script src="https://code.jquery.com/jquery-3.5.1.js"></script>
    <script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.8.0/angular.js"></script>
    <script src="bundle.js?cache=<?= md5_file(__DIR__ . '/bundle.js'); ?>"></script>
    <script>
        // loadGrid();
    </script>
</body>

</html>