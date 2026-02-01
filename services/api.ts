import { SCRIPT_URL } from "../constants";
import { DashboardData, Task, Issue, TaskInput, PlanRow, UserAccount, Message } from "../types";

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
    // dateStr in DD.MM format expected by backend
    try {
      const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_history&date=${encodeURIComponent(dateStr)}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  // Logistics: Get full plan for editing
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

  // Logistics: Create new plan
  createPlan: async (dateStr: string, tasks: TaskInput[]): Promise<boolean> => {
    try {
       const payload = JSON.stringify(tasks);
       await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=create_plan&date=${encodeURIComponent(dateStr)}&tasks=${encodeURIComponent(payload)}`);
       return true;
    } catch(e) {
      console.error(e);
      return false;
    }
  },
  
  // Logistics: Update specific row
  updatePlanRow: async (dateStr: string, row: PlanRow): Promise<boolean> => {
    try {
       const params = new URLSearchParams({
         mode: 'update_container_row',
         date: dateStr,
         row: row.rowIndex.toString(),
         lot: row.lot,
         ws: row.ws,
         pallets: row.pallets,
         id: row.id,
         phone: row.phone,
         eta: row.eta
       });
       const res = await fetch(`${SCRIPT_URL}?${params.toString()}`);
       const txt = await res.text();
       return txt.includes("UPDATED");
    } catch(e) {
      console.error(e);
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
      // Format: CORRECT|NAME|ROLE
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

  uploadPhoto: async (image: string, mimeType: string, filename: string): Promise<string> => {
    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ mode: 'upload_photo', image, mimeType, filename })
      });
      const data = await res.json();
      return data.status === "SUCCESS" ? data.url : "";
    } catch (e) {
      console.error(e);
      return "";
    }
  },

  taskAction: async (id: string, act: string, user: string, zone: string = '', pGen: string = '', pSeal: string = '', pEmpty: string = '', pInspect: string = ''): Promise<void> => {
    const url = `${SCRIPT_URL}?mode=task_action&id=${id}&act=${act}&op=${encodeURIComponent(user)}&zone=${zone}&pGen=${encodeURIComponent(pGen)}&pSeal=${encodeURIComponent(pSeal)}&pEmpty=${encodeURIComponent(pEmpty)}&pInspect=${encodeURIComponent(pInspect)}`;
    await fetch(url);
  },

  reportIssue: async (id: string, desc: string, photos: string[], author: string): Promise<void> => {
    const p1 = photos[0] ? encodeURIComponent(photos[0]) : "";
    const p2 = photos[1] ? encodeURIComponent(photos[1]) : "";
    const p3 = photos[2] ? encodeURIComponent(photos[2]) : "";
    const url = `${SCRIPT_URL}?mode=report_issue&id=${encodeURIComponent(id)}&desc=${encodeURIComponent(desc)}&p1=${p1}&p2=${p2}&p3=${p3}&author=${encodeURIComponent(author)}`;
    await fetch(url);
  },

  // --- ADMIN & MESSENGER ---

  fetchUsers: async (): Promise<UserAccount[]> => {
    try {
      const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_users`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  updateUser: async (row: number, role: string, status: string): Promise<boolean> => {
    try {
       await fetch(`${SCRIPT_URL}?mode=update_user&row=${row}&role=${encodeURIComponent(role)}&status=${encodeURIComponent(status)}`);
       return true;
    } catch (e) { return false; }
  },

  deleteUser: async (row: number): Promise<boolean> => {
    try {
      await fetch(`${SCRIPT_URL}?mode=delete_user&row=${row}`);
      return true;
    } catch (e) { return false; }
  },

  fetchMessages: async (): Promise<Message[]> => {
    try {
      const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_messages`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  },

  sendMessage: async (user: string, text: string): Promise<boolean> => {
    try {
      await fetch(`${SCRIPT_URL}?mode=send_message&user=${encodeURIComponent(user)}&text=${encodeURIComponent(text)}`);
      return true;
    } catch (e) { return false; }
  }
};