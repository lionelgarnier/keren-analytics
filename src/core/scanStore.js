/**
 * SQLite-backed access for the `scans` table (Track F2 — ADR 0005).
 *
 * Scans are scoped per `(tenant_id, resource_id)` — one tenant can hold
 * several App Insights resources, each with its own setup state. The
 * latest scan for a resource is the active one for mapping/dashboard
 * purposes; older scans are retained as history (capped). F3's AI
 * mapping cache references scans by id.
 */
import { getDb } from "./db.js";
import { getTenant } from "./metadataStore.js";

const DEFAULT_RETENTION = 50;

export function persistScan(tenantId, resourceId, payload, { retention = DEFAULT_RETENTION } = {}) {
  // Foreign key: scans.tenant_id REFERENCES tenants(id). Touch the
  // tenant first so a scan written before any other tenant write
  // succeeds without a constraint violation.
  getTenant(tenantId);

  const db = getDb();
  const scannedAt = payload?.scannedAt || new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO scans (tenant_id, resource_id, scanned_at, payload) VALUES (?, ?, ?, ?)")
    .run(tenantId, resourceId, scannedAt, JSON.stringify(payload));

  // Trim history beyond `retention` per resource — keep the most recent
  // N rows by id (id is monotonic, so equivalent to "most recent").
  db.prepare(
    `DELETE FROM scans
       WHERE tenant_id = ?
         AND resource_id IS ?
         AND id NOT IN (
           SELECT id FROM scans
            WHERE tenant_id = ?
              AND resource_id IS ?
            ORDER BY id DESC
            LIMIT ?
         )`
  ).run(tenantId, resourceId, tenantId, resourceId, retention);

  return { id: Number(lastInsertRowid), scannedAt };
}

export function getLatestScan(tenantId, resourceId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, scanned_at, payload
         FROM scans
        WHERE tenant_id = ? AND resource_id IS ?
        ORDER BY id DESC
        LIMIT 1`
    )
    .get(tenantId, resourceId);
  if (!row) return null;
  return {
    id: row.id,
    scannedAt: row.scanned_at,
    payload: JSON.parse(row.payload),
  };
}

export function listScans(tenantId, resourceId, { limit = 20 } = {}) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, scanned_at
         FROM scans
        WHERE tenant_id = ? AND resource_id IS ?
        ORDER BY id DESC
        LIMIT ?`
    )
    .all(tenantId, resourceId, limit)
    .map((r) => ({ id: r.id, scannedAt: r.scanned_at }));
}

/** Distinct resource IDs that have at least one scan — drives the hub's
 *  "setup incomplete" status (scanned but not validated). */
export function getScannedResourceIds(tenantId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT DISTINCT resource_id
         FROM scans
        WHERE tenant_id = ? AND resource_id IS NOT NULL`
    )
    .all(tenantId)
    .map((r) => r.resource_id);
}
