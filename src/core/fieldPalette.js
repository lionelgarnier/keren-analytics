/**
 * Field palette — Phase 1 of the advanced manual mapping editor
 * (docs/backlog/manual-mapping-config.md).
 *
 * Pure transformation: turns a persisted schema scan into a per-canonical-field
 * list of *candidate sources* the wizard's mapping editor can offer as a
 * dropdown, so the user picks from what their telemetry actually contains
 * instead of typing a `source` + KQL `expr` blind.
 *
 * No I/O. Consumes `scan.payload` (the shape produced by
 * `schemaScan.buildSchemaScan`): `tables{}`, `customDimensions[]`
 * (`keyName` / `tableName` / `cardinality` / `occurrences` / `samples` —
 * samples already PII-scrubbed at scan time).
 */
import { ALIASES, mappingExpressions } from "./mapping.js";

// Mirror of `mapping.js` SAFE_CUSTOM_KEY: custom-dimension keys flow into KQL
// string literals, so only an injection-safe set may become a candidate expr.
const SAFE_CUSTOM_KEY = /^[A-Za-z0-9_.-]{1,128}$/;

// The canonical fields covered by Phase 1, mapped to their `ALIASES` key.
const CANONICAL_TO_ALIAS = {
  canonicalUserId: "userId",
  canonicalSessionId: "sessionId",
  canonicalPagePath: "pagePath",
  canonicalReferrer: "referrer",
};

function customExpr(key) {
  return `tostring(customDimensions["${key}"])`;
}

// 0 = no match, 1 = pattern match, 2 = exact alias match.
function aliasScore(key, alias) {
  if (!alias) return 0;
  const exactSet = new Set((alias.exact || []).map((a) => a.toLowerCase()));
  if (exactSet.has(key.toLowerCase())) return 2;
  if (alias.pattern && alias.pattern.test(key)) return 1;
  return 0;
}

// Standard App Insights columns offered per field. pagePath depends on which
// event table is present; the others are always-plausible builtin columns.
function builtinCandidates(field, tables) {
  switch (field) {
    case "canonicalUserId":
      return [
        { source: "user_AuthenticatedId", expr: mappingExpressions.userId.authenticated, label: "Authenticated user id" },
        { source: "user_Id", expr: mappingExpressions.userId.anonymous, label: "Anonymous user id" },
      ];
    case "canonicalSessionId": {
      const out = [{ source: "session_Id", expr: mappingExpressions.sessionId.session, label: "Session id" }];
      if (tables?.requests) {
        out.push({ source: "operation_Id", expr: mappingExpressions.sessionId.operation, label: "Operation id (fallback)" });
      }
      return out;
    }
    case "canonicalPagePath": {
      const pageTable = tables?.pageViews ? "pageViews" : tables?.requests ? "requests" : null;
      if (!pageTable) return [];
      return [
        { source: `${pageTable}.url`, expr: mappingExpressions.pagePath.urlPath, label: `${pageTable} URL path` },
        { source: `${pageTable}.name`, expr: mappingExpressions.pagePath.namePath, label: `${pageTable} name` },
      ];
    }
    case "canonicalReferrer":
      return [
        { source: "customDimensions.refUri", expr: mappingExpressions.referrer.refUri, label: "refUri" },
        { source: "customDimensions.referrer", expr: mappingExpressions.referrer.referrer, label: "referrer" },
        { source: "customDimensions.http.request.header.referer", expr: mappingExpressions.referrer.headerReferer, label: "Referer header" },
      ];
    default:
      return [];
  }
}

// Collapse the scan's per-table customDimensions rows into one entry per key,
// aggregating the tables it appears in and the richest cardinality / samples.
function indexCustomDimensions(customDimensions) {
  const byKey = new Map();
  for (const cd of Array.isArray(customDimensions) ? customDimensions : []) {
    const key = cd?.keyName;
    if (typeof key !== "string" || !SAFE_CUSTOM_KEY.test(key)) continue;
    const entry = byKey.get(key) || { keyName: key, tables: [], cardinality: null, occurrences: null, samples: [] };
    if (cd.tableName && !entry.tables.includes(cd.tableName)) entry.tables.push(cd.tableName);
    if (typeof cd.cardinality === "number") entry.cardinality = Math.max(entry.cardinality ?? 0, cd.cardinality);
    if (typeof cd.occurrences === "number") entry.occurrences = Math.max(entry.occurrences ?? 0, cd.occurrences);
    for (const s of Array.isArray(cd.samples) ? cd.samples : []) {
      if (entry.samples.length < 3 && !entry.samples.includes(s)) entry.samples.push(s);
    }
    byKey.set(key, entry);
  }
  return byKey;
}

function customConfidence(score, tableCount) {
  if (score === 2) return tableCount >= 2 ? "high" : "medium";
  if (score === 1) return "medium";
  return "low";
}

/**
 * Build the per-field candidate palette from a scan payload.
 *
 * @param {object} scan - `scan.payload` (tables, customDimensions, ...).
 * @returns {Record<string, Array<{source, expr, kind, confidence, label, recommended, meta}>>}
 *   Keyed by canonical field. `kind` is "builtin" | "custom". Custom
 *   dimensions that match the field's aliases rank first (and the very top one
 *   is flagged `recommended`); every other safe custom dimension is still
 *   offered (kind "custom", low confidence) so the user can map an
 *   oddly-named field by hand.
 */
export function buildFieldPalette(scan) {
  const tables = scan?.tables || {};
  const cdByKey = indexCustomDimensions(scan?.customDimensions);
  const palette = {};

  for (const [field, aliasKey] of Object.entries(CANONICAL_TO_ALIAS)) {
    const alias = ALIASES[aliasKey];
    const candidates = builtinCandidates(field, tables).map((c) => ({
      source: c.source,
      expr: c.expr,
      kind: "builtin",
      confidence: "high",
      label: c.label,
      recommended: false,
      meta: null,
    }));

    // Custom dimensions: matched (alias/pattern) first, ranked by score then
    // reach; non-matching ones appended so nothing is hidden from the user.
    const scored = [];
    for (const entry of cdByKey.values()) {
      const score = aliasScore(entry.keyName, alias);
      scored.push({ entry, score });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.entry.occurrences ?? 0) - (a.entry.occurrences ?? 0);
    });

    let topMatchAssigned = false;
    for (const { entry, score } of scored) {
      const candidate = {
        source: `customDimensions.${entry.keyName}`,
        expr: customExpr(entry.keyName),
        kind: "custom",
        confidence: customConfidence(score, entry.tables.length),
        label: entry.keyName,
        recommended: false,
        meta: {
          cardinality: entry.cardinality,
          occurrences: entry.occurrences,
          tables: entry.tables.slice(),
          samples: entry.samples.slice(),
        },
      };
      if (score > 0 && !topMatchAssigned) {
        candidate.recommended = true;
        topMatchAssigned = true;
      }
      candidates.push(candidate);
    }

    palette[field] = candidates;
  }

  return palette;
}
