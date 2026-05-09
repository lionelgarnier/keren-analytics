# Natural Language Query Explorer

## Summary

Add a conversational query interface where users type questions in plain
language, an LLM translates them into KQL, the app executes the query against
the user's Log Analytics workspace, and results are rendered in an
automatically selected chart. The app's existing schema profile, mapping, and
readiness data are injected as LLM context, producing more accurate KQL than
generic natural-language-to-KQL tools.

## Why This App Has an Unfair Advantage

Generic NL-to-KQL (like Azure Monitor's preview) operates blind — it knows KQL
syntax but nothing about the specific workspace. Easy Analytics already collects
rich context at setup time:

| Context available                  | How it helps the LLM                              |
|------------------------------------|----------------------------------------------------|
| `schemaProfile.tables`             | Only reference tables that actually contain data    |
| `schemaProfile.customDimensionsKeys` | Use real custom dimension names, not guesses       |
| `mapping.canonicalUserId.expr`     | Know exactly which field holds the user identity    |
| `mapping.canonicalSessionId.expr`  | Same for sessions                                   |
| `mapping.canonicalPagePath.expr`   | Same for page paths                                 |
| `readinessReport.availableSignals` | Avoid suggesting queries on signals that don't exist |
| `readinessReport.probeCounts`      | Know approximate data volumes for time range hints  |

This context is injected into the system prompt, giving the LLM a precise map
of the workspace before it writes a single line of KQL.

## User Flow

```
┌──────────────────────────────────────────────────────────┐
│  Dashboard (Marketing / Technical / Readiness)           │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 💬 Ask your data...                                │  │
│  │                                                    │  │
│  │  "Top 5 pages with the highest error rate          │  │
│  │   this week, by country"                           │  │
│  └────────────────────────────────────────────────────┘  │
│                          │                               │
│                          ▼                               │
│  ┌─ Query Preview ───────────────────────────────────┐   │
│  │  requests                                         │   │
│  │  | where timestamp > ago(7d)                      │   │
│  │  | where success == false                         │   │
│  │  | summarize errors = count() by url, ...         │   │
│  │  | top 5 by errorRate desc                        │   │
│  │                                                   │   │
│  │  Chart: grouped bar         [Edit] [Run] [Cancel] │   │
│  └───────────────────────────────────────────────────┘   │
│                          │                               │
│                          ▼                               │
│  ┌─ Results ─────────────────────────────────────────┐   │
│  │  ████████████  /checkout     US  12.3%            │   │
│  │  █████████     /checkout     FR   9.1%            │   │
│  │  ████████      /payment      US   8.7%            │   │
│  │  ...                                              │   │
│  │                                     [Save] [Share]│   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Step by step

1. User types a question in the query bar
2. App sends the question + workspace context to Azure OpenAI
3. LLM returns a JSON response: KQL query + chart config + title
4. App shows the KQL in a preview panel — user can review, edit, or cancel
5. User clicks Run — app executes the KQL via `queryWorkspace()`
6. Results are rendered in the suggested chart type
7. Optionally: save as a custom widget on the dashboard

## LLM System Prompt Design

The system prompt is assembled dynamically from the tenant's profile:

```
You are a KQL query generator for Azure Application Insights.

## Workspace context
Active tables: requests, pageViews, customEvents, exceptions, browserTimings
Custom dimensions:
  - pageViews: [uid, companyId, env, pageRoute]
  - requests: [uid, region, correlationId]
  - customEvents: [featureName, uid, plan]

## Field mappings
- User identity: user_Id (anonymous)
- Session: session_Id
- Page path: tostring(parse_url(url).Path)
- Referrer: tostring(customDimensions["refUri"])

## Data volume (last 24h)
- pageViews: ~120,000 events
- requests: ~85,000 events
- sessions: ~38,000

## Rules
- ONLY use tables listed above
- ALWAYS constrain time range (use the range provided, or default to 7d)
- ALWAYS add "| take 500" unless the query already has a top/limit
- NEVER project raw PII fields (email, name, IP address, phone)
- NEVER use mv-expand or joins on large tables without time filter
- Prefer summarize over raw row output
- Use the canonical field mappings above for userId, sessionId, pagePath

## Output format (strict JSON)
{
  "kql": "the full KQL query",
  "chart": "line | bar | bar_horizontal | doughnut | table | kpi_card",
  "title": "short chart title",
  "xLabel": "x axis label (if applicable)",
  "yLabel": "y axis label (if applicable)",
  "explanation": "one sentence explaining what this query does"
}
```

## Security Guardrails

### Before LLM call

- Reject empty or excessively long input (> 500 chars)
- Rate limit: max 10 queries per user per hour (configurable)

### After LLM response, before execution

| Check                        | Action                                    |
|------------------------------|-------------------------------------------|
| Tables in whitelist?         | Reject if referencing unknown tables       |
| Time range bounded?          | Inject `ago(30d)` max if unbounded         |
| Row limit present?           | Append `\| take 500` if missing            |
| PII fields projected?        | Strip or reject (blacklist: email, name, ip, phone) |
| KQL structurally valid?      | Regex validation on dangerous patterns     |
| Response is valid JSON?      | Fallback to error message if not           |

### At execution time

- Use the existing `queryWorkspace()` with a timeout (30s max)
- Log the query for audit (tenant, question, KQL generated, execution time)
- Display errors gracefully ("The query didn't return results" vs raw error)

### The preview step is the ultimate guardrail

The user always sees the KQL before it runs. This provides:
- **Security**: user can spot inappropriate queries
- **Transparency**: no black-box magic
- **Education**: users learn KQL by seeing what the LLM produces
- **Trust**: builds confidence in the tool over time

## Chart Type Selection

### LLM suggestion + heuristic validation

The LLM suggests a chart type based on the user's intent. After query execution,
a heuristic validates the suggestion against the actual result shape:

| Result shape                              | Valid charts                    |
|-------------------------------------------|---------------------------------|
| 1 row, 1 numeric column                  | `kpi_card`                      |
| N rows, 1 timestamp + 1 numeric          | `line`                          |
| N rows, 1 timestamp + M numeric          | `line` (multi-series)           |
| N rows, 1 categorical + 1 numeric        | `bar` or `bar_horizontal`       |
| N rows, 2 categorical + 1 numeric        | `bar` (grouped) or `table`      |
| N rows, 1 categorical (proportions)      | `doughnut`                      |
| Any shape not matching above              | `table` (safe fallback)         |

If the LLM's suggestion conflicts with the result shape, the heuristic wins.
The user can also manually switch chart type after rendering.

## Implementation Scope

### New module: `src/core/nlQuery.js`

- `buildQueryPrompt({ schemaProfile, mapping, readinessReport, timeRange })` —
  assembles the system prompt from tenant context
- `generateKql({ question, systemPrompt })` — calls Azure OpenAI, returns
  parsed JSON response
- `validateKql({ kql, schemaProfile })` — static validation checks before
  execution
- `suggestChartType({ columns, rows })` — heuristic chart type from result shape

### New API endpoint: `POST /api/query`

```
Request:  { "question": "Top 5 pages with most errors this week" }
Response: {
  "kql": "...",
  "chart": "bar",
  "title": "...",
  "explanation": "...",
  "status": "preview"
}
```

### New API endpoint: `POST /api/query/run`

```
Request:  { "kql": "...", "chart": "bar" }
Response: {
  "columns": [...],
  "rows": [...],
  "chart": "bar",
  "title": "...",
  "executionTimeMs": 1230
}
```

Splitting into two endpoints enforces the preview-then-run pattern. The frontend
cannot skip the preview step.

### Frontend: query explorer panel

- Collapsible query bar at the top of the dashboard (or as a dedicated tab)
- Query preview with syntax-highlighted KQL (read-only code block)
- Edit button to allow manual KQL tweaks before running
- Chart renderer supporting all types (reuses existing Chart.js setup)
- Chart type switcher (dropdown to override the auto-selection)
- Query history sidebar (last 10 queries, click to re-run)

### Saved queries (v2)

- Save a query + chart config as a named widget
- Pin saved widgets to the dashboard alongside built-in panels
- Share saved queries within the same tenant
- Stored in tenant metadata (metadataStore, later Postgres)

## What This Is NOT

- **Not a replacement for the built-in dashboards** — the predefined Marketing
  and Technical views remain the primary experience. The query explorer is an
  advanced tool for ad-hoc exploration.
- **Not a real-time chat** — each question is independent. Conversation context
  (multi-turn) is a v2 feature.
- **Not unguarded LLM execution** — the preview step, static validation, and
  table whitelist ensure no query runs without user consent and safety checks.

## Example Queries (for testing and demo)

| User question | Expected KQL pattern |
|---|---|
| "How many unique visitors yesterday?" | `pageViews \| where timestamp > ago(1d) \| summarize dcount(user_Id)` |
| "Error rate trend this week" | `requests \| where timestamp > ago(7d) \| summarize ... by bin(timestamp, 1h)` |
| "Top 10 slowest endpoints" | `requests \| summarize avg(duration) by url \| top 10 by avg_duration` |
| "Browser distribution for mobile users" | `pageViews \| where client_Type == "Browser" \| summarize count() by client_Browser` |
| "Compare error rate between France and Germany" | `requests \| where client_CountryOrRegion in ("France","Germany") \| summarize ...` |
| "Which custom events fire most often?" | `customEvents \| summarize count() by name \| top 10 by count_` |

## Relationship to Existing Backlog

- **AI Provider abstraction**: this feature is the most quality-sensitive
  consumer of the client defined in
  [`../architecture-ai.md`](../architecture-ai.md). The `nlToKql` task
  routes to a coder model (`qwen2.5-coder` for `ollama`, `gpt-4o` for
  `azure-openai`). For the local provider, see the mitigations in the
  architecture doc — KQL is the hardest task for small models.
- **AI Environment Analysis**: shares the same `aiClient` and provider
  configuration. The environment analysis runs once at setup; the query
  explorer runs on-demand.
- **Phase 3 — LLM Enhancements**: the query explorer is a superset of the
  "anomaly explanation" item already listed. A natural language query like
  "Why did the error rate spike yesterday?" would be answered by the same
  system.
- **Phase 4 — Smart Alerts**: alert investigation ("what caused this alert?")
  could route through the query explorer as a pre-filled question.

## Estimated Effort

### v1 — Query, preview, run, render

| Component                         | Estimate  |
|-----------------------------------|-----------|
| `nlQuery.js` (prompt + validation)| 1.5 days  |
| API endpoints (preview + run)     | 1 day     |
| Frontend query bar + preview      | 1.5 days  |
| Chart type heuristic + renderer   | 1 day     |
| Security guardrails + logging     | 0.5 day   |
| Tests + example queries           | 1 day     |
| **v1 total**                      | **6-7 days** |

### v2 — Saved queries, multi-turn, suggestions

| Component                         | Estimate  |
|-----------------------------------|-----------|
| Saved queries + dashboard pinning | 2 days    |
| Multi-turn context                | 1.5 days  |
| Suggested questions               | 1 day     |
| **v2 total**                      | **4-5 days** |

## Open Questions

- Should the query explorer be available to all users, or gated behind a
  "power user" toggle / role?
- Should there be a cost indicator? ("This query will scan ~120k rows,
  estimated cost: $0.002")
- Should failed or slow queries trigger automatic suggestions? ("Your query
  timed out — try narrowing the time range to 24h")
- Multi-turn: should the LLM remember the previous query for follow-ups
  ("now filter by France"), or is each question standalone?
