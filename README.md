# Project Z Battlesnake AI

Ten Battlesnake strategies written in TypeScript for Node.js, migrated to the current Battlesnake API v1. Standard games are the initial target: all ten strategies have completed seeded games against the official Rules CLI. Dashboard replacement and alternate map support are tracked in [todo.md](todo.md).

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

This builds the project, runs the snake servers with automatic restarts, watches TypeScript, and rebuilds the browser bundle when its source changes. With no selection configured, all ten servers run:

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

Run one snake with a chosen port:

```sh
SNAKE=ProjectZ PORT=9001 npm run dev
```

Names are case insensitive; `SNAKE` also accepts an original port number. Setting only `PORT` selects ProjectZ. `HOST` defaults to `0.0.0.0`. Optional `BATTLESNAKE_AUTHOR` and `BATTLESNAKE_VERSION` override the author/version metadata returned by `GET /`.

## Local games

Download the executable for your platform from the [official Rules CLI v1.2.3 release](https://github.com/BattlesnakeOfficial/rules/releases/tag/v1.2.3), verify it against the release checksums, and put `battlesnake` on your PATH. Version 1.2.3 was used for verification. Keep the snake servers running in another terminal.

A repeatable solo game:

```sh
battlesnake play --name ProjectZ --url http://localhost:9001 --gametype solo --seed 42
```

A standard multiplayer game:

```sh
battlesnake play --name ProjectZ --url http://localhost:9001 --name Rando --url http://localhost:9003 --gametype standard --width 11 --height 11 --seed 42
```

Add `--browser` for the CLI's live viewer or `--output match.jsonl` to save its replay. These commands replace the legacy engine wrapper for local games; the old PHP dashboard's engine controls still need migration. See the [CLI documentation](https://github.com/BattlesnakeOfficial/rules/blob/main/cli/README.md) for additional options.

## Build and checks

```sh
npm run typecheck
npm run lint
npm test
npm start
```

`npm test` builds the project and runs the native Node regression suite. It covers API metadata, lifecycle and malformed requests, failed strategies, game isolation, recordings, direction conversion, boundary scoring, flood-fill, tail growth, and head collisions. `npm run build` recreates `dist/` from `src/` and bundles `src/web.ts` into `debug/bundle.js` with esbuild. `npm run server` is an alias for `npm start` and runs in the foreground. Build before starting the server.

For deployment, install dependencies and build under Node 24, then start with `SNAKE` and `PORT` configured for your hosting platform. Expose the HTTP endpoint to the Battlesnake engine. Linting reports existing unused-code warnings; TypeScript retains the legacy non-strict mode during the staged migration.

## API and debugging

`GET /` returns API v1 appearance metadata. `/start`, `/move`, and `/end` validate current request bodies; moves always return a direction, with a fallback when a strategy throws or returns an invalid or unsafe move. Each game and snake ID gets its own strategy instance and persistent storage; request caches, grid annotations, and logs stay separate from API input. Coordinates use the bottom-left origin (`up` increases `y`).

Debugging is opt in:

```sh
DEBUG_WEBSOCKETS=true DEBUG_LOGS=true RECORD_GAMES=true npm run dev
```

WebSockets listen on the HTTP port plus 10000. Recordings default to `games/`; `GAME_DIRECTORY` overrides that directory. Completed games have JSON filenames containing both game and snake IDs. Compressed per-turn snapshots live under `games/<game>/<snake>_<id>/` for the upstream replay viewer. API v1 recordings declare their bottom-left coordinates, while the legacy renderer continues to display old recordings with their original orientation. Run the AngularJS/PHP dashboard separately with `php -S localhost:9000` from the project root, then open `http://localhost:9000/debug/debug.php`. Its replay viewer supports compressed snapshots and older whole-game JSON files. Its engine controls still target the old engine, and the dashboard is awaiting replacement.

Scoring rejects off-board and occupied squares, distinguishes vacating tails from stacked tails, and avoids squares reachable by equal or longer opponents. The server applies the same immediate collision checks to strategy moves and falls back when possible. Flood-fill and weighted grids cache within each request; LookAhead uses a bounded search with static opponent positions. These checks improve immediate safety without guaranteeing survival over future turns.

After building, run `npm run profile:movement` for a repeatable local scoring/pathfinding timing report. Hazard maps, wrapped boards, and other alternate rulesets need further strategy work before they are supported.
