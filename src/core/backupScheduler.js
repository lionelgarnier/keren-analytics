/**
 * In-process SQLite → Azure Blob backup scheduler (ADR 0005 follow-up).
 *
 * Runs inside the main app process (not a separate Container Apps Job): a
 * separate Job can't see the app container's `data/keren.db` without a
 * shared Azure Files mount, which would also slow down every wizard INSERT.
 * Keeping the scheduler in-process lets us trade off RPO ≈ 1h for a much
 * simpler infra footprint (just a Storage Account + Blob container).
 *
 * Each tick:
 *   1. `VACUUM INTO` a temp snapshot file (atomic, online-safe).
 *   2. Upload to Blob via `BlockBlobClient.uploadFile`.
 *   3. Prune to `maxSnapshots` keeping the most recent (lexicographic sort
 *      on ISO timestamps works because `keren-YYYY-MM-DDTHH-MM-SS-mmmZ` is
 *      sortable).
 *
 * Auth: same MI-or-CLI credential chain as `azureFoundry.js`. The MI must
 * hold `Storage Blob Data Contributor` on the Storage Account — granted in
 * `infra/main.bicep`.
 *
 * Disabled when `BACKUP_BLOB_ACCOUNT` is empty (dev / test / first deploy).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Azure SDK imports are lazy: the only consumer is `startBackupScheduler`
// in the production path. Keeping them out of module-load lets tests that
// inject a fake `blobServiceClient` (and the no-op `BACKUP_BLOB_ACCOUNT`
// unset branch) run without `@azure/storage-blob` / `@azure/identity`
// being installed — useful in restricted-network environments and for
// keeping the hot path of the module light.

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1h
const DEFAULT_MAX_SNAPSHOTS = 24;
const INITIAL_DELAY_MS = 60 * 1000; // first snapshot 1 min after boot

async function buildDefaultBlobServiceClient(blobAccount, miClientId) {
  const [{ BlobServiceClient }, { AzureCliCredential, ChainedTokenCredential, ManagedIdentityCredential }] = await Promise.all([
    import("@azure/storage-blob"),
    import("@azure/identity"),
  ]);
  const credentials = [];
  if (process.env.IDENTITY_ENDPOINT || miClientId) {
    credentials.push(
      new ManagedIdentityCredential(miClientId ? { clientId: miClientId } : undefined)
    );
  }
  credentials.push(new AzureCliCredential());
  const credential = new ChainedTokenCredential(...credentials);
  return new BlobServiceClient(`https://${blobAccount}.blob.core.windows.net`, credential);
}

/**
 * Snapshot the DB to a fresh file via `VACUUM INTO`. The destination path
 * must not exist (SQLite refuses to overwrite). Returns the snapshot path.
 */
export function createSnapshot(dbPath, snapshotPath) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  return snapshotPath;
}

/**
 * Build the canonical blob name for a snapshot. Lexicographically sortable
 * by timestamp so the prune step can keep the N most recent without parsing.
 */
export function snapshotBlobName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, "-");
  return `keren-${stamp}.db`;
}

async function listSnapshotBlobs(containerClient) {
  const blobs = [];
  for await (const blob of containerClient.listBlobsFlat({ prefix: "keren-" })) {
    blobs.push(blob);
  }
  return blobs;
}

/**
 * Single-pass backup: snapshot + upload + prune. Exposed for tests and
 * manual triggers; the scheduler just calls this on an interval.
 */
export async function runBackupOnce({
  dbPath,
  containerClient,
  maxSnapshots = DEFAULT_MAX_SNAPSHOTS,
  logger = console,
  now = () => new Date(),
}) {
  if (!fs.existsSync(dbPath)) {
    logger.warn(`[backup] DB not found at ${dbPath} — skipping snapshot`);
    return { skipped: true };
  }

  const blobName = snapshotBlobName(now());
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keren-backup-"));
  const snapshotPath = path.join(tmpDir, blobName);

  try {
    createSnapshot(dbPath, snapshotPath);
    const blockBlob = containerClient.getBlockBlobClient(blobName);
    await blockBlob.uploadFile(snapshotPath);
    logger.info(`[backup] uploaded ${blobName}`);

    const blobs = await listSnapshotBlobs(containerClient);
    blobs.sort((a, b) => (a.name < b.name ? 1 : -1));
    const toDelete = blobs.slice(maxSnapshots);
    for (const old of toDelete) {
      await containerClient.deleteBlob(old.name);
      logger.info(`[backup] pruned ${old.name}`);
    }

    return {
      skipped: false,
      uploaded: blobName,
      kept: Math.min(blobs.length, maxSnapshots),
      pruned: toDelete.length,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Restore the most recent Blob snapshot into `dbPath` when the local DB
 * is absent. The Container Apps filesystem is ephemeral, so every
 * redeploy/restart wipes `data/keren.db`; the hourly backups are
 * otherwise write-only, which means the wizard config (mappings,
 * validations, scans) was silently lost on each deploy. This closes that
 * loop and must run before the first `getDb()` opens the database.
 *
 * Never clobbers an existing non-empty DB — a present file means this
 * replica already holds live state. No-op when backups are disabled
 * (`BACKUP_BLOB_ACCOUNT` unset) or when no snapshot exists yet.
 */
export async function restoreLatestSnapshot({
  dbPath = process.env.KEREN_DB_PATH || path.resolve("data", "keren.db"),
  blobAccount = process.env.BACKUP_BLOB_ACCOUNT,
  blobContainer = process.env.BACKUP_BLOB_CONTAINER || "sqlite-backups",
  miClientId = process.env.AZURE_FOUNDRY_CLIENT_ID,
  blobServiceClient,
  logger = console,
} = {}) {
  if (!blobAccount && !blobServiceClient) {
    logger.info("[restore] BACKUP_BLOB_ACCOUNT not set — restore skipped");
    return { skipped: true, reason: "disabled" };
  }
  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    logger.info(`[restore] ${dbPath} already present — restore skipped`);
    return { skipped: true, reason: "db-present" };
  }

  const client =
    blobServiceClient || (await buildDefaultBlobServiceClient(blobAccount, miClientId));
  const containerClient = client.getContainerClient(blobContainer);

  const blobs = await listSnapshotBlobs(containerClient);
  if (blobs.length === 0) {
    logger.info("[restore] no snapshots found — starting with an empty DB");
    return { skipped: true, reason: "no-snapshots" };
  }
  // Same descending sort as the prune step: the newest snapshot is first.
  blobs.sort((a, b) => (a.name < b.name ? 1 : -1));
  const latest = blobs[0].name;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  await containerClient.getBlockBlobClient(latest).downloadToFile(dbPath);
  logger.info(`[restore] restored ${latest} → ${dbPath}`);
  return { skipped: false, restored: latest };
}

/**
 * Start the recurring scheduler. Returns `{ stop, runOnce }`; callers
 * keep the handle to unwire it (tests, graceful shutdown).
 *
 * When `BACKUP_BLOB_ACCOUNT` is empty, returns a no-op scheduler — that's
 * the dev / test / first-deploy path.
 */
export function startBackupScheduler({
  dbPath = process.env.KEREN_DB_PATH || path.resolve("data", "keren.db"),
  blobAccount = process.env.BACKUP_BLOB_ACCOUNT,
  blobContainer = process.env.BACKUP_BLOB_CONTAINER || "sqlite-backups",
  intervalMs = Number(process.env.BACKUP_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
  maxSnapshots = Number(process.env.BACKUP_MAX_SNAPSHOTS) || DEFAULT_MAX_SNAPSHOTS,
  miClientId = process.env.AZURE_FOUNDRY_CLIENT_ID,
  blobServiceClient,
  logger = console,
} = {}) {
  if (!blobAccount && !blobServiceClient) {
    logger.info("[backup] BACKUP_BLOB_ACCOUNT not set — scheduler disabled");
    return { stop: () => {}, runOnce: async () => ({ skipped: true, reason: "disabled" }) };
  }

  // Resolve the container client lazily on first tick so module-load
  // doesn't pull `@azure/storage-blob` when the scheduler is disabled.
  let containerClientPromise = null;
  async function getContainerClient() {
    if (containerClientPromise) return containerClientPromise;
    containerClientPromise = (async () => {
      const client = blobServiceClient || (await buildDefaultBlobServiceClient(blobAccount, miClientId));
      return client.getContainerClient(blobContainer);
    })();
    return containerClientPromise;
  }

  const runOnce = async () => {
    const containerClient = await getContainerClient();
    return runBackupOnce({ dbPath, containerClient, maxSnapshots, logger });
  };

  const intervalHandle = setInterval(() => {
    runOnce().catch((err) =>
      logger.error("[backup] scheduled run failed:", err?.message || err)
    );
  }, intervalMs);

  const initialHandle = setTimeout(() => {
    runOnce().catch((err) =>
      logger.error("[backup] initial run failed:", err?.message || err)
    );
  }, INITIAL_DELAY_MS);

  logger.info(
    `[backup] scheduler started (account=${blobAccount}, container=${blobContainer}, intervalMs=${intervalMs}, max=${maxSnapshots})`
  );

  return {
    stop: () => {
      clearInterval(intervalHandle);
      clearTimeout(initialHandle);
    },
    runOnce,
  };
}
