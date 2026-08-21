# Mobile UX audit — dashboard, hub & setup wizard

**Date**: 2026-08-21 · **Status**: findings ready, fixes not started
**Trigger**: maintainer report — broken/unoptimised display on mobile, especially
the dashboard (two iOS Safari screenshots: a mostly-blank cut-off "…sitors"
panel, and a cramped dashboard header with the keyboard-shortcut status bar
overlapping content).

## Method

- **Live repro**: Playwright + Chromium, emulated iPhone 14 (390×844, DPR 2,
  touch), against `npm run dev` mock mode — landing, mock login, `/services`
  hub, `/preview` dashboard (all 4 tabs + drill drawer + ⌘K palette + config
  menus), `/setup` and `/setup?mode=manual`; extra passes at 360×740 and
  844×390. Each state measured for horizontal overflow, touch-target sizes,
  input font sizes, and pinned (sticky/fixed) chrome.
- **Static pass**: `public/styles.css` (20 `@media` blocks / 153 KB),
  `public/index.html`, `public/app.js`, `public/setup.js`.
- **Baseline**: WCAG 2.2 AA (Oct 2023 — target size 24px SC 2.5.8, dragging
  2.5.7, reflow 1.4.10), Apple HIG (44×44 pt), Material 3 (48dp), web.dev
  viewport-units/INP guidance (FID→INP Mar 2024), NN/g navigation & table
  patterns. Sources at the bottom.

Both maintainer screenshots were reproduced pixel-for-pixel in emulation, so
every finding below is backed by a measured repro, not conjecture.

**Headline numbers** (marketing tab, 390×844):

| Metric | Value | Standard |
|---|---|---|
| Interactive elements < 44×44 px | 30 of 31 | Apple HIG minimum |
| Interactive elements < 24×24 px (hard WCAG 2.2 fail) | 8 | WCAG 2.2 SC 2.5.8 AA |
| Drill drawer width vs viewport | 520 px vs 390 px (−130 px off-screen left) | — |
| Drill drawer height (absolute, document-anchored) | 5 874 px | — |
| Sticky keyboard-hint bar footprint | 56 px on every route | — |
| Text elements rendered < 11 px | 51 | 16px body guidance |
| Form fields < 16 px (iOS focus auto-zoom) | hub search 12.5px, ⌘K input 15px, 7 fields in mapping editor | 16px min |
| `safe-area-inset` / `touch-action` / `dvh|svh` / `overscroll-behavior` / `text-size-adjust` occurrences in CSS | 0 | — |
| Body scroll-lock while drawer/palette open | none | — |

The landing page (`landing-v2.css`) and the hub's card grid are in decent
shape — the mobile debt is concentrated in the **d2 dashboard chrome, the
overlays, and the setup wizard**, which are desktop-first with only
grid-collapse media queries (`styles.css:5195`).

---

## P0 — broken on phones (reproduces the reported bugs)

### 1. KPI drill drawer is unusable — the "…sitors" blank panel

`public/styles.css:5448` — `.dash-drill { position: absolute; top: 0; right: 0;
bottom: 0; width: 520px; }` inside `#dashboardPanel`
(`public/index.html:544`, `style="position:relative"`), no media query.

Three compounding faults, all measured:

- **Wider than the screen**: 520 px on a 390 px viewport ⇒ hangs 130 px off
  the left edge; the title "Unique Visitors" renders as "…sitors" (the
  maintainer's screenshot 1).
- **Anchored to the document, not the viewport**: `top:0; bottom:0` of the
  whole panel ⇒ measured drawer box `{x:-130, y:107, w:520, h:5874}`. Head
  and close button live at *document* top; opened after scrolling, the user
  sees **only a blank white column** (repro `06b`) and believes the tap did
  nothing.
- **No modal behavior**: no body scroll-lock (`overflow` untouched), scrim is
  `position:absolute` too (`styles.css:5504`), close button measures 24×22 px
  (below both WCAG 24px and HIG 44pt), no `Escape`-equivalent touch
  affordance beyond it, no focus management.

**Fix**: make the drawer viewport-fixed and responsive — desktop:
`position: fixed; inset: 0 0 0 auto; width: min(520px, 100vw)`; ≤768px: bottom
sheet (`inset: auto 0 0 0; max-height: 85svh; border-radius: 16px 16px 0 0`),
44 px close target, body scroll-lock while open, `overscroll-behavior:
contain` on `.dash-drill-body`, `padding-bottom:
max(16px, env(safe-area-inset-bottom))`. Same treatment for the scrim
(`position: fixed; inset: 0`). Longer term both drawer and palette belong in a
native `<dialog>` (top layer, inert background, Esc handling for free —
baseline since 2022). JS entry points: `openDrill/closeDrill`
`public/app.js:378-398`.

### 2. ⌘K command palette — same document-anchoring flaw + iOS zoom

`public/styles.css:5361` — `.dash-cmdk-scrim { position: absolute; inset: 0;
padding-top: 96px }`: the palette is laid out 96 px from **document** top, so
opened while scrolled (the ⌘K topbar button stays reachable) the dialog is
above the viewport — invisible, page dimmed. Also: input font is 15 px
(`styles.css:5382`) ⇒ iOS auto-zooms the page on focus; the footer is
keyboard legend only (`↑↓ navigate · ↵ select · esc close`,
`public/index.html:1260-1264`); placeholder truncates on 390 px.

**Fix**: `position: fixed` scrim; palette `width: min(640px, calc(100vw -
24px))`; `font-size: 16px` on the input; hide the kbd footer on coarse
pointers (see P1-5); on phones consider presenting it as a search sheet — or
simply not exposing the palette entry point on touch at all.

### 3. Manual mapping editor overflows the viewport by ~45%

`/setup?mode=manual` (editor markup built in `public/setup.js` — cmdbar/table
around `setup.js:111` and the mapping rows) renders a 5-column table
(field / source / KQL expression / status / Test) with no responsive variant
and no scroll container: full-page capture measures **≈570 CSS px wide on a
390 px viewport** — the page itself pans sideways (WCAG 1.4.10 reflow fail;
tables may scroll internally, pages must not). `<select>` controls collapse to
~2 visible characters ("Au ▾", "cli ▾"); KQL chips wrap letter-by-letter
("user_Auth enticatedI d"); 7 form fields are below 16 px ⇒ iOS zoom.

**Fix**: below ~768px, render one **card per canonical field** (label + source
select full-width + KQL `<code>` block with its own `overflow-x:auto` +
status pill + Test button ≥44px). If a table must stay, wrap it in an
`overflow-x:auto` container with a sticky first column and a visible cut-off
edge. Mind the 7-field sync points listed in
`docs/backlog/manual-mapping-config.md` — layout only, no mapping-contract
changes.

### 4. Sticky keyboard-shortcut status bar on every route

`public/styles.css:4521` — `.d2-cmdbar { position: sticky; bottom: 0 }`,
56 px measured, present on dashboard (`public/index.html:1240-1252`), hub
(`public/app.js:1341-1352`) and setup (`public/setup.js:111-135`). On touch
devices its content is 100% dead UI: `1 7 3 range · ⌘E export · ⌘K filter ·
R refresh`, `↑↓ navigate · ↵ open`, `↵ continue`. It permanently covers
content (maintainer screenshot 2 shows it colliding with iOS Safari's own
bottom toolbar), has no `env(safe-area-inset-bottom)` so the home indicator
overlaps it, and on the hub the floating `+ Connect workspace` button renders
on top of it, half-clipped (repro `02-hub`). On setup it additionally
duplicates the primary CTA mid-scroll over card content.

**Fix**: hide the bar under `@media (hover: none), (pointer: coarse), (max-width:
768px)`. If a mobile status strip is wanted, keep only sync-dot + context +
range and pad `max(10px, env(safe-area-inset-bottom))` with
`viewport-fit=cover` (see P2-1). The setup variant's "continue" CTA must then
live in the page flow (it already does — the sticky copy is a duplicate).

---

## P1 — major degradations

1. **Dashboard page header crams 4 controls on one line** —
   `styles.css:4566-4570` only sets `.d2-pageheader-r { width:100%;
   justify-content: flex-end }` at ≤720px, so range group + "Modifier le
   mapping" split + "⌘E Export" + "Change" share one row: the split-button
   label wraps to 3 lines, the range control clips mid-label ("Today | 7c"),
   heights diverge (maintainer screenshot 2, repro `04`). **Fix**: stack —
   range as a full-width 44px segmented control on its own row; below it the
   config split growing `flex:1`, Export + Change collapsed into a "⋯"
   overflow menu on mobile.
2. **`⌘E Export` label hardcodes the shortcut** (`public/index.html:621`) —
   shows a Mac keyboard chord on touch; same for hub hero "⌘K Filter"
   button, card "↵" glyphs (`app.js` hub template), topbar `⌘ K` chip
   (`index.html:568`). **Fix**: wrap every shortcut glyph in a `.kbd-hint`
   span and gate it once: `@media (hover: none), (pointer: coarse) {
   .kbd-hint { display: none } }` (plus hide the ⌘K *buttons* entirely — they
   open a keyboard tool).
3. **Sub-tab bar clips** — `.dash-subtabs` (`styles.css:4633`) is
   `inline-flex`, no wrap/scroll: at 390 px the "Readiness 105" badge is cut
   at the viewport edge (both screenshots). **Fix**: `display:flex;
   overflow-x:auto` with hidden scrollbar + scroll-snap and an edge-fade
   affordance (NN/g: cut-off element = the affordance that works), or a 2×2
   segmented grid at ≤480px; raise row height to ≥44px.
4. **Touch targets below every standard** — measured on marketing tab:
   30/31 controls < 44 pt (HIG); hard WCAG 2.2 fails include the
   Map/Chart/Campaigns/Parameters/Flow view toggles at 20 px tall
   (`.view-toggle-btn`, `styles.css:2204`, `padding: 4px 12px`), range
   buttons ~30px (`styles.css:4683`), drill close 24×22, `#kpiVisitorsHint`
   12 px tall (`index.html:673`), Leaflet attribution links 10 px. **Fix**:
   on coarse pointers raise padding so every control's hit area ≥44×44
   (visual size may stay smaller via negative-margin/`::after` extension);
   24×24 is the absolute floor anywhere.
5. **Chart/heatmap/table interactions are hover-only** — `.dash-tip` tooltips
   (`styles.css:5203+`, `pointer-events:none`) appear on `mousemove`; row
   hover states carry meaning; on touch there is no equivalent (WCAG 2.1.1 /
   2.5 pattern). **Fix**: tap-to-pin tooltip on charts (Chart.js touch events
   already fire), make hover-revealed row actions always visible on coarse
   pointers.
6. **Leaflet map pans with one finger inside the scroll page** —
   `app.js:1972` enables default `dragging`; a swipe over the 240px-tall map
   scrolls the map, not the page (classic scroll trap). `zoomControl: true`
   is already good (WCAG 2.5.7). **Fix**: on touch, `dragging: false` (or
   two-finger gesture handling) — zoom buttons remain.
7. **Topbar IA on mobile** — `Keren. | Services | Docs | Logout | 🌙 | ⌘K |
   ··` all exposed at 390px (`index.html:557-571`); Logout as a nav tab is
   risky next to Services; avatar placeholder `··` is decorative. **Fix**:
   keep Services + theme toggle; fold Docs/Logout behind the avatar as a
   menu; drop ⌘K chip on touch (P1-2).

---

## P2 — platform correctness & polish

1. **No safe-area plumbing**: add `viewport-fit=cover` to the viewport meta
   (`index.html:5`, `setup.html`) and `env(safe-area-inset-*)` padding to
   every sticky/fixed bottom element (cmdbar if kept, drill bottom sheet,
   cookie/preview banners).
2. **`min-height: 100vh`** on `.d2-page` (`styles.css:4554`) — iOS Safari's
   dynamic toolbars make 100vh the *largest* viewport. Use `min-height:
   100vh; min-height: 100svh;` (fallback line first). Audit `landing-v2.css`
   hero for the same.
3. **iOS focus auto-zoom**: bump all form controls to ≥16px at mobile widths
   (hub search 12.5px `resourceSearchInput`, ⌘K input 15px, mapping editor
   fields; `.select` etc.).
4. **No `touch-action: manipulation`** on buttons/tabs/toggles — leaves the
   double-tap-zoom delay on rapid taps (INP); add globally for interactive
   elements. Add `-webkit-tap-highlight-color: transparent` only together
   with visible `:active` states.
5. **Pull-to-refresh wipes SPA state** on Chrome Android: `overscroll-behavior-y:
   contain` on `html/body` (dashboard is a stateful SPA; accidental refresh
   re-runs auth + pipeline).
6. **`text-size-adjust: 100%`** missing — iOS landscape inflates text
   unpredictably on non-optimised blocks.
7. **`theme-color` is static blue** `#2d6cf2` (`index.html:9`) — clashes with
   the light/dark app chrome; ship a `media="(prefers-color-scheme: …)"`
   pair matching `--bg`.
8. **Overlay stack is hand-rolled** — cmdk/drill/confirm/menus each
   re-implement scrim + z-index + Esc. Migrate to `<dialog>`
   (`showModal()`) for top-layer + inert + focus trapping; removes the
   scroll-lock class of bugs at the root.
9. **Consolidate breakpoints** — current mix (560/600/700/720/768/900) makes
   per-component fixes drift. Recommend standardising on 640/768/1024
   (Tailwind-ish) for new rules, and for dashboard *panels* prefer container
   queries (baseline since Feb 2023) so cards adapt to their column, not the
   viewport.
10. **Landscape phones** (844×390): the sticky cmdbar + preview banner +
    topbar eat ~40% of the height; hiding the cmdbar (P0-4) mostly resolves
    it; keep banners dismissible.

## Side findings (not mobile, discovered during repro)

- **Mock-mode select is broken**: `isValidAzureResourceId`
  (`src/server.js:214-219`) requires a 36-char GUID subscription id, but
  `mockClient` resources use `/subscriptions/mock-sub/…` ⇒ `POST
  /azure/select` returns 400 `INVALID_SELECTION` ("Malformed resource id."
  banner after mock login; the hub "Configure…" card flow dead-ends in dev).
  Tests pass because they don't drive this path with mock ids. Fix: accept
  mock-shaped ids when `azureMode === "mock"` (or give mock resources
  GUID-shaped subscription ids).
- The audit environment blocks external hosts, so Google Fonts /
  `js.monitor.azure.com` / GitHub-stars fetches errored in console — not a
  product bug, but a reminder the SPA should degrade quietly when they fail
  (it did).

## Suggested delivery plan

| Batch | Scope | Effort |
|---|---|---|
| **M1 — stop the bleeding** | P0-1 drawer, P0-2 palette, P0-4 cmdbar gating, P1-1 header stack, P1-2 kbd-hint gating, P1-3 subtabs | ~1–2 days |
| **M2 — touch compliance** | P1-4 targets, P2-1 safe-area, P2-2 svh, P2-3 16px inputs, P2-4 touch-action, P2-5 overscroll, P2-6 text-size-adjust, P2-7 theme-color | ~1 day |
| **M3 — setup wizard & interactions** | P0-3 mapping editor cards, wizard stepper/CTA dedupe, P1-5 tap tooltips, P1-6 map dragging, P1-7 topbar menu, P2-8 `<dialog>` migration, P2-9 breakpoints/container queries | ~2–3 days |

Acceptance for M1/M2 (add to the fix PR):
- On 390×844 and 360×740: no page-level horizontal scroll on any route
  (incl. `/setup?mode=manual`); drill drawer + palette fully visible whatever
  the scroll position; no keyboard glyph (⌘, ↵, ↑↓, `R`) rendered on a
  coarse-pointer profile; every interactive control ≥24×24 with primary
  controls ≥44×44; focused inputs don't zoom on iOS profile (≥16px).
- Regression guard: extend the Playwright audit script (kept in session
  scratchpad; re-create under `scripts/` if wanted) or add a viewport
  smoke-test to CI.

## Sources (2024–2026 baseline used above)

- WCAG 2.2: w3.org/WAI/WCAG22/Understanding/target-size-minimum.html (24px),
  dragging-movements (2.5.7), reflow (1.4.10, 320px)
- Apple HIG 44pt: developer.apple.com/design/tips/ · Material 3 48dp:
  m3.material.io/foundations/designing/structure
- Viewport units svh/dvh & iOS toolbars: web.dev/blog/viewport-units ·
  visualViewport: developer.mozilla.org/en-US/docs/Web/API/VisualViewport
- Safe areas: webkit.org/blog/7929/designing-websites-for-iphone-x/ ·
  css-tricks.com/the-notch-and-css/
- `<dialog>` baseline: web.dev/articles/baseline-in-action-dialog-popover ·
  iOS body-scroll bug: bugs.webkit.org/show_bug.cgi?id=153852
- Hover/pointer gating: developer.mozilla.org/en-US/docs/Web/CSS/@media/hover
- 16px input zoom: css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/
- Mobile tables: nngroup.com/articles/mobile-tables/ ·
  smashingmagazine.com/2022/12/accessible-front-end-patterns-responsive-tables-part1/
- INP (Mar 2024): web.dev/blog/inp-cwv-march-12 · touch-action:
  developer.mozilla.org/en-US/docs/Web/CSS/touch-action
- Pull-to-refresh: developer.chrome.com/blog/overscroll-behavior
- Bottom nav ≤5 destinations: m3.material.io/components/navigation-bar/guidelines ·
  nngroup.com/articles/mobile-navigation-patterns/
