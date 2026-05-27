# Security policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public GitHub
issue. Email **garniel6@gmail.com** with:

- A description of the issue and its impact.
- Steps to reproduce (or a proof of concept).
- The commit / version you observed it on.

You should receive an acknowledgement within 48 hours. Confirmed issues are
triaged on a best-effort basis. Please do not exploit any issue you find on
the public demo instance.

## What "no raw data leaves your tenant" means in practice

The product promise is that raw user telemetry rows (App Insights
`pageViews`, `requests`, `customEvents`, etc.) are **not persisted** outside
the user's Azure tenant via this service. Most browser payloads are
aggregated metrics (counts, percentiles, geo/browser distributions, top-N
pages). Some setup/technical surfaces may return bounded, scrubbed
event-level snippets (for example recent session timelines) to support
diagnosis without storing raw logs.

That promise is encoded as automated checks in
[`scripts/security-audit.mjs`](scripts/security-audit.mjs) so that
regressions become visible the moment a PR introduces them. The CI badge in
the README reflects the result on `main`.

The known persistence sinks:

| File | Persists | Contains raw telemetry? |
|------|----------|--------------------------|
| `src/core/audit.js` | metadata events: tenantId, queryName, durationMs, status | No |
| `src/core/db.js` (+ store modules) | SQLite setup state (`tenants`, `scans`, `mappings`, `validations`) | No |
| `src/core/backupScheduler.js` | encrypted blob snapshots of `data/keren.db` | No |

Anything else attempting an `fs.write*` in `src/` will fail
`scripts/security-audit.mjs` and turn the CI badge red. If a future feature
requires a new sink, add it to the allowlist in the script *and* document it
in this table.

## Running the audit locally

```bash
npm install
npm run audit:security
```

The script exits non-zero only on `FAIL`. `WARN` items are documented and
intentional (e.g. the CSP CDN allowlist for Leaflet and Chart.js).

## Current checks

| Check                                  | What it enforces                                                            |
|----------------------------------------|------------------------------------------------------------------------------|
| No sensitive data in `console.*`       | No `access_token`, `refresh_token`, `code_verifier`, `client_secret`, `sessionSecret`, `req.headers`, etc. in any log call. |
| Session cookie hardening               | `httpOnly: true`, `sameSite` set, `secure` tied to `NODE_ENV=production`.    |
| CSP `script-src` has no `'unsafe-*'`   | No inline scripts and no `eval`.                                             |
| CSP CDN allowlist                      | Surfaces every external host in CSP so supply-chain trust is reviewable.     |
| No raw telemetry persistence           | Only the two known sinks in the table above touch the filesystem.            |
| Committed env files are placeholders   | `.env.example` / `.env.test` cannot ship a real-looking `SESSION_SECRET`, JWT, or `AZURE_CLIENT_SECRET`. |
| `npm audit` (high+)                    | Production and dev dependencies clean of high/critical advisories.           |

Each check is intentionally narrow so failures are actionable. The
[script source](scripts/security-audit.mjs) documents the regex / heuristic
for each.

## Known accepted gaps

Tracked in `docs/backlog/phase-3.md` and the launch-readiness backlog. Not
fixed because they are outside the pre-launch scope; do not introduce new
patterns that depend on them being unaddressed.

- **CSRF coverage is session-header based** — state-changing POST routes
  require `X-CSRF-Token` that matches a session-bound token exposed by
  `GET /auth/session`. Future API surfaces should keep using this check.
- **CDN supply-chain trust** — Leaflet (`unpkg.com`), Chart.js
  (`cdn.jsdelivr.net`), and OpenStreetMap tiles are loaded from public CDNs.
  Acceptable for the OSS-first launch; a self-hosted-assets variant is
  tracked for Phase 3.

## Adding a new check

1. Add a `check*` function in `scripts/security-audit.mjs` that calls
   `record(name, status, detail)`.
2. Wire it in at the bottom of the file alongside the existing checks.
3. Re-run `npm run audit:security` locally; commit only when green.
4. Update the table above and the CI workflow if the check needs new
   tooling.
