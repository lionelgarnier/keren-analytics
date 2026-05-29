# Kickoff — Implement the Dashboard D v2 redesign

You're picking up a visual + interactive redesign of the **dashboard** in this repo (`/dashboard/:service`, currently served by `public/index.html` + `public/app.js`). The design direction is locked. Your job is to implement it without changing the data layer (KQL, scoring, AI mapping, server endpoints, payload shapes — all stay as-is).

Read this entire file before writing code. The handoff folder is at `handoff-dashboard/` in the repo root.

This work **builds on top of** the D v2 implementation already shipped for `/services` and `/setup` (`handoff-d2/`). You will reuse the same topbar, the same page-header pattern, the same persistent command bar, the same token system. The dashboard adds: sub-tabs, KPI cards (two variants), insights chips, a small set of chart panels (line / table / heatmap / donut / funnel / sessions / score gauge / signal breakdown), and **interactivity primitives** (tooltips, filter chips, ⌘K, drill drawer).

---

## 1 · What this is

The dashboard is the screen the user lands on after `/setup` completes for a service. Three tabs (Marketing / Technical / Readiness) each hold ~5–8 panels. Today they exist with the legacy chrome (`.kpi-card` / `.panel` / `.tab` / `.navbar`). The redesign keeps every panel's content but rewrites the chrome and the structural moves around them:

1. **Single source of header.** Same `.d2-topbar` + `.d2-pageheader` + persistent `.d2-cmdbar` as `/services` and `/setup`. The dashboard sits in the same operator-console world.
2. **Sub-tabs under the page header.** Mono labels (`Marketing 12` / `Technical 6` / `Readiness 71/100`) with count chips. Active state: underline + count chip in accent.
3. **AI narration sits between the header and the KPIs** — editorial card (Variation A, my pick) with a rounded accent tag, paragraph copy, mono meta line. Or condensed strip (Variation B, alternative).
4. **KPI cards — two variants:**
   - **A · Editorial.** Dense card (label · big number · delta inline · `vs prev 7d` mono compare). No per-card sparkline.
   - **B · Console.** Each card carries its own surface-2 sparkline panel (label + delta head, big number, sparkline below).
   - The chosen variation is **A**. B is documented in the reference HTML for future toggling.
5. **Time range** moves to a segmented control on the right of the page header (`Today / 7d / 30d`), echoed in the command bar scope.
6. **Charts and tables** all use the same `.dash-panel` shell. Trend = inline SVG with grid + fill + line. Tables = `.dash-table` with bar columns. Heatmap = pure CSS grid. Donuts = SVG ring. Funnel = stacked bars with drop-off meta.
7. **Interactivity is part of the design.** Five canonical patterns: hover tooltip, click → filter chip + re-scope, ⌘K palette, click KPI → drill drawer, panel-level streaming/empty/error states. See INTERACTIONS.md.

---

## 2 · The handoff folder (your source of truth)

```
handoff-dashboard/
├── KICKOFF.md                    ← this file
├── README.md                     ← short index of what's here
├── STYLE-GUIDE.md                ← visual spec, token mapping, per-component rules
├── INTERACTIONS.md               ← the 5 interaction patterns, in detail
├── dashboard-snippets.css        ← copy-paste-ready CSS, mapped to project tokens
├── dashboard-reference.html      ← standalone visual reference, all 10 boards. Open in a browser.
├── screenshots/
│   ├── 01-marketing-light.png        ← Marketing tab · Variation A · light
│   ├── 02-marketing-dark.png         ← Marketing tab · Variation A · dark
│   ├── 03-marketing-variant-b.png    ← Marketing tab · Variation B (alternate KPI treatment)
│   ├── 04-technical-light.png        ← Technical tab
│   ├── 05-readiness-light.png        ← Readiness tab
│   ├── 06-marketing-mobile.png       ← Marketing tab · mobile width 390px
│   ├── 07-interaction-hover-trend.png    ← Interaction · hover on a chart
│   ├── 08-interaction-filter.png         ← Interaction · filter applied
│   ├── 09-interaction-cmdk.png           ← Interaction · ⌘K palette
│   └── 10-interaction-drill.png          ← Interaction · click KPI → drill drawer
└── reference-jsx/                ← React source for the design (layout + copy reference only).
                                    Do NOT port to the codebase, which is vanilla JS.
    ├── screens-data.jsx                ← RESOURCES / PANELS / Spark helper, used by Frame chrome
    ├── screens-dash-data.jsx           ← All dashboard mock data (KPIs, top pages, geo, etc.)
    ├── screens-dir-d2.jsx              ← TopbarD2 / CommandBarD2 (from handoff-d2)
    ├── screens-dir-dash-shared.jsx     ← TrendChart, DonutChart, PeakHoursHeatmap, KPI cards A & B
    ├── screens-dir-dash-panels.jsx     ← Every panel: TopPages, Geo, Funnel, Sessions, ScoreHero…
    ├── screens-dir-dash-interactions.jsx ← Overlays: tooltip, filter chip bar, ⌘K, drill drawer
    ├── screens-dir-dash.jsx            ← DashboardD2 root that composes the three tabs
    ├── screens.css                     ← Token definitions (`.kr-screen[data-theme=…]`)
    ├── screens-d-e.css                 ← Topbar / pageheader / status pill / progress / find-improve (reused from D v2)
    ├── screens-d2.css                  ← D v2 specifics (tree meta, command bar, breadcrumb)
    └── screens-dash.css                ← All dashboard-specific styles (sub-tabs, KPIs, panels, interactions)
```

**Pin the screenshots open while you work.** Open `dashboard-reference.html` in a browser and inspect any element with DevTools. The screenshots show the same component tree at 909 CSS-px viewport width (some right-edge content is clipped) — `dashboard-reference.html` is the truth when in doubt.

---

## 3 · Scope — what changes, what doesn't

### Changes (visual / structural)

- `public/index.html` — the `#dashboardPanel` section. Replace the legacy `.tab-toolbar` + `.tab-bar` + KPI grid + panel structure with the new chrome (D v2 topbar / pageheader / sub-tabs / dash panels / command bar). Keep the IDs the existing JS targets (`#kpiVisitors`, `#topPagesBody`, `#dailyTrendChart`, `#geoMap`, etc.).
- `public/app.js` — only the parts that build DOM inside `#dashboardPanel`. Render functions stay (`renderDashboard`, `renderInsights`, `applyCard`, `renderKpis`, etc.); the elements they emit change. The KQL fetch, NDJSON streaming (`loadDashboardStream`), per-card error overlay, time-range listener, and filter logic all stay intact.
- `public/styles.css` — append the rules from `dashboard-snippets.css` at the end of the file under a clearly commented section `/* ===== Dashboard D v2 ===== */`. Keep the legacy `.kpi-card` / `.panel` / `.tab-bar` rules in place (they're still referenced); the new `.dash-*` rules sit alongside.
- `public/promptActionButton.js` — wire it into the new `.dash-improve-cta` button on the Readiness tab (replacing the legacy `.prompt-card` button surface).

### Stays untouched

- The server (`src/server.js`, anything under `src/`). Endpoints `/dashboard/overview`, `/preview/dashboard`, `/api/setup/*` keep their current request/response shapes.
- The NDJSON per-card streaming protocol in `loadDashboardStream`. The new markup must still expose the `[data-card="<name>"]` attribute on every panel so the existing per-card error overlay + streaming pipeline keeps working.
- Chart rendering libraries. `Chart.js` for `dailyTrendChart`, `browserTimingsChart`, `geoChart`, `referrerChart`, `browserChart`, `osChart`, `deviceChart`. Leaflet for `geoMap`. Keep them — only re-style their containers and re-skin the legends/axes via Chart.js options to match D v2 colors.
- The readiness scoring engine (`src/core/readinessScore.js`) and the prompt template engine (`src/ai/promptGenerator.js`). Same payloads in, new markup out.
- The dashboard route (`/dashboard/:service`), tab routing (`router.push({page:"dashboard", tab})`), and the `applyCard` per-card streaming logic. Same code path.
- The setup wizard (`/setup`) — already on D v2.

### Explicitly out of scope

- **Wiring the keyboard shortcuts to real handlers.** Show the kbd chips in the command bar and in ⌘K — but the actual `↑↓ ↵ ⌘K ⌘E R 1 7 30` listeners are a follow-up TODO. The visual affordance ships now.
- **Implementing the drill drawer's backend.** The drawer is real interactive UI but its data can come from the existing payload (no new endpoint). Add a TODO if a section needs a new sub-query.
- **Removing legacy CSS.** Leave the old `.kpi-card` / `.panel` rules in place. Separate PR.
- **Adding new fonts.** Stick with var(--font) (Inter) + JetBrains Mono. Geist (used in the reference) renders very close to Inter.
- **Real tooltip / cmdk libraries.** Don't add `cmdk`, `radix-popover`, `tippy.js`. The reference shows everything as pure HTML/CSS — keep it that way. Tooltip positioning can be done with a 30-line absolute-positioned div pinned to the hovered SVG node.

---

## 4 · How to execute

Work tab by tab. Verify each one against its screenshot before moving on.

### Step 1 · Append the CSS

1. Open `handoff-dashboard/dashboard-snippets.css` and `public/styles.css` side by side.
2. Append the entire snippets file to the end of `styles.css` under:
   ```css
   /* ============================================================
      Dashboard D v2
      Specs: handoff-dashboard/STYLE-GUIDE.md
      Reference: handoff-dashboard/dashboard-reference.html
      ============================================================ */
   ```
3. Boot the app (`npm run dev`) — no visual change yet because no element carries `.dash-*` classes yet.

### Step 2 · Wrap the dashboard in the D v2 frame

The `/dashboard/:service` route currently renders the legacy `.navbar`. Switch to the D v2 chrome already proven on `/services`:

1. **Topbar.** Same `.d2-topbar` you already use on `/services` and `/setup`. Active tab: `Services` (the dashboard is reached by clicking a service — the user is "inside" Services). Add a "live" / "synced" tag in the breadcrumb if it isn't there yet.
2. **Page header** (`.d2-pageheader`). Breadcrumb: `vikl.fr / services / <serviceName> / <activeTab>` with the active tab in `.d2-breadcrumb-here` and a green `live` tag at the end. h1: the service name (e.g. `vikl-web-prd`), 36 px on desktop. Sub: a one-line description per active tab (see screenshots). Right column: `.dash-range` segmented (`Today / 7d / 30d`) + ghost `Export` button.
3. **Sub-tabs** (`.dash-subtabs`). Replace the legacy `.tab-bar`. Three tabs with mono labels and count chips. Right-aligned `.dash-subtab-meta` shows `● synced · HH:MM:SS`.
4. **Command bar** (`.d2-cmdbar`). Same as on `/services` but adapted: left side = `synced · HH:MM:SS · <scope>` where scope is `marketing · <serviceName> · 7d` (or filter context when a filter is on). Right side = kbd cells `1 7 30 range`, `⌘E export`, `⌘K filter`, `R refresh`. **No primary CTA** on the dashboard — it's a viewing surface.

Verify against `01-marketing-light.png`.

### Step 3 · The Marketing tab

1. **AI narration card** (`.dash-narr-a`). Wide editorial card under the sub-tabs. Tag chip on the left (`● AI · gpt-4.1`), body paragraph with `<strong>` highlights, meta line below (`scanned HH:MM:SS · scope · last 7 days · via azure-foundry`). Driven by the existing `narration` payload.
2. **KPI grid** (`.dash-kpis` / `.dash-kpi-a`). 4-col grid (`.dash-kpis--desktop`). Each card: mono uppercase label, value + unit + delta-pill row, `vs · <compare>` mono compare line at the bottom. Delta pill colors: `--success-bg` for `is-up`, `--warning-bg` for `is-down`. Wire to `dashboard.kpis` exactly as today (just replace the markup builder).
3. **Insights chips** (`.dash-insights`). 3-col row (desktop) / stacked (mobile). Each chip = colored dot + short sentence. Colors: ok (success), up (accent), warn (warning). Driven by the existing `renderInsights(dashboard)` — same logic, new shell.
4. **Traffic trend** (`.dash-panel` + the existing Chart.js canvas `#dailyTrendChart`). Restyle the Chart.js options to use `--accent` for the line, `--accent-bg` (with low alpha) for the fill, monospace 10.5px for axis labels. The panel head carries `<h3>Traffic · last 7 days</h3>` + a mono meta on the right.
5. **Audience section divider** (`.dash-section-h`). Mono uppercase rule with a hair-line `flex: 1 + 1px height` line on the right. Use this between groups (Audience → Engagement → Acquisition → Tech).
6. **Top pages** (`.dash-table`). Three columns: Path (mono) / Views (mono num) / Share (bar + pct). Keep `#topPagesTable` ID for sorting + filter toggle.
7. **Geo** (`.dash-geo`). Two-column on desktop: left = `#geoMap` (existing Leaflet container, restyled — accent-soft tile glow + grid overlay), right = country table with bar column. The existing map/chart toggle stays (chart uses `.dash-table`).
8. **Peak hours** (`.dash-peaks`). CSS grid: 24-column heatmap × 7 rows (Mon→Sun), each cell `aspect-ratio: 1` with opacity tied to the value (0.12 + value * 0.78). Day labels in the left gutter, hour marks in the foot.
9. **Conversion funnel** (`.dash-funnel`). Stacked horizontal bars, each row: step label + count + bar with accent fill + drop-off line below in warning color.
10. **Campaigns** (`.dash-table` again, six columns: Source / Medium / Campaign / Visitors / Sessions / Share-bar).
11. **Browser / OS / Device** (`.dash-donut`). Three side-by-side `CategoryDonut` panels. SVG ring + legend with colored swatches + pct.

Verify against `01-marketing-light.png` and `02-marketing-dark.png`.

### Step 4 · The Technical tab

1. Same narration (variant of copy: "Backend response stable at p50… p95 ticked up 3.4%…").
2. **Tech KPIs** — same `.dash-kpi-a` layout, 4 metrics (Avg / P95 / Error rate / Frontend avg).
3. **Frontend performance + Slow endpoints** in a `.dash-grid-2--desktop`. Performance = Chart.js area (existing `browserTimingsChart`). Slow endpoints = `.dash-table` with 6 columns; color P95 in `--warning` when >1000 ms; Err% in warning when >1.0%.
4. **Session timelines** (`.dash-sessions`). One row per session, each row showing id + meta + ok/bad pill, then a mono step chain (`/` → `/pricing` → … with `→` separators). Failed steps (`✕ 500`) carry `.dash-session-step.is-error` (warning tint).

Verify against `04-technical-light.png`.

### Step 5 · The Readiness tab

1. Narration.
2. **Score hero** (`.dash-score-hero`). Left: 130px ring with `success → accent` gradient stroke (use `<linearGradient id="dashScoreGrad">` — already in the JSX reference). Center text inside the ring: `<big score>` + `/100 · <letterGrade>` mono. Right column: bold grade headline ("Strong foundation · 2 signals away…") + descriptive paragraph + 10-cell bar (`<span class="dash-score-bar-cell is-on-ok">` for filled, `is-off` for empty) + mono foot (`0 ... N of 100 ... 100`).
3. **Signal breakdown** (`.dash-signals` / `.dash-signal`). 2-col grid. One row per signal. Score in `score / weight` format. Missing signals get `--miss` modifier (warning-soft bg, no border) and a `missing` tag in the sub-line.
4. **Improve your coverage** — re-uses `.d-find-improve` from the existing D v2 snippets (the same pattern already in `dashboard-snippets.css` for the setup-findings page). Three rows, one per missing signal, each with field tag + title + desc + `unlocks` line + `⌘ Use prompt` CTA. **The CTA must wire to the existing `promptActionButton.js`** — give the button the existing `data-prompt` attribute and the split-button takes over.

Verify against `05-readiness-light.png`.

### Step 6 · Interactivity primitives

See `INTERACTIONS.md` for the full spec. Implement them in this order:

1. **Tooltip on the trend chart.** Mouse-move handler on the Chart.js canvas → compute the nearest data point → position an absolutely-positioned `.dash-tip` over the chart. Use Chart.js' existing tooltip callbacks but render into our DOM (`external` tooltip mode).
2. **Filter chip bar.** When a row, segment, or pin is clicked, push a chip into a `.dash-filterbar` rendered below the sub-tabs. Filter logic already exists in `app.js` — replace the legacy chip UI with `.dash-filterchip`. Add `.dash-panel-filterbadge` pills inside any panel whose data is re-scoped.
3. **⌘K command palette.** Mount on document-level `keydown` (`⌘K` or `Ctrl K`). Modal with `.dash-cmdk-scrim` + `.dash-cmdk`. Items grouped by Pages / Campaigns / Jump to. Selecting an item routes to the same filter or tab change as the legacy filter UI.
4. **Drill drawer.** Click a KPI card → `.dash-drill` slides in from the right (520 px). The drawer is built from the SAME data already loaded for the dashboard — no new endpoint. Sections: Trend (mini Chart.js), Top sources (table), By hour (heatmap reused), Top entry pages (table).
5. **Panel-level loading / empty / error.** Already wired in `applyCard` via the per-card streaming protocol — keep that intact. Just style the loading skeleton with `.dash-panel` shell + `.dash-panel-skeleton-row` (small accent shimmer; not in the reference HTML, build it from `--border-light` + a 1.6s `linear-gradient` keyframe).

Verify against `07-interaction-hover-trend.png`, `08-interaction-filter.png`, `09-interaction-cmdk.png`, `10-interaction-drill.png`.

### Step 7 · Smoke test + commit

```bash
npm test                # all tests should still pass — dashboard redesign is presentation-only
npm run dev             # then click through a ready service → marketing → technical → readiness
                        # test: range switch, filter via click on /pricing in Top pages, ⌘K, click on a KPI
```

Commit on a feature branch (do not push to main). Suggested commit message:

```
feat(ui): implement Dashboard D v2 redesign

Replaces the visual layer of /dashboard/:service (3 tabs, all panels)
with the operator-console design tracked in handoff-dashboard/.
Adds five interactivity primitives: chart tooltip, filter chip bar,
⌘K command palette, KPI drill drawer, panel streaming states.

Data layer unchanged — same payload shapes, same NDJSON streaming,
same Chart.js + Leaflet renderers, same readiness scoring.
Old .kpi-card / .panel / .tab-* rules left in place for now.
```

---

## 5 · Acceptance checklist

Before opening a PR:

- [ ] `/dashboard/:service` renders the D v2 topbar + pageheader + sub-tabs + command bar matching `01-marketing-light.png`.
- [ ] Light + dark parity (existing toggle), no per-component dark overrides needed.
- [ ] KPI cards (Variation A) render with mono label, big number, delta pill, mono compare line.
- [ ] Insights chips render in 3-col on desktop with ok/up/warn dot variants.
- [ ] Trend chart renders with accent line + accent-soft fill + mono axis labels.
- [ ] Top pages table matches the screenshot (Path mono / Views num-mono / Share bar+pct).
- [ ] Geo: Leaflet map renders inside `.dash-geo-map`; country table is on the right at desktop, stacked on mobile.
- [ ] Peak hours heatmap renders as 7×24 CSS grid with opacity-scaled cells.
- [ ] Funnel renders with drop-off lines below each step.
- [ ] Donut panels (Browser / OS / Device) render as SVG ring + legend.
- [ ] Technical tab matches `04-technical-light.png`.
- [ ] Readiness tab matches `05-readiness-light.png` — gauge gradient + signal breakdown + improve list.
- [ ] Mobile (390 px width) — sub-tabs scroll horizontally; KPI grid drops to 2-col; panels stack.
- [ ] ⌘K opens the palette; pressing `esc` closes it.
- [ ] Clicking a Top page row pushes a chip into `.dash-filterbar` and re-scopes the KPIs + table.
- [ ] Hovering the trend chart shows the `.dash-tip` tooltip.
- [ ] Clicking a KPI card opens the drill drawer.
- [ ] "Use prompt" buttons on the Readiness tab still trigger `promptActionButton.js`.
- [ ] No regressions in `/services` or `/setup` (they should be byte-identical to main).
- [ ] `npm test` passes.

---

## 6 · Notes, gotchas, things to ask if unclear

- **`[data-card]` attribute is sacred.** Every panel must carry the same `data-card="<name>"` attribute it has today — the per-card NDJSON streaming + per-card error overlay key off that. The list of card names is in `app.js`'s `cardDataFromDashboard` switch.
- **Chart.js theme.** When you re-style Chart.js options, read tokens via `getComputedStyle(document.documentElement).getPropertyValue('--accent')` at render time. Don't hard-code hex — light/dark must flip together with the rest of the page.
- **Leaflet map.** The accent glow on the geo map (`radial-gradient` background) is a placeholder for the design. The real map will still render tiles — that gradient won't be visible. Set `.dash-geo-map` to `background: var(--border-light)` and let Leaflet take over.
- **Currency / number formatting.** Use the same `fmtN` / `fmtPct` helpers already in `app.js`. Mono columns should be right-aligned (`text-align: right` is already on `.dash-table td.is-num`).
- **Time format.** Synced timestamp in the command bar = `HH:MM:SS` UTC. Locale-safe (`.toLocaleTimeString('en-GB', { hour12: false })`).
- **Sub-tab counts.** Marketing count = number of rendered panels (= 12 today). Technical = 6. Readiness = the score number as `71/100`. Hard-code the count for now, refresh when panels stream in.
- **The `?onboard=1` first-run banner.** Leave it alone — it sits above the sub-tabs and works fine with the new chrome.
- **Don't import the mock data.** `screens-dash-data.jsx` is reference for the design's mock values — your real data comes from `/dashboard/overview`. The reference JSX shows the SHAPE of the markup; map your real payload onto it.
- **If anything in the spec contradicts an invariant in `CLAUDE.md`,** stop and ask. Invariants win.

Good hunting.
