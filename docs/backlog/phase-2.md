# Phase 2 - Concept Validation + Smart Recommendations

## Goal

Deepen analytics coverage, improve dashboard visualization, validate with real
Azure data, and introduce LLM-ready prompts for telemetry improvement. Prove the
product value with real users before investing in infrastructure.

## Scope

### Priority 1 — Analytics Depth

- Daily aggregates for last 30 days with trend charts (no PII)
- Geo distribution (country/city) when available in customDimensions
- Frontend performance (browserTimings) when present
- Slow endpoint drill-downs (percentiles, evolution, detail per endpoint)

### Priority 2 — UX and Visualization

- Visual charts (line chart for trends, pie/bar for browsers, map for geo)
- Enhanced time range picker with custom range and period comparison
- Sorting, pagination, and drill-down for top pages / slow endpoints
- Actionable empty states with guidance ("enable browserTimings", etc.)
- Screenshot-friendly layout (optimized for sharing in Slack/Teams)

### Priority 3 — Real Azure Connection

- Entra ID OAuth + PKCE (SSO, one-click sign-in)
- Test and harden real client with actual tenant data
- RBAC detection with actionable error messages
- Range validation and per-range cache TTL

### Priority 4 — Smart Recommendations with LLM Prompts

- Readiness score (0-100) with gamified breakdown by signal
- Contextual LLM-ready prompts for each missing signal
  - Auto-detect stack (React, Angular, .NET, Node.js, etc.) from schema
  - Generate copy-paste prompts tailored to the detected stack
  - Include resource context (App Insights name, connection string pointer)
- Prompt library for common scenarios:
  - Missing pageViews (SPA router tracking)
  - Missing customEvents (key user actions)
  - Missing browserTimings (JS SDK configuration)
  - Missing geo enrichment (IP forwarding config)
  - Missing authenticated user IDs (identity correlation)

### Testing

- Integration tests with mocked Azure APIs
- RBAC and no-data test scenarios
- Readiness score calculation tests
- LLM prompt generation tests

## Exit Criteria

- Dashboard shows trend charts, geo, and frontend performance metrics
- Interactive tables with sort, pagination, and drill-down
- Real tenant can connect via Entra ID SSO and see dashboard
- Readiness score visible as gamified progress indicator
- LLM-ready prompts generated for every missing signal
- Readiness and errors visible in UI with actionable guidance
