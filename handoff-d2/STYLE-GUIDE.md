# D v2 — Style Guide

A concise visual spec for implementing **Direction D v2** in `easy-analytics-for-azure`. Read alongside the screenshots in `screenshots/` and the live HTML reference `d2-reference.html`.

---

## Design intent

D v2 is **Console SaaS, refined**. The polished operator-console surface (Linear / Vercel / Stripe Dashboard lineage) with three signature borrowings:

1. **Tree-format metadata in cards** (`┌ ├ └`) — borrowed from the schema-map direction. Replaces flat icon+label rows with monospace hierarchy that reads like a config file.
2. **Persistent command bar** at the bottom of every screen — borrowed from the architectural direction. Shows sync status on the left, keyboard shortcuts + primary CTA on the right.
3. **Wrapped sparkline panel** — events chart sits inside a `surface-2` rounded box with an uppercase mono label, instead of floating naked above metadata.

The result: more keyboard-affordance, more density, more legibility about *what the system is doing right now*, without abandoning the modern SaaS comfort of the D baseline.

---

## Tokens

D v2 reuses the **existing** `styles.css` token system. No new variables are needed. The mapping from the design-canvas `--kr-*` tokens to the project's tokens is:

| Design token (`--kr-*`) | Project token       | Used for                                  |
|-------------------------|---------------------|-------------------------------------------|
| `--kr-bg`               | `--bg`              | Page background                           |
| `--kr-surface`          | `--surface`         | Cards, command bar                        |
| `--kr-surface-2`        | `--border-light`    | Spark panel background, chips             |
| `--kr-surface-3`        | `--border`          | Progress bar empty track                  |
| `--kr-border`           | `--border`          | Card outlines, dividers                   |
| `--kr-border-strong`    | `--ghost-hover-border` | Card hover border                      |
| `--kr-text`             | `--text-primary`    | Headings, primary body                    |
| `--kr-text-dim`         | `--text-secondary`  | Sub-copy, secondary body                  |
| `--kr-text-muted`       | `--text-muted`      | Labels, meta, breadcrumbs                 |
| `--kr-accent`           | `--accent`          | Brand, active states                      |
| `--kr-accent-soft`      | `--accent-bg`       | Active row tint, AI tag bg                |
| `--kr-accent-soft-hi`   | `--accent-border`   | Pulse-dot outer ring                      |
| `--kr-ok`               | `--success`         | Ready status, done states                 |
| `--kr-ok-soft`          | `--success-bg`      | Ready pill bg, done bar fill              |
| `--kr-warn`             | `--warning`         | Incomplete status, missing-signal cards   |
| `--kr-warn-soft`        | `--warning-bg`      | Incomplete pill bg                        |

Light + dark both work because `[data-theme="dark"]` already redefines every project token in `styles.css`. No extra dark-mode rules needed in `d2-snippets.css`.

---

## Type

Reuse `var(--font)` (Inter on this codebase) for the sans stack. Use `ui-monospace, "JetBrains Mono", monospace` for everything monospace (breadcrumbs, tree, command bar, kbd chips). The reference design used Geist + Geist Mono — Inter + JetBrains Mono read almost identically; keep them to avoid adding a new font import.

Sizes used:

| Token | Size  | Used for                                       |
|-------|-------|------------------------------------------------|
| h1    | 36 px | Page title (`.d2-h1`)                          |
| h2    | 20 px | Scan-now card title (`.d2-scan-now-title`)     |
| h3    | 15–16 px | Section titles, improve title              |
| body  | 14 px | Sub-copy, summary                              |
| body-s| 12.5 px | Card desc, descriptions                     |
| caption | 11–11.5 px | Breadcrumbs, sub-meta, command bar     |
| mono-xs | 10–10.5 px | Labels (uppercase, tracked +0.4–1px)   |

---

## Spacing

- Page body: `padding: 36px 40px 24px`, `max-width: 1180px`, centered.
- Card padding: `18px 20px` (resource cards), `20px 22px` (improve card, scan-now), `16px 18px` (small cards).
- Grid gaps: `12px` (compact, resource/findings grid), `18px` (loose, scan split), `24px` (header → body).
- Top bar height: `~46px` (12 px vertical padding + 22 px logo).
- Command bar height: `~36px` (10 px vertical padding).

Border radii: `14px` for outer cards, `12px` for nested/improve sub-cards, `8px` for the spark panel inside a card, `6–8px` for buttons, `999px` for pills + chips.

---

## Components

### Topbar
- Brand mark (square colored glyph + name + small mono "VIKL" tag) on the left, followed by tabs (`Services` / `Setup` / `Audit` / `Settings`). Active tab carries a `border-bottom: 2px solid var(--text-primary)`.
- Right: `⌘K` kbd chip + avatar bubble.

### Page header
- Breadcrumb (mono, gray, with `/` separators), with the leaf in `--text-primary`.
- Optional pill after the breadcrumb: green "N connected" tag on the hub, blue "AI · gpt-4.1" tag on findings.
- Big sans h1 (36px, weight 600, tight tracking).
- Sub-copy ≤ 640px wide, `var(--text-secondary)`.
- Right column on desktop: ghost button + accent button. On mobile, stack underneath.

### Toolbar (services hub only)
- Chips on the left (All / Prod / Staging / Dev), active chip is solid black (`--text-primary` background, `--bg` text).
- Search field on the right, mono placeholder, `⌘K` chip floated to the right inside the field.

### Resource card (`.d2-rescard`)
Five regions, top to bottom:
1. **Head row** — name (sans, 600) + sub-line (`Application Insights · env-badge`) on the left; status pill on the right.
2. **Spark panel** — surface-2 rounded box, uppercase mono `EVENTS · 7D` label + value in normal sans, bar chart below.
3. **Tree** — three monospace lines: `┌ sub …`, `├ rg …`, `└ ws …`.
4. **Divider** + **footer** — primary CTA link on the left (`Configurer →` / `Ouvrir →` / `Reprendre la config →`), secondary `Reconfigure` button or `↵` kbd on the right.

Status variants change ONLY:
- The status pill color (ready / incomplete / unconfigured).
- The spark bar color (accent for ready, warning for incomplete, surface-3 placeholder for unconfigured).
- The CTA link color (default for ready, warning for incomplete, mute for unconfigured).

### Wizard progress strip (`.d2-progress`)
Four equal columns, each a small horizontal bar over a mono label. States: `is-done` (success bar full + `✓`), `is-active` (accent bar 48% + percent or `now`), default (empty bar).

### Scan split (`.d2-scan`)
Two columns on desktop, stacked on mobile.

- **Left — Live now card** (`.d2-scan-now`): top-gradient accent rule, mono "LIVE · STEP 03 OF 05" label with pulse dot, 20 px sans title, 12.5 px detail, then a 3-cell stat strip (Dimensions / Events / Tables) divided by vertical rules.
- **Right — Scan tree** (`.d2-scan-tree`): mono header with file-tree title + "streaming" indicator on the right; body is a monospace tree (`┌ ├ └ ├─ └─`) with the in-flight row highlighted by an `--accent-bg` background that bleeds to the card edges.

### Findings hero (`.d2-find-hero`)
Two-column card. Left: readiness gauge (label + 56 px number + 6 px progress track with `success → accent` gradient + meta line). Right: summary paragraph with bolded phrases + meta line below.

### Findings grid (`.d2-find-grid`)
3-column responsive grid of `.d2-find-card` items.
- Ready cards: white surface, name + desc, ready pill, line-chart sparkline at the bottom (the `Spark` helper in `screens-data.jsx` produces these — reproduce as inline SVG `<path>` here).
- Needs cards: warning-bg tint, no border, mono `blocked on <code>` block at the bottom.

### Improve list (`.d2-find-improve`)
Card with header (title + sub) and one row per missing signal. Row is a 3-column grid (`200px 1fr 140px`): mono field name with `missing` tag, description, "⌘ Use prompt" CTA button (solid black).

### Command bar (`.d2-cmdbar`)
Sticky to the bottom of the page container.
- Left: green dot + `synced · 16:54:22` · scope label (`services · 4 nodes`, `setup · scanning · 03 / 05`, etc.).
- Right: kbd cells (`↑ ↓ navigate`, `↵ open`, `⌘K filter`) + a single solid-button CTA. Use `--accent` background on screens with a primary forward action (continue, review & save), and `--text-primary` background for the neutral hub.

---

## Behavior rules

- **Light + dark parity.** Every selector in `d2-snippets.css` is built on existing tokens that already flip with `[data-theme="dark"]`. Don't write dark-mode overrides except for the one needed for `.d2-find-card--needs code` (rgba background flips because it's painted over a warning-tinted surface, not a token).
- **Card click target.** Whole resource card is clickable, routing to `/setup` or the dashboard depending on `status`. Keep the existing `gotoService(resource, card, destination)` handler — only the markup inside the card changes.
- **Hover affordance.** Resource card: border color → `--ghost-hover-border`. No lift/translate. Tabs / chips / improve-cta use the default focus rings; don't paint custom hover backgrounds.
- **Status copy stays in French** (matching `SERVICE_STATUS_META` in `app.js`): `Prêt` / `Configuration incomplète` / `À configurer`. Actions also stay French.
- **Pulse animation.** `.d2-pulse-dot` keyframes are scoped to that selector and don't conflict with anything in `styles.css`. Keep duration at 1.6s.

---

## What this design replaces

| Existing element                        | D v2 replacement                                |
|-----------------------------------------|-------------------------------------------------|
| `.navbar` on `/services` and `/setup`   | `.d2-topbar` (logo + tabs + ⌘K + avatar)        |
| `.resource-card-v2`                     | `.d2-rescard` (head / spark / tree / cta)       |
| `.setup-stepper`                        | `.d2-progress` strip                            |
| `.setup-scanning` + `.setup-progress-log` | `.d2-scan` split (live card + tree)           |
| `.setup-findings-summary`               | `.d2-find-hero`                                 |
| `.setup-graphs-grid` + `.setup-graph-card` | `.d2-find-grid` + `.d2-find-card`            |
| `.setup-coverage-section` + `.setup-missing` | `.d2-find-improve` + `.d2-find-improve-item` |
| (none — new)                            | `.d2-cmdbar` (persistent footer)                |

The setup wizard's **logic** does not change. State machine, fetch calls, prompt-action-button, `setup.js` step flow — all kept as-is. Only the DOM structure each render function emits (and the matching CSS) changes.
