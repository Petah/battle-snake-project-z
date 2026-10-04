# Project Z

A local workspace for building and testing Battlesnake strategies. Play matches in the browser, inspect recorded games, and compare strategies with automated leagues and rankings over time.

## Quick start

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. This starts the dashboard and snake servers with automatic reloads.

To play matches, install the [Battlesnake Rules CLI](docs/development.md#local-games), then choose players in the **Play** tab and click **Start match**. Matches are recorded automatically; use **Recordings** to replay turns and inspect board scores.

See [local development](docs/development.md) for setup, configuration, and debugging.

## Compare strategies

With the Rules CLI installed:

```sh
npm run evaluate
```

The evaluator starts the snakes, runs a league, and saves an Elo report. Open `evaluations/latest.html` or the dashboard's **Rankings** tab to see results and chart progress across runs.

To evaluate a smaller selection:

```sh
npm run evaluate -- --snakes "<name-a>,<name-b>" --rounds 5
```

Use names from the [server registry](src/server/snakes.ts). Ratings are calculated independently for each run. See [evaluation and rankings](docs/evaluation.md) for options, report retention, and how to compare results.

## Development

Strategies live in [src/server/snakes/](src/server/snakes/), shared movement logic in [src/lib/](src/lib/), and the dashboard UI in [ui/](ui/).

Run the checks before submitting changes:

```sh
npm run typecheck
npm run lint
npm test
```

Standard games are the supported target; alternate rulesets need further strategy work.

## Documentation

- [Local development](docs/development.md) — configuration, recordings, debugging, and builds.
- [Evaluation and rankings](docs/evaluation.md) — league options, metrics, and comparisons over time.
- [Deployment](docs/deployment.md) — hosting, service configuration, logging, and retention.
