# AI-Powered Environment Analysis

## Summary

Upgrade the mapping system from exact-match-only to a three-layer resolution
chain: **(1) alias heuristics** that cover ~80% of real-world naming conventions
with zero config and zero cost, **(2) optional LLM analysis** that reasons about
the remaining ~20% using schema metadata, and **(3) user overrides** as the final
authority. Each layer is independent and the system degrades gracefully — Layer 1
alone is already a significant improvement over the current implementation.

## Problem

The current `mapping.js` matches custom dimension names by exact string
(`"userId"`, `"sessionId"`, `"page"`, `"refUri"`). Any variation — `uid`,
`userHash`, `visitor_id`, `authenticatedUser`, `acmeCustomerId` — results in a
`null` mapping, and the dashboard loses metrics silently.

Maintaining an ever-growing list of hardcoded aliases is fragile and can never
cover truly custom naming conventions.

## Approach: Three Layers of Mapping Intelligence

The solution is layered. Each layer catches what the previous one missed,
and the system works fine with only the first layer enabled.

### Layer 1 — Alias Heuristics (no LLM, no config, covers ~80%)

Enrich `buildMapping()` with a curated alias table and lightweight heuristics.
This is the highest-value, lowest-cost improvement and should ship regardless
of whether the LLM layer is ever enabled.

**Alias table per canonical field:**

```javascript
const ALIASES = {
  userId: {
    exact: ["userId", "user_id", "uid", "userid", "userHash",
            "user_hash", "visitorId", "visitor_id", "authenticatedUser",
            "authenticated_user", "accountId", "account_id", "memberId",
            "member_id", "profileId", "profile_id", "sub", "subject"],
    pattern: /^(user|visitor|member|account|profile|customer)[_-]?(id|hash|key|ref)$/i,
  },
  sessionId: {
    exact: ["sessionId", "session_id", "sid", "sessionKey",
            "session_key", "visitId", "visit_id", "browsing_session"],
    pattern: /^(session|visit|browsing)[_-]?(id|key|token|ref)$/i,
  },
  pagePath: {
    exact: ["page", "pagePath", "page_path", "pageName", "page_name",
            "pageRoute", "page_route", "route", "path", "urlPath",
            "url_path", "screen", "screenName", "screen_name", "view"],
    pattern: /^(page|screen|route|view)[_-]?(path|name|route|url)$/i,
  },
  referrer: {
    exact: ["refUri", "referrer", "ref_uri", "referrerUrl", "referrer_url",
            "referer", "httpReferer", "http_referer", "source", "trafficSource",
            "traffic_source", "utm_source", "campaign_source"],
    pattern: /^(ref|referr?er|traffic|campaign)[_-]?(uri|url|source)$/i,
  },
};
```

**Matching strategy (in priority order):**

1. Built-in App Insights fields (existing logic — `user_AuthenticatedId`, `session_Id`, etc.)
2. Exact alias match against custom dimension keys (case-insensitive)
3. Regex pattern match against custom dimension keys
4. Cross-table consistency bonus: if the same key appears in 2+ tables, boost confidence

**Output:** Same mapping structure as today, with an added `matchType` field
(`"builtin"`, `"alias"`, `"pattern"`) for transparency.

**Why this covers 80%:** Most teams use recognizable English names for their
custom dimensions. The combination of ~15-20 aliases per field plus a regex
pattern catches the vast majority of real-world naming conventions. Only truly
opaque names (`acmeXid`, `b2b_ref_47`) fall through.

### Layer 2 — LLM Analysis (optional, covers the remaining ~20%)

For custom dimension names that don't match any alias or pattern, an LLM can
reason about semantics, cardinality, and cross-table presence to propose
mappings. This is the layer described in detail below.

### Layer 3 — User Override (always available)

Regardless of how the mapping was determined, the user can manually assign
any custom dimension to a canonical field via the UI. Overrides are persisted
in tenant metadata and take precedence over both heuristics and LLM.

**The three layers compose as a resolution chain:**

```
User Override  →  (if not set)  →  LLM Proposal (high confidence)
               →  (if not set)  →  Alias/Pattern Match
               →  (if not set)  →  Built-in Field
               →  (if none)     →  null (signal missing)
```

## Proposed Architecture (LLM Layer Detail)

```
Existing pipeline (deterministic, unchanged)
─────────────────────────────────────────────
  DISCOVERING_RESOURCES
  → CHECKING_ACCESS
  → READINESS_PROBES
  → SCHEMA_PROFILING          ← collects tables + custom dimension keys
                               ← collects probe counts + signal availability

New step (optional, LLM-powered)
─────────────────────────────────
  → AI_ANALYSIS               ← sends schema profile + readiness to LLM
                               ← receives mapping proposals + confidence + report

Existing pipeline (deterministic, unchanged)
─────────────────────────────────────────────
  → MAPPING_BUILD             ← uses LLM mapping if available, else fallback
  → DASHBOARD_BUILD
```

### What the LLM receives

A structured JSON payload assembled from data the pipeline already collects:

```json
{
  "tables": { "pageViews": true, "requests": true, "customEvents": true, ... },
  "customDimensionsKeys": {
    "pageViews": ["uid", "companyId", "env", "pageRoute"],
    "requests": ["correlationId", "uid", "region"],
    "customEvents": ["featureName", "uid", "plan"]
  },
  "probeCounts": {
    "userAuthCount": 0,
    "userAnonCount": 45000,
    "sessionCount": 38000,
    "pageViewsCount": 120000,
    ...
  },
  "availableSignals": {
    "pageViews": true,
    "requests": true,
    "userId": false,
    "sessionId": true,
    ...
  }
}
```

No raw telemetry, no PII, no KQL queries — just metadata.

### What the LLM returns

A structured JSON response with mapping proposals and a human-readable report:

```json
{
  "mappings": {
    "canonicalUserId": {
      "source": "customDimensions.uid",
      "expr": "tostring(customDimensions[\"uid\"])",
      "confidence": "high",
      "reasoning": "Key 'uid' appears in pageViews, requests, and customEvents with consistent presence. Likely a user identifier."
    },
    "canonicalSessionId": {
      "source": "session_Id",
      "expr": "session_Id",
      "confidence": "high",
      "reasoning": "38,000 sessions detected via built-in session_Id field."
    },
    "canonicalPagePath": {
      "source": "pageViews.url",
      "expr": "tostring(parse_url(url).Path)",
      "confidence": "high",
      "reasoning": "Standard pageViews table is active with 120k events."
    }
  },
  "report": {
    "summary": "Your environment is well instrumented. 5 of 7 signals are active...",
    "findings": [
      "User identity is tracked via a custom dimension 'uid' across all tables.",
      "No authenticated user ID (user_AuthenticatedId) detected — 'uid' appears to be an anonymous or pseudonymized identifier.",
      "Consider adding user_AuthenticatedId for richer cohort analysis."
    ],
    "unmappedKeys": ["companyId", "env", "region", "correlationId", "featureName", "plan"],
    "suggestions": [
      "'companyId' could enable B2B segmentation in a future update.",
      "'plan' could map to a pricing tier for revenue analytics."
    ]
  }
}
```

### Confidence-based behavior

| Confidence | Behavior                                         |
|------------|--------------------------------------------------|
| high       | Apply mapping automatically                      |
| medium     | Show proposal in UI, ask user to confirm          |
| low        | Show in report as suggestion, do not apply        |

## Fallback Strategy

The LLM step is optional and gracefully degradable:

1. **LLM available + responds** → use AI mappings (filtered by confidence)
2. **LLM available + error/timeout** → fall back to deterministic `buildMapping()`
3. **LLM not configured** → use deterministic `buildMapping()` (current behavior)

The deterministic mapping should also be enriched with a broader alias list as a
baseline improvement regardless of LLM availability.

## Implementation Scope

### Layer 1: Alias heuristics in `mapping.js`

- Add `ALIASES` lookup table with exact matches and regex patterns per field
- Refactor `buildMapping()` to walk the resolution chain:
  built-in → exact alias → pattern match
- Add `matchType` and `matchedKey` to each canonical mapping for transparency
- Cross-table consistency: boost confidence when a key appears in 2+ tables
- No new dependencies, no config, no external calls
- **Ships independently** — immediate value even if Layer 2 is never built

### Layer 2: LLM analysis in `src/core/llmAnalysis.js`

- Accepts `{ schemaProfile, readinessReport }` (already available in pipeline)
- Builds the LLM prompt with structured JSON context (schema metadata only)
- Calls Azure OpenAI (chat completions API) with JSON response format
- Validates the response against a strict schema
- Returns parsed mappings + report, or `null` on failure
- New state `AI_ANALYSIS` between `SCHEMA_PROFILING` and `MAPPING_BUILD`
- Skipped entirely when LLM is not configured (zero impact on existing flow)

### Layer 3: User overrides

- Manual assignment UI: dropdown per canonical field listing available
  custom dimension keys
- Overrides persisted in tenant metadata (`metadataStore.js`)
- Take precedence over all other layers
- Displayed with "manual" badge in mapping view

### Mapping merge logic in `mapping.js`

- `buildMapping()` gains optional `llmMappings` and `userOverrides` parameters
- Resolution order: user override > LLM high-confidence > alias/pattern > builtin
- Medium-confidence LLM proposals stored separately for UI confirmation
- Mapping `version` hash incorporates all sources for cache coherence

### UI additions

- Setup report panel (rendered from LLM `report.summary` + `report.findings`)
- Confirmation dialog for medium-confidence mappings
- Mapping source badges: "built-in", "alias", "AI", "manual"
- Override controls per canonical field

### Configuration

The LLM call goes through the provider abstraction defined in
[`../architecture-ai.md`](../architecture-ai.md). Layer 2 calls
`aiClient.generate({ task: "mappingAnalysis", ... })` and works with any
provider (`ollama`, `azure-openai`, future `openai-compatible`). The
configuration shown below is the Azure OpenAI variant; see the architecture
doc for the full provider matrix including the 100%-local Ollama option.

```env
# Selects the AI backend; default "none" disables Layer 2 entirely.
AI_PROVIDER=azure-openai

# Required when AI_PROVIDER=azure-openai
AZURE_OPENAI_ENDPOINT=https://your-instance.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_DEFAULT=gpt-4o-mini
AZURE_OPENAI_API_KEY=...
```

## What This Is NOT

- **Not a runtime LLM dependency** — the LLM runs once at setup, result is
  cached. Dashboards never wait for an LLM call.
- **Not a replacement for deterministic mapping** — the existing logic remains
  as the primary fallback and handles the common cases.
- **Not a security risk** — only schema metadata (table names, column names,
  counts) is sent to the LLM. No raw telemetry, no PII, no access tokens.
- **Not Azure MCP** — the web app calls Azure OpenAI directly via REST API.
  MCP is a Cursor/IDE tool and has no role in the production runtime.

## Relationship to Existing Backlog

- **Phase 2 (current)**: schema profiling and deterministic mapping already
  implemented. This feature extends them without breaking changes.
- **Phase 3 — LLM Enhancements**: covers labels, explanations, snippets, and
  anomaly descriptions (post-setup usage). This feature is complementary — it
  targets the setup/onboarding flow specifically.
- Can be implemented independently, before or alongside Phase 3 LLM work.
  The Azure OpenAI configuration would be shared.

## Estimated Effort

### Layer 1 alone (shippable independently)

| Component                          | Estimate |
|------------------------------------|----------|
| Alias table + pattern matching     | 0.5 day  |
| Refactor `buildMapping()` chain    | 0.5 day  |
| Tests for alias/pattern resolution | 0.5 day  |
| **Layer 1 total**                  | **1.5 days** |

### Full implementation (all three layers)

| Component                          | Estimate |
|------------------------------------|----------|
| Layer 1 (alias heuristics)         | 1.5 days |
| Layer 2 (`llmAnalysis.js` + state) | 1.5 days |
| Layer 3 (user override UI + store) | 1 day    |
| Mapping merge logic                | 0.5 day  |
| UI report panel + badges           | 1 day    |
| Tests (all layers)                 | 1 day    |
| **Full total**                     | **6-7 days** |

## Open Questions

- Should the LLM analysis re-run when the schema profile changes (new custom
  dimensions appear), or only on first setup?
- Should medium-confidence mappings be persisted as "pending review" in tenant
  metadata?
- Rate limiting / cost control: one LLM call per tenant per setup is cheap, but
  should there be an explicit cooldown?
