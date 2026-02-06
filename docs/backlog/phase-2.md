# Phase 2 - Concept Validation

## Goal

Deepen analytics coverage, improve dashboard visualization, and validate with
real Azure data. Prove the product value before investing in infrastructure.

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

### Priority 3 — Real Azure Connection

- Service Principal auth (simpler than full OAuth, sufficient for validation)
- Test and harden real client with actual tenant data
- RBAC detection with actionable error messages
- Range validation and per-range cache TTL

### Testing

- Integration tests with mocked Azure APIs
- RBAC and no-data test scenarios

## Exit Criteria

- Dashboard shows trend charts, geo, and frontend performance metrics
- Interactive tables with sort, pagination, and drill-down
- Real tenant can connect via Service Principal and see dashboard
- Readiness and errors visible in UI with actionable guidance
