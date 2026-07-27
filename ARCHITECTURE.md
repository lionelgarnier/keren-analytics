# Architecture

A map of the codebase for a human who just cloned it. `CLAUDE.md` covers the
same ground for AI agents (with the hard invariants); this file is the
narrative version — read it before your first non-trivial PR.

Keren Analytics is a single Node.js process. It takes Azure Application
Insights telemetry and renders three dashboards (Marketing, Technical,
Readiness) without persisting any raw telemetry rows. The whole thing runs in
**mock mode** by default — a deterministic sample dataset — so you can read
this with the app running and nothing to configure.

```bash
npm install && npm run dev   # http://localhost:3000, mock mode
```

## The 10,000-foot view

```
 Browser (public/)                      Node process (src/)
 ┌────────────────┐   HTTP/JSON   ┌─────────────────────────────────────┐
 │ index.html     │ ───────────▶  │ server.js   Express routes, OAuth,   │
 │ app.js  (SPA)  │ ◀───────────  │             session, CSRF, rate-limit│
 │ setup.html/js  │  NDJSON(dash) └───────────────┬─────────────────────┘
 │ Leaflet+Chart  │  + SSE(setup)                 │
 └────────────────┘                               ▼
                                   ┌─────────────────────────────────────┐
                                   │ core/orchestrator.js                │
                                   │  CONFIG  → runSetupScan()           │
                                   │  RENDER  → runOverviewPipeline()    │
                                   └───────┬───────────────────┬─────────┘
                                           │                   │
                          ┌────────────────▼──┐     ┌──────────▼─────────┐
                          │ providers/azure/  │     │ core/  (pure-ish)  │
                          │  mockClient.js    │     │  kql, mapping,     │
                          │  realClient.js    │     │  dashboard,        │
                          │  (same surface)   │     │  readiness, ...    │
                          └─────────┬─────────┘     └──────────┬─────────┘
                                    │                          │
                              Azure ARM +              SQLite (data/keren.db)
                              Log Analytics            setup state only —
                              (real mode only)         never raw telemetry
```

Two ideas do most of the explaining:

1. **Provider parity.** `mockClient.js` and `realClient.js` expose the *same*
   surface. Tests (and `npm run dev`) run against the mock; production runs
   against the real Azure client. Anything you add to one, add to the other.
2. **Two phases, never mixed.** *CONFIG* (scan + profile + the single AI call)
   runs once per resource and is persisted as a snapshot. *RENDER* runs on
   every dashboard load and only executes the dashboard KQL, reusing that
   snapshot. The orchestrator is where this split lives.

## The flow of one dashboard request

When the SPA asks for `GET /dashboard/overview?range=7d`:

1. **Route** (`src/server.js`) — `ensureAuth` checks the session, the range is
   validated against the `today | 7d | 30d` whitelist, then it calls
   `runOverviewPipeline()`. (The `stream=1` variant streams progress + cards as
   NDJSON instead of a single JSON body; same pipeline underneath.)
2. **Resolve resource** (`core/orchestrator.js`) — pick the tenant's selected
   App Insights resource (auto-selected when there's exactly one).
3. **Load the config snapshot** — the latest `scans` row for
   `(tenant, resource)`. No snapshot ⇒ `SETUP_REQUIRED` and the user is routed
   to the setup wizard. RENDER never does config work.
4. **Build the mapping** (`core/mapping.js`) — turn the snapshot's schema
   profile into a canonical→tenant column mapping (`{{userIdColumn}}` etc.),
   then merge any human validation from the setup wizard on top.
5. **Render KQL** (`core/kql.js`) — load each template from `kql/`, substitute
   the mapping values. Tenant identifiers are *only* ever injected here, never
   string-concatenated into a query elsewhere.
6. **Query** (`providers/azure/*Client.js`) — run the templates against the Log
   Analytics workspace (mock returns deterministic data). Results are cached
   (`core/cache.js`) keyed by tenant + resource + workspace + mappingVersion +
   range.
7. **Assemble** (`core/dashboard.js`) — shape the query results into the
   dashboard payload (KPIs, charts, geo, period-over-period deltas,
   narration). `core/readinessScore.js` adds the 0–100 score and
   `core/recommendations.js` the next-step list.
8. **Respond** — JSON back to `app.js`, which renders Leaflet/Chart.js views.

The **CONFIG** path (`runSetupScan`, behind the `/api/setup/*` routes and the
`/setup` wizard) is the expensive one-time cousin: it runs readiness probes,
profiles the schema, scans custom dimensions, and makes the *single* LLM call.
Its output is the snapshot that RENDER reuses.

## Where things live

### `src/` — the server

| Area | Files | What it does |
|---|---|---|
| **HTTP surface** | `server.js`, `config.js` | All Express routes, OAuth (PKCE), session, CSRF, rate limiting. `config.js` is env-driven (mode, TTLs, OAuth). |
| **Orchestration** | `core/orchestrator.js`, `core/stateMachine.js` | The CONFIG/RENDER split above. State transitions go through the state machine, never direct mutation. |
| **Providers** | `providers/factory.js`, `providers/azure/{mock,real}Client.js`, `tokenStore.js` | The Azure adapter. `factory.js` picks mock vs real from config. `mockData.js` is the sample dataset. |
| **KQL + mapping** | `core/kql.js`, `core/mapping.js`, `core/schemaProfile.js` | Template rendering with strict substitution; canonical-model ↔ tenant-schema mapping; auto-detection of `userId`/`sessionId`/`pagePath` columns. Templates themselves are in `kql/`. |
| **Dashboard** | `core/dashboard.js`, `core/narration.js`, `core/timeRange.js`, `core/cache.js` | Builds the payload from KQL results; plain-English narration; range math; TTL cache. |
| **Readiness** | `core/readiness.js`, `core/readinessScore.js`, `core/recommendations.js`, `core/promptGenerator.js` | Telemetry coverage report → weighted 0–100 score → recommended actions → copy-paste LLM prompts for missing signals. |
| **Setup wizard / AI** | `core/schemaScan.js`, `core/scanStore.js`, `core/aiMappingService.js`, `core/mappingStore.js`, `core/validationStore.js`, `ai/*` | The CONFIG-phase scan, its persistence, and the AI provider abstraction (`AI_PROVIDER=none|azure-foundry`). `ai/noneProvider.js` is the deterministic default. |
| **Persistence** | `core/db.js`, `core/metadataStore.js`, `core/backupScheduler.js`, `core/audit.js` | SQLite via Node's native `node:sqlite` (single file `data/keren.db`). Setup state and aggregates only — **never raw telemetry**. |

### `public/` — the frontend

Vanilla JS, no bundler. `index.html` + `app.js` are the dashboard SPA;
`setup.html` + `setup.js` are the setup wizard (`/setup`). Leaflet and Chart.js
load from CDN. There's no build step — edit and refresh.

### `kql/` — the queries

26 versioned `.kql` templates, one per query. They use `{{placeholder}}`
substitution filled in by `core/kql.js`. To add a query: drop a template here,
load it with `loadKqlTemplate`, and add a render test in `tests/kql.test.js`.

### `tests/` — native `node:test`

One file per module. API tests (`api.test.js`, `rbac.test.js`) use `supertest`
and run against the mock provider. `npm test` runs all of them with `.env.test`
(which forces mock mode).

### `docs/` — the long-form context

Product, technical, and architecture deep-dives; ADRs (`docs/adr/`) for the big
decisions; per-phase backlog (`docs/backlog/`). Start with `docs/technical.md`
and `docs/architecture-ai.md` for anything touching the AI surface.

## Things that will bite you if you don't know them

These are the load-bearing invariants — `CLAUDE.md` has the full list, but the
ones most likely to trip up a first PR:

- **Mock parity.** Add a method to one Azure client, add it to the other.
- **No raw telemetry persistence.** Only aggregates leave the server. The
  security audit (`npm run audit:security`) enforces this and fails the build
  if a new `fs.write*` appears in `src/` outside the known sinks.
- **KQL substitution only.** Never inline a tenant identifier into a query
  string — go through `core/kql.js`.
- **Per-resource setup state.** `scans` and `validations` are keyed by
  `(tenant_id, resource_id)`. A tenant can hold several App Insights resources.
- **Range whitelist.** Routes accept only `today | 7d | 30d`; validate before
  hitting cache or KQL.
- **Never log secrets.** No tokens, `code_verifier`, or session secrets in any
  `console.*` call — the audit checks for this too.

## Next steps

- Want to contribute? See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the dev loop
  and [`docs/good-first-issues.md`](docs/good-first-issues.md) for a starter
  task.
- Want the full invariant list and conventions? [`CLAUDE.md`](CLAUDE.md).
- Want the *why* behind the big calls? [`docs/adr/`](docs/adr/).
