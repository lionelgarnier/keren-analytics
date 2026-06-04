# Keren Analytics — Strategy & Product Bundle

> **Generated artifact** — do not edit by hand. Regenerate with
> `npm run docs:bundle` or `./scripts/build-strategy-bundle.sh`.
>
> This file concatenates the seven docs you'd hand a strategy / GTM /
> marketing collaborator who'd never seen the project. It's the
> right-shaped knowledge for an LLM Project (claude.ai Project, ChatGPT
> custom GPT, etc.) when you want a discussion-mode chat about naming,
> positioning, launch sequencing, or roadmap.
>
> **What it does NOT contain:** source code, KQL templates, tests,
> `public/app.js`. Drop the upstream repo into a Project if you also
> need code-level context.
>
> **Files merged (in this order):**
> 1. `README.md` — the pitch.
> 2. `docs/launch-strategy.md` — GTM + traction gates.
> 3. `docs/product.md` — scope + audiences.
> 4. `docs/vision.md` — long-term direction.
> 5. `docs/maintainer-todo.md` — what only the maintainer can do.
> 6. `docs/backlog/launch-readiness.md` — current sprint status.
> 7. `CHANGELOG.md` — what's shipped.

---



=====================================================================
# Source file: `README.md`
=====================================================================

# Keren Analytics

[![Tests](https://github.com/lionelgarnier/keren-analytics/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/lionelgarnier/keren-analytics/actions/workflows/tests.yml)
[![Security audit](https://github.com/lionelgarnier/keren-analytics/actions/workflows/security-audit.yml/badge.svg?branch=main)](https://github.com/lionelgarnier/keren-analytics/actions/workflows/security-audit.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

> Turn Azure Application Insights into shareable **Marketing & Technical
> dashboards in under 2 minutes** — AI-mapped schema, deterministic KQL,
> no raw telemetry persistence outside your tenant. MIT.

<!--
HERO GIF placeholder (A3 — see docs/maintainer-todo.md).
30-45s screencast: connect → dashboard renders → tabs → readiness → copy prompt.
Replace this block with: ![hero](docs/assets/hero.gif)
-->

**Live demo** · [keren.run](https://keren.run) — sample
dataset, sign in with any Microsoft work/school account to point it at your
own Application Insights resource.

---

## Why it exists

The Azure portal can answer "how many requests came in last hour?", but
turning App Insights into a *Marketing* dashboard (campaigns, geo,
funnels) or a clean *Technical* view (top slow endpoints, error rate
trends) means hand-writing KQL and rebuilding the same charts every
project. Keren Analytics gives you both views, plus a readiness score
that tells you which signals are missing before you ask.

## Try it now

```bash
git clone https://github.com/lionelgarnier/keren-analytics.git
cd keren-analytics
docker compose up --build
```

Then open `http://localhost:3000`. The default mode is **mock** — a
deterministic sample dataset that lets you click around with no Azure
account at all.

For production-like local runs, set a real session secret first:

```bash
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
NODE_ENV=production docker compose up --build
```

For real Azure mode, see [Setup: Entra ID](docs/setup-entra-id.md). Three
commands and one `.env` file.

> **Heads-up — the setup above is for *the host* only, done once.**
> Your end users (colleagues, customers, public-demo visitors) do **not**
> register their own Azure app, do **not** create a client secret, and
> do **not** manage permissions. They click *"Connect your Azure"* on
> the landing page and sign in with their normal Microsoft account —
> same flow as Slack / Loom / Notion. The token Keren Analytics receives
> is *delegated*, so the app reads only what the user already had access
> to. Tenant admins may see a one-time consent screen the first time
> someone from their org signs in; that's a single click.

## What's inside

<!--
Screenshots placeholder (A3 / press-kit — see docs/maintainer-todo.md).
One image per group below would let the bullet list breathe.
-->

- **Three pre-built views** — Marketing (acquisition, geo, funnels,
  campaigns), Technical (latency percentiles, error rate, top slow
  endpoints), Readiness (telemetry coverage 0–100 + AI prompts).
- **AI-style "Environment analysis" panel** that narrates your data in
  plain English from the same numbers the dashboard shows — deterministic
  by default, with optional Azure Foundry-backed mapping in setup.
- **First-run banner** that surfaces the two highest-leverage telemetry
  improvements (e.g. *"Add user identity (+15)"*) and scrolls you to the
  matching prompt card on the Readiness tab.
- **Period-over-period KPI deltas** — the top 3 tiles show
  `+13.6% vs last week` style chips; configurable today / 7d / 30d
  windows.
- **Schema auto-mapping** — alias table + regex pattern matching covers
  ~80% of real-world custom dimension naming (`uid`, `visitor_id`,
  `accountId`, etc.) with zero config; optional Azure Foundry mapping
  can refine proposals in setup.
- **26 versioned KQL templates** rendered server-side with strict
  parameter substitution. Tenant identifiers never reach a query
  string.
- **MIT-licensed, single binary** — Node 22, Express 5, Helmet,
  in-memory query cache, SQLite setup state. No agent to deploy on your apps.

## How it compares

| | **Keren Analytics** | Azure Portal | Datadog | Power BI |
|---|---|---|---|---|
| Time to first dashboard          | **~2 min** (Docker) | 30+ min (write KQL) | 1–2h (agent + setup) | hours (data prep) |
| Marketing vs Technical separation| Built-in            | Manual workbook     | Add-on                | Manual report      |
| Readiness scoring + AI prompts   | **0–100, LLM-ready prompts** | No        | Limited                | No                 |
| Custom-dimension auto-mapping    | Alias + regex (LLM optional) | Manual    | Manual                | Manual             |
| Data residency                   | **No raw telemetry rows are persisted outside your tenant** | Native | New endpoint   | New endpoint       |
| License / cost                   | **MIT, free**       | Included w/ Azure   | Per-host $$$          | Per-user $$        |
| Self-hostable                    | Yes (`docker compose up`) | N/A           | No (SaaS)             | Limited            |

These are launch-time positions; the gaps narrow as each tool evolves.
The columns we're least kind to (Datadog, Power BI) are also the most
mature and have features we don't.

## Privacy & security

The product promise is that **raw telemetry rows are not persisted
outside your Azure tenant**. The service stores setup metadata and
aggregated dashboard outputs in SQLite. Most browser payloads are
aggregated metrics (counts, percentiles, geo/browser distributions,
top-N pages); a few setup/technical surfaces can include scrubbed,
bounded event-level snippets (for example recent session timelines).

That promise is encoded as automated checks in
[`scripts/security-audit.mjs`](scripts/security-audit.mjs). Seven
controls run on every push & PR plus a Monday cron — sensitive-data
logging, session-cookie hardening, CSP `script-src` purity, no-raw-
telemetry-persistence, committed `.env*` placeholders, `npm audit`
high+. The Security audit badge above is the green light.

A separate badge for `npm test` makes regressions visible the moment
they land. Production refuses to boot without a real `SESSION_SECRET`
(no silent fallback). Per-IP rate limiting (60 req/min on dynamic
routes, 20 req/min on `/auth/*`) protects the public demo URL.

Security policy and reporting path: [`SECURITY.md`](SECURITY.md).

## Roadmap

- **v0.1.x** — what's on `main` and the launch-readiness sprint
  ([docs/backlog/launch-readiness.md](docs/backlog/launch-readiness.md))
- **Phase 3** — multi-tenant SaaS, persistence, real Azure OpenAI
  hardening and broader AI surfaces. Gated on traction signals
  ([docs/launch-strategy.md](docs/launch-strategy.md) §3).
- **Phase 4** — multi-cloud (AWS CloudWatch, GCP Cloud Logging) via
  the provider interface in
  [docs/architecture-multicloud.md](docs/architecture-multicloud.md).

The full per-track backlog lives under
[docs/backlog/](docs/backlog/) — each track marks what's BLOCKER,
STRONG, OPTIONAL, and what's deliberately out of scope.

## Configuration

Set in `.env` (copy from `.env.example`):

| Variable                   | Default     | Notes                                                                 |
|----------------------------|-------------|-----------------------------------------------------------------------|
| `AZURE_MODE`               | `mock`      | `mock` for the sample dataset, `real` for OAuth + your Azure tenant.  |
| `SESSION_SECRET`           | _required_  | 32+ random bytes in production; app refuses to boot otherwise.        |
| `AI_PROVIDER`              | `none`      | `none` (deterministic mapping) or `azure-foundry` (LLM-assisted setup). |
| `AZURE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` / `_TENANT_ID` | — | Entra ID app registration; see [docs/setup-entra-id.md](docs/setup-entra-id.md). |
| `AZURE_FOUNDRY_ENDPOINT` / `_DEPLOYMENT` | — | Required only when `AI_PROVIDER=azure-foundry`. |
| `MOCK_RESOURCES=multiple`  | _unset_     | Mock mode toggle to simulate multiple App Insights resources.         |

Selected API surface (full list in [`src/server.js`](src/server.js)):

- `GET /dashboard/overview?range=7d` — dashboard payload (KPIs, charts,
  narration, period-over-period comparison) plus readiness + score.
- `GET /readiness` — telemetry coverage report.
- `GET /prompts` — LLM-ready prompts for missing signals.
- `GET /preview/dashboard?range=7d` — no-auth sample dashboard.

## Contributing

PRs welcome. Read [CLAUDE.md](CLAUDE.md) first — it documents the
invariants (mock parity, no raw log persistence, KQL substitution-only,
range whitelist, OAuth secret handling) that PRs must respect. Short
[`CONTRIBUTING.md`](CONTRIBUTING.md) has the dev-loop and the
file-an-issue paths.

Code of conduct: [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) — see the LICENSE file. © Lionel Garnier and contributors.

---

If this saves you a Tuesday afternoon of writing KQL by hand, please
**⭐ star the repo** — it's how the project finds its next 100 users.


=====================================================================
# Source file: `docs/launch-strategy.md`
=====================================================================

# OSS-First Launch Strategy

> **STATUS — 2026-05-09: Tactics ACTIVE, traction-gate logic superseded.**
> Updated after [ADR 0004](adr/0004-azure-first-reversal.md).
>
> - **Sections 1, 2, 4-12 (OSS hard launch, Azure ecosystem pickup,
>   Show HN, awesome-azure, Reddit, dev.to, runbook) are the active V1
>   plan.** Project is Azure-first, hosted on Azure Container Apps (with
>   Microsoft for Startups credits), pitched as "plug-and-play 2-min
>   analytics for Azure App Insights". Distribution leverages the MS
>   ecosystem.
> - **Section 3 traction gates (T+90 decide to switch to hosted SaaS) are
>   neutralized.** The project pivoted to a portfolio/showcase angle (cf.
>   ADR 0001) — no SaaS-track. The same numerical signals are now used as
>   a qualitative heuristic to decide whether to trigger V2 multi-cloud
>   (Scaleway port + article), per ADR 0004.
> - **Project rename to `keren-analytics` and demo URL `keren.run`
>   apply to all launch artifacts** (README, landing, OG image, posts).
>
> **Audience.** Founder + future agents working on this repo. Read this before
> shipping anything that affects the public surface of the product (README,
> demo, landing, docs).

## 1. Thesis

We will go to market as **open-source first**, with a single hard launch, then
gate any commercial / hosted investment behind objective traction signals.

The constraints that drive this decision:

- **No marketing budget** (cap: a few hundred €/month, all-in).
- **No founder time for ongoing distribution work** (content marketing,
  outbound sales, paid ads are out).
- **Niche product** — Azure App Insights users, dissatisfied with the portal,
  not ready to pay for Datadog. Real but bounded TAM, no organic search lane
  to win against Microsoft.

Under these constraints, the only paths that "scale by themselves" are:

| Path                              | Viable here? | Why |
|-----------------------------------|--------------|-----|
| Paid ads / SEO                    | No           | No budget, no time, owned keyword by MS |
| End-user virality (Slack-style)   | No           | A dashboard is not invitation-shaped |
| Founder personal brand            | No (today)   | Out of scope by user constraint |
| **Open-source + one hard launch** | **Yes**      | Bounded effort, asymmetric upside, fits the product trust angle |
| Freemium SaaS without distribution | No          | Empty pricing page; runs costs + Stripe + GDPR for nothing |

OSS is not free — it costs ~80 hours of polish + launch + 12 weeks of light
babysitting. But it is **bounded** and produces a portfolio asset even if
traction never materializes.

## 2. Why OSS specifically fits this product

Five product-specific reasons (not generic OSS arguments):

1. **Trust angle.** Telemetry tools have a credibility problem. "No raw data
   leaves your tenant" is dramatically more believable when the source is
   auditable. This is a moat against hosted competitors.

2. **Microsoft ecosystem pull.** Awesome-Azure repos, Microsoft MVPs, MS for
   Startups blog, internal Microsoft DevRel — all pick up Azure-friendly OSS
   for free. A hosted SaaS gets none of this distribution.

3. **HN-shaped pitch.** "Plug-and-play 2-minute analytics for Azure App
   Insights, AI-powered onboarding, MIT-licensed, no data leaves your
   tenant." This is a canonical Show HN headline.

4. **Self-host unblocks regulated buyers.** Banks, healthcare, public sector
   will not sign a hosted analytics contract but will deploy a Docker
   container internally. Future enterprise revenue = support contracts on
   self-hosted, not per-seat SaaS.

5. **Cost asymmetry under our budget.** Hosting a multi-tenant SaaS for 1k
   free users → likely 300-800 €/mo (compute + LLM + bandwidth). Hosting one
   public demo + static docs → < 20 €/mo. Our cap fits OSS comfortably and
   barely fits SaaS.

## 3. Decision gate (T+90 days)

We commit to **one** binary decision after 90 days. No drift.

**Switch to hosted SaaS** if any **one** of:

- ≥ 500 GitHub stars
- ≥ 100 detected self-host installs (proxied by Docker pulls + signed-up
  beta tenants on `demo.keren-analytics.dev` + GitHub forks with commits)
- ≥ 5 inbound enterprise inquiries (any company asking for a contract, SLA,
  or self-host support package)
- ≥ 3 design partners committed to a paid pilot

**Pivot the angle** if signals are weak but qualitative feedback is strong on
a different positioning (e.g., turns out users want a Datadog alternative,
not an App Insights one). Re-launch with the new angle once.

**Sunset / portfolio mode** if no signal after the second launch. Keep the
repo public and maintained at low effort, move on.

## 4. Pre-launch sprint — 2 weeks, ~80 hours

The goal of this phase is **not** to add features. It is to make the existing
product **legible to a stranger** in 30 seconds. 90% of HN/Reddit traffic
gives a project less than that.

The detailed task list lives in
[`backlog/launch-readiness.md`](backlog/launch-readiness.md). The intent here:

| Workstream                    | Why it matters                                    |
|-------------------------------|---------------------------------------------------|
| Public demo (`demo.*` URL)    | Click-to-value < 10s. No README can replace this. |
| README rewrite                | The first 3 lines and the first GIF decide everything. |
| Animated GIF / loom demo      | Static screenshots lose to videos on HN. |
| AI angle made visible         | Without it, we're "yet another Azure dashboard". |
| OG image + share unfurl       | Every social share looks like a real product. |
| One-paragraph install         | `docker run …` then open browser. Zero config. |
| Honest comparison table       | "vs Azure portal" / "vs Datadog" / "vs Power BI". |
| FAQ — security and PII        | Defuses the #1 HN comment ("does it leak data?"). |
| `docs/setup-entra-id.md` slim | The 13-step guide is a wall. Cut to 5 if possible, or hide behind a Bicep template. |
| Press kit                     | OG image, logo, one-liner, 280-char pitch — for influencers. |

**Two AI features should ship before launch** because they're the
differentiator the pitch leans on:

- **Layer 1 of `ai-environment-analysis.md`** (alias heuristics) — 1.5 days,
  no LLM dependency, ships 80% of the value of "AI-powered mapping" without
  any runtime cost.
- **Layer 2 of `ai-environment-analysis.md`** in mock mode — 1.5 days, the
  demo shows the LLM narration on canned data so HN visitors see the AI
  story without us paying for inference.

A third AI feature is high-leverage but optional:

- **First-run narration banner** from `ai-setup-wizard.md` — ~1 day, makes
  the first dashboard load feel "alive". Can be deterministic + optional LLM.

## 5. Launch day playbook

One Tuesday. We do not re-launch.

**T-7 days**
- Soft test: post the repo link in 1-2 small Discord/Slack communities.
  Goal: catch broken-on-fresh-install bugs.
- Confirm demo URL uptime, OG image renders, install instructions work on
  Mac + Linux + Windows.
- Pre-write all launch posts. No drafting on launch day.

**T-1 day**
- Final push to main. Tag a v0.1.0 release on GitHub (release notes matter
  for HN).
- Verify analytics is on the demo (so we can see traffic in real time).
- Check rate limits / queue for the demo (a HN front page = 10-30k visitors
  in a day).

**Launch day — Tuesday** (US morning, because HN traffic is ~70% US)

| Time (PT)  | Action |
|------------|--------|
| 06:00      | Show HN post (title format: "Show HN: Keren Analytics — 2-min Azure App Insights dashboards, MIT-licensed"). |
| 06:30      | Reply to the first comment yourself with the technical context (depth signal for HN ranking). |
| 09:00      | r/azure post (different angle: "I built an OSS alternative to the Azure portal analytics — feedback welcome"). |
| 11:00      | r/devops post if first ones gain traction. |
| 14:00      | dev.to article: deep dive on the LLM-to-KQL angle (most HN-friendly tech detail). |
| 17:00      | LinkedIn post on personal account, tagging 5-10 specific Azure MVPs / DevRel folks. |
| **All day**| Reply to every HN/Reddit comment within 30 minutes. This is the single highest-ROI work of the whole launch. |

**Launch day +1 to +3**
- Lobste.rs (Wednesday, peer-invited only — skip if no invite).
- Hacker News "Ask HN" follow-up if the Show HN ranks well: "Built X, here's
  what I learned."
- DM 5-10 hand-picked Microsoft MVPs with a short message + demo link. No
  mass DMs — quality over volume.
- Post in 1-2 Discord communities you're already in (r/azure unofficial
  Discord, MS Reactor communities).

**What we do NOT do**
- Buy any ads.
- Spam Twitter / X without a personal account that has reach.
- Cross-post the same thing to 20 subreddits (anti-pattern, gets banned).
- Try to "go viral" — the tactic is *one well-executed launch*, not 100 small
  ones.

## 6. Post-launch — 90 days

After day 3, the launch is over. The next 90 days are about:

**Listen → Refine the wedge → Pre-qualify enterprise.**

Concretely, ~3 hours/week:

- **Monday 30 min**: triage GitHub issues. Fix one, label the rest, close
  the noise.
- **Wednesday 1h**: respond to threaded HN/Reddit comments still active.
  Update README with FAQ items as they emerge.
- **Friday 30 min**: scan demo analytics — are people clicking through? what
  drops them?
- **Friday 1h**: identify 2-3 power users (commenters, GitHub stargazers
  who also opened issues, inbound emails). Reach out individually with a
  short "what would make this worth paying for?" message.

We aim for 5-7 design partner conversations by day 60. These conversations
shape the hosted offering — we do not build it speculatively.

**What we explicitly do not do during these 90 days:**

- Build the hosted multi-tenant SaaS (Phase 3 infra). Wait for the gate.
- Add features no one specifically asked for.
- Start building Phase 4 multi-cloud (huge effort, dilutes the Azure pitch).
- Write a content marketing calendar (out of budget, out of time).

## 7. Cost budget

Cap: 300 €/month, all-in. Allocation during the OSS-first phase:

| Item                                    | Estimated monthly cost |
|-----------------------------------------|------------------------|
| Demo hosting (Render Pro / Fly.io)      | 25-50 €               |
| Domain + email forwarding               | 2-5 €                 |
| OG image generator service (or self-host) | 0-10 €              |
| LLM inference for demo narration (capped daily) | 30-80 €      |
| Status page / uptime monitor (free tier) | 0 €                  |
| GitHub (free for OSS)                   | 0 €                   |
| Buffer for traffic spikes               | 100 €                 |
| **Total (typical)**                     | **~150-250 €**        |

If LLM costs grow past budget during a HN spike, we **rate-limit the demo**
rather than scale up. The demo is a marketing asset, not a service we owe
SLA on.

Post-traction, the budget shifts toward hosted SaaS infra and is recalibrated
at that point.

## 8. Success metrics

Three layers, in priority order:

**Acquisition (the launch worked)**
- HN front page rank ≥ top 10 for ≥ 4 hours
- ≥ 8,000 unique demo visitors in launch week
- ≥ 200 GitHub stars in launch week

**Engagement (the product holds attention)**
- Demo: ≥ 30% of visitors click through past the landing
- GitHub: ≥ 5% of stargazers open an issue, start a discussion, or fork
- ≥ 50 Docker pulls in launch week

**Conversion-to-traction (the gate signals)**
- ≥ 1 inbound enterprise inquiry per week of launch month
- ≥ 3 design partner candidates by day 60
- ≥ 10 self-host installs that come back for a second pull within 2 weeks

We instrument these from day one — see launch-readiness for the specific
analytics setup.

## 9. Risks and mitigations

| Risk                                          | Likelihood | Mitigation |
|-----------------------------------------------|------------|------------|
| HN ranks the post but kills the demo with traffic | High      | Pre-warm the cache, rate-limit by IP, show a "high traffic, try in 5 min" page rather than 500s. |
| Top HN comment is "but Azure portal already does this" | High      | Pre-write the rebuttal in the launch post itself. The pre-emptive answer kills 80% of those comments. |
| First commenters find a security issue        | Medium     | Pre-launch security checklist (env handling, no token logs, CSP review). Have a paragraph ready. |
| Project gets stars but no installs            | Medium     | Healthy if engagement metrics are also low. Indicates "interesting demo, not useful product" — re-pitch. |
| Self-host setup is too hard, users bounce     | Medium     | Bicep one-click + `docker run` one-liner are launch-blockers, not nice-to-haves. |
| Microsoft ships a competing feature before us | Low        | Out of our control. Our angle is "open, AI-first, cross-cloud-ready" — even if MS ships analytics polish, that angle holds. |
| Budget blown by LLM costs in launch week      | Low-Medium | Hard daily cap on LLM spend at the demo. Fall back to canned responses past the cap. |
| Get traction but cannot service support load  | Medium     | Cap response SLA: "1 business day on issues, no SLA on PRs". Document this. |

## 10. What NOT to do — explicit anti-patterns

- **Do not pre-announce.** "Coming soon" landing pages destroy launch
  momentum. Either we're shipped or we're not visible.
- **Do not soft-launch.** A small post on a dead subreddit "to test the
  waters" burns the novelty. We have one shot per angle.
- **Do not go fishing for press.** We have no story for TechCrunch and the
  effort/yield ratio is terrible. HN front page > any press hit.
- **Do not start charging during the OSS phase.** Even if someone offers to
  pay, redirect them to "design partner program" (free now, paid later with
  preferential terms). Charging before the hosted offering exists is
  premature and locks us into a contract before we know the shape.
- **Do not refactor the codebase before launch.** Polish > rewrite.
  The README and demo are 100x more impactful than any internal cleanup.

## 11. Relationship to existing backlog

This strategy reorders the existing phases:

- **Phase 2** (DONE) — kept as-is, baseline product surface.
- **NEW: Launch readiness** — see
  [`backlog/launch-readiness.md`](backlog/launch-readiness.md).
  Mostly polish + selected items from `adoption-drivers.md` and AI specs.
  ~80 hours over 2 weeks.
- **Phase 3** — gated. Do not start until traction signal hit. Specifically,
  the persistence and multi-tenant work is post-traction by definition.
- **Phase 4 (multi-cloud)** — pushed further. The Azure-only positioning is
  a launch asset; multi-cloud dilutes it during the launch window.
- **`adoption-drivers.md`** — the top 3 (period comparison, custom events,
  share/export) are now framed as "ship 1 of 3 before launch, ship the rest
  in the post-launch 90-day window if traction warrants".

The cross-phase AI specs (`ai-environment-analysis`, `ai-setup-wizard`,
`ai-natural-language-queries`, `ai-instrumentation-assistant`) are split:
demo-friendly mock-mode versions ship pre-launch; full implementations ship
post-traction.

## 12. The honest summary

We bet ~80 hours of work + 12 weeks of light maintenance + ~150 €/mo of
infra against asymmetric upside (one HN front page = 6+ months of marketing
in 2 days). The downside is bounded — at worst we keep a public OSS portfolio
piece and learn from real users.

The alternative (hosted freemium without distribution) costs more in time
*and* money for strictly worse expected outcomes.

This is the only strategy where the math actually works under the stated
constraints. Anyone changing direction should re-read section 1 first.


=====================================================================
# Source file: `docs/product.md`
=====================================================================

# Product Documentation

## Summary

Keren Analytics is a plug-and-play analytics platform that transforms existing cloud
telemetry into actionable dashboards in under 2 minutes. Starting with Azure
Application Insights and Log Analytics, it provides a GA-like experience with zero
agent deployment, zero raw data storage, and intelligent recommendations to
continuously improve telemetry coverage.

An **AI setup wizard** sits at the front door: it scans the tenant's telemetry,
maps the schema to a canonical model, and shows — up front — which dashboards it
can credibly render for you, before you commit. The happy path is a single click
("Build my dashboard"); the mapping stays editable on demand.

The product targets two audiences through a single entry point:
- **Marketing / Product teams** : instant behavioral analytics without SDK work
- **Technical teams** : simplified real-time monitoring without KQL expertise

See `docs/vision.md` for the full product vision and strategy.

## Goals
- Connect via SSO (Entra ID) and show a dashboard within 60 to 120 seconds.
- Use existing telemetry only. No agent deployment required.
- Run an AI-assisted setup that scans telemetry, proposes a schema mapping
  with confidence, and shows what each dashboard can render — in one click.
- Provide deterministic mapping and fallbacks when signals are missing (and
  when the AI provider is `none` or over its quota).
- Store only metadata and aggregated results (no raw logs).
- Provide clear readiness feedback, improvement steps, and LLM-ready prompts.
- Design architecture for multi-cloud expansion (AWS, GCP) from day one.

## Non-goals (current scope)
- Complex cohorts or retention analysis.
- Custom report builder.
- Writing telemetry into customer tenant.
- Multi-cloud connectors (AWS/GCP are designed for but not yet implemented).
- A/B test monitoring (frontend ready, no data source yet).

## Target Users

### Primary: Product and Marketing Teams
- Product Managers who need quick behavioral analytics
- Growth/Marketing analysts who want GA-like KPIs on Azure apps
- Anyone who needs to understand user behavior without technical tooling

### Secondary: Technical Teams
- Platform engineers who manage Azure resources
- Developers who want a fast view of traffic and performance
- SREs who need simplified monitoring dashboards

## Core Principles

### 1. Zero Friction
- SSO via Azure AD (one click)
- Auto-discovery of resources
- Dashboard in under 2 minutes
- No documentation required to get started

### 2. Trust Through Transparency
- No raw logs stored outside the customer's own Log Analytics workspace
- No PII lists returned (counts and aggregates only)
- Tenant isolation for cache and metadata
- Audit logs capture query names, not data content
- Ephemeral results with short TTL (5-15 min)

### 3. Cloud-Agnostic Architecture
- Provider abstraction layer built into the core design
- Azure first, AWS and GCP planned
- Consistent dashboard experience regardless of cloud provider
- See `docs/architecture-multicloud.md` for technical details

## Dashboard (Overview)

### Marketing View
Top-of-tab:
- **Environment analysis** panel — an AI-style narration of what the
  telemetry looks like (visitors, sessions, top campaign source, peak hour,
  error band, identity mapping). Real LLM in `azure-foundry` mode;
  deterministic generator otherwise.
- **First-run banner** — readiness score + top quick wins as clickable chips
  that jump to the matching Readiness signal (dismissable, persisted).

KPIs:
- Unique visitors (user or session based)
- Sessions
- Page views
- Avg pages per session
- **Period-over-period delta chips** on the top 3 KPIs (green/red/neutral
  vs. the previous period, e.g. "vs last week")
- KPI sparklines with anomaly detection (derived from daily trends)

Charts and tables:
- Traffic trend (daily visitors and page views line chart)
- Top pages with sort/pagination and view share
- Top navigation paths (table view)
- User flow (Sankey diagram built from navigation transitions)
- Referrer / Traffic sources (doughnut chart: Direct, Organic, Social, etc.)
- Peak hours heatmap (day-of-week x hour-of-day)
- Content performance scoring (pages driving funnel progression)
- Conversion funnel (homepage -> pricing -> signup when pages exist)
- Campaign breakdown (UTM source/medium/campaign table)
- URL parameters discovery (auto-detected params with frequency)

Distributions:
- Browser / OS / Device category (doughnut charts)
- Geo distribution (country bar chart + Leaflet map) when available

Smart insights:
- Auto-generated insights from traffic sources, peak hours, campaigns, and URL data

### Technical View
KPIs:
- Avg response time (backend)
- P95 response time
- Error rate
- Frontend avg (browser timings)

Charts:
- Frontend performance (browser timings: network/send/receive/processing bar chart)

Tables:
- Slow endpoints (p50/p95/p99 percentiles, count, error rate)

Session analysis:
- Session timelines (reconstructed user journeys from page view events)

## User Journey
1. Connect Azure tenant (OAuth SSO via Entra ID).
2. Discover App Insights resources and linked workspaces.
3. **Service hub** — land on a per-resource hub that tags each App Insights
   as Ready / Incomplete / Unconfigured. Single-resource tenants skip the
   hub and go straight to setup.
4. **AI setup wizard** (per resource, see below) — scan → AI findings →
   one-click build.
5. Show the overview dashboard (Marketing / Technical / Readiness) reusing
   the validated config snapshot — no re-scan or LLM call per load.
6. Display recommendations with actionable, copy-paste prompts.

## AI Setup Wizard

The wizard is the configuration step; the dashboard is pure rendering
afterwards. Setup state is **per resource** (`tenant + resourceId`), so a
tenant with several App Insights resources configures each independently.

1. **Scan** — reads custom dimensions, counts event types, detects identity /
   session / page-path fields, and runs readiness probes. Streams live
   narration (SSE). Auto-advances when done — no manual "Continue".
2. **AI findings** — "what we can render for you" as graph-level cards
   (✓ Ready / ! Needs instrumentation), a readiness gauge, and a copy-paste
   `code_prompt` for each missing signal (paste into Copilot / Cursor /
   Claude Code). Powered by Azure AI Foundry; falls back to a deterministic
   alias/regex mapping when the AI provider is `none`, degraded, or over its
   daily quota.
3. **Build** — "Build my dashboard" saves the proposed mapping and lands on
   the dashboard. The technical field-mapping editor is **optional**:
   reachable any time from the dashboard's "Mapping" link
   (`/setup?mode=mapping`); a low-confidence field is flagged inline rather
   than forcing a detour. A "Re-scan" action re-runs step 1 when new event
   types appear.

The validated mapping persists in SQLite (`data/keren.db`), is backed up
hourly to Azure Blob, and is restored on boot — so configuring once survives
service redeploys.

## Readiness Score

The system probes telemetry and produces a gamified readiness score (0-100):

| Signal | Points | Status |
|--------|--------|--------|
| Traffic (pageViews) | 20 | Required |
| Sessions | 15 | Required |
| Backend performance | 15 | Required |
| Custom events | 15 | Recommended |
| Geo enrichment | 10 | Optional |
| Browser timings | 10 | Optional |
| Custom user IDs | 15 | Recommended |

The score drives engagement: users are motivated to improve their telemetry
coverage, which in turn makes the dashboard more valuable.

## Smart Recommendations

When signals are missing, the system generates:
1. **Diagnosis** : What's missing and why it matters
2. **Action steps** : Concrete steps to fix it
3. **LLM-ready prompt** : A copy-paste prompt for code assistants (Copilot, Cursor,
   ChatGPT) that generates the exact instrumentation code needed

This creates a virtuous cycle: better telemetry leads to a richer dashboard,
which increases perceived value and drives continued improvement.

## Data Sources

Primary:
- Application Insights (workspace-based recommended)
- Log Analytics workspace linked to App Insights

Future:
- AWS CloudWatch Logs and Metrics
- AWS X-Ray (traces)
- GCP Cloud Logging
- GCP Cloud Trace

Auth:
- Entra ID for Azure SSO
- (Future) AWS IAM Identity Center / GCP Identity

## Security and Compliance
- No raw logs stored outside the cloud provider.
- No PII lists are ever returned (counts only).
- Tenant isolation for cache and metadata.
- Audit logs capture query names, not data.
- OAuth with PKCE for secure token exchange.
- Session cookies with httpOnly, secure, sameSite flags.

## Acceptance Criteria (MVP)
1. Dashboard renders within 60 to 120 seconds for a tenant with telemetry.
2. No raw log entries stored in the product DB.
3. Dashboard works with partial telemetry using fallbacks.
4. Readiness score and recommendations shown when data is missing.
5. LLM-ready prompts generated for missing signals.
6. Cached ranges load in under 2 seconds.
7. Permission errors are detected and explained.


=====================================================================
# Source file: `docs/vision.md`
=====================================================================

# Vision Produit - Keren Analytics

## TL;DR

Keren Analytics transforme la telemetrie cloud existante en dashboards actionnables
en moins de 2 minutes, sans agent, sans instrumentation supplementaire, et sans
stocker aucune donnee brute. Le produit devient le point d'entree unique pour les
equipes marketing (analyse produit et comportement utilisateur) et techniques
(monitoring simplifie en temps reel), avec des recommandations intelligentes
generees par LLM pour ameliorer continuellement la couverture de telemetrie.

---

## 1. Principes Fondateurs

### 1.1 Simplicite radicale ("Zero Friction Onboarding")

| Principe | Implementation |
|----------|---------------|
| **Connexion unique** | SSO via Entra ID (Azure AD) - un clic, pas de formulaire |
| **Zero configuration** | Auto-decouverte des ressources, auto-selection si une seule |
| **Time to Value < 120s** | Dashboard visible en moins de 2 minutes apres connexion |
| **Aucun agent a deployer** | Exploite la telemetrie deja collectee par App Insights |
| **Aucune connaissance KQL requise** | L'utilisateur ne voit jamais de requete |

**Objectif UX** : Un PM marketing ou un dev junior doit pouvoir se connecter et
comprendre les metriques cles de son application sans lire de documentation.

### 1.2 Securite et Confiance

| Principe | Implementation |
|----------|---------------|
| **Zero Data Storage** | Aucun log brut stocke - seulement des mappings et aggregats |
| **Delegation d'acces** | Le produit agit avec les droits de l'utilisateur (OAuth delegue) |
| **Isolation tenant** | Cache et metadata isoles par tenant/workspace |
| **Audit trail** | Chaque requete KQL executee est loguee (nom, pas donnees) |
| **Pas de PII** | Les resultats sont toujours des comptages, jamais des listes d'utilisateurs |
| **Ephemere par design** | Les resultats caches expirent (5-15 min TTL) |

**Message confiance** : "Vos donnees restent dans votre tenant Azure. Keren Analytics
ne stocke que la structure et les comptages, jamais les donnees brutes."

### 1.3 Multi-cloud ("Cloud-Agnostic by Design")

L'architecture actuelle est deja concue avec un pattern d'abstraction
(`getAzureClient()` retourne un mock ou un real client). Ce pattern est la
fondation de la strategie multi-cloud :

```
                    +-------------------+
                    |   Keren Analytics  |
                    |   (Core Engine)   |
                    +--------+----------+
                             |
                    +--------+----------+
                    | Cloud Provider    |
                    | Abstraction Layer |
                    +--------+----------+
                             |
              +--------------+--------------+
              |              |              |
        +-----+-----+  +----+----+  +------+------+
        |   Azure    |  |   AWS   |  |    GCP      |
        | App Insight|  |CloudWatch|  |Cloud Logging|
        | Log Analyt.|  |X-Ray    |  |Cloud Trace  |
        +------------+  +---------+  +-------------+
```

**Phase 1 (actuelle)** : Azure Application Insights + Log Analytics
**Phase future** : AWS CloudWatch/X-Ray, puis GCP Cloud Logging/Trace

Voir `docs/architecture-multicloud.md` pour le design detaille.

---

## 2. Deux Audiences, Un Produit

### 2.1 Audience Marketing / Produit (focus initial)

**Persona** : Product Manager, Growth Manager, Marketing Analyst

**Probleme** : "Je veux comprendre le comportement utilisateur sur mon app Azure
sans attendre 3 sprints d'integration analytics."

**Valeur** :
- Dashboard GA-like instantane (visiteurs uniques, sessions, top pages, navigation)
- Geo-distribution et device breakdown
- Tendances journalieres sans configuration
- Recommandations pour enrichir la telemetrie (avec prompts LLM prets a l'emploi)

**Metriques cles affichees** :
- Visiteurs uniques / Sessions / Pages vues
- Top pages et parcours de navigation
- Distribution geographique
- Repartition navigateurs/OS/devices
- Taux de rebond (quand les donnees le permettent)

### 2.2 Audience Technique (extension naturelle)

**Persona** : Dev Lead, SRE, Platform Engineer

**Probleme** : "Azure Monitor est puissant mais complexe. Je veux un dashboard
simple pour monitorer mon app en temps reel sans ecrire de KQL."

**Valeur** :
- Performance backend (avg/p95 response time, error rate)
- Slow endpoints avec percentiles
- Frontend performance (browser timings)
- Alerting simplifie (seuils preconfigures)
- Recommandations d'instrumentation (quels logs ajouter, avec prompts)

**Metriques cles affichees** :
- Temps de reponse moyen / P95
- Taux d'erreur
- Endpoints les plus lents
- Dependencies health
- Browser timings breakdown

### 2.3 Strategie de positionnement

```
Phase 1 : Marketing Analytics  -->  Adoption par les equipes produit
Phase 2 : + Technical Dashboard -->  Adoption par les equipes dev/SRE
Phase 3 : + Cross-team views    -->  Devient le "hub" de l'application
```

L'entree par le marketing est strategique car :
- Le besoin est immediat et universel (tout le monde veut du GA-like)
- La barriere d'entree est plus basse (pas besoin d'etre expert cloud)
- Le bouche-a-oreille fonctionne mieux (PM parle a PM, puis PM parle a dev)

---

## 3. Recommandations Intelligentes et Prompts LLM

### 3.1 Le concept "Smart Recommendations"

Apres l'analyse de readiness, le systeme identifie les signaux manquants et genere :

1. **Un diagnostic clair** : "Il manque les pageViews dans votre telemetrie"
2. **Des etapes d'action** : "Ajoutez le SDK JS Application Insights"
3. **Un prompt LLM pret a l'emploi** : un texte que l'utilisateur copie-colle
   directement dans son assistant de code (Copilot, Cursor, ChatGPT) pour obtenir
   le code d'instrumentation adapte a sa stack

### 3.2 Exemple de prompt genere

Quand les `pageViews` sont manquantes et que le schema detecte une stack React :

```
Prompt genere par Keren Analytics :
---
Je dois ajouter le tracking Application Insights dans mon application React.

Contexte :
- Resource App Insights : [auto-rempli]
- Connection string : [auto-rempli ou "voir Azure Portal"]
- Framework detecte : React (SPA)
- Signaux manquants : pageViews, customEvents

Ce que je veux :
1. Installer et configurer le SDK @microsoft/applicationinsights-web
2. Tracker automatiquement chaque changement de route comme pageView
3. Ajouter des customEvents pour les actions utilisateur cles
4. Ne PAS envoyer de PII (pas d'email, pas de nom complet)

Genere le code complet avec les fichiers a modifier.
---
```

### 3.3 Avantages de cette approche

- **Pas besoin de lire la codebase** : le prompt suffit pour le LLM
- **Personnalise** : le prompt inclut le contexte specifique detecte par Keren Analytics
- **Actionnable** : copier-coller le prompt => obtenir du code fonctionnel
- **Boucle vertueuse** : plus de telemetrie => meilleur dashboard => plus de valeur
- **Zero friction** : pas de documentation a lire, pas d'expertise requise

### 3.4 Evolution des recommandations

| Phase | Capacite |
|-------|----------|
| **V1 (actuelle)** | Recommandations statiques par categorie de signal |
| **V2** | Prompts LLM contextuels (stack detectee, signaux manquants) |
| **V3** | Appel LLM direct pour generer des snippets de code |
| **V4** | Integration IDE (extension VS Code / Cursor) pour application automatique |

---

## 4. Au-dela de Marketing et Tech : Vision Cross-Departement

### 4.1 Pourquoi elargir ?

La telemetrie cloud contient bien plus que des metriques de trafic ou de performance.
Les memes donnees, vues sous un angle different, servent d'autres equipes. C'est la
clef pour transformer Keren Analytics d'un outil d'equipe en une plateforme d'entreprise.

### 4.2 Departements cibles

| Departement | Metriques derivees de la telemetrie existante | Source |
|-------------|----------------------------------------------|--------|
| **Finance** | Revenue par session (croise avec events e-commerce), cout infra par segment utilisateur, conversion funnel cost analysis | customEvents + requests |
| **Legal & Compliance** | Volume de requetes GDPR, monitoring de consentement, data residency (geo des requetes), audit trail des acces | requests + geo + audit logs |
| **Security** | Patterns d'acces anormaux, tentatives d'auth echouees, anomalies geographiques, signaux de vulnerabilite dependencies | requests + exceptions + dependencies |
| **Customer Success** | Score d'engagement par utilisateur, taux d'adoption des features, signaux de churn (baisse d'activite), correlation avec tickets support | customEvents + pageViews + sessions |
| **Product Management** | Feature usage heatmap, funnel d'adoption, A/B test monitoring, time-to-value par feature | customEvents + pageViews |

### 4.3 Comment ca marche techniquement ?

Les donnees sont deja la dans Application Insights / Log Analytics. Keren Analytics
ajoute des "lenses" (vues) par departement :

```
Meme telemetrie  -->  Lens Marketing   = comportement utilisateur
                 -->  Lens Technical   = performance et erreurs
                 -->  Lens Finance     = revenue et couts
                 -->  Lens Security    = anomalies et acces
                 -->  Lens Compliance  = audit et conformite
```

Chaque lens utilise les memes KQL templates sous-jacents, mais avec des mappings
et des agregations differents. Pas de duplication de donnees.

### 4.4 Strategie de rollout

1. **Phase 2 (actuelle)** : Marketing + Tech + Readiness. Teaser cross-departement dans l'UI.
2. **Phase 3** : Customer Success lens (engagement et adoption metrics)
3. **Phase 4** : Finance lens (requiert customEvents e-commerce), Security lens
4. **Phase 5** : Legal/Compliance lens, Product Management lens

---

## 5. Strategie d'Adoption Exponentielle

### 5.1 Le "Hook" : Time-to-Value instantane

```
Connexion AD  -->  Dashboard en 2 min  -->  "Wow, j'ai un GA pour Azure!"
                                                  |
                                                  v
                                         Partage avec l'equipe
                                                  |
                                                  v
                                         Equipe technique voit le dashboard
                                                  |
                                                  v
                                         "On peut avoir un mode tech aussi?"
```

### 5.2 Mecanismes de viralite

| Mecanisme | Comment |
|-----------|---------|
| **Share Dashboard** | Lien de partage read-only (meme tenant AD) |
| **Screenshot-friendly** | Dashboards concu pour etre captures et partages en Slack/Teams |
| **Embed mode** | Widget embeddable dans les outils internes (Notion, Confluence) |
| **Weekly digest** | Email automatique avec les metriques cles de la semaine |
| **Onboarding in-product** | "Invitez 3 collegues" apres le premier dashboard |
| **Readiness score** | Score gamifie (ex: "Votre app est a 72% de couverture analytics") |

### 5.3 Le "Readiness Score" comme moteur d'engagement

Le score de readiness n'est pas seulement informatif, il devient un mecanisme
de gamification et d'engagement :

```
+-------------------------------------------+
|  Readiness Score : 72/100                  |
|  ████████████████████░░░░░░░  72%          |
|                                            |
|  [x] Traffic (pageViews)     +20 pts       |
|  [x] Sessions                +15 pts       |
|  [x] Performance backend     +15 pts       |
|  [ ] Custom events           +15 pts  <-- "Ajoutez ceci"
|  [ ] Geo enrichment          +10 pts  <-- "Activez ceci"
|  [ ] Browser timings         +10 pts  <-- "Ajoutez le SDK JS"
|  [ ] Custom user IDs         +15 pts  <-- "Prompt LLM disponible"
|                                            |
|  [Ameliorer mon score] [Generer un prompt] |
+-------------------------------------------+
```

### 5.4 Strategie de pricing (reflexion)

| Tier | Cible | Fonctionnalites |
|------|-------|-----------------|
| **Free** | Equipe < 5, 1 app | Dashboard overview, readiness, recommandations |
| **Team** | Equipe < 20, 5 apps | + Alerting, export, embed, digest email |
| **Enterprise** | Illimite | + Multi-cloud, SSO avance, audit, SLA |

**Cle** : Le tier Free doit etre suffisamment genereux pour creer l'addiction
avant de monetiser.

---

## 6. Mes Recommandations Supplementaires

### 6.1 Ce qui peut faire de ce produit un "killer"

**A. Le "1-Click Deploy" narratif**

L'experience magique : "Je me connecte avec mon compte Azure AD et en 2 minutes
j'ai un Google Analytics pour mon app Azure." C'est le pitch. Chaque decision
produit doit servir ce narratif.

**B. La boucle d'amelioration continue**

```
Dashboard  -->  Readiness gaps  -->  LLM prompt  -->  Dev implemente
    ^                                                       |
    |                                                       |
    +---- Meilleur dashboard avec plus de donnees <---------+
```

C'est le vrai differenciateur : le produit ne montre pas seulement des metriques,
il guide activement l'utilisateur pour ameliorer sa telemetrie. Chaque amelioration
rend le dashboard plus riche, ce qui augmente la valeur percue.

**C. Comparaison anonymisee (benchmark)**

Ajouter a terme la possibilite de comparer ses metriques a des benchmarks
anonymises ("Votre taux d'erreur est dans le top 20% des apps similaires").
Cela cree un engagement additionnel et de la viralite.

**D. "Smart Alerts" au lieu d'alerting classique**

Au lieu de configurer des seuils manuellement :
- Le systeme apprend les patterns normaux
- Alerte uniquement sur les anomalies significatives
- "Votre taux d'erreur a augmente de 300% par rapport a la meme heure hier"

**E. Integration native avec les workflows existants**

- Slack/Teams : notifications et mini-dashboards inline
- Jira/Azure DevOps : creation automatique de tickets depuis les alertes
- CI/CD : check de performance avant deployment (quality gate)

### 6.2 Ce qu'il faut absolument eviter

| Anti-pattern | Pourquoi |
|-------------|----------|
| Trop de features trop tot | La simplicite est le differenciateur #1 |
| Dashboard customisable | Ca viendra, mais le MVP doit etre opinionate |
| Stockage de donnees brutes | Detruit la proposition de confiance |
| Dependance a un LLM externe pour le core | Les prompts sont generes, pas le dashboard |
| Multi-cloud trop tot | Azure d'abord, prouver la valeur, puis etendre |

### 6.3 North Star Metrics

Pour mesurer le succes du produit :

| Metrique | Cible Phase 1 | Cible Phase 2 |
|----------|---------------|---------------|
| Time to First Dashboard | < 2 min | < 1 min |
| Weekly Active Users / Registered | > 40% | > 60% |
| Readiness Score moyen | 60/100 | 80/100 |
| NPS | > 40 | > 50 |
| Viralite (invites par user) | 1.5 | 3.0 |

---

## 7. Roadmap Strategique

```
Q1 2026 : Azure MVP + Marketing Dashboard
          - SSO Entra ID fonctionnel
          - Dashboard overview complet
          - Readiness score gamifie
          - Recommandations avec prompts LLM

Q2 2026 : Adoption & Polish
          - Share/embed dashboards
          - Weekly digest emails
          - Smart alerts v1
          - Technical dashboard (perf, errors)

Q3 2026 : Multi-cloud Foundation
          - Abstraction layer cloud-agnostic
          - AWS CloudWatch connector (beta)
          - Benchmark anonymise

Q4 2026 : Scale
          - GCP connector
          - Integration Slack/Teams
          - CI/CD quality gates
          - Enterprise tier
```

---

## 8. Resume : Pourquoi ca va marcher

1. **Besoin universel** : Tout le monde veut du GA-like mais personne ne veut
   configurer Azure Monitor/KQL
2. **Zero friction** : SSO + auto-decouverte = dashboard en 2 min
3. **Confiance** : Aucune donnee stockee, transparence totale
4. **Boucle vertueuse** : Recommandations -> meilleure telemetrie -> meilleur
   dashboard -> plus de valeur
5. **Viralite naturelle** : Equipe marketing adopte -> equipe tech veut aussi
6. **Extensible** : Architecture multi-cloud des le depart
7. **LLM comme accelerateur** : Pas de dependance, mais acceleration de l'adoption

Le produit n'est pas un dashboard de plus. C'est un **accelerateur de maturite
observabilite** qui commence par le marketing et contamine toute l'organisation.


=====================================================================
# Source file: `docs/maintainer-todo.md`
=====================================================================

# Maintainer TODO — actions hors-code

This file tracks work that requires the maintainer (Lionel) personally —
because it needs credentials, GitHub Settings access, third-party
accounts, design work, or author voice. Claude Code agents update this
file when they discover a new manual dependency, but they cannot tick
items off.

Format: each item has **what**, **why**, **when needed**, **how**, and
links to the agent-side work that depends on it.

> **Audit live 2026-06-04** (Azure CLI + `gh`, sub
> `0a3afaae-8849-4b27-8e43-dad3ba80ce58`) — **maj après corrections
> maintainer**. Statuts recoupés contre la prod. **Reste réellement
> ouvert** : contenus voix-auteur (Hero GIF, OG image, Show HN, Reddit,
> outreach, Plausible). **Réglés depuis l'audit** : homepage `keren.run`,
> branch protection (ruleset actif), scaling `1/1` (live + défauts Bicep).
> Toute l'infra Azure/CI/Foundry/backup est en place et vérifiée.

---

## 1. Production environment & secrets

### `SESSION_SECRET` (production)
- **Why**: `src/config.js` now throws at boot if `NODE_ENV=production`
  and `SESSION_SECRET` is missing or set to a known placeholder.
- **How (effectif sur Azure)** : `deploy/azure-deploy.sh` génère un secret
  (32 bytes hex via `openssl rand`) et le persiste dans
  `deploy/.session-secret` (gitignoré). Re-déploiements réutilisent ce
  fichier, donc les sessions actives ne sont pas invalidées. Pour rotater :
  supprimer `deploy/.session-secret` et relancer le script. Le secret est
  passé au Bicep en `@secure() param` puis au Container App en `secret`
  chiffré au repos.
- **Status**: DONE — 2026-05-10.

### Entra ID app registration (real Azure mode)
- **Why**: required for `AZURE_MODE=real`. Mock mode does not need it.
- **When**: only if you want the public demo to also let visitors
  connect their own Azure tenant. The Show-HN-friendly demo can ship
  in mock mode first.
- **How**: `docs/setup-entra-id.md` walks through it; A6 added a
  one-command Bicep registration. Outputs:
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET`
  - `AZURE_REDIRECT_URI` (must match the deployed origin)
  - `AZURE_TENANT_ID` (`organizations` for multi-tenant work accounts)
- **Status**: DONE — vérifié 2026-06-04 (Azure CLI). `AZURE_MODE=real`,
  `AZURE_CLIENT_ID=fba047ba…`, `AZURE_TENANT_ID=organizations` et
  `AZURE_REDIRECT_URI=https://keren.run/auth/callback` posés sur
  `ca-keren-analytics` ; secrets `azure-client-secret` + `session-secret`
  présents ; OAuth real mode live (keren.run sert en HTTP 200).

### Demo deploy target
- **Why**: the Show HN / Reddit launch needs a clickable URL.
- **When**: launch eve.
- **How**: post-ADR 0004 the demo target is **Azure Container Apps West
  Europe** (`keren-analytics-prod`), provisioned by `infra/main.bicep`
  via `.github/workflows/deploy-azure.yml`. The `render.yaml` blueprint
  remains in-repo as a self-host hint but is no longer the demo target.
  URL: `https://keren.run` (DNS step below).
- **Status**: DONE — vérifié 2026-06-04. `https://keren.run` répond HTTP
  200, servi par `ca-keren-analytics` (France Central) ; deploys CI verts
  (dernier run `deploy-azure.yml` success). La démo est en mode `real`
  (Foundry), pas mock.

### Launch-week scaling policy (`minReplicas=1`, `maxReplicas=1`)
- **Why**: sessions are in-memory (`express-session` default store). For launch
  reliability, keep a single replica and avoid cold starts.
- **When**: launch week (before public traffic), then reassess after launch.
- **How**: keep `infra/main.parameters.json` at `minReplicas=1`,
  `maxReplicas=1` for the launch deployment. After launch, if you re-enable
  scale-out, ship a shared session store first.
- **Status**: DONE — vérifié 2026-06-04. Le maintainer a posé
  `minReplicas=maxReplicas=1` sur le Container App (confirmé via
  `az containerapp show`). L'hypothèse single-replica est garantie :
  sessions in-memory, SQLite mono-fichier et restore-on-boot sont tous
  cohérents. Anti-drift : `infra/main.parameters.json` est déjà à `1/1`
  **et** les défauts de `infra/main.bicep` ont été passés de `0/3` à `1/1`
  (commit 2026-06-04), donc même un Bicep lancé sans fichier de params ne
  régressera plus.

### First Azure deploy + Key Vault secret seeding
- **Why**: the Bicep template provisions an empty Key Vault. The Container
  App boots with `secretRef`s pointing to `session-secret` and
  `azure-client-secret` — those secrets must exist before the app starts
  successfully.
- **When**: right after the first run of `deploy-azure.yml`.
- **How**: see `infra/README.md` § "First deploy" — generate a 32-byte
  random `session-secret` and paste the end-user Entra app
  `azure-client-secret` via `az keyvault secret set`. Key Vault name is
  in the workflow / Bicep outputs. Never commit values.
- **Status**: MOOT — vérifié 2026-06-04. Le V1 n'utilise **pas** de Key
  Vault (secrets inline en Container App secrets — cf. « Provisionner
  l'hébergement Azure » plus bas). Les secrets `session-secret` +
  `azure-client-secret` sont présents sur l'app et elle boote ; rien à
  seeder côté KV. Item conservé pour l'historique.

### CNAME `keren.run` → Container App FQDN
- **Why**: the managed certificate for the custom domain only provisions
  once the CNAME already resolves.
- **When**: after the first successful Azure deploy, before launch.
- **What actually happened** (2026-05-10/11):
  CNAME was configured at Namecheap, the managed certificate
  `mc-cae-keren-anal-analytics-keren--4208` was created on the
  Container Apps environment via portal/CLI, and the binding +
  redirect URI override were applied directly on the live Container
  App. None of this lives in [`infra/main.bicep`](../infra/main.bicep)
  yet — see the follow-up entry below.
- **Status**: DONE — `https://keren.run` serves the app with
  a valid TLS cert.

### Bicep ↔ prod drift on custom domain + redirect URI
- **Why this existed**: discovered 2026-05-11 during the Track F5 what-if
  for the Foundry env vars push. Three configurations live on the
  production Container App that were **not represented** in
  [`infra/main.bicep`](../infra/main.bicep):
  1. `properties.configuration.ingress.customDomains[0]` — binding for
     `keren.run` to managed cert
     `mc-cae-keren-anal-analytics-keren--4208`.
  2. The managed cert resource itself on the Container Apps environment.
  3. `AZURE_REDIRECT_URI=https://keren.run/auth/callback` env
     var.
- **Risk that existed**: anyone running `./deploy/azure-deploy.sh`
  against prod regressed OAuth + broke the custom domain. The image-only
  CI workflow (`.github/workflows/deploy-azure.yml`) did **not**
  redeploy Bicep so it stayed safe.
- **Status**: DONE — 2026-05-13 — option 1 (lift into Bicep) shipped.
  Changes:
  - Two new params on `infra/main.bicep`: `customDomainName` (defaults
    to `keren.run` via `infra/main.parameters.json`) and
    `customDomainCertificateName` (defaults to
    `mc-cae-keren-anal-analytics-keren--4208`). The cert is referenced
    by name rather than created (cert provisioning depends on DNS
    being live, which isn't expressible in pure IaC) — fresh
    environments must create the cert out-of-band before running
    Bicep, then plug the name in.
  - `containerApp.properties.configuration.ingress.customDomains` now
    binds the custom domain to the existing cert when both params are
    set.
  - New `effectiveRedirectUri` variable: explicit `azureRedirectUri`
    override > `https://<customDomainName>/auth/callback` > empty
    (deploy script patches with the FQDN only when neither is set).
    Container App env var `AZURE_REDIRECT_URI` is wired to this.
  - `deploy/azure-deploy.sh` reads the new `effectiveRedirectUri`
    output and **no longer clobbers** AZURE_REDIRECT_URI when Bicep
    has filled it in. New `--custom-domain` / `--custom-domain-cert`
    flags let staging environments override the prod defaults.
  - Two new outputs (`effectiveRedirectUri`, `customDomainConfigured`)
    so future scripts / CI can introspect the binding without re-querying.
- **Re-run safety**: confirmed via inspection — re-running
  `./deploy/azure-deploy.sh` against prod with the default params will
  preserve `AZURE_REDIRECT_URI=https://keren.run/auth/callback`
  and the custom-domain binding. A what-if dry-run before the next deploy
  is still good hygiene.

---

## 2. GitHub repo Settings (not file-tracked)

These need a human to click through `Settings` on
`github.com/lionelgarnier/keren-analytics`:

### About / topics / website / description
- **Why**: HN/Reddit visitors pattern-match on these in the first 5s.
- **Status**: DONE — 2026-05-10. Description :
  *"Plug-and-play Marketing & Technical dashboards for Azure App Insights —
  AI-mapped schema, KQL-only, MIT."* (102 chars). Homepage :
  `https://keren.run`. Topics (10) : `analytics`,
  `application-insights`, `azure`, `dashboard`, `express`, `kql`,
  `marketing-analytics`, `nodejs`, `oss`, `self-hosted`. Tout posé via
  `gh repo edit` + `gh api` ; modifiable au besoin.

- **Homepage** — corrigée 2026-06-04 par le maintainer : le champ Website
  pointe désormais sur `https://keren.run` (vérifié `gh repo view`).
  Auparavant sur le domaine retiré `analytics.keren.run`.

### Pin v0.1.0 release with notes
- **Why**: the right-hand sidebar's "Releases: v0.1.0" is a strong
  signal of "this is real software, not a weekend hack".
- **Status**: DONE — 2026-05-10. Tag `v0.1.0` créé sur le HEAD `ed561a7`,
  release publiée avec les notes du `[0.1.0]` de `CHANGELOG.md`, marquée
  *Latest* (donc auto-épinglée dans le sidebar). URL :
  https://github.com/lionelgarnier/keren-analytics/releases/tag/v0.1.0

### Issue + PR templates UI check
- **Why**: the `.github/ISSUE_TEMPLATE/*.yml` and
  `.github/PULL_REQUEST_TEMPLATE.md` files are now in place; worth
  opening `New issue` and `Compare/PR` once to verify they render.
- **Status**: TODO (1 minute).

### Branch protection on `main`
- **Why**: prevents accidental force-push to the deployed branch.
- **Débloqué (2026-06-04)**: le repo est désormais **public** (vérifié via
  `gh repo view`), la limitation repo-privé ne s'applique plus. La
  protection peut être activée maintenant.
- **Où**: UI → repo **Settings → Branches** (ou **Rules → Rulesets**) →
  *Add rule / Add branch ruleset* sur `main` ; ou le `gh api` ci-dessous.
- **How (à exécuter le jour du launch, juste après `gh repo edit --visibility public`)** :
  ```bash
  cat <<'JSON' | gh api repos/lionelgarnier/keren-analytics/branches/main/protection -X PUT --input -
  {
    "required_status_checks": {"strict": true, "contexts": ["Tests", "Security audit"]},
    "enforce_admins": false,
    "required_pull_request_reviews": null,
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false
  }
  JSON
  ```
- **Status**: DONE — vérifié 2026-06-04. Protection posée par le maintainer
  via un **ruleset** GitHub (`main`, enforcement *active*, règles
  `non_fast_forward` + `deletion`) — d'où le 404 de l'endpoint classique
  `/branches/main/protection`, qui ne voit pas les rulesets. Force-push et
  suppression de `main` sont bloqués. Pas de gating `required_status_checks`
  (Tests / Security audit) dans le ruleset — optionnel, à ajouter si tu veux
  exiger la CI verte avant merge.

---

### Default `AI_PROVIDER` for the public demo
- **Why**: `docs/architecture-ai.md` introduces a provider abstraction
  (`none` / `ollama` / `azure-openai`). The public demo has to pick one.
  Each option has cost / quality / privacy trade-offs that are a maintainer
  call, not an agent call. See § 7 of `launch-strategy.md` for the budget
  cap and the architecture doc § "Deployment patterns" for the matrix.
- **When**: before the demo URL goes live (overlaps with the demo deploy
  target item above).
- **How**: pick one and set the env var on Render / the deploy target.
  Recommended for first launch: `none` (zero infra cost, canned narration
  on the demo, fits the budget). Switch to `ollama` post-launch if the
  AI angle needs to feel "alive" and a small CPU instance covers it.
  Avoid `azure-openai` on the public demo unless a Microsoft sponsorship
  covers the bill — pay-per-visitor is incompatible with a HN spike.
- **Status**: DONE (choix arbitré) — vérifié 2026-06-04. La démo prod tourne
  en `AI_PROVIDER=azure-foundry` (deployment `gpt-5.4-mini`), couvert par les
  crédits Founders Hub — pas `none`. Le garde-quota 10 €/jour (F3) + le
  fallback déterministe restent le filet de sécurité pour un spike HN.

## 3. Third-party accounts (launch-day infrastructure)

### Plausible / Umami (D5 launch-day analytics)
- **Why**: track HN / Reddit / Twitter source attribution and
  conversion to GitHub stars during the launch window.
- **How**: self-host Umami on the same Render account, or use Plausible
  Cloud (€9/mo). Embed the script in the landing page only (not the
  dashboard — we don't want to phone home from the analytics product).
  The landing page (`public/index.html`) has an HTML-comment slot near
  the bottom of the `#landingPage` section marking where the snippet
  goes; the footer copy already promises "no tracking by default" so
  please don't add it site-wide.
- **Status**: TODO. Blocked on D5.

### Domain registrar (note for the runbook)
- **Why**: `docs/launch-day-runbook.md` Contacts section needs to know
  which registrar holds the demo domain so you can transfer / change
  nameservers under stress.
- **How**: write the registrar name + login URL into the runbook's
  Contacts section before launch eve. Keep credentials in your
  password manager, not in the repo.
- **Status**: TODO.

### Cloudflare in front of the demo (E2)
- **Why**: caches static assets, absorbs the HN front-page spike, gives
  a status page if Render goes down.
- **How**: free tier; point DNS at Cloudflare, set Render origin as
  pull, cache `*.svg`, `*.css`, `*.js`, `*.png` aggressively.
- **Status**: TODO. STRONG, not BLOCKER.

### BetterStack status page (E3, OPTIONAL)
- **Why**: "we're aware" beats silence during an outage.
- **How**: free tier, link from the demo footer.
- **Status**: TODO.

### Docker Hub / GHCR
- **Why**: published image enables the Docker-pull-count badge and the
  one-line `docker run` quickstart.
- **How**: GitHub Action that builds + pushes on tag (`v*`); a manual
  first push to claim the namespace.
- **Status**: TODO. Tied to A6.

---

## 4. Author-voice content (Claude can draft, you must approve / publish)

These can be drafted by Claude but the final voice and the *publish*
action are yours.

### D1 — Show HN post
- **What**: title + 4-6 paragraph body, including the pre-written
  founder-comment for the predictable "but Azure portal already does X"
  objection.
- **Status**: not drafted yet.

### D2 — Reddit posts (r/azure, r/devops, r/selfhosted)
- **What**: three different angles, one per subreddit. Lead with a
  concrete user pain, not "look at my project".
- **Status**: not drafted yet.

### D3 — dev.to / blog post (STRONG)
- **What**: 1500-2500 words, technical deep dive on the
  natural-language-to-KQL layer.
- **Status**: not drafted yet.

### D4 — Outreach list (10-15 named contacts)
- **What**: Microsoft MVPs in Azure data/devops, MS DevRel folks,
  Azure newsletter authors, maintainers of `Awesome-Azure` lists.
  Personalized 3-line DM ready to send post-launch.
- **Status**: not drafted yet. Claude can draft the DM template; the
  contact list is yours to assemble.

### D6 — Press kit (OPTIONAL)
- **What**: logo SVG + PNG, founder photo + bio, taglines, 3 product
  screenshots.
- **Status**: TODO. Design work; AI generation is a starting point but
  the logo at minimum should be hand-finalized.

### A4 — Open Graph image
- **What**: 1200×630 social-preview image rendered when the README /
  demo URL is shared. Must include the product name and a one-line
  pitch in legible-at-thumbnail-size type.
- **Status**: TODO.

### A3 — Hero GIF / video for README
- **What**: ≤ 15s screencast of the 2-minute setup → dashboard flow.
  README has a placeholder block (HTML comment) right under the tagline
  that should be replaced with `![hero](docs/assets/hero.gif)` once the
  asset lands. Same screencast doubles as the LinkedIn / Twitter /
  Show HN preview.
- **Status**: TODO. Needs Lionel to record from a real session.

### Inline screenshots in the README
- **What**: the "What's inside" bullet list in `README.md` has an HTML
  comment marking where one image per group would let the section
  breathe. Suggested shots: (1) Marketing tab with the narration panel
  + first-run banner + delta chips visible; (2) Readiness tab showing
  the 0–100 score + a couple of expanded prompt cards; (3) Technical
  tab with slow-endpoints table.
- **Status**: TODO. Pair with the press-kit work.

### Demo URL substitution
- **What**: README "Live demo" line currently says "_coming with the
  public launch — see docs/maintainer-todo.md_". Once A1 (demo URL
  stand-up) ships, replace that line with the real URL. Update the
  GitHub repo's "Website" field at the same time
  (Settings § GitHub repo polish).
- **Status**: TODO.

---

## 5. Reviewer-eyes pass (no creds, but needs you)

### CONTRIBUTING / CoC / SECURITY first-pass read
- **Why**: I (Claude) wrote those during C2 with the email
  `garniel6@gmail.com`. Worth one human pass to confirm the tone
  matches your voice and the email is the canonical one to keep.
- **Status**: TODO (≤ 5 min).

### `docs/launch-strategy.md` traction-gate review
- **Why**: Phase 3 (multi-tenant SaaS) and Phase 4 (multi-cloud) were
  originally gated on signals defined there. **Now superseded by ADR 0001**
  (portfolio pivot) — the SaaS gate is no longer the active decision.
  Multi-cloud becomes a primary deliverable, not a gated bet. Document
  kept as historical reference.
- **Status**: superseded — see `docs/adr/0001-positioning-portfolio.md`.

---

## 6. Pivot vitrine + retournement Azure-first (ADRs 0001-0004) — items à arbitrer / exécuter

### Renommer le projet en `keren-analytics`
- **Why**: ADR 0001 acte le repositionnement vitrine. Le suffixe `-for-azure`
  est redondant avec la tagline (qui reste *"plug-and-play analytics for
  Azure App Insights"* — cf. ADR 0004) et alourdit le nom de repo. `keren-analytics`
  signe le mainteneur via le domaine `keren.run` tout en restant neutre.
- **When**: avant la Phase A (refacto provider + déploiement Azure), pour
  éviter une cascade de renames.
- **How**: rename GitHub repo (`lionelgarnier/easy-analytics-for-azure` →
  `lionelgarnier/keren-analytics`, redirect GH auto), puis PR dédiée pour
  mettre à jour `package.json`, `README.md`, `public/index.html`, landing,
  toutes les références dans `docs/**/*.md`. Ne pas bundler avec un
  changement d'archi.
- **Status**: DONE — repo renamed + references updated in branch
  `claude/cloud-agnostic-architecture-fVCQx` (this commit).

### Microsoft for Startups Founders Hub — statut crédits Azure
- **Why**: ADR 0004 fait d'Azure Container Apps l'hôte de la démo, et ADR
  0005 ajoute l'inference Azure AI Foundry. Founders Hub couvre les deux,
  sans coût out-of-pocket pendant la phase pre-launch.
- **Status — 2026-05-11** :
  - **1 000 € de crédits Azure approuvés** — utilisables immédiatement.
  - **5 000 € supplémentaires en cours de validation** (montant total
    potentiel : 5k-150k$ sur 4 ans selon le niveau Founders Hub atteint).
  - Note importante pour les agents Claude : **ne pas redemander à chaque
    session si Founders Hub est fait** — la candidature est déposée et en
    cours. Le statut est mis à jour ici.
- **Once 5k€ approved** : récupérer subscription ID + sponsor reference,
  ajouter le badge "Microsoft for Startups" sur le README et la landing.
- **Pitch utilisé** : *"Keren Analytics is an MIT-licensed plug-and-play
  dashboard for Azure Application Insights with AI-powered setup wizard
  (audit + mapping + recommendations). Aimed at Azure dev teams frustrated
  by the portal UX. KQL-only, no raw data leaves the tenant. Hosting public
  demo on Azure Container Apps + Azure AI Foundry."*

### Provisionner Azure AI Foundry (Track F — ADR 0005)
- **Why**: ADR 0005 acte AI-first setup wizard pre-launch. Track F nécessite
  un endpoint Azure AI Foundry avec un model deployment pour le scan +
  AI mapping + recommendations.
- **When**: avant le démarrage de F3 (AI mapping service). F1 (SQLite) et F2
  (schema scan enrichi) peuvent commencer en parallèle sans le LLM.
- **What was actually done** (2026-05-11) :
  - Foundry Hub + Project `keren-analytics-prod` créés via portail.
  - Model `gpt-5.4-mini` (deployment `2026-03-17`) déployé — choix
    upgradé depuis `gpt-4o-mini` après inspection du catalogue, cf.
    addendum ADR 0005.
  - Endpoint format **projet Responses API** :
    `https://keren-analytics-prod-foundry.services.ai.azure.com/api/projects/keren-analytics-prod/openai/v1/responses`
  - Env vars en local (`.env`) : `AZURE_FOUNDRY_ENDPOINT` +
    `AZURE_FOUNDRY_DEPLOYMENT=gpt-5.4-mini`. Test bout-en-bout OK
    (HTTP 200, `pong`, 18 tokens — token audience `https://ai.azure.com/`).
- **What remains** :
  - Propagation des env vars dans `infra/main.bicep` (l'agent F3 le fait
    dans la PR de F3).
  - **Assignation du rôle MI** : entrée séparée ci-dessous (blocking F3
    en prod).
- **Quota TPM** : à vérifier dans le portail Foundry sur le deployment
  `gpt-5.4-mini`. Demander 100k+ TPM avant launch HN si on anticipe un
  spike Show HN.
- **Status**: DONE — vérifié 2026-06-04 (Azure CLI). Account+projet
  `keren-analytics-prod-foundry` provisionnés ; deployment `gpt-5.4-mini`
  (version `2026-03-17`) live ; env `AZURE_FOUNDRY_ENDPOINT` /
  `AZURE_FOUNDRY_DEPLOYMENT` / `AZURE_FOUNDRY_CLIENT_ID` posées sur le
  Container App ; rôle MI `Foundry User` assigné (cf. entrée suivante).
  Le « What remains » ci-dessus (Bicep + rôle MI) est résolu. Reste juste
  à vérifier le quota TPM avant un spike HN.

### Assigner le rôle `Azure AI User` à la MI du Container App (Track F3)
- **Why**: F3 appellera Foundry depuis le Container App via la Managed
  Identity (`uami-keren-analytics`). Sans le rôle `Azure AI User` sur le
  Project Foundry, l'inférence renverra `403 Forbidden` en prod. ADR 0005
  addendum 2026-05-11 corrige le rôle initialement listé
  (`Cognitive Services User` ne suffit pas pour l'endpoint projet).
- **When**: avant le **premier deploy de F3 en prod**. Pas bloquant pour
  le développement local (qui utilise le token `az` du mainteneur).
- **How** (Azure Portal, le plus simple) :
  1. Portal → AI Foundry → Project `keren-analytics-prod` → Access
     control (IAM) → Add role assignment.
  2. Role : **Azure AI User** (lecture + inférence). `Azure AI Developer`
     marche aussi mais donne plus que nécessaire.
  3. Assign to : **Managed Identity** → `id-keren-analytics` (la
     user-assigned MI déjà créée par `infra/main.bicep`,
     `var managedIdentityName = 'id-${namePrefix}'`).
  4. Review + assign.
- **How** (CLI alternative — vérifié 2026-05-11 contre la prod) :
  ```bash
  MI_PRINCIPAL_ID=$(az identity show -g keren-analytics-prod \
    -n id-keren-analytics --query principalId -o tsv)
  # Foundry est un Microsoft.CognitiveServices/accounts (kind=AIServices)
  # avec un sub-resource projects/<projectName>. Scope au projet pour
  # least-privilege ; scope au compte si tu veux que l'assignment couvre
  # de futurs projets sous le même Hub.
  PROJECT_ID=$(az resource show -g keren-analytics-prod \
    --name keren-analytics-prod-foundry/keren-analytics-prod \
    --resource-type Microsoft.CognitiveServices/accounts/projects \
    --query id -o tsv)
  az role assignment create --assignee-object-id "$MI_PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal \
    --role "Azure AI User" --scope "$PROJECT_ID"
  ```
- **Verify**: depuis le Container App, `curl` vers le Foundry endpoint
  doit renvoyer 200, pas 401/403. F3 expose une route healthcheck
  `/api/ai/ping` à utiliser pour ça.
- **Status**: DONE — 2026-05-13 — vérifié via
  `az role assignment list --assignee <MI principalId> --all`. Rôle
  `Azure AI User` assigné au scope
  `…/Microsoft.CognitiveServices/accounts/keren-analytics-prod-foundry`
  (scope compte plutôt que projet, ce qui couvre aussi les futurs
  projets sous le même Hub — léger sur-périmètre acceptable). La MI
  `id-keren-analytics` a également `AcrPull` sur le registry, comme
  prévu par `infra/main.bicep`.

### Wirer le backup SQLite en production (Track F1 — ADR 0005)
- **Why**: F1 a shippé `scripts/backup-sqlite.mjs` (VACUUM INTO + rotation 24
  snapshots vers `data/backups/`), mais rien ne le déclenche en prod. Sans
  cron + upload off-host, un redémarrage de Container App perd `data/keren.db`
  (tous les mappings, validations, scans).
- **What shipped (2026-05-13)**: option 2 (snapshot off-host vers Blob) en
  **in-process scheduler** plutôt qu'en Container Apps Job séparé. Un Job
  séparé n'a pas accès au filesystem de l'app (besoin d'un Azure Files mount
  partagé qui ralentit aussi les INSERT du wizard), donc le scheduler tourne
  directement dans le process Node — un `setInterval` horaire qui exécute
  `VACUUM INTO` vers un fichier temp puis `BlockBlobClient.uploadFile`.
  Auth via la MI déjà utilisée par Foundry (rôle `Storage Blob Data
  Contributor` ajouté sur le Storage Account dans Bicep).
  Code : [`src/core/backupScheduler.js`](../src/core/backupScheduler.js),
  câblé dans [`src/server.js`](../src/server.js) ; 7 tests dans
  [`tests/backupScheduler.test.js`](../tests/backupScheduler.test.js).
- **Trade-off accepté**: si l'app crash, plus de snapshot tant qu'elle n'est
  pas redémarrée (RPO ≤ 1h pendant un outage long). Pour le launch HN,
  acceptable : le wizard est idempotent (nouveau OAuth → re-scan gratuit),
  donc 1h de perte = nuisance UX, pas drame.
- **Restore-on-boot + backup SIGTERM (2026-06-04)** : le backup était
  **write-only** — rien ne le relisait, donc chaque redéploiement du
  Container App (filesystem éphémère) repartait d'une base vide malgré les
  snapshots. Corrigé : `restoreLatestSnapshot()`
  ([`backupScheduler.js`](../src/core/backupScheduler.js)) télécharge le
  dernier snapshot Blob au démarrage **si `data/keren.db` est absent**
  (jamais d'écrasement d'une base vivante), câblé dans
  [`src/server.js`](../src/server.js) avant `app.listen()`. Un handler
  `SIGTERM`/`SIGINT` prend un dernier snapshot avant l'arrêt (Container Apps
  envoie SIGTERM avant de couper un replica), donc un redéploiement propre
  ne perd rien (RPO ≈ 0). Aucune action maintainer supplémentaire : une fois
  les 5 étapes ci-dessous exécutées (Storage Account provisionné + MI
  autorisée), restore et backup utilisent la même infra Blob. En dev/local
  sans `BACKUP_BLOB_ACCOUNT`, restore est un no-op silencieux.
- **Bicep ressources ajoutées**: Storage Account `Standard_LRS` /
  StorageV2 (nom auto-généré `stkbk…<uniqueSuffix>`, max 24 chars), Blob
  container privé `sqlite-backups`, role assignment `Storage Blob Data
  Contributor` (GUID `ba92f5b4-2d11-453d-a403-e96b0029c9fe`) sur la MI
  `id-keren-analytics`. Env vars sur le Container App :
  `BACKUP_BLOB_ACCOUNT`, `BACKUP_BLOB_CONTAINER=sqlite-backups`,
  `BACKUP_INTERVAL_MS=3600000`, `BACKUP_MAX_SNAPSHOTS=24`.

#### À faire côté Azure pour activer en prod
1. **Re-déployer Bicep** une fois pour provisionner le Storage Account
   et l'attribution de rôle :
   ```bash
   ./deploy/azure-deploy.sh --client-id <GUID> --client-secret <secret> --skip-build
   ```
   (Le `--skip-build` évite de rebuilder l'image — on veut juste l'infra
   pour cette première passe. Bicep est idempotent : les ressources déjà
   provisionnées ne sont pas re-créées.)
2. **Récupérer le nom du Storage Account** depuis les outputs :
   ```bash
   az deployment group list -g keren-analytics-prod \
     --query "[?contains(name, 'keren-analytics-')] | [0].properties.outputs.storageAccountName.value" \
     -o tsv
   ```
3. **Vérifier que la MI peut bien écrire** (avant de pousser une image qui
   en dépend) :
   ```bash
   STORAGE_ACCOUNT=<output from step 2>
   az storage blob list --account-name "$STORAGE_ACCOUNT" \
     --container-name sqlite-backups --auth-mode login -o table
   ```
   Doit retourner une liste vide (pas une erreur 403). Si 403 →
   l'attribution de rôle n'a pas encore propagé (peut prendre 1-2 min).
4. **Pousser une nouvelle image** via le workflow OIDC GitHub Actions
   (`deploy-azure.yml`) ou en relançant `azure-deploy.sh` sans
   `--skip-build`. Le scheduler démarre au boot, premier snapshot
   ~60s après le démarrage du replica.
5. **Vérifier qu'un snapshot apparaît** au bout de quelques minutes :
   ```bash
   az storage blob list --account-name "$STORAGE_ACCOUNT" \
     --container-name sqlite-backups --auth-mode login -o table
   ```
   Doit montrer un blob `keren-2026-MM-DDTHH-MM-SS-mmmZ.db`. Les logs
   du Container App montrent aussi `[backup] uploaded keren-…` :
   ```bash
   az containerapp logs show -n ca-keren-analytics -g keren-analytics-prod \
     --tail 100 | grep backup
   ```

#### Restore (si jamais)
```bash
STORAGE_ACCOUNT=<from step 2 above>
# Pick a snapshot
az storage blob list --account-name "$STORAGE_ACCOUNT" \
  --container-name sqlite-backups --auth-mode login -o table
# Download it
az storage blob download --account-name "$STORAGE_ACCOUNT" \
  --container-name sqlite-backups --auth-mode login \
  --name keren-2026-05-13T10-00-00-000Z.db --file restored.db
# Copy into the Container App (or rebuild a revision with --bind it)
```
- **Status**: DONE — vérifié 2026-06-04. Les 5 étapes ci-dessus sont
  **exécutées en prod** : Storage Account `stkbkkerenanalyticsdfrvt`
  provisionné, MI `Storage Blob Data Contributor`, env `BACKUP_*` posées,
  et **snapshots réels** dans le container `sqlite-backups` (dernier
  aujourd'hui 14:06, série remontant au 13/05). Le restore-on-boot +
  backup SIGTERM (2026-06-04) sont déployés. Plus rien de manuel — à la
  seule condition de garder l'app en **single-replica** (cf. § scaling
  policy plus haut, actuellement `0/3`).

### Provisionner l'hébergement Azure de la démo
- **Why**: ADR 0004 § Decision 2 — Azure Container Apps. Région retenue :
  **France Central** (préférence souveraineté FR, latence ~5ms depuis Paris).
- **How (effectif)**: stack provisionné via Bicep dans
  [`infra/main.bicep`](../infra/main.bicep), orchestré par
  [`deploy/azure-deploy.sh`](../deploy/azure-deploy.sh). Composants :
  Log Analytics + Container Apps environment + Container App + Azure Container
  Registry (Basic) + User-assigned Managed Identity (AcrPull). **Pas de Key
  Vault dans le V1** : les secrets (SESSION_SECRET, AZURE_CLIENT_SECRET) sont
  passés directement comme Container App secrets via paramètres `@secure()`
  Bicep. Migration KV à layer en Phase B si rotation/audit deviennent un
  besoin réel.
- **Prereq découvert** : la subscription doit avoir le resource provider
  Microsoft.App enregistré. Si le premier déploiement échoue avec
  "Subscription is not registered for the Microsoft.App resource provider",
  exécuter une fois : `az provider register -n Microsoft.App --wait`.
- **Status**: DONE — 2026-05-10 — premier déploiement manuel réussi sur la
  subscription `0a3afaae-8849-4b27-8e43-dad3ba80ce58` (RG
  `keren-analytics-prod`, France Central). FQDN provisoire :
  `ca-keren-analytics.happyrock-d99ade88.francecentral.azurecontainerapps.io`.
  Coût observé : ~10-15 €/mois sans crédits Founders Hub (scale-to-zero
  Container App + ACR Basic + Log Analytics).

### Configurer GitHub Actions pour déployer sur Azure
- **Why**: ADR 0004 § Decision 4 — workflow `deploy-azure.yml` via OIDC
  federated credentials (pas de secret long-lived côté GH).
- **How (effectif)** : workflow file
  [`.github/workflows/deploy-azure.yml`](../.github/workflows/deploy-azure.yml)
  + script de setup
  [`deploy/azure-ci-setup.sh`](../deploy/azure-ci-setup.sh). Le script crée
  une app registration `keren-analytics-ci` dédiée (séparée de l'app
  `keren-analytics` qui sert l'OAuth utilisateur, pour éviter qu'une rotation
  CI casse l'OAuth), une federated credential OIDC pour
  `repo:lionelgarnier/keren-analytics:ref:refs/heads/main`, et assigne 2
  rôles RBAC minimaux : **AcrPush** sur l'ACR, **Contributor** sur le
  Container App (pas Contributor sur le RG entier — least privilege).
- **Steps maintainer (~5 min)** :
  1. `./deploy/azure-ci-setup.sh` (idempotent).
  2. Coller les 3 valeurs imprimées comme GitHub Secrets (Settings →
     Secrets and variables → Actions), ou utiliser les `gh secret set`
     one-liners imprimés par le script.
  3. Push sur `main` ou `gh workflow run deploy-azure.yml` pour déclencher.
  4. Le workflow build l'image, push à ACR, update le Container App, et
     attend la propagation healthy avant de finir.
- **Status**: DONE — vérifié 2026-06-04. Les 3 secrets OIDC
  (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) sont
  posés et les runs `deploy-azure.yml` passent (3 derniers verts, dont le
  push du 04/06). Le pipeline build→push→update tourne automatiquement sur
  push `main`.

### DNS `keren.run` pointé sur Azure
- **Why**: ADR 0002 § 7 (DNS maintenu par ADR 0004 § Decision 5) — l'URL
  canonique `https://keren.run` reste en place, seul l'endpoint
  cible change.
- **When**: déblocable depuis le 2026-05-10 — l'infra Azure est en place, le
  FQDN provisoire est `ca-keren-analytics.happyrock-d99ade88.francecentral.azurecontainerapps.io`.
- **How**:
  1. Récupérer le FQDN Azure Container Apps après déploiement (forme
     `<app>.<env>.francecentral.azurecontainerapps.io`).
  2. Chez le registrar de `keren.run`, pointer l'apex `keren.run` vers le
     FQDN Azure (A/ALIAS ou CNAME flatten selon le registrar). Vérifier le
     record `asuid.keren.run` requis par Azure pour l'attache du custom
     domain.
  3. Activer le **managed certificate** Azure Container Apps pour
     `keren.run` (Let's Encrypt managé).
  4. `keren.run` est désormais le domaine canonique servi directement —
     aucune redirection apex à configurer.
- **Status**: DONE — vérifié 2026-06-04. `keren.run` est lié au Container
  App (custom domain SNI + managed cert sur l'environnement) et répond en
  HTTP 200. Doublon avec « CNAME keren.run → Container App FQDN » du §1,
  déjà marqué DONE.

### Mettre à jour `CLAUDE.md` après Phase A
- **Why**: `CLAUDE.md` mentionne encore "Phase 3/4 gated, do not start
  speculatively" et la stratégie originale OSS-first SaaS-track. Après
  ADRs 0001+0004, le bon récit est "Azure-first, vitrine portfolio,
  multi-cloud V2 conditionnel".
- **How**: remplacer la section "Status" et "Known gaps" par une référence
  aux ADRs 0001 et 0004. Garder le reste (invariants, conventions, mock
  parity, KQL templating, etc.) inchangé — ils tiennent toujours.
- **Status**: DONE — 2026-05-10 — section Status réécrite (Phase A DONE,
  ref ADRs 0001+0004), repo map ajoute `deploy/`, "metadataStore in-memory"
  corrigé en fs-backed, SESSION_SECRET fail-loud noté, "Render auto-deploys"
  remplacé par `deploy/azure-deploy.sh`.

### Purger le Key Vault orphelin du premier déploiement raté
- **Why**: lors du premier essai de Bicep le 2026-05-10, le Container App
  référençait des secrets KV qui n'existaient pas encore → échec. Bicep
  reformulé sans KV (secrets inline), mais le KV `kv-keren-analytics-dfrvt`
  créé pendant le run raté est resté dans le RG. Coût ~0 (pas de secrets,
  pas d'opérations) mais c'est du bruit dans le portail.
- **How**:
  ```bash
  az keyvault delete --name kv-keren-analytics-dfrvt -g keren-analytics-prod
  az keyvault purge  --name kv-keren-analytics-dfrvt --location francecentral
  ```
  (Le `purge` est nécessaire car KV reste 7j en soft-delete par défaut.)
- **Status**: DONE — vérifié 2026-06-04. Plus aucun Key Vault dans le RG,
  ni en soft-delete (`az keyvault list` + `list-deleted` → vides).
  L'orphelin a été supprimé+purgé. Rien à faire.

### Gotcha — ne pas re-run `azure-app-registration.sh` inutilement
- **Why**: le script utilise `az ad app credential reset --append`, qui
  **mint un nouveau client secret à chaque run**. Les anciens secrets
  restent valides (le Container App tournant ne casse pas), mais ça pollue
  l'app registration et complique les audits. À ne lancer que pour :
  - Première création de l'app registration.
  - Ajouter une nouvelle redirect URI (le script dedupe correctement, donc
    re-run sûr quand un nouvel environnement apparaît, ex. URL Container
    Apps après premier déploiement).
  - Rotation explicite de secret.
- **Status**: note opérationnelle — pas un TODO.

### ~~Compte Scaleway + dossier Startup Program~~ — reporté V2
- ~~Why / How~~: superseded par ADR 0004 — l'hôte V1 est Azure, pas Scaleway.
  Le compte Scaleway et le dossier Startup Program redeviennent pertinents
  uniquement si la V2 multi-cloud est déclenchée (article portage
  Scaleway). Conservé ici pour mémoire, à réactiver le cas échéant.
- **Status**: deferred to V2 (post-traction).

### ~~Setup OpenTofu Scaleway + GH secrets Scaleway~~ — reporté V2
- ~~Why / How~~: superseded par ADR 0004 — V1 utilise Azure (Bicep ou
  `terraform/azure/`). Les secrets Scaleway ne sont pas créés tant que la
  V2 multi-cloud n'est pas activée.
- **Status**: deferred to V2 (post-traction).


---

## How agents update this file

- A new manual dependency surfaces in any track? Append it under the
  matching section, with all four fields (what / why / when / how) and
  a `**Status**: TODO` line.
- An item is no longer needed (e.g. we decided not to ship Cloudflare)?
  Strike it through with a one-line note explaining the decision —
  don't delete it, the trail is useful.
- An item gets done? The maintainer ticks it (changes `Status: TODO` to
  `Status: DONE — <date> — <commit/SHA or "manual">`); agents shouldn't
  flip it to DONE unless they actually executed the work.


=====================================================================
# Source file: `docs/backlog/launch-readiness.md`
=====================================================================

# Launch Readiness Checklist

> **Context.** Implementation companion to
> [`docs/launch-strategy.md`](../launch-strategy.md). This file is the
> concrete, actionable backlog for the 2-week pre-launch sprint.
>
> **Status.** Pending kickoff. Each item has an effort estimate and a
> blocker/blocked-by relationship. Total: ~80 hours of focused work.

## How to read this

- Items marked **[BLOCKER]** must ship before launch.
- Items marked **[STRONG]** materially improve launch outcomes; ship if time
  allows.
- Items marked **[OPTIONAL]** are 1-day improvements with diminishing returns.
- Effort is in person-hours assuming a single developer with Claude assistance.

## Track A — Public surface (the things strangers see first)

### A1. Demo URL — `demo.keren-analytics.dev` or equivalent [BLOCKER, 6h]
- Stand up a public hosted instance using mock mode (no Azure auth needed).
- Pin a deterministic mock dataset that tells a complete product story
  (visitors trending up, one anomaly, one slow endpoint, readiness score 68).
- Subdomain on a domain we control. **Not** a Render-generated URL (looks
  amateur).
- Cloudflare in front for caching + DDoS during launch spike.
- Health check + uptime monitoring (free tier of UptimeRobot or
  BetterStack).

### A2. Root README rewrite [BLOCKER, 6h] — DONE (asset placeholders await A3 / A1)
The current README is informative but reads like docs, not like a pitch.
Rewrite around this structure:
1. **One-line tagline** that includes "Azure" + "AI" + a number.
   Example: "Turn Azure App Insights into shareable Marketing & Technical
   dashboards in under 2 minutes — AI-powered, MIT-licensed."
2. **Hero GIF** (see A3).
3. **Why it exists** (3 lines max — the Azure portal pain).
4. **Try it now** — single `docker run …` line + demo URL.
5. **What's inside** — bulleted feature list with one screenshot per group.
6. **Comparison table** (vs Azure portal, vs Datadog, vs Power BI).
7. **Privacy & security** (the trust paragraph: no raw data leaves tenant,
   here's the auditable code path).
8. **Roadmap** — link to `docs/backlog/`.
9. **Contributing** + license + ⭐ ask.

The first screen of the README determines 70% of stargazers vs. bouncers.

- **Shipped:** README rewritten end to end. Tagline as suggested
  ("Turn Azure App Insights into shareable Marketing & Technical
  dashboards in under 2 minutes — AI-mapped schema, deterministic KQL,
  nothing raw ever leaves your tenant. MIT."). All 9 sections in
  order; the "What's inside" list highlights the just-shipped B1-B4
  surfaces (alias/regex schema mapping, narration panel, first-run
  banner, period-over-period chips) so a HN visitor can see the
  product is real, not slideware. Comparison table includes Azure
  Portal / Datadog / Power BI with a one-line honesty disclaimer
  underneath ("the columns we're least kind to are also the most
  mature and have features we don't"). Privacy & security paragraph
  links the SECURITY.md auditable controls and the seven encoded
  checks. Roadmap links the per-track backlog and the
  launch-strategy traction-gate doc. The old "API endpoints" + "Env
  variables" wall-of-text trimmed to a short Configuration reference
  pointing at `src/server.js` for the full surface.
- **Asset placeholders:** the hero GIF block is an HTML comment
  pointing at `docs/assets/hero.gif` — needs A3. The "What's inside"
  bullet list has a sibling HTML comment marking where one screenshot
  per group would let it breathe. The "Live demo · _coming with the
  public launch_" line waits on A1 for the real URL. All three are
  now tracked in `docs/maintainer-todo.md` as discrete TODOs so the
  maintainer can swap them in without spelunking.
- **Validation:** README renders cleanly (Markdown only, no broken
  links to the existing tracked files). Tests still 74/74 — README
  changes are pure-doc and don't touch any code path.

### A3. Hero GIF / Loom recording [BLOCKER, 4h]
- 30-45 second screen recording: connect → dashboard renders → switch tabs →
  see readiness score → copy a prompt.
- Use the demo dataset from A1 so it always looks the same.
- Annotate with overlay text ("2 minutes from zero to dashboard", "AI maps
  your custom dimensions automatically", "no raw data leaves your tenant").
- Compress with Gifski or upload as MP4 to GitHub Issues for inline embed.

### A4. OG image / social unfurl [BLOCKER, 3h]
- 1200×630 image with logo + tagline + dashboard preview.
- Set OG meta on root URL, demo URL, and GitHub repo (description + topics).
- Test with the OG debuggers (Twitter card validator, LinkedIn post
  inspector, Slack).
- Every share link must visually look like a real product, not a GitHub
  fallback card.

### A5. One-page landing on the demo URL [STRONG, 5h] — DONE (hero shot + Plausible await maintainer)
- Above the fold: tagline + screenshot + two CTAs ("Try the demo",
  "Star on GitHub").
- Below: comparison table, security paragraph, FAQ (3 questions: "does it
  store my data?", "how do you connect to Azure?", "is the AI required?").
- Footer: GitHub link, license, contact email.
- No tracking beyond Plausible/Umami self-hosted (privacy-aligned with
  product positioning).
- **Shipped:** `public/index.html` `#landingPage` rewritten with the
  spec's structure end to end. Tagline now matches the README
  ("Azure App Insights → Marketing & Technical dashboards in 2
  minutes. AI-mapped schema. 22 KQL templates. Nothing raw ever
  leaves your tenant. MIT."). CTAs reordered so the demo button is
  primary, Connect-Azure is ghost, and a third button links the repo
  with a ★ icon. Below-the-fold sections, in order: feature cards
  (lightly updated copy to mention period-over-period chips and the
  paste-into-Cursor framing), comparison table (Keren Analytics vs
  Azure Portal / Datadog / Power BI; 6 rows; honesty disclaimer
  underneath), security paragraph (links the seven encoded controls
  + the SECURITY.md reporting path), 3-question FAQ (data storage /
  Azure connection / AI required), docs link, and a footer with
  GitHub / MIT License / Security / Contact. All sections styled in
  `public/styles.css` using the existing accent palette so the page
  works in both light and dark mode without a second pass.
- **No new tracking:** the landing footer copy promises "no tracking
  cookies; the only analytics is whatever Plausible / Umami snippet
  the operator pastes in." An HTML-comment slot at the bottom of
  `#landingPage` marks the exact insertion point so the snippet
  doesn't leak into the dashboard. Tracked in
  `docs/maintainer-todo.md` under §3 Plausible / Umami.
- **Tests:** new supertest case in `tests/api.test.js` asserts the
  landing copy is wired (tagline, CTAs, comparison table headers,
  FAQ questions, footer email). 74 → 75 tests; security audit clean.
- **Asset placeholders (maintainer-side):** the hero screenshot above
  the fold is an HTML-comment block expecting `<img class="landing
  -hero-shot">`; the Plausible/Umami slot is a similar comment near
  the bottom. Both land in `docs/maintainer-todo.md`.

### A6. `docs/setup-entra-id.md` slim version [BLOCKER, 4h] — DONE
- Today: 13 manual portal steps. Hard wall for non-IT users.
- Goal: 3-5 steps OR one Bicep one-click.
- Ship a `deploy/azure-app-registration.bicep` that creates the app
  registration, sets redirect URI, generates secret, optionally assigns
  Reader + Log Analytics Reader roles.
- README install path becomes:
  ```bash
  az deployment sub create -f deploy/azure-app-registration.bicep \
    -p redirectUri=...
  docker run -p 3000:3000 -e AZURE_CLIENT_ID=... keren-analytics
  ```
- Keep the long manual guide as a fallback section.
- **Shipped:** went with a single bash script (`deploy/azure-app-registration.sh`)
  rather than Bicep — the Microsoft.Graph Bicep extension can't surface a
  client-secret value, so a pure-IaC path would still need an out-of-band
  step. The script is idempotent (re-runs reuse the app and append a fresh
  secret), GNU/BSD-portable, and prints the exact env vars to paste. README
  install path now reads `az login` → run script → `docker compose up -d`.
  `docs/setup-entra-id.md` keeps the manual portal flow as a fallback for
  tenants where CLI app-registration is restricted.

## Track B — Product polish (what they see after they install)

### B1. Layer 1 of `ai-environment-analysis.md` (alias heuristics) [BLOCKER, 12h] — DONE
- Implement the alias table + regex patterns for userId / sessionId /
  pagePath / referrer in `src/core/mapping.js`.
- Add `matchType` field (`builtin` | `alias` | `pattern`) to mapping output.
- Cross-table consistency bonus.
- 4-6 unit tests covering the new resolution chain.
- **Why it's a blocker:** the current mapping is exact-match-only. Half of
  HN visitors trying their own tenant will see "no userId mapping" because
  they used `uid` or `visitorId`. That's a launch-killing first impression.
- **Shipped:** `ALIASES` table + regex per canonical field, cross-table
  consistency boost (`confidence: high` on 2+ tables), `matchType` /
  `matchedKey` / `tablesSeen` exposed on each canonical mapping, custom
  keys sanitized before injection, `allowedKqlExpressions(mapping)`
  extends the renderer whitelist with alias-derived exprs. +11 tests.

### B2. Layer 2 mock LLM narration on demo [STRONG, 8h] — DONE
- On the demo URL only (mock mode), surface a "What we found" panel that
  reads like the LLM output described in `ai-environment-analysis.md`.
- Canned response, no actual LLM call. Cost: 0 €.
- Tagline appears in screenshots and the hero GIF: "AI explains what your
  telemetry looks like."
- Real LLM integration ships post-launch (`ai-setup-wizard.md` proper).
- **Shipped:** `src/core/narration.js` — deterministic generator that
  composes a 3-4 sentence "Environment analysis" paragraph from the
  dashboard payload (visitors, sessions, top campaign source, peak
  hour, error-rate band, userId mapping type). Wired into
  `buildOverviewDashboard` so the payload now carries `narration: {
  headline, paragraph, badge, tagline, mode }`. Frontend renders it in
  a new panel above the KPIs on the Marketing tab
  (`public/index.html` → `#narrationPanel`,
  `public/app.js` → `renderNarration`,
  `public/styles.css` → `.narration-*`).
- **Honesty tweak vs original spec:** rather than a fully canned string,
  the same generator runs in both modes — mock mode shows it without
  badge, real mode shows it with a "Preview — real LLM coming soon"
  badge. The numbers come from the dashboard the user already sees,
  so nothing is invented; the "AI explains" tagline is honest because
  the panel does interpret the data, just deterministically. When
  Azure OpenAI integration ships post-launch, the same payload shape
  is what the frontend consumes — only the `paragraph` gets richer.
- **Tests:** 10 unit tests in `tests/narration.test.js` (mode toggle,
  badge presence, KPI presence in paragraph, peak-hour formatting,
  error-rate threshold branch, mapping-type branches, empty-data
  fallback, no template-token leakage, length bounds). Plus the api
  integration test asserts `dashboard.narration.mode === "mock"` end
  to end. 56 → 66 tests.
- **Maintainer-side:** screenshots for the launch should include the
  Marketing tab with this panel visible (above the fold). Tracked in
  `docs/maintainer-todo.md` under the press-kit / hero-GIF items.

### B3. First-run banner on dashboard [STRONG, 6h] — DONE
- Compose a deterministic banner from existing readiness + mapping data:
  "Your environment scores 68/100. Two quick wins available: [Add user
  identity (+15)] [Capture browser timings (+8)]".
- Click on a quick win → scroll to the matching prompt card.
- No LLM needed for v1; the AI version is post-launch.
- **Shipped:** server-side, `computeReadinessScore` now returns a
  `quickWins` array (top 3 unavailable signals by points;
  `src/core/readinessScore.js`). Frontend renders an
  `<aside id="firstRunBanner">` at the top of `#dashboardPanel` —
  visible across all three tabs because it sits above the tab-toolbar.
  Layout: a left-side score chip (`68/100` in accent color), a title
  ("Your environment scores 68/100. 2 quick wins available:"), and
  pill-shaped buttons for each quick win (`User Identity (+15)`).
  Clicking a chip switches to the Readiness tab via the existing
  `activateTab("readiness")` helper, scrolls smooth-into-view to
  `#signal-row-${signal}` (each score-row wrapper now carries that
  stable id), and fires a 1.6s background flash to draw the eye.
- **Dismiss + persistence:** `×` button writes
  `eaa.firstRunBanner.dismissed.v1=1` to `localStorage`. The banner
  also auto-hides when there are no quick wins (perfect score) or
  when readinessScore is null/empty. No DB needed (consistent with
  the in-memory metadataStore).
- **Tests:** +3 unit tests in `tests/readinessScore.test.js`
  (quickWins shape, perfect-score returns empty, null-report returns
  empty). 66 → 69 tests, audit clean. UI verification (banner visible
  + chip click + dismiss persistence) is the maintainer's eyeball
  pass — `docs/maintainer-todo.md` already has the "open dev server
  and check the dashboard" item.

### B4. Period-over-period comparison (top 3 KPI tiles only) [STRONG, 10h] — DONE
- Limited scope: only the 3 most prominent KPI tiles get a delta vs.
  previous period.
- KQL templates accept a `compareTo: previous` parameter.
- UI: small green/red delta chip + "vs last week" caption.
- Full comparison + deployment markers ship post-launch.
- **Shipped server side:** new `previousTimeRange(timeRange)` helper in
  `core/timeRange.js` maps the launch ranges to their predecessors
  (`today → yesterday`, `7d → prev7d`, `30d → prev30d`) and `null` for
  anything else (custom range hides the chips). New
  `kql/previous-kpis.kql` template runs a single `summarize` over the
  prior window returning all three KPIs (`uniqueVisitors`, `sessions`,
  `pageViews = count()`) — keeps query count to +1 instead of +3.
  `core/dashboard.js` runs that query when a predecessor exists, then
  `deltaEntry()` builds `{ current, previous, deltaPct, direction }`
  per KPI with a `0.5%` neutral band and an explicit `null` deltaPct
  when previous is zero (so a first-time tenant doesn't see misleading
  +∞%). Final payload: `dashboard.kpis.comparison = {
  previousRangeKey, label, uniqueVisitors, sessions, pageViews }` or
  `null`. Cache key uses the prev range key, so previous results live
  in their own cache slot.
- **Shipped UI:** the 3 KPI tiles on the Marketing tab gain a
  `.kpi-meta-row` with a colored `.kpi-delta` pill (`+13.6%` green up,
  `-x%` red down, `~0%` neutral grey) and a `.kpi-compare` caption
  ("vs last week" / "vs yesterday" / "vs last month"). Hidden when
  comparison is null. No new dependency.
- **Mock data:** `src/azure/mockData.js` gains `RANGE_SCALE` entries
  for `yesterday: 0.06`, `prev7d: 0.22`, `prev30d: 0.88` (slightly
  lower than current so the demo screenshots show the screenshot-
  friendly green positive deltas) plus a `previousKpis` query handler.
- **Tests:** new `tests/timeRange.test.js` (5 cases — predecessor key,
  window length, today→yesterday, custom/null/unknown returns null,
  comparisonLabel mapping). `tests/api.test.js` end-to-end asserts
  `dashboard.kpis.comparison.previousRangeKey === "prev7d"` with all
  three KPIs and a valid `direction`. 69 → 74 tests, audit clean.
- **Out of scope (post-launch, per spec):** the deployment-markers
  layer and full per-chart comparisons stay deferred.

### B5. "Copy share image" button [OPTIONAL, 4h]
- Server-side render a PNG of the current dashboard view using the existing
  state. Stores nothing.
- One button on every dashboard tab.
- HN demographic loves "screenshot for Slack" workflows. Cheap viral lever.

### B6. Demo dataset polish [BLOCKER, 3h] — DONE
- Audit `src/azure/mockData.js`: every chart on every tab must have a
  visually interesting story.
- Ensure: visible weekly seasonality, one anomaly day, one slow endpoint,
  meaningful geo distribution, varied browser mix.
- The demo is also the launch screenshot source — boring data = boring
  launch.
- **Shipped:** visitor traffic spike 4 days ago (×2.4, deterministic so
  it lands in both 7d and 30d windows, marked `anomaly: "traffic_spike"`),
  `/api/checkout` is the unmistakable slow + error outlier (p99 ~6s, 8.2%
  error rate), 12-country geo distribution with Spain/Italy added, browser
  mix expanded to 6 entries (Mobile Safari + Samsung Internet) and OS to 5
  (Android added), KPI sparklines have a clearer upward trend on
  visitors/sessions and a subtle improving-perf trend on response time
  alongside the existing trailing error spike, lunch dip on hourly trend.

## Track C — Trust signals (security + project quality)

### C1. Pre-launch security pass [BLOCKER, 4h] — DONE
- Verify no token / `code_verifier` / session secret is logged anywhere
  (grep + manual review of `src/server.js`, `src/azure/realClient.js`,
  `src/azure/tokenStore.js`).
- Run `npm audit` and address criticals.
- Add a `SECURITY.md` with reporting policy.
- CSP review: minimize `unsafe-inline`, justify CDN allowlist.
- Make the "no raw data leaves your tenant" claim provable: link to the
  exact lines in the code from the README/landing FAQ.
- **Shipped:** turned the audit into a repeatable check
  (`scripts/security-audit.mjs`, `npm run audit:security`) with 7
  encoded controls (sensitive logging, session hardening, CSP, raw
  telemetry persistence, committed env files, npm audit). GitHub
  Actions workflow runs it on push/PR plus a Monday cron, so newly
  disclosed transitive vulnerabilities turn the badge red even
  without commits. README gains the green badge; `SECURITY.md`
  documents the reporting policy, the audited posture, and the two
  legitimate fs sinks (`core/audit.js` metadata events,
  `core/metadataStore.js` setup-state JSON — no raw rows). One real
  finding fixed in flight: bumped transitive `path-to-regexp` 8.3.0
  → 8.4.2 and `qs` 6.14.1 → 6.15.1 via `npm audit fix` (no breaking
  changes, tests still 43/43).

### C2. GitHub repo polish [BLOCKER, 3h] — DONE (file-tracked items; Settings-side items remain manual)
- About / topics / website URL / description filled in.
- Issue templates (bug, feature request, question) in `.github/`.
- `CONTRIBUTING.md` (short — link to docs).
- `CODE_OF_CONDUCT.md` (Contributor Covenant).
- `SECURITY.md` (pointer to email).
- Pin the v0.1.0 release with proper notes.
- Add badges: license, CI status (if CI is set up — see C3), Docker pull
  count.
- **Shipped:** `LICENSE` (MIT, copyright Lionel Garnier and contributors)
  with `package.json` aligned (`"license": "MIT"`, author populated).
  `CONTRIBUTING.md` is short and points at `CLAUDE.md` for invariants and
  at the per-track backlog for what's deliberately deferred.
  `CODE_OF_CONDUCT.md` adopts Contributor Covenant 2.1 by URL reference
  (avoids inlining the canonical text; reporting goes to the same email
  as `SECURITY.md`). `.github/ISSUE_TEMPLATE/` ships three structured
  forms (bug / feature / question) plus `config.yml` that disables blank
  issues and surfaces the security reporting path. A short
  `.github/PULL_REQUEST_TEMPLATE.md` reminds contributors to read
  `CLAUDE.md` and run `npm test` + `npm run audit:security`. README
  gains license + Node-version badges next to the existing security
  badge. `SECURITY.md` updated with the real contact email and the
  closed-as-fixed gaps removed (`SESSION_SECRET` fail-loud + rate
  limiting). One adjacent fix carried in flight: `src/config.js` now
  throws when `NODE_ENV=production` and `SESSION_SECRET` is missing or
  a known placeholder, with 5 new tests in `tests/config.test.js`.
- **Deferred (Settings-side, not file-tracked):** About / topics /
  website URL / description on the GitHub repo page; pinning the
  v0.1.0 release. These need the maintainer to click through GitHub
  Settings; nothing to commit.
- **Deferred (depends on other tracks):** the Docker-pull-count badge
  needs a published Docker image (Track A6 territory); the CI-status
  badge needs the `npm test` workflow from C3.

### C3. Minimal CI [STRONG, 3h] — DONE
- GitHub Actions: run `npm install` + `npm test` on push and PR.
- Status badge in README.
- Without this, "MIT-licensed" feels less production. Cheap signal.
- **Shipped:** `.github/workflows/tests.yml` runs `npm ci` + `npm test`
  on push and PR to `main` (also `workflow_dispatch` for manual reruns)
  on Node 22 with the npm cache. Status badge added to the README right
  next to the existing security-audit badge. The redundant `npm test`
  step inside `security-audit.yml` is left in place as a belt-and-braces
  sanity check (the audit asserts the tests still pass before declaring
  the security posture green); both workflows are independent so a
  failing test does not red-badge the audit and vice versa, but a
  regression that breaks `npm test` is now surfaced under the
  unambiguous "Tests" name rather than buried under "Security audit".

### C4. CHANGELOG.md [OPTIONAL, 1h] — DONE
- Document v0.1.0 launch contents.
- Future commits append.
- **Shipped:** `CHANGELOG.md` follows Keep-a-Changelog 1.1.0 with two
  sections: `[Unreleased]` for what's landed since v0.1.0 (the C1-C4
  trust track + LICENSE/CoC/templates/CI badge), and `[0.1.0]` for the
  initial public release grouped as Added (product), Added
  (distribution), Security, Documentation, and Tests. Doubles as the
  v0.1.0 release-notes draft when the maintainer pins the release in
  GitHub Settings (see `docs/maintainer-todo.md` §2).

## Track D — Distribution prep (the launch ammunition)

### D1. Show HN post draft [BLOCKER, 3h]
- Title format: "Show HN: Keren Analytics — 2-min Azure App Insights
  dashboards (open source, AI-mapped)".
- Body: 4-6 paragraphs:
  1. What it is (one paragraph).
  2. Why I built it — concrete pain point with Azure portal.
  3. How the AI angle works (Layer 1 alias + Layer 2 narration).
  4. What's open and what's deliberately left for later.
  5. Tech stack one-liner.
  6. Ask for feedback.
- Pre-write the first founder-comment that addresses the predictable
  "but Azure portal already does X" objection.

### D2. Reddit posts (r/azure, r/devops, r/selfhosted) [BLOCKER, 2h]
- Three different angles, one per subreddit. Same product, framed for the
  audience:
  - r/azure: "I built an OSS alternative to portal analytics — feedback?"
  - r/devops: focus on the readiness score + LLM-suggested instrumentation.
  - r/selfhosted: focus on the Docker one-liner + privacy posture.
- Avoid "look at my project" framing. Lead with a concrete thing the user
  cares about.

### D3. dev.to / blog post [STRONG, 4h]
- Long-form (1500-2500 words) on the technical deep dive most likely to
  catch HN: "Building a natural-language-to-KQL layer for Azure logs
  (without Azure OpenAI as a hard dep)".
- Cross-post to dev.to + Hashnode + personal blog.

### D4. Outreach list [BLOCKER, 2h]
- 10-15 named contacts: Microsoft MVPs in Azure data/devops space, MS DevRel
  folks, well-known Azure newsletter authors, maintainers of Awesome-Azure
  lists.
- Personalized 3-line DM template ready to send post-launch (not before).
- LinkedIn for non-engineers, Twitter/X for engineers, email as fallback.

### D5. Launch-day analytics [BLOCKER, 2h]
- Plausible / Umami self-hosted on the demo URL.
- Track: source (HN / Reddit / Twitter), conversion to GitHub stars, demo
  click-through rate, time on page.
- Real-time dashboard the founder can watch during launch day.

### D6. Press kit [OPTIONAL, 2h]
- One PDF / page with: logo (SVG + PNG), tagline, 280-char pitch, 1500-char
  pitch, 3 product screenshots, founder photo + bio.
- Hosted at `/press` on the demo URL.
- Send proactively to MVPs / newsletter authors who pick up the post.

## Track E — Anti-fragility for launch day

### E1. Demo rate limiting [BLOCKER, 3h] — DONE (LLM cap deferred with B2)
- Per-IP rate limit on the demo (60 req/min hard cap).
- Friendly "high traffic, try in a few minutes" page rather than 502/504.
- Hard daily cap on LLM cost (when B2 ships): cut over to canned responses
  past €10/day on the demo.
- **Shipped:** `src/core/rateLimit.js` — minimal in-memory fixed-window
  per-IP limiter, no new dep (CLAUDE.md mandates a minimal dep set, demo
  is single-instance). Wired in `src/server.js` as two named buckets:
  `api` (60 req/min, all dynamic routes) and `auth` (stricter 20 req/min,
  on `/auth/*` so OAuth burning can't also DoS the dashboard). Both
  bypass `NODE_ENV=test`. Friendly 429 page (HTML or JSON depending on
  `Accept`) plus `Retry-After`, `X-RateLimit-Limit`, and
  `X-RateLimit-Remaining` headers. +8 unit tests.
- **Deferred (with B2):** the daily LLM cost cap. Lives in the same file
  when the mock-LLM narration ships — needs a separate counter keyed by
  day and a kill-switch flipping the demo to canned responses past the
  cap. No mock-LLM = nothing to cap yet.

### E2. Pre-warm + cache [STRONG, 2h]
- Pre-cache the mock dashboard for the demo dataset.
- All static assets behind Cloudflare with long max-age.

### E3. Status page [OPTIONAL, 1h]
- BetterStack free tier or self-hosted.
- Linked from the demo footer.
- During an outage, "we're aware" beats silence by a wide margin.

### E4. Launch day runbook [STRONG, 1h] — DONE
- Single doc: how to roll back the demo, how to rate-limit harder, who to
  contact at Render/Cloudflare, where the LLM kill switch is.
- Founder reads it the morning of launch. Saves hours under stress.
- **Shipped:** `docs/launch-day-runbook.md` — single page intentionally
  short and copy-pasteable: T-2h pre-launch checklist (gated on the
  same "ready to launch" definition this file has), what to watch
  during the window (Plausible / GitHub stars / Render / demo URL),
  triage trees for "it's slow / it's down" and "someone found a
  security issue", how to rate-limit harder (specific edits to
  `src/server.js:83-98`), rollback recipe (revert + push, never
  force-push to `main`), HN/Reddit moderation playbook, and a
  contacts section. The LLM kill-switch section is stubbed with a
  pointer to where it'll live when B2 ships.

## Track F — AI-first setup wizard (ADR 0005, pre-launch blocker)

> **Added 2026-05-11 after ADR 0005.** The "AI-mapped schema / AI explains
> your telemetry" claims were AI-washing — no LLM was wired. This track
> closes that gap before launch by shipping a real audit + AI mapping +
> recommendations flow on Azure AI Foundry, persisted in SQLite. The other
> AI surfaces (`ai-natural-language-queries.md`,
> `ai-instrumentation-assistant.md`) stay post-launch. See
> [`docs/adr/0005-ai-first-scope.md`](../adr/0005-ai-first-scope.md).

### F1. Persistance SQLite [BLOCKER, 16-24h]
- Install `better-sqlite3` (sync, simple) or use Node 22.5+ `node:sqlite`
  native module. ADR 0005 § Decision 2.
- Schema: `tenants`, `scans`, `mappings`, `signals`, `validations` — with
  per-tenant scope and timestamps. File at `data/keren.db`.
- Rewrite `src/core/metadataStore.js` to use the SQLite schema. Keep the
  same exported interface (`getTenant`, `updateTenant`,
  `logStateTransition`) so callers don't change.
- Migration script: if `data/store.json` exists at boot, import it into
  the SQLite schema, then rename to `store.json.legacy` (don't delete).
- Backup policy: hourly `VACUUM INTO`-based snapshot to `data/backups/`
  (cap 24 snapshots). Production-side: Azure Blob upload via Container
  Apps Jobs cron (separate task, F1 ships the script).
- Tests: existing 5 metadataStore tests must keep passing; add 3 new
  tests for migration path + concurrent transactions.

### F2. Schema scan enrichi [BLOCKER, 16-24h]
- Extend `src/core/schemaProfile.js` → new `src/core/schemaScan.js`.
- Capture per-tenant : event volumes by `name`, top-N `customDimensions`
  keys with cardinality + sample values (PII-scrubbed via regex
  `email|phone|ssn`), timestamps span, gaps detected (e.g. no
  `userId`-like field present, no campaign tracking, no session
  duration).
- Persist scan output as a JSON document in `scans` table, indexed by
  `tenantId + scannedAt`. Latest scan is the active one; history kept.
- Cap on scan KQL: use existing `queryTimeoutMs` (12s), summary queries
  only (no `take 10000`). Total ≤ 5-6 queries per scan.
- Tests: schema parse roundtrip, PII scrub coverage, gap detection
  heuristics.

### F3. AI mapping + recommendations service [BLOCKER, 24-32h]
- New `src/ai/azureFoundry.js` provider implementing the contract in
  `docs/architecture-ai.md`. Authenticate via the existing Managed
  Identity (no API keys). Endpoint + deployment name in env vars
  (`AZURE_FOUNDRY_ENDPOINT`, `AZURE_FOUNDRY_DEPLOYMENT`).
- Prompt structuré (JSON schema response) that takes a F2 scan as input
  and returns: `mapping_proposals[]` (canonical field → tenant column,
  with confidence + explanation), `missing_signals[]` (signal name +
  recommended KQL to instrument), `dashboard_recommendations` (which
  charts to show prominently given what's available).
- **Quota guard**: in-memory daily counter; hard cap at 10 €/day worth
  of tokens (computed from `gpt-4o-mini` pricing); when exceeded,
  return a deterministic fallback (existing alias/regex mapping +
  empty recommendations) plus a `degraded: true` flag the UI surfaces.
- Cache scan→AI-output in SQLite (so a re-load doesn't re-spend
  tokens). Invalidate on re-scan.
- Mode `AI_PROVIDER=none` must continue to work (deterministic-only
  output, no LLM call) — tests run in this mode.
- Bicep update: extend `infra/main.bicep` with Azure AI Foundry Hub +
  Project + connection + model deployment + role assignment
  (`Cognitive Services User` to the existing MI).
- Tests: provider contract test, JSON schema validation, fallback
  trigger on quota exceeded, cache hit/miss.

### F4. Setup wizard UI [BLOCKER, 32-40h]
- New route `/setup` (or extend existing post-OAuth flow). Multi-step:
  1. **Scanning** — spinner + live narration ("Reading custom dimensions…
     Found 47 event types… Detecting user identity…").
  2. **AI findings** — proposed mappings with confidence badges,
     missing signals with recommended KQL (copy button), dashboard
     recommendations.
  3. **Validate/edit** — user can accept all, override individual
     mappings, dismiss recommendations. Persists to `validations` table.
  4. **Save & continue** — redirects to the dashboard with the
     validated mapping active.
- Re-scan button in settings ("Found new event types? Re-scan now").
- Empty-state handling: tenant with no events yet → wizard explains
  what to instrument and waits.
- Tests: end-to-end supertest covering the 4-step flow + override path.

### F5. Documentation + AI specs refresh [STRONG, 8-16h]
- Update `docs/backlog/ai-setup-wizard.md` status from "post-launch
  optional" to "pre-launch, see Track F". Add the concrete F1-F4
  scope (replace speculative sections).
- Update `docs/backlog/ai-environment-analysis.md` similarly — Layer 1
  alias is done (B1), Layer 2 LLM ships as part of F3.
- Update `docs/architecture-ai.md` status from DRAFT to ACCEPTED, with
  the `azure-foundry` provider as the canonical implementation.
- Remove the `Preview — real LLM coming soon` badge from `narration.js`
  generator output when `AI_PROVIDER=azure-foundry` and the call
  succeeds.

### Track F dependencies & sequencing

```
F1 (SQLite) ─┬─→ F2 (scan) ─→ F3 (AI mapping) ─→ F4 (wizard UI)
             │                       ↑
             └───────────────────────┘
                  (cache + persistence)

F5 in parallel once F1-F4 are conceptually clear (~day 3 of Track F).
```

Maintainer dependency : Azure AI Foundry workspace + `gpt-4o-mini`
deployment must exist before F3 can run end-to-end. See
[`docs/maintainer-todo.md`](../maintainer-todo.md) § "Provisionner Azure
AI Foundry".

## Effort summary

| Track                                  | Blockers | Strong | Optional | Total |
|----------------------------------------|----------|--------|----------|-------|
| A — Public surface                     | 23h      | 5h     | 0h       | 28h   |
| B — Product polish                     | 15h      | 24h    | 4h       | 43h   |
| C — Trust signals                      | 7h       | 3h     | 1h       | 11h   |
| D — Distribution prep                  | 9h       | 4h     | 2h       | 15h   |
| E — Anti-fragility                     | 3h       | 3h     | 1h       | 7h    |
| **F — AI-first scope (added 2026-05-11)** | **88-120h** | 8-16h | 0h | **96-136h** |
| **Total blockers (must ship)**         | **145-177h** | | | |
| **Total with strong items**            |          |        |          | **192-232h** |
| **Total all-in**                       |          |        |          | **200-240h** |

Realistic launch timeline with all blockers + most strong items:
~5-6 weeks at ~40h/week focused. Most of Phase A blockers already shipped
(infra, custom domain, CI/CD, GitHub polish, release v0.1.0). Remaining
heavy lift is Track F (AI setup wizard, ~15 jours focus) plus the
content/asset drafts in Track D and the Hero GIF / OG image in Track A.

## Sequencing — recommended order

**Week 1 — product + content**
- Day 1-2: B1 (alias heuristics) + B6 (demo dataset polish).
- Day 3: A6 (Bicep) + C1 (security pass).
- Day 4: A1 (demo URL stand-up) + A4 (OG image).
- Day 5: A2 (README rewrite) + A3 (hero GIF).

**Week 2 — polish + launch prep**
- Day 6: B2 (mock LLM narration) + B3 (first-run banner).
- Day 7: B4 (period comparison) + B6 polish round 2.
- Day 8: A5 (landing page) + C2 (GitHub repo polish) + C3 (CI).
- Day 9: D1-D5 (all distribution prep).
- Day 10: Soft test in 1-2 small communities. Fix anything broken.

**Day 11 — launch.**

## Definition of "ready to launch"

All [BLOCKER] items shipped. Three independent strangers can:
1. Open the demo URL on a phone and understand the product within 30s.
2. Run the install command on a fresh machine and reach the dashboard.
3. Read the README and articulate the security posture without
   asking questions.

If any of these fails on launch eve, **delay the launch by one week**.
A blown launch is much worse than a 1-week delay.

## What's deliberately out of scope for launch

These exist in the broader backlog and explicitly **do not block** launch:

- Hosted multi-tenant SaaS (Phase 3).
- Postgres / Redis persistence (Phase 3).
- Full LLM-powered setup wizard (`ai-setup-wizard.md` Layer 3+).
- Natural-language query explorer (`ai-natural-language-queries.md`).
- AI instrumentation assistant (`ai-instrumentation-assistant.md`).
- Custom event funnels and full conversion tab.
- Multi-resource aggregation.
- Goals + weekly digest.
- AWS / GCP connectors (Phase 4).

These are **post-traction** features. Building them pre-launch is the
single most common way solo founders waste their launch window.


=====================================================================
# Source file: `CHANGELOG.md`
=====================================================================

# Changelog

All notable changes to **Keren Analytics** are documented in this
file. Format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/);
this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Pre-launch sprint work that has landed on `main` since v0.1.0 — see
[`docs/backlog/launch-readiness.md`](docs/backlog/launch-readiness.md)
for the per-track status.

### Added
- **AI-first setup wizard (Track F, ADR 0005)** at `/setup` — scans the
  tenant's Application Insights telemetry, asks the model "what dashboards
  can we credibly render for you", and persists a validated column
  mapping. Backed by:
  - **SQLite persistence (F1)** via Node 22 native `node:sqlite`
    (`data/keren.db`, schema in `src/core/db.js`, accessed through
    `src/core/metadataStore.js`). Legacy `data/store.json` auto-migrates
    on first boot.
  - **Enriched schema scan (F2)** — `src/core/schemaScan.js`: event
    volumes, top custom-dimension keys with cardinality + PII-scrubbed
    samples, gap detection. Persisted per `(tenant, resourceId)`.
  - **AI mapping + recommendations (F3)** on **Azure AI Foundry**
    (`src/ai/azureFoundry.js`, deployment `gpt-5.4-mini`, Managed-Identity
    auth, no API keys). Provider abstraction
    `AI_PROVIDER=none|ollama|azure-foundry`; daily EUR quota guard with a
    deterministic fallback; scan→output cached in SQLite.
  - **Wizard UI (F4)** with live SSE scan narration, AI findings cards
    (✓ Ready / ! Needs instrumentation), and copy-paste `code_prompt`s
    for missing signals (`public/setup.{html,js}`).
- **Per-resource setup state + service hub** — `scans`/`validations` keyed
  by `(tenant, resourceId)`; a post-login hub lists every App Insights
  resource with a config status. Config/render split: `runSetupScan`
  (config, once) vs `runOverviewPipeline` (render, every load — no
  re-scan, no LLM call).
- **Azure-first hosting (Phase A, ADR 0004)** — production on **Azure
  Container Apps** (France Central) via Bicep (`infra/main.bicep` +
  `deploy/azure-deploy.sh`), custom domain **https://keren.run** with
  managed TLS, and image-only CI/CD through OIDC
  (`.github/workflows/deploy-azure.yml`). Render blueprint kept as a
  self-host fallback only.
- **Durable persistence across redeploys** — hourly in-process SQLite →
  Azure Blob backup (`src/core/backupScheduler.js`), plus **restore-on-boot**
  and a final snapshot on `SIGTERM`, so the Container App's ephemeral
  filesystem no longer loses wizard config on redeploy (single-replica).
- Landing page on `/` rewritten as a launch one-pager — tagline, three
  CTAs (Try the demo / Connect your Azure / ★ Star on GitHub),
  comparison table (Keren Analytics vs Azure Portal / Datadog / Power
  BI), security trust paragraph, 3-question FAQ, and a privacy-clean
  footer (no tracking by default; explicit Plausible/Umami slot for
  the operator).
- README rewritten as a launch-pitch (one-line tagline, why-it-exists,
  try-it-now, what's-inside, comparison table, privacy/security
  trust paragraph, roadmap, configuration reference, contributing,
  ⭐ ask). Old docs-style sections (full env list, full API list)
  trimmed to a short reference block linking to source.
- Period-over-period comparison on the top 3 KPI tiles (Unique
  Visitors, Sessions, Page Views) with green/red/neutral delta chip +
  "vs last week" caption. New `kql/previous-kpis.kql` template; new
  `previousTimeRange()` and `comparisonLabel()` helpers in
  `core/timeRange.js`.
- First-run banner above the tab bar that shows the readiness score
  + top 2 quick wins as clickable chips; click switches to the
  Readiness tab and scrolls to the matching signal row.
  `localStorage`-persisted dismissal.
- "Environment analysis" panel above the KPI grid — deterministic
  AI-style narration generated from the dashboard payload (visitors,
  sessions, top campaign, peak hour, error-rate band, userId mapping
  type). Mock mode: no badge. Real mode: "Preview — real LLM coming
  soon" badge (the same generator runs in both modes; no fabrication).
- `LICENSE` (MIT) and `package.json` license metadata.
- `CONTRIBUTING.md` short guide that points at `CLAUDE.md` for invariants.
- `CODE_OF_CONDUCT.md` adopting Contributor Covenant 2.1 by URL reference.
- `.github/ISSUE_TEMPLATE/{bug_report,feature_request,question}.yml`
  structured forms plus `config.yml` disabling blank issues and
  surfacing the security reporting path.
- `.github/PULL_REQUEST_TEMPLATE.md` reminding contributors to read
  `CLAUDE.md` and run `npm test` + `npm run audit:security`.
- `.github/workflows/tests.yml` GitHub Actions pipeline running the test
  suite on every push/PR (Tests badge in the README).
- `docs/maintainer-todo.md` single-source list of out-of-band items the
  maintainer must execute (secrets, GitHub Settings, third-party
  accounts, author-voice content).
- License + Node-version badges in the README next to the existing
  security-audit badge.

### Changed
- **Setup wizard streamlined to ~1 click** — after the scan the wizard
  auto-advances to the AI findings, and "Build my dashboard" always saves
  the proposed mapping directly. The technical mapping editor is no longer
  a forced step: it's reachable on demand via the dashboard's "Mapping"
  link (`/setup?mode=mapping`). Low-confidence fields are flagged inline
  rather than forcing a detour. (See `docs/backlog/ai-setup-wizard.md`
  § "Two-click wizard".)

### Security
- **CSRF tokens** enforced on every mutating route (`verifyCsrf` in
  `src/server.js`; token issued via `/auth/session`, sent as
  `X-CSRF-Token`). Closes the previous "no CSRF" gap.
- `SESSION_SECRET` is now required in production: `src/config.js` throws
  at boot when `NODE_ENV=production` and the value is missing or set to
  a known placeholder (`dev-secret-change-me`,
  `change-me-in-production`). 5 new tests in `tests/config.test.js`.
- `SECURITY.md` updated to remove gaps that have since been closed
  (rate limiting → E1 done, default-secret fallback → fixed).

## [0.1.0] — Initial public release

First public release. Everything below is what shipped on day one.

### Added — product
- **Mock + real Azure modes**, switched via `AZURE_MODE`. Mock mode runs
  with no credentials and serves a deterministic dataset suitable for
  the public demo and tests; real mode hits Azure ARM + Log Analytics
  via OAuth (PKCE). Mock and real clients expose the same surface so
  every test runs in mock mode.
- **Three dashboard views** — Marketing (acquisition, geo, sources,
  funnels), Technical (errors, latency, top endpoints), Readiness
  (telemetry coverage score + missing-signal prompts).
- **Readiness score (0-100)** computed from 7 weighted signals
  (`core/readinessScore.js`) with LLM-ready prompts for whichever
  signals are missing (`core/promptGenerator.js`).
- **Schema auto-detection** — `core/schemaProfile.js` infers the
  tenant's `userId` / `sessionId` / `pagePath` columns from the live
  Application Insights schema, then `core/mapping.js` maps the canonical
  model to the tenant's columns. KQL templates in `kql/` are rendered
  server-side via `core/kql.js` with substitution tokens
  (`{{userIdColumn}}`, etc.) — tenant identifiers never reach a query
  string.
- **22 versioned KQL templates** covering page views, sessions, geo,
  browsers, sources, funnels, error rates, latency percentiles, top
  endpoints, peak hours, custom events, A/B test outcomes, anomaly
  sparklines, and session-replay timelines.
- **State machine** (`core/stateMachine.js`) for the per-tenant
  pipeline (auth → discover → profile → render) with up to 200
  transitions retained per tenant for the audit trail.
- **TTL cache** keyed on `tenant + workspace + mappingVersion + range`
  with per-range TTLs (5 min for `today`, 15 min for `7d`/`30d`).
- **Interactive world map** (Leaflet) and **multi-step Sankey** flow
  diagrams in the dashboard.
- **Smart Insights**, **Peak Hours heatmap**, **A/B Test Monitor**, and
  **Session Replay Timelines** on the Marketing tab.
- **Period comparison** scaffold (`core/timeRange.js`) and **dashboard
  filters** with URL-parameter auto-detection.
- **Modern docs site** (Stripe / Vercel-inspired) under `public/docs/`,
  linked from the navbar and the landing page.

### Added — distribution
- `Dockerfile` (Node 22 Alpine, non-root user) and `docker-compose.yml`
  for one-command local runs.
- `render.yaml` blueprint for one-click Render deployment from `main`.
- `infra/` Bicep template + `scripts/register-azure-app.sh` for a
  one-command Entra ID app registration in the maintainer's tenant.
- `docs/setup-entra-id.md` walks through real-mode setup end-to-end.

### Security
- `scripts/security-audit.mjs` — repeatable check encoding 7 controls
  (sensitive-data logging, session cookie hardening, CSP `script-src`
  has no `unsafe-*`, CSP CDN allowlist, no raw telemetry persistence,
  committed env-files placeholder-only, `npm audit` high+).
  `npm run audit:security` runs locally; GitHub Actions runs it on push
  and PR plus a Monday cron, so newly disclosed transitive
  vulnerabilities turn the badge red even between commits.
- **Per-IP rate limiting** (`src/core/rateLimit.js`): in-memory
  fixed-window limiter with two named buckets — `api` (60 req/min on
  all dynamic routes) and `auth` (20 req/min on `/auth/*`). Friendly
  429 page (HTML or JSON depending on `Accept`) with `Retry-After`,
  `X-RateLimit-Limit`, and `X-RateLimit-Remaining` headers. Bypassed
  in `NODE_ENV=test`.
- **OAuth (PKCE)** flow in `src/server.js` (`/auth/login` /
  `/auth/callback`). Tokens, `code_verifier`, and session secrets are
  never logged — enforced by the security-audit script.
- **No raw log persistence**: only aggregates leave the server. Two
  legitimate filesystem sinks (`core/audit.js` metadata events,
  `core/metadataStore.js` setup state) are documented in `SECURITY.md`
  and allowlisted in the audit script; any other `fs.write*` in `src/`
  fails the audit.
- **Helmet + CSP** with `script-src` restricted to `'self'` + the two
  CDN hosts (`cdn.jsdelivr.net` for Chart.js, `unpkg.com` for Leaflet).
  No `unsafe-inline` / `unsafe-eval`.
- One transitive dependency advisory fixed in flight: `path-to-regexp`
  8.3.0 → 8.4.2 and `qs` 6.14.1 → 6.15.1.

### Documentation
- `docs/launch-strategy.md` — go-to-market plan and Phase 3 / 4
  traction gates.
- `docs/product.md`, `docs/technical.md`, `docs/vision.md`,
  `docs/architecture-auth.md`, `docs/architecture-multicloud.md`.
- `docs/backlog/{launch-readiness,phase-1..4,adoption-drivers,
  ai-{setup-wizard,environment-analysis,natural-language-queries,
  instrumentation-assistant}}.md`.
- `docs/setup-entra-id.md`.

### Tests
- 56 tests across 10 files using the native `node:test` runner +
  supertest for API tests. All run in mock mode (`NODE_ENV=test`
  forces `azureMode=mock`).

[Unreleased]: https://github.com/lionelgarnier/keren-analytics/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lionelgarnier/keren-analytics/releases/tag/v0.1.0


---

_Bundle generated: 2026-06-04 15:18 UTC_
_Generator: scripts/build-strategy-bundle.sh_
