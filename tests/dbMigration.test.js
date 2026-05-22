import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { __resetForTests } from "../src/core/metadataStore.js";
import { getDb, closeDb } from "../src/core/db.js";

/**
 * Track-F-era DBs created `scans` / `validations` without a `resource_id`
 * column. Booting through db.js must add the column in place and backfill
 * existing rows from the tenant's selected resource — no data loss for
 * single-resource users across the upgrade.
 */
test("migration adds resource_id and backfills from the tenant's selected resource", () => {
  const dbPath = path.join(os.tmpdir(), `keren-mig-${process.pid}-${Date.now()}.db`);
  const prevDbPath = process.env.KEREN_DB_PATH;
  // KEREN_DB_PATH overrides the :memory: default db.js uses under NODE_ENV=test.
  process.env.KEREN_DB_PATH = dbPath;
  const RES = "/subscriptions/s/resourceGroups/rg/providers/microsoft.insights/components/app-x";
  try {
    // 1. Hand-craft a pre-refactor DB: scans / validations without resource_id.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE tenants (
      id TEXT PRIMARY KEY, selected_resource TEXT, mapping TEXT, schema_profile TEXT,
      readiness_report TEXT, dashboard_config TEXT, discovery_cache TEXT,
      last_accessed_at TEXT NOT NULL)`);
    legacy.exec(`CREATE TABLE scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL,
      scanned_at TEXT NOT NULL, payload TEXT NOT NULL)`);
    legacy.exec(`CREATE TABLE validations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL,
      mapping_id INTEGER, decision TEXT NOT NULL, overrides TEXT, validated_at TEXT NOT NULL)`);
    legacy
      .prepare("INSERT INTO tenants (id, selected_resource, last_accessed_at) VALUES (?, ?, ?)")
      .run("t1", JSON.stringify({ resourceId: RES }), "2026-05-01T00:00:00Z");
    legacy
      .prepare("INSERT INTO scans (tenant_id, scanned_at, payload) VALUES (?, ?, ?)")
      .run("t1", "2026-05-01T00:00:00Z", "{}");
    legacy
      .prepare("INSERT INTO validations (tenant_id, decision, validated_at) VALUES (?, ?, ?)")
      .run("t1", "accept_all", "2026-05-01T00:00:00Z");
    legacy.close();

    // 2. Boot through db.js — applySchema runs migrateResourceIdColumns.
    __resetForTests();
    const db = getDb();

    const scanCols = db.prepare("PRAGMA table_info(scans)").all().map((c) => c.name);
    assert.ok(scanCols.includes("resource_id"), "scans.resource_id added");
    const valCols = db.prepare("PRAGMA table_info(validations)").all().map((c) => c.name);
    assert.ok(valCols.includes("resource_id"), "validations.resource_id added");

    // 3. Existing rows backfilled from tenants.selected_resource.
    const scan = db.prepare("SELECT resource_id FROM scans WHERE tenant_id = ?").get("t1");
    assert.equal(scan.resource_id, RES);
    const val = db.prepare("SELECT resource_id FROM validations WHERE tenant_id = ?").get("t1");
    assert.equal(val.resource_id, RES);
  } finally {
    closeDb();
    __resetForTests();
    if (prevDbPath === undefined) delete process.env.KEREN_DB_PATH;
    else process.env.KEREN_DB_PATH = prevDbPath;
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.rmSync(dbPath + suffix, { force: true }); } catch { /* ignore */ }
    }
  }
});
