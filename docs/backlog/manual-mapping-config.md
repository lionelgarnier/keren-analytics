# Advanced Manual Mapping & Configuration

> **STATUS — PLANNED (2026-06-08).** Phase 1 in progress. This doc is the
> design + change ledger for turning the setup wizard's blind "type the
> source + KQL by hand" override step into a **palette-driven manual mapping
> editor** that surfaces the App Insights inventory the scan already
> discovered, and for grouping the AI / no-AI / manual configuration paths.

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

## Phase 2 — Full field coverage

Add `canonicalUserAgent` (useful) and optionally `canonicalTimestamp` to the
**4 sync points**, each with a `mappingExpressions` entry so
`allowedKqlExpressions` can whitelist its exprs. **UI distinction:** separate
*mapping* signals (userId, session, pagePath, referrer, userAgent, timestamp —
fixable here) from *instrumentation* signals (`browserTimings`,
`dependencies`, `exceptions`, `geo` — not mappable; they route to the existing
`code_prompt` flow).

## Phase 3 — AI / no-AI / manual triptych + config hub

*(Depends on the deferred header decision — integration point only.)*
A third "Configure manually" path opens the Phase 1 editor expanded,
deterministic pre-fill, no AI wait. All three modes land in the same editor,
pre-filled differently. The scan always runs (it feeds the palette).

## Phase 4 — Live preview (optional)

Per-field "Test" button: run the KQL expr over a short window, show 3 sample
values + non-null %. Reuses the cache/KQL infra and existing safety guard.

## Order

Phase 1 → Phase 2 → (3, 4). Phase 1 has no DB migration and no new dependency.
