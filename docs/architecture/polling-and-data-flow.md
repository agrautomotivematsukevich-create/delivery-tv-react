# Polling & data flow

Single source of truth for cadences, cache TTLs, and which endpoint feeds which screen. Update this file whenever a polling loop or TTL changes.

## Cadence table

| Source (file / component) | Endpoint(s) | Interval | Client cache TTL | Server cache TTL | Notes |
|---|---|---|---|---|---|
| `App.tsx::refreshDashboard` | `get_dashboard_bundle` (fallback: `""` + `get_history`) | **45s** | 60s | 15s (today-sheet shared with stats) | Dashboard + today's tasks in one HTTP call. Pauses on `visibilitychange`. Overlap-guarded by `isFetchingRef`. |
| `components/OperatorTerminal.tsx` | `get_operator_tasks` | **45s** | 60s | 15s (shared key `stats_<DDMM>`) | Pauses on hidden. After a task action, an immediate `fetchQueue()` is issued. |
| `components/LotTrackerTV.tsx` (data) | `get_lot_tracker` | **45s** | 60s | — | Pauses on hidden. Server handler scans ≤30 sheets; keeping this from going below 45s is important for backend load. |
| `components/LotTrackerTV.tsx` (priority lot) | `get_priority_lot` | **300s** | 600s | — | Priority lot changes a handful of times per day; don't lower this interval. |
| `components/ZoneDowntimeView.tsx` | `get_history` (today) | **60s** | 60s | — | Only active when the selected date is today and tab is visible. |
| `services/offlineQueue.ts` | — (local IDB only, flush pushes pending actions when online) | **60s** | — | — | Doesn't hit GAS unless queue is non-empty. |

"Client cache TTL" = value passed to `cachedFetch(key, ttl, ...)` in `services/api.ts`. Rule: **TTL ≥ polling interval + safety margin**, otherwise the cache never helps two adjacent ticks.

## Request flow for the dashboard (happy path)

```
Browser                                         Apps Script
  │
  │  GET /?mode=get_dashboard_bundle&date=DDMM&token=...
  ├────────────────────────────────────────────▶ dispatch() → verifyToken (cache hit → no sheet read)
  │                                               │
  │                                               ├─ handleReadComplex (cache hit → returns in <50ms)
  │                                               └─ handleGetStats    (cache hit → returns in <50ms)
  │  JSON: { dashboardText: "...###MSG###", tasks: [...] }
  ◀───────────────────────────────────────────────
  │
  parseDashboardData(dashboardText) → DashboardData
  tasks → setAllTasks (deepEqual guarded)
```

On a cold server cache, the first request within a 15s window pays the sheet-read cost; the next ~14s of requests from any client are served from cache.

## Fallback flow

`services/api.ts::fetchDashboardBundle` catches:
- HTTP error
- Response body containing `"UNKNOWN_MODE"` (backend older than the frontend)
- JSON parse failure

In all three, it issues the legacy `fetchDashboard()` + `fetchHistory(date)` in parallel. This means frontend and backend can be deployed in either order without an outage — but backend-first is preferred so quota savings start immediately.

## Cache invalidation map (server side)

| Write handler | Invalidates |
|---|---|
| `handleTaskAction` (today) | `invalidateTodayReadCache()` |
| `handleTaskAction` (yesterday carryover) | `invalidateTodayReadCache()` + `invalidateDateReadCache(yesterday)` |
| `handleUpdateAccounting` | `invalidateTodayReadCache()` + `invalidateDateReadCache(today)` |
| `handleUpdateContainerRow` | `invalidateDateReadCache(dateStr)` + today-cache if `dateStr === today` |
| `handleCreatePlan` | same as above |
| `handleSetPriorityLot` | (client-side cache key `priority_lot` is deleted in `api.setPriorityLot`) |
| `handleLogin` / `handleApproveUser` / `handleRejectUser` | `invalidateTokenCache(oldToken)` |

No other write handler needs to invalidate (PROBLEMS/SUBSCRIPTIONS/Drive are not in any read cache).

## Known hot paths — treat carefully
- `handleReadComplex` — called on every dashboard tick. Keep its body tight.
- `verifyToken` — called on every auth route. Cache hit is the common path.
- `handleGetLotTracker` — most expensive read (multi-sheet scan). Limits live in `LOT_TRACKER_MAX_*` constants.
