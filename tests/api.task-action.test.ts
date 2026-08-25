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
