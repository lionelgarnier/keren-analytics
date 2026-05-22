import test from "node:test";
import assert from "node:assert/strict";

import { __resetForTests } from "../src/core/metadataStore.js";
import { persistScan } from "../src/core/scanStore.js";
import { getMappingForScan, getLatestMapping, persistMapping } from "../src/core/mappingStore.js";
import { getOrComputeMapping } from "../src/core/aiMappingService.js";
import { __resetQuotaForTests } from "../src/ai/quotaGuard.js";

function freshTenant(label) {
  return `${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const RES = "/subscriptions/s/resourceGroups/rg/providers/microsoft.insights/components/app-a";

function setup() {
  __resetForTests();
  __resetQuotaForTests();
}

const validProposal = {
  mapping_proposals: [
    {
      canonical: "canonicalUserId",
      source: "customDimensions.uid",
      expr: 'tostring(customDimensions["uid"])',
      confidence: "high",
      reasoning: "uid appears in 2 tables.",
    },
  ],
  missing_signals: [],
  dashboard_recommendations: { feature: ["traffic"], hide: [], rationale: "Core traffic available." },
  summary: "Schema looks healthy.",
};

const tinyScan = {
  scannedAt: "2026-05-11T00:00:00Z",
  tables: { pageViews: true },
  customDimensions: [{ tableName: "pageViews", keyName: "uid", samples: ["a"], cardinality: 1, occurrences: 1 }],
  eventNames: [], timestampSpan: [], gaps: [],
};

function happyProvider() {
  return {
    name: "azure-foundry",
    capabilities: () => ({ mappingAnalysis: true, narration: false, nlToKql: false, instrumentation: false }),
    generate: async () => ({
      output: validProposal,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      model: "gpt-5.4-mini",
      latencyMs: 42,
    }),
  };
}

function malformedProvider() {
  return {
    name: "azure-foundry",
    capabilities: () => ({ mappingAnalysis: true, narration: false, nlToKql: false, instrumentation: false }),
    generate: async () => ({
      output: { mapping_proposals: "should-be-array" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      model: "x",
      latencyMs: 1,
    }),
  };
}

function throwingProvider() {
  return {
    name: "azure-foundry",
    capabilities: () => ({ mappingAnalysis: true, narration: false, nlToKql: false, instrumentation: false }),
    generate: async () => { throw new Error("network down"); },
  };
}

function noopProvider() {
  return {
    name: "none",
    capabilities: () => ({ mappingAnalysis: false, narration: false, nlToKql: false, instrumentation: false }),
    generate: async () => null,
  };
}

// ── tests ───────────────────────────────────────────────────────

test("returns null when no scan exists for the tenant", async () => {
  setup();
  const result = await getOrComputeMapping(freshTenant("no-scan"), RES);
  assert.equal(result, null);
});

test("happy path: persists provider proposals and source = provider.name", async () => {
  setup();
  const tenantId = freshTenant("happy");
  const { id: scanId } = persistScan(tenantId, RES, tinyScan);

  const result = await getOrComputeMapping(tenantId, RES, { provider: happyProvider() });
  assert.equal(result.degraded, false);
  assert.equal(result.source, "azure-foundry");
  assert.equal(result.scanId, scanId);
  assert.deepEqual(result.proposals, validProposal);

  // Persisted into the mappings table.
  const cached = getMappingForScan(tenantId, scanId);
  assert.ok(cached);
  assert.equal(cached.degraded, false);
  assert.deepEqual(cached.proposals, validProposal);
});

test("cache hit on second call: provider is NOT invoked again", async () => {
  setup();
  const tenantId = freshTenant("cache");
  const { id: scanId } = persistScan(tenantId, RES, tinyScan);

  let calls = 0;
  const countingProvider = {
    ...happyProvider(),
    generate: async () => {
      calls += 1;
      return {
        output: validProposal,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: "x",
        latencyMs: 1,
      };
    },
  };

  await getOrComputeMapping(tenantId, RES, { provider: countingProvider });
  await getOrComputeMapping(tenantId, RES, { provider: countingProvider });
  await getOrComputeMapping(tenantId, RES, { provider: countingProvider });
  assert.equal(calls, 1, "provider should only be called once for the same scan_id");

  const cached = getMappingForScan(tenantId, scanId);
  assert.deepEqual(cached.proposals, validProposal);
});

test("re-scan invalidates cache: new scan_id triggers a fresh provider call", async () => {
  setup();
  const tenantId = freshTenant("rescan");

  persistScan(tenantId, RES, { ...tinyScan, scannedAt: "2026-05-01T00:00:00Z" });
  let calls = 0;
  const countingProvider = {
    ...happyProvider(),
    generate: async () => {
      calls += 1;
      return {
        output: validProposal,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: "x", latencyMs: 1,
      };
    },
  };
  await getOrComputeMapping(tenantId, RES, { provider: countingProvider });
  assert.equal(calls, 1);

  // New scan
  persistScan(tenantId, RES, { ...tinyScan, scannedAt: "2026-05-10T00:00:00Z" });
  await getOrComputeMapping(tenantId, RES, { provider: countingProvider });
  assert.equal(calls, 2, "new scan should trigger a new provider call");
});

test("provider returns null → degraded fallback, not crash", async () => {
  setup();
  const tenantId = freshTenant("null");
  const { id: scanId } = persistScan(tenantId, RES, tinyScan);
  const result = await getOrComputeMapping(tenantId, RES, { provider: noopProvider() });
  assert.equal(result.degraded, true);
  assert.equal(result.source, "deterministic");
  assert.deepEqual(result.proposals.mapping_proposals, []);
  // Persisted as a degraded row so we don't keep retrying on the same scan.
  const cached = getMappingForScan(tenantId, scanId);
  assert.equal(cached.degraded, true);
});

test("provider response fails shape check → degraded", async () => {
  setup();
  const tenantId = freshTenant("malformed");
  persistScan(tenantId, RES, tinyScan);
  const result = await getOrComputeMapping(tenantId, RES, { provider: malformedProvider() });
  assert.equal(result.degraded, true);
  assert.match(result.reason, /shape check/);
});

test("provider throws → degraded, dashboard pipeline not blocked", async () => {
  setup();
  const tenantId = freshTenant("throws");
  persistScan(tenantId, RES, tinyScan);
  const result = await getOrComputeMapping(tenantId, RES, { provider: throwingProvider() });
  assert.equal(result.degraded, true);
  assert.match(result.reason, /provider error: network down/);
});

test("over quota → skips provider entirely and returns degraded", async () => {
  setup();
  const tenantId = freshTenant("quota");
  persistScan(tenantId, RES, tinyScan);

  // Push spend past the cap.
  const { config } = await import("../src/config.js");
  const tokens = Math.ceil(((config.aiDailyEurCap + 1) / config.aiPricePerMillionOutputEur) * 1_000_000);
  const { recordUsage } = await import("../src/ai/quotaGuard.js");
  recordUsage({ inputTokens: 0, outputTokens: tokens });

  let calls = 0;
  const countingProvider = { ...happyProvider(), generate: async () => { calls += 1; return null; } };
  const result = await getOrComputeMapping(tenantId, RES, { provider: countingProvider });
  assert.equal(result.degraded, true);
  assert.match(result.reason, /spend cap/);
  assert.equal(calls, 0, "provider must not be called when over cap");
});

test("mappingStore: getLatestMapping returns most recent across scans", () => {
  setup();
  const tenantId = freshTenant("latest");
  const { id: scan1 } = persistScan(tenantId, RES, { ...tinyScan, scannedAt: "2026-05-01T00:00:00Z" });
  const { id: scan2 } = persistScan(tenantId, RES, { ...tinyScan, scannedAt: "2026-05-10T00:00:00Z" });

  persistMapping(tenantId, scan1, { source: "azure-foundry", proposals: { mapping_proposals: ["old"] } });
  persistMapping(tenantId, scan2, { source: "azure-foundry", proposals: { mapping_proposals: ["new"] } });

  const latest = getLatestMapping(tenantId, RES);
  assert.equal(latest.scanId, scan2);
  assert.deepEqual(latest.proposals.mapping_proposals, ["new"]);
});
