export type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

const activateWaitingWorker = (
  worker: ServiceWorker,
  timeoutMs: number,
): Promise<void> => {
  if (worker.state === 'activated') return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeoutId);
      worker.removeEventListener('statechange', handleStateChange);
    };
    const handleStateChange = () => {
      if (worker.state === 'activated') {
        cleanup();
        resolve();
      } else if (worker.state === 'redundant') {
        cleanup();
        reject(new Error('PWA_UPDATE_REDUNDANT'));
      }
    };
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('PWA_UPDATE_TIMEOUT'));
    }, timeoutMs);

    worker.addEventListener('statechange', handleStateChange);
    worker.postMessage({ type: 'SKIP_WAITING' });
  });
};

export const applyPwaUpdate = async (
  registration: ServiceWorkerRegistration | null,
  updateServiceWorker: UpdateServiceWorker | null,
  reload: () => void,
  activationTimeoutMs = 15_000,
): Promise<void> => {
  try {
    const waitingWorker = registration?.waiting;
    if (waitingWorker) {
      // Reload only after the new precache is active. This prevents a page from
      // combining the new HTML shell with stale/missing JS and CSS assets.
      await activateWaitingWorker(waitingWorker, activationTimeoutMs);
    } else if (updateServiceWorker) {
      // The argument is intentionally false: this library version ignores it,
      // while reload remains owned by this function and happens exactly once.
      await updateServiceWorker(false);
    }
  } catch {
    // A direct reload is the last-resort recovery path if activation is refused.
  }

  reload();
};
