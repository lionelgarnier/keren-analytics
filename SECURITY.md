# Security policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public GitHub
issue. Email **lionel.garnier@protonmail.com** with:

- A description of the issue and its impact.
- Steps to reproduce (or a proof of concept).
- The commit / version you observed it on.

You should receive an acknowledgement within 48 hours. Confirmed issues are
triaged on a best-effort basis. Please do not exploit any issue you find on
the public demo instance.

## What "no raw data leaves your tenant" means in practice

The product promise is that user telemetry rows (App Insights `pageViews`,
`requests`, `customEvents`, etc.) never leave the user's Azure tenant via
this service. Only **aggregated metrics** (counts, percentiles, geo /
browser distributions, top-N pages) are returned to the browser, and only
**setup metadata** (mapping, schema profile, readiness counts, the rendered
dashboard payload of aggregates) is persisted server-side.

That promise is encoded as automated checks in
[`scripts/security-audit.mjs`](scripts/security-audit.mjs) so that
regressions become visible the moment a PR introduces them. The CI badge in
the README reflects the result on `main`.

The two filesystem sinks that exist in `src/`:

| File                       | Persists                                                  | Contains raw telemetry? |
|----------------------------|-----------------------------------------------------------|--------------------------|
| `src/core/audit.js`        | metadata events: tenantId, queryName, durationMs, status  | No                       |
| `src/core/metadataStore.js`| setup metadata + aggregated dashboard config              | No                       |

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

- **No CSRF token** — relies on `sameSite=lax` cookies. Acceptable for the
  current API surface (no state-changing POSTs from third-party origins).
- **No API rate limiting** — `[BLOCKER E1]` in the launch-readiness sprint;
  ships before the public demo URL.
- **CDN supply-chain trust** — Leaflet (`unpkg.com`), Chart.js
  (`cdn.jsdelivr.net`), and OpenStreetMap tiles are loaded from public CDNs.
  Acceptable for the OSS-first launch; a self-hosted-assets variant is
  tracked for Phase 3.
- **Default `SESSION_SECRET` fallback** — `src/config.js` falls back to
  `dev-secret-change-me` with a console warning instead of failing loud
  outside `NODE_ENV=test`. Tightening this is on the launch-readiness list.

## Adding a new check

1. Add a `check*` function in `scripts/security-audit.mjs` that calls
   `record(name, status, detail)`.
2. Wire it in at the bottom of the file alongside the existing checks.
3. Re-run `npm run audit:security` locally; commit only when green.
4. Update the table above and the CI workflow if the check needs new
   tooling.
