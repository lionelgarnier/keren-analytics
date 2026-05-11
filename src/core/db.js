/**
 * SQLite-backed persistence for Keren Analytics (ADR 0005, Track F1).
 *
 * Uses Node 22.5+ native `node:sqlite` (no native build, no extra dep).
 * Single-process / single-replica only — multi-instance deployments are
 * out of scope for V1 (cf. CLAUDE.md "Known gaps").
 *
 * Schema covers all Track F tables, but only `tenants` and
 * `state_transitions` are wired in F1; `scans / mappings / signals /
 * validations` are placeholders for F2-F4.
 */

// node:sqlite emits an ExperimentalWarning on import (still flagged
// experimental in Node 22.x even though the API is stable enough for
// our use). Suppress via `--disable-warning=ExperimentalWarning` in
// the npm scripts that load this module — see package.json.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DB_PATH = path.resolve("data", "keren.db");

/**
 * Resolve the DB path from env, with a `:memory:` default in tests so
 * each test process gets an isolated DB and the suite stays sub-second.
 */
function resolveDbPath() {
  if (process.env.KEREN_DB_PATH) return process.env.KEREN_DB_PATH;
  if (process.env.NODE_ENV === "test") return ":memory:";
  return DEFAULT_DB_PATH;
}

let dbInstance = null;
let dbPathInUse = null;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tenants (
    id                 TEXT PRIMARY KEY,
    selected_resource  TEXT,
    mapping            TEXT,
    schema_profile     TEXT,
    readiness_report   TEXT,
    dashboard_config   TEXT,
    discovery_cache    TEXT,
    last_accessed_at   TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS state_transitions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    state       TEXT NOT NULL,
    detail      TEXT,
    timestamp   TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_state_transitions_tenant
     ON state_transitions(tenant_id, id)`,
  // Track F2 — schema scans (latest = active, history retained)
  `CREATE TABLE IF NOT EXISTS scans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scanned_at  TEXT NOT NULL,
    payload     TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scans_tenant_time
     ON scans(tenant_id, scanned_at DESC)`,
  // Track F3 — AI mapping proposals (cached per scan)
  `CREATE TABLE IF NOT EXISTS mappings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scan_id     INTEGER REFERENCES scans(id) ON DELETE CASCADE,
    source      TEXT NOT NULL,
    proposals   TEXT NOT NULL,
    degraded    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mappings_tenant_scan
     ON mappings(tenant_id, scan_id)`,
  // Track F2/F3 — present / missing signals + recommended KQL
  `CREATE TABLE IF NOT EXISTS signals (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    scan_id          INTEGER REFERENCES scans(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    status           TEXT NOT NULL,
    recommended_kql  TEXT,
    created_at       TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_signals_tenant_scan
     ON signals(tenant_id, scan_id)`,
  // Track F4 — user validations on AI proposals
  `CREATE TABLE IF NOT EXISTS validations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    mapping_id    INTEGER REFERENCES mappings(id) ON DELETE CASCADE,
    decision      TEXT NOT NULL,
    overrides     TEXT,
    validated_at  TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_validations_tenant
     ON validations(tenant_id, validated_at DESC)`,
];

function applySchema(db) {
  db.exec("PRAGMA foreign_keys = ON");
  // WAL gives concurrent readers without blocking writers; safe on a
  // single-replica deployment and a no-op for `:memory:`.
  if (dbPathInUse !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
  }
  for (const stmt of SCHEMA_STATEMENTS) {
    db.exec(stmt);
  }
}

export function getDb() {
  if (dbInstance) return dbInstance;
  dbPathInUse = resolveDbPath();
  if (dbPathInUse !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPathInUse), { recursive: true });
  }
  dbInstance = new DatabaseSync(dbPathInUse);
  applySchema(dbInstance);
  return dbInstance;
}

/**
 * Close the current DB connection and forget it. Tests use this to
 * reset between cases when they want a clean slate.
 */
export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPathInUse = null;
  }
}

export function getDbPath() {
  return dbPathInUse;
}
