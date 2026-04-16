# Apps Script (Code.gs) rules

## Cost model
Every new `doGet`/`doPost` invocation counts against daily GAS executions quota. Minimize:
1. Number of HTTP calls from frontend (bundle > split).
2. `SpreadsheetApp.openById(...)` calls (secret DB in particular).
3. `getRange().getValues()/getDisplayValues()` width and row count.

## Caching layers (already wired — extend, don't replace)
- `verifyToken` — `CacheService.getScriptCache()` keyed by MD5(token). TTL 60s positive, 30s negative. **Invalidated** in `handleLogin` (on new token), `handleApproveUser`, `handleRejectUser`. If you add another flow that revokes/rotates a token, call `invalidateTokenCache(oldToken)`.
- Today-sheet read cache — keys `rcx_<DDMM>` and `stats_<DDMM>`, TTL 15s. **Invalidated** by `invalidateTodayReadCache()` in `handleTaskAction`, `handleUpdateContainerRow`, `handleCreatePlan`, `handleUpdateAccounting`. Any new write that mutates today's sheet **must** call `invalidateTodayReadCache()`. If the write targets a non-today date, call `invalidateDateReadCache(dateStr)` too.

## Route table
- Reads in the bundle endpoint (`get_dashboard_bundle`) are intentionally composed of `handleReadComplex` + `handleGetStats`. Don't "optimize" by inlining duplicated sheet reads — the 15s server cache already amortizes the extra call across concurrent clients.
- TV routes (`tv_dashboard`, `tv_lot_tracker`) use the static `TV_API_KEY` and skip `verifyToken`. They exist but the current frontend does not use them. Don't remove.

## Contracts — do not change without frontend coordination
- `handleReadComplex` output format: `STATUS;DONE|TOTAL;NEXTID;NEXTTIME;M|E|N|mT|eT|nT;ONTER\n<activeRows>\n###MSG###`. `parseDashboardData` in `services/api.ts` depends on exact delimiters.
- Sheet layout for date sheets: `A=#  B=Lot  C=WS  D=Pallets  E=ContainerID  F=Phone  G=ETA  H=Start  I=End  J=Dur  K=Zone  L=Operator  M=PhotoGen  N=PhotoSeal  O=PhotoEmpty  P=ArrivalTime  Q=SAPStatus  R=LESStatus` (data from row 5).
- Secret auth DB layout: `A=Login  B=Hash  C=Name  D=Role  E=Status  F=Token` (data from row 2). Never widen/reorder.

## Write handler checklist
- `LockService.getScriptLock().tryLock(12000)` via `ROUTES[...].lock: true` for any write.
- After mutating a sheet → call the appropriate `invalidate*ReadCache(...)`.
- Return the same text/JSON shape the frontend already parses (look at the caller in `services/api.ts` first).

## Anti-patterns
- `DriveApp` operations inside hot-path reads — already restricted to `upload_photo` and `report_issue`, keep it that way.
- `SpreadsheetApp.flush()` without a reason — expensive, not needed for current write patterns.
- Email/notification sends inside read handlers — keep those only in `handleReportIssue` and scheduled triggers.
- Iterating all sheets — `handleGetLotTracker` already uses `LOT_TRACKER_MAX_SHEETS=30` and `LOT_TRACKER_MAX_RESULTS=100`. Preserve those limits.
