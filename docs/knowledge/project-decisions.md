# Project decisions

Why things are the way they are. When a decision is reversed, update the entry — don't append a new one.

## Backend is Apps Script, not a real server
- Chosen because the warehouse team owns the spreadsheet and wanted zero infra to manage. Reversing this is a large project; don't propose it casually.
- Consequences we live with: executions/day quota, cold-start-ish latency per call, no WebSocket, no background jobs beyond scheduled triggers, `LockService` instead of DB transactions.

## Dashboard protocol is `;`/`|`-delimited text, not JSON
- Legacy: `handleReadComplex` predates the JSON routes and the parser in `services/api.ts::parseDashboardData` is battle-tested. Rewriting to JSON would touch the fragile display logic and win nothing observable.
- Rule: don't change the delimiters on either side without a coordinated PR.

## Auth DB is an isolated spreadsheet (SECRET_AUTH_DB_ID)
- Users, hashes, tokens live in a separate spreadsheet so the primary warehouse sheet can be shared widely without leaking credentials.
- Token cache (60s) is a performance layer, not a security layer — a revoked token is still valid for up to 60s. Documented and acceptable for this operation.

## TV mode uses the same auth flow as regular users (not `TV_API_KEY`)
- The `tv_dashboard` / `tv_lot_tracker` routes exist and use a static key, but they are not wired to the frontend. Rationale: switching TV to static-key changes the audit trail (no per-device login history). Keep the capability on the backend, enable later only if quota pressure returns after the current optimizations.

## Polling cadence, not WebSockets
- Apps Script Web Apps don't support server push. Long-poll would still count against executions. The 45-second polling cadence is the sweet spot between UX freshness and quota.
- A WebSocket-backed layer would require a separate hosting box and is out of scope.

## Client-side cache in a plain module-level map, not React Query / SWR
- `services/api.ts::cachedFetch` is ~25 lines, handles TTL and in-flight dedup, and stays out of the React tree. Adding a query library would increase bundle size and cognitive load for zero new capability in this app.

## Offline queue is IndexedDB + manual flush, not Service Worker / Background Sync
- The app already works as a PWA-ish SPA without a service worker; Background Sync is unreliable on Android TV browsers. Manual flush on `online` event + 60s interval is deterministic and debuggable.

## Deep equality before `setState` on polled data
- Prevents ripple rerenders of memoized children (Dashboard's shift widgets, zone grid, etc.) when the server returns identical JSON. Don't remove these guards.

## Photo upload retries live in `api.uploadPhoto`, not the queue
- Three-attempt retry with 2s backoff inside the request. The offline queue kicks in only when the initial request cannot be made (offline). Both layers exist intentionally.

## Reversed / superseded
_(none yet)_
