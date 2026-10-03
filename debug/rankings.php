<?php
function readRankings($file)
{
    $mySnakes = ['Project Z', 'Tak', 'Rando', 'Keep Away', 'Tail Chase', 'Project Z / Tak'];
    $rankings = json_decode(file_get_contents($file), true);
    $datasets = [];
    $labels = [];
    foreach ($rankings as $time => $players) {
        $labels[] = $time;
        foreach ($players as $player => $rank) {
            if (count($datasets) > 15 && !in_array($player, $mySnakes)) {
                continue;
            }
            $datasets[$player] = [
                'label' => $player,
                'fill' => false,
                'data' => [],
                'type' => 'line',
                'pointRadius' => 0,
                'fill' => false,
                'lineTension' => 0,
                'borderWidth' => 1,
                'hidden' => !in_array($player, $mySnakes),
            ];
        }
    }
    foreach ($labels as $dataIndex => $time) {
        foreach ($datasets as &$dataset) {
            $dataset['data'][$dataIndex] = null;
            foreach ($rankings[$time] as $player => $rank) {
                if ($player == $dataset['label']) {
                    $dataset['data'][$dataIndex] = (int) $rank;
                    break;
                }
            }
        }
    }
    $datasets = array_values($datasets);
    return [$labels, $datasets, str_replace('.json', '', basename($file))];
}
?>
<html ng-app="battleSnake" ng-controller="RootController">

<head>
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" integrity="sha384-JcKb8q3iqJ61gNV9KGb8thSsNjpSL0n8PARn9HuZOnIxN0hoP+VmmDGMN5t9UJ0Z" crossorigin="anonymous">
</head>

<body ng-cloak>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.13.0/moment.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/randomcolor/0.6.1/randomColor.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@2.8.0"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/chartjs-plugin-zoom/0.6.3/chartjs-plugin-zoom.js"></script>
    <script>
        const charts = [];
        function resetZoom() {
            for (const chart of charts) {
                chart.resetZoom();
            }
        }
    </script>
    <div class="container-fluid">
        <div class="row">
            <?php foreach (glob(__DIR__ . '/../scrapes/*.json') as $file) : ?>
                <?php list($labels, $datasets, $label) = readRankings($file); ?>
                <div class="col-lg-4">
                    <canvas id="<?= $label; ?>" width="400" height="400"></canvas>
                </div>
                <script>
                    (() => {
                        const LABELS = <?= json_encode($labels); ?>;
                        const DATASETS = <?= json_encode($datasets); ?>;

                        const context = document.getElementById(<?= json_encode($label); ?>).getContext('2d');
                        charts.push(new Chart(context, {
                            type: 'line',
                            data: {
                                labels: LABELS.map(time => new Date(time)),
                                datasets: DATASETS.map((d) => {
                                    const color = randomColor({
                                        seed: d.label,
                                    });
                                    d.backgroundColor = color;
                                    d.borderColor = color;
                                    return d;
                                }),
                            },
                            options: {
                                responsive: true,
                                legend: {
                                    position: 'left',
                                },
                                title: {
                                    display: true,
                                    text: <?= json_encode($label); ?>,
                                },
                                animation: {
                                    duration: 0,
                                },
                                tooltips: {
                                    mode: 'index',
                                    intersect: false,
                                },
                                hover: {
                                    mode: 'nearest',
                                    intersect: true,
                                },
                                scales: {
                                    xAxes: [{
                                        display: true,
                                        type: 'time',
                                        time: {
                                            tooltipFormat: 'll HH:mm',
                                        },
                                        scaleLabel: {
                                            display: true,
                                            labelString: 'Date',
                                        }
                                    }],
                                    yAxes: [{
                                        display: true,
                                        ticks: {
                                            reverse: true,
                                            min: 1,
                                        },
                                        scaleLabel: {
                                            display: true,
                                            labelString: 'Rank',
                                        },
                                    }],
                                },
                                pan: {
                                    enabled: true,
                                    mode: "x",
                                    speed: 10,
                                    threshold: 10
                                },
                                zoom: {
                                    enabled: true,
                                    drag: false,
                                    mode: "xy",
                                    limits: {
                                        max: 10,
                                        min: 0.5
                                    }
                                }
                            },
                        }));
                    })();
                </script>
            <?php endforeach; ?>
        </div>
        <button type="btn" class="btn btn-primary" onclick="resetZoom()">Reset Zoom</button>
    </div>
</body>

</html>