import crypto from "crypto";

export class CacheStore {
  constructor() {
    this.store = new Map();
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
    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    this.store.set(key, { value, expiresAt });
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

export const cacheStore = new CacheStore();

export function buildCacheKey({
  tenantId,
  workspaceId,
  queryName,
  timeRangeKey,
  mappingVersion,
}) {
  const raw = [
    tenantId,
    workspaceId,
    queryName,
    timeRangeKey,
    mappingVersion || "v0",
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}
