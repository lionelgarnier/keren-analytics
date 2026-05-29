# Dashboard D v2 — Interactivity

Five canonical interaction patterns. Same vocabulary across the surface — once a user learns one, the others come for free.

| Pattern              | Trigger                                        | Effect                                                                              |
|----------------------|------------------------------------------------|-------------------------------------------------------------------------------------|
| **Hover tooltip**    | Mouse over chart / heatmap cell / donut seg.   | Pinned `.dash-tip` card with mono numbers + optional delta + foot context line.     |
| **Filter chip**      | Click on a row / segment / pin                 | Chip appears in `.dash-filterbar`; KPIs + panels re-scope; affected panels show `● filtered` pill. |
| **⌘K palette**       | `⌘K` (or `Ctrl K`) anywhere                   | Modal palette. Groups by Pages · Campaigns · Jump to. `↑↓ ↵ esc` navigation.       |
| **Drill drawer**     | Click on a KPI card                            | Right-side panel (520 px) slides in. Trend + sources + by-hour + entry pages.       |
| **Streaming states** | NDJSON per-card load                            | Each panel has independent loading skeleton / empty state / error overlay.           |

Read alongside the screenshots in `screenshots/07-…` through `screenshots/10-…` and the corresponding artboards in `dashboard-reference.html`.

---

## 1 · Hover tooltip on the trend chart

### Visual
- Vertical dashed guide line (`.dash-trend-guide` — `stroke-dasharray: 2 3`, `opacity: 0.35`, color `--text-primary`) at the focused X position.
- Accent-ringed dot (`.dash-trend-dot` — fill `--bg`, stroke `--accent`, stroke-width 2.5, radius 5) on the line at the focused data point.
- Floating `.dash-tip` card next to the dot:
  - Head row: mono uppercase day label (e.g. `Thursday · Mar 21`).
  - One row per series (`.dash-tip-row`): label with a 8 × 2 px accent swatch + mono value.
  - Optional delta row (`vs avg 7d · +18.4 %` in `--success`).
  - Foot: mono context line (`peak hour · 14:00–15:00 · 1,180 sess`).
- The X-axis label corresponding to the focused day is bumped to `--text-primary` (others stay `--text-muted`).

### Implementation

Use Chart.js' **external tooltip** callback (do not use the built-in canvas tooltip).

```js
chart.options.plugins.tooltip = {
  enabled: false,
  external: ({ chart, tooltip }) => {
    const el = chart.canvas.parentNode.querySelector('.dash-tip')
            || createTipEl(chart.canvas.parentNode);
    if (tooltip.opacity === 0) { el.style.opacity = 0; return; }
    el.style.opacity = 1;
    // Populate head / rows / foot from tooltip.dataPoints
    // Position with caret left, clamp to chart bounds
    el.style.left = (chart.canvas.offsetLeft + tooltip.caretX - el.offsetWidth/2) + 'px';
    el.style.top  = (chart.canvas.offsetTop  + tooltip.caretY - el.offsetHeight - 14) + 'px';
  },
};
chart.options.interaction = { intersect: false, mode: 'index' };
```

`createTipEl` builds the DOM once and reuses it. Position-clamp to keep the tooltip inside the chart container. Keep the dashed guide line too — Chart.js' `verticalLine` plugin handles it cleanly. For the accent dot, use Chart.js' `pointBackgroundColor: ['transparent', …, '#fff_at_index', …]` trick to highlight the focused point.

### Where else
- **Heatmap cell** (`.dash-peaks-cell`). On hover, set `.is-focused` on the cell (outlines it with `--text-primary`); render the same `.dash-tip` positioned next to the cell. Tooltip head = `Wednesday · 14:00–15:00`. Rows: `sessions · 1,180`, `% of peak · 92 %`.
- **Donut segment** + **legend row**. Hovering either highlights the corresponding legend row (`.dash-donut-row.is-focused` — `--border-light` bg) and shows a `.dash-tip` next to the donut.

---

## 2 · Filter applied

### Trigger
- Click a row in any table → push a `{ key, value }` chip.
- Click a country in the geo table or a pin on the map → push `country = FR`.
- Click a campaign row → push `campaign = spring-saas`.
- Click a donut segment → push `browser = Safari`.

### Visual
A `.dash-filterbar` appears between the sub-tabs and the KPIs:
```
filtered to:  [page = /pricing  ×]  [country = FR  ×]    8 panels re-scoped    clear all
```
- `--accent-bg` background, `--accent-border` outline, 10 px radius.
- Label `filtered to` in mono uppercase accent.
- Each chip: `.dash-filterchip` — pill in `--surface` with `--accent-border`. Key in mono muted, value in 500-weight text, close button in `--border-light` circle.
- Right-aligned: `.dash-filterbar-impact` mono accent count + `.dash-filterbar-clear` text button.

### Re-scope behavior
- KPIs replaced with filter-context values (label suffix `· /pricing`, deltas vs filtered baseline). Use a separate sub-query if needed; otherwise compute client-side from `dashboard.charts.*` filtered subsets.
- Every panel whose data is now scoped gets a `.dash-panel-filterbadge` pill in its head meta: `● filtered`.
- The **selected row** in the originating table gets `.is-selected` (accent-bg row + 3 px inset accent rule on the first cell).
- The command bar scope updates: `marketing · vikl-web-prd · 7d · filter: /pricing`.

### Where the logic lives
The filter state already exists in `app.js` (`pinnedParams`, `filterBar` legacy UI). Replace the legacy chip rendering with `.dash-filterchip` markup and wire the existing add/remove handlers to it. The `clear all` button calls the existing `clearFilters` handler.

---

## 3 · ⌘K command palette

### Trigger
- Global `keydown` listener on `document`. `(e.metaKey || e.ctrlKey) && e.key === 'k'` → open. `esc` → close. Once open, intercept `↑ ↓` to move selection, `↵` to commit, `⌘↵` to open the action in a new tab.

### Visual
- `.dash-cmdk-scrim` — absolute over `.kr-d-frame`, semi-transparent dark scrim with backdrop blur. Click outside the modal to close.
- `.dash-cmdk` — 640 px wide centered modal, top padding 96 px from the frame top. `--surface` bg, `--ghost-hover-border` border, 14 px radius, large shadow.
- Header input row: `›` prefix glyph (mono muted) + typed text (`--text-primary`) + blinking caret (`.dash-cmdk-input-caret` — 1.5 px wide accent strip with `animation: krCaretBlink 1s steps(2) infinite`) + `esc` chip on the right.
- Groups: one per category (Pages, Campaigns, Jump to). Each group has a mono uppercase label (`.dash-cmdk-group-label`) and items.
- Each item: `[glyph | label | meta | kbd]` grid. Active item: `--accent-bg` background, kbd chip switches to accent border + color. Hover = same as active.
- Foot: `--border-light` bg, mono 10.5 px keymap (`↑↓ navigate · ↵ select · ⌘↵ open in new tab · esc close`).

### Behavior
- Items are derived from the loaded dashboard data:
  - **Pages** — top N from `dashboard.charts.topPages`, fuzzy-matched against the query.
  - **Campaigns** — from `dashboard.charts.campaignBreakdown`.
  - **Jump to** — fixed: each tab, each `1/7/30` range, each known service (from the resource list).
- Selecting a page/campaign triggers the same filter-chip flow described above. Selecting a tab/range/service triggers the existing route push.

### Implementation note
Don't add `cmdk` (the npm package) or any combobox library. The whole palette is ~120 lines of vanilla DOM. State machine: open / closed + active index. Render once on open from the current dashboard payload.

---

## 4 · Drill drawer

### Trigger
- Click on any KPI card (`.dash-kpi-a` / `.dash-kpi-b`). Cards carry `tabindex="0"` and `role="button"`.
- `esc` closes. Click on the scrim closes.

### Visual
- `.dash-drill-scrim` — soft dim over the rest of the frame (no blur).
- `.dash-drill` — 520 px wide panel anchored top/right/bottom of `.kr-d-frame`. Background `--surface`, left border 1 px `--ghost-hover-border`, large left-shadow.
- Head: eyebrow mono (`drill · KPI`), title (22 px semibold) + delta pill (`.dash-drill-delta` — mono in success-bg). Mono context line below (`42,189 · last 7 days · vs 37,521 prev 7d`). Close button right.
- Body (scrollable): vertical stack of `.dash-drill-section` blocks. Each section has a mono section header.
  1. **Trend** — a mini line chart (re-use the Chart.js trend with reduced height).
  2. **Top sources** — `.dash-table` 3 columns (source · visitors · share-bar).
  3. **By hour** — `.dash-peaks` heatmap (reused).
  4. **Top entry pages** — `.dash-table` 2 columns.

### Data
**No new endpoint.** The drawer renders from data already loaded for the dashboard:
- The KPI's series (already in `dashboard.charts.dailyTrend` filtered to that metric).
- `dashboard.charts.referrerSources`.
- `dashboard.charts.peakHours`.
- `dashboard.charts.topPages` (filtered to entry pages = first page in each session).

If a section needs data that isn't in the existing payload, mark it as TODO and either compute client-side or add to `/dashboard/overview` in a follow-up.

---

## 5 · Streaming + empty + error states

### Per-card streaming (already implemented)
The dashboard loads via NDJSON (`loadDashboardStream`) — one card per message, each calling `applyCard(name, data)`. The existing `[data-card="<name>"]` attribute on every panel keys this. **Don't break it.** Every `.dash-panel` in the new markup must carry `data-card`.

### Loading skeleton
While `applyCard` hasn't fired for a panel, render a skeleton inside the `.dash-panel`:
```html
<div class="dash-panel" data-card="topPages">
  <div class="dash-panel-head">
    <h3 class="dash-panel-title">Top pages</h3>
  </div>
  <div class="dash-panel-skeleton">
    <div class="dash-panel-skeleton-row"></div>
    <div class="dash-panel-skeleton-row"></div>
    <div class="dash-panel-skeleton-row"></div>
  </div>
</div>
```
Skeleton row CSS (not in `dashboard-snippets.css` yet — add it):
```css
.dash-panel-skeleton-row {
  height: 16px; border-radius: 4px;
  background: linear-gradient(90deg, var(--border-light) 0%, var(--border) 50%, var(--border-light) 100%);
  background-size: 200% 100%;
  animation: dashShimmer 1.6s linear infinite;
}
@keyframes dashShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
```

### Empty state
When a card lands with no data (`applyCard(name, { empty: true })` — existing path), render a friendly empty state inside the panel body:
```html
<div class="dash-panel-empty">
  <p>No campaign data detected.</p>
  <p class="dash-panel-empty-hint">Add <code>utm_source / utm_medium / utm_campaign</code> to your marketing links.</p>
</div>
```
Style:
```css
.dash-panel-empty { padding: 24px 8px; text-align: center; color: var(--text-muted); }
.dash-panel-empty p { margin: 0 0 6px; }
.dash-panel-empty-hint { font-size: 12px; }
.dash-panel-empty-hint code {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 11px; padding: 1px 5px; border-radius: 3px;
  background: var(--border-light);
}
```

### Error state
When `applyCard` errors, the existing per-card overlay (`#cardOverlay-<name>`) shows a retry CTA. Keep that overlay machinery. Just re-skin the overlay:
```css
.card-overlay {  /* legacy class kept for compatibility */
  background: var(--surface);
  border: 1px solid var(--warning-bg);
  border-radius: 14px;
}
.card-overlay-title { color: var(--warning); font-family: var(--font); font-size: 14px; font-weight: 600; }
.card-overlay-retry {
  font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 11.5px;
  padding: 6px 10px; border-radius: 6px;
  background: var(--text-primary); color: var(--bg); border: none;
}
```

---

## Keyboard map (visible + wired)

The command bar shows the keymap. Some shortcuts are wired now; others are visible-only and marked TODO in code.

| Shortcut       | Action                                                             | Ship now? |
|----------------|--------------------------------------------------------------------|-----------|
| `⌘K` / `Ctrl K`| Open command palette                                               | ✅        |
| `esc`          | Close palette / drill drawer / cmdk                                | ✅        |
| `1` / `7` / `30`| Switch range (Today / 7d / 30d)                                   | TODO      |
| `⌘E`           | Export current view (CSV)                                          | TODO      |
| `R`            | Refresh dashboard                                                  | ✅ (already wired) |
| `↑ ↓`          | Navigate inside palette                                            | ✅        |
| `↵`            | Select inside palette / open KPI drawer (when KPI focused)        | ✅        |
| `⌘↵`           | Open palette result in a new tab                                  | TODO      |
| `⌘1 / ⌘2 / ⌘3` | Switch sub-tab (Marketing / Technical / Readiness)                | TODO      |

The visible-only ones must still show the kbd chips — the affordance is half the value, the wiring comes in a follow-up.

---

## Animation guidelines

The dashboard is mostly still. Use motion sparingly:

- **Tooltip appearance**: `opacity 0 → 1` over 80 ms. No translate.
- **Filter chip add/remove**: width transition 120 ms ease-out + opacity 80 ms.
- **⌘K modal**: scale `0.97 → 1` + opacity over 120 ms. Scrim opacity 80 ms.
- **Drill drawer**: translateX `100% → 0` over 220 ms with cubic-bezier(.2, .7, .2, 1). Scrim opacity 120 ms behind it.
- **Sub-tab change**: no animation. Instant.
- **Range change**: no animation on the segmented control; data re-flows naturally via streaming.

Do not animate KPI numbers counting up. The numbers are the data — show them instantly.

---

## Touch / mobile

The dashboard ships at mobile breakpoints. Some interactions need touch-aware variants in a future pass:
- ⌘K → swap for a bottom-anchored search sheet (slide-up from the bottom).
- Drill drawer → swap for a full-screen sheet rather than a 520 px side panel.
- Hover tooltip → swap for a tap-and-hold tooltip; auto-dismiss after 3 s or on next tap.

These are explicit TODOs — not in scope for the first pass, but the screenshots already show mobile portraits stacking cleanly. The desktop interactions can stay desktop-only for now.
