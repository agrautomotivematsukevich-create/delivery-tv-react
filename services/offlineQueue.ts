/**
 * Offline Queue — буфер для операций при плохом соединении
 * 
 * Если загрузка фото или действие не удались (нет сети, таймаут),
 * задача ставится в очередь и автоматически повторяется когда сеть вернётся.
 * 
 * Данные хранятся в IndexedDB (переживает перезагрузку страницы).
 */

const DB_NAME = 'wh_offline_queue';
const STORE_NAME = 'pending_actions';
const DB_VERSION = 1;

export interface QueuedAction {
  id: string;          // unique queue item id
  timestamp: number;
  type: 'photo_upload' | 'task_action';
  payload: Record<string, string>;
  retries: number;
}

let db: IDBDatabase | null = null;
let flushing = false;

function openDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

async function getAll(): Promise<QueuedAction[]> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function add(action: QueuedAction): Promise<void> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(action);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[OfflineQueue] Failed to save:', e);
  }
}

async function remove(id: string): Promise<void> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[OfflineQueue] Failed to remove:', e);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export const offlineQueue = {
  /**
   * Добавить задачу в очередь
   */
  async enqueue(type: QueuedAction['type'], payload: Record<string, string>): Promise<void> {
    const action: QueuedAction = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type,
      payload,
      retries: 0,
    };
    await add(action);
    console.log(`[OfflineQueue] +1 queued (${type}), total: ${await this.count()}`);
  },

  /**
   * Количество задач в очереди
   */
  count(): number {
    // Sync version — for UI badge. Uses cached value.
    return offlineQueue._cachedCount;
  },

  _cachedCount: 0,

  /**
   * Обновить кешированный счётчик
   */
  async refreshCount(): Promise<number> {
    const items = await getAll();
    offlineQueue._cachedCount = items.length;
    return items.length;
  },

  /**
   * Попытаться отправить все задачи из очереди
   */
  async flush(): Promise<void> {
    if (flushing || !navigator.onLine) return;
    flushing = true;

    try {
      const items = await getAll();
      if (items.length === 0) { flushing = false; return; }

      console.log(`[OfflineQueue] Flushing ${items.length} items...`);
      const { SCRIPT_URL } = await import('../constants');

      for (const item of items) {
        try {
          if (item.type === 'photo_upload') {
            // Retry photo upload
            const res = await fetch(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                mode: 'upload_photo',
                image: item.payload.image,
                mimeType: item.payload.mimeType,
                filename: item.payload.filename,
              }),
            });
            const data = await res.json();
            if (data.status === 'SUCCESS') {
              // Photo uploaded — now need to update the task record with the URL
              if (item.payload.taskId && item.payload.photoField) {
                const params = new URLSearchParams({
                  mode: 'task_action',
                  id: item.payload.taskId,
                  act: 'update_photo',
                  [item.payload.photoField]: data.url,
                });
                await fetch(`${SCRIPT_URL}?${params.toString()}`);
              }
              await remove(item.id);
              console.log(`[OfflineQueue] ✓ Photo uploaded: ${item.payload.filename}`);
            } else {
              throw new Error('Upload failed');
            }
          } else if (item.type === 'task_action') {
            // Retry task action
            const params = new URLSearchParams(item.payload);
            params.set('mode', 'task_action');
            const res = await fetch(`${SCRIPT_URL}?${params.toString()}`);
            const txt = await res.text();
            if (txt.includes('UPDATED') || txt.includes('ID_NOT_FOUND')) {
              await remove(item.id);
              console.log(`[OfflineQueue] ✓ Action synced: ${item.payload.id} ${item.payload.act}`);
            } else {
              throw new Error('Action failed');
            }
          }
        } catch (e) {
          // Increment retry count, keep in queue
          item.retries++;
          if (item.retries > 10) {
            // Give up after 10 retries
            await remove(item.id);
            console.warn(`[OfflineQueue] ✗ Giving up on ${item.id} after 10 retries`);
          } else {
            await add(item);
          }
        }
      }
    } finally {
      flushing = false;
      await offlineQueue.refreshCount();
    }
  },

  /**
   * Очистить всю очередь
   */
  async clear(): Promise<void> {
    const items = await getAll();
    for (const item of items) {
      await remove(item.id);
    }
    offlineQueue._cachedCount = 0;
  },
};

// Auto-flush on startup and when online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[OfflineQueue] Back online, flushing...');
    offlineQueue.flush();
  });

  // Initial count
  offlineQueue.refreshCount();

  // Periodic flush attempt every 60s
  setInterval(() => {
    if (navigator.onLine) offlineQueue.flush();
    offlineQueue.refreshCount();
  }, 60000);
}
