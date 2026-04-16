# Business context

Warehouse monitoring for AGR (automotive parts). Single-site operation. Trucks arrive, get assigned to unloading zones, operators mark start/finish, accounting reconciles in SAP/LES. Runs 24/7.

## Roles
- **OPERATOR** — physical floor worker. Uses the Operator Terminal modal on phone/tablet. Start, finish, undo_start, photo upload. High-volume writer.
- **LOGISTIC** — plans arrivals. Uses `/logistics` to create/edit the day's plan rows.
- **AGRL** — read-only oversight role (currently treated as OPERATOR in practice on the frontend, but the backend preserves the distinction).
- **ADMIN** — user approval, full access. Uses AdminPanel to approve/reject `PENDING` registrations.
- **TV (device, not a user)** — unattended display on Android TV boxes in the warehouse. `?tv=1` shows the dashboard view, `?tv=2` shows the lot tracker. Logs in with a regular OPERATOR credential.

## Shifts (Europe/Moscow)
- **Morning** (`morning`): 07:50–16:50 → minutes `[470, 1010)`
- **Evening** (`evening`): 16:50–01:50 → minutes `[1010, 1440) ∪ [0, 110)`
- **Night** (`night`): 01:50–07:50 → minutes `[110, 470)`

"Shift fact" = containers whose `end_time` falls in the shift window. "Shift target" = containers whose ETA falls in the shift window, plus unfinished debt rolled forward from previous shifts. Logic duplicated in `utils/business.ts` (client) and `Code.gs::handleReadComplex` (server) — they must agree.

## Zones and containers
- Unloading zones are physical dock doors, enumerated in `utils/zones.ts::AVAILABLE_ZONES`.
- `UNLOAD_TARGET` (30 min) is the per-container unloading SLA. Elapsed > target → red/pulsing UI.
- A container has: `id`, `lot`, `ws` (workshop), `pallets`, `phone` (driver), `eta`, `start_time`, `end_time`, `zone`, `operator`, `photo_gen`, `photo_seal`, `photo_empty`, `arrival_time`, `sap_status`, `les_status`.
- "On territory" = driver has arrived (`arrival_time` set) but unloading has not started yet.

## Lots
- A "lot" is a shipping lot number that groups multiple containers, possibly spread across multiple days. `LotTrackerTV` (`?tv=2`) and `LotTrackerView` (`/lotTracker`) scan all date sheets to reconstruct a lot's progress.
- The "priority lot" is a single string stored in `DASHBOARD!A1`, set via AdminPanel / LotTrackerView. TV screens without a `?lot=` URL param show whatever is in that cell.

## Date sheets
- One sheet per day, named `dd.MM` (no year). Data rows start at row 5; rows 1–4 are headers/frozen.
- "Night carryover" logic: between 00:00 and ~06:30, unfinished containers from yesterday's sheet still count toward "today" for dashboard and operator queue.

## Accounting
- `SAP` and `LES` are two enterprise systems the office team reconciles against. Status cycles `WAIT → ACCEPTED → REJECTED → WAIT` via tap in `/accounting`.

## Issues
- Any operator can report a problem with a container via `IssueModal`. Entries land in the `PROBLEMS` sheet and trigger an email to `ALERT_EMAIL` (currently `MHReceiving@agr.auto`). Email is synchronous inside the request; don't add more synchronous email sends to hot paths.
