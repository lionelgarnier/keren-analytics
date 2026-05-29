# handoff-dashboard

Visual + interactive redesign of the dashboard surface (`/dashboard/:service`) in `easy-analytics-for-azure`. Builds on top of D v2 (already shipped for `/services` and `/setup` — see `handoff-d2/`).

## Read in this order

1. **`KICKOFF.md`** — the launch prompt. What to build, what stays, what's out of scope, step-by-step execution plan, acceptance checklist.
2. **`STYLE-GUIDE.md`** — visual spec: tokens, type, spacing, component-by-component rules.
3. **`INTERACTIONS.md`** — the five interactivity patterns (hover tooltip, filter chip bar, ⌘K, drill drawer, panel streaming) in detail.

## The visual reference

**`dashboard-reference.html`** — open in a browser. Renders ten boards stacked vertically:

1. Marketing · Variation A · Light (the canonical layout)
2. Marketing · Variation A · Dark
3. Marketing · Variation B · Console KPIs (alternate, documented but not the pick)
4. Technical tab
5. Readiness tab
6. Mobile · Marketing (390 px)
7. Interaction · Hover on the trend chart
8. Interaction · Filter applied
9. Interaction · ⌘K command palette
10. Interaction · Drill drawer

Inspect any element with DevTools. The tokens flip on `[data-theme="dark"]`.

## The screenshots

Frozen PNG captures of the same boards, in case `dashboard-reference.html` is awkward to open. Each PNG is `909 × N` (a 909 px wide window stitched vertically) — the right edge of the 1280 px desktop content is mildly clipped; use `dashboard-reference.html` for full-width truth.

## The CSS

**`dashboard-snippets.css`** — copy-paste-ready CSS, **already mapped to the project's token system** (`--bg / --surface / --border / --accent / --success / --warning / --text-primary / --text-secondary / --text-muted`). Selectors are prefixed `.dash-*` (some `.d2-*` selectors are reused from the existing D v2 snippets — those stay).

Append it to `public/styles.css`. Light + dark parity comes for free.

## The React source

**`reference-jsx/`** — the live React components the design was authored in. **Do not port them to the codebase** (`easy-analytics-for-azure` is vanilla JS). They're here so you can read:

- The exact HTML structure each panel emits (for translating to vanilla JS DOM builders).
- The mock data shapes (for understanding what your real payload should map to).
- The component-by-component class names and what they wrap.

## Quick map of the file tree

```
handoff-dashboard/
├── KICKOFF.md
├── README.md
├── STYLE-GUIDE.md
├── INTERACTIONS.md
├── dashboard-reference.html
├── dashboard-snippets.css
├── screenshots/
│   ├── 01-marketing-light.png
│   ├── 02-marketing-dark.png
│   ├── 03-marketing-variant-b.png
│   ├── 04-technical-light.png
│   ├── 05-readiness-light.png
│   ├── 06-marketing-mobile.png
│   ├── 07-interaction-hover-trend.png
│   ├── 08-interaction-filter.png
│   ├── 09-interaction-cmdk.png
│   └── 10-interaction-drill.png
└── reference-jsx/
    ├── screens-data.jsx
    ├── screens-dash-data.jsx
    ├── screens-dir-d2.jsx
    ├── screens-dir-dash-shared.jsx
    ├── screens-dir-dash-panels.jsx
    ├── screens-dir-dash-interactions.jsx
    ├── screens-dir-dash.jsx
    ├── screens.css
    ├── screens-d-e.css
    ├── screens-d2.css
    └── screens-dash.css
```
