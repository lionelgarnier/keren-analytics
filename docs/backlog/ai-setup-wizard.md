# AI-Powered Setup Wizard

## Summary

Replace the current 13-step Entra ID setup guide and manual resource selection
with an LLM-driven onboarding wizard that takes a user from "I have an Azure
account" to "I see a populated dashboard" in under 90 seconds. The LLM reads
what the user has, narrates what it found, asks 0-2 clarifying questions, and
configures everything else automatically.

This document covers the **setup phase only** (auth, resource discovery,
environment analysis, first-render). Mapping intelligence is detailed in
[`ai-environment-analysis.md`](ai-environment-analysis.md). Ongoing
instrumentation suggestions are in
[`ai-instrumentation-assistant.md`](ai-instrumentation-assistant.md).

## Problem

The current setup flow has two cliffs:

1. **Entra ID app registration.** `docs/setup-entra-id.md` is a careful
   13-step guide. Anyone who isn't an Azure admin (or doesn't have admin
   help) bounces.
2. **First-render silence.** Once authenticated, the user picks one resource
   from a list, sees a dashboard, and is left to figure out which signals are
   missing and why some charts are empty.

Both cliffs lose users at the highest-intent moment.

## Target experience

```
User clicks "Connect Azure"
   │
   ▼
"Sign in with Microsoft"  (Entra ID consent — single click)
   │
   ▼
LLM narrates while the pipeline runs:
   ┌──────────────────────────────────────────────────────────┐
   │  Looking around your tenant…                             │
   │  Found 4 Application Insights resources across 2 subs.   │
   │  ✔ acme-prod-web   — 120k events/day, well instrumented  │
   │  ✔ acme-prod-api   — 80k requests/day                    │
   │  ⚠ acme-staging    — quiet for 7 days, skipping          │
   │  ⚠ acme-old-pwa    — classic AI, not supported           │
   │                                                          │
   │  I'll start with acme-prod-web — that's where the action │
   │  is. Want me to also pull acme-prod-api in?  [Yes] [No]  │
   └──────────────────────────────────────────────────────────┘
   │
   ▼
Dashboard renders with a "first-run" banner that summarizes:
   - what was detected,
   - what's missing,
   - one-click "tell me how to fix the gaps" link.
```

No portal navigation. No JSON. No KQL. No checklist of permissions to
remember.

## Architecture

The wizard is a thin orchestration layer over capabilities that already exist
or are specced elsewhere.

```
┌─────────────── Setup Wizard (new) ─────────────────────────┐
│                                                             │
│  1. Auth      → reuses existing PKCE flow                   │
│  2. Discovery → reuses existing /azure/discover             │
│  3. Triage    → NEW: LLM ranks resources by "interestingness"│
│  4. Profile   → reuses schemaProfile + readiness            │
│  5. Analyze   → reuses ai-environment-analysis pipeline     │
│  6. Narrate   → NEW: LLM produces the human-readable script │
│  7. Render    → reuses dashboard pipeline                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Only steps 3 and 6 are net-new. Everything else is wiring.

### Step 3 — Resource triage

When discovery returns more than one resource, instead of dumping the list and
asking the user to pick, the LLM is given lightweight metadata for each
(name, location, last-seen activity, classic-vs-workspace-based, approximate
event volume from a single fast probe) and produces a ranked recommendation.

**LLM input** (no telemetry, only metadata already collected):
```json
{
  "resources": [
    { "name": "acme-prod-web", "kind": "workspace-based", "events24h": 120000, "lastSeen": "minutes ago" },
    { "name": "acme-prod-api", "kind": "workspace-based", "events24h": 80000, "lastSeen": "minutes ago" },
    { "name": "acme-staging",  "kind": "workspace-based", "events24h": 0,      "lastSeen": "7 days ago" },
    { "name": "acme-old-pwa",  "kind": "classic",         "events24h": null,   "lastSeen": null }
  ]
}
```

**LLM output**:
```json
{
  "primary": "acme-prod-web",
  "alsoSuggest": ["acme-prod-api"],
  "skip": [
    { "name": "acme-staging", "reason": "no events in last 7 days" },
    { "name": "acme-old-pwa", "reason": "classic Application Insights — not supported" }
  ],
  "rationale": "acme-prod-web has the highest event volume and recent activity..."
}
```

The UI presents the primary recommendation and exposes the others as
opt-ins. The user does not have to read four resource names; they read one
sentence and click through.

### Step 6 — Narration

After mapping and readiness are computed, the LLM receives the structured
result and produces the first-run banner:

**LLM input**:
- selected resource(s) name and stack (detected from custom dimensions)
- mapping result from `ai-environment-analysis.md` (high/medium/low confidence)
- readiness score and missing signals
- top empty charts and their reason

**LLM output** (strict schema):
```json
{
  "headline": "You're at 68/100 — solid foundation, two quick wins available.",
  "summary": "Your React app is sending pageViews and requests reliably. User identity is missing, which is what's hiding cohort analysis on the Marketing tab.",
  "wins": [
    { "label": "Add user identity", "score": "+15", "linkTo": "prompts#userId" },
    { "label": "Capture browser timings", "score": "+8", "linkTo": "prompts#browserTimings" }
  ],
  "tone": "encouraging"
}
```

The headline and summary are validated against a strict schema. If the LLM
fails, the banner falls back to deterministic copy assembled from the same
inputs.

## Auth simplification (separate, but in scope for adoption)

The wizard cannot avoid the Entra ID app registration today. The two paths
forward:

### Option A — Multi-tenant first-party app

Register the SaaS-hosted Keren Analytics as a multi-tenant Entra ID app. Users
sign in once via "Sign in with Microsoft", consent on behalf of their tenant,
and the app uses on-behalf-of (OBO) flow to query their workspace. **Zero
manual setup.** This is the only experience that delivers the "90 seconds"
promise. Requires hosted infrastructure (Phase 3+).

### Option B — Bicep one-click

For self-hosted users, ship a `deploy/azure-app-registration.bicep` that
creates the app registration, sets the redirect URI, generates a secret, and
optionally pre-assigns Reader + Log Analytics Reader roles. The user runs:

```bash
az deployment sub create -f deploy/azure-app-registration.bicep \
  -p redirectUri=https://my-host/auth/callback
```

…and gets the values to put in `.env`. Reduces 13 manual steps to one
command. Should ship regardless of Option A.

## Implementation scope

| Component                               | Estimate | Depends on |
|-----------------------------------------|----------|------------|
| Resource triage LLM call + UI           | 1.5 days | LLM client (shared) |
| First-run narration LLM call + banner   | 1 day    | `ai-environment-analysis.md` Layer 2 |
| Bicep one-click app registration        | 1 day    | none |
| Multi-tenant SaaS auth (Option A)       | 5+ days  | Phase 3 hosting |
| Wizard UI (single-page, progressive)    | 2 days   | shared LLM client |
| Strict schema validation + fallback copy| 0.5 day  | none |
| Tests (mock LLM, fallback paths)        | 1 day    | none |
| **Total (Option B path)**               | **7 days** | |

## What this is NOT

- **Not a chatbot.** The wizard is a guided flow with at most two LLM-asked
  questions; it is not a free-form conversation.
- **Not a runtime LLM dependency.** All LLM calls happen during setup; the
  results are persisted in tenant metadata and the dashboard never waits on
  the LLM.
- **Not exposing telemetry to the LLM.** Only resource metadata and
  aggregated counts are sent — same security posture as
  `ai-environment-analysis.md`. Resource triage and narration go through the
  `aiClient` interface defined in
  [`../architecture-ai.md`](../architecture-ai.md), so a self-hoster can run
  the whole wizard with `AI_PROVIDER=ollama` and zero outbound AI traffic.

## Success metrics

- Time from "click Connect Azure" to "dashboard rendered with at least one
  populated KPI" ≤ 90 seconds (P50) for tenants with workspace-based App
  Insights.
- Setup completion rate ≥ 80% for users who reach the auth screen (today the
  drop-off in the manual Entra ID setup is unmeasured but anecdotally
  severe).
- ≥ 50% of users click at least one "quick win" link from the first-run
  banner within their first session.
