import crypto from "crypto";

const CLEANUP_INTERVAL_MS = 60 * 1000; // Run cleanup every 60 seconds

// Hard cap on live entries. A dashboard render writes ~24 entries, so this
// holds roughly the working set of dozens of tenants/ranges. Without a bound
// the Map grew for the whole TTL window — a real memory-leak vector, amplified
// when a churning cache key (pre-fix mapping.version bug) never hit. Eviction
// is LRU: `get` refreshes recency, `set` drops the least-recently-used entry.
const MAX_CACHE_ENTRIES = 1000;

// Bump when the *semantics* of a KQL template change (e.g. dcount -> dcountif).
// mappingVersion only changes on mapping *detection* changes, so it would not
// invalidate caches when a template is edited — this constant fills that gap.
export const KQL_SEMANTICS_VERSION = "3";

export class CacheStore {
  constructor(maxEntries = MAX_CACHE_ENTRIES) {
    this.store = new Map();
    this.maxEntries = maxEntries;
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
    // Refresh recency: re-insert so this key moves to the end (Map preserves
    // insertion order, so the first key is the least-recently-used).
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (ttlMs !== undefined && ttlMs !== null && (typeof ttlMs !== "number" || ttlMs <= 0)) {
      // Invalid ttlMs: treat as no expiration to avoid immediately-expired entries
      ttlMs = null;
    }
    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    // Overwrite refreshes recency too.
    this.store.delete(key);
    this.store.set(key, { value, expiresAt });
    // Evict the least-recently-used entries until under the cap.
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
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
    KQL_SEMANTICS_VERSION,
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}
