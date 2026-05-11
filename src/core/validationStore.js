/**
 * SQLite-backed access for the `validations` table — Track F4 (ADR 0005).
 *
 * One row per "save & continue" click in the setup wizard. The latest
 * validation is the active one; mapping.js / orchestrator apply its
 * overrides on top of the deterministic mapping (Layer 3 of the
 * resolution chain in docs/backlog/ai-environment-analysis.md).
 *
 * `decision` semantics:
 *   - "accept_all"  : user accepted every AI proposal — overrides=null,
 *                     mapping_id points at the accepted mapping row.
 *   - "override"    : user changed at least one field — overrides JSON
 *                     carries `{ <canonical>: { source, expr } }`.
 *   - "reject"      : user explicitly chose to ignore AI proposals —
 *                     overrides=null, mapping_id may still be set for
 *                     audit (we know what was offered).
 */
import { getDb } from "./db.js";
import { getTenant } from "./metadataStore.js";

const ALLOWED_DECISIONS = new Set(["accept_all", "override", "reject"]);

export function persistValidation(tenantId, { mappingId = null, decision, overrides = null }) {
  if (!ALLOWED_DECISIONS.has(decision)) {
    throw new Error(`validationStore: invalid decision "${decision}"`);
  }
  getTenant(tenantId);

  const db = getDb();
  const validatedAt = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO validations (tenant_id, mapping_id, decision, overrides, validated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      tenantId,
      mappingId,
      decision,
      overrides ? JSON.stringify(overrides) : null,
      validatedAt
    );
  return { id: Number(lastInsertRowid), validatedAt };
}

function rowToValidation(row) {
  return {
    id: row.id,
    mappingId: row.mapping_id,
    decision: row.decision,
    overrides: row.overrides ? JSON.parse(row.overrides) : null,
    validatedAt: row.validated_at,
  };
}

export function getActiveValidation(tenantId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, mapping_id, decision, overrides, validated_at
         FROM validations
        WHERE tenant_id = ?
        ORDER BY id DESC
        LIMIT 1`
    )
    .get(tenantId);
  return row ? rowToValidation(row) : null;
}

export function listValidations(tenantId, { limit = 20 } = {}) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, mapping_id, decision, overrides, validated_at
         FROM validations
        WHERE tenant_id = ?
        ORDER BY id DESC
        LIMIT ?`
    )
    .all(tenantId, limit)
    .map(rowToValidation);
}
