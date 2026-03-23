import { SCRIPT_URL } from "../constants";
import { DashboardData, Task, Issue, TaskInput, PlanRow, LotContainer, PendingUser } from "../types";

// ══════════════════════════════════════════════════════════════════════════════
// TOKEN MANAGEMENT
// localStorage stores ONLY the opaque session token.
// User name/role live exclusively in React state (memory).
// ══════════════════════════════════════════════════════════════════════════════

const TOKEN_KEY = "warehouse_session_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Session-expiry callback ──
let _onSessionExpired: (() => void) | null = null;

export function onSessionExpired(cb: () => void): void {
  _onSessionExpired = cb;
}

function triggerSessionExpired(): void {
  if (_onSessionExpired) _onSessionExpired();
}

function handleAuthError(): never {
  triggerSessionExpired();
  throw new Error("AUTH_EXPIRED");
}

// ══════════════════════════════════════════════════════════════════════════════
// NETWORKING PRIMITIVES
// ══════════════════════════════════════════════════════════════════════════════

export const hashPassword = async (p: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(p);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
};

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
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("TIMEOUT");
    if (error instanceof Error && error.message.startsWith("HTTP_ERROR")) throw error;
    throw new Error("NETWORK_ERROR");
  }
};

// ── Cache + in-flight dedup ──
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

// ══════════════════════════════════════════════════════════════════════════════
// AUTH-AWARE GET HELPER
// Injects token as URL parameter: &token=<value>
// Checks response body for AUTH_REQUIRED → triggers session expiry.
// Returns null if no token available (caller handles the fallback).
// ══════════════════════════════════════════════════════════════════════════════

async function authGet(baseUrl: string): Promise<Response | null> {
  const token = getToken();
  if (!token) return null;

  const separator = baseUrl.includes("?") ? "&" : "?";
  const url = `${baseUrl}${separator}token=${encodeURIComponent(token)}`;

  const res = await fetchWithTimeout(url);

  // Check for auth errors in the response
  const clone = res.clone();
  const txt = await clone.text();
  if (txt.includes('"error"') && (txt.includes("AUTH_REQUIRED") || txt.includes("ADMIN_REQUIRED"))) {
    handleAuthError();
  }

  return res;
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH-AWARE POST HELPER
// Injects token into JSON body.
// ══════════════════════════════════════════════════════════════════════════════

interface PostOptions {
  timeout?: number;
}

async function authPost(payload: Record<string, unknown>, opts: PostOptions = {}): Promise<Response> {
  const token = getToken();
  if (!token) handleAuthError();

  const res = await fetchWithTimeout(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, token }),
    timeout: opts.timeout,
  });

  const clone = res.clone();
  const txt = await clone.text();
  if (txt.includes("AUTH_REQUIRED") || txt.includes("ADMIN_REQUIRED")) {
    handleAuthError();
  }

  return res;
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD PARSER
// ══════════════════════════════════════════════════════════════════════════════

export const parseDashboardData = (text: string): DashboardData | null => {
  try {
    if (!text || text.includes("DOCTYPE")) return null;

    const parts = text.split("###MSG###");
    const lines = parts[0].split("\n");
    const r1 = lines[0].split(";");

    if (r1.length < 3) return null;

    const counts = r1[1].split("|");
    const done = parseInt(counts[0]) || 0;
    const total = parseInt(counts[1]) || 0;
    const activeList = [];

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].includes("|")) {
        const p = lines[i].split("|");
        activeList.push({ id: p[0], start: p[1], zone: p[4] });
      }
    }

    let shiftCounts = { morning: 0, evening: 0, night: 0 };
    if (r1[4]) {
      const sc = r1[4].split("|");
      shiftCounts = {
        morning: parseInt(sc[0]) || 0,
        evening: parseInt(sc[1]) || 0,
        night:   parseInt(sc[2]) || 0,
      };
    }
    const onTerritory = r1[5] ? (parseInt(r1[5]) || 0) : 0;

    return { status: r1[0].trim(), done, total, nextId: r1[2].trim(), nextTime: r1[3].trim(), activeList, shiftCounts, onTerritory };
  } catch {
    return null;
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// API OBJECT
// ══════════════════════════════════════════════════════════════════════════════

export const api = {

  // ── AUTHENTICATED READS (token injected via authGet) ───────────────────────

  fetchDashboard: async (): Promise<DashboardData | null> => {
    return cachedFetch("dashboard", 10000, async () => {
      try {
        // Используем обычный fetch, так как этот эндпоинт публичный и не требует токена
        const res = await fetch(`${SCRIPT_URL}?nocache=${Date.now()}`);
        if (!res.ok) return null; 
        
        const text = await res.text();
        return parseDashboardData(text);
      } catch (e: unknown) {
        return null;
      }
    });
  },

  fetchTasks: async (mode: "get_operator_tasks" | "get_stats"): Promise<Task[]> => {
    return cachedFetch(`tasks_${mode}`, 10000, async () => {
      try {
        const res = await authGet(`${SCRIPT_URL}?nocache=${Date.now()}&mode=${mode}`);
        if (!res) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
        return [];
      }
    });
  },

  fetchHistory: async (dateStr: string): Promise<Task[]> => {
    return cachedFetch(`history_${dateStr}`, 20000, async () => {
      try {
        const res = await authGet(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_history&date=${encodeURIComponent(dateStr)}`);
        if (!res) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
        return [];
      }
    });
  },

  fetchFullPlan: async (dateStr: string): Promise<PlanRow[]> => {
    try {
      const res = await authGet(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_full_plan&date=${encodeURIComponent(dateStr)}`);
      if (!res) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
      return [];
    }
  },

  fetchLotTracker: async (lot: string): Promise<LotContainer[]> => {
    return cachedFetch(`lot_${lot}`, 15000, async () => {
      try {
        const res = await authGet(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_lot_tracker&lot=${encodeURIComponent(lot)}`);
        if (!res) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
        return [];
      }
    });
  },

  getPriorityLot: async (): Promise<string> => {
    return cachedFetch("priority_lot", 10000, async () => {
      try {
        const res = await authGet(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_priority_lot`);
        if (!res) return "";
        const data = await res.json();
        return (data?.lot || "") as string;
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
        return "";
      }
    });
  },

  fetchAllContainers: async (): Promise<string[]> => {
    try {
      const res = await authGet(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_all_containers`);
      if (!res) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
      return [];
    }
  },

  fetchIssues: async (): Promise<Issue[]> => {
    try {
      const res = await authGet(`${SCRIPT_URL}?nocache=${Date.now()}&mode=get_issues`);
      if (!res) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
      return [];
    }
  },

  // ── Image proxy (client-side URL transform, no backend call) ───────────────

  getProxyImage: async (url: string): Promise<string> => {
    try {
      if (!url) return "";
      let proxiedUrl = url.replace("view?usp=drivesdk", "view");
      const driveMatch = proxiedUrl.match(/https:\/\/drive\.google\.com\/file\/d\/([^/]+)\/.*/);
      if (driveMatch && driveMatch[1]) {
        return `https://wsrv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${driveMatch[1]}`)}&w=800`;
      }
      return proxiedUrl;
    } catch {
      return "";
    }
  },

  // ── LOGIN / REGISTER (no token — these CREATE the session) ─────────────────

  login: async (user: string, pass: string): Promise<{ success: boolean; name?: string; role?: string; token?: string }> => {
    const hash = await hashPassword(pass);
    try {
      const res = await fetchWithTimeout(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ mode: "login", user, hash }),
      });
      const txt = await res.text();

      // Handle rate-limiting response from backend
      if (txt.includes("RATE_LIMITED")) {
        return { success: false };
      }

      if (txt.startsWith("CORRECT")) {
        const parts = txt.split("|");
        const token = parts.length > 3 ? parts[3] : "";
        if (token) setToken(token);
        return {
          success: true,
          name: parts.length > 1 ? parts[1] : user,
          role: parts.length > 2 ? parts[2] : "OPERATOR",
          token,
        };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  },

  register: async (user: string, pass: string, name: string): Promise<boolean> => {
    try {
      const hash = await hashPassword(pass);
      await fetchWithTimeout(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ mode: "register", user, hash, name }),
      });
      return true;
    } catch {
      throw new Error("NETWORK_ERROR");
    }
  },

  // ── AUTH-PROTECTED WRITES (token injected via authPost) ────────────────────

  createPlan: async (dateStr: string, tasks: TaskInput[]): Promise<boolean> => {
    try {
      const payload = JSON.stringify(tasks);
      await authPost({ mode: "create_plan", date: dateStr, tasks: payload });
      return true;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
      return false;
    }
  },

  updatePlanRow: async (dateStr: string, row: PlanRow): Promise<boolean> => {
    const res = await authPost({
      mode: "update_container_row",
      date: dateStr,
      row: row.rowIndex.toString(),
      lot: row.lot, ws: row.ws, pallets: row.pallets,
      id: row.id, phone: row.phone, eta: row.eta,
    });
    const txt = await res.text();
    return txt.includes("UPDATED");
  },

  setPriorityLot: async (lot: string): Promise<boolean> => {
    try {
      const res = await authPost({ mode: "set_priority_lot", lot });
      const txt = await res.text();
      delete _cache["priority_lot"];
      return txt.includes("OK");
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
      return false;
    }
  },

  taskAction: async (id: string, act: string, user: string, zone: string | null = "", pGen: string = "", pSeal: string = "", pEmpty: string = ""): Promise<void> => {
    await authPost(
      { mode: "task_action", id, act, op: user, zone: zone || "", pGen, pSeal, pEmpty },
      { timeout: 20000 }
    );
  },

  uploadPhoto: async (image: string, mimeType: string, filename: string): Promise<string> => {
    let retries = 3;
    while (retries > 0) {
      try {
        const res = await authPost(
          { mode: "upload_photo", image, mimeType, filename },
          { timeout: 45000 }
        );
        const data = await res.json();
        if (data.status === "SUCCESS") {
          return data.url;
        }
        throw new Error(data.message || "Server returned non-success status");
      } catch (e: unknown) {
        if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
        retries--;
        if (retries === 0) throw new Error("NETWORK_ERROR");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    return "";
  },

  reportIssue: async (id: string, desc: string, photos: string[], author: string): Promise<void> => {
    await authPost({
      mode: "report_issue", id, desc,
      p1: photos[0] || "", p2: photos[1] || "", p3: photos[2] || "",
      author,
    });
  },

  subscribeToContainer: async (id: string, email: string): Promise<boolean> => {
    try {
      const res = await authPost({ mode: "subscribe_notification", id, email });
      const txt = await res.text();
      return txt.includes("SUBSCRIBED");
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
      return false;
    }
  },

  // ── ADMIN-ONLY (token + ADMIN role verified server-side) ───────────────────

  getPendingUsers: async (): Promise<PendingUser[]> => {
    try {
      const res = await authPost({ mode: "get_pending" });
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
      return [];
    }
  },

  approveUser: async (login: string, role: string): Promise<void> => {
    await authPost({ mode: "approve_user", login, role });
  },

  rejectUser: async (login: string): Promise<void> => {
    await authPost({ mode: "reject_user", login });
  },
};
