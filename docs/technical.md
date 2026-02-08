# Technical Documentation

## Architecture Summary
The system is a small Node.js service with a static frontend. It orchestrates a
deterministic pipeline that discovers resources, checks readiness, builds mapping,
and runs KQL templates to render the Overview dashboard.

Key components:
- Frontend: static HTML/CSS/JS in `public/`
- API server: Express app in `src/server.js`
- Orchestrator: `src/core/orchestrator.js`
- Azure clients: `src/azure/mockClient.js` and `src/azure/realClient.js`
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
- GET /dashboard/overview?range=today|7d|30d|custom&start=YYYY-MM-DD&end=YYYY-MM-DD
- GET /dashboard/endpoint-detail?path=/api/example&range=7d
- GET /recommendations

### Dashboard endpoint parameters
- `range`: today, yesterday, 7d, prev7d, 30d, prev30d, custom
- `start`, `end`: required when range=custom (YYYY-MM-DD format, max 90 days)
- Previous period ranges (yesterday, prev7d, prev30d) enable comparison

### Endpoint drill-down
GET `/dashboard/endpoint-detail?path=/api/orders&range=7d` returns:
- Aggregated KPIs (avg, p50, p95, p99, total calls, error rate)
- Time series trend data per period bin (1h for today, 1d otherwise)

## Configuration
Environment variables:
- AZURE_MODE=mock|real (default mock)
- AZURE_ACCESS_TOKEN (required for real mode with bearer token)
- AZURE_CLIENT_ID (required for OAuth browser sign-in)
- AZURE_CLIENT_SECRET (required for OAuth browser sign-in)
- AZURE_REDIRECT_URI (defaults to http://localhost:3000/auth/callback)
- AZURE_TENANT_ID (defaults to "organizations" for multi-tenant)
- SESSION_SECRET

## Azure Integration
### Mock mode
Returns deterministic sample data with no Azure calls. This supports local
development and tests.

### Real mode
Uses:
- ARM to list subscriptions and App Insights resources
- ARM to resolve workspace resource to customerId
- App Insights ARM proxy for KQL queries

Requests are timed out and retried once on transient errors (429, 503).

### Authentication methods

#### 1. OAuth Code + PKCE (browser sign-in)
Register an Entra ID app and configure AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
and AZURE_REDIRECT_URI. Users sign in through the browser and tokens are managed
in the session with automatic refresh. Visit /auth/setup for step-by-step
instructions.

#### 2. Service Principal (automated / CI)
For non-interactive use or validation, obtain a token using a Service Principal:

```bash
# Create a Service Principal (one-time setup)
az ad sp create-for-rbac --name "easy-analytics-sp" --role "Reader" \
  --scopes /subscriptions/<SUBSCRIPTION_ID>

# Grant Log Analytics Reader on the workspace
az role assignment create \
  --assignee <SP_APP_ID> \
  --role "Log Analytics Reader" \
  --scope <WORKSPACE_RESOURCE_ID>

# Get a token and run the server
export AZURE_MODE=real
export AZURE_ACCESS_TOKEN=$(az account get-access-token \
  --resource https://management.azure.com \
  --query accessToken -o tsv)
npm run dev
```

Required RBAC roles:
- **Reader** on the subscription (to discover App Insights resources)
- **Log Analytics Reader** on the workspace (to run KQL queries)

The token is read from .env or process.env on each request, so you can refresh
it without restarting the server.

#### 3. Manual bearer token
Pass any valid ARM-scoped token via AZURE_ACCESS_TOKEN. The server checks JWT
expiry and returns actionable error messages when the token expires.

## KQL Templates
All queries are stored as templates in `kql/*.kql` and rendered with safe,
whitelisted parameters:
- readiness-probes.kql
- schema-tables.kql
- schema-custom-dimensions.kql
- unique-visitors-user.kql
- unique-visitors-session.kql
- sessions.kql
- top-pages.kql
- top-navigation.kql
- tech-browser.kql
- tech-os.kql
- tech-device.kql
- performance.kql
- slow-endpoints.kql
- daily-trend.kql
- geo-distribution.kql
- browser-timings.kql
- endpoint-detail.kql

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
MVP uses a JSON file in `data/store.json` for metadata only:
- tenant selection
- mapping
- schema profile
- readiness report
- state transitions

No raw logs are stored.

## Tests
- Unit tests for mapping, readiness, KQL rendering, cache
- Integration test for API flow with mock client
- RBAC tests: access denied (403), resource selection (409)
- No-data tests: empty telemetry, partial telemetry
- Custom range validation tests

Run with:
```
npm test
```

Test files:
- tests/api.test.js — end-to-end mock auth and dashboard flow
- tests/cache.test.js — cache store expiry and key generation
- tests/kql.test.js — template rendering and parameter validation
- tests/mapping.test.js — canonical field mapping and fallbacks
- tests/readiness.test.js — readiness report generation
- tests/rbac.test.js — RBAC, no-data, and input validation scenarios
