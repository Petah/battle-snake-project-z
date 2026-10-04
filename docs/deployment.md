# Deployment

The files in [deploy/](../deploy/) are example systemd and Caddy configurations. Replace `snake.example.com` with your hostname and adjust runtime paths and the release version before installing them.

The example proxy exposes the default strategy at `https://snake.example.com/` and individual strategies at `/snakes/<name>`. See the [proxy configuration](../deploy/starter-snake-node.caddy) for the available routes.

Keep the dashboard bound to the server's loopback interface and access it through an SSH tunnel. Replace the username and hostname in this example:

```sh
ssh -N -L 19000:127.0.0.1:9000 user@server.example.com
```

Then visit **http://localhost:19000**. Matches execute on the server; the example services store recordings in `/var/lib/battlesnake/games` and read evaluation history from `/var/lib/battlesnake/evaluations`. Local evaluation reports are not uploaded automatically.

Run the application as a dedicated `battlesnake` user, with automatic startup/restarts and memory/CPU limits. The service files define the runtime and executable paths; adjust those paths to match your installation. Download the Linux executables from their official releases and verify their checksums. Point `/srv/starter-snake-node/current` to the compiled release directory.

Inspect application services and logs with:

```sh
systemctl status battlesnake-snakes battlesnake-dashboard
journalctl -u battlesnake-snakes -u battlesnake-dashboard -n 100
```

Back up the existing Caddyfile before importing `/etc/caddy/starter-snake-node.caddy`. Validate the combined configuration before reloading Caddy. Preserve the import if another tool regenerates the main Caddyfile.

For future releases, upload `dist/`, `dashboard-dist/`, and the package manifests into a new release directory, install production dependencies using the isolated Node runtime (`npm ci --omit=dev --ignore-scripts`), update `current` to that release, set `BATTLESNAKE_VERSION` in the snake service, and restart only the two Battlesnake services. Keep the previous release for rollback; point `current` back to it and restart those services if verification fails.

Verify public API metadata, lifecycle requests, a seeded CLI match, dashboard access through the tunnel, and the health of any other hosted applications after deployment.

## Logging and recording retention

Successful HTTP requests are not logged when `NODE_ENV=production`; HTTP errors and strategy exceptions remain visible in the service journal. Set `REQUEST_LOGS=true` to temporarily enable all request logs. The example snake service enables `RECORD_GAMES=true` to save incoming Arena games as compressed per-turn snapshots plus a complete JSON recording on `/end`; `DEBUG_LOGS` is disabled. Find these games by game ID in the dashboard's Recordings tab. Recording starts only after this setting is enabled; earlier games cannot be recovered from the server.

Production dashboard recordings are kept for **7 days**, with a **1 GiB** storage target. Cleanup runs at startup, every five minutes, and when a match ends or stops. It deletes expired recordings first, then the oldest completed recordings until total recording bytes fit the limit; active CLI files are skipped. A running match is stopped if its recording exceeds **100 MiB**, bounding active writers as well. Limits are checked periodically, so writes can briefly exceed them between checks. Cleanup only selects recording files or snapshot directories under the configured games directory and does not follow symlinks.

Set `RECORDING_RETENTION_DAYS` and `RECORDING_MAX_BYTES` to override retention. Development dashboards do not delete recordings automatically unless these variables are supplied. The example dashboard service sets them explicitly to `7` and `1073741824`. This policy does not alter server-wide logging settings.

[Back to README](../README.md)
