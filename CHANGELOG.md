# Changelog

All notable changes to **Keren Analytics** are documented in this
file. Format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/);
this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Pre-launch sprint work that has landed on `main` since v0.1.0 — see
[`docs/backlog/launch-readiness.md`](docs/backlog/launch-readiness.md)
for the per-track status.

### Added
- Landing page on `/` rewritten as a launch one-pager — tagline, three
  CTAs (Try the demo / Connect your Azure / ★ Star on GitHub),
  comparison table (Keren Analytics vs Azure Portal / Datadog / Power
  BI), security trust paragraph, 3-question FAQ, and a privacy-clean
  footer (no tracking by default; explicit Plausible/Umami slot for
  the operator).
- README rewritten as a launch-pitch (one-line tagline, why-it-exists,
  try-it-now, what's-inside, comparison table, privacy/security
  trust paragraph, roadmap, configuration reference, contributing,
  ⭐ ask). Old docs-style sections (full env list, full API list)
  trimmed to a short reference block linking to source.
- Period-over-period comparison on the top 3 KPI tiles (Unique
  Visitors, Sessions, Page Views) with green/red/neutral delta chip +
  "vs last week" caption. New `kql/previous-kpis.kql` template; new
  `previousTimeRange()` and `comparisonLabel()` helpers in
  `core/timeRange.js`.
- First-run banner above the tab bar that shows the readiness score
  + top 2 quick wins as clickable chips; click switches to the
  Readiness tab and scrolls to the matching signal row.
  `localStorage`-persisted dismissal.
- "Environment analysis" panel above the KPI grid — deterministic
  AI-style narration generated from the dashboard payload (visitors,
  sessions, top campaign, peak hour, error-rate band, userId mapping
  type). Mock mode: no badge. Real mode: "Preview — real LLM coming
  soon" badge (the same generator runs in both modes; no fabrication).
- `LICENSE` (MIT) and `package.json` license metadata.
- `CONTRIBUTING.md` short guide that points at `CLAUDE.md` for invariants.
- `CODE_OF_CONDUCT.md` adopting Contributor Covenant 2.1 by URL reference.
- `.github/ISSUE_TEMPLATE/{bug_report,feature_request,question}.yml`
  structured forms plus `config.yml` disabling blank issues and
  surfacing the security reporting path.
- `.github/PULL_REQUEST_TEMPLATE.md` reminding contributors to read
  `CLAUDE.md` and run `npm test` + `npm run audit:security`.
- `.github/workflows/tests.yml` GitHub Actions pipeline running the test
  suite on every push/PR (Tests badge in the README).
- `docs/maintainer-todo.md` single-source list of out-of-band items the
  maintainer must execute (secrets, GitHub Settings, third-party
  accounts, author-voice content).
- License + Node-version badges in the README next to the existing
  security-audit badge.

### Security
- `SESSION_SECRET` is now required in production: `src/config.js` throws
  at boot when `NODE_ENV=production` and the value is missing or set to
  a known placeholder (`dev-secret-change-me`,
  `change-me-in-production`). 5 new tests in `tests/config.test.js`.
- `SECURITY.md` updated to remove gaps that have since been closed
  (rate limiting → E1 done, default-secret fallback → fixed).

## [0.1.0] — Initial public release

First public release. Everything below is what shipped on day one.

### Added — product
- **Mock + real Azure modes**, switched via `AZURE_MODE`. Mock mode runs
  with no credentials and serves a deterministic dataset suitable for
  the public demo and tests; real mode hits Azure ARM + Log Analytics
  via OAuth (PKCE). Mock and real clients expose the same surface so
  every test runs in mock mode.
- **Three dashboard views** — Marketing (acquisition, geo, sources,
  funnels), Technical (errors, latency, top endpoints), Readiness
  (telemetry coverage score + missing-signal prompts).
- **Readiness score (0-100)** computed from 7 weighted signals
  (`core/readinessScore.js`) with LLM-ready prompts for whichever
  signals are missing (`core/promptGenerator.js`).
- **Schema auto-detection** — `core/schemaProfile.js` infers the
  tenant's `userId` / `sessionId` / `pagePath` columns from the live
  Application Insights schema, then `core/mapping.js` maps the canonical
  model to the tenant's columns. KQL templates in `kql/` are rendered
  server-side via `core/kql.js` with substitution tokens
  (`{{userIdColumn}}`, etc.) — tenant identifiers never reach a query
  string.
- **22 versioned KQL templates** covering page views, sessions, geo,
  browsers, sources, funnels, error rates, latency percentiles, top
  endpoints, peak hours, custom events, A/B test outcomes, anomaly
  sparklines, and session-replay timelines.
- **State machine** (`core/stateMachine.js`) for the per-tenant
  pipeline (auth → discover → profile → render) with up to 200
  transitions retained per tenant for the audit trail.
- **TTL cache** keyed on `tenant + workspace + mappingVersion + range`
  with per-range TTLs (5 min for `today`, 15 min for `7d`/`30d`).
- **Interactive world map** (Leaflet) and **multi-step Sankey** flow
  diagrams in the dashboard.
- **Smart Insights**, **Peak Hours heatmap**, **A/B Test Monitor**, and
  **Session Replay Timelines** on the Marketing tab.
- **Period comparison** scaffold (`core/timeRange.js`) and **dashboard
  filters** with URL-parameter auto-detection.
- **Modern docs site** (Stripe / Vercel-inspired) under `public/docs/`,
  linked from the navbar and the landing page.

### Added — distribution
- `Dockerfile` (Node 22 Alpine, non-root user) and `docker-compose.yml`
  for one-command local runs.
- `render.yaml` blueprint for one-click Render deployment from `main`.
- `infra/` Bicep template + `scripts/register-azure-app.sh` for a
  one-command Entra ID app registration in the maintainer's tenant.
- `docs/setup-entra-id.md` walks through real-mode setup end-to-end.

### Security
- `scripts/security-audit.mjs` — repeatable check encoding 7 controls
  (sensitive-data logging, session cookie hardening, CSP `script-src`
  has no `unsafe-*`, CSP CDN allowlist, no raw telemetry persistence,
  committed env-files placeholder-only, `npm audit` high+).
  `npm run audit:security` runs locally; GitHub Actions runs it on push
  and PR plus a Monday cron, so newly disclosed transitive
  vulnerabilities turn the badge red even between commits.
- **Per-IP rate limiting** (`src/core/rateLimit.js`): in-memory
  fixed-window limiter with two named buckets — `api` (60 req/min on
  all dynamic routes) and `auth` (20 req/min on `/auth/*`). Friendly
  429 page (HTML or JSON depending on `Accept`) with `Retry-After`,
  `X-RateLimit-Limit`, and `X-RateLimit-Remaining` headers. Bypassed
  in `NODE_ENV=test`.
- **OAuth (PKCE)** flow in `src/server.js` (`/auth/login` /
  `/auth/callback`). Tokens, `code_verifier`, and session secrets are
  never logged — enforced by the security-audit script.
- **No raw log persistence**: only aggregates leave the server. Two
  legitimate filesystem sinks (`core/audit.js` metadata events,
  `core/metadataStore.js` setup state) are documented in `SECURITY.md`
  and allowlisted in the audit script; any other `fs.write*` in `src/`
  fails the audit.
- **Helmet + CSP** with `script-src` restricted to `'self'` + the two
  CDN hosts (`cdn.jsdelivr.net` for Chart.js, `unpkg.com` for Leaflet).
  No `unsafe-inline` / `unsafe-eval`.
- One transitive dependency advisory fixed in flight: `path-to-regexp`
  8.3.0 → 8.4.2 and `qs` 6.14.1 → 6.15.1.

### Documentation
- `docs/launch-strategy.md` — go-to-market plan and Phase 3 / 4
  traction gates.
- `docs/product.md`, `docs/technical.md`, `docs/vision.md`,
  `docs/architecture-auth.md`, `docs/architecture-multicloud.md`.
- `docs/backlog/{launch-readiness,phase-1..4,adoption-drivers,
  ai-{setup-wizard,environment-analysis,natural-language-queries,
  instrumentation-assistant}}.md`.
- `docs/setup-entra-id.md`.

### Tests
- 56 tests across 10 files using the native `node:test` runner +
  supertest for API tests. All run in mock mode (`NODE_ENV=test`
  forces `azureMode=mock`).

[Unreleased]: https://github.com/lionelgarnier/keren-analytics/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lionelgarnier/keren-analytics/releases/tag/v0.1.0
