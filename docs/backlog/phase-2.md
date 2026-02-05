# Phase 2 - Production Readiness

## Goal
Enable real Azure tenants with secure auth, persistent storage, and resilient
query execution.

## Scope
### Auth and Security
- Entra ID OAuth Code + PKCE (multi-tenant)
- Secure session storage and CSRF protections
- RBAC detection with actionable errors

### Azure Integration
- ARM discovery for subscriptions and App Insights
- Resolve workspace resource to customerId
- Query Log Analytics with timeouts and retry

### Data Storage
- Postgres schema for tenant metadata, mappings, readiness, transitions
- Redis cache for query results and discovery cache
- Migrations and seed scripts

### API and UX
- Resource list UX with environment hints and telemetry freshness
- Range validation and per-range cache TTL
- Readiness state rendering for NO_ACCESS, NO_DATA, PARTIAL

### Testing
- Integration tests with mocked Azure APIs
- RBAC and no-data test scenarios

## Exit Criteria
- Real tenant can connect and see dashboard
- Cache persistence in Redis
- Metadata persisted in Postgres
- Readiness and errors visible in UI
