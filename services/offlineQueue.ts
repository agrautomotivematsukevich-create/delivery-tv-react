/**
 * Offline Queue — буфер для операций при плохом соединении
 * Хранит задачи в IndexedDB для persistence across page reloads.
 *
 * v2: All POST requests now include the auth token from localStorage.
 */

import { getToken } from './api';

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
      req.onsuccess = () => {
        const items = (req.result || []) as QueuedAction[];
        resolve(items.sort((a, b) => a.timestamp - b.timestamp));
      };
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
  } catch {
    // Failed to save — silently drop
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
  } catch {
    // Failed to remove — silently ignore
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export const offlineQueue = {
  _cachedCount: 0,

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
  },

  count(): number {
    return this._cachedCount;
  },

  async refreshCount(): Promise<number> {
    const items = await getAll();
    this._cachedCount = items.length;
    return items.length;
  },

  /**
   * Flush all queued actions to the server.
   * Every POST now includes the auth token.
   */
  async flush(): Promise<void> {
    if (flushing || !navigator.onLine) return;
    flushing = true;

    try {
      const items = await getAll();
      if (items.length === 0) return;

      const { SCRIPT_URL } = await import('../constants');
      const token = getToken();

      // If no token, we can't authenticate — skip flush until user logs in
      if (!token) return;

      for (const item of items) {
        try {
          if (item.type === 'photo_upload') {
            const payload = item.payload;
            const res = await fetch(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                mode: 'upload_photo',
                token,
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
                    token,
                    id: payload.taskId,
                    act: 'update_photo',
                    [payload.photoField]: data.url,
                  }),
                });
              }
              await remove(item.id);
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
                token,
                ...payload,
              }),
            });
            const txt = await res.text();

            if (txt.includes('UPDATED') || txt.includes('OK') || txt.includes('ID_NOT_FOUND')) {
              await remove(item.id);
            } else if (txt.includes('AUTH_REQUIRED')) {
              // Token expired — stop flushing, user needs to re-login
              break;
            } else {
              throw new Error('Action sync failed');
            }
          }
        } catch {
          item.retries++;
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

// ── Auto-flush on network recovery ──
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    offlineQueue.flush();
  });

  offlineQueue.refreshCount();

  setInterval(() => {
    if (navigator.onLine) offlineQueue.flush();
    offlineQueue.refreshCount();
  }, 60000);
}
