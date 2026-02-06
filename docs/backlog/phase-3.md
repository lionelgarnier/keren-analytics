# Phase 3 - Production Readiness and Expansion

## Goal

Harden infrastructure for production use, add persistent storage, full
multi-tenant auth, and optional LLM-powered insights.

## Scope

### Auth and Security

- Entra ID OAuth Code + PKCE (multi-tenant)
- Secure session storage and CSRF protections

### Data Storage

- Postgres schema for tenant metadata, mappings, readiness, transitions
- Redis cache for query results and discovery cache
- Migrations and seed scripts

### LLM Enhancements (Optional)

- Labels for page paths and routes
- Readiness explanation text
- Recommendations with stack-specific prompts
- Strict schema validation for LLM responses

### Observability and Ops

- Structured audit logs
- Metrics for query latency and cache hit rates
- Deployment artifacts (Dockerfile, CI pipeline)

## Exit Criteria

- Metadata persisted in Postgres, cache in Redis
- Full Entra ID OAuth flow working for multi-tenant
- LLM outputs available behind feature flag
- Operational dashboards and deployment pipeline in place
