# Kickoff — Implement "D v2" in Keren Analytics

You're picking up a visual redesign of the **service hub** (`/services`) and **setup wizard** (`/setup`) in this repo. The design direction is locked. Your job is to implement it without changing any business logic.

Read this entire file before writing code. The handoff folder you'll be working from is in the repo at `handoff-d2/` (drop it in the project root if it isn't there already — see "Files I'm dropping into the repo" below).

---

## 1 · What "D v2" is

A polished operator-console look that replaces the current `/services` resource picker and the 3-step `/setup` wizard panels. It keeps the existing markup intent (the same data, the same steps, the same routes, the same per-resource status semantics) but rewrites the chrome around them. Three signature moves:

1. **Tree-format metadata in resource cards** (monospace `┌ ├ └` hierarchy) instead of the current icon+text rows.
2. **A persistent command bar** at the bottom of every D-v2 page showing sync status + keyboard shortcuts + a single primary CTA.
3. **A "live now" split layout** during scanning (left = live status card, right = streaming schema tree) instead of the current single vertical log.

Plus a unified page-header treatment (mono breadcrumb + 36 px h1 + sub + right-aligned action buttons) and a 4-step progress strip across the wizard.

---

## 2 · The handoff folder (your source of truth)

Everything you need is in `handoff-d2/`:

```
handoff-d2/
├── KICKOFF.md                  ← this file
├── STYLE-GUIDE.md              ← visual spec, token mapping, per-component rules
├── d2-snippets.css             ← copy-paste-ready CSS, already mapped to project tokens
├── d2-reference.html           ← standalone HTML reference, all 3 screens stacked. Open in a browser.
├── screenshots/
│   ├── 01-services-light.png
│   ├── 01-services-dark.png
│   ├── 02-scan-light.png
│   ├── 02-scan-dark.png
│   ├── 03-findings-light-top.png       (hero + gauge)
│   ├── 03-findings-light-grid.png      (cards grid)
│   └── 03-findings-dark.png
└── reference-jsx/              ← original React source for the design (for layout/copy reference only — do NOT port to the codebase, which is vanilla JS)
    ├── screens-data.jsx        (RESOURCES / PANELS / MISSING_SIGNALS / SCAN_LOG arrays + Spark helper)
    └── screens-dir-d2.jsx      (D v2 React components)
```

**Pin those screenshots open** while you work. They are the ground truth. `d2-reference.html` lets you inspect any element in DevTools without React in the way.

---

## 3 · Scope — what changes, what doesn't

### Changes (visual / structural)

- `public/setup.html` — the wizard panel markup for steps 1 (scanning) and 2 (findings).
- `public/setup.js` — only the parts that build DOM inside `scanningPanel`, `graphsGrid`, `missingSignalsList`, and the header areas. Render functions stay; the elements they emit change.
- `public/app.js` — the `renderResources()` function (around line 428) — emit the new card structure. Keep the `gotoService()` click handler and the existing data flow exactly as-is.
- `public/styles.css` — add the rules from `d2-snippets.css` at the end of the file under a clearly commented section `/* ===== D v2 — service hub + setup wizard ===== */`. Do **not** delete the existing `.resource-card-v2` / `.setup-*` rules in the same patch — leave them for now, they're still referenced by other code paths and tests. We'll remove them in a follow-up once D v2 is validated in prod.

### Stays untouched (do not modify)

- The server (`src/server.js`, anything under `src/`). Routes, payloads, `/api/setup/services`, `/api/setup/scan`, `/api/setup/validate` — same shapes.
- The state machine (`src/core/stateMachine.js`).
- Per-resource scoping invariant (`scans` + `validations` keyed by `(tenant_id, resource_id)`). See `CLAUDE.md` § "Key invariants".
- `promptActionButton.js` — the "Use prompt" split-button. Wire it into the new `.d2-find-improve-cta` button instead of the legacy one.
- `theme-init.js` — dark mode toggle still drives the existing `data-theme` attribute on `<html>`. The new CSS reads project tokens, so dark mode works for free.
- The dashboard (`/` route), the landing page, and the docs page. None of those use D v2.
- The OAuth flow, error categorization, KQL templates, AI provider plumbing. Out of scope.

### Explicitly out of scope

- Adding a new font (Geist). The design was mocked with Geist but **reuse `var(--font)` (Inter) + JetBrains Mono** which the codebase already loads. The screenshots will look slightly heavier in your build; that's fine.
- Keyboard navigation wiring. The command bar **shows** kbd hints but you don't need to wire `↑ ↓ ↵ ⌘K` yet. Mark this as a follow-up TODO if you have time.
- Removing the old CSS / cleanup. Separate PR.

---

## 4 · How to execute

Work in order. Don't batch — verify each screen visually against its screenshot before moving on.

### Step 1 · Drop the CSS in

1. Open `handoff-d2/d2-snippets.css` and `public/styles.css` side by side.
2. Append the entire contents of `d2-snippets.css` to the end of `public/styles.css` under a banner comment:
   ```css
   /* ============================================================
      D v2 — service hub + setup wizard
      Specs: handoff-d2/STYLE-GUIDE.md
      Reference: handoff-d2/d2-reference.html
      ============================================================ */
   ```
3. Boot the app (`npm run dev`) and confirm nothing broke. No new CSS rule should affect anything yet — all selectors are `.d2-*` and unused.

### Step 2 · Rebuild the services hub (`/services`)

Touches `public/app.js` `renderResources()` (~line 428), the navbar block in `public/index.html`, and possibly small layout glue in CSS.

1. **Topbar.** When the route is `/services` or `/setup`, the page should render the new `.d2-topbar` instead of the legacy `.navbar`. The cleanest way: add a body class (e.g. `body.d2-route`) toggled by the router, and switch the navbar with CSS or a conditional render. Tabs: `Services` (active on hub), `Setup`, `Audit`, `Settings`. `Audit` and `Settings` can be inert links (`href="#"`) — the design uses them as visual scaffolding only.
2. **Page header.** Replace the current "Sélectionnez une ressource" h1 area with `.d2-pageheader`:
   - Breadcrumb: `vikl.fr / services` + green "N connected" tag (computed from `services.length`).
   - h1: `Services`.
   - sub: copy from `d2-reference.html` ("4 Application Insights workspaces. Open a ready service…"). If the user is on `i18n=fr`, French translation is fine — the design is bilingual.
   - Right actions: `⌘K Filter` (ghost), `+ Connect workspace` (accent). For now these can be inert; the existing connect button flow can be wired later.
3. **Toolbar.** Replace the existing filter row with `.d2-toolbar`:
   - Chips for `All / Prod / Staging / Dev` with counts derived from each card's `detectEnvironment()` result. Wire the click handlers to filter the grid (or stub them and label as TODO).
   - The existing `#resourceSearchInput` becomes `.d2-search`. Keep its input event handler.
4. **Resource cards.** Rebuild `renderResources()` so each `<div class="d2-rescard d2-rescard--<status>">` follows the structure in `d2-reference.html` (5 regions: head / spark-wrap / tree / divider / cta). For sparkline bars, generate 22 `<span class="d2-spark-bar" style="height: …%">` elements per card. Bar heights:
   - `ready` → rising pattern, e.g. `28 + index/22 * 60 + sin-jitter`.
   - `incomplete` → spiky, e.g. `30 + abs(sin(i * 0.9)) * 60`.
   - `unconfigured` → placeholder, e.g. `[8, 12, 16]` repeating.

   The exact formulae are in `reference-jsx/screens-dir-d2.jsx` (`SparkBarsD2`). Reproduce them as a `barHeights(kind, n)` JS helper in `app.js`. Bars are layout via `display: flex; align-items: flex-end` so they're trivial pure-CSS — no canvas / SVG.
5. **Command bar.** Add `<div class="d2-cmdbar">` as the last child of the page wrapper. Scope label: `services · ${services.length} nodes`. CTA: `+ Connect workspace` (no accent on the hub).

Verify against `01-services-light.png` and `01-services-dark.png`. Toggle dark mode (existing button) and confirm both render.

### Step 3 · Rebuild the scanning step

Touches `public/setup.html` (the `#step-scanning` section) and `public/setup.js` (`initScanningLog`, narration updates).

1. **Frame.** Wrap the whole `<body>` of `setup.html` in the same `.d2-topbar` + `.d2-page-body` + `.d2-cmdbar` layout. Active tab in topbar: `Setup`.
2. **Page header.** Same `.d2-pageheader` as the hub. Breadcrumb: `vikl.fr / services / <resourceName> / setup`. h1: `Scanning telemetry`. Right actions: ghost `Re-scan` + accent `Continue →` (disabled until `findings` is reachable).
3. **Progress strip.** Replace `.setup-stepper` with `.d2-progress`. Same 4 steps (`Scanning / AI findings / Validate / Save`), with `is-active` / `is-done` / pending classes driven by `currentStep` in `setup.js`.
4. **Scan split.** Inside `#scanningPanel`, render the two cards:
   - Left: `.d2-scan-now` populated from the current narration state. Title + detail come from `SCANNING_STEPS[currentIdx]` (already exists in `setup.js`). Bottom stat strip: hard-code the 3 stats for now (`30 Dimensions`, `154 Events / 7d`, `6 Tables`) reading from the scan result when available.
   - Right: `.d2-scan-tree`. Each line is a `.d2-scan-tree-row` with glyph + text + count. Mark the in-flight row with `is-active`. Use `+ N more dimensions` truncation for the custom-dimensions block.

   `setup.js` currently calls `appendScanningLog(label, state, time)`. Adapt it to push tree rows instead of `<li>` rows. The state→glyph→count mapping is in `d2-reference.html`.
5. **Command bar.** Scope label: `setup · scanning · 0X / 05`. CTA accent button: `Continue → findings`, disabled while scanning is in progress.

Verify against `02-scan-light.png` and `02-scan-dark.png`.

### Step 4 · Rebuild the findings step

Touches `public/setup.html` (the `#step-findings` section) and `public/setup.js` (`renderFindings`, missing-signals list builder).

1. **Page header** with breadcrumb `vikl.fr / <resourceName> / findings` + a blue `AI · gpt-4.1` tag (`.d2-breadcrumb-tag.d2-breadcrumb-tag--ai`). h1: `What we can render`. Right actions: ghost `← Re-scan` + accent `Review & save →`.
2. **Progress strip** with step 01 done, step 02 active.
3. **Hero card** (`.d2-find-hero`):
   - Left column: readiness gauge. The score is already computed server-side via `readinessScore.js` — pass it through. Track fill width = `score%`.
   - Right column: the AI summary paragraph. The server returns it; render with `<strong>` around the bolded phrases the prompt schema already marks up.
4. **Section title** + counts (`5 ready · 2 to instrument`).
5. **Findings grid** (`.d2-find-grid`). One `.d2-find-card` per panel from the existing `/api/setup/findings` response. Ready cards: render an inline `<svg>` sparkline (see `reference-jsx/screens-data.jsx` `Spark` + `sparkPath` for the four shapes). Needs cards: add `--needs` modifier and render the `blocked on <code>` block with the missing field name.
6. **Improve list** (`.d2-find-improve`). One row per missing signal (existing `missingSignals` data). The "Use prompt" button must wire to **the existing `promptActionButton.js`** — just give it the existing `data-prompt` attribute and the split-button takes over.
7. **Command bar.** Scope: `setup · findings · 02 / 04`. Accent CTA: `Review & save →`.

Verify against `03-findings-light-top.png`, `03-findings-light-grid.png`, `03-findings-dark.png`.

### Step 5 · Smoke test + commit

```bash
npm test                 # all 29 tests should still pass — D v2 is presentation-only
npm run dev              # then click through /services → /setup → scanning → findings
```

Then commit on a feature branch (do **not** push to `main`). Commit message:

```
feat(ui): implement direction D v2 for /services and /setup

Replaces the visual layer of the service hub and the 3-step setup
wizard with the operator-console design tracked in handoff-d2/.
Logic, routes, state machine, and per-resource scoping all unchanged.

Old .resource-card-v2 + .setup-* rules left in place; cleanup in a
follow-up once D v2 is validated in prod.
```

---

## 5 · Acceptance checklist

Before opening a PR, every box must be ticked:

- [ ] `/services` renders 4 resource cards matching `01-services-light.png` (and dark variant).
- [ ] Cards keep their existing click → `gotoService()` behavior. Status, env, action label still come from `SERVICE_STATUS_META` + `detectEnvironment()`.
- [ ] `/setup` step 1 renders the scan split matching `02-scan-light.png`. Live narration updates the left card's title + detail.
- [ ] `/setup` step 2 renders the findings hero + grid + improve list matching `03-findings-*.png`. Readiness score and AI summary come from the existing API responses.
- [ ] "Use prompt" buttons still trigger `promptActionButton.js` (verify with one missing signal).
- [ ] Dark mode (existing toggle) flips both screens correctly without per-component dark overrides.
- [ ] `npm test` passes.
- [ ] No regressions in the dashboard (`/`) — it should look identical to `main`.
- [ ] Mobile breakpoints behave: pageheader stacks, scan split becomes 1 column, findings grid drops to 2 then 1 column, improve item stacks.
- [ ] No new dependencies in `package.json`.

---

## 6 · Notes, gotchas, and things to ask if unclear

- **Status copy is French** (`Prêt`, `Configuration incomplète`, `À configurer`). Action labels too (`Ouvrir`, `Reprendre la config`, `Configurer`). Keep them.
- **Sparkline bars** are pure CSS flexbox — don't use canvas or charting libs. The `Spark` line-chart in findings IS a tiny inline SVG (see `reference-jsx/screens-data.jsx`).
- **Mono font fallback.** Use `ui-monospace, "JetBrains Mono", monospace` everywhere mono is needed. JetBrains Mono is already loaded by `index.html`'s Google Fonts link.
- **Command bar position.** `position: sticky; bottom: 0` inside the page wrapper. If your wrapper isn't a flex column, the sticky won't pin correctly — make the wrapper `display: flex; flex-direction: column; min-height: 100vh`.
- **`box-sizing`.** The project resets `box-sizing: border-box` globally in `styles.css`. The D v2 snippets assume that — don't add a scoped reset.
- **Don't recreate the data layer.** `RESOURCES` / `PANELS` / `MISSING_SIGNALS` / `SCAN_LOG` arrays in `reference-jsx/screens-data.jsx` are **demo data** — your real data comes from `/api/setup/services`, `/api/setup/scan`, `/api/setup/findings`. Map your real payload onto the new markup; don't import the demo arrays.
- **If anything in the spec contradicts an invariant in `CLAUDE.md`,** stop and ask. The invariants win.

Good hunting.
