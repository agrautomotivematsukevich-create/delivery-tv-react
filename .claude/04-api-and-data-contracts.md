# API and Data Contracts

## SCRIPT_URL
Reads from `import.meta.env.VITE_SCRIPT_URL` (constants.ts). Missing env var → DEV console.error + empty string (all calls fail).

## Auth transport (updated 2026-04-23)
- **Authenticated reads**: `authRead(mode, extraParams?)` — POST to SCRIPT_URL, body `{mode, token, ...extraParams}`. Token never in URL.
- **Authenticated writes**: `authPost(payload)` — POST, body `{...payload, token}`. Unchanged.
- **Public reads**: `fetchWithTimeout(url)` — GET, no token. (`fetchDashboard` — legacy unauthenticated dashboard).
- `authGet()` exists but is deprecated and uncalled — kept for emergency rollback only.
- GAS `e.headers` is NOT accessible — custom HTTP headers cannot be read server-side.

## Route table (Code.gs ROUTES)

| mode | HTTP | Auth | Lock | Handler | Notes |
|---|---|---|---|---|---|
| `` (empty) | GET | none | no | handleReadComplex | Dashboard text format |
| `login` | POST | none | no | handleLogin | Returns text or JSON |
| `register` | POST | none | lock | handleRegister | — |
| `tv_dashboard` | GET | TV_API_KEY | no | handleTvDashboard | NOT wired to frontend |
| `tv_lot_tracker` | GET | TV_API_KEY | no | handleTvLotTracker | NOT wired to frontend |
| `get_dashboard_bundle` | GET | token | no | handleGetDashboardBundle | Primary bundle endpoint |
| `get_operator_tasks` | GET | token | no | handleGetStats | Same handler as get_stats |
| `get_stats` | GET | token | no | handleGetStats | — |
| `get_history` | GET | token | no | handleGetHistory | Reads cols A–R (18 cols) |
| `get_full_plan` | GET | token | no | handleGetFullPlan | Reads cols A–G (7 cols) |
| `get_lot_tracker` | GET | token | no | handleGetLotTracker | Multi-sheet scan, ≤30 sheets |
| `get_priority_lot` | GET | token | no | handleGetPriorityLot | Reads DASHBOARD!A1 |
| `get_all_containers` | GET | token | no | handleGetAllContainers | Reads col E of the current operational sheet |
| `get_issues` | GET | token | no | handleGetIssues | PROBLEMS sheet, 7 cols |
| `task_action` | POST | token | lock | handleTaskAction | act: start/finish/undo_start/update_photo; accepts optional `date=DD.MM` |
| `report_issue` | POST | token | lock | handleReportIssue | Sends email synchronously |
| `update_container_row` | POST | token | lock | handleUpdateContainerRow | Writes cols B–G |
| `create_plan` | POST | token | lock | handleCreatePlan | Inserts rows, 15 cols |
| `set_priority_lot` | POST | token | lock | handleSetPriorityLot | Writes DASHBOARD!A1 |
| `upload_photo` | POST | token | no | handleUploadPhoto | DriveApp, 45s timeout |
| `update_accounting` | POST | token | lock | handleUpdateAccounting | Writes col Q or R; accepts optional `date=DD.MM` |
| `subscribe_notification` | POST | token | lock | handleSubscribeNotification | SUBSCRIPTIONS sheet |
| `get_pending` | POST | token+ADMIN | no | handleGetPending | Admin only |
| `approve_user` | POST | token+ADMIN | lock | handleApproveUser | Admin only |
| `reject_user` | POST | token+ADMIN | lock | handleRejectUser | Admin only |

## Operational day rule (updated 2026-05-07)

- Backend source of truth: `Code.gs::getOperationalDateInfo()`.
- Timezone: `Europe/Moscow`.
- Cutoff: `06:00` exactly.
- From `00:00` through `05:59`, all implicit “today/current sheet” handlers use the previous calendar sheet.
- From `06:00`, all implicit “today/current sheet” handlers switch to the new calendar sheet.
- Old dual-sheet night carryover in `handleReadComplex`, `handleGetStats`, `handleTvDashboard`, and `handleTaskAction` was removed. These handlers now work against one operational sheet at a time.
- Explicit dated writes (`task_action`, `update_accounting`) may override the implicit operational sheet with `date=DD.MM`; this is used by frontend write paths to avoid wrong-sheet writes if a screen stays open across the 06:00 boundary.

## FRAGILE: handleReadComplex text format

**Response format** (MUST NOT change delimiters or field order):
```
STATUS;done|total;nextId;nextTime;m_fact|e_fact|n_fact|m_target|e_target|n_target;onTerritory
rowId|startTime|0|ws|zone
rowId|startTime|0|ws|zone
###MSG###
```

- Line 0, field 0: `STATUS` = "ACTIVE" | "DONE" | "WAIT"
- Line 0, field 1: `done|total` — pipe-separated counts
- Line 0, field 2: `nextId` — container ID of next waiting
- Line 0, field 3: `nextTime` — ETA string HH:MM
- Line 0, field 4: `m_fact|e_fact|n_fact|m_target|e_target|n_target` — 6 numbers pipe-separated
- Line 0, field 5: `onTerritory` — count of arrived-not-started containers
- Lines 1..N-1 (before ###MSG###): active rows, pipe-separated: id|start|0|ws|zone

**Parser**: `services/api.ts::parseDashboardData(text: string): DashboardData | null`
- Returns null if text is empty, contains "DOCTYPE", or r1.length < 3
- Reads r1[4] for shift counts (6 numbers) — OK if absent (defaults to 0)
- Reads r1[5] for onTerritory — OK if absent (defaults to 0)

**Regression risk**: Any change to delimiter or field position on either side breaks all dashboard displays silently.

## get_dashboard_bundle response

```json
{
  "dashboardText": "<handleReadComplex output>",
  "tasks": [<Task objects from handleGetStats>]
}
```

Frontend detects missing bundle route: if response contains "UNKNOWN_MODE" → falls back to legacy calls.

## handleGetStats / get_operator_tasks response (Task array)

```json
[{
  "id": "CONT-123",
  "type": "AS",
  "pallets": "10/18",
  "phone": "+79001234567",
  "eta": "14:30",
  "status": "WAIT|ACTIVE|DONE",
  "time": "14:30",
  "start_time": "14:35",
  "end_time": "15:05",
  "zone": "G4",
  "operator": "Иванов",
  "photo_gen": "https://drive.google.com/...",
  "photo_seal": "https://drive.google.com/...",
  "arrival_time": "14:25",
  "sheet_date": "07.05"
}]
```

- `sheet_date` is the source sheet of the row. Terminal/dashboard/action flows use it when posting writes back to the backend.

## handleGetHistory response (Task array, full)
Same as above plus `photo_empty`, `sap_status` ("ACCEPTED"|"REJECTED"|"WAIT"), `les_status`.
Reads 18 columns (A–R). If new columns added to sheet, add to this range.

## Login response
- Success: plain text `"CORRECT|DisplayName|ROLE|<token>"`
- Failure: JSON `{"error": "WRONG_PASSWORD"|"RATE_LIMITED"|"PENDING"|"REJECTED"|"NOT_APPROVED"}`
- Rate limited: `{"error":"RATE_LIMITED","retry_after_seconds":300}`

## Auth error detection (frontend)
- `authGet` text-scans for `"AUTH_REQUIRED"` or `"ADMIN_REQUIRED"` → calls `handleAuthError()` → triggers session expiry → auto-logout
- `authPost` same scan

## task_action manual/offline variants (updated 2026-04-24)

- `act=start_manual_HH:mm` writes column H (Start) using the HH:mm suffix instead of server receive time.
- `act=finish_manual_HH:mm` writes column I (End) using the HH:mm suffix instead of server receive time.
- These variants are used by the terminal "no photo" flow and by the offline no-photo queue.
- Terminal/action/offline queue may also send `date=DD.MM` so delayed flushes still write into the original source sheet after the 06:00 operational-day switch.
- Photo actions still use the normal online path: upload photos first, then send `task_action` with photo URLs.
- ActionModal intentionally does **not** enqueue photo uploads offline until flush ordering, deduplication, and idempotency are fully verified.

## Sheet layout (do not reorder)
```
Date sheets (dd.MM), data from row 5:
A=#  B=Lot  C=WS  D=Pallets  E=ContainerID  F=Phone  G=ETA
H=Start  I=End  J=Dur  K=Zone  L=Operator
M=PhotoGen  N=PhotoSeal  O=PhotoEmpty  P=ArrivalTime  Q=SAPStatus  R=LESStatus

Auth DB (USERS sheet), data from row 2:
A=Login  B=Hash  C=Name  D=Role  E=Status  F=Token
```

## AUDIT_LOG sheet

Write-only operational audit sheet in the auth spreadsheet (`Secret_AGR_Auth`, same spreadsheet as `USERS`):
`A=Timestamp  B=Login  C=Name  D=Role  E=Action  F=EntityType  G=EntityId  H=Details  I=Device  J=Result`

- Created lazily by `Code.gs` if missing.
- Written best-effort only from key write handlers (`handleLogin`, `handleUploadPhoto`, `handleTaskAction` for start/finish outcomes).
- Never written from polling/read routes, bundle reads, or `verifyToken`.

## Client-side cache keys (api.ts _cache)

| Key pattern | TTL | Cleared by |
|---|---|---|
| `bundle_DD.MM` | 60s | natural expiry |
| `dashboard` | 60s | natural expiry |
| `tasks_get_operator_tasks_DD.MM` | 60s | natural expiry |
| `history_DD.MM` | 60s | natural expiry |
| `lot_<LOT>` | 60s | natural expiry |
| `priority_lot` | 600s | `api.setPriorityLot` deletes explicitly |

Max 50 entries; oldest pruned on overflow.
