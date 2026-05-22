/**
 * SQLite-backed access for the `mappings` table — Track F3 (ADR 0005).
 *
 * Each row is one AI proposal for one scan. The cache key is `scan_id`:
 * re-loading the dashboard after a successful AI call must not re-spend
 * tokens. Re-scan (new row in `scans`) triggers a new mapping call.
 */
import { getDb } from "./db.js";
import { getTenant } from "./metadataStore.js";

export function persistMapping(tenantId, scanId, { source, proposals, degraded = false }) {
  getTenant(tenantId);
  const db = getDb();
  const createdAt = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO mappings (tenant_id, scan_id, source, proposals, degraded, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      tenantId,
      scanId,
      source,
      JSON.stringify(proposals),
      degraded ? 1 : 0,
      createdAt
    );
  return { id: Number(lastInsertRowid), createdAt };
}

export function getMappingForScan(tenantId, scanId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, scan_id, source, proposals, degraded, created_at
         FROM mappings
        WHERE tenant_id = ? AND scan_id = ?
        ORDER BY id DESC
        LIMIT 1`
    )
    .get(tenantId, scanId);
  if (!row) return null;
  return {
    id: row.id,
    scanId: row.scan_id,
    source: row.source,
    proposals: JSON.parse(row.proposals),
    degraded: !!row.degraded,
    createdAt: row.created_at,
  };
}

/**
 * Latest mapping for one resource. `mappings` has no `resource_id` of
 * its own — it inherits scope from the scan it references, so we join
 * through `scans` to filter by the resource.
 */
export function getLatestMapping(tenantId, resourceId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT m.id, m.scan_id, m.source, m.proposals, m.degraded, m.created_at
         FROM mappings m
         JOIN scans s ON m.scan_id = s.id
        WHERE m.tenant_id = ? AND s.resource_id IS ?
        ORDER BY m.id DESC
        LIMIT 1`
    )
    .get(tenantId, resourceId);
  if (!row) return null;
  return {
    id: row.id,
    scanId: row.scan_id,
    source: row.source,
    proposals: JSON.parse(row.proposals),
    degraded: !!row.degraded,
    createdAt: row.created_at,
  };
}
