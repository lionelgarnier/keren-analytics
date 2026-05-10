# CLAUDE.md

Guide rapide pour les agents Claude Code travaillant sur **Keren Analytics**.
Ce fichier est lu automatiquement à chaque session — gardez-le concis et à jour.

## What this project is

Plug-and-play analytics dashboard that turns Azure Application Insights telemetry
into Marketing / Technical / Readiness views in under 2 minutes. Zero agent
deployment, zero raw data storage, KQL-only.

Status: Phase 1 + Phase 2 DONE. **Pre-launch sprint** (OSS-first go-to-market,
~80h, see `docs/backlog/launch-readiness.md`) is the next active workstream.
Phase 3 (multi-tenant SaaS, persistence) and Phase 4 (multi-cloud) are
**gated on traction signals** — do not start them speculatively. See
`docs/launch-strategy.md` §3 for the gate criteria.

## Stack

- Node.js 22 (ESM, `"type": "module"`), Express 5, Helmet, express-session
- Vanilla JS frontend (`public/app.js`, `public/index.html`) — no bundler
- Leaflet (maps) + Chart.js (charts) loaded from CDN
- KQL templates in `kql/` rendered server-side with mapping substitution
- Tests: Node native test runner (`node --test`) + supertest for API tests
- Deploy: Docker (Node 22 Alpine, non-root) and Render blueprint

## Commands

```bash
npm install            # install deps (supertest is required for api/rbac tests)
npm run dev            # start server on :3000 (mock mode by default)
npm test               # node --env-file=.env.test --test (29 tests)
docker compose up --build
```

Smoke check after changes:
```bash
npm test && curl -s http://localhost:3000/auth/session
```

## Repo map

```
src/
  server.js              # Express app, all routes, OAuth (PKCE), session
  config.js              # env-driven config (azureMode, OAuth, cache TTLs)
  providers/
    factory.js           # provider factory (CLOUD_PROVIDER + AZURE_MODE → client)
    interface.js         # provider contract (JSDoc + runtime assert)
    azure/
      mockClient.js      # deterministic mock data for dev/tests
      mockData.js
      realClient.js      # Azure ARM + Log Analytics calls, error categorization
      tokenStore.js      # per-tenant access/refresh token storage
  core/
    orchestrator.js      # main pipeline (auth -> discover -> profile -> render)
    stateMachine.js      # named pipeline states + transitions
    metadataStore.js     # IN-MEMORY tenant metadata (resets on restart!)
    schemaProfile.js     # auto-detect userId/sessionId/pagePath columns
    mapping.js           # canonical model <-> tenant schema mapping
    kql.js               # render templates with mapping substitution
    cache.js             # TTL cache, keyed by tenant+workspace+mapping+range
    readiness.js         # readiness probe results
    readinessScore.js    # 0-100 score from 7 weighted signals
    promptGenerator.js   # LLM-ready prompts for missing signals
    recommendations.js
    dashboard.js         # builds dashboard payload from KQL results
    timeRange.js
    audit.js
kql/                     # 22 versioned .kql templates (Azure-specific; relocation
                         # to queries/azure/ deferred to V2 with second adapter)
public/                  # static SPA (index.html, app.js, styles.css)
tests/                   # 9 test files, native node:test runner
docs/                    # product, technical, multicloud, backlog/
```

## Key invariants — do not break

- **Mock parity**: `mockClient` and `realClient` MUST expose the same surface.
  Tests run in mock mode (`NODE_ENV=test` forces `azureMode=mock` in `config.js`).
- **No raw log persistence**: only aggregates leave the server. Don't add
  endpoints that return individual log rows or PII.
- **State machine transitions** must go through `core/stateMachine.js` —
  don't mutate tenant state directly.
- **KQL templates** are rendered with mapping substitution (`{{userIdColumn}}`
  etc.). Never inline tenant identifiers; always go through `core/kql.js`.
- **Cache keys** include `tenant + workspace + mappingVersion + range`. If you
  change mapping detection, bump `mappingVersion` so caches invalidate.
- **Range whitelist**: routes accept only `today | 7d | 30d`. Validate in the
  route handler before hitting cache or KQL.
- **OAuth**: PKCE flow lives in `src/server.js` (`/auth/login`, `/auth/callback`).
  Never log `code_verifier`, tokens, or session secrets.

## Conventions

- ESM only — use `import`, no `require`.
- File extensions are mandatory in imports (`./foo.js`, not `./foo`).
- 2-space indent, double quotes, no semicolons-skipping (semicolons present).
- Errors from Azure go through `categorizeAzureError` in `realClient.js` so the
  UI can show actionable guidance — extend that function for new error shapes.
- Don't add comments that restate the code; only document non-obvious why.
- No new top-level dependencies without justification — current deps are
  intentionally minimal (express, helmet, express-session, dotenv).

## Known gaps (Phase 3 territory — don't fix opportunistically)

These are **intentionally** deferred and tracked in `docs/backlog/phase-3.md`:
- No DB / Redis — `metadataStore` and cache are in-memory; multi-instance
  deployments will see inconsistent state.
- Default `SESSION_SECRET` falls back to `dev-secret-change-me` with a console
  warning instead of failing loud.
- No CSRF token (relies on `sameSite=lax` cookie only).
- No rate limiting on API endpoints.
- Frontend `public/app.js` shipped raw (~92 KB), no bundling/minification.
- CSP allows `cdn.jsdelivr.net` and `unpkg.com` (supply-chain risk).

If a task explicitly asks to harden one of these, do it. Otherwise leave alone.

## Docs to read before non-trivial work

- **`docs/launch-strategy.md`** — go-to-market, traction gates, what's
  in/out of scope for the pre-launch sprint (read this first if the work
  touches the public surface)
- `docs/backlog/launch-readiness.md` — pre-launch task list with effort
  estimates and BLOCKER/STRONG/OPTIONAL flags
- **`docs/maintainer-todo.md`** — items only the maintainer can do
  (secrets, deploy targets, GitHub Settings, third-party accounts,
  author-voice content). When you discover a new manual dependency
  while working on any track, append it here with what / why / when /
  how. Don't tick items off — only the maintainer does that.
- `docs/product.md` — product scope and audiences
- `docs/technical.md` — architecture overview
- `docs/architecture-auth.md` — auth flow, token handling
- `docs/architecture-multicloud.md` — provider interface for Phase 3/4
- `docs/architecture-ai.md` — AI provider abstraction (none / ollama /
  azure-openai), privacy boundary, per-task model routing. Read before
  touching any of the `ai-*.md` specs or wiring an LLM call.
- `docs/backlog/phase-{1..4}.md` — what's done, what's planned, what's out of scope
- `docs/backlog/adoption-drivers.md` — product features ranked by adoption ROI
- `docs/backlog/ai-{setup-wizard,environment-analysis,natural-language-queries,instrumentation-assistant}.md` — AI surfaces
- `docs/setup-entra-id.md` — real Azure mode setup

## Testing notes

- `tests/api.test.js` and `tests/rbac.test.js` require `supertest` — install
  devDependencies (`npm install`) before running.
- Tests use `.env.test` which forces `NODE_ENV=test` → mock mode.
- New routes: add at least one supertest case in `tests/api.test.js`.
- New KQL templates: add a render test in `tests/kql.test.js`.
- New readiness signal: cover both score branches in `tests/readinessScore.test.js`.

## Git workflow

- Branch policy is set per session (see system instructions). Default: feature
  branches off `main`; `main` is the deployed branch (Render auto-deploys).
- Don't push to `main` directly. Don't create PRs unless explicitly asked.
- Commits: short imperative subject; body explains the *why*.
