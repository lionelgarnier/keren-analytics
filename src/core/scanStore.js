/**
 * SQLite-backed access for the `scans` table (Track F2 — ADR 0005).
 *
 * Latest scan is the active one for mapping/dashboard purposes; older
 * scans are retained as history (capped to avoid unbounded growth).
 * F3's AI mapping cache references scans by id.
 */
import { getDb } from "./db.js";
import { getTenant } from "./metadataStore.js";

const DEFAULT_RETENTION = 50;

export function persistScan(tenantId, payload, { retention = DEFAULT_RETENTION } = {}) {
  // Foreign key: scans.tenant_id REFERENCES tenants(id). Touch the
  // tenant first so a scan written before any other tenant write
  // succeeds without a constraint violation.
  getTenant(tenantId);

  const db = getDb();
  const scannedAt = payload?.scannedAt || new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO scans (tenant_id, scanned_at, payload) VALUES (?, ?, ?)")
    .run(tenantId, scannedAt, JSON.stringify(payload));

  // Trim history beyond `retention` — keep the most recent N rows by id
  // (id is monotonic, so equivalent to "most recent insertions").
  db.prepare(
    `DELETE FROM scans
       WHERE tenant_id = ?
         AND id NOT IN (
           SELECT id FROM scans
            WHERE tenant_id = ?
            ORDER BY id DESC
            LIMIT ?
         )`
  ).run(tenantId, tenantId, retention);

  return { id: Number(lastInsertRowid), scannedAt };
}

export function getLatestScan(tenantId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, scanned_at, payload
         FROM scans
        WHERE tenant_id = ?
        ORDER BY id DESC
        LIMIT 1`
    )
    .get(tenantId);
  if (!row) return null;
  return {
    id: row.id,
    scannedAt: row.scanned_at,
    payload: JSON.parse(row.payload),
  };
}

export function listScans(tenantId, { limit = 20 } = {}) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, scanned_at
         FROM scans
        WHERE tenant_id = ?
        ORDER BY id DESC
        LIMIT ?`
    )
    .all(tenantId, limit)
    .map((r) => ({ id: r.id, scannedAt: r.scanned_at }));
}
