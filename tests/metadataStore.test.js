import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  getTenant,
  updateTenant,
  logStateTransition,
  __resetForTests,
} from "../src/core/metadataStore.js";

function freshTenantId(label) {
  return `${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function withFreshStore(envOverrides = {}) {
  const previous = {};
  for (const key of Object.keys(envOverrides)) {
    previous[key] = process.env[key];
    if (envOverrides[key] === undefined) delete process.env[key];
    else process.env[key] = envOverrides[key];
  }
  __resetForTests();
  return () => {
    __resetForTests();
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
}

test("getTenant auto-creates a tenant with default fields", () => {
  const restore = withFreshStore();
  try {
    const tenantId = freshTenantId("create");
    const tenant = getTenant(tenantId);
    assert.equal(tenant.selectedResource, null);
    assert.equal(tenant.mapping, null);
    assert.equal(tenant.schemaProfile, null);
    assert.equal(tenant.readinessReport, null);
    assert.equal(tenant.dashboardConfig, null);
    assert.equal(tenant.discoveryCache, null);
    assert.deepEqual(tenant.stateTransitions, []);
    assert.ok(tenant.lastAccessedAt);
  } finally {
    restore();
  }
});

test("updateTenant patches only listed fields and roundtrips JSON shapes", () => {
  const restore = withFreshStore();
  try {
    const tenantId = freshTenantId("patch");
    getTenant(tenantId);

    const mapping = {
      version: "v3",
      columns: { userId: "user_AuthenticatedId", sessionId: "session_Id" },
      derived: [{ name: "isReturning", expr: "count_distinct(userId) > 1" }],
    };
    updateTenant(tenantId, { mapping });

    const after = getTenant(tenantId);
    assert.deepEqual(after.mapping, mapping);
    assert.equal(after.selectedResource, null, "untouched fields stay null");
    assert.equal(after.schemaProfile, null);

    updateTenant(tenantId, {
      selectedResource: { resourceId: "/subs/x", subscriptionId: "x" },
    });
    const next = getTenant(tenantId);
    assert.deepEqual(next.mapping, mapping, "previous patch must persist");
    assert.equal(next.selectedResource.resourceId, "/subs/x");
  } finally {
    restore();
  }
});

test("logStateTransition appends ordered entries with detail", () => {
  const restore = withFreshStore();
  try {
    const tenantId = freshTenantId("transitions");
    logStateTransition(tenantId, { state: "DISCOVERING_RESOURCES" });
    logStateTransition(tenantId, { state: "CHECKING_ACCESS", detail: "auto" });
    logStateTransition(tenantId, { state: "READY" });

    const tenant = getTenant(tenantId);
    assert.equal(tenant.stateTransitions.length, 3);
    assert.equal(tenant.stateTransitions[0].state, "DISCOVERING_RESOURCES");
    assert.equal(tenant.stateTransitions[1].state, "CHECKING_ACCESS");
    assert.equal(tenant.stateTransitions[1].detail, "auto");
    assert.equal(tenant.stateTransitions[2].state, "READY");
    assert.ok(tenant.stateTransitions[2].timestamp);
  } finally {
    restore();
  }
});

test("logStateTransition caps history at maxStateTransitions", () => {
  const restore = withFreshStore();
  try {
    const tenantId = freshTenantId("cap");
    const cap = 200;
    for (let i = 0; i < cap + 25; i++) {
      logStateTransition(tenantId, { state: `STATE_${i}` });
    }
    const tenant = getTenant(tenantId);
    assert.equal(tenant.stateTransitions.length, cap);
    // Oldest 25 should have been pruned, so the first remaining is STATE_25.
    assert.equal(tenant.stateTransitions[0].state, "STATE_25");
    assert.equal(tenant.stateTransitions[cap - 1].state, `STATE_${cap + 24}`);
  } finally {
    restore();
  }
});

test("sequential updates from many transitions don't lose data", () => {
  const restore = withFreshStore();
  try {
    const tenantId = freshTenantId("burst");
    const N = 50;
    for (let i = 0; i < N; i++) {
      logStateTransition(tenantId, { state: `S${i}`, detail: `n=${i}` });
    }
    const tenant = getTenant(tenantId);
    assert.equal(tenant.stateTransitions.length, N);
    for (let i = 0; i < N; i++) {
      assert.equal(tenant.stateTransitions[i].state, `S${i}`);
      assert.equal(tenant.stateTransitions[i].detail, `n=${i}`);
    }
  } finally {
    restore();
  }
});

test("legacy data/store.json is migrated and renamed to .legacy", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keren-migrate-"));
  const legacyPath = path.join(tmpDir, "store.json");
  const legacyBackup = legacyPath + ".legacy";

  const legacyData = {
    tenants: {
      "tenant-A": {
        selectedResource: { resourceId: "/subs/A", subscriptionId: "subA" },
        mapping: { version: "v1", columns: { userId: "user_Id" } },
        schemaProfile: null,
        readinessReport: { overallStatus: "READY" },
        dashboardConfig: null,
        discoveryCache: null,
        stateTransitions: [
          { state: "DISCOVERING_RESOURCES", timestamp: "2026-01-01T00:00:00.000Z" },
          { state: "READY", timestamp: "2026-01-01T00:00:05.000Z" },
        ],
        lastAccessedAt: "2026-01-01T00:00:05.000Z",
      },
      "tenant-B": {
        selectedResource: null,
        mapping: null,
        schemaProfile: null,
        readinessReport: null,
        dashboardConfig: null,
        discoveryCache: null,
        stateTransitions: [],
        lastAccessedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  };
  fs.writeFileSync(legacyPath, JSON.stringify(legacyData));

  const restore = withFreshStore({ KEREN_LEGACY_STORE_PATH: legacyPath });
  try {
    const a = getTenant("tenant-A");
    assert.deepEqual(a.selectedResource, { resourceId: "/subs/A", subscriptionId: "subA" });
    assert.deepEqual(a.mapping, { version: "v1", columns: { userId: "user_Id" } });
    assert.deepEqual(a.readinessReport, { overallStatus: "READY" });
    assert.equal(a.stateTransitions.length, 2);
    assert.equal(a.stateTransitions[0].state, "DISCOVERING_RESOURCES");

    const b = getTenant("tenant-B");
    assert.equal(b.selectedResource, null);
    assert.deepEqual(b.stateTransitions, []);

    assert.equal(fs.existsSync(legacyPath), false, "legacy file should be renamed");
    assert.equal(fs.existsSync(legacyBackup), true, "renamed legacy file should exist");
  } finally {
    restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("migration is skipped (file just renamed) when the DB already has tenants", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keren-migrate-skip-"));
  const legacyPath = path.join(tmpDir, "store.json");

  // First boot: populate the in-memory DB.
  const firstRestore = withFreshStore();
  try {
    updateTenant("existing-tenant", {
      mapping: { version: "v-existing" },
    });
  } finally {
    firstRestore();
  }

  // node:test runs each `test(...)` sequentially in the same process, so the
  // in-memory DB persists across __resetForTests() only if we keep the
  // connection open. Since closeDb() destroys :memory:, simulate "already
  // populated" by using a tmp file DB instead.
  const dbPath = path.join(tmpDir, "keren.db");
  fs.writeFileSync(legacyPath, JSON.stringify({
    tenants: {
      "legacy-only": {
        selectedResource: null, mapping: null, schemaProfile: null,
        readinessReport: null, dashboardConfig: null, discoveryCache: null,
        stateTransitions: [], lastAccessedAt: "2026-01-01T00:00:00Z",
      },
    },
  }));

  const restore = withFreshStore({
    KEREN_DB_PATH: dbPath,
    KEREN_LEGACY_STORE_PATH: legacyPath,
  });
  try {
    // First call seeds a tenant in the file DB.
    updateTenant("seeded-before-migration", { mapping: { version: "vX" } });
  } finally {
    restore();
  }

  // Now boot again with the same file DB (already populated) and a legacy
  // file. Migration must not run; legacy file must be renamed away.
  const restore2 = withFreshStore({
    KEREN_DB_PATH: dbPath,
    KEREN_LEGACY_STORE_PATH: legacyPath,
  });
  try {
    const seeded = getTenant("seeded-before-migration");
    assert.deepEqual(seeded.mapping, { version: "vX" });

    // The legacy-only tenant should NOT exist (migration skipped).
    const legacyTenant = getTenant("legacy-only");
    assert.equal(legacyTenant.mapping, null, "legacy data must not be imported");

    assert.equal(fs.existsSync(legacyPath), false, "legacy file should still be renamed");
    assert.equal(fs.existsSync(legacyPath + ".legacy"), true);
  } finally {
    restore2();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("getTenant updates lastAccessedAt on every read", async () => {
  const restore = withFreshStore();
  try {
    const tenantId = freshTenantId("touch");
    const first = getTenant(tenantId);
    await new Promise((r) => setTimeout(r, 5));
    const second = getTenant(tenantId);
    assert.notEqual(second.lastAccessedAt, first.lastAccessedAt);
    assert.ok(second.lastAccessedAt > first.lastAccessedAt);
  } finally {
    restore();
  }
});
