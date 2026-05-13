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
  "offlineThresholdSeconds": 300,
  "clientLabels": {
    "tv-client-xxxx": "TV sklad left",
    "tv-client-yyyy": "TV sklad right"
  }
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

- Each physical TV gets a persistent `clientId` stored in browser localStorage under `agr_tv_diagnostics_client_id`. Two TVs can open the same dashboard URL and still appear as different clients.
- Optional `tvClient` query value is used only as `clientLabel`; it is not required. If absent, `clientLabel` equals `clientId`.
- The Known TV clients table groups by `clientId`, not by URL, so two TVs can use the same `https://agrdashboard.vercel.app/?tv=1` link.
- The strongest real-TV signal is the authenticated login. `Likely TV` is true when login is `TV`, `TV1`, or `TV2`; any other login is treated as a regular user even on `?tv=1`.
- If login is not known yet, `Likely TV` falls back to a UI hint based on Android/TV/Yandex/Linux-like user agents with a large viewport, and false for obvious Windows desktop browsers.
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

## Naming Two Physical TVs

1. Open the same dashboard link on both TVs:

```text
https://agrdashboard.vercel.app/?tv=1
```

2. Wait for at least one heartbeat from each TV.
3. Open the watchdog page:

```text
http://SERVER_IP:8787/
```

4. In Known TV clients, find the two Android/TV-like rows and copy their `clientId` values.
5. Add friendly names to `config.json`:

```json
{
  "clientLabels": {
    "tv-client-a1b2c3": "TV sklad left",
    "tv-client-d4e5f6": "TV sklad right"
  }
}
```

6. Restart only this PM2 process:

```bash
pm2 restart tv-watchdog
```

Do not run `pm2 save` unless you intentionally want to update the saved PM2 process list.
