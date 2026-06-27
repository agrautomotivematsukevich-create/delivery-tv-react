import { SCRIPT_URL } from "../constants";
import { DashboardData, Task, Issue, TaskInput, PlanRow, LotContainer, PendingUser } from "../types";
import { getOperationalSheetName } from "../utils/time";

// ══════════════════════════════════════════════════════════════════════════════
// TOKEN MANAGEMENT
// localStorage stores ONLY the opaque session token.
// User name/role live exclusively in React state (memory).
// ══════════════════════════════════════════════════════════════════════════════

const TOKEN_KEY = "warehouse_session_token";
const AUDIT_SESSION_KEY = "warehouse_audit_session_id";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

type DeviceType = "mobile" | "desktop" | "tablet" | "unknown";

function getClientDeviceType(): DeviceType {
  if (typeof navigator === "undefined") return "unknown";

  const ua = navigator.userAgent || "";
  if (!ua) return "unknown";

  if (/ipad|tablet|kindle|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    return "tablet";
  }

  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) {
    return "mobile";
  }

  return "desktop";
}

function createAuditId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getAuditSessionId(): string {
  try {
    let sessionId = localStorage.getItem(AUDIT_SESSION_KEY);
    if (!sessionId) {
      sessionId = createAuditId();
      localStorage.setItem(AUDIT_SESSION_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return "unknown";
  }
}

function getClientInfo(): Record<string, unknown> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return {};
  return {
    path: window.location.pathname,
    search: window.location.search,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
    language: navigator.language,
    platform: navigator.platform,
    online: navigator.onLine,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    device: getClientDeviceType(),
  };
}

export function getAuditClientPayload(): Record<string, unknown> {
  return {
    requestId: createAuditId(),
    sessionId: getAuditSessionId(),
    device: getClientDeviceType(),
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    clientTimestamp: new Date().toISOString(),
    clientInfo: getClientInfo(),
  };
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
const CACHE_MAX_ENTRIES = 50;

function pruneCache(): void {
  const keys = Object.keys(_cache);
  if (keys.length <= CACHE_MAX_ENTRIES) return;
  // Удаляем самые старые записи
  keys.sort((a, b) => _cache[a].ts - _cache[b].ts);
  const toRemove = keys.length - CACHE_MAX_ENTRIES;
  for (let i = 0; i < toRemove; i++) {
    delete _cache[keys[i]];
  }
}

// Drop client caches that reflect operator/plan state so the next fetch is fresh right
// after a write — otherwise a just-started container keeps showing as "ready to start"
// for up to the 60s cache TTL even though the server state already changed.
function invalidateTaskCaches(): void {
  for (const key of Object.keys(_cache)) {
    if (key.startsWith("tasks_") || key.startsWith("bundle_") || key === "dashboard"
        || key.startsWith("history_") || key.startsWith("tv_lot_progress_")) {
      delete _cache[key];
    }
  }
}

async function cachedFetch<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const cached = _cache[key];
  if (cached && Date.now() - cached.ts < ttlMs) return cached.data as T;
  if (_inflight[key]) return _inflight[key] as Promise<T>;
  const promise = fn().then(data => {
    _cache[key] = { data, ts: Date.now() };
    delete _inflight[key];
    pruneCache();
    return data;
  }).catch(err => {
    delete _inflight[key];
    throw err;
  });
  _inflight[key] = promise;
  return promise;
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH-AWARE READ HELPER (POST-based — token never appears in URL)
//
// GAS Web Apps do not expose e.headers, so custom request headers cannot be
// read server-side. The only safe alternative to query-string tokens is the
// POST body. dispatch() in Code.gs is HTTP-method agnostic: doGet and doPost
// both call dispatch(params), so any read route works equally via POST.
// This also eliminates the need for ?nocache= hacks — POST responses are never
// cached by GAS infrastructure.
// ══════════════════════════════════════════════════════════════════════════════

async function authRead(mode: string, extraParams: Record<string, string> = {}): Promise<Response | null> {
  const token = getToken();
  if (!token) return null;

  const res = await fetchWithTimeout(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ mode, token, ...extraParams, ...getAuditClientPayload() }),
  });

  const txt = await res.text();
  if (txt.includes("AUTH_REQUIRED") || txt.includes("ADMIN_REQUIRED")) {
    handleAuthError();
  }

  return new Response(txt, { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** @deprecated Token in URL — use authRead() instead. Kept for emergency rollback only. */
async function authGet(baseUrl: string): Promise<Response | null> {
  const token = getToken();
  if (!token) return null;

  const separator = baseUrl.includes("?") ? "&" : "?";
  const url = `${baseUrl}${separator}token=${encodeURIComponent(token)}`;

  const res = await fetchWithTimeout(url);

  const txt = await res.text();
  if (txt.includes('"error"') && (txt.includes("AUTH_REQUIRED") || txt.includes("ADMIN_REQUIRED"))) {
    handleAuthError();
  }

  return new Response(txt, { status: res.status, statusText: res.statusText, headers: res.headers });
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH-AWARE POST HELPER
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
    body: JSON.stringify({ ...payload, token, ...getAuditClientPayload() }),
    timeout: opts.timeout,
  });

  const txt = await res.text();
  if (txt.includes("AUTH_REQUIRED") || txt.includes("ADMIN_REQUIRED")) {
    handleAuthError();
  }

  return new Response(txt, { status: res.status, statusText: res.statusText, headers: res.headers });
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD PARSER (Остался твой рабочий из основы!)
// ══════════════════════════════════════════════════════════════════════════════

export const parseDashboardData = (text: string): DashboardData | null => {
  try {
    if (!text || text.includes("DOCTYPE")) return null;

    const parts = text.split("###MSG###");
    const payload = parts[0].replace(/\r/g, "").trimStart();
    const lines = payload
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return null;

    const headerLine = lines.find(l => l.includes(";")) || lines[0];
    const r1 = headerLine.split(";");
    const metaLine = lines.find((l, idx) => idx > 0 && l.startsWith(";") && l.includes(";")) || null;
    const metaParts = metaLine ? metaLine.split(";") : null;

    if (r1.length < 3) return null;

    const counts = r1[1].split("|");
    const done = parseInt(counts[0]) || 0;
    const total = parseInt(counts[1]) || 0;
    const activeList = [];

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].startsWith(";")) continue; // continuation/meta line, not an active container row
      if (!lines[i].includes("|")) continue;
      const p = lines[i].split("|");
      if (p.length >= 5 && p[0]) {
        activeList.push({ id: p[0], start: p[1], zone: p[4] });
      }
    }

    const nextTimeRaw = (r1[3] ?? "").trim() || (metaParts?.[1] ?? "").trim();
    const shiftRaw = (r1[4] ?? "") || (metaParts?.[2] ?? "");
    const onTerritoryRaw = (r1[5] ?? "") || (metaParts?.[3] ?? "");

    let shiftFacts = { morning: 0, evening: 0, night: 0 };
    let shiftTargets = { morning: 0, evening: 0, night: 0 };
    
    if (shiftRaw) {
      const sc = shiftRaw.split("|");
      shiftFacts = {
        morning: parseInt(sc[0]) || 0,
        evening: parseInt(sc[1]) || 0,
        night:   parseInt(sc[2]) || 0,
      };
      if (sc.length >= 6) {
        shiftTargets = {
          morning: parseInt(sc[3]) || 0,
          evening: parseInt(sc[4]) || 0,
          night:   parseInt(sc[5]) || 0,
        };
      }
    }
    
    const onTerritory = onTerritoryRaw ? (parseInt(onTerritoryRaw) || 0) : 0;

    return { 
      status: r1[0].trim(), 
      done, 
      total, 
      nextId: r1[2].trim(), 
      nextTime: nextTimeRaw, 
      activeList, 
      shiftCounts: shiftFacts, 
      shiftFacts,              
      shiftTargets,            
      onTerritory 
    };
  } catch {
    return null;
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// API OBJECT
// ══════════════════════════════════════════════════════════════════════════════

type AuditEventPayload = {
  entityType?: string;
  entityId?: string;
  sheetName?: string;
  sheetDate?: string;
  rowNumber?: string | number;
  containerNo?: string;
  lotNo?: string;
  ws?: string;
  zone?: string;
  photoType?: string;
  oldValue?: unknown;
  newValue?: unknown;
  details?: unknown;
  result?: "success" | "failed" | "partial";
  error?: unknown;
};

type UploadPhotoContext = {
  containerId?: string;
  photoType?: "container" | "seal" | "unloaded" | "issue" | string;
  sheetDate?: string;
  actionType?: string;
};

const _auditThrottle: Record<string, number> = {};

export const api = {
  auditEvent: (action: string, payload: AuditEventPayload = {}, throttleKey?: string, throttleMs: number = 3000): void => {
    if (!getToken()) return;
    const now = Date.now();
    if (throttleKey) {
      const last = _auditThrottle[throttleKey] || 0;
      if (now - last < throttleMs) return;
      _auditThrottle[throttleKey] = now;
    }
    void authPost({
      mode: "audit_event",
      action,
      ...payload,
    }, { timeout: 8000 }).catch(() => undefined);
  },

  fetchDashboard: async (): Promise<DashboardData | null> => {
    return cachedFetch("dashboard", 60000, async () => {
      const res = await fetchWithTimeout(`${SCRIPT_URL}?nocache=${Date.now()}`, { timeout: 60000 });
      const text = await res.text();
      const parsed = parseDashboardData(text);
      if (!parsed) {
        console.error("[dashboard-offline]", {
          reason: "parseDashboardData returned null in fetchDashboard",
          payloadLength: text.length,
          payloadStart: text.slice(0, 200),
        });
      }
      return parsed;
    });
  },

  fetchTasks: async (mode: "get_operator_tasks" | "get_stats"): Promise<Task[]> => {
    return cachedFetch(`tasks_${mode}_${getOperationalSheetName()}`, 60000, async () => {
      const res = await authRead(mode);
      if (!res) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    });
  },

  fetchHistory: async (dateStr: string): Promise<Task[]> => {
    return cachedFetch(`history_${dateStr}`, 60000, async () => {
      const res = await authRead("get_history", { date: dateStr });
      if (!res) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    });
  },

  // One HTTP request that returns { dashboard, tasks }. Falls back to two parallel
  // legacy calls when backend does not yet expose get_dashboard_bundle — this lets
  // frontend and backend roll out independently without breaking prod.
  fetchDashboardBundle: async (dateStr: string): Promise<{ dashboard: DashboardData | null; tasks: Task[] | null }> => {
    return cachedFetch(`bundle_${dateStr}`, 60000, async () => {
      try {
        const res = await authRead("get_dashboard_bundle", { date: dateStr });
        if (!res) throw new Error("NO_TOKEN");
        const text = await res.text();
        if (!text || text.includes("UNKNOWN_MODE")) throw new Error("NO_BUNDLE_ROUTE");
        const json = JSON.parse(text);
        const dashboard = json?.dashboardText ? parseDashboardData(json.dashboardText) : null;
        const tasks = Array.isArray(json?.tasks) ? json.tasks as Task[] : null;
        if (!dashboard) {
          console.error("[dashboard-offline]", {
            reason: "bundle dashboard is null",
            hasDashboardText: !!json?.dashboardText,
            dashboardTextLength: typeof json?.dashboardText === "string" ? json.dashboardText.length : 0,
          });
        }
        return { dashboard, tasks };
      } catch {
        console.error("[dashboard-offline]", {
          reason: "fetchDashboardBundle fallback path",
          dateStr,
        });
        const [dashboard, tasks] = await Promise.all([
          api.fetchDashboard().catch(() => null),
          api.fetchHistory(dateStr).catch(() => null),
        ]);
        return { dashboard, tasks };
      }
    });
  },

  fetchTvLotProgress: async (days = 7): Promise<{ planRows: Array<PlanRow & { sheetDate?: string; sequence?: number }>; tasks: Task[] }> => {
    return cachedFetch(`tv_lot_progress_${days}`, 60000, async () => {
      const res = await fetchWithTimeout(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ mode: "tv_lot_progress", days, ...getAuditClientPayload() }),
        timeout: 60000,
      });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      return {
        planRows: Array.isArray(data?.planRows) ? data.planRows : [],
        tasks: Array.isArray(data?.tasks) ? data.tasks : [],
      };
    });
  },

  fetchFullPlan: async (dateStr: string): Promise<PlanRow[]> => {
    const res = await authRead("get_full_plan", { date: dateStr });
    if (!res) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  fetchLotTracker: async (lot: string): Promise<LotContainer[]> => {
    return cachedFetch(`lot_${lot}`, 60000, async () => {
      const res = await authRead("get_lot_tracker", { lot });
      if (!res) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    });
  },

  getPriorityLot: async (): Promise<string> => {
    return cachedFetch("priority_lot", 600000, async () => {
      const res = await authRead("get_priority_lot");
      if (!res) return "";
      const data = await res.json();
      return (data?.lot || "") as string;
    });
  },

  fetchAllContainers: async (): Promise<string[]> => {
    const res = await authRead("get_all_containers");
    if (!res) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  fetchIssues: async (): Promise<Issue[]> => {
    const res = await authRead("get_issues");
    if (!res) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

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

  // ── LOGIN / REGISTER (ОБНОВЛЕННАЯ ЛОГИКА ДЛЯ PENDING/REJECTED) ───────────────

  login: async (user: string, pass: string): Promise<{ success: boolean; name?: string; role?: string; token?: string; error?: string }> => {
    const hash = await hashPassword(pass);
    try {
      const res = await fetchWithTimeout(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ mode: "login", user, hash, ...getAuditClientPayload() }),
      });
      const txt = await res.text();

      // 1. Успех
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

      // 2. Обработка ошибок (JSON)
      try {
        const json = JSON.parse(txt);
        return { success: false, error: json.error || "UNKNOWN" };
      } catch (e) {
        if (txt.includes("RATE_LIMITED")) return { success: false, error: "RATE_LIMITED" };
        return { success: false, error: "WRONG_PASSWORD" };
      }
    } catch {
      return { success: false, error: "NETWORK_ERROR" };
    }
  },

  register: async (user: string, pass: string, name: string): Promise<boolean> => {
    try {
      const hash = await hashPassword(pass);
      await fetchWithTimeout(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ mode: "register", user, hash, name, ...getAuditClientPayload() }),
      });
      return true;
    } catch {
      throw new Error("NETWORK_ERROR");
    }
  },

  // ── AUTH-PROTECTED WRITES ──────────────────────────────────────────────────

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

  taskAction: async (id: string, act: string, user: string, zone: string | null = "", pGen: string = "", pSeal: string = "", pEmpty: string = "", dateStr: string = ""): Promise<void> => {
    const payload: Record<string, string> = {
      mode: "task_action",
      id,
      act,
      op: user,
      zone: zone || "",
      pGen,
      pSeal,
      pEmpty,
    };
    if (dateStr) payload.date = dateStr;
    await authPost(payload, { timeout: 20000 });
    // Bust client task caches so the immediate refetch returns fresh post-action state.
    invalidateTaskCaches();
  },

  uploadPhoto: async (image: string, mimeType: string, filename: string, context: UploadPhotoContext = {}): Promise<string> => {
    let retries = 3;
    while (retries > 0) {
      try {
        const res = await authPost(
          {
            mode: "upload_photo",
            image,
            mimeType,
            filename,
            containerId: context.containerId || "",
            photoType: context.photoType || "",
            sheetDate: context.sheetDate || "",
            actionType: context.actionType || "",
          },
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

  // ── ADMIN-ONLY ─────────────────────────────────────────────────────────────

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

  updateAccountingStatus: async (taskId: string, system: 'SAP' | 'LES', status: 'WAIT' | 'ACCEPTED' | 'REJECTED', dateStr: string = ''): Promise<boolean> => {
    try {
      const payload: Record<string, string> = { mode: "update_accounting", id: taskId, system, status };
      if (dateStr) payload.date = dateStr;
      const res = await authPost(payload);
      const txt = await res.text();
      return txt.includes("OK");
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "AUTH_EXPIRED") throw e;
      return false;
    }
  },
};
