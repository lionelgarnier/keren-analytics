# AI Instrumentation Assistant

## Summary

Turn the existing prompt generator into a continuous, contextual coach that
suggests *which* App Insights markers to add next, *where* in the codebase to
add them, and *how* to instrument them — with stack-aware code snippets ready
to paste into Cursor, Copilot, or directly into a PR.

This goes beyond the current `promptGenerator.js` (which produces generic
prompts for missing canonical signals) by reasoning about the user's specific
funnel, page paths, custom events, and detected stack to recommend
**business-relevant** instrumentation, not just the canonical 7 signals.

## Problem

The product today helps users see what they have. It does not help them
decide what they should *also* track. The readiness score answers "do you
have userId?" but not "given this is a B2B SaaS with a /pricing page and a
/signup page, you're missing a `signup_completed` event — here's the
React/Node snippet to add it."

This gap matters because:

- The marketing dashboard is empty for any tenant that hasn't instrumented
  custom events. The product's value is hidden behind work the user doesn't
  know to do.
- Generic recommendations ("add userId") are easy to ignore. **Specific,
  pasteable code** ("add `appInsights.trackEvent({ name: 'signup_completed',
  properties: { plan: user.plan } })` after line 47 of `app/signup/page.tsx`")
  is hard to ignore.
- The LLM context window already contains everything needed: detected stack,
  page paths, existing events, schema profile, readiness gaps. We're sitting
  on the inputs.

## What gets recommended

Recommendations are organized by **value tier** so the UI can surface the
highest-impact ones first.

### Tier A — Conversion events (highest business value)

Inferred from page paths and the canonical funnel. If the schema profile
shows `/pricing`, `/signup`, `/checkout`, `/welcome` pages but no
`customEvents` matching `signup_*` or `checkout_*`, the assistant proposes:

- `signup_started` (page view of /signup)
- `signup_completed` (transition from /signup to /welcome)
- `checkout_started`
- `checkout_completed`
- `plan_selected` with `plan` property
- `cta_clicked` with `cta_id` property

Each comes with a 5-15 line snippet for the detected stack.

### Tier B — Identity and segmentation

When `mapping.canonicalUserId` is null but the stack uses NextAuth, Auth0,
Clerk, or Azure AD B2C (detectable from package signals if available, or
inferable from common imports):

- `setAuthenticatedUserContext` for the detected SDK
- Custom dimension `companyId` / `tenantId` for B2B segmentation (when the
  app appears multi-tenant)
- Custom dimension `plan` / `tier` for revenue analytics

### Tier C — Feature usage

When `customEvents` has fewer than ~5 distinct event names, the assistant
proposes a feature-tracking pattern:

- `feature_used` with `feature_name` property
- `experiment_exposed` with `variant` property
- Stack-specific instrumentation (e.g., a React `<TrackedFeature>` component
  or a Next.js middleware hook).

### Tier D — Diagnostics

When `requests` exists but `dependencies` is empty (or below threshold):

- Enable dependency tracking (most SDKs require explicit configuration)
- Add `correlationId` propagation across services if multi-service detected

Each tier is independent — a tenant only sees recommendations for what they
lack.

## What the LLM sees

The assistant runs as a post-readiness step, with a payload assembled from
already-collected data:

```json
{
  "stack": {
    "frontend": "react",
    "backend": "node",
    "framework": "next",
    "auth": "nextauth"
  },
  "schemaProfile": {
    "tables": { "pageViews": true, "requests": true, "customEvents": true, "dependencies": false },
    "customEvents": [
      { "name": "page_loaded", "count": 120000 },
      { "name": "search_performed", "count": 5400 }
    ],
    "topPages": [
      { "path": "/", "count": 45000 },
      { "path": "/pricing", "count": 12000 },
      { "path": "/signup", "count": 3200 },
      { "path": "/welcome", "count": 1800 },
      { "path": "/dashboard", "count": 22000 }
    ]
  },
  "mapping": {
    "canonicalUserId": null,
    "canonicalSessionId": "session_Id",
    "canonicalPagePath": "tostring(parse_url(url).Path)"
  },
  "readinessGaps": ["userId", "browserTimings"],
  "tenantContext": {
    "appearsMultiTenant": true,
    "hasSubscriptionPages": true
  }
}
```

No telemetry, no PII, no source code is sent to the LLM. The
`appearsMultiTenant` and `hasSubscriptionPages` flags are heuristics computed
from page paths server-side.

## What the LLM returns

```json
{
  "recommendations": [
    {
      "id": "signup_completed",
      "tier": "A",
      "title": "Track signup completions",
      "why": "Your page paths show /signup → /welcome traffic, but no signup_completed event exists. This is the single most valuable event to add — it unlocks the entire conversion funnel and revenue tracking.",
      "estimatedScoreLift": 0,
      "businessLift": "Unlocks Conversions tab and signup funnel chart",
      "stack": "next",
      "snippet": {
        "language": "tsx",
        "filenameHint": "app/welcome/page.tsx (or wherever post-signup redirect lands)",
        "code": "import { ApplicationInsights } from '@microsoft/applicationinsights-web';\n\nconst appInsights = ApplicationInsights.instance; // or your shared instance\n\nuseEffect(() => {\n  appInsights.trackEvent({\n    name: 'signup_completed',\n    properties: {\n      plan: searchParams.get('plan') ?? 'free',\n      source: document.referrer || 'direct'\n    }\n  });\n}, []);"
      },
      "verifyKql": "customEvents | where name == 'signup_completed' | summarize count() by bin(timestamp, 1h)"
    },
    {
      "id": "auth_user_context",
      "tier": "B",
      "title": "Identify authenticated users",
      "why": "Your readiness score is missing userId (15 points). NextAuth detected — pipe the session into App Insights at the layout level so every event is tied to a user.",
      "estimatedScoreLift": 15,
      "stack": "next",
      "snippet": {
        "language": "tsx",
        "filenameHint": "app/layout.tsx",
        "code": "// after the NextAuth session resolves\nappInsights.setAuthenticatedUserContext(\n  session.user.id,\n  session.user.accountId, // optional account id for B2B\n  true // store in cookie for cross-page persistence\n);"
      },
      "verifyKql": "pageViews | where isnotempty(user_AuthenticatedId) | summarize dcount(user_AuthenticatedId) by bin(timestamp, 1d)"
    }
  ],
  "narrative": "Two changes will unlock most of your dashboard: (1) signup_completed for the Conversions tab, (2) authenticated user context for cohort analysis. Both are 10-line additions to existing files."
}
```

Each recommendation carries:
- a verification KQL query the user can run after deploying to confirm the
  instrumentation works,
- a score lift for canonical signals (so the readiness ring updates
  immediately upon detection),
- a `businessLift` string for non-canonical events (the readiness score
  doesn't move, but the user understands what unlocks).

## UI surface

A new "Improve" tab (or a section in the existing Readiness tab) lists
recommendations grouped by tier. Each card has:

- Title, why, estimated lift
- Syntax-highlighted snippet with copy button
- "Open in Cursor / Copilot" deep links (`cursor://...`) when supported
- "Mark as done" button — marks the recommendation as in-progress in tenant
  metadata; the next pipeline run auto-detects whether the event/dimension
  appeared and either confirms or re-suggests with diagnostics ("event
  appeared but only 3 times in 24h — make sure it fires on real signups,
  not just dev").
- "Dismiss" button — hides the recommendation permanently for this tenant.

## Pipeline integration

```
Existing pipeline
─────────────────
  ... → MAPPING_BUILD → DASHBOARD_BUILD

New step
────────
  ... → MAPPING_BUILD → DASHBOARD_BUILD → INSTRUMENTATION_SUGGESTIONS (async)
                                          └─ persisted to tenant metadata
                                          └─ surfaced when UI loads Improve tab
```

The suggestion step runs **asynchronously** after the dashboard renders so
it never blocks first paint. Results are cached per tenant + schema profile
hash so re-runs only happen when the schema actually changes.

## Closing the loop — auto-verification

The killer feature is loop closure: when the user pastes the snippet,
deploys, and the instrumentation fires, the next readiness probe detects it.
The Improve card updates from "Suggested" to "Detected ✓" with a sparkline
showing the new event volume.

This requires:
- Tagging recommendations with the KQL probe used for verification.
- A scheduled job (or on-demand re-run) that checks each in-progress
  recommendation against probes.
- Webhook / email notification "Your `signup_completed` event is live —
  here's the new Conversions chart" — strong re-engagement trigger.

## Estimated effort

| Component                                           | Estimate |
|-----------------------------------------------------|----------|
| Stack detection enrichment (auth lib, framework)    | 1 day    |
| Tenant-context heuristics (multi-tenant, paid pages) | 0.5 day |
| LLM prompt + strict response schema                 | 1 day    |
| Recommendation cache + persistence                  | 0.5 day  |
| Improve tab UI (cards, copy, deep links)            | 2 days   |
| Verification probe + status update                  | 1 day    |
| Tests (mock LLM, fallback, schema validation)       | 1 day    |
| **Total**                                           | **7 days** |

## Relationship to existing specs

- Extends [`promptGenerator.js`](../../src/core/promptGenerator.js) which
  today produces static prompts per missing canonical signal. The assistant
  generalizes this from "signal gaps" to "business event gaps" with code
  snippets and verification queries.
- Reuses the LLM client and shared schema-validation infrastructure
  introduced by [`ai-environment-analysis.md`](ai-environment-analysis.md).
- Feeds the conversion funnel feature in
  [`adoption-drivers.md`](adoption-drivers.md) Tier 1 — without this
  assistant, most tenants will not have the events the funnel needs.

## What this is NOT

- **Not a code modifier.** The assistant produces snippets and copy buttons;
  it never edits the user's repo.
- **Not a generic LLM coding assistant.** Recommendations are constrained to
  App Insights instrumentation patterns; the prompt explicitly forbids
  unrelated suggestions.
- **Not a runtime LLM dependency.** Suggestions are computed once per
  schema-profile change and cached.

## Open questions

- Should "Mark as done" require a verification probe to flip to "Detected",
  or is the user's claim enough?
- Should the assistant produce framework-specific tests for the new
  instrumentation, or only the instrumentation itself?
- For multi-stack tenants (frontend React + backend Node), do we generate
  paired snippets or treat them as independent recommendations?
