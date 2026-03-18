import { SCRIPT_URL } from "../constants";
import { DashboardData, Task, Issue, TaskInput, PlanRow, LotContainer, PendingUser } from "../types";

export const hashPassword = async (p: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(p);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// ── Умный Timeout для нестабильной сети ──
const fetchWithTimeout = async (url: string, options: RequestInit & { timeout?: number } = {}) => {
  const { timeout = 25000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    clearTimeout(id);
    if (!response.ok) throw new Error(`HTTP_ERROR: ${response.status}`);
    return response;
  } catch (error: unknown) {
    clearTimeout(id);
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('TIMEOUT');
    if (error instanceof Error && error.message.startsWith('HTTP_ERROR')) throw error;
    throw new Error('NETWORK_ERROR');
  }
};

// ── Simple request cache + in-flight dedup ──
const _cache: Record<string, { data: unknown; ts: number }> = {};
const _inflight: Record<string, Promise<unknown>> = {};
async function cachedFetch<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const cached = _cache[key];
  if (cached && Date.now() - cached.ts < ttlMs) return cached.data as T;
  if (_inflight[key]) return _inflight[key] as Promise<T>;
  const promise = fn().then(data => {
    _cache[key] = { data, ts: Date.now() };
    delete _inflight[key];
    return data;
  }).catch(err => {
    delete _inflight[key];
    throw err;
  });
  _inflight[key] = promise;
  return promise;
}

export const parseDashboardData = (text: string): DashboardData | null => {
  try {
    if (!text || text.includes("DOCTYPE")) return null;
    
    const parts = text.split("###MSG###");
    const lines = parts[0].split('\n');
    const r1 = lines[0].split(';');

    if (r1.length < 3) return null;

    const counts = r1[1].split('|');
    const done = parseInt(counts[0]) || 0;
    const total = parseInt(counts[1]) || 0;
    const activeList = [];

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].includes('|')) {
        const p = lines[i].split('|');
        activeList.push({ id: p[0], start: p[1], zone: p[4] });
      }
    }

    let shiftCounts = { morning: 0, evening: 0, night: 0 };
    if (r1[4]) {
      const sc = r1[4].split('|');
      shiftCounts = {
        morning: parseInt(sc[0]) || 0,
        evening: parseInt(sc[1]) || 0,
        night:   parseInt(sc[2]) || 0,
      };
    }
    const onTerritory = r1[5] ? (parseInt(r1[5]) || 0) : 0;

    return {
      status: r1[0].trim(),
      done,
      total,
      nextId: r1[2].trim(),
      nextTime: r1[3].trim(),
      activeList,
      shiftCounts,
      onTerritory,
    };
  } catch (e) {
    console.error("Parse error", e);
    return null;
  }
};

export const api = {
  fetchDashboard: async (): Promise<DashboardData | null> => {
    return cachedFetch('dashboard', 10000, async () => {
      try {
        const res = await fetchWithTimeout(`${SCRIPT_URL}?nocache=${Date.now()}`);
        const text = await res.text();
        return parseDashboardData(text);
      } catch (e) {
        console.error(e);
        return null;
      }
    });
  },

  fetchTasks: async (mode: 'get_operator_tasks' | 'get_stats'): Promise<Task[]> => {
    return cachedFetch(`tasks_${mode}`, 10000, async () => {
      try {
        const res = await fetchWithTimeout(`${SCRIPT_URL}?nocache=${Date.now()}&mode=${mode}`);
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch (e) {
        console.error(e);
        return [];
      }
    });
  },

  fetchHistory: async (dateStr: string): Promise<Task[]> => {
    return cachedFetch(`history_${dateStr}`, 20000, async () => {
      try {
        const res = await fetchWithTimeout(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_history&date=${encodeURIComponent(dateStr)}`);
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch (e) {
        console.error(e);
        return [];
      }
    });
  },

  fetchFullPlan: async (dateStr: string): Promise<PlanRow[]> => {
    try {
       const res = await fetchWithTimeout(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_full_plan&date=${encodeURIComponent(dateStr)}`);
       const data = await res.json();
       return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  fetchLotTracker: async (lot: string): Promise<LotContainer[]> => {
    return cachedFetch(`lot_${lot}`, 15000, async () => {
      try {
        const res = await fetchWithTimeout(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_lot_tracker&lot=${encodeURIComponent(lot)}`);
        const txt = await res.text();
        try {
          const data = JSON.parse(txt);
          return Array.isArray(data) ? data : [];
        } catch {
          console.error('get_lot_tracker returned non-JSON:', txt.substring(0, 100));
          return [];
        }
      } catch (e) {
        console.error(e);
        return [];
      }
    });
  },

  // ИСПРАВЛЕНО: Переведено на POST для обхода лимита URL
  createPlan: async (dateStr: string, tasks: TaskInput[]): Promise<boolean> => {
    try {
       const payload = JSON.stringify(tasks);
       await fetchWithTimeout(SCRIPT_URL, {
         method: 'POST',
         headers: { 'Content-Type': 'text/plain;charset=utf-8' },
         body: JSON.stringify({
           mode: 'create_plan',
           date: dateStr,
           tasks: payload
         })
       });
       return true;
    } catch(e) {
      console.error(e);
      return false;
    }
  },
  
  updatePlanRow: async (dateStr: string, row: PlanRow): Promise<boolean> => {
    try {
       const res = await fetchWithTimeout(SCRIPT_URL, {
         method: 'POST',
         headers: { 'Content-Type': 'text/plain;charset=utf-8' },
         body: JSON.stringify({
           mode: 'update_container_row',
           date: dateStr,
           row: row.rowIndex.toString(),
           lot: row.lot,
           ws: row.ws,
           pallets: row.pallets,
           id: row.id,
           phone: row.phone,
           eta: row.eta
         })
       });
       const txt = await res.text();
       return txt.includes("UPDATED");
    } catch(e) {
      console.error("Failed to update plan row:", e);
      throw new Error('NETWORK_ERROR');
    }
  },

  getPriorityLot: async (): Promise<string> => {
    return cachedFetch('priority_lot', 10000, async () => {
      try {
        const res = await fetchWithTimeout(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_priority_lot`);
        const txt = await res.text();
        try {
          const data = JSON.parse(txt);
          return (data?.lot || '') as string;
        } catch {
          console.error('get_priority_lot returned non-JSON:', txt.substring(0, 100));
          return '';
        }
      } catch (e) {
        console.error(e);
        return '';
      }
    });
  },

  setPriorityLot: async (lot: string): Promise<boolean> => {
    try {
      const res = await fetchWithTimeout(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ mode: 'set_priority_lot', lot })
      });
      const txt = await res.text();
      delete _cache['priority_lot'];
      return txt.includes("OK");
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  fetchAllContainers: async (): Promise<string[]> => {
    try {
      const res = await fetchWithTimeout(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_all_containers`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  fetchIssues: async (): Promise<Issue[]> => {
    try {
      const res = await fetchWithTimeout(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_issues`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  // ИСПРАВЛЕНО: Переведено на POST для безопасной передачи хэша
  login: async (user: string, pass: string): Promise<{ success: boolean; name?: string; role?: string }> => {
    const hash = await hashPassword(pass);
    try {
      const res = await fetchWithTimeout(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          mode: 'login',
          user: user,
          hash: hash
        })
      });
      const txt = await res.text();
      if (txt.includes("CORRECT")) {
        const parts = txt.split('|');
        return { 
          success: true, 
          name: parts.length > 1 ? parts[1] : user,
          role: parts.length > 2 ? parts[2] : 'OPERATOR'
        };
      }
      return { success: false };
    } catch (e) {
      console.error(e);
      return { success: false };
    }
  },

  register: async (user: string, pass: string, name: string): Promise<boolean> => {
    try {
      const hash = await hashPassword(pass);
      await fetchWithTimeout(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ mode: 'register', user, hash, name })
      });
      return true;
    } catch (e) {
      console.error("Failed to register:", e);
      throw new Error('NETWORK_ERROR');
    }
  },

  getPendingUsers: async (): Promise<PendingUser[]> => {
    try {
      const res = await fetchWithTimeout(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_pending`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error("Failed to fetch pending users:", e);
      return [];
    }
  },

  approveUser: async (login: string, role: string): Promise<void> => {
    try {
      await fetchWithTimeout(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ mode: 'approve_user', login, role })
      });
    } catch (e) {
      console.error("Failed to approve user:", e);
      throw new Error('NETWORK_ERROR');
    }
  },

  rejectUser: async (login: string): Promise<void> => {
    try {
      await fetchWithTimeout(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ mode: 'reject_user', login })
      });
    } catch (e) {
      console.error("Failed to reject user:", e);
      throw new Error('NETWORK_ERROR');
    }
  },

  uploadPhoto: async (image: string, mimeType: string, filename: string): Promise<string> => {
    let retries = 3;
    while (retries > 0) {
      try {
        const res = await fetchWithTimeout(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ mode: 'upload_photo', image, mimeType, filename }),
          timeout: 45000 
        });
        const data = await res.json();
        
        if (data.status === "SUCCESS") {
          return data.url;
        } else {
          throw new Error("Server returned non-success status");
        }
      } catch (e: unknown) {
        retries--;
        console.warn(`Фото не загрузилось. Осталось попыток: ${retries}`, e);
        if (retries === 0) {
          throw new Error('NETWORK_ERROR');
        }
        await new Promise(resolve => setTimeout(resolve, 2000)); 
      }
    }
    return "";
  },

  taskAction: async (id: string, act: string, user: string, zone: string | null = '', pGen: string = '', pSeal: string = '', pEmpty: string = ''): Promise<void> => {
    try {
      const safeZone = zone || '';
      await fetchWithTimeout(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ mode: 'task_action', id, act, op: user, zone: safeZone, pGen, pSeal, pEmpty }),
        timeout: 20000
      });
    } catch (e) {
      console.error("Task action failed to send:", e);
      throw new Error('NETWORK_ERROR');
    }
  },

  reportIssue: async (id: string, desc: string, photos: string[], author: string): Promise<void> => {
    try {
      const p1 = photos[0] || "";
      const p2 = photos[1] || "";
      const p3 = photos[2] || "";
      await fetchWithTimeout(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ mode: 'report_issue', id, desc, p1, p2, p3, author })
      });
    } catch (e) {
      console.error("Issue report failed:", e);
      throw new Error('NETWORK_ERROR');
    }
  },

  getProxyImage: async (url: string): Promise<string> => {
    try {
      if (!url) return '';
      let proxiedUrl = url.replace('view?usp=drivesdk', 'view');
      const driveMatch = proxiedUrl.match(/https:\/\/drive\.google\.com\/file\/d\/([^/]+)\/.*/);
      if (driveMatch && driveMatch[1]) {
        return `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${driveMatch[1]}`)}&w=800`;
      }
      return proxiedUrl;
    } catch (e) {
      console.error(e);
      return '';
    }
  }, 

  // === НОВАЯ ФУНКЦИЯ ДЛЯ УВЕДОМЛЕНИЙ EMail
  subscribeToContainer: async (id: string, email: string): Promise<boolean> => {
    try {
      // ВЫВОДИМ В КОНСОЛЬ ССЫЛКУ, КУДА ИДЕТ ЗАПРОС
      console.log("ОТПРАВКА ЗАПРОСА НА URL:", SCRIPT_URL); 

      const res = await fetchWithTimeout(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ mode: 'subscribe_notification', id, email })
      });
      const txt = await res.text();
      
      // ВЫВОДИМ В КОНСОЛЬ ОТВЕТ ОТ ГУГЛА
      console.log("ОТВЕТ ОТ СЕРВЕРА:", txt); 
      
      return txt.includes("SUBSCRIBED");
    } catch (e) {
      console.error("Subscription failed:", e);
      return false;
    }
  }
