# Phase 2 - Concept Validation

## Goal

Deepen analytics coverage, improve dashboard visualization, and validate with
real Azure data. Prove the product value before investing in infrastructure.

## Status
DONE

## Scope

### Priority 1 — Analytics Depth

- [x] Daily aggregates for last 30 days with trend charts (no PII)
- [x] Geo distribution (country/city) when available in customDimensions
- [x] Frontend performance (browserTimings) when present
- [x] Slow endpoint drill-downs (percentiles, evolution, detail per endpoint)

### Priority 2 — UX and Visualization

- [x] Visual charts (line chart for trends, doughnut for browsers, bar for geo)
- [x] Enhanced time range picker with custom range and period comparison
- [x] Sorting, pagination, and drill-down for top pages / slow endpoints
- [x] Actionable empty states with guidance ("enable browserTimings", etc.)

### Priority 3 — Real Azure Connection

- [x] Service Principal auth (documented, token-based flow)
- [x] OAuth Code + PKCE for browser sign-in (implemented ahead of schedule)
- [x] RBAC detection with actionable error messages
- [x] Range validation and per-range cache TTL
- [x] Custom range support (up to 90 days) with validation

### Testing

- [x] Integration tests with mocked Azure APIs
- [x] RBAC and no-data test scenarios (7 new test cases)
- [x] Custom range validation tests

## Delivered Features

- **Pagination**: All tables paginated (10 rows/page) with navigation controls
- **Custom time range**: Date picker with start/end inputs, 90-day max
- **Period comparison**: Toggle to compare current period vs previous period,
  with delta indicators on all KPIs (+/- percentage)
- **Endpoint drill-down**: Click any slow endpoint row to open a modal with:
  - KPI summary (avg, p50, p95, p99, calls, error rate)
  - Response time trend chart (avg + P95 line)
  - Error rate + volume bar/line chart
- **Previous period ranges**: yesterday, prev7d, prev30d for comparison
- **KQL param sanitization**: User-supplied values validated for injection safety
- **16 tests passing**: unit, integration, RBAC, no-data, validation

## Exit Criteria

- [x] Dashboard shows trend charts, geo, and frontend performance metrics
- [x] Interactive tables with sort, pagination, and drill-down
- [x] Real tenant can connect via Service Principal and see dashboard
- [x] Readiness and errors visible in UI with actionable guidance
