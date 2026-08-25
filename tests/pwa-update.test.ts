import { describe, expect, it, vi } from 'vitest';
import { applyPwaUpdate } from '../utils/pwaUpdate';

const createWaitingWorker = () => {
  const listeners = new Set<() => void>();
  const worker = {
    state: 'installed',
    postMessage: vi.fn(),
    addEventListener: vi.fn((_name: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_name: string, listener: () => void) => listeners.delete(listener)),
  };
  return {
    worker,
    activate: () => {
      worker.state = 'activated';
      listeners.forEach((listener) => listener());
    },
  };
};

describe('PWA update flow', () => {
  it('reloads exactly once and only after the waiting worker is activated', async () => {
    const { worker, activate } = createWaitingWorker();
    const updateServiceWorker = vi.fn();
    const reload = vi.fn();

    const update = applyPwaUpdate(
      { waiting: worker } as unknown as ServiceWorkerRegistration,
      updateServiceWorker,
      reload,
      1_000,
    );

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();

    activate();
    await update;

    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('uses the library updater only when there is no directly waiting worker', async () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn();

    await applyPwaUpdate(
      { waiting: null } as ServiceWorkerRegistration,
      updateServiceWorker,
      reload,
    );

    expect(updateServiceWorker).toHaveBeenCalledOnce();
    expect(updateServiceWorker).toHaveBeenCalledWith(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('falls back to one direct reload when update activation fails', async () => {
    const updateServiceWorker = vi.fn().mockRejectedValue(new Error('update failed'));
    const reload = vi.fn();

    await applyPwaUpdate(null, updateServiceWorker, reload);

    expect(reload).toHaveBeenCalledOnce();
  });
});
