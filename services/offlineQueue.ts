/**
 * Offline Queue — буфер для операций при плохом соединении
 * * Хранит задачи в IndexedDB, что позволяет данным выживать при перезагрузке страницы
 * или закрытии браузера.
 */

const DB_NAME = 'wh_offline_queue';
const STORE_NAME = 'pending_actions';
const DB_VERSION = 1;

export interface QueuedAction {
  id: string;         // Уникальный ID записи в очереди
  timestamp: number;  // Время создания (для сортировки FIFO)
  type: 'photo_upload' | 'task_action';
  payload: any;       // Данные (Base64 фото или параметры задачи)
  retries: number;    // Счетчик попыток
}

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
  async enqueue(type: QueuedAction['type'], payload: any): Promise<void> {
    const action: QueuedAction = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      type,
      payload,
      retries: 0,
    };
    await add(action);
    await this.refreshCount(); // Обновляем счетчик для UI
    console.log(`[OfflineQueue] +1 в очереди (${type}), всего: ${this._cachedCount}`);
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
    // Если уже идет процесс отправки или нет сети — выходим
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
            // 1. Пытаемся загрузить фото
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
              // 2. Если фото загружено, привязываем его URL к задаче
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
              console.log(`[OfflineQueue] Фото загружено: ${item.payload.filename}`);
            } else {
              throw new Error('Server rejected photo');
            }
          } 
          else if (item.type === 'task_action') {
            // Отправка действия (старт/финиш/зона)
            const params = new URLSearchParams(item.payload);
            params.set('mode', 'task_action');
            const res = await fetch(`${SCRIPT_URL}?${params.toString()}`);
            const txt = await res.text();
            
            // Если успех или задача уже не существует на сервере — удаляем из очереди
            if (txt.includes('UPDATED') || txt.includes('OK') || txt.includes('ID_NOT_FOUND')) {
              await remove(item.id);
              console.log(`[OfflineQueue] Действие синхронизировано: ${item.payload.id}`);
            } else {
              throw new Error('Action sync failed');
            }
          }
        } catch (e) {
          // Если произошла ошибка запроса (например, опять пропала сеть в процессе)
          item.retries++;
          console.warn(`[OfflineQueue] Ошибка в ${item.id}, попытка ${item.retries}/10`, e);
          
          if (item.retries >= 10) {
            await remove(item.id); // Удаляем "битые" задачи после 10 попыток
          } else {
            await add(item); // Сохраняем увеличенное число попыток
          }
          
          // Если сети всё ещё нет, прекращаем перебор очереди
          if (!navigator.onLine) break;
        }
      }
    } finally {
      flushing = false;
      await this.refreshCount();
    }
  },

  /**
   * Полная очистка очереди
   */
  async clear(): Promise<void> {
    const database = await openDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => {
      this._cachedCount = 0;
    };
  },
};

// ── Автоматизация ────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  // Запуск при восстановлении интернета
  window.addEventListener('online', () => {
    console.log('[OfflineQueue] Сеть восстановлена, начинаю отправку...');
    offlineQueue.flush();
  });

  // Первичный подсчет при загрузке страницы
  offlineQueue.refreshCount();

  // Фоновая проверка каждые 60 секунд (если сеть есть)
  setInterval(() => {
    if (navigator.onLine) offlineQueue.flush();
    offlineQueue.refreshCount();
  }, 60000);
}