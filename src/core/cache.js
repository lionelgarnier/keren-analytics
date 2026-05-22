import crypto from "crypto";

const CLEANUP_INTERVAL_MS = 60 * 1000; // Run cleanup every 60 seconds

export class CacheStore {
  constructor() {
    this.store = new Map();
    // Periodically sweep expired entries to free memory
    this._cleanupTimer = setInterval(() => this._sweep(), CLEANUP_INTERVAL_MS);
    // Allow the process to exit even if the timer is active
    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (ttlMs !== undefined && ttlMs !== null && (typeof ttlMs !== "number" || ttlMs <= 0)) {
      // Invalid ttlMs: treat as no expiration to avoid immediately-expired entries
      ttlMs = null;
    }
    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    this.store.set(key, { value, expiresAt });
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  /** Remove all expired entries from the store */
  _sweep() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

export const cacheStore = new CacheStore();

export function buildCacheKey({
  tenantId,
  resourceId,
  workspaceId,
  queryName,
  timeRangeKey,
  mappingVersion,
}) {
  const raw = [
    tenantId,
    resourceId || "r0",
    workspaceId,
    queryName,
    timeRangeKey,
    mappingVersion || "v0",
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}
