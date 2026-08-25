const fs = require('node:fs');
const path = require('node:path');
const { createEdgeServer } = require('./server.cjs');

const root = path.resolve(__dirname, '..');
const envPath = process.env.EDGE_ENV_FILE || path.join(root, 'config', '.env');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

function list(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8897);
const server = createEdgeServer({
  dataDir: process.env.DATA_DIR || path.join(root, 'data'),
  encryptionKey: process.env.EDGE_ENCRYPTION_KEY || '',
  gasUrl: process.env.GAS_URL || '',
  allowedOrigins: list('ALLOWED_ORIGINS'),
  allowedClientIps: list('ALLOWED_CLIENT_IPS'),
  allowedClientCidrs: list('ALLOWED_CLIENT_CIDRS'),
  pilotContainers: list('PILOT_CONTAINERS'),
  pilotLogins: list('PILOT_LOGINS'),
  trustProxy: process.env.TRUST_PROXY === 'true',
  workerIntervalMs: Number(process.env.WORKER_INTERVAL_MS || 1000),
  autoStartWorker: true,
});

server.listen(port, host, () => {
  console.log(`[agr-terminal-edge] listening on ${host}:${port}`);
});

function shutdown(signal) {
  console.log(`[agr-terminal-edge] ${signal}, closing`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
