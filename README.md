# Easy Analytics for Azure

Plug-and-play, GA-like analytics for Azure-hosted apps using Application Insights
and Log Analytics telemetry. This project implements the E2E MVP described in the
spec: readiness probes, deterministic mapping, KQL templates, caching, and a
single overview dashboard UI.

## Quick start (mock mode)

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click "Connect Azure". Mock mode returns sample
dashboard data without any Azure credentials.

## Real Azure mode

### Option A: Bearer token (quick start)

```bash
export AZURE_MODE=real
export AZURE_ACCESS_TOKEN="$(az account get-access-token --resource=https://management.azure.com --query accessToken -o tsv)"
npm run dev
```

### Option B: OAuth browser sign-in

Register an Entra ID app (see /auth/setup once the server is running), then:

```bash
export AZURE_MODE=real
export AZURE_CLIENT_ID=<your-client-id>
export AZURE_CLIENT_SECRET=<your-client-secret>
npm run dev
```

### Option C: Service Principal (automated / CI)

```bash
# One-time setup
az ad sp create-for-rbac --name "easy-analytics-sp" --role "Reader" \
  --scopes /subscriptions/<SUB_ID>
az role assignment create --assignee <SP_APP_ID> \
  --role "Log Analytics Reader" --scope <WORKSPACE_RESOURCE_ID>

# Run
export AZURE_MODE=real
export AZURE_ACCESS_TOKEN=$(az account get-access-token \
  --resource https://management.azure.com --query accessToken -o tsv)
npm run dev
```

Required RBAC roles:
- **Reader** on the subscription (resource discovery)
- **Log Analytics Reader** on the workspace (KQL queries)

The App Insights resource must be workspace-based so the linked workspace can
be discovered.

## What is included

- Deterministic orchestration state machine with persisted transitions
- Readiness probes (last 24h/7d fallback via range selector)
- Schema profiling and on-the-fly mapping (userId/sessionId/pagePath)
- KQL templates stored in versioned files
- Cache keys include tenant + workspace + mapping version + range
- No raw log storage (aggregates only)
- Overview dashboard with KPIs, trend charts, geo, tech, and performance
- Paginated tables (top pages, slow endpoints, navigation paths)
- Custom time range picker (up to 90 days) with period comparison
- Endpoint drill-down with response time trend and error rate charts
- OAuth Code + PKCE for browser sign-in (Entra ID)
- Service Principal support for automated/CI use

## API endpoints

- `GET /auth/login` - login flow (mock or OAuth)
- `GET /auth/callback`
- `GET /auth/session`
- `GET /auth/setup` - OAuth setup instructions
- `GET /azure/discover`
- `POST /azure/select`
- `POST /azure/select/clear`
- `GET /readiness`
- `GET /dashboard/overview?range=7d` (also: today, 30d, custom with start/end)
- `GET /dashboard/endpoint-detail?path=/api/example&range=7d`
- `GET /recommendations`

## Tests

```bash
npm test
```

## Documentation

See `docs/README.md` for product, technical, and phased backlog docs.

## Environment variables

- `AZURE_MODE` - `mock` (default) or `real`
- `AZURE_ACCESS_TOKEN` - required for real Azure mode
- `SESSION_SECRET` - session cookie secret
- `MOCK_RESOURCES=multiple` - simulate multiple resources in mock mode