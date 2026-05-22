import test from "node:test";
import assert from "node:assert/strict";

import { __resetForTests } from "../src/core/metadataStore.js";
import {
  persistScan,
  getLatestScan,
  listScans,
  getScannedResourceIds,
} from "../src/core/scanStore.js";

function freshTenant(label) {
  return `${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const RES = "/subscriptions/s/resourceGroups/rg/providers/microsoft.insights/components/app-a";
const RES_B = "/subscriptions/s/resourceGroups/rg/providers/microsoft.insights/components/app-b";

function withFreshDb() {
  __resetForTests();
  return () => __resetForTests();
}

test("persistScan + getLatestScan round-trip", () => {
  const restore = withFreshDb();
  try {
    const tenantId = freshTenant("rt");
    const payload = {
      scannedAt: "2026-05-11T10:00:00.000Z",
      tables: { pageViews: true },
      customDimensions: [{ keyName: "page", samples: ["/"], cardinality: 28, occurrences: 1200 }],
      eventNames: [{ name: "checkout_started", count: 320 }],
      gaps: [{ id: "no-user-id", severity: "high", title: "x", detail: "y" }],
    };
    const inserted = persistScan(tenantId, RES, payload);
    assert.ok(inserted.id > 0);
    assert.equal(inserted.scannedAt, payload.scannedAt);

    const latest = getLatestScan(tenantId, RES);
    assert.equal(latest.id, inserted.id);
    assert.equal(latest.scannedAt, payload.scannedAt);
    assert.deepEqual(latest.payload, payload);
  } finally {
    restore();
  }
});

test("getLatestScan returns null when no scans exist for the tenant", () => {
  const restore = withFreshDb();
  try {
    assert.equal(getLatestScan(freshTenant("none"), RES), null);
  } finally {
    restore();
  }
});

test("getLatestScan returns the most recent insert", () => {
  const restore = withFreshDb();
  try {
    const tenantId = freshTenant("recent");
    persistScan(tenantId, RES, { scannedAt: "2026-05-01T00:00:00Z", tables: { pageViews: true } });
    persistScan(tenantId, RES, { scannedAt: "2026-05-10T00:00:00Z", tables: { pageViews: true, requests: true } });
    const latest = getLatestScan(tenantId, RES);
    assert.equal(latest.scannedAt, "2026-05-10T00:00:00Z");
    assert.deepEqual(latest.payload.tables, { pageViews: true, requests: true });
  } finally {
    restore();
  }
});

test("scans are isolated per resource", () => {
  const restore = withFreshDb();
  try {
    const tenantId = freshTenant("iso");
    persistScan(tenantId, RES, { scannedAt: "2026-05-01T00:00:00Z", tables: { pageViews: true } });
    persistScan(tenantId, RES_B, { scannedAt: "2026-05-02T00:00:00Z", tables: { requests: true } });

    assert.deepEqual(getLatestScan(tenantId, RES).payload.tables, { pageViews: true });
    assert.deepEqual(getLatestScan(tenantId, RES_B).payload.tables, { requests: true });

    const scanned = getScannedResourceIds(tenantId).sort();
    assert.deepEqual(scanned, [RES, RES_B].sort());
  } finally {
    restore();
  }
});

test("listScans returns scans descending and respects limit", () => {
  const restore = withFreshDb();
  try {
    const tenantId = freshTenant("list");
    for (let i = 0; i < 5; i++) {
      persistScan(tenantId, RES, { scannedAt: `2026-05-0${i + 1}T00:00:00Z`, tables: {} });
    }
    const all = listScans(tenantId, RES);
    assert.equal(all.length, 5);
    // Newest first.
    assert.ok(all[0].id > all[4].id);

    const limited = listScans(tenantId, RES, { limit: 2 });
    assert.equal(limited.length, 2);
  } finally {
    restore();
  }
});

test("persistScan trims history beyond the retention cap", () => {
  const restore = withFreshDb();
  try {
    const tenantId = freshTenant("retention");
    const retention = 3;
    for (let i = 0; i < retention + 4; i++) {
      persistScan(
        tenantId,
        RES,
        { scannedAt: `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00Z`, tables: {} },
        { retention }
      );
    }
    const remaining = listScans(tenantId, RES, { limit: 100 });
    assert.equal(remaining.length, retention);
  } finally {
    restore();
  }
});

test("persistScan retention is scoped per resource", () => {
  const restore = withFreshDb();
  try {
    const tenantId = freshTenant("retention-scope");
    const retention = 2;
    for (let i = 0; i < 4; i++) {
      persistScan(tenantId, RES, { scannedAt: `2026-05-0${i + 1}T00:00:00Z`, tables: {} }, { retention });
    }
    persistScan(tenantId, RES_B, { scannedAt: "2026-05-09T00:00:00Z", tables: {} }, { retention });
    // Trimming RES must not touch RES_B's single scan.
    assert.equal(listScans(tenantId, RES, { limit: 100 }).length, retention);
    assert.equal(listScans(tenantId, RES_B, { limit: 100 }).length, 1);
  } finally {
    restore();
  }
});

test("persistScan auto-creates the tenant row (no FK violation)", () => {
  const restore = withFreshDb();
  try {
    const tenantId = freshTenant("fresh");
    // No prior getTenant / updateTenant — persistScan must seed it.
    const inserted = persistScan(tenantId, RES, { scannedAt: "2026-05-11T00:00:00Z", tables: {} });
    assert.ok(inserted.id > 0);
    assert.ok(getLatestScan(tenantId, RES));
  } finally {
    restore();
  }
});
