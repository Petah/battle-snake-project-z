# Project Z Battlesnake AI

A TypeScript and Node.js project for developing, running, and evaluating Battlesnake strategies using API v1. Standard games are the supported target; alternate rulesets need further strategy work.

## Setup

Use Node.js 24 LTS. If you use nvm:

```sh
nvm install
nvm use
npm ci
```

The project uses TypeScript 6.0. The weighted PathFinding.js fork remains pinned to its original commit because the strategies use its custom cost support.

## Development

```sh
npm run dev
```

This builds the project, runs the snake servers and dashboard API with automatic restarts, watches TypeScript, and starts the SvelteKit development server with hot reload. Open **http://127.0.0.1:5173** for development; it proxies API requests to port 9000. The compiled dashboard is also available at **http://localhost:9000**. With no selection configured, all registered snake servers run. See the [server registry](src/server/snakes.ts) for their names and default ports.

Run one snake with a chosen port:

```sh
SNAKE=9001 PORT=9001 npm run dev
```

Names are case insensitive; `SNAKE` also accepts an original port number. Setting only `PORT` selects the default strategy. `HOST` defaults to `0.0.0.0`. Optional `BATTLESNAKE_AUTHOR` and `BATTLESNAKE_VERSION` override the author/version metadata returned by `GET /`.

## Local games

Download the executable for your platform from the [official Rules CLI v1.2.3 release](https://github.com/BattlesnakeOfficial/rules/releases/tag/v1.2.3), verify it against the release checksums, and put `battlesnake` on your PATH or in this project directory. The dashboard also accepts `BATTLESNAKE_CLI=/absolute/path/to/battlesnake`. Make the executable runnable with `chmod +x battlesnake`; a project-local executable can be called as `./battlesnake` in the commands below. Version 1.2.3 was used for verification. Keep the snake servers running in another terminal.

A repeatable solo game:

```sh
battlesnake play --name Player1 --url http://localhost:9001 --gametype solo --seed 42
```

A standard multiplayer game:

```sh
battlesnake play --name Player1 --url http://localhost:9001 --name Player2 --url http://localhost:9003 --gametype standard --width 11 --height 11 --seed 42
```

Add `--browser` for the CLI's live viewer or `--output match.jsonl` to save its replay. These commands and the dashboard replace the legacy PHP engine wrapper for local games. See the [CLI documentation](https://github.com/BattlesnakeOfficial/rules/blob/main/cli/README.md) for additional options.

## Local evaluation and rankings

With the Rules CLI installed as above, run an automatic league:

```sh
npm run evaluate
```

This builds the project, starts all registered snakes on temporary loopback ports, and runs standard 11x11 duels with no turn delay. You do not need to start the servers yourself. Each pairing plays twice with the same board seed and reversed player order. Elo starts at 1500 for each run and uses K=32; rankings are relative to the selected opponents. Draws count as half a win. Failed, timed-out, or incomplete games are excluded from ratings and reported separately.

For a quick comparison or a larger sample:

```sh
npm run evaluate -- --snakes "<name-a>,<name-b>"
npm run evaluate -- --snakes "<name-a>,<name-b>" --rounds 5 --seed 100 --max-seconds 300
```

Replace the placeholders with names from the server registry. The first command runs two duels. Each additional round uses the next seed. Seeds control the board, but random strategy choices remain stochastic. Small samples are provisional; use multiple rounds before drawing conclusions. These rankings measure standard duels, not four-snake games or alternate map performance.

Open `evaluations/latest.html` for an interactive report with sorting, filtering, match outcomes, and a JSON download. The dashboard's **Rankings** tab shows the latest completed run and results for each pairing. Reports also include the source revision, engine binary fingerprint, options, win/draw/loss counts, and engine-reported move latency. Each run gets its own folder; the newest 20 reports are retained. Replays are discarded unless you pass `--keep-replays`, in which case they are retained with their report. Evaluation output is ignored by Git.

Keep the default `--concurrency 1` when evaluating search-heavy strategies: all local snakes share one Node process, so synchronous searches queue requests and can cause timeouts at higher concurrency. Reported HTTP latency includes that queueing time. Up to four matches can run concurrently for lightweight strategies. Increase `--max-seconds` for long survival games. Ratings always apply results in schedule order, regardless of completion order. `--timeout 500` sets the per-move budget and `--max-seconds 30` sets the whole-game limit. A game that reaches this limit is a failure, not a draw. Use `--help` for all options. The command exits with status 1 if any game fails; Ctrl+C stops running matches and saves a partial report without replacing the latest completed ranking.

Set `EVALUATION_DIRECTORY` for both the evaluator and dashboard to use a different report directory, or use `--output /path/to/reports` for a standalone evaluation. `BATTLESNAKE_CLI` selects the engine executable for both tools.

### Comparing runs over time

Open the dashboard's **Rankings → Progress across runs** after running evaluations. Choose all snakes or one snake, then chart final Elo, win rate, score including draws, average/P95/maximum move latency, or failed-game percentage. Hover or focus a point to see its timestamp, source revision and sample size; expand **Compared runs and values** for the underlying numbers and settings. Click **Refresh rankings** after another evaluation completes.

By default, charts show only runs matching the newest completed run's opponent order, board, seeds, rounds, time limits, concurrency and engine binary. Uncheck the matching-settings filter to show other runs; mixed settings are labelled. Code revisions may differ, allowing comparisons after strategy changes, but changes to opponents and machine load also affect results. Elo is calculated afresh per run, so the chart compares final ratings rather than accumulating them. Runs are ordered by completion time and spaced equally along the chart; missing measurements leave gaps. History uses the newest 20 retained reports and excludes cancelled runs. Reports deleted by retention are no longer available to chart.

## Build and checks

The evaluation, browser-build, and movement-profiling commands use [Rush Stack's ts-command-line](https://api.rushstack.io/pages/ts-command-line/) for argument validation and generated help. Existing npm commands and flags remain available:

```sh
npm run evaluate -- --help
npm run build:web -- --help
npm run profile:movement -- --help
```

Unknown arguments and invalid numeric options fail with a nonzero exit status. Evaluation's `--output` takes precedence over `EVALUATION_DIRECTORY`, then defaults to `evaluations/`.

```sh
npm run typecheck
npm run lint
npm test
npm start
```

`npm test` builds the project and runs the native Node regression suite. It covers API metadata, lifecycle and malformed requests, failed strategies, game isolation, recordings, direction conversion, boundary scoring, flood-fill, tail growth, head collisions, dashboard APIs, recording access/deletion, CLI process control, socket reconnection, and SVG rendering. `npm run build` recreates the backend in `dist/` and builds the SvelteKit 3 dashboard in `dashboard-dist/`. `npm run typecheck` checks both backend TypeScript and Svelte components; `npm run check:web` checks just the frontend. `npm run watch:web` starts Vite on port 5173 with hot reload and requires the dashboard API on port 9000. `npm run server` is an alias for `npm start` and runs in the foreground. Build before starting the server.

For deployment, install dependencies and build under Node 24, then start with `SNAKE` and `PORT` configured for your hosting platform. Expose the HTTP endpoint to the Battlesnake engine. Linting requires zero warnings. TypeScript currently uses non-strict checking.

## API and debugging

`GET /` returns API v1 appearance metadata. `/start`, `/move`, and `/end` validate current request bodies; moves always return a direction, with a fallback when a strategy throws or returns an invalid or unsafe move. Each game and snake ID gets its own strategy instance and persistent storage; request caches, grid annotations, and logs stay separate from API input. Coordinates use the bottom-left origin (`up` increases `y`).

Debugging is opt in:

```sh
DEBUG_WEBSOCKETS=true DEBUG_LOGS=true RECORD_GAMES=true npm run dev
```

WebSockets listen on the HTTP port plus 10000. Recordings default to `games/`; `GAME_DIRECTORY` overrides that directory. Completed games have JSON filenames containing both game and snake IDs. Compressed per-turn snapshots live under `games/<game>/<snake>_<id>/`. The dashboard reads both formats, keeping API v1 recordings in bottom-left coordinates and legacy recordings in their original top-left orientation.

## Local dashboard

`npm run dev` starts the SvelteKit UI, dashboard API, and snakes together. The UI lives in `ui/`, uses Svelte 5 components and SvelteKit 3 configuration in `ui/vite.config.ts`, and builds with the static adapter. For a compiled build, run `npm start` for the snakes and `npm run dashboard` in another terminal. The Express dashboard serves the generated UI and existing APIs from the same origin; no separate frontend service is needed in production.

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

Scoring rejects off-board and occupied squares, distinguishes vacating tails from stacked tails, and avoids squares reachable by equal or longer opponents. The server applies the same immediate collision checks to strategy moves and falls back when possible. Flood-fill and weighted grids cache within each request. These checks improve immediate safety without guaranteeing survival over future turns.

After building, run `npm run profile:movement` for a repeatable local scoring/pathfinding timing report. Hazard maps, wrapped boards, and other alternate rulesets need further strategy work before they are supported.

## Server deployment

The files in [deploy/](deploy/) are example systemd and Caddy configurations. Replace `snake.example.com` with your hostname and adjust runtime paths and the release version before installing them.

The example proxy exposes the default strategy at `https://snake.example.com/` and individual strategies at `/snakes/<name>`. See the [proxy configuration](deploy/starter-snake-node.caddy) for the available routes.

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

For future releases, upload `dist/`, `dashboard-dist/`, and the package manifests into a new release directory, install production dependencies using the isolated Node runtime (`npm ci --omit=dev --ignore-scripts`), update `current` to that release, set `BATTLESNAKE_VERSION` in the snake service, and restart only the two Battlesnake services. Keep the previous release for rollback; point `current` back to it and restart those services if verification fails.

Verify public API metadata, lifecycle requests, a seeded CLI match, dashboard access through the tunnel, and the health of any other hosted applications after deployment.

### Production logging and recording retention

Successful HTTP requests are not logged when `NODE_ENV=production`; HTTP errors and strategy exceptions remain visible in the service journal. Set `REQUEST_LOGS=true` to temporarily enable all request logs. Development logging is unchanged. The example snake service enables `RECORD_GAMES=true` to save incoming Arena games as compressed per-turn snapshots plus a complete JSON recording on `/end`; `DEBUG_LOGS` remains disabled. Find these games by game ID in the dashboard's Recordings tab. Recording starts only after this setting is enabled; earlier games cannot be recovered from the server.

Production dashboard recordings are kept for **7 days**, with a **1 GiB** storage target. Cleanup runs at startup, every five minutes, and when a match ends or stops. It deletes expired recordings first, then the oldest completed recordings until total recording bytes fit the limit; active CLI files are skipped. A running match is stopped if its recording exceeds **100 MiB**, bounding active writers as well. Limits are checked periodically, so writes can briefly exceed them between checks. Cleanup only selects recording files or snapshot directories under the configured games directory and does not follow symlinks.

Set `RECORDING_RETENTION_DAYS` and `RECORDING_MAX_BYTES` to override retention. Development dashboards do not delete recordings automatically unless these variables are supplied. The example dashboard service sets them explicitly to `7` and `1073741824`. This policy does not alter server-wide logging settings.
