# AGR Terminal Edge

Isolated write-behind gateway for Terminal start/finish operations. It durably stores one atomic
operation (including compressed photos), responds with `accepted`, and synchronizes photos plus
`task_action` to the existing Google Apps Script using the same `operationId`.

The production frontend keeps Google Apps Script as its fallback. The edge endpoint is restricted
to the AGM public egress IP, so a phone on mobile data receives `EDGE_NETWORK_REQUIRED` and uses the
direct Google path.

Runtime data and `config/.env` are intentionally excluded from Git. Run `npm test` before deployment.
