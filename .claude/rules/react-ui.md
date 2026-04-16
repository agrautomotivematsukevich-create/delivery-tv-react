# React / UI rules

## Polling & intervals
- Every `setInterval` that hits `api.*` MUST pause on `document.hidden` via `visibilitychange` (stop the interval, not just skip one tick). Resume on visible.
- Cleanup in every `useEffect`: `clearInterval`, `clearTimeout`, `removeEventListener`. No exceptions.
- Overlap guard required on polling loops: an in-flight ref (like `App.tsx::isFetchingRef`) or rely on `services/api.ts::cachedFetch` in-flight dedup.
- **TTL ≥ polling interval + safety margin.** Current cadences in `docs/architecture/polling-and-data-flow.md`. Never lower without updating that table.

## State & rendering
- Preserve Last Known Good data: on null/error response, keep the previous state. Never clear UI to empty on a transient network failure.
- `deepEqual` before `setState` on polled arrays/objects — avoids ripple rerenders of memoized children.
- Long lists must scroll **inside their container** (`flex-1 overflow-y-auto`, fixed parent height). Never let a task list push the page scroll.
- TV mode (`isTV`, `isTV2`): no `backdrop-blur`, no heavy filters/shadows. Use solid `rgba(...)` backgrounds.
- Clocks/timers for display: 30s tick is enough for HH:MM; don't re-render every second.

## Network
- No direct `fetch(SCRIPT_URL)` outside `services/api.ts` and `services/offlineQueue.ts`. Add a new method to `api.ts` with `cachedFetch`.
- `SCRIPT_URL` is read only from `constants.ts`.
- A new endpoint → entry in `api.ts` with explicit TTL matching the polling table; mirror it in `docs/architecture/polling-and-data-flow.md`.

## Don'ts
- No refactor-for-beauty. No renames, no reformatting, no "while I'm here" cleanup.
- No new state library, data-fetching library, or WebSocket layer.
- No new polling loop inside a modal that stays mounted across navigation.
- No new `setInterval` without cleanup + visibility pause + overlap guard.
