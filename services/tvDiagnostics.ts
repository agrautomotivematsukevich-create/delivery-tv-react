const HEARTBEAT_INTERVAL_MS = 45000;
const APP_NAME = "delivery-tv-react";
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.1.0";

type TvMode = "tv1" | "tv2" | "unknown";

interface TvDiagnosticsState {
  started: boolean;
  endpoint: string;
  pageStartedAt: number;
  heartbeatId: number | null;
  lastSuccessfulDataAt: string | null;
  lastError: string | null;
}

const state: TvDiagnosticsState = {
  started: false,
  endpoint: "",
  pageStartedAt: Date.now(),
  heartbeatId: null,
  lastSuccessfulDataAt: null,
  lastError: null,
};

function getEndpoint(): string {
  return (import.meta.env.VITE_TV_DIAG_URL || "").replace(/\/+$/, "");
}

function getTvMode(): TvMode {
  const params = new URLSearchParams(window.location.search);
  const tv = params.get("tv");
  if (tv === "1") return "tv1";
  if (tv === "2") return "tv2";
  return "unknown";
}

function isTvUrl(): boolean {
  const mode = getTvMode();
  return mode === "tv1" || mode === "tv2";
}

function shouldRun(): boolean {
  return Boolean(getEndpoint()) && isTvUrl();
}

function nowIso(): string {
  return new Date().toISOString();
}

function getMemoryInfo() {
  const perf = performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
      totalJSHeapSize?: number;
      jsHeapSizeLimit?: number;
    };
  };

  return {
    usedJSHeapSize: perf.memory?.usedJSHeapSize ?? null,
    totalJSHeapSize: perf.memory?.totalJSHeapSize ?? null,
    jsHeapSizeLimit: perf.memory?.jsHeapSizeLimit ?? null,
  };
}

function basePayload() {
  return {
    clientTimestamp: nowIso(),
    url: window.location.href,
    path: window.location.pathname,
    search: window.location.search,
    tvMode: getTvMode(),
    userAgent: navigator.userAgent || "",
    visibilityState: document.visibilityState,
    online: navigator.onLine,
    pageUptimeMs: Date.now() - state.pageStartedAt,
  };
}

function heartbeatPayload() {
  return {
    ...basePayload(),
    viewport: {
      width: window.innerWidth ?? null,
      height: window.innerHeight ?? null,
      devicePixelRatio: window.devicePixelRatio ?? null,
    },
    lastSuccessfulDataAt: state.lastSuccessfulDataAt,
    lastError: state.lastError,
    memory: getMemoryInfo(),
    app: {
      name: APP_NAME,
      version: APP_VERSION,
    },
  };
}

function stringifyError(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function errorStack(error: unknown): string | null {
  return error instanceof Error ? error.stack ?? null : null;
}

function postJson(path: "/api/tv/heartbeat" | "/api/tv/event", payload: unknown, keepalive = false): void {
  if (!state.endpoint) return;

  fetch(`${state.endpoint}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive,
  }).catch(() => undefined);
}

function sendBeaconOrFetch(path: "/api/tv/event", payload: unknown): void {
  if (!state.endpoint) return;
  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(`${state.endpoint}${path}`, blob)) return;
    } catch {
      // Fall through to keepalive fetch.
    }
  }

  postJson(path, payload, true);
}

function sendHeartbeat(): void {
  postJson("/api/tv/heartbeat", heartbeatPayload());
}

function sendEvent(
  eventType: string,
  extra: { message?: string | null; stack?: string | null; reason?: string | null } = {},
  unload = false,
): void {
  const payload = {
    ...basePayload(),
    eventType,
    message: extra.message ?? null,
    stack: extra.stack ?? null,
    reason: extra.reason ?? null,
  };

  if (unload) sendBeaconOrFetch("/api/tv/event", payload);
  else postJson("/api/tv/event", payload);
}

function handleVisibilityChange(): void {
  sendEvent("visibilitychange");
}

function handlePageHide(): void {
  sendEvent("pagehide", {}, true);
}

function handleBeforeUnload(): void {
  sendEvent("beforeunload", {}, true);
}

function handleOnline(): void {
  sendEvent("online");
}

function handleOffline(): void {
  sendEvent("offline");
}

function handleError(event: ErrorEvent): void {
  state.lastError = event.message || stringifyError(event.error);
  sendEvent("error", {
    message: event.message || null,
    stack: event.error instanceof Error ? event.error.stack ?? null : null,
    reason: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : null,
  });
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  state.lastError = stringifyError(event.reason);
  sendEvent("unhandledrejection", {
    message: state.lastError,
    stack: errorStack(event.reason),
    reason: stringifyError(event.reason),
  });
}

export const tvDiagnostics = {
  start(): void {
    if (state.started || !shouldRun()) return;

    state.endpoint = getEndpoint();
    if (!state.endpoint) return;
    state.started = true;

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    sendHeartbeat();
    state.heartbeatId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  },

  stop(): void {
    if (!state.started) return;

    if (state.heartbeatId) {
      window.clearInterval(state.heartbeatId);
      state.heartbeatId = null;
    }

    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);

    state.started = false;
  },

  markDataSuccess(source: string): void {
    if (!shouldRun()) return;
    void source;
    state.lastSuccessfulDataAt = nowIso();
  },

  markError(error: unknown): void {
    if (!shouldRun()) return;
    state.lastError = stringifyError(error);
    sendEvent("error", {
      message: state.lastError,
      stack: errorStack(error),
    });
  },
};
