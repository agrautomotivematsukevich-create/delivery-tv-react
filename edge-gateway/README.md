# AGR Terminal Edge

Isolated write-behind gateway for Terminal start/finish operations. It durably stores one atomic
operation (including compressed photos), responds with `accepted`, and synchronizes photos plus
`task_action` to the existing Google Apps Script using the same `operationId`.

Production requests use the same-origin `/edge/v1` path. Vercel proxies it to a persistent Tailscale
Funnel, while the Node service listens only on `127.0.0.1`. The gateway accepts only configured AGM
IPv4 addresses or IPv6 prefixes and trusts the client address asserted by Cloudflare or Vercel—not a
generic `X-Forwarded-For` header.

By default, every authenticated operator and container inside the AGM network uses the gateway.
`PILOT_LOGINS` and `PILOT_CONTAINERS` can be populated to temporarily restrict a rollout; leaving
them empty enables all users and containers. If session warming, network validation, or the edge
request fails, the production frontend keeps the existing direct Google Apps Script path as its
fallback.

Deployment requirements:

- Node.js 20 or newer and PM2 for `src/index.cjs`.
- A local `config/.env` based on `.env.example`; never commit the real file.
- A persistent `tailscale funnel --bg` proxy to the configured localhost port.
- `npm test` before replacing the service files or restarting only `agr-terminal-edge`.

Runtime data and `config/.env` are intentionally excluded from Git. Run `npm test` before deployment.
