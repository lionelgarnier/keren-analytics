# Advanced Manual Mapping & Configuration

> **STATUS — Phases 1-4 SHIPPED (2026-06-08).** This doc is the design +
> change ledger for turning the setup wizard's blind "type the source + KQL by
> hand" override step into a **palette-driven manual mapping editor** that
> surfaces the App Insights inventory the scan already discovered, with a live
> per-field preview, and for grouping the AI / no-AI / manual configuration
> paths. The dashboard-header entry to the editor stays deferred (separate
> decision).

## Why

The wizard already lets a user override the canonical-field mapping
(`/setup?mode=mapping`, the `<details>` "Show / edit technical mapping" in
[`setup.html`](../../public/setup.html)), but:

1. **The editor is blind.** The user types `source` and the KQL `expr` by
   hand into free-text inputs ([`setup.js`](../../public/setup.js)
   `renderValidate`). Nothing shows the fields/events actually present in
   their telemetry — even though the scan discovered all of it.
2. **Only 4 canonical fields are mappable** (`canonicalUserId`,
   `canonicalSessionId`, `canonicalPagePath`, `canonicalReferrer`).
   `canonicalUserAgent` / `canonicalTimestamp` exist in `buildMapping` but
   aren't overridable.
3. **No "configure manually" entry** when connecting a service — the
   Services-hub split-button offers AI / no-AI, and both run the same scan.

Key realisation while scoping: **the palette data is already on the wire.**
`GET /api/setup/findings` already returns `scan.customDimensions[]`
(`keyName`, `tableName`, `cardinality`, `occurrences`, `samples` — already
PII-scrubbed in [`schemaScan.js`](../../src/core/schemaScan.js)), `tables{}`,
and `eventNames[]`. The frontend just ignores them. Phase 1 is mostly UI work
exploiting data the backend already sends.

## Invariants — the 4 sync points

Overriding a field traverses **four places that must stay aligned**. Any
change to the mappable field set touches all four:

1. `ALLOWED_OVERRIDE_FIELDS` — [`server.js`](../../src/server.js) `/api/setup/validate` whitelist
2. `mergeWithValidation` `fields` array — [`mapping.js`](../../src/core/mapping.js)
3. `allowedKqlExpressions` — [`mapping.js`](../../src/core/mapping.js) (the **KQL renderer whitelist**; an override expr not in here is rejected at render)
4. `CANONICAL_FIELDS` — [`setup.js`](../../public/setup.js) (frontend)

Also preserved: `SAFE_CUSTOM_KEY` custom-dimension key guard, the
`[;|\r\n]` + length-cap safety on override exprs, scan-time PII scrub on
samples, and `mergeWithValidation` recomputing the mapping `version` hash so
the cache (`tenant + resource + workspace + mappingVersion + range`)
invalidates on every override.

## Phase 1 — Palette-driven editor (core)

Turn the blind two-input row into **pick-from-discovered-inventory**.

**Backend**
- New pure helper `buildFieldPalette(scan, mapping)` (new
  [`src/core/fieldPalette.js`](../../src/core/fieldPalette.js)). Per canonical
  field, returns ranked candidates:
  - built-in sources (`user_AuthenticatedId`, `user_Id`, `session_Id`, …) with
    `expr` from `mappingExpressions`,
  - custom dimensions from the scan matching `ALIASES` (reuses the
    alias/pattern logic), with `{cardinality, occurrences, samples, tablesSeen}`,
  - the AI proposal when present.
  - Each entry: `{ source, expr, kind: "builtin"|"custom"|"ai", confidence, meta }`.
- Expose `palette` in the `/api/setup/findings` response next to
  `effectiveMapping` so the frontend doesn't re-implement alias matching.

**Frontend (`setup.js` + `setup.html`)**
- Replace each row's two free-text inputs with a **dropdown** (built-in +
  matched custom dims with volume/cardinality/sample badges + "Custom KQL…").
  Picking an entry fills `source`+`expr`; "Custom KQL…" reveals the free-text
  expr (today's behaviour) as the power-user escape hatch.
- **Origin badge** per row: AI / heuristic / manual / empty.
- Collapsible **"Your telemetry" inventory panel**: every custom dimension +
  standard field + `eventNames`, with volumes/samples — the "what's in my App
  Insights" browse view.
- Reached via `/setup?mode=mapping` (already wired).

**Tests** — `fieldPalette.test.js` (candidates from a mocked scan);
`setupApi.test.js` (findings returns `palette`).

## Phase 2 — Device / browser / OS made genuinely mappable (SHIPPED)

**Finding that reshaped this phase:** only four mapping exprs are actually
substituted into KQL — `{{userIdExpr}}`, `{{sessionIdExpr}}`,
`{{pagePathExpr}}`, `{{referrerExpr}}`. There was no `userAgent`/`timestamp`
placeholder: the device/browser/OS panels read `client_Browser` /
`client_OS` / `client_Type` **hardcoded**, and `timestamp` is hardcoded
everywhere. Making `userAgent`/`timestamp` "overridable" as originally
written would have been cosmetic — the override would change no query.

So Phase 2 instead made the device dimensions **genuinely substitutable**.
"userAgent" is really three independent columns, so it became three mappable
canonical fields — `canonicalBrowser` / `canonicalOs` / `canonicalDevice`:

- New `{{browserExpr}}` / `{{osExpr}}` / `{{deviceExpr}}` placeholders in
  `tech-browser.kql` / `tech-os.kql` / `tech-device.kql` (+ device in
  `session-timelines.kql`), threaded through `dashboard.js` and whitelisted
  via new `allowedKqlExpressions` buckets.
- `mapping.js`: `mappingExpressions` + `ALIASES` (browser/os/device) +
  `buildMapping` defaults each to its `client_*` column (zero behaviour change
  for standard apps) + `mergeWithValidation` applies overrides for the three.
- All **4 sync points** extended (`ALLOWED_OVERRIDE_FIELDS`,
  `mergeWithValidation`, `allowedKqlExpressions`, `CANONICAL_FIELDS`), plus the
  palette (`fieldPalette.js`) and the editor (`setup.js`).
- The telemetry contract picks up the three new naming conventions for free
  (derived from `ALIASES`); snapshots regenerated via `npm run build:contract`.

**UI grouping:** the editor now groups rows into *Identity & navigation* (the
4 original) and *Device & browser* (the 3 new). `timestamp` is intentionally
**not** user-mappable (too central to every query, negligible value). The
remaining gaps (`geo`, `browserTimings`, `dependencies`, `exceptions`) are
*instrumentation* signals — not fixable by mapping; they stay on the findings
step with a `code_prompt`.

## Phase 3 — AI / no-AI / manual triptych (SHIPPED)

The Services-hub configure split-button (`openConfigureMenu` in
[`app.js`](../../public/app.js)) gained a third entry **"Configurer
manuellement"**, alongside the existing AI on/off options. Choosing it
(`chooseManualConfigure`) opts the resource out of AI, selects it, and routes
to `/setup?mode=manual`.

New wizard mode `manual` in [`setup.js`](../../public/setup.js): runs the scan
(no AI wait — the resource is opted out), then lands **directly in the mapping
editor** (`gotoValidate`, `advancedMapping`) instead of the AI-findings cards.
The scan-step Continue button + auto-advance route to the editor in this mode.
So all three modes share the Phase 1/2 editor: AI / no-AI flow through the
findings cards (then "Edit mapping" → editor); manual jumps straight in.

No new backend route — reuses `/api/setup/ai-preference`, `/azure/select`,
`/api/setup/scan/stream`, `/api/setup/findings`. The dashboard-header entry to
the editor stays deferred (separate decision); this is hub-only.

## Phase 4 — Live preview (SHIPPED)

Per-field **"Test"** button in the editor runs the active expression over the
last 7 days and shows the non-null ratio + a few PII-scrubbed sample values
inline, so the user confirms an expression resolves to real data before saving.

- New `POST /api/setup/mapping-preview` (`ensureAuth` + `verifyCsrf`): picks the
  resource's event table (pageViews/requests) from the latest scan, renders the
  new `kql/mapping-preview.kql` template with the user expr sanitized via the
  renderer's `"any"` guard, runs `queryWorkspace`, and returns
  `{ total, nonNull, nonNullPct, samples, table }`. Samples are scrubbed with
  `scrubSamples` from [`schemaScan.js`](../../src/core/schemaScan.js).
- Mock mode: a `mappingPreview` handler in
  [`mockData.js`](../../src/providers/azure/mockData.js) returns a believable
  populated result (the mock can't see the expr).
- Editor: a Test button per row (`runPreview` in
  [`setup.js`](../../public/setup.js)) renders a green/amber/red non-null badge +
  sample chips; editing the expression clears the stale preview.

## Order

Phase 1 → Phase 2 → Phase 3 → Phase 4 — all shipped. No phase needed a DB
migration or a new dependency.
