# Easy Analytics

[![Tests](https://github.com/lionelgarnier/easy-analytics-for-azure/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/lionelgarnier/easy-analytics-for-azure/actions/workflows/tests.yml)
[![Security audit](https://github.com/lionelgarnier/easy-analytics-for-azure/actions/workflows/security-audit.yml/badge.svg?branch=main)](https://github.com/lionelgarnier/easy-analytics-for-azure/actions/workflows/security-audit.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

Plug-and-play analytics platform that transforms existing cloud telemetry into
actionable dashboards in under 2 minutes. Starting with Azure Application Insights,
it provides separate Marketing and Technical views with zero agent deployment,
zero raw data storage, and intelligent recommendations to improve telemetry coverage.

The "no raw data leaves your tenant" promise is enforced by
[`scripts/security-audit.mjs`](scripts/security-audit.mjs) — see
[`SECURITY.md`](SECURITY.md) for the audited checks and how to run them
locally with `npm run audit:security`.

## Quick start (mock mode)

```bash
npm install
npm run dev
```

Open http://localhost:3000. You'll see a landing page with two options:
- **Connect Azure** -- sign in (mock mode auto-connects instantly)
- **See live preview** -- view the dashboard with sample data, no login required

The dashboard features three tabs:
- **Marketing**: visitors, sessions, top pages, geo, browser/OS/device
- **Technical**: response times, error rates, frontend perf, slow endpoints
- **Readiness**: score (0-100), signal breakdown, LLM-ready improvement prompts

## Docker (one-command deploy)

```bash
docker compose up --build
```

Open http://localhost:3000. For real Azure mode, create a `.env` file from
`.env.example` and set your credentials.

## Real Azure mode

Three commands to provision the Entra ID app registration + secret + delegated
permission, then start Easy Analytics:

```bash
az login
./deploy/azure-app-registration.sh --redirect-uri http://localhost:3000/auth/callback
# Paste the printed env vars into .env, then:
docker compose up -d
```

The script is idempotent and works on Linux + macOS. Full details and a
manual portal-click fallback live in `docs/setup-entra-id.md`.

If you already have an access token (e.g. from CI), you can skip the app
registration entirely:

```bash
export AZURE_MODE=real
export AZURE_ACCESS_TOKEN="$(az account get-access-token --resource=https://management.azure.com --query accessToken -o tsv)"
npm run dev
```

Requirements:
- **Reader** on the subscription (resource discovery)
- **Log Analytics Reader** on the workspace (KQL queries)
- App Insights must be **workspace-based** (not classic)

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
- Landing page with product pitch and live preview mode
- Onboarding banner for first-time users
- Docker deployment (Dockerfile + docker-compose)
- Hardened Azure client with categorized error messages

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
- `GET /preview/dashboard?range=7d` - preview dashboard (no auth, sample data)

## Tests

```bash
npm test
```

28 tests covering: API flow, cache, KQL rendering, mapping, readiness,
readiness score computation, prompt generation, and Azure error handling.

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