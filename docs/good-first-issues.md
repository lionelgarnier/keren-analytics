# Good first issues

Starter tasks for new contributors, anchored in real files. Each one is small,
self-contained, and respects the invariants in [`CLAUDE.md`](../CLAUDE.md) — no
refactors required. They're ordered roughly easiest → meatiest.

Before you start: read [`ARCHITECTURE.md`](../ARCHITECTURE.md) for the lay of
the land and [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the dev loop
(`npm install && npm run dev`, mock mode, no Azure account needed). Comment on
the matching GitHub issue to claim it so two people don't pick up the same one.

Every task is verified the same way: **`npm test` and `npm run audit:security`
stay green**, plus the per-task acceptance criteria below.

---

## 1. Add a test for the `/healthz` endpoint

- **Level:** beginner · **Estimate:** ~30 min
- **Why:** `/healthz` (`src/server.js`) returns
  `{ ok: true, mode, aiProvider }` and is the liveness probe the container uses,
  but it has no test — a regression in its shape would ship silently.
- **Files:** `tests/api.test.js`
- **What to do:** Add a `supertest` case that `GET /healthz`, expects `200`, and
  asserts the body has `ok === true` and a `mode` field. Copy the existing
  request-setup pattern at the top of `tests/api.test.js`.
- **Acceptance:**
  - New test passes and fails if the response shape changes.
  - No other test affected.

## 2. Cover `/recommendations` — both branches

- **Level:** beginner · **Estimate:** ~1 h
- **Why:** `GET /recommendations` (`src/server.js`) has two paths: `409
  READINESS_NOT_CHECKED` when no readiness report exists yet, and a `200` with
  `{ recommendations, readinessScore }` once it does. Neither is covered by an
  API test.
- **Files:** `tests/api.test.js`
- **What to do:** Add two cases — one hitting the endpoint before any scan (expect
  `409` + the error code), one after the existing scan flow the other tests use
  (expect `200` + a non-empty `recommendations` array and a `readinessScore`).
  The setup-scan sequence is already demonstrated in the file
  (`GET /auth/login` → `/azure/discover` → `POST /api/setup/scan`).
- **Acceptance:**
  - Both branches asserted.
  - Test reuses the existing mock-auth helper rather than inventing a new one.

## 3. Document each KQL template with a one-line header

- **Level:** beginner · **Estimate:** ~1 h
- **Why:** `kql/` holds 26 templates. A newcomer opening
  `kql/peak-hours.kql` or `kql/url-parameters.kql` has to reverse-engineer what
  each returns. A single comment line per file makes the directory browsable.
- **Files:** every `kql/*.kql` that lacks one (KQL line comments are `//`)
- **What to do:** Add a one-line `// <what this query returns and for which
  view>` at the top of each template. Keep it factual — read the `print` /
  `project` columns to describe the output. Don't change any query logic.
- **Acceptance:**
  - Every template starts with a one-line comment.
  - `npm test` (including `tests/kql.test.js` render tests) still passes —
    comments must not break substitution.

## 4. Detect more frontend stacks in the LLM prompt generator

- **Level:** beginner–intermediate · **Estimate:** ~1–1.5 h
- **Why:** `src/core/promptGenerator.js` tailors the copy-paste "fix your
  telemetry" prompts to the detected stack. `detectStack()` recognizes React,
  Angular, Vue, Node, .NET, Python, Java — but misses common ones like
  **SvelteKit, Remix, Astro, Next.js** (Next currently folds into React, which
  is close but loses the App Router nuance).
- **Files:** `src/core/promptGenerator.js` (`STACK_HINTS`, `detectStack`),
  `tests/promptGenerator.test.js`
- **What to do:** Add entries to `STACK_HINTS` and matching keyword branches in
  `detectStack()` for at least two new frameworks, with the correct App Insights
  SDK hint. Add a test asserting `detectStack` returns the new key when the
  custom-dimension keys contain the framework name.
- **Acceptance:**
  - `detectStack` returns the new keys for representative inputs.
  - Generated prompts still render (no template references a missing
    `stack.sdk`/`stack.name`).
  - New test covers at least one added framework.

## 5. Add a "low-signal" mock scenario to show off the Readiness tab

- **Level:** intermediate · **Estimate:** ~1.5 h
- **Why:** The default mock dataset (`src/providers/azure/mockData.js`) reports
  every readiness signal present, so the demo always scores an "A" and the
  Readiness tab + LLM prompt cards never get to shine. A toggle that drops a few
  signals makes the most distinctive feature demoable. Mirrors the existing
  `MOCK_RESOURCES=multiple` toggle pattern.
- **Files:** `src/providers/azure/mockData.js` (the `readiness` rows around
  L554), `src/providers/azure/mockClient.js`, `.env.example` (document the new
  env var)
- **What to do:** Add an opt-in env toggle (e.g. `MOCK_READINESS=partial`) that
  zeros out a couple of signal counts — for example `geoCount`,
  `browserTimingsCount`, and `userAuthCount` — so `buildReadinessReport`
  (`src/core/readiness.js`) marks them missing/degraded and the score drops
  below 100. Default behaviour (full signals) must be unchanged.
- **Acceptance:**
  - With the toggle set, `/readiness` shows missing signals and the readiness
    score is `< 100` with matching prompt cards.
  - With the toggle unset, output is byte-for-byte the same as today (tests
    unaffected).
  - The new var is documented in `.env.example`.

## 6. Complete the ARIA tab pattern + keyboard nav on the dashboard sub-tabs

- **Level:** intermediate · **Estimate:** ~2 h
- **Why:** The Marketing / Technical / Readiness sub-tabs
  (`public/index.html` ~L622) already have `role="tablist"`/`role="tab"` and
  `aria-selected`, but the pattern is incomplete: the panels aren't wired with
  `role="tabpanel"` + `aria-labelledby`/`aria-controls`, and there's no
  arrow-key navigation. Keyboard and screen-reader users can't move between
  views the way the [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
  expects.
- **Files:** `public/index.html` (tab buttons + the `#tab-*` panels),
  `public/app.js` (the tab-switch handler), `public/styles.css` if a focus ring
  is missing
- **What to do:** Give each tab an `id` and `aria-controls` pointing at its
  panel; give each `#tab-marketing/technical/readiness` panel
  `role="tabpanel"` + `aria-labelledby`; manage `tabindex` (roving) and handle
  Left/Right/Home/End arrow keys in the switch handler. Keep the existing
  `data-tab` switching working.
- **Acceptance:**
  - Tabs are reachable and operable by keyboard alone (arrow keys move,
    Enter/Space activate), with a visible focus ring.
  - `aria-selected` and panel visibility stay in sync.
  - No visual regression in the default (mouse) flow.

## 7. Add a cohort / retention KQL template (+ render test)

- **Level:** intermediate · **Estimate:** ~1.5 h
- **Why:** `docs/backlog/adoption-drivers.md` flags a classic acquisition cohort
  table as a high-ROI, "~30 lines of KQL" addition. This issue lands just the
  query template + its render test; wiring it into a dashboard card is a
  follow-up so the scope stays bounded.
- **Files:** `kql/cohort-retention.kql` (new), `tests/kql.test.js`
- **What to do:** Write a template that buckets users by first-seen week and
  computes week-N return rates, using `{{userIdColumn}}` /
  `{{timeStart}}`/`{{timeEnd}}` substitution exactly like the existing templates
  (look at `kql/sessions.kql` and `kql/daily-trend.kql` for the placeholder
  conventions — never inline a tenant identifier). Add a render test asserting
  the template loads and all placeholders are substituted.
- **Acceptance:**
  - `loadKqlTemplate("cohort-retention")` renders with no leftover `{{...}}`.
  - Render test added to `tests/kql.test.js` and passing.
  - No tenant identifier is string-concatenated — substitution only.

## 8. Add an `exceptions` (error-tracking) readiness signal

- **Level:** intermediate · **Estimate:** ~2–3 h (the "small feature" one)
- **Why:** The readiness score covers page views, requests, sessions, identity,
  device, geo, and frontend perf — but **not** whether the app reports
  exceptions, which is one of the first things a technical user wants. This is a
  clean end-to-end tour of the readiness pipeline.
- **Files:** `kql/readiness-probes.kql` (add an `exceptionsCount` scalar +
  `print` column), `src/core/readiness.js` (derive the signal),
  `src/core/readinessScore.js` (add a `SIGNAL_WEIGHTS` entry),
  `src/core/recommendations.js` (add an action), `src/core/promptGenerator.js`
  (add a prompt template + label), `src/providers/azure/mockData.js` (add a mock
  count so the demo populates it), and the matching tests
  (`tests/readiness.test.js`, `tests/readinessScore.test.js`,
  `tests/promptGenerator.test.js`)
- **What to do:** Follow the existing `geo` / `browserTimings` signal end to end:
  probe count → boolean signal → weighted points → recommendation →
  copy-paste LLM prompt. Pick a modest weight that keeps the max score at 100
  (you'll need to rebalance, or document the new max — discuss in the issue
  first). Keep mock parity: the mock readiness row must include the new count.
- **Acceptance:**
  - A resource with no exceptions telemetry shows the signal missing, with a
    recommendation and a generated prompt.
  - Both score branches (present / absent) covered in
    `tests/readinessScore.test.js`.
  - `tests/readiness.test.js` and `tests/promptGenerator.test.js` updated.
  - Mock client still parity-matches the real probe shape.

---

## Bigger than a first issue?

If one of these grows past its estimate, that's a signal to split it or open a
Discussion before going further — see the scope guidance in
[`CONTRIBUTING.md`](../CONTRIBUTING.md) and the deliberately-deferred work under
"Known gaps" in [`CLAUDE.md`](../CLAUDE.md) (Phase 3 persistence, frontend
bundling, multi-cloud — please don't fix these opportunistically).
