# AI-Powered Setup Wizard

> **STATUS — SHIPPED 2026-05-11.** Tracks F1-F4 of the launch-readiness plan
> are live; F5 (this doc, the architecture-ai doc, and the
> ai-environment-analysis doc) refreshes them to match what was actually
> built. The narrative below stayed valid as design intent — the
> implementation diverged on a handful of points captured in the
> "Implementation status" section right below.

## Implementation status (2026-05-11)

| Stage in the wizard       | Code location                                                | Notes |
|---------------------------|--------------------------------------------------------------|-------|
| Persistence (SQLite)      | [`src/core/db.js`](../../src/core/db.js), [`metadataStore.js`](../../src/core/metadataStore.js) | F1 |
| Schema scan + gaps + PII scrub | [`src/core/schemaScan.js`](../../src/core/schemaScan.js), [`scanStore.js`](../../src/core/scanStore.js) | F2; 3 new KQL templates in `kql/` |
| AI mapping proposals      | [`src/ai/*`](../../src/ai), [`src/core/aiMappingService.js`](../../src/core/aiMappingService.js), [`mappingStore.js`](../../src/core/mappingStore.js) | F3; provider abstraction, JSON-schema strict, EUR quota guard |
| Wizard UI (4 steps)       | [`public/setup.html`](../../public/setup.html), [`public/setup.js`](../../public/setup.js), `/api/setup/{state,scan,findings,validate}` in [`src/server.js`](../../src/server.js) | F4; vanilla JS, no bundler |
| User override → mapping   | [`src/core/validationStore.js`](../../src/core/validationStore.js), `mergeWithValidation` in [`mapping.js`](../../src/core/mapping.js) | F4; Layer 3 of the 3-layer resolution chain |
| Re-scan button            | "Re-scan" link in the dashboard navbar pointing at `/setup`  | F5 |
| Pre-fill validate step    | `effectiveMapping[]` in `/api/setup/findings`                | F5; deterministic fallback always populates the validate step, even when `AI_PROVIDER=none` |
| Narration "Preview" badge | Auto-drops when `aiMapping.source = "azure-foundry"` and non-degraded | F5 |

### Post-shipment iterations (2026-05-12)

A first round of dogfooding on real Foundry telemetry surfaced UX gaps and one
silent correctness bug. The wizard's shape was reworked while keeping the
4-step state machine intact:

| Change | Before | After | Code |
|--------|--------|-------|------|
| Step-1 scan log | Plain narration ticks, no introspection. | Each step expands into a debug panel populated from the findings payload (resource info / customDimensions / event volumes / identity gaps / raw AI proposals JSON). The scan no longer auto-advances — a "Continue to findings →" button explicitly hands off, so users can inspect what the orchestrator actually fetched before moving on. | `initScanningLog` / `renderStepDetails` in [`setup.js`](../../public/setup.js) |
| Step-2 framing | Technical grid: tables present, customDimensions, gaps, AI mapping table, KQL. Power-user oriented. | 8 graph-level cards (✓ Ready / ! Needs instrumentation / · Partial) driven by `dashboard_recommendations.feature` / `.hide` from the AI. The technical mapping table moved to step 3 behind a disclosure. The user sees "what we can render for you" instead of canonical field plumbing. | `DASHBOARD_PANELS` / `renderFindings` in [`setup.js`](../../public/setup.js) |
| Step-3 default | Mapping table always visible, `Accept all proposals` button. | Mapping table is hidden under `<details>` "Show / edit technical mapping". One-click `Save mapping` accepts the AI proposals. When **any** field has `confidence: "low"`, the disclosure auto-expands and a warning bandeau lists which fields to confirm. | `renderValidate` in [`setup.js`](../../public/setup.js) |
| Missing-signals action | Single button "Copy KQL". The KQL was aspirational (the data doesn't exist yet), so the action was misleading. | New required schema field `code_prompt` — a 40-90 word self-contained instruction the user pastes into their AI coding assistant (Cursor / Copilot / Claude Code) so it can detect the stack and produce the actual diff. Surfaced via a shared split-button: primary = copy, caret = menu with "Copy to clipboard" / "Open in Cursor" (`cursor://anysphere.cursor-deeplink/prompt?text=...`). The original KQL is kept under a power-user disclosure. | `code_prompt` in [`promptBuilder.js`](../../src/ai/promptBuilder.js); shared component [`promptActionButton.js`](../../public/promptActionButton.js); also reused in the readiness panel's "How to fix" rows ([`app.js`](../../public/app.js)) |
| `accept_all` semantics (**bug fix**) | The user clicked "Save", a validation row was persisted with `decision: accept_all` and `overrides: null`. The dashboard pipeline ran `buildMapping` from scratch every load, then `mergeWithValidation` no-op'd (no overrides). **AI-only proposals were silently discarded** — only fields the deterministic heuristic also matched survived. | On `accept_all`, the API now snapshots the effective mapping (AI + deterministic fallback) into `validation.overrides`. `mergeWithValidation` applies overrides on any decision that carries them — the `decision` label is now purely audit. The dashboard renders with exactly what the user saw and approved. Regression test in [`tests/setupApi.test.js`](../../tests/setupApi.test.js) (`accept_all snapshots the effective mapping and flows through to the dashboard`). | [`src/server.js`](../../src/server.js) `/api/setup/validate`; [`src/core/mapping.js`](../../src/core/mapping.js) `mergeWithValidation` |
| Local AI dev loop | None — `npm run dev` defaulted to `AI_PROVIDER=none`. Testing AI changes required pushing to prod. | New launch config `dev-ai` in [`.claude/launch.json`](../../.claude/launch.json): `AZURE_MODE=mock` + `AI_PROVIDER=azure-foundry`. Endpoint/deployment come from `.env`. Auth path: `AzureCliCredential` (the existing `az login`) — no key shipped, no managed identity required. Runs the wizard against real Foundry on deterministic mock telemetry. | [`.claude/launch.json`](../../.claude/launch.json) (uncommitted env block) |

The post-shipment changes did not change the persistence model, the 3-layer
resolution chain, or the `/api/setup/*` route contracts — they're additive
on the schema (`code_prompt`) and a corrected default on
`mergeWithValidation`.

### Per-resource setup state + service hub (2026-05-22)

Dogfooding a tenant with several App Insights resources exposed a deeper
flaw than the visible "double resource picker" on first run: **all setup
state was keyed by `tenant_id` alone.** `getActiveValidation(tenantId)`,
`getLatestScan(tenantId)` and the single `tenants.selected_resource`
column meant configuring resource A flipped the whole tenant to
"configured" — switching to resource B then rendered B's dashboard with
A's column mapping, and B never got its own wizard pass.

The fix makes setup state **resource-scoped**:

| Area | Change |
|------|--------|
| Schema | `scans` and `validations` gain a nullable `resource_id` column ([`db.js`](../../src/core/db.js)). `mappings` inherits scope transitively via `scan_id`. A one-shot in-place migration (`migrateResourceIdColumns`) adds the column on existing DBs and backfills rows from each tenant's `selected_resource`, so single-resource users keep their setup. |
| Stores | `persistScan` / `getLatestScan` / `listScans`, `persistValidation` / `getActiveValidation`, `getLatestMapping` all take a `resourceId`. New `getScannedResourceIds` / `getConfiguredResourceIds` drive the hub. |
| Cache | `buildCacheKey` includes `resourceId` — two App Insights sharing one Log Analytics workspace no longer collide. |
| Hub | New `GET /api/setup/services` returns every resource tagged `ready` / `incomplete` / `unconfigured`. The post-login screen is now a per-service hub; the wizard's own resource picker is gone (the hub is the single picker). Single-resource tenants skip the hub. |
| Flow | After validation the wizard lands directly on `/service/<name>` — no second picker, no detour. The tenant-global `needsSetup` redirect in [`app.js`](../../public/app.js) is removed. |

#### Config / render split

The same pass separated the orchestrator's two responsibilities, which
were conflated in a single `runOverviewPipeline` — so every dashboard
load re-ran the scan + LLM call:

- **`runSetupScan` — CONFIG, once.** Discovery, readiness probes, schema
  profiling, schema scan, LLM mapping. Persists a `scans` row whose
  payload now embeds `schemaProfile` + `readinessReport` verbatim — a
  complete config snapshot. Sole entry point: `/api/setup/scan` +
  `/api/setup/scan/stream` (wizard and "Re-scan").
- **`runOverviewPipeline` — RENDER, every load.** Reuses the latest
  snapshot, rebuilds the mapping with the pure `buildMapping` /
  `mergeWithValidation`, and runs only the ~20 dashboard KQL queries
  (cached by `mappingVersion`). No new scan, no LLM call, no re-probe —
  and **never any config work**. If no snapshot exists it returns
  `SETUP_REQUIRED`; the client routes the user to the wizard. The only
  exception is `/preview/dashboard`, whose demo tenant has no wizard —
  the route owns its config explicitly (`runPreviewPipeline`).

Net effect: configuration is a one-time step that lives only in the
setup wizard; opening the dashboard is pure data fetching. Regression
coverage in [`tests/setupApi.test.js`](../../tests/setupApi.test.js) —
"dashboard render reuses the config snapshot — no re-scan per load" and
"dashboard load with no config returns SETUP_REQUIRED".

### Design intent vs. what shipped

The original narrative below describes the **end-state** experience —
multi-resource triage with an LLM ranking, conversational narration,
"sign in once, dashboard in 90 seconds". The shipped V1 keeps the
intent but is leaner:

- **Step 3 (resource triage LLM call) is not wired yet.** Discovery
  still auto-selects when there's a single resource; multi-resource is
  surfaced as the per-service hub (`GET /api/setup/services`, see the
  2026-05-22 iteration above) where each resource shows its config
  status. The LLM *ranking* of resources is the remaining follow-up.
- **Step 6 (narration LLM call) is also not wired yet.** The narration
  panel keeps the deterministic generator from `core/narration.js`;
  what changed is that the "Preview — real LLM coming soon" badge now
  drops automatically when the **mapping** was AI-generated, because
  the AI feature is no longer aspirational.
- **The wizard runs even when `AI_PROVIDER=none`.** In that mode the
  AI mapping is the deterministic fallback (Layer 1 alias matches) and
  the wizard surfaces those rows clearly tagged "deterministic" so the
  user can still override. This was an F5 polish to lift the "wizard
  shows nothing useful in mock/none mode" limitation.
- **Validation persists a single decision per scan.** The 3-layer
  resolution chain (user override → AI → deterministic) is applied
  pipeline-side at every dashboard render via
  `mergeWithValidation()`. Per-field overrides are stored as JSON in
  `validations.overrides`.

The rest of this document remains the right reference for the **next
iteration** (LLM-driven triage + narration). When picking it up, treat
F1-F5 as the floor and the sections below as the ceiling.

---

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
