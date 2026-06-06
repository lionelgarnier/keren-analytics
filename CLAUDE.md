# CLAUDE.md

Guide rapide pour les agents Claude Code travaillant sur **Keren Analytics**.
Ce fichier est lu automatiquement à chaque session — gardez-le concis et à jour.

## What this project is

Plug-and-play analytics dashboard that turns Azure Application Insights telemetry
into Marketing / Technical / Readiness views in under 2 minutes. Zero agent
deployment, zero raw data storage, KQL-only.

Status: **Phase 1 + Phase 2 + Phase A + Track F DONE**.

- **Phase A (Azure-first hosting)** shipped 2026-05-10/11: Azure Container
  Apps France Central, custom domain `https://keren.run` with
  managed TLS cert, OAuth real mode validated against production App
  Insights, CI/CD via OIDC (`.github/workflows/deploy-azure.yml`) — see
  ADR 0004.

- **Track F (AI-first setup wizard, ADR 0005)** shipped 2026-05-11 (F1-F5)
  + post-shipment iteration 2026-05-12: the wizard surface pivoted from
  technical mapping plumbing to **graph-level "what we can render for you"
  cards** (✓ Ready / ! Needs instrumentation), and the missing-signals
  list now ships an **AI-generated `code_prompt`** the user copies into
  Cursor / Copilot / Claude Code (shared split-button in
  [`public/promptActionButton.js`](public/promptActionButton.js), also
  reused by the readiness "How to fix" rows). The `accept_all` validation
  branch now snapshots the effective mapping into `overrides` — before
  this fix, AI-only proposals were silently discarded on the next
  pipeline run. A further 2026-05-22 iteration made setup state
  **resource-scoped** (`scans` / `validations` keyed by
  `(tenant_id, resource_id)`) and replaced the post-login resource
  picker with a **service hub** showing a per-resource config status —
  before this, configuring one App Insights silently marked the whole
  tenant configured. See
  [`docs/backlog/ai-setup-wizard.md`](docs/backlog/ai-setup-wizard.md)
  § "Post-shipment iterations (2026-05-12)" + "Per-resource setup state
  + service hub (2026-05-22)" for the change ledger and
  [`docs/architecture-ai.md`](docs/architecture-ai.md) divergences 4 & 5
  for the schema + merge contract evolution.

**Post-launch / deferred**: Phase 3 multi-tenant Postgres (single-instance
SQLite suffices for V1), Phase 4 multi-cloud, the other AI surfaces
(natural-language queries, instrumentation assistant). ADR 0001
(portfolio pivot) + ADR 0004 (Azure-first) + ADR 0005 (AI-first scope)
together replace the original SaaS-track gate logic.

## Stack

- Node.js 22 (ESM, `"type": "module"`), Express 5, Helmet, express-session
- Vanilla JS frontend (`public/app.js`, `public/index.html`) — no bundler
- Leaflet (maps) + Chart.js (charts) loaded from CDN
- KQL templates in `kql/` rendered server-side with mapping substitution
- Persistence (V1) : **SQLite via Node 22 native `node:sqlite`** — no
  extra dep, no native build. Single-file `data/keren.db`. Schema:
  `tenants / state_transitions / scans / mappings / signals /
  validations` in [`src/core/db.js`](src/core/db.js); accessed through
  [`src/core/metadataStore.js`](src/core/metadataStore.js). Hourly
  in-process backup to Azure Blob (`src/core/backupScheduler.js`, VACUUM
  INTO, keeps 24 snapshots) with **restore-on-boot** + a final snapshot
  on `SIGTERM`, so config survives Container App redeploys; the
  `npm run backup:sqlite` script is the manual/local equivalent. See ADR
  0005. Multi-tenant Postgres deferred to Phase 3.
- AI inference : **Azure AI Foundry** (Hub + Project + `gpt-5.4-mini`
  deployment). Provider abstraction (`AI_PROVIDER=none|ollama|azure-foundry`)
  per `docs/architecture-ai.md`. Auth via Managed Identity (no API keys in
  env vars). Quota guard: 10 €/day cap with deterministic fallback.
- Self-telemetry (dogfooding) : the app emits its **own** telemetry to a
  provisioned App Insights so a Keren dashboard can be pointed at Keren
  itself. Two stages — server (`applicationinsights` Node SDK,
  [`src/telemetry.js`](src/telemetry.js) → Technical view: requests/deps/
  exceptions + funnel `customEvents`) and browser (page-served
  `/telemetry.js` loads the App Insights JS SDK → Marketing + Readiness
  views: pageViews/sessions/geo/browserTimings — 85/100 readiness points
  come from the browser). Gated by `TELEMETRY_ENABLED`; **off in
  `NODE_ENV=test`** (no dep load, no network). Tenant ids in events are
  SHA-256 hashed (no PII). Infra: `appi-…` in `infra/main.bicep`, local-auth
  ingestion key required for the browser SDK (write-only by design — see
  `docs/maintainer-todo.md`).
- Tests: Node native test runner (`node --test`) + supertest for API tests.
  AI provider is mocked in `NODE_ENV=test` (deterministic, no LLM calls).
- Deploy: Docker (Node 22 Alpine, non-root user `app`, pre-creates `/app/data`).
  Production: Azure Container Apps via Bicep (`infra/main.bicep`)
  + `deploy/azure-deploy.sh` wrapper for first-time / infra-change deploys
  + `.github/workflows/deploy-azure.yml` for image-only pushes via OIDC.
  Render blueprint kept as a fallback but no longer the canonical path.

## Commands

```bash
npm install            # install deps (supertest is required for api/rbac tests)
npm run dev            # start server on :3000 (mock mode by default)
npm test               # node --env-file=.env.test --test (180 tests)
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
    orchestrator.js      # two phases: runSetupScan (CONFIG — scan/profile/
                         # AI, once) + runOverviewPipeline (RENDER — dashboard
                         # KQL, every load, reuses the config snapshot)
    stateMachine.js      # named pipeline states + transitions
    db.js                # node:sqlite connection + schema bootstrap (data/keren.db)
    metadataStore.js     # tenant metadata over SQLite; legacy data/store.json
                         # auto-migrated on boot (renamed to .legacy)
    schemaScan.js        # F2: PII scrub + gap detection + scan assembly (pure)
    scanStore.js         # F2: scans table, scoped per (tenant, resourceId)
    aiMappingService.js  # F3: orchestrates scan -> AI -> mappings table cache
    mappingStore.js      # F3: mappings table (cache key = scan_id; resource
                         #     scope inherited via the scan it references)
    validationStore.js   # F4: validations, scoped per (tenant, resourceId)
  ai/
    interface.js         # F3: AI provider contract + runtime assert
    factory.js           # F3: AI_PROVIDER env -> provider instance (cached)
    noneProvider.js      # F3: returns null -> deterministic fallback
    azureFoundry.js      # F3: Foundry Responses API; MI auth (audience ai.azure.com)
    promptBuilder.js     # F3: F2 scan -> system prompt + JSON schema response
    quotaGuard.js        # F3: in-memory daily EUR cap, degrades on overflow
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
kql/                     # 32 versioned .kql templates (Azure-specific; relocation
                         # to queries/azure/ deferred to V2 with second adapter)
public/                  # static SPA (index.html, app.js, styles.css)
                         # + setup.html / setup.js (F4 wizard, /setup route)
tests/                   # 24 test files, native node:test runner
infra/                   # canonical Bicep + parameters
  main.bicep                 # Container Apps + ACR + Log Analytics + MI
  main.parameters.json
  README.md
deploy/                  # auxiliary scripts (one-time setup + manual runs)
  azure-app-registration.sh  # idempotent Entra ID OAuth app registration
  azure-ci-setup.sh          # CI app + OIDC federated cred + RBAC
  azure-deploy.sh            # wrapper: RG + Bicep + docker build/push
  .session-secret            # gitignored cache; delete to rotate
.github/workflows/deploy-azure.yml  # OIDC-auth CI: build → push → update image
scripts/
  security-audit.mjs           # repo scan for accidental secrets
  build-strategy-bundle.sh     # docs export
  backup-sqlite.mjs            # hourly VACUUM INTO snapshot of data/keren.db
docs/                    # product, technical, multicloud, backlog/, adr/
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
- **Cache keys** include `tenant + resource + workspace + mappingVersion +
  range`. If you change mapping detection, bump `mappingVersion` so caches
  invalidate.
- **Setup state is per-resource**: `scans` and `validations` are keyed by
  `(tenant_id, resource_id)`. Never query them by `tenant_id` alone — a tenant
  can hold several App Insights resources. `mappings` inherits the scope from
  its `scan_id`.
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
- `metadataStore` is now SQLite-backed (`data/keren.db`, since Track F1)
  but cache stays in-memory and the DB itself is single-file with no
  replication — multi-instance deployments would still see inconsistent
  state. The DB now survives Container App redeploys via restore-on-boot
  + a `SIGTERM` snapshot (`src/core/backupScheduler.js`), but that assumes
  a **single replica**: keep `minReplicas=maxReplicas=1` until a shared
  store ships (cf. `docs/maintainer-todo.md` § scaling). Multi-tenant
  Postgres is the Phase 3 target.
- Frontend `public/app.js` shipped raw (~92 KB), no bundling/minification.
- CSP allows `cdn.jsdelivr.net`, `unpkg.com` and `js.monitor.azure.com`
  (the last for the App Insights browser SDK, self-telemetry stage B) —
  supply-chain risk. Self-host under `public/vendor/` to close it.

Note: rate limiting (`src/core/rateLimit.js`) shipped with the launch-readiness
E1 track. `SESSION_SECRET` now fails loud in production (see `src/config.js`).
CSRF tokens are enforced on every mutating route (`verifyCsrf` in
`src/server.js`, token issued via `/auth/session`) — no longer a gap.

If a task explicitly asks to harden one of these, do it. Otherwise leave alone.

## Docs to read before non-trivial work

- **`docs/backlog/ai-setup-wizard.md`** § "Implementation status" +
  § "Post-shipment iterations (2026-05-12)" — the change ledger for what
  shipped (F1-F5) plus the dogfooding pass that pivoted the wizard surface.
  Read this before touching the wizard, the AI prompt schema, or
  `mergeWithValidation` so you don't undo a deliberate design choice.
- **`docs/next-session.md`** — original Track F kickoff brief. Now
  historical — kept because it documents *why* the F1-F5 sequence was
  chosen and what decisions were locked in up front. Useful when extending
  the wizard but no longer the "start here" doc.
- **`docs/adr/0005-ai-first-scope.md`** — the strategic decision behind
  Track F (why AI-first is pre-launch, SQLite vs Postgres, Foundry vs
  OpenAI direct).
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
  branches off `main`; `main` is the production-deploy branch (manual via
  `deploy/azure-deploy.sh` for now; GH Actions OIDC workflow is the next step).
- Don't push to `main` directly. Don't create PRs unless explicitly asked.
- Commits: short imperative subject; body explains the *why*.
