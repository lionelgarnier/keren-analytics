# Product Documentation

## Summary

Keren Analytics is a plug-and-play analytics platform that transforms existing cloud
telemetry into actionable dashboards in under 2 minutes. Starting with Azure
Application Insights and Log Analytics, it provides a GA-like experience with zero
agent deployment, zero raw data storage, and intelligent recommendations to
continuously improve telemetry coverage.

An **AI setup wizard** sits at the front door: it scans the tenant's telemetry,
maps the schema to a canonical model, and shows — up front — which dashboards it
can credibly render for you, before you commit. The happy path is a single click
("Build my dashboard"); the mapping stays editable on demand.

The product targets two audiences through a single entry point:
- **Marketing / Product teams** : instant behavioral analytics without SDK work
- **Technical teams** : simplified real-time monitoring without KQL expertise

See `docs/vision.md` for the full product vision and strategy.

## Goals
- Connect via SSO (Entra ID) and show a dashboard within 60 to 120 seconds.
- Use existing telemetry only. No agent deployment required.
- Run an AI-assisted setup that scans telemetry, proposes a schema mapping
  with confidence, and shows what each dashboard can render — in one click.
- Provide deterministic mapping and fallbacks when signals are missing (and
  when the AI provider is `none` or over its quota).
- Store only metadata and aggregated results (no raw logs).
- Provide clear readiness feedback, improvement steps, and LLM-ready prompts.
- Design architecture for multi-cloud expansion (AWS, GCP) from day one.

## Non-goals (current scope)
- Complex cohorts or retention analysis.
- Custom report builder.
- Writing telemetry into customer tenant.
- Multi-cloud connectors (AWS/GCP are designed for but not yet implemented).
- A/B test monitoring (frontend ready, no data source yet).

## Target Users

### Primary: Product and Marketing Teams
- Product Managers who need quick behavioral analytics
- Growth/Marketing analysts who want GA-like KPIs on Azure apps
- Anyone who needs to understand user behavior without technical tooling

### Secondary: Technical Teams
- Platform engineers who manage Azure resources
- Developers who want a fast view of traffic and performance
- SREs who need simplified monitoring dashboards

## Core Principles

### 1. Zero Friction
- SSO via Azure AD (one click)
- Auto-discovery of resources
- Dashboard in under 2 minutes
- No documentation required to get started

### 2. Trust Through Transparency
- No raw logs stored outside the customer's own Log Analytics workspace
- No PII lists returned (counts and aggregates only)
- Tenant isolation for cache and metadata
- Audit logs capture query names, not data content
- Ephemeral results with short TTL (5-15 min)

### 3. Cloud-Agnostic Architecture
- Provider abstraction layer built into the core design
- Azure first, AWS and GCP planned
- Consistent dashboard experience regardless of cloud provider
- See `docs/architecture-multicloud.md` for technical details

## Dashboard (Overview)

### Marketing View
Top-of-tab:
- **Environment analysis** panel — an AI-style narration of what the
  telemetry looks like (visitors, sessions, top campaign source, peak hour,
  error band, identity mapping). Real LLM in `azure-foundry` mode;
  deterministic generator otherwise.
- **First-run banner** — readiness score + top quick wins as clickable chips
  that jump to the matching Readiness signal (dismissable, persisted).

KPIs:
- Unique visitors (user or session based)
- Sessions
- Page views
- Avg pages per session
- **Period-over-period delta chips** on the top 3 KPIs (green/red/neutral
  vs. the previous period, e.g. "vs last week")
- KPI sparklines with anomaly detection (derived from daily trends)

Charts and tables:
- Traffic trend (daily visitors and page views line chart)
- Top pages with sort/pagination and view share
- Top navigation paths (table view)
- User flow (Sankey diagram built from navigation transitions)
- Referrer / Traffic sources (doughnut chart: Direct, Organic, Social, etc.)
- Peak hours heatmap (day-of-week x hour-of-day)
- Content performance scoring (pages driving funnel progression)
- Conversion funnel (homepage -> pricing -> signup when pages exist)
- Campaign breakdown (UTM source/medium/campaign table)
- URL parameters discovery (auto-detected params with frequency)

Distributions:
- Browser / OS / Device category (doughnut charts)
- Geo distribution (country bar chart + Leaflet map) when available

Smart insights:
- Auto-generated insights from traffic sources, peak hours, campaigns, and URL data

### Technical View
KPIs:
- Avg response time (backend)
- P95 response time
- Error rate
- Frontend avg (browser timings)

Charts:
- Frontend performance (browser timings: network/send/receive/processing bar chart)

Tables:
- Slow endpoints (p50/p95/p99 percentiles, count, error rate)

Session analysis:
- Session timelines (reconstructed user journeys from page view events)

### Backend View
Server-side / APM telemetry beyond request latency, mined from the
`dependencies`, `exceptions` and `cloud_RoleName` signals.

KPIs:
- Dependency calls and distinct targets
- Dependency failure rate
- Dependency P95 latency
- Exception count (and distinct exception types)

Charts:
- Dependency type mix (SQL/HTTP/Redis/blob/queue doughnut)
- Response status-code distribution (2xx/3xx/4xx/5xx)

Tables:
- Slow dependencies (target + type, p50/p95, calls, failure rate)
- Top exceptions (type, count, affected operations and users — **no raw
  messages or stack traces**, only types and aggregate counts)
- Service health (per `cloud_RoleName`: requests, avg/p95 latency, 5xx rate)

## User Journey
1. Connect Azure tenant (OAuth SSO via Entra ID).
2. Discover App Insights resources and linked workspaces.
3. **Service hub** — land on a per-resource hub that tags each App Insights
   as Ready / Incomplete / Unconfigured. Single-resource tenants skip the
   hub and go straight to setup.
4. **AI setup wizard** (per resource, see below) — scan → AI findings →
   one-click build.
5. Show the overview dashboard (Marketing / Technical / Backend / Readiness)
   reusing the validated config snapshot — no re-scan or LLM call per load.
6. Display recommendations with actionable, copy-paste prompts.

## AI Setup Wizard

The wizard is the configuration step; the dashboard is pure rendering
afterwards. Setup state is **per resource** (`tenant + resourceId`), so a
tenant with several App Insights resources configures each independently.

1. **Scan** — reads custom dimensions, counts event types, detects identity /
   session / page-path fields, and runs readiness probes. Streams live
   narration (SSE). Auto-advances when done — no manual "Continue".
2. **AI findings** — "what we can render for you" as graph-level cards
   (✓ Ready / ! Needs instrumentation), a readiness gauge, and a copy-paste
   `code_prompt` for each missing signal (paste into Copilot / Cursor /
   Claude Code). Powered by Azure AI Foundry; falls back to a deterministic
   alias/regex mapping when the AI provider is `none`, degraded, or over its
   daily quota.
3. **Build** — "Build my dashboard" saves the proposed mapping and lands on
   the dashboard. The technical field-mapping editor is **optional**:
   reachable any time from the dashboard's "Mapping" link
   (`/setup?mode=mapping`); a low-confidence field is flagged inline rather
   than forcing a detour. A "Re-scan" action re-runs step 1 when new event
   types appear.

The validated mapping persists in SQLite (`data/keren.db`), is backed up
hourly to Azure Blob, and is restored on boot — so configuring once survives
service redeploys.

## Readiness Score

The system probes telemetry and produces a gamified readiness score (0-120):

| Signal | Points | Status |
|--------|--------|--------|
| Traffic (pageViews) | 20 | Required |
| Sessions | 15 | Required |
| Backend performance (requests) | 15 | Required |
| Custom user IDs | 15 | Recommended |
| Device & browser | 10 | Recommended |
| Geo enrichment | 10 | Optional |
| Browser timings | 15 | Optional |
| Dependencies | 10 | Recommended |
| Exceptions | 10 | Recommended |

The score drives engagement: users are motivated to improve their telemetry
coverage, which in turn makes the dashboard more valuable.

## Smart Recommendations

When signals are missing, the system generates:
1. **Diagnosis** : What's missing and why it matters
2. **Action steps** : Concrete steps to fix it
3. **LLM-ready prompt** : A copy-paste prompt for code assistants (Copilot, Cursor,
   ChatGPT) that generates the exact instrumentation code needed

This creates a virtuous cycle: better telemetry leads to a richer dashboard,
which increases perceived value and drives continued improvement.

## Telemetry Contract (instrument-first)

Smart Recommendations help *after* the fact — they tell you what your existing
telemetry is missing. The **Telemetry Contract** is the mirror image: a public,
versioned spec a coding agent (Cursor, Copilot, Claude Code) can read *before*
or *during* instrumentation, so a new app renders the full dashboard from its
very first scan — no manual mapping step.

It answers, in machine- and LLM-readable form:
- **Which signals to emit** and what each is worth toward the readiness score.
- **How to name custom dimensions** so Keren auto-detects them (e.g. call your
  user id `userId` and it maps with zero setup).
- **Config best practices** — pseudonymize user ids, never send PII, exclude
  health-check endpoints, flush on shutdown, set a per-service role name.
- **A ready-to-paste prompt per signal**, the same ones the in-app
  recommendations use.

It's available with no sign-in at `https://keren.run/.well-known/telemetry-contract.json`
(machine-readable) and `https://keren.run/llms.txt` (readable brief). Nothing
in it is your data — only the contract and the scoring rules.

Roadmap: this contract is the foundation for an MCP server that lets agents
query it interactively and, eventually, validate a proposed instrumentation
plan and confirm the live result.

## Data Sources

Primary:
- Application Insights (workspace-based recommended)
- Log Analytics workspace linked to App Insights

Future:
- AWS CloudWatch Logs and Metrics
- AWS X-Ray (traces)
- GCP Cloud Logging
- GCP Cloud Trace

Auth:
- Entra ID for Azure SSO
- (Future) AWS IAM Identity Center / GCP Identity

## Security and Compliance
- No raw logs stored outside the cloud provider.
- No PII lists are ever returned (counts only).
- Tenant isolation for cache and metadata.
- Audit logs capture query names, not data.
- OAuth with PKCE for secure token exchange.
- Session cookies with httpOnly, secure, sameSite flags.

## Acceptance Criteria (MVP)
1. Dashboard renders within 60 to 120 seconds for a tenant with telemetry.
2. No raw log entries stored in the product DB.
3. Dashboard works with partial telemetry using fallbacks.
4. Readiness score and recommendations shown when data is missing.
5. LLM-ready prompts generated for missing signals.
6. Cached ranges load in under 2 seconds.
7. Permission errors are detected and explained.
