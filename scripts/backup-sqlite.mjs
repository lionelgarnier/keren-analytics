#!/usr/bin/env node
/**
 * Hourly backup of data/keren.db using SQLite's VACUUM INTO (atomic,
 * online-safe). Keeps the most recent 24 snapshots in data/backups/.
 *
 * Designed for Azure Container Apps Jobs cron (hourly). Off-host upload
 * to Azure Blob is a separate concern — wire that around this script
 * (e.g. `node scripts/backup-sqlite.mjs && az storage blob upload ...`).
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = process.env.KEREN_DB_PATH || path.resolve("data", "keren.db");
const BACKUP_DIR = process.env.KEREN_BACKUP_DIR || path.resolve("data", "backups");
const MAX_SNAPSHOTS = Number(process.env.KEREN_BACKUP_MAX || 24);

if (!fs.existsSync(DB_PATH)) {
  console.error(`[backup] DB not found at ${DB_PATH} — nothing to back up.`);
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const snapshotPath = path.join(BACKUP_DIR, `keren-${stamp}.db`);

const db = new DatabaseSync(DB_PATH);
try {
  db.exec(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);
} finally {
  db.close();
}

const snapshots = fs
  .readdirSync(BACKUP_DIR)
  .filter((f) => f.startsWith("keren-") && f.endsWith(".db"))
  .map((f) => ({ name: f, path: path.join(BACKUP_DIR, f) }))
  .sort((a, b) => (a.name < b.name ? 1 : -1));

const toDelete = snapshots.slice(MAX_SNAPSHOTS);
for (const old of toDelete) {
  fs.rmSync(old.path, { force: true });
}

console.log(
  `[backup] snapshot ${path.basename(snapshotPath)} (kept ${Math.min(snapshots.length, MAX_SNAPSHOTS)}, pruned ${toDelete.length})`
);
