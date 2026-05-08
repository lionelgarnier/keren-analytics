# Phase 2 - Value Proof: Marketing + Technical + Smart Recommendations

## Goal

Deliver a complete, polished product that proves value for both Marketing and
Technical audiences before investing in infrastructure (Phase 3). The dashboard
must be readable at a glance, with clear separation of concerns per audience,
and a gamified readiness system that drives continuous telemetry improvement.

## Status

DONE

## Scope

### Priority 1 — Dual-Audience Dashboard (DONE)

- **Tab-based navigation**: Marketing / Technical / Readiness views
- **Marketing tab**: visitor KPIs (unique visitors, sessions, page views, pages/session),
  traffic trend chart, top pages with sort/pagination, geo distribution bar chart,
  browser/OS/device doughnut charts, navigation paths table
- **Technical tab**: performance KPIs (avg response, P95, error rate, frontend avg),
  browser timings stacked bar chart, slow endpoints table with percentiles
- **Readiness tab**: animated score ring, signal breakdown, LLM prompt cards,
  cross-department teaser

### Priority 2 — Gamified Readiness Score (DONE)

- Score 0-100 computed from 7 signal categories with weighted points
- Animated SVG ring with grade coloring (A-F)
- Signal breakdown with available/missing status, category badges (required/recommended/optional)
- Score mini-badge visible in tab bar for constant awareness
- Grade-based encouragement text

### Priority 3 — LLM-Ready Prompt Generation (DONE)

- `GET /prompts` API endpoint
- Stack detection from schema profile (React, Angular, Vue, Node.js, .NET, Python, Java)
- Contextual prompts for each missing signal:
  - pageViews: frontend page view tracking
  - requests: backend request telemetry
  - userId: authenticated user identity
  - sessionId: session tracking
  - userAgent: device and browser info
  - geo: geographic enrichment
  - browserTimings: frontend performance metrics
- Prompts include detected stack, resource name, and SDK references
- Collapsible prompt cards with copy-to-clipboard in UI

### Priority 4 — Analytics Depth (DONE)

- Daily aggregates for last 30 days with trend charts (no PII)
- Geo distribution (country bar chart + Leaflet map) when client_CountryOrRegion is available
- Referrer/traffic source analysis (Direct, Organic, Social, Email, Referral)
- Frontend performance (browserTimings) when present
- Slow endpoint drill-downs (percentiles, evolution, detail per endpoint)
- Peak hours heatmap (day-of-week x hour-of-day visitor distribution)
- Campaign breakdown (UTM source/medium/campaign extraction from URLs)
- URL parameter auto-discovery (scans URLs, detects query params and frequency)
- User flow Sankey diagram (built from page navigation transitions)
- Session timelines (reconstructed user journeys from page view events)
- KPI sparklines with anomaly detection (derived from daily trend data)
- Content performance scoring (pages driving funnel progression)
- Conversion funnel (homepage -> pricing -> signup when pages exist)
- Smart auto-generated insights from all available data

### Priority 5 — Real Azure Connection (DONE)

- Entra ID OAuth + PKCE (SSO, one-click sign-in)
  - PKCE helpers in `src/server.js` (generateCodeVerifier, generateCodeChallenge, generateState)
  - `/auth/login` and `/auth/callback` routes with state validation and code exchange
  - Setup guide in `docs/setup-entra-id.md`
- Real client hardened with actionable error categorization (`src/azure/realClient.js` — categorizeAzureError)
- RBAC detection with actionable messages (RBAC_DENIED, AUTH_EXPIRED, NOT_FOUND, THROTTLED) covered by `tests/rbac.test.js`
- Range validation on `/overview`, `/preview`, `/prompts` and per-range cache TTL in `src/config.js` (today: 5m, 7d/30d: 15m)
- Token auto-refresh middleware with expiry detection in `src/server.js`

### Priority 6 — Cross-Department Vision (Teaser) (DONE)

UI teaser panel implemented in `public/index.html` (Readiness tab) — backend endpoints intentionally
deferred to Phase 3+.

- Finance: revenue per session, conversion funnel cost, infra cost per segment
- Legal & Compliance: consent tracking, data residency, GDPR requests, audit trails
- Security: anomalous access patterns, failed auth, geo anomalies
- Customer Success: engagement scores, feature adoption, churn risk signals

### UI/UX Polish

- Screenshot-friendly layout (optimized for sharing in Slack/Teams)
- Modern design system with CSS custom properties
- Responsive layout (mobile-friendly)
- Sticky navbar with resource pill
- Color-coded error rate KPI (green/yellow/red thresholds)
- Smooth animations (score ring, tab transitions)

### Testing

- Unit tests for readiness score computation (4 tests)
- Unit tests for prompt generation (5 tests)
- Integration tests with mocked Azure APIs
- RBAC and no-data test scenarios
- All 18 tests passing

## Exit Criteria

- Dashboard readable at a glance with clear Marketing vs Technical separation
- Readiness score visible as gamified progress indicator (0-100)
- LLM-ready prompts generated for every missing signal
- Real tenant can connect via Entra ID SSO and see dashboard
- Cross-department expansion vision visible to users
- Readiness and errors visible in UI with actionable guidance
