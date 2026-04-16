# Pre-release checklist

Run through this before asking the user to deploy. Keep it short; don't expand into a ceremony.

## Frontend
- [ ] No new `setInterval` without (a) cleanup, (b) `visibilitychange` pause, (c) overlap guard.
- [ ] Any new `api.*` method uses `cachedFetch` with TTL ≥ polling interval.
- [ ] Polling cadences unchanged from the table in `.claude/rules/react-ui.md` (or explicitly justified).
- [ ] No direct `fetch(SCRIPT_URL)` outside `services/api.ts` / `services/offlineQueue.ts`.
- [ ] `parseDashboardData` untouched unless backend delimiter change is in the same PR.
- [ ] TV-mode components do not use `backdrop-blur` or large filters.

## Backend (Code.gs)
- [ ] Every new write handler calls `invalidateTodayReadCache()` / `invalidateDateReadCache(dateStr)` when it mutates a date sheet.
- [ ] Every new auth-changing handler calls `invalidateTokenCache(oldToken)`.
- [ ] New routes added to the `ROUTES` table with correct `auth` / `lock` flags.
- [ ] Read handler output format matches the existing `services/api.ts` parser.
- [ ] `LockService` used for writes; never for reads.

## Rollout order (safe)
1. Deploy `Code.gs` first (new routes are additive; legacy routes unchanged).
2. Verify in Apps Script Executions that the new route is reachable.
3. Deploy frontend. Client has runtime fallback (`fetchDashboardBundle` → parallel legacy calls on `UNKNOWN_MODE`), so order is actually forgiving but backend-first is still preferred.

## Post-deploy quick checks
- Apps Script → Executions: count/hour should drop noticeably within the next polling cycle.
- DevTools → Network: confirm `/?mode=get_dashboard_bundle` appears and cadence matches the polling table.
- Operator terminal: start/finish a task → confirm the next poll shows the updated state within ~15s (server cache TTL).
- TV displays: confirm no blank dashboard and that priority lot still resolves.

## Rollback triggers
- `get_dashboard_bundle` returns malformed payload → the fallback kicks in automatically; no hot-fix needed, but file an issue.
- Server cache causing stale UI after writes → verify the write handler calls the invalidator; if not, that's the bug.
- Token cache letting rejected users through for >60s → verify `invalidateTokenCache` is called in reject/approve.
