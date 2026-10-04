# Evaluation and rankings

With the [Rules CLI installed](development.md#local-games), run an automatic league:

```sh
npm run evaluate
```

This builds the project, starts all registered snakes on temporary loopback ports, and runs standard 11x11 duels with no turn delay. You do not need to start the servers yourself. Each pairing plays twice with the same board seed and reversed player order. Elo starts at 1500 for each run and uses K=32; rankings are relative to the selected opponents. Draws count as half a win. Failed, timed-out, or incomplete games are excluded from ratings and reported separately.

For a quick comparison or a larger sample:

```sh
npm run evaluate -- --snakes "<name-a>,<name-b>"
npm run evaluate -- --snakes "<name-a>,<name-b>" --rounds 5 --seed 100 --max-seconds 300
```

Replace the placeholders with names from the [server registry](../src/server/snakes.ts). The first command runs two duels. Each additional round uses the next seed. Seeds control the board, but random strategy choices remain stochastic. Small samples are provisional; use multiple rounds before drawing conclusions. These rankings measure standard duels, not four-snake games or alternate map performance.

Open `evaluations/latest.html` for an interactive report with sorting, filtering, match outcomes, and a JSON download. The dashboard's **Rankings** tab shows the latest completed run and results for each pairing. Reports also include the source revision, engine binary fingerprint, options, win/draw/loss counts, and engine-reported move latency. Each run gets its own folder; the newest 20 reports are retained. Replays are discarded unless you pass `--keep-replays`, in which case they are retained with their report. Evaluation output is ignored by Git.

Keep the default `--concurrency 1` when evaluating search-heavy strategies: all local snakes share one Node process, so synchronous searches queue requests and can cause timeouts at higher concurrency. Reported HTTP latency includes that queueing time. Up to four matches can run concurrently for lightweight strategies. Increase `--max-seconds` for long survival games. Ratings always apply results in schedule order, regardless of completion order. `--timeout 500` sets the per-move budget and `--max-seconds 30` sets the whole-game limit. A game that reaches this limit is a failure, not a draw. Use `--help` for all options. The command exits with status 1 if any game fails; Ctrl+C stops running matches and saves a partial report without replacing the latest completed ranking.

Set `EVALUATION_DIRECTORY` for both the evaluator and dashboard to use a different report directory, or use `--output /path/to/reports` for a standalone evaluation. `BATTLESNAKE_CLI` selects the engine executable for both tools.

## Comparing runs over time

Open the dashboard's **Rankings → Progress across runs** after running evaluations. Choose all snakes or one snake, then chart final Elo, win rate, score including draws, average/P95/maximum move latency, or failed-game percentage. Hover or focus a point to see its timestamp, source revision and sample size; expand **Compared runs and values** for the underlying numbers and settings. Click **Refresh rankings** after another evaluation completes.

By default, charts show only runs matching the newest completed run's opponent order, board, seeds, rounds, time limits, concurrency and engine binary. Uncheck the matching-settings filter to show other runs; mixed settings are labelled. Code revisions may differ, allowing comparisons after strategy changes, but changes to opponents and machine load also affect results. Elo is calculated afresh per run, so the chart compares final ratings rather than accumulating them. Runs are ordered by completion time and spaced equally along the chart; missing measurements leave gaps. History uses the newest 20 retained reports and excludes cancelled runs. Reports deleted by retention are no longer available to chart.

`--output` takes precedence over `EVALUATION_DIRECTORY`, then defaults to `evaluations/`. For the full option list, run `npm run evaluate -- --help`.

[Back to README](../README.md)
