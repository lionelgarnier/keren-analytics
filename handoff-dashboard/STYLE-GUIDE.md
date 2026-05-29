# Dashboard D v2 — Style Guide

A concise visual spec for implementing the dashboard redesign in `easy-analytics-for-azure`. Read alongside the screenshots in `screenshots/` and the live HTML reference `dashboard-reference.html`.

---

## Design intent

The dashboard is the **last surface in the D v2 trilogy**: Services (resource hub) → Setup (wizard) → **Dashboard (live data)**. It keeps the same operator-console DNA — polished sans, monospace for meta + numbers, persistent command bar, breadcrumb-led header, tree-style hierarchy where it earns it — and adds three things only the dashboard needs:

1. **Sub-tabs** under the page header (Marketing / Technical / Readiness) with count badges. The Services/Setup/Audit/Settings tabs in the topbar stay; sub-tabs scope only the dashboard surface.
2. **AI narration card** between the header and the KPIs. Editorial paragraph + AI tag + meta line. Speaks before the numbers do.
3. **Interactive primitives** — tooltip, filter chip, ⌘K, drill drawer — that turn the dashboard into a real exploratory surface, not a static report. Documented separately in `INTERACTIONS.md`.

Two KPI variants ship in the reference. **Variation A (editorial)** is the pick: dense, calm, sparkline-free. **Variation B (console)** is documented as an alternative for future toggling.

---

## Tokens

The dashboard reuses the **existing** `styles.css` token system. No new variables. The mapping from the design canvas's `--kr-*` tokens to the project's tokens is identical to D v2:

| Design token (`--kr-*`)   | Project token            | Used for                                          |
|---------------------------|--------------------------|---------------------------------------------------|
| `--kr-bg`                 | `--bg`                   | Page background                                   |
| `--kr-surface`            | `--surface`              | Cards, panels, command bar, drill drawer          |
| `--kr-surface-2`          | `--border-light`         | KPI spark panel, heatmap base, donut track        |
| `--kr-surface-3`          | `--border`               | Score bar empty cell                              |
| `--kr-border`             | `--border`               | Panel outlines, table dividers                    |
| `--kr-border-strong`      | `--ghost-hover-border`   | Tooltip card border, drill drawer left border     |
| `--kr-text`               | `--text-primary`         | Headings, body, KPI numbers                       |
| `--kr-text-dim`           | `--text-secondary`       | Sub-copy, table dim cells, narration body         |
| `--kr-text-muted`         | `--text-muted`           | Labels, mono meta, breadcrumbs, axis labels       |
| `--kr-accent`             | `--accent`               | Brand, active state, trend line, donut primary    |
| `--kr-accent-soft`        | `--accent-bg`            | Filter bar bg, ⌘K item active, AI tag bg          |
| `--kr-accent-soft-hi`     | `--accent-border`        | Filter chip border, filter bar border             |
| `--kr-ok`                 | `--success`              | OK insights, score gradient start, sync dot       |
| `--kr-ok-soft`            | `--success-bg`           | OK insight halo, delta-up pill, ok session pill   |
| `--kr-warn`               | `--warning`              | Warn insights, missing signals, error session     |
| `--kr-warn-soft`          | `--warning-bg`           | Warn insight halo, miss-signal bg, error step bg  |

Light + dark both work because `[data-theme="dark"]` in `styles.css` already redefines every project token. **No extra dark-mode rules needed in `dashboard-snippets.css`**.

---

## Type

Reuse `var(--font)` (Inter on this codebase) for the sans stack. Use `ui-monospace, "JetBrains Mono", monospace` for everything mono (breadcrumbs, axis labels, kbd chips, table numbers, meta lines). The reference design used Geist + Geist Mono — Inter + JetBrains Mono read almost identically; keep them to avoid adding a new font import.

Sizes used in the dashboard:

| Token       | Size        | Used for                                                    |
|-------------|-------------|-------------------------------------------------------------|
| h1          | 36 px       | Page title (service name)                                   |
| h2          | 22 px       | Readiness grade headline                                    |
| h3          | 14–16 px    | Panel titles                                                |
| body        | 14 px       | Narration card body, drill drawer descriptive text          |
| body-s      | 12.5–13 px  | Table rows, KPI compare line                                |
| kpi-value-A | 28 px       | Variation A KPI big number                                  |
| kpi-value-B | 26 px       | Variation B KPI big number                                  |
| score       | 42 px       | Readiness score number inside the ring                      |
| caption     | 11–11.5 px  | Breadcrumb, command bar, sub-tab meta                       |
| mono-xs     | 9.5–10.5 px | Mono labels (uppercase, tracked 0.4–1 px), axis ticks       |

---

## Spacing

- Page body: same `padding: 36px 40px 48px; max-width: 1180px` as D v2 (`/services`, `/setup`).
- Card padding: `18px 20px` (panels), `14px 16px` (KPI A), `14px 14px 12px` (KPI B), `10px 12px` (insight chips), `10px 14px` (filter chip bar), `12px 14px` (signal row).
- Grid gaps: `10px` (KPI grid + insights), `12px` (panel grids), `8px` (signals), `18px` (geo split, score-hero split).
- Section dividers: `margin: 28px 0 12px` between Audience / Engagement / Acquisition / Tech.

Border radii: `14px` for top-level panels (`.dash-panel`, `.dash-narr-a`, `.dash-score-hero`), `12px` for KPI cards + improve items, `10px` for filter bar + signal rows + sessions + narration-b, `8px` for the spark panel inside a KPI and the tooltip, `6px` for buttons + table bars, `999px` for delta pills + filter chips.

---

## Component-by-component

### Topbar (`.d2-topbar`)
Identical to the D v2 topbar already shipped for `/services` / `/setup`. Active tab on the dashboard is `Services` (you're inside a service).

### Page header (`.d2-pageheader`)
Same structure as D v2. Breadcrumb: `vikl.fr / services / <serviceName> / <activeTab>` with the active tab in `.d2-breadcrumb-here` and a green `live` tag at the end. h1 = the service name. Sub-copy = a one-line tab description. Right column: `.dash-range` segmented + ghost `Export` button.

### Sub-tabs (`.dash-subtabs`)
Mono label + count chip per tab. Active state: 2-px underline (color `--text-primary`) + count chip in `--accent` colors. A right-aligned `.dash-subtab-meta` shows the sync status (`● synced · HH:MM:SS`). The bar carries a `border-bottom: 1px solid var(--border)` rule.

### Time range (`.dash-range`)
Segmented control (`Today / 7d / 30d`) in `--surface` with `--border` outline. Active button: `--border-light` bg + `--text-primary` text. Mono 11 px label. Sits in the page header's right column.

### AI narration — Variation A (`.dash-narr-a`)
Wide card in `--surface`. Two-column on desktop: tag chip on the left (`.dash-narr-a-tag` — accent dot + `AI · gpt-4.1` in mono uppercase, accent-soft pill), body on the right. Body uses regular 14.5 px sans with `<strong>` highlights. Meta line below in mono 10.5 px, items separated by tiny `.dash-narr-a-meta-dot` glyphs.

### AI narration — Variation B (`.dash-narr-b`)
Single-line strip with the AI tag, a sentence with `<strong>` highlights, and a mono `expand ↗` link on the right. Less weight; better when the panel area below already carries the weight.

### KPI grid — Variation A (`.dash-kpis` + `.dash-kpi-a`)
4-col on desktop (`.dash-kpis--desktop`), 2-col on mobile. Each card:
- `.dash-kpi-a-label` — mono uppercase 10.5 px, tracked.
- `.dash-kpi-a-row` — flex baseline: big value (28 px, 500, tight tracking), optional unit (mono muted), `.dash-kpi-a-delta` pill (success-bg for up, warning-bg for down).
- `.dash-kpi-a-compare` — mono 10.5 px muted, anchored to the bottom (`margin-top: auto`).

### KPI grid — Variation B (`.dash-kpi-b`)
Same grid. Each card:
- Head row: mono label on the left, mono delta on the right.
- Value row: big number (26 px) + optional mono unit.
- Spark panel below in `--border-light` (surface-2): mono `7d` + compare meta + sparkline SVG (24 px tall, accent stroke 1.5).

### Insights chips (`.dash-insights` + `.dash-insight`)
3-col on desktop, 1-col on mobile. Each chip is a small `--surface` card with a colored dot in the top-left and an inline sentence. Dot colors: ok (success + halo), up (accent + halo), warn (warning + halo). Numbers in the sentence are wrapped in `<strong>` (the reference uses a tiny regex; in vanilla JS, decide on a list of patterns upfront).

### Generic panel (`.dash-panel`)
The shell for every chart / table / non-KPI box.
- Background `--surface`, 1 px border, 14 px radius, `padding: 18px 20px`.
- Head: `.dash-panel-head` (flex space-between, baseline align). Title is sans 14 px 600; meta on the right is mono 10.5 px muted.
- Body: content.
- Must carry `data-card="<name>"` so the existing NDJSON streaming + per-card error overlay keep working.

### Trend chart
Inline SVG in the reference, **Chart.js canvas in your build**. Re-style the Chart.js options to:
- Line: `borderColor` = `--accent`, `borderWidth: 1.6`, `tension: 0.35`.
- Fill: `backgroundColor` = `--accent-bg` (low alpha).
- Grid: `color: --border`, `lineWidth: 1`.
- Axis labels: `font-family: ui-monospace, …`, 9.5 px, color `--text-muted`, uppercase tracking via Chart.js `font` config.
- Tooltips: `external` mode → render into our `.dash-tip` DOM. See INTERACTIONS.md.

### Data table (`.dash-table`)
- `width: 100%`, `border-collapse: collapse`.
- `thead th` — mono 10.5 px uppercase, tracked 0.6 px, color `--text-muted`. Numeric headers: `text-align: right`.
- `tbody td` — sans 13 px, color `--text-primary`. Numeric cells: `text-align: right`, mono 12.5 px.
- Bar cells: a `.dash-table-bar` flex row with a 60–100 px `.dash-table-bar` track (`--border-light` bg) + accent `.dash-table-bar-fill` + mono `.dash-table-bar-pct` on the right.
- Selected row (during a filter): `.dash-table tbody tr.is-selected` — `--accent-bg` row, inset 3px box-shadow on the first cell as a selection rule.

### Geo (`.dash-geo`)
- Two columns on desktop: map (left) + country table (right). 1 column on mobile.
- Map container: `.dash-geo-map` — in the reference, a placeholder with `radial-gradient` accent pins and a grid overlay. In your build, this is the **existing Leaflet container** — set the background to `--border-light` and let Leaflet take over. Tile color tints can be customized via CSS filter or by choosing a quieter tile provider.
- Map pins (when not using Leaflet): `.dash-geo-map-pin` (10 px accent dot with double-ringed halo). `.dash-geo-map-pin--lg` (14 px for the biggest country).

### Peak hours heatmap (`.dash-peaks`)
- Pure CSS grid: `grid-template-columns: 24px repeat(24, 1fr); gap: 2px`. 7 rows for Mon→Sun.
- Each cell: `aspect-ratio: 1; background: --accent`. The opacity is the data — `opacity: 0.12 + value * 0.78`.
- Foot row: mono 9.5 px labels (00h / 06h / 12h / 18h / 23h) with `padding-left: 28px` to align with the cell grid.

### Donut (`.dash-donut`)
- Flex row: 120 px SVG ring + legend.
- SVG: a `--border-light` track circle + a stack of stroke-dasharray segments at radius 42 with stroke 16, rotated -90°.
- Colors: 5 swatch variants (`--a … --e`). a = accent, b–d = accent at decreasing opacity (0.7 / 0.45 / 0.28), e = muted.
- Legend: 3-col grid per row (swatch / name / mono pct).

### Funnel (`.dash-funnel`)
- Vertical flex column of funnel rows.
- Each row: header (label + mono count · pct) + 24 px bar (`--border-light` track, `--accent` fill at 0.85 opacity) + optional `.dash-funnel-drop` line in `--warning` below.

### Session timelines (`.dash-sessions`)
- One `.dash-session` row per session: head (id mono + meta mono + status pill — ok / bad) + a track of step pills (`/` → `/pricing` → … with `→` separators between).
- `.dash-session-step` is a small mono-bordered pill in `--surface`; errored steps (`✕ 500`) carry `.is-error` (warning tint).

### Slow endpoints
Just a `.dash-table` with 6 columns. P95 cell colored `--warning` when > 1000 ms. Err% cell colored `--warning` when > 1.0 %.

### Readiness score hero (`.dash-score-hero`)
- 130 px ring with a `success → accent` linear gradient stroke (`<linearGradient id="dashScoreGrad">`).
- Ring label: 42 px score number + `/100 · <letterGrade>` mono.
- Right column: bold grade headline + descriptive paragraph + 10-cell bar (`.dash-score-bar-cell.is-on-ok` for filled, `.is-off` for empty) + mono foot.

### Signal breakdown (`.dash-signals`)
- 2-col grid on desktop.
- Each `.dash-signal` row: name + score (`<num> / <weight>` mono) on the right + a full-width `.dash-signal-sub` line.
- Missing signals get `.dash-signal--miss` modifier (warning-soft bg) + a `missing` tag in the sub-line and the field name aligned right (also warning).

### Improve coverage
Reuses `.d-find-improve` from the existing D v2 snippets (the same component already used on the setup-findings page). One row per missing signal with field tag + title + desc + `unlocks` line + `⌘ Use prompt` CTA. **The CTA wires to the existing `promptActionButton.js`** — do not rebuild it.

### Command bar (`.d2-cmdbar`)
Dashboard adaptation of the D v2 command bar:
- Left: `● synced · HH:MM:SS · <scope>` where scope is `marketing · <serviceName> · 7d` (and reflects active filters when applied).
- Right: kbd cells `1 7 30 range`, `⌘E export`, `⌘K filter`, `R refresh`.
- **No primary CTA** — the dashboard has no forward action.

---

## Behavior rules

- **Light + dark parity.** Every selector in `dashboard-snippets.css` is built on existing tokens that flip with `[data-theme="dark"]`. Do not write `[data-theme="dark"]` overrides.
- **`data-card` attribute is sacred.** Every panel keeps its existing `data-card="<name>"` so the per-card NDJSON streaming + per-card error overlay continue to work untouched.
- **Tab counts**. Marketing = 12 (rendered panels), Technical = 6, Readiness = `<score>/100`. Hard-coded on first render, updated when data lands.
- **Status copy in the command bar stays in English.** Mono labels in lowercase (`synced`, `range`, `export`, `filter`, `refresh`). The narration copy can be French if the user is on the FR locale.
- **Range echo.** Changing the segmented range (`Today / 7d / 30d`) must also update the scope text in the command bar.
- **Hover affordances.** Tables: row hover `--border-light` bg via `.dash-table tr.is-hover` (set via JS on `mouseenter` to avoid `:hover` flicker on touch). KPI cards: subtle border-strong on hover, accent halo on active/focused. Don't add lift/translate.

---

## What this replaces, in the existing codebase

| Existing element                          | Dashboard D v2 replacement                          |
|-------------------------------------------|-----------------------------------------------------|
| `.navbar` (on `/dashboard`)               | `.d2-topbar`                                        |
| `.tab-toolbar` + `.tab-bar`               | `.d2-pageheader` + `.dash-subtabs`                  |
| Time range `<select>`                      | `.dash-range` segmented control                     |
| `.kpi-grid` + `.kpi-card`                 | `.dash-kpis` + `.dash-kpi-a` (or `.dash-kpi-b`)     |
| `.insights-panel` + `.insights-list`      | `.dash-insights` + `.dash-insight`                  |
| `.panel` (all chart / table panels)       | `.dash-panel`                                        |
| `.data-table`                             | `.dash-table`                                        |
| `.peak-hours-grid`                        | `.dash-peaks`                                        |
| `.funnel-container`                       | `.dash-funnel`                                       |
| `.session-replays`                        | `.dash-sessions`                                     |
| `.score-hero` + `.score-ring`             | `.dash-score-hero` + `.dash-score-ring`             |
| `.score-breakdown`                        | `.dash-signals`                                      |
| `.filter-bar` + `.filter-chips`           | `.dash-filterbar` + `.dash-filterchip`              |
| (none — new)                              | `.dash-tip` (tooltip)                                |
| (none — new)                              | `.dash-cmdk` (command palette)                       |
| (none — new)                              | `.dash-drill` (drill drawer)                         |

The Chart.js + Leaflet renderers stay. Only their **containers** get re-skinned (new wrapper classes) and their **options** get re-themed (accent color, mono axis font, low-alpha fill).
