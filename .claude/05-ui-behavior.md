# UI Behavior

## Routing / mode gates

`App.tsx` reads `?tv=1` and `?tv=2` once on mount via `useMemo` (not recalculated on re-render).

```
?tv=1 (isTV=true)   → TV dashboard mode (fixed inset-0, no header, solid bg)
?tv=2 (isTV2=true)  → TV lot tracker mode (fixed inset-0, LotTrackerTV)
neither             → desktop/phone mode (header, footer, full nav)
```

**TV login gate**: If `(isTV || isTV2) && !user` → shows `TVLoginScreen`. After login, loads dashboard.
**TV2 gate**: After login on TV2, renders `LotTrackerTV` with `?lot=` param or sheet-read priority lot.

**Do not alter**: `isTV` and `isTV2` are real production routes, checked as `?tv=1` / `?tv=2`. They live as constants derived from URL — no URL navigation changes them after load.

## TV-specific rendering rules

- **No `backdrop-blur`** — GPU-intensive, breaks on weak Android TV boxes
- **No heavy box-shadow layers** — ok to use single `shadow-lg`, avoid multiple layered shadows
- **No framer-motion** animations or CSS `animation` on fast-cycling elements
- **Solid `rgba(...)` or `bg-[rgba(25,27,37,0.95)]` backgrounds** instead of glass blur
- Dashboard TV glass class: `"bg-[rgba(25,27,37,0.95)] border border-white/10..."` (vs desktop: `backdrop-blur-xl`)
- Clock updates every 30s (not 1s) — sufficient for HH:MM display

## Main screens

| Route | Component | Polling | Notes |
|---|---|---|---|
| `/` | Dashboard | via App.tsx (prop-driven) | TV mode different layout: 3-column grid |
| `/history` | HistoryView | on demand | Date picker + load button |
| `/logistics` | LogisticsView | on demand | Plan editor (LOGISTIC role) |
| `/downtime` | ZoneDowntimeView | 60s when today | Has a 1s `currentTime` ticker |
| `/arrival` | ArrivalAnalyticsView | on demand | Analytics off fetched history |
| `/lotTracker` | LotTrackerView | on demand | Desktop lot search |
| `/accounting` | AccountingView | once on mount | Current SAP/LES status + explicit next-click action labels |
| `?tv=2` | LotTrackerTV | 45s + 300s | Full-screen TV lot tracker |

## Accounting view

- `AccountingView` is a phone/desktop-only route. TV branches (`?tv=1`, `?tv=2`, `LotTrackerTV`) do not render it.
- Each SAP/LES control shows the current status in the top badge and the exact result of the next click on the button below (`Принять`, `Не принять`, `Ожидает`).
- On mobile, task metadata stays compact and SAP/LES controls use one column at `360/375px`, then split into two columns from `390px` upward to avoid horizontal overflow.

## Dashboard layout

**TV mode** (`tvMode=true`): CSS grid `360px 1fr 320px`, fixed columns. Three panels: progress/shifts | queue/active | zones/clock.
**Desktop mode**: non-TV dashboard uses a centered max-width shell with golden-ratio layout (`lg:grid-cols-[38%_1fr]`). Left: compact overview panel with progress, status chip, KPI counters, shift norm, and shifts. Right: operational workspace with stronger next-container card, waiting-unload card, compact active list, and dock-zone matrix.
**Mobile mode**: remains single-column inside `app-shell`; active cards use a two-column mobile-safe grid and the dock matrix stays `2 -> 3 -> 6` columns by breakpoint.
**Do not alter**: TV dashboard remains the separate `tvMode` branch above and keeps `360px 1fr 320px`.

## Mobile polish (2026-04-27)

- Non-TV shell uses `app-shell` for mobile-safe height and safe-area padding; TV branches keep their existing fullscreen behavior.
- `index.css` owns lightweight helpers: `app-shell`, `mobile-modal-frame`, `no-scrollbar`, and safe-area/mobile utilities.
- `Header.tsx` has improved mobile nav, tap targets, and responsive labels.
- `Dashboard.tsx` keeps the same structure, with lower mobile density and cleaner spacing/type scale.
- `ActionModal.tsx`, `AuthModal.tsx`, and `IssueModal.tsx` behave as mobile bottom sheets below `sm`, using `100dvh`, safe padding, and internal scroll.
- `OperatorTerminal.tsx` keeps the same terminal flow, with improved mobile header/task cards/action controls.
- Backend, API contracts, auth, offline queue, PWA, polling, desktop layout, and TV branches were not changed by this polish.
- Regression note: mobile modals are intentionally bottom sheets below `sm`; desktop/tablet modal behavior remains centered.

## Key visual behaviors

- **Offline banner**: `fixed top-0 w-full bg-red-500` when `isOffline=true` (App.tsx). Never clears until a successful response.
- **PWA update banner**: `PwaUpdateBanner` is mounted from `App.tsx` and uses `vite-plugin-pwa` prompt lifecycle. Desktop/mobile users see a small bottom-corner banner only after an update is waiting, never during splash, terminal, action modal, auth/admin/stats/issue modals, or other blocked flows. `Обновить` activates the waiting service worker and reloads; `Позже` hides it for 30 minutes in the current session. In TV modes the banner is not rendered; after TV login/app-ready, an available update auto-applies after a 60s quiet delay because there is no operator click target.
- **Splash screen**: `SplashScreen` shown until `isLoading=false`. Fades out.
- **LKG preservation**: `dashboardData` in AppContext never set to null after first successful fetch. `allTasks` likewise (null response = keep prev).
- **Night zero-plan guard**: before 07:00 Moscow time, `App.tsx` does not replace the last non-zero dashboard snapshot with a valid but empty (`total=0`, no active/territory) response. It keeps in-memory LKG, with a 12h localStorage fallback for TV reloads.
- **deepEqual guard**: `setDashboardData` and `setAllTasks` only called if data actually changed. Prevents ripple re-renders.
- **UnloadTimer** (Dashboard): updates every 30s; shows countdown to `UNLOAD_TARGET=30min`; pulses red when over.
- **DockZonesGrid**: idle time shown for zones that had at least one completed task today.
- **ShiftNormWidget**: shows current shift progress bar with "expected by now" marker line.

## Operator Terminal modal

- Triggered from Header → `setShowTerminal(true)` → mounts `OperatorTerminal`
- Starts/stops its own 45s polling (also pauses on hidden)
- Task actions: `start` → opens `ActionModal` (photo capture flow) → `handleActionSuccess` → `refreshDashboard()`
- Offline MVP: the terminal still opens `ActionModal` while offline. Photo-mode is blocked with an explanatory message; "no photo" mode queues only `task_action` locally.
- Cancel/dismiss/close rejects the action promise with `USER_CANCELLED`; `OperatorTerminal` ignores that sentinel and does not show an error toast.
- Undo: calls `task_action` with act=`undo_start` directly via `api.taskAction`
- Shows offline/pending badge in header when `!isOnline || pendingCount > 0`

## ActionModal flow (photo capture)

`handleTaskActionRequest(task, 'start'|'finish')` → returns Promise → `setCurrentAction` → mounts `ActionModal` with `onResolve/onReject`.
ActionModal handles zone selection, photo capture/upload, then calls `api.taskAction`.
On online success → `handleActionSuccess('completed')` → `onResolve('completed')` + `refreshDashboard()`.
On offline no-photo queue → `handleActionSuccess('queued')` → terminal shows a local-save toast.
Photo uploads are intentionally not queued offline until ordering/idempotency is verified.

## i18n

Two languages: `'RU'` (default) and `'EN_CN'` (bilingual RU/CN labels). Toggled via Header button. All UI text goes through `t: TranslationSet` prop passed down from `App.tsx`. `TRANSLATIONS` object is in `constants.ts`.

## Modals lifecycle

All modals are conditional renders (`{showX && <Modal />}`). They unmount when closed — no hidden modal polling. Exception: `OperatorTerminal` polling cleanup happens inside the modal itself on unmount.
