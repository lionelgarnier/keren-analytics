# Product Documentation

## Summary

Easy Analytics is a plug-and-play analytics platform that transforms existing cloud
telemetry into actionable dashboards in under 2 minutes. Starting with Azure
Application Insights and Log Analytics, it provides a GA-like experience with zero
agent deployment, zero raw data storage, and intelligent recommendations to
continuously improve telemetry coverage.

The product targets two audiences through a single entry point:
- **Marketing / Product teams** : instant behavioral analytics without SDK work
- **Technical teams** : simplified real-time monitoring without KQL expertise

See `docs/vision.md` for the full product vision and strategy.

## Goals
- Connect via SSO (Entra ID) and show a dashboard within 60 to 120 seconds.
- Use existing telemetry only. No agent deployment required.
- Provide deterministic mapping and fallbacks when signals are missing.
- Store only metadata and aggregated results (no raw logs).
- Provide clear readiness feedback, improvement steps, and LLM-ready prompts.
- Design architecture for multi-cloud expansion (AWS, GCP) from day one.

## Non-goals (MVP)
- Marketing attribution and channel grouping.
- Complex funnels, cohorts, or retention analysis.
- Custom report builder.
- Writing telemetry into customer tenant.
- Multi-cloud connectors (AWS/GCP are designed for but not yet implemented).

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

## MVP Dashboard (Overview)

### Marketing View
KPIs:
- Unique visitors (user or session based)
- Sessions
- Page views
- Bounce indicators (when data permits)

Tables:
- Top pages/routes
- Top navigation paths

Distributions:
- Browser / OS / Device category
- Geo distribution (country/city) when available

Trends:
- Daily visitor and pageview trends

### Technical View
KPIs:
- Avg response time (backend)
- P95 response time
- Error rate

Tables:
- Slow endpoints (percentiles, count, error rate)

Performance:
- Frontend performance (browser timings) when present

## User Journey
1. Connect Azure tenant (OAuth SSO via Entra ID).
2. Discover App Insights resources and linked workspaces.
3. Auto-select if only one candidate exists.
4. Run readiness probes and schema profiling.
5. Build on-the-fly mappings and run dashboard queries.
6. Show overview dashboard and readiness panel.
7. Display recommendations with actionable prompts.

## Readiness Score

The system probes telemetry and produces a gamified readiness score (0-100):

| Signal | Points | Status |
|--------|--------|--------|
| Traffic (pageViews) | 20 | Required |
| Sessions | 15 | Required |
| Backend performance | 15 | Required |
| Custom events | 15 | Recommended |
| Geo enrichment | 10 | Optional |
| Browser timings | 10 | Optional |
| Custom user IDs | 15 | Recommended |

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
