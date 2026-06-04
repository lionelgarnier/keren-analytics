# Technical Documentation

## Architecture Summary
The system is a small Node.js service with a static frontend. It orchestrates a
deterministic pipeline that discovers resources, checks readiness, builds mapping,
and runs KQL templates to render the Overview dashboard.

Key components:
- Frontend: static HTML/CSS/JS in `public/` (tab-based: Marketing/Technical/Readiness)
- API server: Express app in `src/server.js`
- Orchestrator: `src/core/orchestrator.js`
- Dashboard builder: `src/core/dashboard.js`
- Readiness score: `src/core/readinessScore.js` (gamified 0-100 score)
- Prompt generator: `src/core/promptGenerator.js` (LLM-ready prompts)
- Recommendations: `src/core/recommendations.js`
- Azure clients: `src/providers/azure/mockClient.js` and `src/providers/azure/realClient.js`
- Provider factory + interface: `src/providers/factory.js`, `src/providers/interface.js`
- KQL templates: `kql/*.kql`
- Metadata store: file-backed JSON (MVP) in `src/core/metadataStore.js`
- Cache: in-memory store (MVP) in `src/core/cache.js`

## Pipeline (Deterministic State Machine)
States:
AUTHENTICATING -> DISCOVERING_RESOURCES -> SELECTING_RESOURCE -> CHECKING_ACCESS ->
READINESS_PROBES -> SCHEMA_PROFILING -> MAPPING_BUILD -> DASHBOARD_BUILD ->
CACHING_RESULTS -> READY

Error states:
NO_ACCESS, NO_DATA, PARTIAL_DATA, FAILED

State transitions are persisted to the metadata store for debugging.

## API Endpoints
- GET /auth/login
- GET /auth/callback
- GET /auth/session
- GET /auth/setup
- POST /auth/logout
- GET /azure/discover
- POST /azure/select
- POST /azure/select/clear
- GET /readiness
- GET /dashboard/overview?range=today|7d|30d (includes readinessScore)
- GET /recommendations (includes readinessScore)
- GET /prompts (LLM-ready prompts for missing signals)
- GET /preview/dashboard?range=today|7d|30d (no auth, sample data)

## Configuration
Environment variables:
- AZURE_MODE=mock|real (default mock)
- AZURE_ACCESS_TOKEN (required for real mode)
- SESSION_SECRET

## Azure Integration
### Mock mode
Returns deterministic sample data with no Azure calls. This supports local
development and tests.

### Real mode
Uses:
- ARM to list subscriptions and App Insights resources
- ARM to resolve workspace resource to customerId
- Log Analytics Query API for KQL

Requests are timed out and retried once on transient errors (429, 503).

## KQL Templates
All queries are stored as templates in `kql/*.kql` and rendered with safe,
whitelisted parameters:

### Discovery and profiling
- readiness-probes.kql — signal availability checks (pageViews, requests, geo, browserTimings, etc.)
- schema-tables.kql — available tables and row counts
- schema-custom-dimensions.kql — custom dimension key discovery

### Marketing queries
- unique-visitors-user.kql — unique visitors via userId + sessionId
- unique-visitors-session.kql — unique visitors via sessionId only
- sessions.kql — distinct session count
- top-pages.kql — top 10 pages by view count
- top-navigation.kql — page-to-page transitions within sessions
- daily-trend.kql — visitors and page views binned by time period
- geo-distribution.kql — top 10 countries by client_CountryOrRegion
- referrer-sources.kql — traffic source categorization (Direct, Organic, Social, etc.)
- campaign-breakdown.kql — UTM campaign breakdown (source, medium, campaign)
- url-parameters.kql — auto-detect URL query string parameters and frequency
- peak-hours.kql — visitor count by day-of-week and hour-of-day
- session-timelines.kql — recent session page sequences for timeline reconstruction

### Technical queries
- performance.kql — avg/p95 response time and error rate
- slow-endpoints.kql — top 10 slowest endpoints by p95
- browser-timings.kql — frontend network/send/receive/processing durations
- endpoint-detail.kql — per-endpoint performance over time (drill-down)

### Tech distribution
- tech-browser.kql — top 5 browsers
- tech-os.kql — top 5 operating systems
- tech-device.kql — top 5 device types

## Mapping and Fallbacks
Mapping logic in `src/core/mapping.js` chooses canonical fields by priority:
- User: user_AuthenticatedId -> user_Id -> customDimensions.userId
- Session: session_Id -> customDimensions.sessionId -> operation_Id
- Page path: pageViews.url -> requests.url -> customDimensions.page

If a signal is missing, queries fall back to available sources without failing.

## Readiness Probes
Readiness probes are lightweight KQL queries to determine signal availability.
The probe window defaults to last 24h and falls back to 7d when volume is low.

## Caching
Cache keys include:
- tenantId
- workspaceId
- queryName
- timeRange
- mappingVersion

TTL:
- today: 5 minutes
- 7d/30d: 15 minutes

## Data Storage
Persistence uses **SQLite** (Node 22 native `node:sqlite`) in
`data/keren.db` for metadata only:
- tenant selection
- mapping
- schema profile + schema scans
- readiness report
- AI mapping proposals + per-resource validations
- state transitions

Setup state is keyed per `(tenant, resourceId)`. An hourly `VACUUM INTO`
snapshot is uploaded to Azure Blob (`src/core/backupScheduler.js`); on
boot the latest snapshot is restored when `data/keren.db` is absent, and
a final snapshot is taken on `SIGTERM`, so config survives Container App
redeploys (single-replica). A legacy `data/store.json` is auto-migrated
to SQLite on first boot.

No raw logs are stored.

## Tests
- Unit tests for mapping, readiness, KQL rendering, cache
- Unit tests for readiness score computation
- Unit tests for LLM prompt generation
- Unit tests for Azure error categorization and response normalization
- Integration test for API flow with mock client

Total: 180 tests across 24 files (native `node:test` runner, all mock mode)

Run with:
```
npm test
```
