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

## Real Azure mode (optional)

This repo ships with a minimal Azure client that uses direct ARM and Log
Analytics Query API calls. It expects a bearer token from your own tooling:

```bash
export AZURE_MODE=real
export AZURE_ACCESS_TOKEN="$(az account get-access-token --resource=https://management.azure.com --query accessToken -o tsv)"
npm run dev
```

Notes:
- Use a tenant/user with Reader on the subscription and Log Analytics Reader on
  the workspace.
- The App Insights resource must be workspace-based so the linked workspace can
  be discovered.

## What is included

- Deterministic orchestration state machine with persisted transitions
- Readiness probes (last 24h/7d fallback via range selector)
- Schema profiling and on-the-fly mapping (userId/sessionId/pagePath)
- KQL templates stored in versioned files
- Cache keys include tenant + workspace + mapping version + range
- No raw log storage (aggregates only)
- Minimal Overview dashboard (KPIs, top pages, navigation, tech, perf)

## API endpoints

- `GET /auth/login` - mock login flow
- `GET /auth/callback`
- `GET /auth/session`
- `GET /azure/discover`
- `POST /azure/select`
- `GET /readiness`
- `GET /dashboard/overview?range=7d`
- `GET /recommendations`

## Tests

```bash
npm test
```

## Environment variables

- `AZURE_MODE` - `mock` (default) or `real`
- `AZURE_ACCESS_TOKEN` - required for real Azure mode
- `SESSION_SECRET` - session cookie secret
- `MOCK_RESOURCES=multiple` - simulate multiple resources in mock mode