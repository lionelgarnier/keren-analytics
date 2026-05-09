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
> - **Project rename to `keren-analytics` and demo URL `analytics.keren.run`
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
  beta tenants on `demo.easy-analytics.dev` + GitHub forks with commits)
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
| 06:00      | Show HN post (title format: "Show HN: Easy Analytics — 2-min Azure App Insights dashboards, MIT-licensed"). |
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
