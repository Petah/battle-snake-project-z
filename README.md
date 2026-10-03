# Project Z Battlesnake AI

Eleven Battlesnake strategies written in TypeScript for Node.js, migrated to the current Battlesnake API v1. Standard games are the initial target. CI and alternate map support are tracked in [todo.md](todo.md).

## Setup

Use Node.js 24 LTS. If you use nvm:

```sh
nvm install
nvm use
npm ci
```

The project uses TypeScript 6.0, the latest major supported by the current typescript-eslint tooling. The weighted PathFinding.js fork remains pinned to its original commit because the strategies use its custom cost support. The neural-network experiment has been removed.

## Development

```sh
npm run dev
```

This builds the project, runs the snake servers and dashboard with automatic restarts, watches TypeScript, and rebuilds the browser bundle when its source changes. Open **http://localhost:9000** for the local arena. With no selection configured, all twelve servers run:

| Snake | HTTP port |
| --- | --- |
| ProjectZ | 9001 |
| KeepAway | 9002 |
| Rando | 9003 |
| Tak | 9004 |
| TailChase | 9005 |
| Aldo | 9006 |
| Dunno | 9007 |
| WorkItOut | 9008 |
| ProjectZ2 | 9009 |
| LookAhead | 9010 |
| Sentinel | 9011 |
| Vesper | 9012 |

Run one snake with a chosen port:

```sh
SNAKE=ProjectZ PORT=9001 npm run dev
```

Names are case insensitive; `SNAKE` also accepts an original port number. Setting only `PORT` selects ProjectZ. `HOST` defaults to `0.0.0.0`. Optional `BATTLESNAKE_AUTHOR` and `BATTLESNAKE_VERSION` override the author/version metadata returned by `GET /`.

## Sentinel

Sentinel is a teal strategy on port **9011**, designed for standard boards. It combines reachable-space checks that account for moving tails, shortest-path territory estimates, and food urgency based on health and relative length. In duels it performs iterative maximin search up to sixteen simultaneous turns: each candidate is judged against the opponent's strongest reply. Alpha-beta pruning, previous-iteration move ordering and a per-request transposition table reuse work; only a fully completed depth replaces the previous choice. Forced moves return without searching. The search budget is capped at 75 ms and scales down to 20% of the request timeout minus 15 ms (minimum 1 ms); normal request parsing and initial scoring add overhead.

Space estimates account for the exact release time of each current body segment, including duplicated tails. They remain optimistic estimates: future head paths and eating can change the available space. Search resolves the known simultaneous moves and food effects. Food and length advantages take priority over speculative territorial gains, and an opponent's mobility matters when Sentinel can safely pressure it.

The local simulator models movement, vacating/stacked tails, food growth, starvation, known hazard damage, body collisions and head-to-head outcomes using the [official standard rules](https://github.com/BattlesnakeOfficial/rules/blob/main/standard.go). It does not predict new food spawns. Boards with more than two snakes use the space/food/territory heuristic and immediate head-threat avoidance, without joint-move search. Wrapped, squad and other alternate rulesets are not supported by this strategy.

```sh
SNAKE=Sentinel PORT=9011 npm run dev
npm run evaluate -- --snakes Sentinel,ProjectZ2,Tak,Rando --rounds 5 --seed 100
```

For head-to-head tests against Vesper, use `--snakes Sentinel,Vesper --concurrency 1 --max-seconds 300`. Long survival games need a larger wall-clock limit. Both strategies run synchronously in the evaluator's shared Node process, so reported HTTP latency includes time queued behind the other strategy's search.

Sentinel is included in the default dashboard and evaluation roster. If your browser retained the previous ten-snake setup, use **+ Add snake** to add the missing registered strategy. The deployment proxy template includes `/snakes/sentinel` for future deployments.

Original three-turn version results: 16 wins in 18 duels against ProjectZ2/Tak/Rando at seeds 100–102. A separate full-roster league at seeds 1000–1002 produced **56 wins / 4 losses** for Sentinel, **1827.3 Elo**, and **10 ms p95** move latency, with no engine failures across the league's 330 games. Two four-snake smoke games at seeds 111 and 222 completed; Sentinel won one. These are local samples against the bundled strategies, not an official Arena rating or a guarantee of performance against other snakes.

After the Vesper upgrade, a controlled comparison used standard 11×11 duels, seeds 801–803, both player orders, 500 ms move timeouts, concurrency one, and a 300-second match limit. Original Sentinel from `013b46e` lost all six games; the revised Sentinel won three and lost three. Vesper was unchanged. All games completed without engine failures. This small sample shows progress against that opponent, not reliable dominance. The search budget increased from 25 to 75 ms; shared-process p95 HTTP latency increased from 126 to 196 ms in these runs, including the time queued behind Vesper's search.

## Vesper

Vesper is an amethyst strategy on port **9012**, which led the bundled roster in its initial local duel league. It is built around four ideas:

- **Time-aware flood fill.** A body segment only blocks a cell until its owner's tail has moved past it, so corridors that open in time count as space, and a tail that stays put after eating is blocked for one extra turn. This accepts safe pockets that a static fill rejects and avoids the stacked-tail trap.
- **Voronoi territory with pressure.** Cells are assigned to whichever head reaches them first, with ties going to the longer snake. The evaluation rewards Vesper's share, penalises the rival's share, and adds a pressure bonus when the rival has few legal moves, so a longer Vesper squeezes rather than orbits.
- **Deeper duel search.** In standard duels Vesper runs iterative-deepening maximin over simultaneous moves with alpha-beta pruning. Each iteration reorders the root moves by the previous result, and only a completed depth replaces the previous choice. The budget is 30% of the request timeout minus 30 ms, capped at 140 ms, which typically reaches depth 4–6 on an 11x11 board. `VESPER_BUDGET_MS` overrides the budget for experiments.
- **Nearest-rival search with greedy bystanders.** With three or more snakes, only the closest rival answers adversarially; the others follow a one-ply greedy policy. This keeps the search tractable while respecting the snake most likely to interfere.

The simulator follows the standard rules for movement, food growth, starvation, known hazard damage, body collisions and head-to-head resolution, and does not predict food spawns. Wrapped, squad and other alternate rulesets are not supported.

```bash
SNAKE=Vesper PORT=9012 npm run dev
npm run evaluate -- --snakes Vesper,Sentinel,ProjectZ,Tak --rounds 2 --seed 100 --max-seconds 150
```

All local snakes share one Node process, and Vesper's search is synchronous, so run evaluations with `--concurrency 1` and a generous `--max-seconds`; higher concurrency makes every snake's requests queue behind Vesper's and causes engine timeouts. Initial local results: a full-roster league at seed 42 produced **22 wins / 0 losses** for Vesper, **1738.5 Elo**, and **125 ms p95** move latency, with no engine failures across 132 games; Sentinel finished second with 20 wins. Two four-snake smoke games against Sentinel, Tak and ProjectZ2 at seeds 111 and 222 were both won by Vesper. These are local samples against the bundled strategies, not an official Arena rating.

## Local games

Download the executable for your platform from the [official Rules CLI v1.2.3 release](https://github.com/BattlesnakeOfficial/rules/releases/tag/v1.2.3), verify it against the release checksums, and put `battlesnake` on your PATH or in this project directory. The dashboard also accepts `BATTLESNAKE_CLI=/absolute/path/to/battlesnake`. Make the executable runnable with `chmod +x battlesnake`; a project-local executable can be called as `./battlesnake` in the commands below. Version 1.2.3 was used for verification. Keep the snake servers running in another terminal.

A repeatable solo game:

```sh
battlesnake play --name ProjectZ --url http://localhost:9001 --gametype solo --seed 42
```

A standard multiplayer game:

```sh
battlesnake play --name ProjectZ --url http://localhost:9001 --name Rando --url http://localhost:9003 --gametype standard --width 11 --height 11 --seed 42
```

Add `--browser` for the CLI's live viewer or `--output match.jsonl` to save its replay. These commands and the dashboard replace the legacy PHP engine wrapper for local games. See the [CLI documentation](https://github.com/BattlesnakeOfficial/rules/blob/main/cli/README.md) for additional options.

## Local evaluation and rankings

With the Rules CLI installed as above, run an automatic league:

```sh
npm run evaluate
```

This builds the project, starts all twelve snakes on temporary loopback ports, and runs 132 standard 11x11 duels with no turn delay. You do not need to start the servers yourself. Each pairing plays twice with the same board seed and reversed player order. Elo starts at 1500 for each run and uses K=32; rankings are relative to the selected opponents. Draws count as half a win. Failed, timed-out, or incomplete games are excluded from ratings and reported separately.

For a quick comparison or a larger sample:

```sh
npm run evaluate -- --snakes ProjectZ,Rando,Tak
npm run evaluate -- --snakes ProjectZ,ProjectZ2,LookAhead --rounds 5 --seed 100
```

The first command runs six duels. Each additional round uses the next seed. Seeds control the board, but random strategy choices remain stochastic. Small samples are provisional; use multiple rounds before drawing conclusions. These rankings measure standard duels, not four-snake games or alternate map performance.

Open `evaluations/latest.html` for an interactive report with sorting, filtering, match outcomes, and a JSON download. The dashboard's **Rankings** tab shows the latest completed run and results for each pairing. Reports also include the source revision, engine binary fingerprint, options, win/draw/loss counts, and engine-reported move latency. Each run gets its own folder; the newest 20 reports are retained. Replays are discarded unless you pass `--keep-replays`, in which case they are retained with their report. Evaluation output is ignored by Git.

Use `--concurrency 2` (up to 4) for faster runs; the default of one match at a time makes latency measurements easier to compare. Shared CPU contention can increase measured latency. Ratings always apply results in schedule order, regardless of completion order. `--timeout 500` sets the per-move budget and `--max-seconds 30` sets the whole-game limit. A game that reaches this limit is a failure, not a draw. Use `--help` for all options. The command exits with status 1 if any game fails; Ctrl+C stops running matches and saves a partial report without replacing the latest completed ranking.

Set `EVALUATION_DIRECTORY` for both the evaluator and dashboard to use a different report directory, or use `--output /path/to/reports` for a standalone evaluation. `BATTLESNAKE_CLI` selects the engine executable for both tools.

### Comparing runs over time

Open the dashboard's **Rankings → Progress across runs** after running evaluations. Choose all snakes or one snake, then chart final Elo, win rate, score including draws, average/P95/maximum move latency, or failed-game percentage. Hover or focus a point to see its timestamp, source revision and sample size; expand **Compared runs and values** for the underlying numbers and settings. Click **Refresh rankings** after another evaluation completes.

By default, charts show only runs matching the newest completed run's opponent order, board, seeds, rounds, time limits, concurrency and engine binary. Uncheck the matching-settings filter to show other runs; mixed settings are labelled. Code revisions may differ, allowing comparisons after strategy changes, but changes to opponents and machine load also affect results. Elo is calculated afresh per run, so the chart compares final ratings rather than accumulating them. Runs are ordered by completion time and spaced equally along the chart; missing measurements leave gaps. History uses the newest 20 retained reports and excludes cancelled runs. Reports deleted by retention are no longer available to chart.

## Build and checks

```sh
npm run typecheck
npm run lint
npm test
npm start
```

`npm test` builds the project and runs the native Node regression suite. It covers API metadata, lifecycle and malformed requests, failed strategies, game isolation, recordings, direction conversion, boundary scoring, flood-fill, tail growth, head collisions, dashboard APIs, recording access/deletion, CLI process control, socket reconnection, and SVG rendering. `npm run build` recreates `dist/` from `src/` and bundles `src/web.ts` into `debug/bundle.js` with esbuild. `npm run server` is an alias for `npm start` and runs in the foreground. Build before starting the server.

For deployment, install dependencies and build under Node 24, then start with `SNAKE` and `PORT` configured for your hosting platform. Expose the HTTP endpoint to the Battlesnake engine. Linting reports existing unused-code warnings; TypeScript retains the legacy non-strict mode during the staged migration.

## API and debugging

`GET /` returns API v1 appearance metadata. `/start`, `/move`, and `/end` validate current request bodies; moves always return a direction, with a fallback when a strategy throws or returns an invalid or unsafe move. Each game and snake ID gets its own strategy instance and persistent storage; request caches, grid annotations, and logs stay separate from API input. Coordinates use the bottom-left origin (`up` increases `y`).

Debugging is opt in:

```sh
DEBUG_WEBSOCKETS=true DEBUG_LOGS=true RECORD_GAMES=true npm run dev
```

WebSockets listen on the HTTP port plus 10000. Recordings default to `games/`; `GAME_DIRECTORY` overrides that directory. Completed games have JSON filenames containing both game and snake IDs. Compressed per-turn snapshots live under `games/<game>/<snake>_<id>/`. The dashboard reads both formats, keeping API v1 recordings in bottom-left coordinates and legacy recordings in their original top-left orientation.

## Local dashboard

`npm run dev` starts the dashboard alongside the snakes. For a compiled build, run `npm start` for the snakes and `npm run dashboard` in another terminal. PHP and AngularJS are no longer required.

At **http://localhost:9000**, select players, edit their HTTP URLs, choose a board size and seed, and click **Start match**. The dashboard checks each snake's API metadata and launches the official Rules CLI. It shows live turns, health and length, and lets you stop the process. CLI recordings are automatically saved under `games/matches/`; `RECORD_GAMES=true` is only needed for additional per-snake logs and snapshots.

The Recordings tab includes existing games and new CLI matches. Use the timeline, previous/next buttons, or playback to inspect turns. **Score board** calculates the current scoring grid; **Weights** displays it. Replay URLs preserve the selected recording. **Delete recording** requires confirmation and deletes only the selected file or snapshot directory. Running match recordings cannot be deleted. Recording files use normal filesystem permissions; the application does not make them world-writable.

HTTP URLs and optional WebSocket URLs are editable and saved in this browser. Enable **Monitor debug sockets** under Connection settings to watch snake servers started with `DEBUG_WEBSOCKETS=true`; disconnected sockets retry and are closed when monitoring is disabled. WebSockets use the snake's HTTP port plus 10000 by default. Browser configuration contains endpoint data and does not import server strategies.

| Variable | Default / purpose |
| --- | --- |
| `DASHBOARD_PORT` | `9000` |
| `DASHBOARD_HOST` | `127.0.0.1`; the dashboard is intended for local development |
| `BATTLESNAKE_CLI` | Project-local `battlesnake`, otherwise `battlesnake` on PATH |
| `GAME_DIRECTORY` | `games/`, shared with snake recordings |
| `DASHBOARD_SNAKES` | Optional JSON array of `{ "name", "url", "websocketUrl" }` endpoints |
| `DASHBOARD_ALLOWED_HOSTS` | Optional comma-separated hostnames when using a custom dashboard hostname |

The dashboard allows four simultaneous matches, stops matches after 15 minutes, and loads recordings up to 100 MB. It rejects cross-site requests and confines recording operations to the configured games directory. Keep this development dashboard on your local machine.


Scoring rejects off-board and occupied squares, distinguishes vacating tails from stacked tails, and avoids squares reachable by equal or longer opponents. The server applies the same immediate collision checks to strategy moves and falls back when possible. Flood-fill and weighted grids cache within each request; LookAhead uses a bounded search with static opponent positions. These checks improve immediate safety without guaranteeing survival over future turns.

After building, run `npm run profile:movement` for a repeatable local scoring/pathfinding timing report. Hazard maps, wrapped boards, and other alternate rulesets need further strategy work before they are supported.

## Server deployment

The files in [deploy/](deploy/) are example systemd and Caddy configurations. Replace `snake.example.com` with your hostname and adjust runtime paths and the release version before installing them.

The example proxy exposes ProjectZ at `https://snake.example.com/`. All twelve strategies also have paths `/snakes/<name>`, using their lowercase names: `projectz`, `keepaway`, `rando`, `tak`, `tailchase`, `aldo`, `dunno`, `workitout`, `projectz2`, `lookahead`, `sentinel`, and `vesper`. For example, use `https://snake.example.com/snakes/sentinel` as Sentinel's Battlesnake URL.

Keep the dashboard bound to the server's loopback interface and access it through an SSH tunnel. Replace the username and hostname in this example:

```sh
ssh -N -L 19000:127.0.0.1:9000 user@server.example.com
```

Then visit **http://localhost:19000**. Matches execute on the server; the example services store recordings in `/var/lib/battlesnake/games` and read evaluation history from `/var/lib/battlesnake/evaluations`. Local evaluation reports are not uploaded automatically.

Run the application as a dedicated `battlesnake` user, with automatic startup/restarts and memory/CPU limits. The example services use an isolated Node 24.21.0 runtime under `/srv/starter-snake-node/runtimes/` and Rules CLI v1.2.3 at `/srv/starter-snake-node/bin/battlesnake`. Download the Linux executables from their official releases and verify their checksums. Point `/srv/starter-snake-node/current` to the compiled release directory.

Inspect application services and logs with:

```sh
systemctl status battlesnake-snakes battlesnake-dashboard
journalctl -u battlesnake-snakes -u battlesnake-dashboard -n 100
```

Back up the existing Caddyfile before importing `/etc/caddy/starter-snake-node.caddy`. Validate the combined configuration before reloading Caddy. Preserve the import if another tool regenerates the main Caddyfile.

For future releases, upload a fresh compiled build with its package manifests into a new release directory, install production dependencies using the isolated Node runtime (`npm ci --omit=dev --ignore-scripts`), update `current` to that release, set `BATTLESNAKE_VERSION` in the snake service, and restart only the two Battlesnake services. Keep the previous release for rollback; point `current` back to it and restart those services if verification fails.

Verify public API metadata, lifecycle requests, a seeded CLI match, dashboard access through the tunnel, and the health of any other hosted applications after deployment.

### Production logging and recording retention

Successful HTTP requests are not logged when `NODE_ENV=production`; HTTP errors and strategy exceptions remain visible in the service journal. Set `REQUEST_LOGS=true` to temporarily enable all request logs. Development logging is unchanged. The example snake service enables `RECORD_GAMES=true` to save incoming Arena games as compressed per-turn snapshots plus a complete JSON recording on `/end`; `DEBUG_LOGS` remains disabled. Find these games by game ID in the dashboard's Recordings tab. Recording starts only after this setting is enabled; earlier games cannot be recovered from the server.

Production dashboard recordings are kept for **7 days**, with a **1 GiB** storage target. Cleanup runs at startup, every five minutes, and when a match ends or stops. It deletes expired recordings first, then the oldest completed recordings until total recording bytes fit the limit; active CLI files are skipped. A running match is stopped if its recording exceeds **100 MiB**, bounding active writers as well. Limits are checked periodically, so writes can briefly exceed them between checks. Cleanup only selects recording files or snapshot directories under the configured games directory and does not follow symlinks.

Set `RECORDING_RETENTION_DAYS` and `RECORDING_MAX_BYTES` to override retention. Development dashboards do not delete recordings automatically unless these variables are supplied. The example dashboard service sets them explicitly to `7` and `1073741824`. This policy does not alter server-wide logging settings.
