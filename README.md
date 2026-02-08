# Easy Analytics

Plug-and-play analytics platform that transforms existing cloud telemetry into
actionable dashboards in under 2 minutes. Starting with Azure Application Insights,
it provides separate Marketing and Technical views with zero agent deployment,
zero raw data storage, and intelligent recommendations to improve telemetry coverage.

## Quick start (mock mode)

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click "Connect Azure". Mock mode returns sample
dashboard data without any Azure credentials.

The dashboard features three tabs:
- **Marketing**: visitors, sessions, top pages, geo, browser/OS/device
- **Technical**: response times, error rates, frontend perf, slow endpoints
- **Readiness**: score (0-100), signal breakdown, LLM-ready improvement prompts

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

- Tab-based dashboard (Marketing / Technical / Readiness)
- Deterministic orchestration state machine with persisted transitions
- Readiness score (0-100) with gamified signal breakdown
- LLM-ready prompts for improving telemetry (copy-paste into Cursor/Copilot)
- Readiness probes (last 24h/7d fallback via range selector)
- Schema profiling and on-the-fly mapping (userId/sessionId/pagePath)
- KQL templates stored in versioned files
- Cache keys include tenant + workspace + mapping version + range
- No raw log storage (aggregates only)
- Cross-department expansion vision (Finance, Legal, Security, Customer Success)

## API endpoints

- `GET /auth/login` - login flow (mock or Entra ID OAuth)
- `GET /auth/callback` - OAuth callback
- `GET /auth/session` - current session info
- `GET /auth/setup` - OAuth setup instructions
- `POST /auth/logout` - end session
- `GET /azure/discover` - discover App Insights resources
- `POST /azure/select` - select a resource
- `POST /azure/select/clear` - clear resource selection
- `GET /readiness` - readiness report
- `GET /dashboard/overview?range=7d` - full dashboard data + readiness score
- `GET /recommendations` - improvement recommendations + score
- `GET /prompts` - LLM-ready prompts for missing signals

## Tests

```bash
npm test
```

18 tests covering: API flow, cache, KQL rendering, mapping, readiness,
readiness score computation, and prompt generation.

## Documentation

See `docs/README.md` for the full documentation index:
- Product vision and strategy
- Technical architecture
- Multi-cloud design
- Phased delivery backlog

## Environment variables

- `AZURE_MODE` - `mock` (default) or `real`
- `AZURE_ACCESS_TOKEN` - required for real Azure mode
- `AZURE_CLIENT_ID` - Entra ID app client ID (for OAuth)
- `AZURE_CLIENT_SECRET` - Entra ID app client secret
- `AZURE_REDIRECT_URI` - OAuth redirect URI
- `AZURE_TENANT_ID` - Entra ID tenant (default: "organizations")
- `SESSION_SECRET` - session cookie secret
- `MOCK_RESOURCES=multiple` - simulate multiple resources in mock mode