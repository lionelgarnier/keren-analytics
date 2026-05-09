# Launch-day runbook

Single page the maintainer (Lionel) reads the morning of launch and keeps
open in a tab during the launch window. Designed to be re-read under
stress — short headings, copy-pasteable commands, no narrative.

If you have to add a new procedure here during the launch, do it; we'll
clean up the prose afterwards. **Don't make the runbook prettier instead
of fixing the incident.**

---

## Pre-launch checklist (run T-2h)

- [ ] **Demo URL alive**: `curl -fsS https://<demo-host>/auth/session`
      returns 200 with `{"authenticated":false,...}` JSON.
- [ ] **Tests + audit green on `main`**: GitHub Actions Tests + Security
      audit badges both green.
      <https://github.com/lionelgarnier/keren-analytics/actions>
- [ ] **`SESSION_SECRET` is real on the deploy target** (Render env var
      tab, not the placeholder). The app refuses to boot in production
      otherwise — `src/config.js` throws.
- [ ] **Rate limits known and tested**: `api` 60/min, `auth` 20/min,
      both per-IP. See `src/server.js:83-98`. Hit the demo with
      `for i in {1..70}; do curl -s -o /dev/null -w "%{http_code}\n" \
      https://<demo-host>/api/dashboard?range=today; done` — expect a
      run of `200`s then `429`s.
- [ ] **CHANGELOG `[Unreleased]` reflects what's deployed**. If you're
      about to tag a release, move `[Unreleased]` → `[0.1.x]`.
- [ ] **Maintainer-side TODOs reviewed**: open
      [`docs/maintainer-todo.md`](maintainer-todo.md) and confirm the
      Status of every section-1 item is `DONE` or explicitly accepted
      as deferred.

If any of the above is red, **delay one week**. A blown launch costs
more than a 1-week delay (`docs/backlog/launch-readiness.md` § Definition
of "ready to launch").

---

## What to watch during the launch window

Keep four tabs open:

1. **Plausible / Umami dashboard** (D5) — source attribution, time on
   page, demo CTA click-through.
2. **GitHub repo** — stars counter, new issues, the Show HN comments
   thread.
3. **Render dashboard** — CPU / memory / restarts on the demo service.
4. **The demo URL itself**, refreshed every ~15 min by hand. If it
   responds slowly *to you*, it's responding slowly to a HN visitor.

Optional:
- BetterStack status page (E3) if it's wired up.
- `gh pr list` and `gh issue list` for incoming contributions.

---

## "It's slow" / "It's down"

### Step 1 — confirm the symptom

```bash
# from a clean network (4G hotspot, not the same Wi-Fi as the deploy)
curl -fsS -w "\nstatus=%{http_code} time=%{time_total}s\n" \
  https://<demo-host>/auth/session
```

If `status=200` and `time<2s`: the user's browser / network is the
problem, not yours. Reply on HN/Reddit with "looks fine on my end,
mind sharing the exact URL + a screenshot?"

If `time` is high or status is non-200: continue.

### Step 2 — check Render

- Render dashboard → service → **Events** tab. Look for restarts,
  `OOMKilled`, deploy in progress.
- **Logs** tab. Search for `WARNING` and `Error`. If you see
  `WARNING: Using default session secret`, **the deploy lost its env
  var** — set `SESSION_SECRET` again and redeploy. (In production the
  app should refuse to boot in this case; if you see it running with
  the warning, you're on a non-production `NODE_ENV`.)

### Step 3 — rate-limit harder

If a single source is hammering the demo:

```bash
# in src/server.js, lower the api limiter's max from 60 to 20:
#   createRateLimiter({ name: "api", windowMs: 60_000, max: 20, ... })
# and the auth limiter from 20 to 5.
```

Commit, push, Render auto-deploys. Confirm with the curl-loop above.

### Step 4 — last-resort static fallback

If the Node service is on fire and you need to keep the HN front page
clickable for the next 30 min while you fix it:

- Render dashboard → service → **Settings** → put the service on
  maintenance (or scale to zero).
- Cloudflare (E2, if wired up) → cache rule → serve `public/maintenance.html`
  as a static fallback. Edit the page to link the HN/Reddit comments
  thread if you want, or leave it as-is — the GitHub link is the
  important one.

---

## "I'm getting flagged for X" (HN / Reddit moderation)

| Symptom                                     | Action                                                                      |
|---------------------------------------------|------------------------------------------------------------------------------|
| "looks like spam" / `[dead]` on HN          | Email `hn@ycombinator.com` with the post URL, ask for vouch. Stay polite.    |
| Reddit auto-removes for "low karma"         | Post in r/test first to age the account, then re-submit later in the day.    |
| Subreddit-specific "no self-promo"          | Reframe as a question / problem-first post, not a launch.                    |
| "is this AI-generated?" (meta-criticism)    | Reply once with the public commit history + your handle. Don't argue twice.  |

---

## "Someone found a security issue"

If the report comes via the `SECURITY.md` private channel
(`garniel6@gmail.com`):

1. **Acknowledge within 48h** even if you can't fix it that day. The
   policy promises this.
2. **Don't patch in public** — hot-fix in a private branch, then push
   the fix and the disclosure together.
3. **If it's exploitable on the demo, take the demo down first**
   (Render → maintenance), then fix.
4. Update `SECURITY.md` "Known accepted gaps" if the issue is in fact
   intentional and you can defend it; otherwise patch and add a
   regression check to `scripts/security-audit.mjs` if possible.

If the report comes via a public GitHub issue: thank the reporter,
**immediately** lock the issue or convert to a private security
advisory, and continue as above.

---

## "The LLM bill is climbing"

Currently no LLM is in the loop (B2 deferred), so this section is
**theoretical** until B2 ships. When it does:

- Daily cap lives in `src/core/rateLimit.js` alongside the per-IP
  buckets (E1's deferred half).
- Kill switch: env var `MOCK_LLM_DISABLED=1` — falls back to the
  pre-canned narration. Set it on Render and redeploy; takes ~30 sec.

---

## Rollback

Render auto-deploys from `main`. To roll back:

```bash
# find the last known-good commit on main
git log --format='%h %s' main | head -10

# revert
git revert <bad-sha> --no-edit
git push origin main
```

Render picks up the new push and deploys within ~3 min. **Don't force-push
to `main` to roll back** — keep history honest, the audit narrative
depends on it.

---

## Contacts

- **Render** — dashboard support chat (top-right "?" icon). Free-tier
  response is best-effort; paid-tier is faster.
- **Cloudflare** — community forum + dashboard chat.
- **Domain registrar** — depends on which one Lionel uses; note it here
  before launch so you don't have to look it up under stress.
- **HN moderators** — `hn@ycombinator.com`.

---

## After the launch — first 24h

- Reply to **every** HN top-level comment in the first 6h, even if just
  with "good point, tracking in #N". Engagement is the rank signal.
- Pin any issue that gets opened more than twice (likely a real bug).
- Take a screenshot of the Plausible dashboard at T+24h for the
  retrospective.
- Update `docs/maintainer-todo.md` and `docs/launch-strategy.md` with
  whatever the traction signals say about the Phase 3 / Phase 4 gates.

---

## How agents update this file

- A new manual lever (env var, kill switch, rate-limit knob) ships?
  Add it to the relevant section with the file path / line number.
- A failure mode you saw during a soft launch isn't covered? Add it to
  "It's slow / It's down" or to a new section.
- Don't add long prose. Each section should fit on one screen.
