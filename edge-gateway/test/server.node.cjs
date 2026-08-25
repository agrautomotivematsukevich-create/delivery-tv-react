const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

let createEdgeServer;
try {
  ({ createEdgeServer } = require('../src/server.cjs'));
} catch {
  createEdgeServer = undefined;
}

const operation = {
  containerId: '599AJE17-79GI17',
  action: 'start',
  operator: 'tv tv',
  login: 'tv1',
  zone: 'G3',
  sheetDate: '25.08',
  operationId: '599AJE17-79GI17:start:operation-123',
  token: 'gas-token',
  photos: [
    {
      type: 'container',
      image: 'data:image/jpeg;base64,YQ==',
      mimeType: 'image/jpeg',
      filename: 'general.jpg',
    },
  ],
};

let dataDir;
let server;
let baseUrl;

before(async () => {
  assert.equal(typeof createEdgeServer, 'function', 'edge server factory must exist');
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agr-edge-test-'));
  server = createEdgeServer({
    dataDir,
    encryptionKey: Buffer.alloc(32, 7),
    allowedOrigins: ['https://agrdashboard.vercel.app'],
    pilotContainers: ['599AJE17-79GI17'],
    pilotLogins: ['tv1'],
    autoStartWorker: false,
    validateSession: async (token) => ({
      ok: true,
      tasks: [
        { id: '599AJE17-79GI17', status: 'WAIT', zone: '', start_time: '', end_time: '' },
        ...(token === 'conflict-token'
          ? [{ id: 'OTHER-CONTAINER', status: 'ACTIVE', zone: 'G3', start_time: '10:00', end_time: '' }]
          : []),
      ],
    }),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

  const sessionResponse = await fetch(`${baseUrl}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://agrdashboard.vercel.app' },
    body: JSON.stringify({ token: 'gas-token', login: 'tv1' }),
  });
  assert.equal(sessionResponse.status, 200);
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (dataDir && path.resolve(dataDir).startsWith(path.resolve(os.tmpdir()))) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('persists an accepted operation and returns the same result for an idempotent retry', async () => {
  const first = await fetch(`${baseUrl}/operations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://agrdashboard.vercel.app' },
    body: JSON.stringify(operation),
  });
  assert.equal(first.status, 202);
  assert.deepEqual(await first.json(), {
    status: 'accepted', operationId: operation.operationId,
  });

  const filesAfterFirst = fs.readdirSync(path.join(dataDir, 'operations'));
  assert.equal(filesAfterFirst.length, 1);
  const persisted = fs.readFileSync(path.join(dataDir, 'operations', filesAfterFirst[0]), 'utf8');
  assert.equal(persisted.includes('gas-token'), false, 'the Google token must be encrypted at rest');

  const retry = await fetch(`${baseUrl}/operations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://agrdashboard.vercel.app' },
    body: JSON.stringify(operation),
  });
  assert.equal(retry.status, 202);
  assert.deepEqual(await retry.json(), {
    status: 'accepted', operationId: operation.operationId,
  });
  assert.equal(fs.readdirSync(path.join(dataDir, 'operations')).length, 1);
});

test('rejects a start when the fresh server snapshot shows the zone occupied', async () => {
  const sessionResponse = await fetch(`${baseUrl}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://agrdashboard.vercel.app' },
    body: JSON.stringify({ token: 'conflict-token', login: 'tv1' }),
  });
  assert.equal(sessionResponse.status, 200);

  const response = await fetch(`${baseUrl}/operations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://agrdashboard.vercel.app' },
    body: JSON.stringify({
      ...operation,
      token: 'conflict-token',
      operationId: '599AJE17-79GI17:start:conflict-test',
    }),
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: 'ZONE_OCCUPIED', containerId: 'OTHER-CONTAINER',
  });
  assert.equal(fs.readdirSync(path.join(dataDir, 'operations')).length, 1);
});

test('syncs accepted photos and the task action to Google with the same operationId', async () => {
  const workerDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agr-edge-worker-test-'));
  const gasPayloads = [];
  const workerServer = createEdgeServer({
    dataDir: workerDataDir,
    encryptionKey: Buffer.alloc(32, 9),
    allowedOrigins: ['https://agrdashboard.vercel.app'],
    pilotContainers: ['599AJE17-79GI17'],
    pilotLogins: ['tv1'],
    autoStartWorker: true,
    workerIntervalMs: 10,
    validateSession: async () => ({
      ok: true,
      tasks: [{ id: '599AJE17-79GI17', status: 'WAIT', zone: '', start_time: '', end_time: '' }],
    }),
    gasUrl: 'https://gas.test/exec',
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(String(options.body));
      gasPayloads.push(payload);
      if (payload.mode === 'upload_photo') {
        return new Response(JSON.stringify({
          status: 'SUCCESS', url: `https://drive.test/${payload.photoType}`,
        }), { status: 200 });
      }
      return new Response('UPDATED', { status: 200 });
    },
  });

  try {
    await new Promise((resolve) => workerServer.listen(0, '127.0.0.1', resolve));
    const workerBaseUrl = `http://127.0.0.1:${workerServer.address().port}/v1`;
    await fetch(`${workerBaseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://agrdashboard.vercel.app' },
      body: JSON.stringify({ token: 'worker-token', login: 'tv1' }),
    });
    const accepted = await fetch(`${workerBaseUrl}/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://agrdashboard.vercel.app' },
      body: JSON.stringify({ ...operation, token: 'worker-token', operationId: 'worker-operation-123' }),
    });
    assert.equal(accepted.status, 202);

    let status;
    for (let attempt = 0; attempt < 50; attempt++) {
      const response = await fetch(`${workerBaseUrl}/operations/worker-operation-123`, {
        headers: { Authorization: 'Bearer worker-token', Origin: 'https://agrdashboard.vercel.app' },
      });
      status = await response.json();
      if (status.status === 'synced') break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.equal(status.status, 'synced');
    assert.deepEqual(gasPayloads.map((payload) => payload.mode), ['upload_photo', 'task_action']);
    assert.equal(gasPayloads[0].operationId, 'worker-operation-123');
    assert.equal(gasPayloads[1].operationId, 'worker-operation-123');
    assert.equal(gasPayloads[1].pGen, 'https://drive.test/container');
  } finally {
    await new Promise((resolve) => workerServer.close(resolve));
    if (path.resolve(workerDataDir).startsWith(path.resolve(os.tmpdir()))) {
      fs.rmSync(workerDataDir, { recursive: true, force: true });
    }
  }
});

test('validates a warmed session against the current Google task feed', async () => {
  const validatorDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agr-edge-validator-test-'));
  const gasPayloads = [];
  const validatorServer = createEdgeServer({
    dataDir: validatorDataDir,
    encryptionKey: Buffer.alloc(32, 4),
    allowedOrigins: ['https://agrdashboard.vercel.app'],
    autoStartWorker: false,
    gasUrl: 'https://gas.test/exec',
    fetchImpl: async (_url, options) => {
      gasPayloads.push(JSON.parse(String(options.body)));
      return new Response(JSON.stringify([
        { id: '599AJE17-79GI17', status: 'WAIT', zone: '', start_time: '', end_time: '' },
      ]), { status: 200 });
    },
  });

  try {
    await new Promise((resolve) => validatorServer.listen(0, '127.0.0.1', resolve));
    const validatorBaseUrl = `http://127.0.0.1:${validatorServer.address().port}/v1`;
    const response = await fetch(`${validatorBaseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://agrdashboard.vercel.app' },
      body: JSON.stringify({ token: 'validated-token' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(gasPayloads.length, 1);
    assert.equal(gasPayloads[0].mode, 'get_operator_tasks');
    assert.equal(gasPayloads[0].token, 'validated-token');
  } finally {
    await new Promise((resolve) => validatorServer.close(resolve));
    if (path.resolve(validatorDataDir).startsWith(path.resolve(os.tmpdir()))) {
      fs.rmSync(validatorDataDir, { recursive: true, force: true });
    }
  }
});

test('refuses to warm a Google session for a login outside the pilot', async () => {
  const pilotDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agr-edge-pilot-test-'));
  let validationCalls = 0;
  const pilotServer = createEdgeServer({
    dataDir: pilotDataDir,
    encryptionKey: Buffer.alloc(32, 5),
    allowedOrigins: ['https://agrdashboard.vercel.app'],
    pilotLogins: ['tv1'],
    autoStartWorker: false,
    validateSession: async () => {
      validationCalls += 1;
      return { ok: true, tasks: [] };
    },
  });

  try {
    await new Promise((resolve) => pilotServer.listen(0, '127.0.0.1', resolve));
    const pilotBaseUrl = `http://127.0.0.1:${pilotServer.address().port}/v1`;
    const response = await fetch(`${pilotBaseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://agrdashboard.vercel.app' },
      body: JSON.stringify({ token: 'other-token', login: 'other' }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'NOT_IN_PILOT' });
    assert.equal(validationCalls, 0, 'a non-pilot login must not consume a Google request');
  } finally {
    await new Promise((resolve) => pilotServer.close(resolve));
    if (path.resolve(pilotDataDir).startsWith(path.resolve(os.tmpdir()))) {
      fs.rmSync(pilotDataDir, { recursive: true, force: true });
    }
  }
});

test('refuses the edge path outside the AGM network allowlist', async () => {
  const networkDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agr-edge-network-test-'));
  const networkServer = createEdgeServer({
    dataDir: networkDataDir,
    encryptionKey: Buffer.alloc(32, 3),
    allowedOrigins: ['https://agrdashboard.vercel.app'],
    allowedClientIps: ['203.0.113.10'],
    trustProxy: true,
    autoStartWorker: false,
  });

  try {
    await new Promise((resolve) => networkServer.listen(0, '127.0.0.1', resolve));
    const networkBaseUrl = `http://127.0.0.1:${networkServer.address().port}/v1`;
    const response = await fetch(`${networkBaseUrl}/health`, {
      headers: {
        Origin: 'https://agrdashboard.vercel.app',
        'X-Forwarded-For': '198.51.100.22',
      },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'EDGE_NETWORK_REQUIRED' });
  } finally {
    await new Promise((resolve) => networkServer.close(resolve));
    if (path.resolve(networkDataDir).startsWith(path.resolve(os.tmpdir()))) {
      fs.rmSync(networkDataDir, { recursive: true, force: true });
    }
  }
});

test('does not trust a spoofed X-Forwarded-For over the Cloudflare client IP', async () => {
  const spoofDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agr-edge-spoof-test-'));
  const spoofServer = createEdgeServer({
    dataDir: spoofDataDir,
    encryptionKey: Buffer.alloc(32, 6),
    allowedOrigins: ['https://agrdashboard.vercel.app'],
    allowedClientIps: ['203.0.113.10'],
    trustProxy: true,
    autoStartWorker: false,
  });

  try {
    await new Promise((resolve) => spoofServer.listen(0, '127.0.0.1', resolve));
    const spoofBaseUrl = `http://127.0.0.1:${spoofServer.address().port}/v1`;
    const response = await fetch(`${spoofBaseUrl}/health`, {
      headers: {
        Origin: 'https://agrdashboard.vercel.app',
        'CF-Connecting-IP': '198.51.100.22',
        'X-Forwarded-For': '203.0.113.10',
      },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'EDGE_NETWORK_REQUIRED' });
  } finally {
    await new Promise((resolve) => spoofServer.close(resolve));
    if (path.resolve(spoofDataDir).startsWith(path.resolve(os.tmpdir()))) {
      fs.rmSync(spoofDataDir, { recursive: true, force: true });
    }
  }
});

test('accepts the client IP asserted by the Vercel edge proxy', async () => {
  const vercelDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agr-edge-vercel-test-'));
  const vercelServer = createEdgeServer({
    dataDir: vercelDataDir,
    encryptionKey: Buffer.alloc(32, 8),
    allowedOrigins: ['https://agrdashboard.vercel.app'],
    allowedClientCidrs: ['2a03:d000:104:6309::/64'],
    trustProxy: true,
    autoStartWorker: false,
  });

  try {
    await new Promise((resolve) => vercelServer.listen(0, '127.0.0.1', resolve));
    const vercelBaseUrl = `http://127.0.0.1:${vercelServer.address().port}/v1`;
    const response = await fetch(`${vercelBaseUrl}/health`, {
      headers: {
        Origin: 'https://agrdashboard.vercel.app',
        'X-Vercel-Forwarded-For': '2a03:d000:104:6309:6d08:8cb6:b1b9:c7d4',
        'X-Forwarded-For': '198.51.100.22',
      },
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally {
    await new Promise((resolve) => vercelServer.close(resolve));
    if (path.resolve(vercelDataDir).startsWith(path.resolve(os.tmpdir()))) {
      fs.rmSync(vercelDataDir, { recursive: true, force: true });
    }
  }
});

test('accepts an AGM IPv6 address covered by the configured network prefix', async () => {
  const cidrDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agr-edge-cidr-test-'));
  const cidrServer = createEdgeServer({
    dataDir: cidrDataDir,
    encryptionKey: Buffer.alloc(32, 2),
    allowedOrigins: ['https://agrdashboard.vercel.app'],
    allowedClientIps: ['203.0.113.10'],
    allowedClientCidrs: ['2a03:d000:104:6309::/64'],
    trustProxy: true,
    autoStartWorker: false,
  });

  try {
    await new Promise((resolve) => cidrServer.listen(0, '127.0.0.1', resolve));
    const cidrBaseUrl = `http://127.0.0.1:${cidrServer.address().port}/v1`;
    const response = await fetch(`${cidrBaseUrl}/health`, {
      headers: {
        Origin: 'https://agrdashboard.vercel.app',
        'CF-Connecting-IP': '2a03:d000:104:6309:6d08:8cb6:b1b9:c7d4',
      },
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  } finally {
    await new Promise((resolve) => cidrServer.close(resolve));
    if (path.resolve(cidrDataDir).startsWith(path.resolve(os.tmpdir()))) {
      fs.rmSync(cidrDataDir, { recursive: true, force: true });
    }
  }
});
