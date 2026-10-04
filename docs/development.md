# Local development

## Setup

Runtime requirements are defined in [.nvmrc](../.nvmrc) and [package.json](../package.json). With nvm installed:

```sh
nvm install
nvm use
npm ci
```

## Running the project

```sh
npm run dev
```

This builds the project, runs the snake servers and dashboard API with automatic restarts, watches TypeScript, and starts the SvelteKit development server with hot reload. Open **http://127.0.0.1:5173** for development; it proxies API requests to port 9000. The compiled dashboard is also available at **http://localhost:9000**. With no selection configured, all registered snake servers run. See the [server registry](../src/server/snakes.ts) for their names and default ports.

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

Add `--browser` for the CLI's live viewer or `--output match.jsonl` to save its replay. See the [CLI documentation](https://github.com/BattlesnakeOfficial/rules/blob/main/cli/README.md) for additional options.

## Dashboard

`npm run dev` starts the SvelteKit UI, dashboard API, and snakes together. The UI lives in `ui/`, uses Svelte 5 components and SvelteKit 3 configuration in `ui/vite.config.ts`, and builds with the static adapter. For a compiled build, run `npm start` for the snakes and `npm run dashboard` in another terminal. The Express dashboard serves the generated UI and existing APIs from the same origin; no separate frontend service is needed in production.

In the dashboard, select players, edit their HTTP URLs, choose a board size and seed, and click **Start match**. The dashboard checks each snake's API metadata and launches the official Rules CLI. It shows live turns, health and length, and lets you stop the process. CLI recordings are automatically saved under `games/matches/`; `RECORD_GAMES=true` is only needed for additional per-snake logs and snapshots.

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

## API and debugging

`GET /` returns API v1 appearance metadata. `/start`, `/move`, and `/end` validate current request bodies; moves always return a direction, with a fallback when a strategy throws or returns an invalid or unsafe move. Each game and snake ID gets its own strategy instance and persistent storage; request caches, grid annotations, and logs stay separate from API input. Coordinates use the bottom-left origin (`up` increases `y`).

Debugging is opt in:

```sh
DEBUG_WEBSOCKETS=true DEBUG_LOGS=true RECORD_GAMES=true npm run dev
```

WebSockets listen on the HTTP port plus 10000. Recordings default to `games/`; `GAME_DIRECTORY` overrides that directory. Completed games have JSON filenames containing both game and snake IDs. Compressed per-turn snapshots live under `games/<game>/<snake>_<id>/`. The dashboard reads both formats, keeping API v1 recordings in bottom-left coordinates and legacy recordings in their original top-left orientation.

## Build and checks

```sh
npm run typecheck
npm run lint
npm test
```

`typecheck` checks backend TypeScript and Svelte components. `lint` requires zero warnings. `test` builds the project and runs the regression suite.

`npm run build` produces the backend in `dist/` and the dashboard in `dashboard-dist/`. Start them with `npm start` and `npm run dashboard` in separate terminals. The compiled dashboard is available at http://localhost:9000.

For frontend-only work, `npm run watch:web` starts the development UI with hot reload and requires the dashboard API on port 9000. `npm run check:web` checks just the frontend.

CLI options are available through each command's help:

```sh
npm run evaluate -- --help
npm run build:web -- --help
npm run profile:movement -- --help
```

[Back to README](../README.md)
