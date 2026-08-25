import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, setToken } from '../services/api';
import { offlineQueue } from '../services/offlineQueue';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('operator task actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('navigator', {
      language: 'ru-RU',
      onLine: true,
      platform: 'test',
      userAgent: 'Vitest',
    });
    setToken('test-token');
  });

  it('normalizes spreadsheet whitespace before sending a container ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('UPDATED', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.taskAction(' 599AJE17-79GI17\r\n', 'start', 'tv tv', 'G3', '', '', '', '25.08');

    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.id).toBe('599AJE17-79GI17');
  });

  it('sends one stable operationId with a task action', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('UPDATED', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await (api.taskAction as any)(
      '599AJE17-79GI17', 'start', 'tv tv', 'G3', '', '', '', '25.08', 'operation-123',
    );

    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.operationId).toBe('operation-123');
  });

  it('sends the same operationId with a photo upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'SUCCESS', url: 'https://drive.test/file-1',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.uploadPhoto('data:image/jpeg;base64,YQ==', 'image/jpeg', 'test.jpg', {
      containerId: '599AJE17-79GI17', photoType: 'container', operationId: 'operation-123',
    } as any);

    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.operationId).toBe('operation-123');
  });

  it('submits one atomic terminal operation with all photos to the edge server', async () => {
    const submitTerminalOperation = (api as unknown as {
      submitTerminalOperation?: (
        input: Record<string, unknown>,
        options: Record<string, unknown>,
      ) => Promise<unknown>;
    }).submitTerminalOperation;
    expect(submitTerminalOperation).toBeTypeOf('function');
    if (!submitTerminalOperation) return;

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'accepted', operationId: 'operation-123',
    }), { status: 202, headers: { 'Content-Type': 'application/json' } }));

    const result = await submitTerminalOperation({
      containerId: '599AJE17-79GI17',
      action: 'start',
      operator: 'tv tv',
      login: 'tv1',
      zone: 'G3',
      sheetDate: '25.08',
      operationId: 'operation-123',
      photos: [
        { type: 'container', image: 'data:image/jpeg;base64,YQ==', mimeType: 'image/jpeg', filename: 'general.jpg' },
        { type: 'seal', image: 'data:image/jpeg;base64,Yg==', mimeType: 'image/jpeg', filename: 'seal.jpg' },
      ],
    }, {
      endpoint: 'https://edge.test/v1',
      fetchImpl: fetchMock,
      timeoutMs: 1000,
    });

    expect(result).toEqual({ status: 'accepted', operationId: 'operation-123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://edge.test/v1/operations');
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.token).toBe('test-token');
    expect(payload.operationId).toBe('operation-123');
    expect(payload.photos).toHaveLength(2);
  });

  it('checks the operation status before falling back after an ambiguous edge failure', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('connection lost after upload'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'accepted', operationId: 'operation-123',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await api.submitTerminalOperation({
      containerId: '599AJE17-79GI17',
      action: 'finish',
      operator: 'tv tv',
      login: 'tv1',
      zone: 'G3',
      sheetDate: '25.08',
      operationId: 'operation-123',
      photos: [
        { type: 'unloaded', image: 'data:image/jpeg;base64,YQ==', mimeType: 'image/jpeg', filename: 'empty.jpg' },
      ],
    }, {
      endpoint: 'https://edge.test/v1',
      fetchImpl: fetchMock,
      timeoutMs: 1000,
    });

    expect(result).toEqual({ status: 'accepted', operationId: 'operation-123' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://edge.test/v1/operations/operation-123');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'GET', headers: { Authorization: 'Bearer test-token' },
    });
  });

  it('warms an authenticated edge session before an operator action', async () => {
    const warmTerminalEdgeSession = (api as unknown as {
      warmTerminalEdgeSession?: (login: string, options: Record<string, unknown>) => Promise<boolean>;
    }).warmTerminalEdgeSession;
    expect(warmTerminalEdgeSession).toBeTypeOf('function');
    if (!warmTerminalEdgeSession) return;

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));

    await expect(warmTerminalEdgeSession('tv1', {
      endpoint: 'https://edge.test/v1', fetchImpl: fetchMock, timeoutMs: 1000,
    })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://edge.test/v1/session');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      token: 'test-token', login: 'tv1',
    });
  });

  it('uses the same-origin edge proxy by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));

    await expect(api.warmTerminalEdgeSession('tv1', {
      fetchImpl: fetchMock,
      timeoutMs: 1000,
    })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/edge/v1/session');
  });

  it('does not contact the edge proxy for a login outside the pilot', async () => {
    const fetchMock = vi.fn();

    await expect(api.warmTerminalEdgeSession('another-operator', {
      fetchImpl: fetchMock,
      timeoutMs: 1000,
    })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not submit a non-pilot operation after a pilot session was warmed', async () => {
    const warmFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    await api.warmTerminalEdgeSession('tv1', { fetchImpl: warmFetch, timeoutMs: 1000 });

    const operationFetch = vi.fn();
    await expect(api.submitTerminalOperation({
      containerId: '599AJE17-79GI17',
      action: 'start',
      operator: 'another operator',
      login: 'another-operator',
      zone: 'G3',
      sheetDate: '25.08',
      operationId: 'non-pilot-operation',
      photos: [],
    }, { fetchImpl: operationFetch, timeoutMs: 1000 })).resolves.toBeNull();
    expect(operationFetch).not.toHaveBeenCalled();
  });

  it('explains which container occupies the selected zone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      'ZONE_OCCUPIED:OTHER-CONTAINER', { status: 200 },
    )));

    await expect(api.taskAction('599AJE17-79GI17', 'start', 'tv tv', 'G5'))
      .rejects.toThrow(/Зона G5.*OTHER-CONTAINER/i);
  });

  it('rejects ID_NOT_FOUND even when Apps Script returns HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ID_NOT_FOUND', { status: 200 })));

    await expect(api.taskAction('599AJE17-79GI17', 'start', 'tv tv', 'G3', '', '', '', '25.08'))
      .rejects.toThrow(/контейнер.*не найден/i);
  });

  it('normalizes IDs returned by the operator task feed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: '599AJE17-79GI17\n',
      type: 'претензия',
      status: 'WAIT',
    }]), { status: 200 })));

    const tasks = await api.fetchTasks('get_operator_tasks');

    expect(tasks[0].id).toBe('599AJE17-79GI17');
  });

  it('keeps a queued action when Apps Script returns ID_NOT_FOUND', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ID_NOT_FOUND', { status: 200 })));
    await offlineQueue.enqueueTaskAction({
      id: '599AJE17-79GI17\n',
      act: 'start_manual_10:17',
      op: 'tv tv',
      zone: 'G3',
      date: '25.08',
    });

    await offlineQueue.flush();

    expect(offlineQueue.count()).toBe(1);
  });

  it('assigns a stable operationId to an offline task before syncing it', async () => {
    await offlineQueue.clear();
    const fetchMock = vi.fn().mockResolvedValue(new Response('UPDATED', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await offlineQueue.enqueueTaskAction({
      id: '599AJE17-79GI17', act: 'start_manual_10:17', op: 'tv tv', zone: 'G3', date: '25.08',
    });

    await offlineQueue.flush();

    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.operationId).toMatch(/^offline:/);
  });
});
