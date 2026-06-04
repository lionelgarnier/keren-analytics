import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  createSnapshot,
  restoreLatestSnapshot,
  runBackupOnce,
  snapshotBlobName,
  startBackupScheduler,
} from "../src/core/backupScheduler.js";

/** Build a tiny SQLite DB on disk and return its path. */
function makeFixtureDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keren-backup-test-"));
  const dbPath = path.join(dir, "fixture.db");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    db.exec("INSERT INTO t (v) VALUES ('alpha'), ('beta')");
  } finally {
    db.close();
  }
  return { dir, dbPath };
}

/**
 * Minimal in-memory `ContainerClient` double matching the surface that
 * `runBackupOnce` actually uses: `getBlockBlobClient`, `listBlobsFlat`,
 * `deleteBlob`. The fixture records uploads so tests can assert against
 * the recorded state.
 */
function makeFakeContainerClient() {
  const blobs = new Map();
  return {
    blobs,
    getBlockBlobClient(name) {
      return {
        async uploadFile(filePath) {
          const buf = fs.readFileSync(filePath);
          blobs.set(name, { name, size: buf.length, uploadedAt: Date.now() });
        },
      };
    },
    listBlobsFlat({ prefix }) {
      const matched = Array.from(blobs.values()).filter((b) => b.name.startsWith(prefix));
      return {
        async *[Symbol.asyncIterator]() {
          for (const b of matched) yield b;
        },
      };
    },
    async deleteBlob(name) {
      blobs.delete(name);
    },
  };
}

const silentLogger = { info() {}, warn() {}, error() {} };

/**
 * Restore-side container double. `listBlobsFlat` reports the seeded blob
 * names; `downloadToFile` writes the recorded bytes for the requested
 * snapshot to disk so the restore can be asserted end to end.
 */
function makeFakeRestoreContainer(snapshots = {}) {
  return {
    getBlockBlobClient(name) {
      return {
        async downloadToFile(dest) {
          fs.writeFileSync(dest, snapshots[name] ?? Buffer.from(""));
        },
      };
    },
    listBlobsFlat({ prefix }) {
      const names = Object.keys(snapshots).filter((n) => n.startsWith(prefix));
      return {
        async *[Symbol.asyncIterator]() {
          for (const name of names) yield { name };
        },
      };
    },
  };
}

function restoreBlobService(container) {
  return { getContainerClient: () => container };
}

test("createSnapshot produces a readable copy of the source DB", () => {
  const { dir, dbPath } = makeFixtureDb();
  try {
    const dst = path.join(dir, "snap.db");
    createSnapshot(dbPath, dst);
    assert.ok(fs.existsSync(dst));
    const copy = new DatabaseSync(dst);
    try {
      const rows = copy.prepare("SELECT v FROM t ORDER BY id").all();
      // node:sqlite returns rows with null prototype, so strict deep-equal
      // against object literals fails; map to plain values.
      assert.deepEqual(rows.map((r) => r.v), ["alpha", "beta"]);
    } finally {
      copy.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("snapshotBlobName is lexicographically sortable", () => {
  const a = snapshotBlobName(new Date("2026-05-13T08:00:00.000Z"));
  const b = snapshotBlobName(new Date("2026-05-13T09:00:00.000Z"));
  const c = snapshotBlobName(new Date("2026-05-13T10:00:00.000Z"));
  assert.ok(a < b && b < c, `expected ${a} < ${b} < ${c}`);
  assert.match(a, /^keren-.*\.db$/);
});

test("runBackupOnce uploads a snapshot to the fake container", async () => {
  const { dir, dbPath } = makeFixtureDb();
  const container = makeFakeContainerClient();
  try {
    const result = await runBackupOnce({
      dbPath,
      containerClient: container,
      maxSnapshots: 24,
      logger: silentLogger,
    });
    assert.equal(result.skipped, false);
    assert.equal(container.blobs.size, 1);
    const [blob] = container.blobs.values();
    assert.ok(blob.size > 0);
    assert.equal(result.kept, 1);
    assert.equal(result.pruned, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runBackupOnce prunes blobs beyond maxSnapshots", async () => {
  const { dir, dbPath } = makeFixtureDb();
  const container = makeFakeContainerClient();
  // Seed 3 older blobs that should get pruned when we cap at 2.
  for (const ts of ["2026-05-10", "2026-05-11", "2026-05-12"]) {
    const name = `keren-${ts}T00-00-00-000Z.db`;
    container.blobs.set(name, { name, size: 1, uploadedAt: 0 });
  }
  try {
    const result = await runBackupOnce({
      dbPath,
      containerClient: container,
      maxSnapshots: 2,
      logger: silentLogger,
      now: () => new Date("2026-05-13T00:00:00.000Z"),
    });
    assert.equal(result.skipped, false);
    assert.equal(result.kept, 2);
    assert.equal(result.pruned, 2);
    const names = [...container.blobs.keys()].sort();
    // The most recent two (the fresh upload + the May 12 seed) survive.
    assert.equal(names.length, 2);
    assert.ok(names.includes("keren-2026-05-13T00-00-00-000Z.db"));
    assert.ok(names.includes("keren-2026-05-12T00-00-00-000Z.db"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runBackupOnce returns skipped=true when the DB file is missing", async () => {
  const container = makeFakeContainerClient();
  const result = await runBackupOnce({
    dbPath: "/nonexistent/path/keren.db",
    containerClient: container,
    logger: silentLogger,
  });
  assert.equal(result.skipped, true);
  assert.equal(container.blobs.size, 0);
});

test("restoreLatestSnapshot is a no-op when no blob account is configured", async () => {
  const result = await restoreLatestSnapshot({
    dbPath: "/nonexistent/keren.db",
    blobAccount: "",
    blobServiceClient: null,
    logger: silentLogger,
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "disabled");
});

test("restoreLatestSnapshot skips when a non-empty DB already exists", async () => {
  const { dir, dbPath } = makeFixtureDb();
  const container = makeFakeRestoreContainer({
    "keren-2026-05-13T10-00-00-000Z.db": Buffer.from("newer"),
  });
  try {
    const result = await restoreLatestSnapshot({
      dbPath,
      blobAccount: "ignored",
      blobServiceClient: restoreBlobService(container),
      logger: silentLogger,
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "db-present");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("restoreLatestSnapshot reports no-snapshots when the container is empty", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keren-restore-test-"));
  const dbPath = path.join(dir, "keren.db");
  const container = makeFakeRestoreContainer({});
  try {
    const result = await restoreLatestSnapshot({
      dbPath,
      blobAccount: "ignored",
      blobServiceClient: restoreBlobService(container),
      logger: silentLogger,
    });
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "no-snapshots");
    assert.equal(fs.existsSync(dbPath), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("restoreLatestSnapshot downloads the newest snapshot when the DB is absent", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keren-restore-test-"));
  const dbPath = path.join(dir, "nested", "keren.db");
  const container = makeFakeRestoreContainer({
    "keren-2026-05-11T00-00-00-000Z.db": Buffer.from("oldest"),
    "keren-2026-05-13T10-00-00-000Z.db": Buffer.from("newest"),
    "keren-2026-05-12T00-00-00-000Z.db": Buffer.from("middle"),
  });
  try {
    const result = await restoreLatestSnapshot({
      dbPath,
      blobAccount: "ignored",
      blobServiceClient: restoreBlobService(container),
      logger: silentLogger,
    });
    assert.equal(result.skipped, false);
    assert.equal(result.restored, "keren-2026-05-13T10-00-00-000Z.db");
    // Parent dirs are created and the newest snapshot's bytes land on disk.
    assert.equal(fs.readFileSync(dbPath, "utf8"), "newest");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("startBackupScheduler is a no-op when no blob account is configured", async () => {
  const sched = startBackupScheduler({
    blobAccount: "",
    blobServiceClient: null,
    logger: silentLogger,
  });
  const result = await sched.runOnce();
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "disabled");
  sched.stop();
});

test("startBackupScheduler accepts an injected blobServiceClient", async () => {
  const { dir, dbPath } = makeFixtureDb();
  const container = makeFakeContainerClient();
  const fakeBlobService = {
    getContainerClient() {
      return container;
    },
  };
  try {
    const sched = startBackupScheduler({
      dbPath,
      blobAccount: "ignored",
      blobServiceClient: fakeBlobService,
      logger: silentLogger,
    });
    try {
      const result = await sched.runOnce();
      assert.equal(result.skipped, false);
      assert.equal(container.blobs.size, 1);
    } finally {
      sched.stop();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
