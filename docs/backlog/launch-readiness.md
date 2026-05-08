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

### A1. Demo URL — `demo.easy-analytics.dev` or equivalent [BLOCKER, 6h]
- Stand up a public hosted instance using mock mode (no Azure auth needed).
- Pin a deterministic mock dataset that tells a complete product story
  (visitors trending up, one anomaly, one slow endpoint, readiness score 68).
- Subdomain on a domain we control. **Not** a Render-generated URL (looks
  amateur).
- Cloudflare in front for caching + DDoS during launch spike.
- Health check + uptime monitoring (free tier of UptimeRobot or
  BetterStack).

### A2. Root README rewrite [BLOCKER, 6h]
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

### A5. One-page landing on the demo URL [STRONG, 5h]
- Above the fold: tagline + screenshot + two CTAs ("Try the demo",
  "Star on GitHub").
- Below: comparison table, security paragraph, FAQ (3 questions: "does it
  store my data?", "how do you connect to Azure?", "is the AI required?").
- Footer: GitHub link, license, contact email.
- No tracking beyond Plausible/Umami self-hosted (privacy-aligned with
  product positioning).

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
  docker run -p 3000:3000 -e AZURE_CLIENT_ID=... easy-analytics
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

### B2. Layer 2 mock LLM narration on demo [STRONG, 8h]
- On the demo URL only (mock mode), surface a "What we found" panel that
  reads like the LLM output described in `ai-environment-analysis.md`.
- Canned response, no actual LLM call. Cost: 0 €.
- Tagline appears in screenshots and the hero GIF: "AI explains what your
  telemetry looks like."
- Real LLM integration ships post-launch (`ai-setup-wizard.md` proper).

### B3. First-run banner on dashboard [STRONG, 6h]
- Compose a deterministic banner from existing readiness + mapping data:
  "Your environment scores 68/100. Two quick wins available: [Add user
  identity (+15)] [Capture browser timings (+8)]".
- Click on a quick win → scroll to the matching prompt card.
- No LLM needed for v1; the AI version is post-launch.

### B4. Period-over-period comparison (top 3 KPI tiles only) [STRONG, 10h]
- Limited scope: only the 3 most prominent KPI tiles get a delta vs.
  previous period.
- KQL templates accept a `compareTo: previous` parameter.
- UI: small green/red delta chip + "vs last week" caption.
- Full comparison + deployment markers ship post-launch.

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

### C1. Pre-launch security pass [BLOCKER, 4h]
- Verify no token / `code_verifier` / session secret is logged anywhere
  (grep + manual review of `src/server.js`, `src/azure/realClient.js`,
  `src/azure/tokenStore.js`).
- Run `npm audit` and address criticals.
- Add a `SECURITY.md` with reporting policy.
- CSP review: minimize `unsafe-inline`, justify CDN allowlist.
- Make the "no raw data leaves your tenant" claim provable: link to the
  exact lines in the code from the README/landing FAQ.

### C2. GitHub repo polish [BLOCKER, 3h]
- About / topics / website URL / description filled in.
- Issue templates (bug, feature request, question) in `.github/`.
- `CONTRIBUTING.md` (short — link to docs).
- `CODE_OF_CONDUCT.md` (Contributor Covenant).
- `SECURITY.md` (pointer to email).
- Pin the v0.1.0 release with proper notes.
- Add badges: license, CI status (if CI is set up — see C3), Docker pull
  count.

### C3. Minimal CI [STRONG, 3h]
- GitHub Actions: run `npm install` + `npm test` on push and PR.
- Status badge in README.
- Without this, "MIT-licensed" feels less production. Cheap signal.

### C4. CHANGELOG.md [OPTIONAL, 1h]
- Document v0.1.0 launch contents.
- Future commits append.

## Track D — Distribution prep (the launch ammunition)

### D1. Show HN post draft [BLOCKER, 3h]
- Title format: "Show HN: Easy Analytics — 2-min Azure App Insights
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

### E1. Demo rate limiting [BLOCKER, 3h]
- Per-IP rate limit on the demo (60 req/min hard cap).
- Friendly "high traffic, try in a few minutes" page rather than 502/504.
- Hard daily cap on LLM cost (when B2 ships): cut over to canned responses
  past €10/day on the demo.

### E2. Pre-warm + cache [STRONG, 2h]
- Pre-cache the mock dashboard for the demo dataset.
- All static assets behind Cloudflare with long max-age.

### E3. Status page [OPTIONAL, 1h]
- BetterStack free tier or self-hosted.
- Linked from the demo footer.
- During an outage, "we're aware" beats silence by a wide margin.

### E4. Launch day runbook [STRONG, 1h]
- Single doc: how to roll back the demo, how to rate-limit harder, who to
  contact at Render/Cloudflare, where the LLM kill switch is.
- Founder reads it the morning of launch. Saves hours under stress.

## Effort summary

| Track                                  | Blockers | Strong | Optional | Total |
|----------------------------------------|----------|--------|----------|-------|
| A — Public surface                     | 23h      | 5h     | 0h       | 28h   |
| B — Product polish                     | 15h      | 24h    | 4h       | 43h   |
| C — Trust signals                      | 7h       | 3h     | 1h       | 11h   |
| D — Distribution prep                  | 9h       | 4h     | 2h       | 15h   |
| E — Anti-fragility                     | 3h       | 3h     | 1h       | 7h    |
| **Total blockers (must ship)**         | **57h**  |        |          |       |
| **Total with strong items**            |          |        |          | **96h** |
| **Total all-in**                       |          |        |          | **104h** |

Realistic 2-week sprint with all blockers + most strong items: **80 hours**.

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
