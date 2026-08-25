const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const DEFAULT_BODY_LIMIT = 5 * 1024 * 1024;

function json(res, statusCode, body, origin, allowedOrigins) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(body));
}

function readJson(req, limit = DEFAULT_BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('BODY_TOO_LARGE'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('INVALID_JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function tokenDigest(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeIp(value) {
  const ip = String(value || '').trim();
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function firstForwardedIp(value) {
  return String(value || '').split(',')[0].trim();
}

function ipToBytes(value) {
  let ip = normalizeIp(value).toLowerCase().split('%')[0];
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.some((part) => part < 0 || part > 255)) return null;
    return Buffer.from(parts);
  }

  if (ip.includes('.')) {
    const lastColon = ip.lastIndexOf(':');
    const ipv4 = ipToBytes(ip.slice(lastColon + 1));
    if (!ipv4 || ipv4.length !== 4) return null;
    ip = `${ip.slice(0, lastColon)}:${ipv4.readUInt16BE(0).toString(16)}:${ipv4.readUInt16BE(2).toString(16)}`;
  }

  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = halves.length === 2
    ? [...head, ...Array(missing).fill('0'), ...tail]
    : head;
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  const bytes = Buffer.alloc(16);
  groups.forEach((group, index) => bytes.writeUInt16BE(parseInt(group, 16), index * 2));
  return bytes;
}

function cidrContains(cidr, value) {
  const [network, prefixText] = String(cidr).split('/');
  const networkBytes = ipToBytes(network);
  const valueBytes = ipToBytes(value);
  if (!networkBytes || !valueBytes || networkBytes.length !== valueBytes.length) return false;
  const prefix = prefixText === undefined ? networkBytes.length * 8 : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > networkBytes.length * 8) return false;
  const fullBytes = Math.floor(prefix / 8);
  for (let index = 0; index < fullBytes; index++) {
    if (networkBytes[index] !== valueBytes[index]) return false;
  }
  const remainingBits = prefix % 8;
  if (!remainingBits) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (networkBytes[fullBytes] & mask) === (valueBytes[fullBytes] & mask);
}

function operationPath(operationsDir, operationId) {
  const digest = crypto.createHash('sha256').update(operationId).digest('hex');
  return path.join(operationsDir, `${digest}.json`);
}

function encryptToken(token, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    encryptedToken: encrypted.toString('base64'),
    tokenIv: iv.toString('base64'),
    tokenTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptToken(record, key) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(record.tokenIv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(record.tokenTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.encryptedToken, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function persistRecord(filePath, record) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const fd = fs.openSync(temporaryPath, 'wx');
  try {
    fs.writeFileSync(fd, JSON.stringify(record));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporaryPath, filePath);
}

function readRecord(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeTasks(tasks) {
  return Array.isArray(tasks) ? tasks.map((task) => ({
    id: String(task.id || '').trim(),
    status: String(task.status || ''),
    zone: String(task.zone || '').trim().toUpperCase(),
    start_time: String(task.start_time || ''),
    end_time: String(task.end_time || ''),
  })) : [];
}

function findZoneConflict(tasks, containerId, zone) {
  const normalizedZone = zone.trim().toUpperCase();
  return tasks.find((task) => task.id !== containerId
    && task.zone === normalizedZone
    && Boolean(task.start_time)
    && !task.end_time);
}

function validateOperation(input) {
  const required = ['containerId', 'action', 'operator', 'login', 'operationId', 'token'];
  if (required.some((key) => typeof input[key] !== 'string' || !input[key].trim())) return 'INVALID_INPUT';
  if (input.operationId.length > 240 || input.containerId.length > 128 || input.login.length > 64) return 'INVALID_INPUT';
  if (!Array.isArray(input.photos) || input.photos.length > 3) return 'INVALID_PHOTOS';
  for (const photo of input.photos) {
    if (!photo || !['container', 'seal', 'unloaded'].includes(photo.type)) return 'INVALID_PHOTOS';
    if (typeof photo.image !== 'string' || !photo.image.startsWith('data:image/')) return 'INVALID_PHOTOS';
    if (typeof photo.mimeType !== 'string' || typeof photo.filename !== 'string') return 'INVALID_PHOTOS';
  }
  if (input.action.startsWith('start') && !String(input.zone || '').trim()) return 'INVALID_ZONE';
  return '';
}

async function postToGas(gasUrl, payload, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GAS_HTTP_${response.status}`);
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function createEdgeServer(options = {}) {
  const dataDir = path.resolve(options.dataDir || path.join(process.cwd(), 'data'));
  const operationsDir = path.join(dataDir, 'operations');
  const encryptionKey = Buffer.isBuffer(options.encryptionKey)
    ? options.encryptionKey
    : Buffer.from(options.encryptionKey || '', 'base64');
  if (encryptionKey.length !== 32) throw new Error('EDGE_ENCRYPTION_KEY must decode to 32 bytes');

  const allowedOrigins = new Set(options.allowedOrigins || []);
  const allowedClientIps = new Set((options.allowedClientIps || []).map(normalizeIp));
  const allowedClientCidrs = options.allowedClientCidrs || [];
  const trustProxy = options.trustProxy === true;
  const pilotContainers = new Set(options.pilotContainers || []);
  const pilotLogins = new Set(options.pilotLogins || []);
  const gasUrl = options.gasUrl || '';
  const fetchImpl = options.fetchImpl || fetch;
  const workerIntervalMs = options.workerIntervalMs || 1000;
  const requestLogger = typeof options.requestLogger === 'function' ? options.requestLogger : null;
  const validateSession = options.validateSession || (async (token) => {
    if (!gasUrl) return { ok: false, tasks: [] };
    try {
      const response = await postToGas(gasUrl, {
        mode: 'get_operator_tasks',
        token,
      }, fetchImpl, 20000);
      const text = await response.text();
      if (text.includes('AUTH_REQUIRED') || text.includes('ADMIN_REQUIRED')) {
        return { ok: false, tasks: [] };
      }
      const tasks = JSON.parse(text);
      return { ok: Array.isArray(tasks), tasks: Array.isArray(tasks) ? tasks : [] };
    } catch {
      return { ok: false, tasks: [] };
    }
  });
  const sessions = new Map();
  let workerRunning = false;
  fs.mkdirSync(operationsDir, { recursive: true });

  async function syncRecord(filePath, record) {
    const token = decryptToken(record, encryptionKey);
    const payload = record.payload;
    const photoUrls = { pGen: '', pSeal: '', pEmpty: '' };

    for (const photo of payload.photos) {
      const uploadResponse = await postToGas(gasUrl, {
        mode: 'upload_photo',
        token,
        image: photo.image,
        mimeType: photo.mimeType,
        filename: photo.filename,
        containerId: payload.containerId,
        photoType: photo.type,
        sheetDate: payload.sheetDate || '',
        actionType: payload.action,
        operationId: payload.operationId,
      }, fetchImpl, 45000);
      const uploadResult = await uploadResponse.json();
      if (uploadResult.status !== 'SUCCESS' || !uploadResult.url) {
        throw new Error(`PHOTO_UPLOAD_FAILED:${photo.type}`);
      }
      if (photo.type === 'container') photoUrls.pGen = uploadResult.url;
      else if (photo.type === 'seal') photoUrls.pSeal = uploadResult.url;
      else if (photo.type === 'unloaded') photoUrls.pEmpty = uploadResult.url;
    }

    const actionResponse = await postToGas(gasUrl, {
      mode: 'task_action',
      token,
      id: payload.containerId,
      act: payload.action,
      op: payload.operator,
      zone: payload.zone || '',
      pGen: photoUrls.pGen,
      pSeal: photoUrls.pSeal,
      pEmpty: photoUrls.pEmpty,
      date: payload.sheetDate || '',
      operationId: payload.operationId,
    }, fetchImpl, 30000);
    const actionResult = (await actionResponse.text()).trim();
    if (actionResult !== 'UPDATED' && actionResult !== 'OK') {
      const permanentCodes = ['ID_NOT_FOUND', 'INVALID_DATE', 'INVALID_INPUT', 'INVALID_ZONE', 'AUTH_REQUIRED'];
      const permanent = permanentCodes.includes(actionResult) || actionResult.startsWith('ZONE_OCCUPIED:');
      const error = new Error(actionResult || 'EMPTY_RESPONSE');
      error.permanent = permanent;
      throw error;
    }

    record.status = 'synced';
    record.photoUrls = photoUrls;
    record.syncedAt = new Date().toISOString();
    record.updatedAt = record.syncedAt;
    delete record.encryptedToken;
    delete record.tokenIv;
    delete record.tokenTag;
    persistRecord(filePath, record);
  }

  async function runWorker() {
    if (workerRunning || !gasUrl) return;
    workerRunning = true;
    try {
      const files = fs.readdirSync(operationsDir).filter((name) => name.endsWith('.json'));
      for (const name of files) {
        const filePath = path.join(operationsDir, name);
        const record = readRecord(filePath);
        if (!record || !['accepted', 'retry', 'processing'].includes(record.status)) continue;
        if (record.nextAttemptAt && new Date(record.nextAttemptAt).getTime() > Date.now()) continue;
        record.status = 'processing';
        record.updatedAt = new Date().toISOString();
        persistRecord(filePath, record);
        try {
          await syncRecord(filePath, record);
        } catch (error) {
          record.attempts = Number(record.attempts || 0) + 1;
          record.error = String(error.message || error).slice(0, 500);
          record.updatedAt = new Date().toISOString();
          if (error.permanent || record.attempts >= 20) {
            record.status = 'rejected';
            delete record.encryptedToken;
            delete record.tokenIv;
            delete record.tokenTag;
          } else {
            record.status = 'retry';
            const delayMs = Math.min(60000, 1000 * (2 ** Math.min(record.attempts - 1, 6)));
            record.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
          }
          persistRecord(filePath, record);
        }
      }
    } finally {
      workerRunning = false;
    }
  }

  const server = http.createServer(async (req, res) => {
    const requestStartedAt = Date.now();
    const requestPath = new URL(req.url, 'http://edge.local').pathname;
    const clientIp = normalizeIp(trustProxy
      ? (req.headers['cf-connecting-ip']
        || firstForwardedIp(req.headers['x-vercel-forwarded-for']))
      : req.socket.remoteAddress);
    if (requestLogger) {
      res.once('finish', () => {
        try {
          requestLogger({
            at: new Date().toISOString(),
            method: req.method,
            path: requestPath,
            clientIp,
            statusCode: res.statusCode,
            durationMs: Date.now() - requestStartedAt,
          });
        } catch {
          // Observability must never interrupt a terminal operation.
        }
      });
    }
    const origin = req.headers.origin || '';
    if (origin && !allowedOrigins.has(origin)) {
      json(res, 403, { error: 'ORIGIN_NOT_ALLOWED' }, '', allowedOrigins);
      return;
    }
    const hasNetworkAllowlist = allowedClientIps.size > 0 || allowedClientCidrs.length > 0;
    const clientAllowed = allowedClientIps.has(clientIp)
      || allowedClientCidrs.some((cidr) => cidrContains(cidr, clientIp));
    if (hasNetworkAllowlist && !clientAllowed) {
      json(res, 403, { error: 'EDGE_NETWORK_REQUIRED' }, origin, allowedOrigins);
      return;
    }

    if (req.method === 'OPTIONS') {
      const headers = {
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization,Content-Type',
        'Access-Control-Max-Age': '600',
      };
      if (origin && allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
      res.writeHead(204, headers);
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://edge.local');
    try {
      if (req.method === 'GET' && url.pathname === '/v1/health') {
        json(res, 200, { ok: true, service: 'agr-terminal-edge' }, origin, allowedOrigins);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/session') {
        const body = await readJson(req, 16 * 1024);
        const token = typeof body.token === 'string' ? body.token : '';
        const login = typeof body.login === 'string' ? body.login.trim() : '';
        if (!token || token.length > 512) {
          json(res, 400, { error: 'INVALID_TOKEN' }, origin, allowedOrigins);
          return;
        }
        if (pilotLogins.size && !pilotLogins.has(login)) {
          json(res, 403, { error: 'NOT_IN_PILOT' }, origin, allowedOrigins);
          return;
        }
        const validated = await validateSession(token);
        if (!validated || validated.ok !== true) {
          json(res, 401, { error: 'AUTH_REQUIRED' }, origin, allowedOrigins);
          return;
        }
        sessions.set(tokenDigest(token), {
          expiresAt: Date.now() + 60 * 60 * 1000,
          tasks: normalizeTasks(validated.tasks),
        });
        json(res, 200, { ok: true }, origin, allowedOrigins);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/operations') {
        const body = await readJson(req);
        const validationError = validateOperation(body);
        if (validationError) {
          json(res, 400, { error: validationError }, origin, allowedOrigins);
          return;
        }
        if ((pilotContainers.size && !pilotContainers.has(body.containerId))
          || (pilotLogins.size && !pilotLogins.has(body.login))) {
          json(res, 403, { error: 'NOT_IN_PILOT' }, origin, allowedOrigins);
          return;
        }

        const digest = tokenDigest(body.token);
        const session = sessions.get(digest);
        if (!session || session.expiresAt <= Date.now()) {
          sessions.delete(digest);
          json(res, 428, { error: 'EDGE_SESSION_NOT_READY' }, origin, allowedOrigins);
          return;
        }

        const filePath = operationPath(operationsDir, body.operationId);
        const existing = readRecord(filePath);
        if (existing) {
          if (existing.tokenHash !== digest) {
            json(res, 403, { error: 'OPERATION_FORBIDDEN' }, origin, allowedOrigins);
            return;
          }
          json(res, existing.status === 'rejected' ? 409 : 202, {
            status: existing.status,
            operationId: existing.operationId,
            ...(existing.error ? { error: existing.error } : {}),
          }, origin, allowedOrigins);
          return;
        }

        if (body.action.startsWith('start')) {
          const conflict = findZoneConflict(session.tasks, body.containerId.trim(), String(body.zone || ''));
          if (conflict) {
            json(res, 409, { error: 'ZONE_OCCUPIED', containerId: conflict.id }, origin, allowedOrigins);
            return;
          }
        }

        const tokenFields = encryptToken(body.token, encryptionKey);
        const payload = { ...body };
        delete payload.token;
        const record = {
          version: 1,
          operationId: body.operationId,
          tokenHash: digest,
          ...tokenFields,
          payload,
          status: 'accepted',
          attempts: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        persistRecord(filePath, record);
        if (options.autoStartWorker !== false) setImmediate(() => { void runWorker(); });

        const cachedTask = session.tasks.find((task) => task.id === body.containerId.trim());
        if (cachedTask) {
          if (body.action.startsWith('start')) {
            cachedTask.status = 'ACTIVE';
            cachedTask.start_time = 'pending';
            cachedTask.end_time = '';
            cachedTask.zone = String(body.zone || '').trim().toUpperCase();
          } else {
            cachedTask.status = 'DONE';
            cachedTask.end_time = 'pending';
          }
        }

        json(res, 202, { status: 'accepted', operationId: body.operationId }, origin, allowedOrigins);
        return;
      }

      const operationMatch = url.pathname.match(/^\/v1\/operations\/([^/]+)$/);
      if (req.method === 'GET' && operationMatch) {
        const authorization = req.headers.authorization || '';
        const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
        const record = readRecord(operationPath(operationsDir, decodeURIComponent(operationMatch[1])));
        if (!record) {
          json(res, 404, { error: 'NOT_FOUND' }, origin, allowedOrigins);
          return;
        }
        if (!token || tokenDigest(token) !== record.tokenHash) {
          json(res, 403, { error: 'OPERATION_FORBIDDEN' }, origin, allowedOrigins);
          return;
        }
        json(res, 200, {
          status: record.status,
          operationId: record.operationId,
          ...(record.error ? { error: record.error } : {}),
        }, origin, allowedOrigins);
        return;
      }

      json(res, 404, { error: 'NOT_FOUND' }, origin, allowedOrigins);
    } catch (error) {
      json(res, error.statusCode || 500, { error: error.message || 'INTERNAL_ERROR' }, origin, allowedOrigins);
    }
  });

  let workerInterval = null;
  if (options.autoStartWorker !== false) {
    workerInterval = setInterval(() => { void runWorker(); }, workerIntervalMs);
    workerInterval.unref();
  }
  server.on('close', () => {
    if (workerInterval) clearInterval(workerInterval);
  });
  return server;
}

module.exports = {
  createEdgeServer,
  cidrContains,
  decryptToken,
  encryptToken,
  findZoneConflict,
  operationPath,
  persistRecord,
  readRecord,
  tokenDigest,
};
