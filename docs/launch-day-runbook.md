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
- [ ] **`SESSION_SECRET` is real on the deploy target** (Container App
      secret value, not the placeholder). The app refuses to boot in
      production otherwise — `src/config.js` throws.
- [ ] **`minReplicas=1` for launch week** in Container Apps (avoid cold
      starts during spikes). Can be rolled back to 0 after launch.
- [ ] **Health endpoints green**:
      - `curl -fsS https://<demo-host>/healthz`
      - `curl -fsS https://<demo-host>/auth/session`
- [ ] **AI endpoint check (if `AI_PROVIDER=azure-foundry`)**:
      `curl -fsS https://<demo-host>/api/ai/ping`
- [ ] **Rate limits known and tested**: `api` 60/min, `auth` 20/min,
      both per-IP. See `src/server.js:83-98`. Hit the demo with
      `for i in {1..70}; do curl -s -o /dev/null -w "%{http_code}\n" \
      https://<demo-host>/dashboard/overview?range=today; done` — expect a
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
3. **Azure Container Apps** — CPU / memory / restarts on `ca-keren-analytics`.
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

### Step 2 — check Azure Container Apps

- Portal → Container App `ca-keren-analytics` → Revisions: look for
  restarts / failing revision health.
- CLI logs:
  ```bash
  az containerapp logs show -n ca-keren-analytics -g keren-analytics-prod --tail 200
  ```
- If you see `SESSION_SECRET is required in production`, set the
  Container App secret and redeploy.

### Step 3 — rate-limit harder

If a single source is hammering the demo:

```bash
# in src/server.js, lower the api limiter's max from 60 to 20:
#   createRateLimiter({ name: "api", windowMs: 60_000, max: 20, ... })
# and the auth limiter from 20 to 5.
```

Commit, push, GitHub Actions deploys (`deploy-azure.yml`). Confirm with
the curl-loop above.

### Step 4 — last-resort static fallback

If the Node service is on fire and you need to keep the HN front page
clickable for the next 30 min while you fix it:

- Azure Container Apps → set `minReplicas=0` or route traffic to a
  static fallback revision while you recover.
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
   (Container App scale-to-zero), then fix.
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
- Kill switch: set `AI_PROVIDER=none` on the Container App and redeploy.

---

## Rollback

Deploys run from `.github/workflows/deploy-azure.yml`. To roll back:

```bash
# find the last known-good commit on main
git log --format='%h %s' main | head -10

# revert
git revert <bad-sha> --no-edit
git push origin main
```

GitHub Actions picks up the new push and deploys within a few minutes.
**Don't force-push
to `main` to roll back** — keep history honest, the audit narrative
depends on it.

---

## Contacts

- **Azure support** — Portal support center + `az` CLI diagnostics.
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
