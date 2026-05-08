# Adoption Drivers

> Cross-phase backlog. Features and enablers ordered by **impact on real-world
> adoption**, not by technical phase. Items here may be promoted into Phase 3
> or Phase 4 once prioritized.

## Why this file exists

Phases 3 and 4 are scoped around infrastructure (DB, Redis, multi-cloud) and
ops (alerts, integrations). They miss the **product-side levers** that turn a
technically-correct dashboard into a tool people actually share, return to,
and pay for. This document captures those levers and the AI-first vision that
binds them together.

## Top 5 — features with the highest adoption ROI

### 1. Period-over-period comparison + deployment markers

**Need.** The single most common analytics question is "vs. last period". Today
the dashboard renders one isolated window. Marketing asks "this week vs. last
week", engineering asks "before vs. after the deploy on the 12th".

**Implementation sketch.**
- Add `compareTo` parameter to `/dashboard/overview` (e.g. `?range=7d&compareTo=previous`).
- KQL templates render two windows and emit deltas (absolute, percent, sparkline).
- UI: every KPI tile shows current value + delta chip + mini-sparkline of the
  comparison window.
- Pull deployment annotations from App Insights (`releaseAnnotations`) and
  overlay them as vertical lines on every time series.

**Why it drives adoption.** Comparison turns a *report* into a *decision tool*.
Deployment markers make the dashboard the single place engineers check after a
release.

---

### 2. Custom event tracking and configurable conversion funnels

**Need.** Marketing doesn't care about page views — they care about CTAs,
signups, purchases. Today the KQL templates target `pageViews` and `requests`.
The `customEvents` table is barely used.

**Implementation sketch.**
- New tab "Conversions" with a list of detected custom events (auto-discovered
  from `customEvents | summarize count() by name`).
- Funnel builder: pick 2-5 events, define order, see drop-off rate per step.
- Save funnels per tenant in metadata.
- LLM bonus: for each commonly-named event missing in the workspace
  (`signup_started`, `checkout_completed`), generate a stack-specific snippet
  to instrument it (see `ai-instrumentation-assistant.md`).

**Why it drives adoption.** This is the line between "nice toy" and "tool the
growth team uses every Monday".

---

### 3. Snapshot export and shareable read-only links

**Need.** Phase 3 plans sharing **between AD users**, but the real lever is
sharing **outside Azure**. A CMO/CFO without an Azure account must be able to
receive the dashboard by email.

**Implementation sketch.**
- "Export PDF" and "Export PNG" buttons that render the current dashboard
  server-side (Puppeteer or `@vercel/og`).
- "Copy share link" generates a signed URL with a server-rendered immutable
  snapshot (no live data, expires after N days).
- Slack and Teams unfurls (Open Graph metadata + image) so pasting the share
  link in a channel shows the chart inline.
- Weekly digest email (Phase 3 already mentions this) reuses the same
  rendering pipeline.

**Why it drives adoption.** Each shared snapshot is a viral seed. Internal
sharing is the dominant acquisition channel for B2B analytics tools.

---

### 4. Multi-resource aggregation

**Need.** Most tenants have 3-10 App Insights resources (per env, per service,
per BU). Forcing them to pick one is a hard ceiling for adoption beyond
single-app teams.

**Implementation sketch.**
- Resource selector accepts `[]` of resourceIds.
- KQL queries use `union workspace("ws-1").requests, workspace("ws-2").requests`
  with a synthetic `_resource` column.
- New "Resources" filter chips on every chart.
- Cache key incorporates the sorted resource set hash.

**Why it drives adoption.** Removes the mid-market ceiling. A single dashboard
covering "all our prod services" is dramatically more compelling than ten
separate dashboards.

---

### 5. Goals, targets, and weekly digest emails

**Need.** Marketing operates on objectives ("5,000 unique visitors this
month"). Without goals, a dashboard is passive. Without recurring touchpoints,
users churn.

**Implementation sketch.**
- "Set goal" UI per KPI: target value, period, owner.
- Goal progress shown inline on the KPI tile (gauge or progress bar).
- Background job sends a weekly email Monday morning summarizing goal
  progress, week-over-week deltas, and the readiness score.
- LLM-generated narrative summary at the top of the email
  ("Traffic up 12% this week, driven by /pricing — error rate steady").

**Why it drives adoption.** Recurring email = recurring re-engagement. This is
the single most effective retention mechanism for analytics tools.

---

## Tier 2 — strong differentiators

- **Custom dimension explorer.** Point-and-click slicer over any
  `customDimensions.xxx` without writing KQL. The "no-code KQL" promise made
  tangible.
- **Anomaly explanations (LLM-assisted RCA).** "Error rate spiked Tuesday at
  14:00 — correlates with FR traffic spike and a deploy at 13:57." Combines
  the comparison engine, deployment markers, and LLM narrative.
- **Cohort and retention.** Classic acquisition cohort table (~30 lines of
  KQL). High perceived value for marketing.
- **Cost and ingestion view.** Show how much the workspace is ingesting and
  recommend sampling rules. Azure customers love anything that trims their
  bill.
- **Saved views and bookmarks.** Per-user saved filter combinations, with
  share links. Lightweight version of dashboards-as-a-product.

## Tier 3 — business enablers (not features)

- **Hosted SaaS** with Microsoft sign-in. Free tier on mock data, paid tier on
  real Azure. Without this, only technical buyers can install.
- **One-click deploy template** (Bicep + Terraform) that creates the Entra ID
  app registration and assigns the required RBAC roles. Today the
  `setup-entra-id.md` guide is 13 manual steps — a hard wall for non-IT users.
- **Compliance one-pager.** Turn "no raw data stored" into a downloadable
  security statement (DPA template, SOC 2 readiness, GDPR posture). Unblocks
  enterprise procurement.
- **Mobile / PWA exec view.** Score + trend + top KPI on a phone-first layout.
  Sunday-morning glanceable. Differentiator vs. Power BI / Grafana.

---

## The AI-first thread

Three product surfaces should be powered by an LLM, each already (or soon to
be) specced as a separate document:

| Surface                        | Spec                                       | Status        |
|--------------------------------|--------------------------------------------|---------------|
| Setup wizard (zero-to-dashboard) | [`ai-setup-wizard.md`](ai-setup-wizard.md) | Proposed      |
| Schema mapping intelligence    | [`ai-environment-analysis.md`](ai-environment-analysis.md) | Drafted       |
| Natural-language data queries  | [`ai-natural-language-queries.md`](ai-natural-language-queries.md) | Drafted       |
| Instrumentation suggestions    | [`ai-instrumentation-assistant.md`](ai-instrumentation-assistant.md) | Proposed      |
| Anomaly explanations           | Phase 3 (`phase-3.md` — LLM Enhancements)  | Phase 3       |
| Weekly digest narrative        | This file, top 5 #5                        | Linked to #5  |

The thesis: **the product's core differentiator should be that LLMs handle
every cognitively expensive step** — discovering what data you have, mapping
it to canonical fields, suggesting what to instrument next, answering ad-hoc
questions, narrating what changed. Everything else is the host environment
for those LLM moments.

---

## Recommended sequencing

If only 2-3 features can ship before the Phase 3 infra work begins, prioritize:

1. **Period-over-period comparison + deployment markers** — small, high-value,
   unlocks half the Tier 2 list.
2. **Snapshot export + share links** — viral mechanic, also unlocks weekly
   digest emails.
3. **AI setup wizard (Layer 1 + Layer 2 of `ai-environment-analysis.md`)** —
   sets the AI-first narrative and dramatically reduces time-to-first-value
   for anyone whose telemetry uses non-standard naming.

These three change the product's perception from "Azure portal alternative"
to "AI-native analytics that anyone can share". The infra work in Phase 3
then has a much stronger product to scale.
