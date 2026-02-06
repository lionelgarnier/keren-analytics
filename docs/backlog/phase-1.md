# Phase 1 - MVP (Implemented)

## Goal
Deliver a plug-and-play MVP with mock Azure data, deterministic mapping,
KQL templates, and a single Overview dashboard.

## Status
DONE

## Scope Delivered
- API server with deterministic orchestration pipeline
- Mock auth flow and mock Azure client
- Resource discovery and selection flow
- Readiness probes with 24h + 7d fallback
- Schema profiling and mapping metadata
- KQL templates for KPIs and tables
- Cache keys with tenant/workspace/mapping/time range
- Overview dashboard UI (KPIs, top pages, navigation, tech, perf)
- Readiness panel with recommended actions
- Unit tests and basic API test
- Documentation (product and technical)

## Known Gaps (by design)
- Real Entra ID auth
- Persistent DB and Redis cache
- Real Azure API integration
- LLM recommendations and labeling
- Production hardening and deployment
