/**
 * Offline Queue — буфер для операций при плохом соединении
 * * Хранит задачи в IndexedDB, что позволяет данным выживать при перезагрузке страницы
 * или закрытии браузера.
 */

const DB_NAME = 'wh_offline_queue';
const STORE_NAME = 'pending_actions';
const DB_VERSION = 1;

export interface PhotoUploadPayload {
  image: string;
  mimeType: string;
  filename: string;
  taskId?: string;
  photoField?: string;
}

export interface TaskActionPayload {
  id: string;
  act: string;
  op: string;
  zone?: string;
  pGen?: string;
  pSeal?: string;
  pEmpty?: string;
}

export type QueuedAction = 
  | { type: 'photo_upload'; payload: PhotoUploadPayload; id: string; timestamp: number; retries: number }
  | { type: 'task_action'; payload: TaskActionPayload; id: string; timestamp: number; retries: number };

let db: IDBDatabase | null = null;
let flushing = false;

// Вспомогательная функция для открытия БД
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

// Получение всех задач из очереди
async function getAll(): Promise<QueuedAction[]> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []) as QueuedAction[];
        // Сортируем по времени, чтобы "Начало" всегда уходило раньше "Финиша"
        resolve(items.sort((a, b) => a.timestamp - b.timestamp));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

// Добавление/обновление задачи
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

// Удаление задачи
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

// ── Публичный API ──────────────────────────────────────────────────────────────

export const offlineQueue = {
  _cachedCount: 0,

  /**
   * Добавить задачу в очередь
   */
  async enqueueTaskAction(payload: TaskActionPayload): Promise<void> {
    const action: QueuedAction = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type: 'task_action',
      payload,
      retries: 0,
    };
    await add(action);
    await this.refreshCount();
    console.log(`[OfflineQueue] +1 в очереди (task_action), всего: ${this._cachedCount}`);
  },

  async enqueuePhotoUpload(payload: PhotoUploadPayload): Promise<void> {
    const action: QueuedAction = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type: 'photo_upload',
      payload,
      retries: 0,
    };
    await add(action);
    await this.refreshCount();
    console.log(`[OfflineQueue] +1 в очереди (photo_upload), всего: ${this._cachedCount}`);
  },

  /**
   * Синхронное получение количества (для бейджей в UI)
   */
  count(): number {
    return this._cachedCount;
  },

  /**
   * Обновить кешированный счётчик из БД
   */
  async refreshCount(): Promise<number> {
    const items = await getAll();
    this._cachedCount = items.length;
    return items.length;
  },

  /**
   * Отправить все накопленные задачи на сервер
   */
  async flush(): Promise<void> {
    if (flushing || !navigator.onLine) return;
    flushing = true;

    try {
      const items = await getAll();
      if (items.length === 0) return;

      console.log(`[OfflineQueue] Синхронизация: ${items.length} объектов...`);
      const { SCRIPT_URL } = await import('../constants');

      for (const item of items) {
        try {
          if (item.type === 'photo_upload') {
            const payload = item.payload;
            const res = await fetch(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                mode: 'upload_photo',
                image: payload.image,
                mimeType: payload.mimeType,
                filename: payload.filename,
              }),
            });
            const data = await res.json();
            
            if (data.status === 'SUCCESS') {
              if (payload.taskId && payload.photoField) {
                await fetch(SCRIPT_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                  body: JSON.stringify({
                    mode: 'task_action',
                    id: payload.taskId,
                    act: 'update_photo',
                    [payload.photoField]: data.url,
                  }),
                });
              }
              await remove(item.id);
              console.log(`[OfflineQueue] Фото загружено: ${payload.filename}`);
            } else {
              throw new Error('Server rejected photo');
            }
          } 
          else if (item.type === 'task_action') {
            const payload = item.payload;
            const res = await fetch(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                mode: 'task_action',
                ...payload
              }),
            });
            const txt = await res.text();
            
            if (txt.includes('UPDATED') || txt.includes('OK') || txt.includes('ID_NOT_FOUND')) {
              await remove(item.id);
              console.log(`[OfflineQueue] Действие синхронизировано: ${payload.id}`);
            } else {
              throw new Error('Action sync failed');
            }
          }
        } catch (e) {
          item.retries++;
          console.warn(`[OfflineQueue] Ошибка в ${item.id}, попытка ${item.retries}/10`, e);
          
          if (item.retries >= 10) {
            await remove(item.id);
          } else {
            await add(item);
          }
          
          if (!navigator.onLine) break;
        }
      }
    } finally {
      flushing = false;
      await this.refreshCount();
    }
  },

  async clear(): Promise<void> {
    const database = await openDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => {
      this._cachedCount = 0;
    };
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[OfflineQueue] Сеть восстановлена, начинаю отправку...');
    offlineQueue.flush();
  });

  offlineQueue.refreshCount();

  setInterval(() => {
    if (navigator.onLine) offlineQueue.flush();
    offlineQueue.refreshCount();
  }, 60000);
}