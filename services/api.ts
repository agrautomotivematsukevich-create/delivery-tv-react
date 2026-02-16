import { SCRIPT_URL } from "../constants";
import { DashboardData, Task, Issue, TaskInput, PlanRow } from "../types";

export const hashPassword = async (p: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(p);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// Единый хелпер для всех GET-запросов — добавляет nocache автоматически
const buildUrl = (params: Record<string, string>): string => {
  const p = new URLSearchParams({ ...params, nocache: Date.now().toString() });
  return `${SCRIPT_URL}?${p.toString()}`;
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
  fetchDashboard: async (): Promise<DashboardData | null> => {
    try {
      const res = await fetch(buildUrl({}));
      const text = await res.text();
      return parseDashboardData(text);
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  fetchTasks: async (mode: 'get_operator_tasks' | 'get_stats'): Promise<Task[]> => {
    try {
      const res = await fetch(buildUrl({ mode }));
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  fetchHistory: async (dateStr: string): Promise<Task[]> => {
    try {
      const res = await fetch(buildUrl({ mode: 'get_history', date: dateStr }));
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  fetchFullPlan: async (dateStr: string): Promise<PlanRow[]> => {
    try {
      const res = await fetch(buildUrl({ mode: 'get_full_plan', date: dateStr }));
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
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ mode: 'create_plan', date: dateStr, tasks }),
      });
      const txt = await res.text();
      return txt.includes('CREATED');
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  updatePlanRow: async (dateStr: string, row: PlanRow): Promise<boolean> => {
    try {
      const res = await fetch(buildUrl({
        mode: 'update_container_row',
        date: dateStr,
        row: row.rowIndex.toString(),
        lot: row.lot,
        ws: row.ws,
        pallets: row.pallets,
        id: row.id,
        phone: row.phone,
        eta: row.eta,
      }));
      const txt = await res.text();
      return txt.includes('UPDATED');
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  fetchAllContainers: async (): Promise<string[]> => {
    try {
      const res = await fetch(buildUrl({ mode: 'get_all_containers' }));
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  fetchIssues: async (): Promise<Issue[]> => {
    try {
      const res = await fetch(buildUrl({ mode: 'get_issues' }));
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  login: async (user: string, pass: string): Promise<{ success: boolean; name?: string; role?: string }> => {
    const hash = await hashPassword(pass);
    const res = await fetch(buildUrl({ mode: 'login', user, hash }));
    const txt = await res.text();
    if (txt.includes('CORRECT')) {
      const parts = txt.split('|');
      return {
        success: true,
        name: parts.length > 1 ? parts[1] : user,
        role: parts.length > 2 ? parts[2] : 'OPERATOR',
      };
    }
    return { success: false };
  },

  register: async (user: string, pass: string, name: string): Promise<boolean> => {
    const hash = await hashPassword(pass);
    const res = await fetch(buildUrl({ mode: 'register', user, hash, name }));
    const txt = await res.text();
    return txt.includes('REGISTERED');
  },

  uploadPhoto: async (image: string, mimeType: string, filename: string): Promise<string> => {
    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ mode: 'upload_photo', image, mimeType, filename }),
      });
      const data = await res.json();
      return data.status === 'SUCCESS' ? data.url : '';
    } catch (e) {
      console.error(e);
      return '';
    }
  },

  taskAction: async (
    id: string,
    act: string,
    user: string,
    zone: string = '',
    pGen: string = '',
    pSeal: string = '',
    pInspect: string = '',
    pEmpty: string = '',
  ): Promise<void> => {
    await fetch(buildUrl({
      mode: 'task_action',
      id,
      act,
      op: user,
      zone,
      pGen,
      pSeal,
      pInspect,
      pEmpty,
    }));
  },

  reportIssue: async (id: string, desc: string, photos: string[], author: string): Promise<void> => {
    await fetch(buildUrl({
      mode: 'report_issue',
      id,
      desc,
      p1: photos[0] || '',
      p2: photos[1] || '',
      p3: photos[2] || '',
      author,
    }));
  },
};