# delivery-tv-react — Claude Notes

Warehouse monitoring app (AGR). React+Vite+TS frontend talking to a **Google Apps Script** Web App backend (`Code.gs`). Runs **24/7** on Android TV, operator phones, desktop. Production. Shared sheet is the source of truth.

## Non-negotiables
1. **GAS quota is the scarce resource.** Every change is weighed by its effect on requests/min to the Apps Script Web App. Reducing request count beats code elegance.
2. **No refactor-for-beauty.** Minimal, targeted edits. No renaming, no reformatting, no "while I'm here" cleanup.
3. **Don't break the frontend↔GAS contract.** `parseDashboardData` parses a fragile `;`/`|`-delimited string from `handleReadComplex`. If the delimiters or field order change on either side, the dashboard goes blank in prod.
4. **Don't regress offline/LKG behavior.** `App.tsx::refreshDashboard` preserves Last Known Good data on null responses — keep that pattern in any new polling loop.

## Reading order when working on a task
- Polling/perf/quota → `docs/architecture/polling-and-data-flow.md`
- Code structure / what-lives-where → `docs/architecture/system-map.md`
- Why is X the way it is → `docs/knowledge/project-decisions.md`
- Domain vocab (shifts, zones, lots) → `docs/knowledge/business-context.md`
- Editing React UI → `.claude/rules/react-ui.md`
- Editing `Code.gs` → `.claude/rules/gas-backend.md`
- Before shipping → `.claude/rules/release-check.md`

## Things Claude cannot infer from code
- TV devices are weak Android TV boxes: no backdrop-blur, no heavy GPU effects, no fancy animations.
- `isTV` / `isTV2` URL modes are **real production routes** in daily use — do not alter their rendering gate.
- The `DASHBOARD` sheet is a legacy storage cell for the priority lot, **not** a dashboard display.
- Token cache (server) has 60s TTL — a role/status change is eventually consistent within 60s.
- Today-sheet server cache has 15s TTL — write handlers MUST invalidate or the operator sees stale state after their own action.
- `offlineQueue` only flushes when authenticated (token present) — don't gate it on other flags.
