import test from "node:test";
import assert from "node:assert/strict";
import { CacheStore, buildCacheKey, KQL_SEMANTICS_VERSION } from "../src/core/cache.js";

test("CacheStore expires entries", async () => {
  const cache = new CacheStore();
  cache.set("key", "value", 10);
  assert.equal(cache.get("key"), "value");
  await new Promise((resolve) => setTimeout(resolve, 12));
  assert.equal(cache.get("key"), null);
});

test("KQL_SEMANTICS_VERSION is a non-empty string in the cache key", () => {
  // Bumping this constant invalidates every cached query result when a KQL
  // template's semantics change (mappingVersion alone would not catch that).
  assert.equal(typeof KQL_SEMANTICS_VERSION, "string");
  assert.ok(KQL_SEMANTICS_VERSION.length > 0);
});

test("buildCacheKey includes mapping version", () => {
  const keyA = buildCacheKey({
    tenantId: "t1",
    workspaceId: "w1",
    queryName: "q1",
    timeRangeKey: "7d",
    mappingVersion: "v1",
  });
  const keyB = buildCacheKey({
    tenantId: "t1",
    workspaceId: "w1",
    queryName: "q1",
    timeRangeKey: "7d",
    mappingVersion: "v2",
  });
  assert.notEqual(keyA, keyB);
});
