import { describe, expect, it, vi } from 'vitest';
import { applyPwaUpdate } from '../utils/pwaUpdate';

describe('PWA update flow', () => {
  it('lets the service worker perform the only reload after a successful update', async () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    const fallbackReload = vi.fn();

    await applyPwaUpdate(updateServiceWorker, fallbackReload);

    expect(updateServiceWorker).toHaveBeenCalledOnce();
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect(fallbackReload).not.toHaveBeenCalled();
  });

  it('reloads directly when the service worker updater is unavailable', async () => {
    const fallbackReload = vi.fn();

    await applyPwaUpdate(null, fallbackReload);

    expect(fallbackReload).toHaveBeenCalledOnce();
  });

  it('reloads directly when the service worker update fails', async () => {
    const updateServiceWorker = vi.fn().mockRejectedValue(new Error('update failed'));
    const fallbackReload = vi.fn();

    await applyPwaUpdate(updateServiceWorker, fallbackReload);

    expect(fallbackReload).toHaveBeenCalledOnce();
  });
});
