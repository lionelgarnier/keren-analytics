import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getDb, closeDb } from "./db.js";

const MAX_STATE_TRANSITIONS = config.maxStateTransitions || 200;

function legacyPath() {
  return process.env.KEREN_LEGACY_STORE_PATH || path.resolve("data", "store.json");
}

function legacyBackupPath() {
  return legacyPath() + ".legacy";
}

const TENANT_JSON_COLUMNS = [
  ["selectedResource", "selected_resource"],
  ["mapping", "mapping"],
  ["schemaProfile", "schema_profile"],
  ["readinessReport", "readiness_report"],
  ["dashboardConfig", "dashboard_config"],
  ["discoveryCache", "discovery_cache"],
];

function toJSON(value) {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

function fromJSON(value) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function defaultTenantRow(now) {
  return {
    selected_resource: null,
    mapping: null,
    schema_profile: null,
    readiness_report: null,
    dashboard_config: null,
    discovery_cache: null,
    last_accessed_at: now,
  };
}

function rowToTenant(row, transitions) {
  return {
    selectedResource: fromJSON(row.selected_resource),
    mapping: fromJSON(row.mapping),
    schemaProfile: fromJSON(row.schema_profile),
    readinessReport: fromJSON(row.readiness_report),
    dashboardConfig: fromJSON(row.dashboard_config),
    discoveryCache: fromJSON(row.discovery_cache),
    stateTransitions: transitions,
    lastAccessedAt: row.last_accessed_at,
  };
}

function withTransaction(db, fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

let migrationDone = false;

function migrateLegacyStoreIfNeeded(db) {
  if (migrationDone) return;
  migrationDone = true;
  const src = legacyPath();
  const dest = legacyBackupPath();
  if (!fs.existsSync(src)) return;

  // If the DB already holds tenants, the migration ran on a prior boot
  // (or a fresh DB was provisioned alongside a stale legacy file).
  // Either way the legacy file should not be re-applied — rename it
  // so it stops being detected and stays available for forensics.
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM tenants").get();
  if (n > 0) {
    fs.renameSync(src, dest);
    return;
  }

  let legacy;
  try {
    legacy = JSON.parse(fs.readFileSync(src, "utf8"));
  } catch {
    return;
  }
  const tenants = legacy?.tenants ?? {};
  const entries = Object.entries(tenants);
  if (entries.length === 0) {
    fs.renameSync(src, dest);
    return;
  }

  const upsert = db.prepare(`
    INSERT INTO tenants (id, selected_resource, mapping, schema_profile,
      readiness_report, dashboard_config, discovery_cache, last_accessed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTransition = db.prepare(`
    INSERT INTO state_transitions (tenant_id, state, detail, timestamp)
    VALUES (?, ?, ?, ?)
  `);
  const now = new Date().toISOString();

  withTransaction(db, () => {
    for (const [id, t] of entries) {
      upsert.run(
        id,
        toJSON(t.selectedResource),
        toJSON(t.mapping),
        toJSON(t.schemaProfile),
        toJSON(t.readinessReport),
        toJSON(t.dashboardConfig),
        toJSON(t.discoveryCache),
        t.lastAccessedAt || now
      );
      const transitions = Array.isArray(t.stateTransitions) ? t.stateTransitions : [];
      const trimmed = transitions.slice(-MAX_STATE_TRANSITIONS);
      for (const tr of trimmed) {
        insertTransition.run(id, tr.state, tr.detail ?? null, tr.timestamp || now);
      }
    }
  });

  fs.renameSync(src, dest);
}

/**
 * Test-only: drop the cached DB connection + reset the one-shot
 * migration guard so the next call to a public function re-bootstraps
 * the store. Lets tests swap KEREN_DB_PATH / KEREN_LEGACY_STORE_PATH
 * between cases without leaking state.
 */
export function __resetForTests() {
  closeDb();
  migrationDone = false;
}

function ensureReady() {
  const db = getDb();
  migrateLegacyStoreIfNeeded(db);
  return db;
}

function loadTransitions(db, tenantId) {
  return db
    .prepare(
      `SELECT state, detail, timestamp
         FROM state_transitions
        WHERE tenant_id = ?
        ORDER BY id ASC`
    )
    .all(tenantId)
    .map((row) => ({
      state: row.state,
      ...(row.detail !== null ? { detail: row.detail } : {}),
      timestamp: row.timestamp,
    }));
}

function insertDefaultTenant(db, tenantId, now) {
  const row = defaultTenantRow(now);
  db.prepare(
    `INSERT INTO tenants (id, selected_resource, mapping, schema_profile,
      readiness_report, dashboard_config, discovery_cache, last_accessed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tenantId,
    row.selected_resource,
    row.mapping,
    row.schema_profile,
    row.readiness_report,
    row.dashboard_config,
    row.discovery_cache,
    row.last_accessed_at
  );
  return row;
}

export function getTenant(tenantId) {
  const db = ensureReady();
  const now = new Date().toISOString();
  let row = db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId);
  if (!row) {
    row = insertDefaultTenant(db, tenantId, now);
  } else {
    db.prepare("UPDATE tenants SET last_accessed_at = ? WHERE id = ?").run(now, tenantId);
    row.last_accessed_at = now;
  }
  const transitions = loadTransitions(db, tenantId);
  return rowToTenant(row, transitions);
}

export function updateTenant(tenantId, patch) {
  const db = ensureReady();
  const now = new Date().toISOString();

  const exists = db.prepare("SELECT 1 FROM tenants WHERE id = ?").get(tenantId);
  if (!exists) {
    insertDefaultTenant(db, tenantId, now);
  }

  const sets = [];
  const params = [];
  for (const [key, column] of TENANT_JSON_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      sets.push(`${column} = ?`);
      params.push(toJSON(patch[key]));
    }
  }
  sets.push("last_accessed_at = ?");
  params.push(now);
  params.push(tenantId);

  db.prepare(`UPDATE tenants SET ${sets.join(", ")} WHERE id = ?`).run(...params);

  const row = db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantId);
  const transitions = loadTransitions(db, tenantId);
  return rowToTenant(row, transitions);
}

export function logStateTransition(tenantId, transition) {
  const db = ensureReady();
  const now = new Date().toISOString();

  withTransaction(db, () => {
    const exists = db.prepare("SELECT 1 FROM tenants WHERE id = ?").get(tenantId);
    if (!exists) {
      insertDefaultTenant(db, tenantId, now);
    } else {
      db.prepare("UPDATE tenants SET last_accessed_at = ? WHERE id = ?").run(now, tenantId);
    }

    db.prepare(
      `INSERT INTO state_transitions (tenant_id, state, detail, timestamp)
       VALUES (?, ?, ?, ?)`
    ).run(tenantId, transition.state, transition.detail ?? null, now);

    // Cap retention: delete the oldest rows above the limit.
    db.prepare(
      `DELETE FROM state_transitions
        WHERE tenant_id = ?
          AND id NOT IN (
            SELECT id FROM state_transitions
             WHERE tenant_id = ?
             ORDER BY id DESC
             LIMIT ?
          )`
    ).run(tenantId, tenantId, MAX_STATE_TRANSITIONS);
  });
}
