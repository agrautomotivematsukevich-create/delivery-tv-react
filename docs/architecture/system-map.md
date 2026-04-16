# System map

Minimal orientation for navigating the repo. If a file is not listed, it is a leaf component/utility and is cheap to read on demand.

## Runtime-critical (read these first for any nontrivial change)
| Path | Role |
|---|---|
| `App.tsx` | Root shell. Owns dashboard polling loop (`refreshDashboard`) and LKG fallback. Routes by pathname + `?tv=1`/`?tv=2` URL flags. |
| `services/api.ts` | All HTTP to Apps Script. Owns client cache (`cachedFetch`), in-flight dedup, auth token handling, session-expiry callback. |
| `services/offlineQueue.ts` | IndexedDB-backed queue for task actions and photo uploads. Auto-flushes on `online` event and every 60s. |
| `Code.gs` | Single-file Apps Script backend. `ROUTES` table dispatches by `mode`. Owns auth (`verifyToken`), today-sheet read cache, and all spreadsheet IO. |
| `constants.ts` | `SCRIPT_URL` (Vite env var), i18n strings. |

## Frontend — views and where they poll
| Component | Screen | Own polling? |
|---|---|---|
| `components/Dashboard.tsx` | `/` dashboard (desktop + `?tv=1`) | No. Consumes props from `App.tsx` polling. |
| `components/OperatorTerminal.tsx` | Modal — operator queue | Yes — `get_operator_tasks` every 45s (pauses on hidden). |
| `components/LotTrackerTV.tsx` | `?tv=2` full-screen | Yes — lot data 45s + priority lot 300s (both pause on hidden). |
| `components/LotTrackerView.tsx` | `/lotTracker` inline | No polling loop; fetch on demand. |
| `components/HistoryView.tsx` | `/history` | No polling; fetches on date change. |
| `components/AccountingView.tsx` | `/accounting` | No polling; fetches today once on mount. |
| `components/LogisticsView.tsx` | `/logistics` plan editor | No polling; fetches on date change. |
| `components/ZoneDowntimeView.tsx` | `/downtime` | Yes — `fetchHistory(today)` every 60s when `isToday`, pauses on hidden. |
| `components/ArrivalAnalyticsView.tsx` | `/arrival` | No polling; fetches on date change. |
| `components/AdminPanel.tsx` | Admin users modal | No polling. |
| `components/IssueModal.tsx` / `IssueHistoryModal.tsx` / `HistoryModal.tsx` | Issue reporting | No polling. |
| `components/StatsModal.tsx` | Daily stats | No polling. |
| `components/ActionModal.tsx` | Start/finish task flow | No polling. |
| `components/AuthModal.tsx` / `TVLoginScreen.tsx` | Login UI | No polling. |
| `components/Header.tsx` | Top bar (clock ticks every 1s locally, no network) | No polling. |

## Utilities
- `utils/time.ts` — time parsing (`parseHHMM`, `elapsedMin`, etc.). Used everywhere — do not break signatures.
- `utils/business.ts` — shift fact/target math (`currentShift`, `calculateShiftFact`, `calculateShiftTargets`). Mirrors logic in `Code.gs::handleReadComplex` — if one side changes, the other must too.
- `utils/zones.ts` — `AVAILABLE_ZONES`, `UNLOAD_TARGET`. Warehouse-layout constants.
- `utils/deepEqual.ts` — structural equality for polled arrays/objects.
- `utils/haptics.ts` — vibrate wrapper.
- `utils/useEscape.ts` — Esc-to-close hook for modals.
- `utils/ImageWorker.ts` — offloaded image compression for photo upload.

## Build / config
- `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `vercel.json` — standard, rarely touched.
- `index.html`, `index.tsx` — mount + global styles (`index.css`).
- `public/llms.txt`, `seoConfig.ts`, `components/PageMeta.tsx` — metadata for LLM indexers / SEO. Leave alone unless explicitly requested.

## External systems
- Google Sheets (primary spreadsheet) — warehouse plan, today's containers, `DASHBOARD`, `PROBLEMS`, `SUBSCRIPTIONS`. Source of truth.
- Google Sheets (secret auth DB, id in `Code.gs::SECRET_AUTH_DB_ID`) — `USERS` sheet only. Isolated from primary.
- Google Drive — photo storage via `handleUploadPhoto`; returned as public-link URL.
- `wsrv.nl` — public image proxy used in `api.getProxyImage` to render Drive photos in the client.
