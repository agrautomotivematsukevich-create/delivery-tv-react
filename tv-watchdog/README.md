# TV Watchdog Diagnostics

Small local diagnostics server for Android TV dashboard heartbeat logging.

This is diagnostics only. It does not run ADB commands, reopen browsers, restart apps, shell commands, or call Google Apps Script.

The production server uses the Node.js version: `server.js`. It uses only built-in Node modules.

## Start

```bash
cd tv-watchdog
node server.js
```

Default config lives in `config.json`:

```json
{
  "host": "0.0.0.0",
  "port": 8787,
  "offlineThresholdSeconds": 300
}
```

Environment variables override the file:

```bash
TV_WATCHDOG_HOST=0.0.0.0
TV_WATCHDOG_PORT=8787
TV_WATCHDOG_OFFLINE_THRESHOLD_SECONDS=180
```

## Frontend Env

Point the dashboard build at this server:

```bash
VITE_TV_DIAG_URL=http://SERVER_IP:8787
```

Do not use `127.0.0.1` for the TV unless the server is running on the TV itself. Use the local server IP that the TV can reach over LAN.

## Status

Open:

```text
http://SERVER_IP:8787/
http://SERVER_IP:8787/api/tv/status
```

The HTML page refreshes every 30 seconds. The JSON endpoint is better for saving evidence.

## Stored Data

Runtime logs:

```text
tv-watchdog/logs/heartbeat.jsonl
tv-watchdog/logs/events.jsonl
tv-watchdog/logs/server.jsonl
```

These runtime files are ignored by git. Status is kept in memory and restored from recent JSONL records on startup.

## Interpretation

- Heartbeat stops without recent events: TV sleep, browser crash, Android kill, power loss, reboot, or network loss are still possible. Use this as the exact cutoff time.
- Last event is `visibilitychange` with `hidden`: browser/page left foreground before heartbeat stopped.
- Last event is `pagehide` or `beforeunload`: page was unloaded or browser/navigation closed it.
- Last event is `offline`: TV/browser reported network loss.
- Last error is `error` or `unhandledrejection`: inspect message/stack and compare with the cutoff.
- Heartbeat continues but `lastSuccessfulDataAt` is old: page is alive, but dashboard data refresh is failing or stalled.

## After One Night

Collect:

```text
tv-watchdog/logs/heartbeat.jsonl
tv-watchdog/logs/events.jsonl
```

Also save a screenshot of `http://SERVER_IP:8787/` and the JSON from `/api/tv/status`.
