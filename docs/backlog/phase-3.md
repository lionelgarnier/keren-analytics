# Phase 3 - Expansion and Optimization

## Goal
Improve UX quality, add optional LLM outputs, and expand analytics coverage.

## Scope
### LLM Enhancements (Optional)
- Labels for page paths and routes
- Readiness explanation text
- Recommendations with stack-specific prompts
- Strict schema validation for LLM responses

### Analytics Expansion
- Geo distribution (country/city) when available
- Frontend performance (browserTimings) when present
- Daily aggregates for last 30 days (no PII)
- Slow endpoint drill-downs

### UX Enhancements
- Improved empty/partial states and next steps
- History of readiness checks
- Better sorting and pagination for top lists

### Observability and Ops
- Structured audit logs
- Metrics for query latency and cache hit rates
- Deployment artifacts (Dockerfile, CI pipeline)

## Exit Criteria
- LLM outputs available behind feature flag
- Extended metrics visible with data availability checks
- Operational dashboards and logs in place
