import { SCRIPT_URL } from "./constants";
import { DashboardData, Task, Issue, TaskInput, PlanRow } from "./types";

export const hashPassword = async (p: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(p);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

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
    return {
      status: r1[0].trim(),
      done,
      total,
      nextId: r1[2].trim(),
      nextTime: r1[3].trim(),
      activeList
    };
  } catch (e) {
    console.error("Parse error", e);
    return null;
  }
};

export const api = {
  getProxyImage: async (sourceUrl: string): Promise<string> => {
    try {
      if (!sourceUrl) return "";
      const driveIdMatch = sourceUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || sourceUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      const driveId = driveIdMatch?.[1];
      if (!driveId) return "";
      const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_photo&id=${encodeURIComponent(driveId)}`);
      const text = (await res.text()).trim();
      if (!text) return "";
      if (text.startsWith('data:image/')) return text;
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.data === 'string' && parsed.data) {
          const mime = parsed.mime || 'image/jpeg';
          return `data:${mime};base64,${parsed.data}`;
        }
      } catch {}
      return `data:image/jpeg;base64,${text}`;
    } catch (e) {
      console.error(e);
      return "";
    }
  },

  fetchDashboard: async (): Promise<DashboardData | null> => {
    try {
      const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}`);
      const text = await res.text();
      return parseDashboardData(text);
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  fetchTasks: async (mode: 'get_operator_tasks' | 'get_stats'): Promise<Task[]> => {
    try {
      const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=${mode}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  fetchHistory: async (dateStr: string): Promise<Task[]> => {
    try {
      const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_history&date=${encodeURIComponent(dateStr)}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  fetchFullPlan: async (dateStr: string): Promise<PlanRow[]> => {
    try {
      const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_full_plan&date=${encodeURIComponent(dateStr)}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  createPlan: async (dateStr: string, tasks: TaskInput[]): Promise<boolean> => {
    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ mode: 'create_plan', date: dateStr, tasks })
      });
      const txt = await res.text();
      return txt.includes("CREATED");
    } catch(e) {
      console.error("Create Plan Error:", e);
      return false;
    }
  },
  
  updatePlanRow: async (dateStr: string, row: PlanRow): Promise<boolean> => {
    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
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
      console.error("Update Row Error:", e);
      return false;
    }
  },

  fetchAllContainers: async (): Promise<string[]> => {
    try {
      const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_all_containers`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  fetchIssues: async (): Promise<Issue[]> => {
    try {
      const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_issues`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  login: async (user: string, pass: string): Promise<{ success: boolean; name?: string; role?: string }> => {
    const hash = await hashPassword(pass);
    const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=login&user=${encodeURIComponent(user)}&hash=${hash}`);
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
  },

  register: async (user: string, pass: string, name: string): Promise<boolean> => {
    const hash = await hashPassword(pass);
    await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=register&user=${encodeURIComponent(user)}&hash=${hash}&name=${encodeURIComponent(name)}`);
    return true;
  },

  // УНИВЕРСАЛЬНАЯ ЗАГРУЗКА ФОТО – с XMLHttpRequest и прогрессом
  uploadPhoto: async (
    image: string, 
    mimeType: string, 
    filename: string, 
    onProgress?: (progress: number) => void
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Если нет onProgress – используем fetch (без прогресса)
      if (!onProgress) {
        fetch(SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({ mode: 'upload_photo', image, mimeType, filename })
        })
          .then(res => res.json())
          .then(data => resolve(data.status === "SUCCESS" ? data.url : ""))
          .catch(reject);
        return;
      }

      // С прогрессом – XMLHttpRequest
      const base64Data = image.includes('base64,') ? image.split('base64,')[1] : image;
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });

      const formData = new FormData();
      formData.append('mode', 'upload_photo');
      formData.append('photo', blob, filename);
      formData.append('mimeType', mimeType);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', SCRIPT_URL, true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response.status === "SUCCESS" ? response.url : "");
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.ontimeout = () => reject(new Error('Request timeout'));
      xhr.timeout = 60000;
      xhr.send(formData);
    });
  },

  taskAction: async (id: string, act: string, user: string, zone: string = '', pGen: string = '', pSeal: string = '', pEmpty: string = ''): Promise<void> => {
    const url = `${SCRIPT_URL}?mode=task_action&id=${id}&act=${act}&op=${encodeURIComponent(user)}&zone=${zone}&pGen=${encodeURIComponent(pGen)}&pSeal=${encodeURIComponent(pSeal)}&pEmpty=${encodeURIComponent(pEmpty)}`;
    await fetch(url);
  },

  reportIssue: async (id: string, desc: string, photos: string[], author: string): Promise<void> => {
    const p1 = photos[0] ? encodeURIComponent(photos[0]) : "";
    const p2 = photos[1] ? encodeURIComponent(photos[1]) : "";
    const p3 = photos[2] ? encodeURIComponent(photos[2]) : "";
    const url = `${SCRIPT_URL}?mode=report_issue&id=${encodeURIComponent(id)}&desc=${encodeURIComponent(desc)}&p1=${p1}&p2=${p2}&p3=${p3}&author=${encodeURIComponent(author)}`;
    await fetch(url);
  }
};