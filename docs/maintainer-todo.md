# Maintainer TODO — actions hors-code

This file tracks work that requires the maintainer (Lionel) personally —
because it needs credentials, GitHub Settings access, third-party
accounts, design work, or author voice. Claude Code agents update this
file when they discover a new manual dependency, but they cannot tick
items off.

Format: each item has **what**, **why**, **when needed**, **how**, and
links to the agent-side work that depends on it.

---

## 1. Production environment & secrets

### `SESSION_SECRET` (production)
- **Why**: `src/config.js` now throws at boot if `NODE_ENV=production`
  and `SESSION_SECRET` is missing or set to a known placeholder.
- **When**: before the demo URL goes live.
- **How**: generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  and set it on the deploy target (Render env var, or `docker run -e`,
  etc.). Never commit it.
- **Status**: TODO.

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
- **Status**: TODO. Optional for the OSS-first launch.

### Demo deploy target
- **Why**: the Show HN / Reddit launch needs a clickable URL.
- **When**: launch eve.
- **How**: `render.yaml` blueprint exists. Connect the GitHub repo to
  Render, set `SESSION_SECRET` (and Azure vars if real mode), pick a
  region. Subdomain on a domain Lionel controls — **not** a
  Render-generated URL (per `launch-readiness.md` A1).
- **Status**: TODO.

---

## 2. GitHub repo Settings (not file-tracked)

These need a human to click through `Settings` on
`github.com/lionelgarnier/easy-analytics-for-azure`:

### About / topics / website / description
- **Why**: HN/Reddit visitors pattern-match on these in the first 5s.
- **How**: Settings → top of the repo page →
  - Description: short pitch (≤ 140 chars).
  - Website: the demo URL (set this once A1 ships).
  - Topics: `azure`, `application-insights`, `analytics`, `kql`,
    `dashboard`, `oss`, `nodejs`, `express`. Add `marketing-analytics`
    if there's room.
- **Status**: TODO. Blocked on demo URL for the website field.

### Pin v0.1.0 release with notes
- **Why**: the right-hand sidebar's "Releases: v0.1.0" is a strong
  signal of "this is real software, not a weekend hack".
- **How**: `Releases` → `Draft a new release`. Tag `v0.1.0` on `main`.
  Notes should mirror the future `CHANGELOG.md` v0.1.0 section
  (Claude can draft the changelog body — see C4).
- **Status**: TODO.

### Issue + PR templates UI check
- **Why**: the `.github/ISSUE_TEMPLATE/*.yml` and
  `.github/PULL_REQUEST_TEMPLATE.md` files are now in place; worth
  opening `New issue` and `Compare/PR` once to verify they render.
- **Status**: TODO (1 minute).

### Branch protection on `main`
- **Why**: prevents accidental force-push to the deployed branch.
- **How**: Settings → Branches → Add rule for `main` → require PR
  before merging, require status checks if/when CI exists (C3).
- **Status**: TODO. Low priority pre-launch (single-maintainer repo).

---

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
- **Why**: Phase 3 (multi-tenant SaaS) and Phase 4 (multi-cloud) are
  gated on signals defined there. As launch unfolds you'll want to
  re-read this and decide if any gate criterion shifted.
- **Status**: ongoing.

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
