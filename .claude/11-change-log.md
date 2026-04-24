# Change Log

## 2026-04-23 — Initial audit session

**Type**: Read-only audit + memory file creation. No source code modified.

**Files created** (all in `.claude/`):
- `00-project-index.md` — master index, reading order
- `01-current-state.md` — stack, fragility map, entry points
- `02-architecture.md` — module map, data flow, polling cadences
- `03-file-map.md` — important files with touch guidance
- `04-api-and-data-contracts.md` — all routes, formats, fragile contracts
- `05-ui-behavior.md` — screens, TV/desktop gates, visual rules
- `06-performance-hotspots.md` — concrete hotspots with locations
- `07-security-risks.md` — risks by severity, fix priority
- `08-editing-rules.md` — per-area edit rules, non-negotiables
- `09-open-questions.md` — confirmed unknowns
- `10-audit-report.md` — structured findings by priority
- `11-change-log.md` — this file

**Source files read** (not modified):
- `CLAUDE.md`, `.claude/rules/*` (3 files)
- `docs/architecture/polling-and-data-flow.md`, `docs/architecture/system-map.md`
- `docs/knowledge/project-decisions.md`, `docs/knowledge/business-context.md`
- `App.tsx`, `index.tsx`, `types.ts`, `constants.ts`
- `services/api.ts`, `services/offlineQueue.ts`
- `Code.gs`
- `components/Dashboard.tsx`, `components/OperatorTerminal.tsx`
- `components/LotTrackerTV.tsx` (partial), `components/AppContext.tsx`
- `components/ZoneDowntimeView.tsx` (partial)
- `utils/business.ts`, `utils/zones.ts`
- `vite.config.ts`, `package.json`

**Key findings summary** (details in `10-audit-report.md`):
- 2 critical: hardcoded secrets in version control (SECRET_AUTH_DB_ID, TV_API_KEY)
- 3 high: token in URL, 1s UI timer on TV, offlineQueue no timeout
- 4 medium: shift math drift risk, PWA cache too long, minor architecture notes
- 3 low: cleanup items

**Next session**: Start with CR1+CR2 (Script Properties migration) — highest impact, zero risk.

---

## 2026-04-23 — Wave 1 remediation

**Type**: Code changes (all confirmed before editing). No API contracts changed.

**Source files modified**:
- `Code.gs` — C1+C2: TV_API_KEY and SECRET_AUTH_DB_ID moved to PropertiesService. **Requires manual Script Properties setup before deploying** (see Manual Steps below).
- `components/ZoneDowntimeView.tsx` — 1s → 60s currentTime interval. Visual accuracy unchanged (shows minutes).
- `components/Header.tsx` — 1s → 30s clock interval. Display is HH:MM only, no seconds.
- `vite.config.ts` — PWA SW cache maxAgeSeconds 86400 → 60; removed unused GEMINI_API_KEY defines.
- `services/offlineQueue.ts` — Added `fetchWithTimeout` helper with 30s AbortController; all 3 flush fetch calls now use it.
- `constants.ts` — Added DEV-mode guard warning when VITE_SCRIPT_URL is not set.

**Memory files updated**: `07-security-risks.md` (C1/C2 resolved), `11-change-log.md` (this entry).

**Remaining open**: H2 (photo MIME magic bytes) — deferred, low priority, closed system.

---

## 2026-04-23 — H1 remediation: token out of URL

**Type**: Frontend-only change. Zero backend changes.

**Key finding**: GAS `e.headers` is inaccessible — custom HTTP headers cannot be read server-side. POST body is the only safe alternative. `dispatch()` in Code.gs is HTTP-method agnostic, so all read routes accept POST with zero backend changes.

**Source files modified**:
- `services/api.ts` — Added `authRead(mode, extraParams?)` helper (POST-based). Replaced all 8 `authGet(...)` call sites with `authRead(...)`. `authGet` kept deprecated/uncalled for rollback. Removed `?nocache=Date.now()` URL hacks (POST not cached by GAS).

**Memory files updated**: `07-security-risks.md` (H1 resolved), `04-api-and-data-contracts.md` (auth transport section updated), `11-change-log.md` (this entry).

---

## 2026-04-23 — Wave 2: low-risk frontend fixes

**Type**: Frontend-only. No API contracts changed. No backend changes. No deploy.

**Confirmed bugs fixed:**
- `components/HistoryView.tsx` — `fetchData` missing try/finally: on network error `setLoading(false)` never ran → permanent spinner. Fixed with try/catch/finally.
- `components/ArrivalAnalyticsView.tsx` — same bug, same fix.
- `components/LotTrackerView.tsx` — `doSearch` missing try/finally: same stuck-spinner bug. Fixed.
- `components/LotTrackerTV.tsx` — `getPriorityLot` 5-min polling had no visibility handler. Added stop/start on `visibilitychange` (consistent with main fetchData polling below it).

**Cross-reference comments added:**
- `utils/business.ts::currentShift` — comment pointing to `Code.gs::handleReadComplex` isNightCarryover, with shift boundary times.

**Cleanup:**
- `vite.config.ts` — removed empty `define: {}` key left from Wave 1.

**Deferred (not taken in this wave):**
- `Notification.tsx` — dead component (never imported), but file deletion is higher-risk action. Defer.
- `authGet` in `services/api.ts` — deprecated stub, safe to remove in next cleanup wave.
- `HistoryView.tsx::getDriveImgSrc` — duplicates proxy logic from `api.getProxyImage`. Refactor deferred.
- Visibility handlers on pure-UI tick timers (no api.* calls) — not required by rules.

**Memory files updated**: `11-change-log.md`, `06-performance-hotspots.md` (LotTrackerTV lot poll fixed).

---

## 2026-04-23 — Pre-release final fixes (Wave 2b)

**Type**: Two targeted bug fixes before production rollout.

- `constants.ts` — `??` → `||` in SCRIPT_URL guard. `??` misses `VITE_SCRIPT_URL=""` (empty string is not nullish). `||` catches both undefined and empty.
- `components/LotTrackerTV.tsx` — Added `if (!id)` guard in `onVis` visible-branch to prevent duplicate interval on rapid visibility toggling. Mirrors the pattern in `start()` used by the fetchData effect in the same file.

---

## 2026-04-24 — Worker feedback fixes

**Type**: Targeted production-risk fixes. No push/deploy.

**Source files modified**:
- `App.tsx` — added night zero-plan guard: before 07:00 Moscow time, a valid empty dashboard response no longer overwrites the last non-zero dashboard snapshot. Includes 12h localStorage fallback for TV reloads.
- `components/ActionModal.tsx` — safe offline MVP: offline photo-mode is blocked with clear UI; offline "no photo" mode queues only `task_action`; photo uploads are not enqueued.
- `components/OperatorTerminal.tsx` — action result now distinguishes `completed` vs `queued`; cancel sentinel `USER_CANCELLED` is ignored and does not show the generic error toast.
- `types.ts` — added `TaskActionResult` and typed action resolve/reject callbacks.
- `Code.gs` — `start_manual_HH:mm` / `finish_manual_HH:mm` now write the manual HH:mm time instead of backend receive time.

**Memory files updated**: `04-api-and-data-contracts.md`, `05-ui-behavior.md`, `11-change-log.md`.

**Deferred intentionally**:
- Full offline photo queue remains deferred until flush ordering, deduplication, and idempotency are verified end to end.
- Full "show previous operational day regardless of non-zero next-day plan" was not implemented; current guard only blocks the confirmed zero-response overwrite before 07:00.

---

## 2026-04-24 — Terminal success easter egg

**Type**: Frontend-only UX addition. No backend/API changes. No push/deploy.

**Source files modified**:
- `components/ActionModal.tsx` — added a tiny secondary compliment line inside the existing online success-state only.

**Behavior**:
- Target user: `user.user === 'u001185'` and role `OPERATOR`.
- Preview user: `user.user === 'barromz'` and role `ADMIN`.
- Phrases are limited to the two approved variants and stored locally by login + 16:40-01:30 Moscow shift identifier.
- Max 2 shows per shift, with at least 2 hours between shows, and no immediate phrase repeat.
- Not shown on cancel, error, queued/offline state, or for other users.

**Memory files updated**: `05-ui-behavior.md`, `11-change-log.md`.

---

## 2026-04-24 — Terminal success easter egg visibility update

**Type**: Frontend-only UX adjustment. No backend/API changes. No push/deploy.

**Source files modified**:
- `components/ActionModal.tsx` — changed the compliment from a small success subtitle to a separate fullscreen stage after the existing `Успешно!` state.

**Behavior**:
- Online success first shows `Успешно!` for ~1.4s.
- If the local per-shift compliment limit allows it, a fullscreen compliment stage follows for ~3.2s and then auto-closes.
- No buttons or confirmation required; no toast/modal/backend changes.
- Existing target/preview users, 2-per-shift limit, 2h interval, localStorage failure fallback, and cancel/error/queued exclusions remain unchanged.
- Escape is ignored during upload/success/compliment/queued states so a completed action cannot accidentally fall into the cancel path.

**Memory files updated**: `05-ui-behavior.md`, `11-change-log.md`.
