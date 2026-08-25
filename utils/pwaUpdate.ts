export type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

export const applyPwaUpdate = async (
  updateServiceWorker: UpdateServiceWorker | null,
  fallbackReload: () => void,
): Promise<void> => {
  if (!updateServiceWorker) {
    fallbackReload();
    return;
  }

  try {
    // vite-plugin-pwa waits for the new worker to take control before reloading.
    // A separate timer here would race that activation and can mix old/new assets.
    await updateServiceWorker(true);
  } catch {
    fallbackReload();
  }
};
