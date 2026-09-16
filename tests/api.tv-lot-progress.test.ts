import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services/api';

// Google Apps Script web apps answer through a 302 to a one-shot
// script.googleusercontent.com/macros/echo?user_content_key=… URL. That hop intermittently
// returns 404 "Страница не найдена" (3 of 24 probes on 16.09.2026) even though the script
// itself finished fine. On ?tv=1 the lots screen remounts every rotation, so one such 404
// used to replace the whole 3-minute slot with "Не удалось загрузить план".
const notFoundPage = () => new Response('<!DOCTYPE html><title>Страница не найдена</title>', {
  status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' },
});
const lotPlan = (id: string) => new Response(JSON.stringify({
  planRows: [{ rowIndex: 5, index: '1', lot: '43115-CT13J20260608', ws: 'Welding', pallets: '14/16', id, phone: '', eta: '', sheetDate: '16.09', sequence: 700005 }],
  tasks: [{ id, type: 'Welding', pallets: '14/16', eta: '', status: 'WAIT', time: '', start_time: '', end_time: '', zone: '', sheet_date: '16.09' }],
}), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

describe('tv_lot_progress resilience', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { language: 'ru-RU', onLine: true, platform: 'test', userAgent: 'Vitest' });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries once after a transient 404 from the Google redirect host', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(notFoundPage())
      .mockResolvedValueOnce(lotPlan('MIOU5033994'));
    vi.stubGlobal('fetch', fetchMock);

    const pending = api.fetchTvLotProgress(3);
    await vi.runAllTimersAsync();
    const data = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(data.planRows.map(r => r.id)).toEqual(['MIOU5033994']);
    expect(data.tasks).toHaveLength(1);
  });

  it('keeps serving the last successful lot plan when every attempt fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(lotPlan('HPCU4581845'))
      .mockResolvedValue(notFoundPage());
    vi.stubGlobal('fetch', fetchMock);

    const first = await api.fetchTvLotProgress(4);
    expect(first.planRows[0].id).toBe('HPCU4581845');

    // Past the 60 s client cache: the next rotation must hit the network again.
    await vi.advanceTimersByTimeAsync(61_000);
    const pending = api.fetchTvLotProgress(4);
    await vi.runAllTimersAsync();
    const second = await pending;

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(second.planRows[0].id).toBe('HPCU4581845');
    expect(second.tasks[0].id).toBe('HPCU4581845');
  });

  it('still fails when nothing was ever loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(notFoundPage()));

    const pending = api.fetchTvLotProgress(5);
    pending.catch(() => {});
    await vi.runAllTimersAsync();

    await expect(pending).rejects.toThrow(/HTTP_ERROR: 404/);
  });
});
