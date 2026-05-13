const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const os = require('os');

const ROOT = __dirname;
const LOGS_DIR = path.join(ROOT, 'logs');
const DATA_DIR = path.join(ROOT, 'data');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const HEARTBEAT_LOG = path.join(LOGS_DIR, 'heartbeat.jsonl');
const EVENTS_LOG = path.join(LOGS_DIR, 'events.jsonl');
const SERVER_LOG = path.join(LOGS_DIR, 'server.jsonl');
const MAX_EVENTS = 10;
const SERVER_TIMEZONE = 'Europe/Moscow';

const state = {
  lastHeartbeat: null,
  lastEvents: [],
  lastError: null,
  knownClients: new Map(),
};

function nowIso() {
  return new Date().toISOString();
}

function formatMoscowTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SERVER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} MSK`;
}

function serverTimestamps() {
  const now = new Date();
  const utc = now.toISOString();
  return {
    serverReceivedAt: utc,
    serverReceivedAtUtc: utc,
    serverReceivedAtMoscow: formatMoscowTime(now),
    serverTimezone: SERVER_TIMEZONE,
  };
}

function ensureDirs() {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadConfig() {
  const defaults = {
    host: '0.0.0.0',
    port: 8787,
    offlineThresholdSeconds: 300,
  };

  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (error) {
    fileConfig = {};
  }

  return {
    host: process.env.TV_WATCHDOG_HOST || fileConfig.host || defaults.host,
    port: Number(process.env.TV_WATCHDOG_PORT || fileConfig.port || defaults.port),
    offlineThresholdSeconds: Number(
      process.env.TV_WATCHDOG_OFFLINE_THRESHOLD_SECONDS ||
        fileConfig.offlineThresholdSeconds ||
        fileConfig.offline_threshold_seconds ||
        defaults.offlineThresholdSeconds,
    ),
  };
}

const config = loadConfig();

function appendJsonl(filePath, record) {
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function logServer(message, extra = {}) {
  try {
    appendJsonl(SERVER_LOG, { ...serverTimestamps(), message, ...extra });
  } catch (error) {
    // Logging must never crash the diagnostics server.
  }
}

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch (error) {
    return null;
  }
}

function readLastJsonlRecords(filePath, limit) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.slice(Math.max(0, lines.length - limit)).map(safeJsonParse).filter(Boolean);
  } catch (error) {
    return [];
  }
}

function clientKey(payload) {
  return payload.clientId || `legacy|${payload.tvMode || 'unknown'}|${payload.url || ''}`;
}

function rememberClient(payload) {
  const key = clientKey(payload);
  const existing = state.knownClients.get(key);
  state.knownClients.set(key, {
    clientId: payload.clientId || key,
    clientLabel: payload.clientLabel || payload.clientId || key,
    tvMode: payload.tvMode || 'unknown',
    url: payload.url || '',
    userAgent: payload.userAgent || '',
    lastSeenAt: payload.serverReceivedAt,
    lastSeenAtMoscow: payload.serverReceivedAtMoscow || '',
    heartbeatCount: (existing?.heartbeatCount || 0) + 1,
  });
}

function hydrateStateFromLogs() {
  const heartbeats = readLastJsonlRecords(HEARTBEAT_LOG, 100);
  for (const heartbeat of heartbeats) {
    state.lastHeartbeat = heartbeat;
    rememberClient(heartbeat);
  }

  const events = readLastJsonlRecords(EVENTS_LOG, MAX_EVENTS);
  state.lastEvents = events.reverse();
  state.lastError = state.lastEvents.find((event) => (
    event.eventType === 'error' || event.eventType === 'unhandledrejection'
  )) || null;
}

function secondsSince(timestamp) {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000));
}

function getStatus() {
  const seconds = secondsSince(state.lastHeartbeat?.serverReceivedAt);
  const utc = nowIso();
  return {
    serverTime: utc,
    serverTimeUtc: utc,
    serverTimeMoscow: formatMoscowTime(),
    serverTimezone: SERVER_TIMEZONE,
    hostname: os.hostname(),
    lastHeartbeat: state.lastHeartbeat,
    secondsSinceLastHeartbeat: seconds,
    offline: seconds === null || seconds > config.offlineThresholdSeconds,
    offlineThresholdSeconds: config.offlineThresholdSeconds,
    lastEvents: state.lastEvents,
    lastError: state.lastError,
    knownClients: Array.from(state.knownClients.values())
      .map((client) => ({
        ...client,
        secondsSinceLastHeartbeat: secondsSince(client.lastSeenAt),
      }))
      .sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)))
      .slice(0, 20),
  };
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAgo(seconds) {
  if (seconds === null || seconds === undefined) return 'never';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
}

function renderStatusHtml() {
  const status = getStatus();
  const hb = status.lastHeartbeat || {};
  const event = status.lastEvents[0] || {};
  const error = status.lastError || {};
  const viewport = hb.viewport || {};
  const app = hb.app || {};
  const rows = [
    ['Server time (MSK)', status.serverTimeMoscow],
    ['UTC', status.serverTimeUtc],
    ['Server timezone', status.serverTimezone],
    ['Status', status.offline ? 'OFFLINE by threshold' : 'heartbeat fresh'],
    ['Last heartbeat', formatAgo(status.secondsSinceLastHeartbeat)],
    ['Client ID', hb.clientId],
    ['Client label', hb.clientLabel],
    ['TV mode', hb.tvMode],
    ['URL', hb.url],
    ['User agent', hb.userAgent],
    ['Visibility', hb.visibilityState],
    ['Online', hb.online],
    ['Viewport', `${viewport.width ?? ''}x${viewport.height ?? ''} @ ${viewport.devicePixelRatio ?? ''}`],
    ['Page uptime ms', hb.pageUptimeMs],
    ['Last data success', hb.lastSuccessfulDataAt],
    ['Last event', event.eventType],
    ['Last error', error.message || error.reason],
    ['App', `${app.name || ''} ${app.version || ''}`.trim()],
  ];
  const table = rows
    .map(([label, value]) => `<tr><th>${htmlEscape(label)}</th><td>${htmlEscape(value)}</td></tr>`)
    .join('');
  const known = status.knownClients
    .map((client) => `<li>${htmlEscape(client.clientLabel || client.clientId)} | ${htmlEscape(client.tvMode)} | last heartbeat ${htmlEscape(formatAgo(client.secondsSinceLastHeartbeat))} | ${htmlEscape(client.url)}</li>`)
    .join('') || '<li>none yet</li>';
  const pillClass = status.offline ? 'bad' : 'ok';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="30">
  <title>TV Watchdog Status</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #111827; color: #e5e7eb; }
    h1 { margin-bottom: 8px; }
    .pill { display: inline-block; padding: 6px 10px; border-radius: 6px; font-weight: 700; }
    .ok { background: #065f46; color: #d1fae5; }
    .bad { background: #991b1b; color: #fee2e2; }
    table { border-collapse: collapse; margin-top: 18px; width: 100%; max-width: 1100px; }
    th, td { border-bottom: 1px solid #374151; padding: 10px; text-align: left; vertical-align: top; }
    th { width: 220px; color: #9ca3af; }
    code { color: #93c5fd; }
  </style>
</head>
<body>
  <h1>TV Watchdog Status</h1>
  <div class="pill ${pillClass}">${htmlEscape(rows[1][1])}</div>
  <table>${table}</table>
  <h2>Known TV clients</h2>
  <ul>${known}</ul>
  <p>JSON: <code>/api/tv/status</code></p>
</body>
</html>`;
}

function send(res, statusCode, contentType, body) {
  const payload = Buffer.from(body);
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': payload.length,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function sendJson(res, statusCode, payload) {
  send(res, statusCode, 'application/json; charset=utf-8', JSON.stringify(payload, null, 2));
}

function readRequestJson(req, callback) {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 1024 * 1024) {
      req.destroy();
    }
  });
  req.on('end', () => {
    if (!raw) {
      callback(null, {});
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      callback(null, parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null);
    } catch (error) {
      callback(error);
    }
  });
}

function handleHeartbeat(payload, res) {
  const record = { ...payload, ...serverTimestamps() };
  state.lastHeartbeat = record;
  rememberClient(record);
  appendJsonl(HEARTBEAT_LOG, record);
  sendJson(res, 200, { ok: true, serverReceivedAt: record.serverReceivedAt });
}

function handleEvent(payload, res) {
  const record = { ...payload, ...serverTimestamps() };
  state.lastEvents.unshift(record);
  state.lastEvents = state.lastEvents.slice(0, MAX_EVENTS);
  if (record.eventType === 'error' || record.eventType === 'unhandledrejection') {
    state.lastError = record;
  }
  appendJsonl(EVENTS_LOG, record);
  sendJson(res, 200, { ok: true, serverReceivedAt: record.serverReceivedAt });
}

function requestHandler(req, res) {
  const parsedUrl = url.parse(req.url || '/');
  const pathname = parsedUrl.pathname || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && pathname === '/') {
    send(res, 200, 'text/html; charset=utf-8', renderStatusHtml());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/tv/status') {
    sendJson(res, 200, getStatus());
    return;
  }

  if (req.method === 'POST' && (pathname === '/api/tv/heartbeat' || pathname === '/api/tv/event')) {
    readRequestJson(req, (error, payload) => {
      if (error || !payload) {
        sendJson(res, 400, { error: 'invalid_json' });
        return;
      }

      try {
        if (pathname === '/api/tv/heartbeat') handleHeartbeat(payload, res);
        else handleEvent(payload, res);
      } catch (writeError) {
        logServer('write_failed', { path: pathname, error: String(writeError && writeError.stack || writeError) });
        sendJson(res, 500, { error: 'write_failed' });
      }
    });
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

ensureDirs();
hydrateStateFromLogs();

const server = http.createServer(requestHandler);
server.listen(config.port, config.host, () => {
  const message = `TV watchdog listening on http://${config.host}:${config.port}`;
  logServer('started', { host: config.host, port: config.port });
  console.log(message);
});

process.on('SIGINT', () => {
  logServer('stopped', { signal: 'SIGINT' });
  process.exit(0);
});

process.on('SIGTERM', () => {
  logServer('stopped', { signal: 'SIGTERM' });
  process.exit(0);
});
