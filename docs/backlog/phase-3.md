# Phase 3 - Production Readiness and Adoption Engine

## Goal

Harden infrastructure for production use, add persistent storage, build adoption
mechanisms (sharing, digests, embeds), and lay the groundwork for multi-cloud.

## Scope

### Auth and Security

- Multi-tenant Entra ID OAuth with consent flows
- Secure session storage (Redis-backed)
- CSRF protections and rate limiting
- Token auto-refresh with graceful degradation

### Data Storage

- Postgres schema for tenant metadata, mappings, readiness, transitions
- Redis cache for query results and discovery cache
- Migrations and seed scripts

### Adoption and Virality

- Dashboard sharing via read-only links (same tenant AD)
- Weekly digest email with key metrics summary
- Embed mode (iframe widget for Notion, Confluence, internal tools)
- In-product onboarding: "Invite 3 colleagues" prompt after first dashboard
- Readiness score leaderboard within an organization

### LLM Enhancements

- Direct LLM integration (behind feature flag) for:
  - Labels for page paths and routes (human-readable naming)
  - Readiness explanation text (natural language)
  - Stack-specific instrumentation code snippets
  - Anomaly explanation ("Error rate spiked because...")
- Strict schema validation for LLM responses
- Fallback to static recommendations when LLM is unavailable

### Multi-cloud Foundation

- Formalize CloudProvider interface (`src/providers/interface.js`)
- Refactor directory structure (`src/azure/` -> `src/providers/azure/`)
- Add provider selection in config and UI
- Create mock providers for AWS and GCP (mock data only)
- See `docs/architecture-multicloud.md` for design details

### Observability and Ops

- Structured audit logs
- Metrics for query latency and cache hit rates
- Deployment artifacts (Dockerfile, CI pipeline)

## Exit Criteria

- Metadata persisted in Postgres, cache in Redis
- Full Entra ID OAuth flow working for multi-tenant
- Dashboard sharing and embed mode functional
- Weekly digest emails delivered
- LLM outputs available behind feature flag
- CloudProvider interface formalized with Azure passing all tests
- Mock AWS/GCP providers returning sample data
- Operational dashboards and deployment pipeline in place
