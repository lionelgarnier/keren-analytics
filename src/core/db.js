/**
 * SQLite-backed persistence for Keren Analytics (ADR 0005, Track F1).
 *
 * Uses Node 22.5+ native `node:sqlite` (no native build, no extra dep).
 * Single-process / single-replica only — multi-instance deployments are
 * out of scope for V1 (cf. CLAUDE.md "Known gaps").
 *
 * Schema covers all setup/runtime tables (`tenants`, `state_transitions`,
 * `scans`, `mappings`, `signals`, `validations`) used by the setup wizard
 * and per-resource validation flow.
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
    ai_preferences     TEXT,
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
  // Track F2 — schema scans (latest = active, history retained).
  // `resource_id` scopes a scan to one App Insights resource — a tenant
  // can have several. Nullable: pre-migration rows are backfilled from
  // the tenant's selected resource, the rest stay orphaned.
  `CREATE TABLE IF NOT EXISTS scans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    resource_id TEXT,
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
  // Track F4 — user validations on AI proposals. `resource_id` scopes
  // the validation to one App Insights resource (see scans above).
  // mapping_id is ON DELETE SET NULL (not CASCADE): a validation is the ONLY
  // record of "this resource is configured" (+ its overrides). Scans are pruned
  // past a retention cap, and mappings cascade from scans, so a CASCADE here
  // silently deleted the user's config after enough re-scans. SET NULL keeps
  // the validation; validationStore tolerates a null mapping_id.
  `CREATE TABLE IF NOT EXISTS validations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    resource_id   TEXT,
    mapping_id    INTEGER REFERENCES mappings(id) ON DELETE SET NULL,
    decision      TEXT NOT NULL,
    overrides     TEXT,
    validated_at  TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_validations_tenant
     ON validations(tenant_id, validated_at DESC)`,
  // Persistent session store (replaces express-session MemoryStore). `data` is
  // the AES-256-GCM-encrypted session blob (carries the Azure refresh token).
  // Survives redeploys via the same Blob backup/restore as the rest of the DB.
  `CREATE TABLE IF NOT EXISTS sessions (
    sid      TEXT PRIMARY KEY,
    data     TEXT NOT NULL,
    expires  INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires)`,
  // Daily LLM spend accounting — persisted so the cap survives a redeploy
  // (in-memory state reset the cap to "per process lifetime", not per day).
  `CREATE TABLE IF NOT EXISTS ai_quota (
    day_key     TEXT PRIMARY KEY,
    spend_eur   REAL NOT NULL DEFAULT 0,
    call_count  INTEGER NOT NULL DEFAULT 0
  )`,
];

/**
 * Indexes that reference `resource_id` — created only after
 * migrateResourceIdColumns() has guaranteed the column exists, so an
 * upgraded DB doesn't fail the index DDL before the ALTER TABLE runs.
 */
const RESOURCE_SCOPED_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_scans_tenant_resource
     ON scans(tenant_id, resource_id, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_validations_tenant_resource
     ON validations(tenant_id, resource_id, validated_at DESC)`,
];

/**
 * Track-F-era DBs created `scans` / `validations` without `resource_id`
 * (setup state was tenant-scoped, mono-resource). Add the column in
 * place and backfill existing rows from each tenant's currently
 * selected resource, so single-resource users keep their setup across
 * the upgrade. Idempotent: the column check makes re-runs a no-op.
 */
function migrateResourceIdColumns(db) {
  for (const table of ["scans", "validations"]) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (columns.some((c) => c.name === "resource_id")) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN resource_id TEXT`);
    backfillResourceId(db, table);
  }
}

/**
 * Track-F-era DBs created `tenants` without `ai_preferences` (the
 * per-resource "configure with / without AI" choice — see the AI setup
 * disclosure work). Add it in place; the column check makes re-runs a
 * no-op. New rows default to NULL = no opt-out (AI on per config).
 */
function migrateTenantColumns(db) {
  const columns = db.prepare("PRAGMA table_info(tenants)").all();
  if (!columns.some((c) => c.name === "ai_preferences")) {
    db.exec("ALTER TABLE tenants ADD COLUMN ai_preferences TEXT");
  }
}

/**
 * Older DBs created `validations.mapping_id` with ON DELETE CASCADE, which
 * silently deleted a tenant's config when the referenced scan/mapping was
 * pruned. Rebuild the table with ON DELETE SET NULL. SQLite can't ALTER a
 * foreign key, so we recreate + copy. Idempotent: skipped once the FK is
 * already SET NULL. Data-preserving.
 */
function migrateValidationsFk(db) {
  const fks = db.prepare("PRAGMA foreign_key_list(validations)").all();
  const mappingFk = fks.find((f) => f.from === "mapping_id" && f.table === "mappings");
  // `on_delete` reads "CASCADE" on old DBs, "SET NULL" once migrated.
  if (!mappingFk || mappingFk.on_delete === "SET NULL") return;

  // FK enforcement must be off while we swap the table (also required for the
  // rebuild to not trip on the transient state). Restore it after.
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`CREATE TABLE validations_new (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      resource_id   TEXT,
      mapping_id    INTEGER REFERENCES mappings(id) ON DELETE SET NULL,
      decision      TEXT NOT NULL,
      overrides     TEXT,
      validated_at  TEXT NOT NULL
    )`);
    db.exec(`INSERT INTO validations_new (id, tenant_id, resource_id, mapping_id, decision, overrides, validated_at)
             SELECT id, tenant_id, resource_id, mapping_id, decision, overrides, validated_at FROM validations`);
    db.exec("DROP TABLE validations");
    db.exec("ALTER TABLE validations_new RENAME TO validations");
    // The dropped table took its indexes with it — recreate the non-resource
    // one here (the resource-scoped index is (re)built by RESOURCE_SCOPED_INDEXES
    // after this migration runs).
    db.exec(`CREATE INDEX IF NOT EXISTS idx_validations_tenant
             ON validations(tenant_id, validated_at DESC)`);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function backfillResourceId(db, table) {
  const tenants = db
    .prepare("SELECT id, selected_resource FROM tenants WHERE selected_resource IS NOT NULL")
    .all();
  const update = db.prepare(
    `UPDATE ${table} SET resource_id = ? WHERE tenant_id = ? AND resource_id IS NULL`
  );
  for (const row of tenants) {
    // Declared without an initializer: both branches below assign it, so a
    // `= null` here would be dead (flagged by no-useless-assignment).
    let resourceId;
    try {
      resourceId = JSON.parse(row.selected_resource)?.resourceId || null;
    } catch {
      resourceId = null;
    }
    if (resourceId) update.run(resourceId, row.id);
  }
}

function applySchema(db) {
  db.exec("PRAGMA foreign_keys = ON");
  // WAL gives concurrent readers without blocking writers; safe on a
  // single-replica deployment and a no-op for `:memory:`.
  if (dbPathInUse !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
    // Wait (up to 5s) instead of throwing SQLITE_BUSY when the backup
    // scheduler's second connection holds a lock (VACUUM INTO / SIGTERM
    // snapshot). Without this a redeploy mid-traffic could fail the final
    // snapshot and lose config.
    db.exec("PRAGMA busy_timeout = 5000");
  }
  for (const stmt of SCHEMA_STATEMENTS) {
    db.exec(stmt);
  }
  // Must run after the CREATE TABLE pass (so the tables exist) and
  // before the resource-scoped indexes (which reference the column).
  migrateResourceIdColumns(db);
  migrateTenantColumns(db);
  migrateValidationsFk(db);
  for (const stmt of RESOURCE_SCOPED_INDEXES) {
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
