# TV lot screen regression check

Run `npm ci`, `npx playwright install chromium`, then `npm run test:tv-lots`.
The test starts and closes a local Vite server automatically. Set `TV_TEST_URL`
to use an existing local server instead. External API calls are intercepted;
the suite never submits commands or changes to production.

The fixture reproduces the missing-lot incident reported on 7 September 2026:
`43115-CT1EJ20260408` was eighth in the active list and was cut off by the old
six-row limit. A valid one-container lot was excluded by the old three-row
minimum. The suite checks nine simultaneously visible unfinished lots at
1920×1080, one/two-container lots, a full cycle of 23 lots, unchanged feed
request count during pagination, and fit at 1280×720, 1366×768 and 1980×1280.

Screenshots are written to `test-results/tv-lots/` (ignored by Git). They use
test data and fallback fonts with external fonts blocked. The full app is
allowed to finish its splash/opacity transition before assertions and capture;
the tests do not alter visibility or hide overlays. The dashboard warning in
these screenshots is due to its separate API being stubbed, not the lot feed.

Production TV monitoring reported a 1920×1080 viewport and Chrome WebView 83.
The layout uses CSS Grid gaps for that browser. Nine lots fit with 39px lot
numbers and a single footer containing the three latest closed lots. Overflow
pages advance every 15 seconds, pause when hidden or a lot detail is open,
and resume with the next page when the parent returns from the dashboard.

The seven-day feed window is unchanged. Completeness here means all unfinished
lots returned by that feed, not all historical shipments. Physical readability
from the warehouse viewing distance still requires checking on the 75-inch TV.

## Pre-publication review — 2026-09-08

Release recommendation: HOLD pending data-integrity decisions/fixes. Passing layout
tests is not certification of whole-lot completeness or the physical TV browser.

Subsequent owner decision: release the scoped display expansion with the existing
source and calculation semantics unchanged. The findings below are acknowledged
pre-existing limitations, except for the footer wording noted explicitly. The
owner requested deployment and post-deployment verification; no full-inventory
API integration or backend changes are included in this release.

The expanded browser suite also checks 1600×900, active-only and closed-only
screens, all immediate row cells, and fails on JavaScript page errors. It exposed
an undersized percentage column with fallback fonts at reduced widths; the narrow
column was increased from 96 to 112px. The expanded suite then passed. Unit tests:
52 passed. Production build and diff whitespace checks passed. Lint cannot run:
the repository has no ESLint configuration.

Outstanding findings (not silently changed during this review):

- Existing: the seven-day plan window is presented as lot completion. Missing
  older/future inventory cannot be inferred from this feed; 100% is not proof
  of complete shipment unloading. An authoritative full-lot inventory is needed,
  or the on-screen labels must explicitly describe completion within the window.
- Existing: Math.round can display 100% for an unfinished lot (200/201).
- Existing: a failed refresh hides last-known-good rows behind the error screen.
- Existing: polled arrays are replaced without the required deepEqual guard.
- Introduced wording: “Последние закрытые” sorts by plan sequence, not actual
  unloading completion time; it does not mean the three most recently closed.
- Web fonts, production WebView 83, and the normal alternating `?tv=1` route
  have not been covered by this automated suite. Physical readability remains
  an on-device acceptance check.

Unrelated working-tree changes in Code.gs and tests/code-gs.protection.test.ts
were preserved and are not certified by this frontend review. Nothing was
committed, pushed or deployed.
