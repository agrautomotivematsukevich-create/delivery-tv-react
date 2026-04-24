# Performance Hotspots

## Backend hotspots

### 1. handleReadComplex (Code.gs line 542)
**Why hot**: Called on every dashboard tick via get_dashboard_bundle. Cold cache: reads entire today's sheet (`getDisplayValues` up to 16 cols × all rows) plus yesterday on night carryover.
**Mitigation already in place**: 15s CacheService TTL shared with handleGetStats. All concurrent clients in a 15s window share one sheet read.
**Do not**: Add extra sheet reads, SpreadsheetApp.flush(), or email sends inside this function.
**Verify after edit**: Check Apps Script Executions → mean duration should stay < 500ms on cache hit.

### 2. verifyToken (Code.gs line 181)
**Why hot**: Called on every authenticated route. Cold cache: opens SECRET_AUTH_DB_ID spreadsheet + full-sheet read.
**Mitigation**: 60s CacheService TTL. Token hash is the cache key.
**Do not**: Lower TOKEN_CACHE_TTL_OK or add new logic between cache check and return.

### 3. handleGetLotTracker (Code.gs line 842)
**Why hot**: Iterates all sheets (max 30), does narrow pre-scan then full read on matches. O(sheets × rows).
**Mitigation**: LOT_TRACKER_MAX_SHEETS=30, LOT_TRACKER_MAX_RESULTS=100.
**Do not**: Lower limits or add extra getRange calls inside the loop.

### 4. handleGetDashboardBundle (Code.gs line 735)
**Why hot**: Calls both handleReadComplex and handleGetStats. Two ContentService outputs + JSON parsing.
**Current state**: Both sub-handlers share the same CacheService cache, so no extra sheet reads.
**Future optimization noted in comment**: Single-pass implementation would eliminate the double ContentService call. Not worth the risk until stable.

## Frontend hotspots

### 5. ZoneDowntimeView setInterval (line 47) — RESOLVED (changed to 60s in Wave 1)
**Why hot**: `setCurrentTime(new Date())` every second. Triggers a React re-render every second. On TV screens (always-on), this is continuous CPU burn.
**Location**: `components/ZoneDowntimeView.tsx`, lines 46-51.
**Fix**: Replace with 60s interval (sufficient for minute-level idle display) or compute time from existing state values.
**Risk**: Low — pure UI, no network.

### 6. UnloadTimer 30s setInterval (Dashboard.tsx line 13)
**Why hot**: One instance per active container in the active list. If many containers are active simultaneously, multiple intervals run.
**Current state**: Already optimized — 30s is fine for minute display.
**Do not**: Lower below 30s.

### 7. offlineQueue.ts raw fetch (line 163, 181, 197)
**Why hot**: Uses raw `fetch` without timeout. A stalled request during flush blocks the entire flush loop sequentially.
**Do not**: Lower the 10-retry cap. Consider adding AbortController timeout if flush stalls are reported.

### 8. Dashboard ShiftNormWidget — 60s interval (line 70)
**Location**: `components/Dashboard.tsx`, ShiftNormWidget, line 70.
**Why hot**: Ticks every 60s to update `nowMin` for the progress bar marker. One interval per Dashboard mount — acceptable.

### 9. OperatorTerminal pendingCount polling (line 84)
**Why hot**: `setInterval(check, 5000)` — checks offlineQueue.count() every 5 seconds while modal is open.
**Current state**: count() reads from `_cachedCount` (in-memory), no IDB reads per tick. Acceptable.

### 10. PWA update check (PwaUpdateBanner.tsx)
**Why hot**: Service worker `registration.update()` is checked while the app stays open so clients do not remain on old cached frontend after a release.
**Current state**: 30-minute interval, visible-tab only, overlap guarded by `updateCheckInFlightRef`, cleaned up on unmount. No backend/API calls.
**Do not**: Lower below 30 minutes or show update UI over terminal/action flows.

## How to verify after edits

- **Backend**: Apps Script → Executions → filter by function → check avg/max duration.
- **Frontend timing**: Chrome DevTools → Performance tab → record 45s polling cycle → check for layout thrash or unnecessary re-renders.
- **Request count**: DevTools → Network → count calls to SCRIPT_URL per minute. Should be ~1 per 45s from any single tab.
- **TV screen**: Open on low-end device (or throttle CPU 6x in DevTools) — should render without jank on 45s cycle.
