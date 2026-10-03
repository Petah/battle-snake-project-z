# Project Z upgrade checklist

Based on the project review on 2 October 2026. Work in the order below: get one snake playing standard games, migrate the remaining strategies, restore the dashboard, then expand map support.

## 1. Establish a reproducible build

- [x] Preserve existing local changes in `src/lib/smartRandomMove.ts` and `public/` before restructuring. The NN experiment was explicitly approved for removal.
- [x] Pin Node 24 LTS and align `engines`, development setup, and Node type definitions.
- [x] Upgrade TypeScript and replace the `files` glob in `tsconfig.json` with `include`. Use TypeScript 6.0 while typescript-eslint does not support 7.0.
- [x] Make `src/` the source of truth; upstream removed the legacy root JavaScript entrypoints and esbuild/TypeScript generate the current outputs.
- [x] Replace Gulp/Browserify with TypeScript compilation and esbuild for the browser bundle.
- [x] Replace TSLint and the unused legacy ESLint configuration with ESLint/typescript-eslint. Existing unused-code warnings remain for later cleanup.
- [x] Add `build`, `start`, `dev`, `typecheck`, and `lint` scripts.
- [x] Add a `test` script with native Node API and movement regression tests.
- [x] Upgrade retained dependencies, remove redundant tooling, and replace `forever` with foreground Node execution and tsx during development. Keep the weighted pathfinding fork pinned to its original commit.
- [x] Regenerate the lockfile and rerun the dependency audit. The upgraded lockfile reports zero vulnerabilities across runtime and development packages.
- [x] Verify a clean dependency install and build without relying on existing `dist/` files, using Node 24.

Review evidence: the available compiler failed with TS6053 because `files` contains `src/**/*.ts`. The lockfile audit reported 85 affected packages, including 19 critical and 36 high findings across runtime and development dependencies.

## 2. Migrate one snake to the current Battlesnake API

- [x] Upgrade Express and its types; replace the incompatible `app.use('*', ...)` catch-all with middleware without a mounted path.
- [x] Implement `GET /` returning JSON with `apiversion: "1"`, `color`, `head`, `tail`, and optional author/version metadata.
- [x] Move appearance settings out of `/start`; replace legacy `headType` and `tailType` fields.
- [x] Keep `/start` and `/end` for initialization and cleanup, with prompt successful responses.
- [x] Update request types for game ruleset/settings, map, timeout, hazards, and current snake fields.
- [x] Separate incoming API data from internal caches and debug logs.
- [x] Validate request bodies and route errors to a handler that always completes the response.
- [x] Guarantee that `/move` returns a valid direction, including when strategies fail or find no safe moves.
- [x] Make the selected snake and HTTP port configurable for running one snake independently.

## 3. Fix movement and scoring correctness

- [x] Centralise direction-to-coordinate conversion: current Battlesnake uses `up = y + 1` and `down = y - 1`.
- [x] Update pathfinding, random movement, smart random movement, and other directional helpers to use the shared conversion.
- [x] Reject out-of-bounds coordinates before applying scoring bonuses.
- [x] Fix flood-fill caching so occupied and out-of-bounds squares do not inherit free-region counts.
- [x] Make collision and tail handling consistent with simultaneous movement and duplicated tail segments during growth.
- [x] Review head-to-head decisions against equal-length and longer opponents.
- [x] Retain the pinned custom pathfinding fork and verify weighted-cost behaviour when cloning cached grids.
- [x] Profile flood-fill and pathfinding; keep responses comfortably within `game.timeout`.

Review evidence: a targeted check scored the off-board square `(-1, 0)` as 75 and returned a cached free-space count of 6 for an occupied square. Vertical movement was reversed relative to the current API and has now been corrected.

## 4. Restore local games and migrate all strategies

- [x] Pin Rules CLI v1.2.3 in the documented local workflow; download and checksum-verify a temporary executable for validation.
- [x] Document CLI commands that replace the legacy PHP/`engine` workflow for local games. Dashboard engine controls remain pending in section 5.
- [x] Run one snake in a standard solo game, then a standard multiplayer match.
- [x] Add seeded match commands for repeatable comparisons.
- [x] Migrate and verify all ten registered snake variants, including upstream LookAhead.
- [x] Store mutable strategy state per game ID so concurrent games do not interfere.
- [x] Key recordings by game ID and snake ID rather than snake ID alone.
- [x] Handle missing start state, duplicate lifecycle requests, and cleanup after games.
- [x] Make logging and WebSocket broadcasting optional; keep them outside critical move computation where practical.

## 5. Restore and modernise the debug dashboard

- [ ] Replace unsupported AngularJS with a lightweight TypeScript UI.
- [ ] Replace PHP debug pages with a Node-served dashboard and remove unnecessary CDN dependencies.
- [ ] Replace calls to the old engine API with a supported local match workflow.
- [x] Update board rendering for the bottom-left coordinate origin.
- [ ] Keep browser configuration separate from server strategy imports.
- [ ] Make HTTP/WebSocket URLs configurable and handle disconnected clients cleanly.
- [ ] Review recording writes, permissions, and the destructive recording-delete endpoint before exposing the dashboard.
- [x] Retain existing legacy recordings and support their original top-left orientation in the renderer; label new JSON recordings and compressed per-turn snapshots API v1/bottom-left. Replay links retain the actual recording filename.
- [x] Add automated browser-bundle checks for legacy and API v1 coordinates, hazards, body arrows, and empty selections.
- [x] Remove the neural-network experiment, its PHP page, generated outputs, network directory, and old references, as requested.

## 6. Verify and document the upgraded project

- [x] Add focused checks for API metadata, lifecycle responses, malformed input, and valid move responses.
- [x] Add direction and fallback-boundary regression checks.
- [x] Add scoring-boundary, flood-fill caching, tail growth, and head-collision regression checks alongside their fixes.
- [x] Verify simultaneous games do not share strategy state or overwrite recordings.
- [x] Run seeded CLI matches and measure move latency for each strategy.
- [ ] Add CI for clean installation, typechecking, linting, tests, and building.
- [x] Rewrite the README with prerequisites, setup, snake selection, ports, match commands, debugging, and deployment instructions.
- [x] Document standard games as the initial supported target.
- [ ] Add hazard-aware scoring and health planning before supporting Royale or other hazard maps.
- [ ] Add map/ruleset-specific movement and collision handling before supporting alternate modes.

## Official documentation

- [Battlesnake webhooks and responses](https://docs.battlesnake.com/api/webhooks)
- [Board coordinates and hazards](https://docs.battlesnake.com/api/objects/board)
- [Game metadata and timeout](https://docs.battlesnake.com/api/objects/game)
- [Battlesnake object](https://docs.battlesnake.com/api/objects/battlesnake)
- [Ruleset settings](https://docs.battlesnake.com/api/objects/ruleset-settings)
- [Game rules and turn resolution](https://docs.battlesnake.com/rules)
- [Local Rules CLI](https://github.com/BattlesnakeOfficial/rules/blob/main/cli/README.md)
- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [Express 5 migration](https://expressjs.com/en/guide/migrating-5/)
- [TypeScript include configuration](https://www.typescriptlang.org/tsconfig/include.html)
- [typescript-eslint setup](https://typescript-eslint.io/getting-started/)
- [esbuild documentation](https://esbuild.github.io/)
- [AngularJS support status](https://angularjs.org/)

## Review limits

The initial review covered source inspection, current official documentation, a lockfile audit, a compiler configuration check, and targeted scoring checks. The dependency/build upgrade and NN removal are now complete. Verified a clean install, compilation, linting (zero errors; existing warnings), nine server startups, HTTP lifecycle/move requests, WebSocket events, and weighted pathfinding under Node 24. The API migration now passes 18 automated checks, typechecking, and linting (zero errors; 28 legacy warnings). Verified single-snake configuration, invalid configuration failures, optional WebSockets, and a solo game through turn 351. All nine strategies completed standard 11x11 matches with Rules CLI v1.2.3 at seeds 42 and 99 (final turns 292 and 142), without engine communication errors. Maximum reported move latency was 51 ms against a 500 ms timeout. This is local compatibility evidence, not comprehensive strategy or alternate-map validation. The subsequent scoring and collision stage is recorded below; the next stage is dashboard modernisation.

## Upstream merge

Fetched and integrated 44 previously missing commits through `27a2ffb` (`Tail stack`). Preserved the Node 24 / Express 5 / TypeScript 6 build, NN removal, API v1 validation/fallbacks, and game isolation. Adapted upstream strategy storage, state functions, squad-aware food selection, hazard weighting, LookAhead, ranking scraper, and debug viewer to the current build. Browser-safe MD5 preserves the upstream ID ordering; the scraper uses native Node fetch with current Cheerio. Both old whole-game JSON and compressed per-turn replays remain readable.

Post-merge validation: 25 automated checks pass, along with typechecking, the browser build, and PHP syntax/render smoke checks. Lint has zero errors and 37 legacy unused-code warnings. The dependency audit reports zero vulnerabilities. Standard 11x11 games at seeds 42 and 99 completed with all ten snakes (final turns 164 and 184), without engine communication errors. Maximum reported latency was 274 ms against a 500 ms timeout. This replaces the earlier nine-snake match baseline above; scoring, collision, and alternate-map work remains pending.

## Movement and scoring fixes

Completed section 3 after the upstream merge. Off-board scoring returns zero before accessing grid annotations. Flood-fill caches only connected free cells, preserves zero for occupied cells, and uses a queue with a visited set. Movement helpers, scoring, pathfinding, and server fallback share next-turn body occupancy: unique tails vacate, duplicated tails remain blocked, and old heads become body segments. Squad body overlap requires the active ruleset and explicit permission. Head-to-head checks consider reachable squares for equal or longer opponents, excluding blocked reversals. The server replaces unsafe strategy moves when a safer direction is available.

Weighted pathfinding caches grids per request and scoring options, then clones nodes and costs for each search. LookAhead simulates food consumption and tail stacking without mutating API input, and caps recursive search at the smaller of 50 ms or one quarter of the request timeout. Its opponent positions remain a static heuristic; this is not a complete multiplayer simulator or support for alternate maps.

Validation: 37 regression checks pass, including weighted clone behaviour, repeated independent paths, body/tail collisions, flood-fill query order, head threats, and server fallback. Build/typecheck pass; lint has zero errors and 30 legacy warnings. All ten snakes completed standard 11x11 matches at seeds 42 and 99 (final turns 279 and 393), with no engine communication errors and maximum reported move latency of 28 ms against a 500 ms timeout. These are local samples; random strategies remain stochastic.

`npm run profile:movement` measures a full-board scoring pass plus three weighted paths, using 50 samples after warm-up. Local median/p95 times were 0.35/0.69 ms for 11x11, 0.69/1.16 ms for 19x19, and 1.11/2.00 ms for 25x25. This is a repeatable synthetic workload, not a worst-case timing guarantee. Build before profiling.
