# Product Documentation

## Summary
Azure GA-like Analytics provides a plug-and-play analytics dashboard for Azure-hosted
web and app workloads. It relies on existing Application Insights and Log Analytics
telemetry, with no raw log duplication and no manual instrumentation required to
start. The product focuses on a single Overview dashboard that mirrors the most
common Google Analytics KPIs.

## Goals
- Connect an Azure tenant and show a dashboard within 60 to 120 seconds.
- Use existing telemetry only. No agent deployment required.
- Provide deterministic mapping and fallbacks when signals are missing.
- Store only metadata and aggregated results (no raw logs).
- Provide clear readiness feedback and improvement steps.

## Non-goals (MVP)
- Marketing attribution and channel grouping.
- Complex funnels, cohorts, or retention analysis.
- Custom report builder.
- Writing telemetry into customer tenant.

## Target Users
- Platform engineers who manage Azure resources.
- Product analytics teams that need quick KPIs without new SDK work.
- Developers who want a fast view of traffic and performance.

## MVP Dashboard (Overview)
KPIs:
- Unique visitors (user or session based)
- Sessions
- Avg response time (backend)
- Error rate

Tables:
- Top pages/routes
- Top navigation paths

Distributions:
- Browser
- OS
- Device category

Optional if data exists:
- Geo distribution (country/city)
- Frontend performance (browser timings)

## User Journey
1. Connect Azure tenant (OAuth).
2. Discover App Insights resources and linked workspaces.
3. Auto-select if only one candidate exists.
4. Run readiness probes and schema profiling.
5. Build on-the-fly mappings and run dashboard queries.
6. Show overview dashboard and readiness panel.

## Data Readiness
The system probes the last 24h (fallback to 7d if volume is low) and classifies:
- OK: core signals exist (traffic + identity + tech)
- PARTIAL: partial signals exist with fallbacks
- EMPTY: no telemetry in the window
- NO_ACCESS: permissions are missing

The UI always renders what is available and displays missing signals plus actions.

## Data Sources
Primary:
- Application Insights (workspace-based recommended)
- Log Analytics workspace linked to App Insights

Optional:
- Azure Resource Graph or ARM for discovery
- Entra ID for auth

## Security and Compliance
- No raw logs stored outside Log Analytics.
- No PII lists are ever returned (counts only).
- Tenant isolation for cache and metadata.
- Audit logs capture query names, not data.

## Acceptance Criteria (MVP)
1. Dashboard renders within 60 to 120 seconds for a tenant with telemetry.
2. No raw log entries stored in the product DB.
3. Dashboard works with partial telemetry using fallbacks.
4. Readiness and recommendations shown when data is missing.
5. Cached ranges load in under 2 seconds.
6. Permission errors are detected and explained.
