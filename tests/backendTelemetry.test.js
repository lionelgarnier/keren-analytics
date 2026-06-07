import test from "node:test";
import assert from "node:assert/strict";
import { buildOverviewDashboard } from "../src/core/dashboard.js";
import { buildMapping } from "../src/core/mapping.js";
import { resolveTimeRange } from "../src/core/timeRange.js";
import { createMockClient } from "../src/providers/azure/mockClient.js";

// Backend / APM expansion: the dependency, exception, service-health and
// status-code cards render off the existing mock client, gated on the new
// readiness signals.

function backendFixture() {
  const schemaProfile = {
    tables: { pageViews: {}, requests: {}, dependencies: {}, exceptions: {} },
    customDimensionsKeys: {},
  };
  const readinessReport = {
    probeCounts: { userAnonCount: 10, sessionCount: 10 },
    availableSignals: {
      requests: true,
      pageViews: true,
      dependencies: true,
      exceptions: true,
      multiService: true,
    },
    latestTimestamp: null,
  };
  return {
    schemaProfile,
    readinessReport,
    mapping: buildMapping({ schemaProfile, readinessReport }),
    timeRange: resolveTimeRange("7d"),
  };
}

async function runBackendDashboard() {
  const { mapping, schemaProfile, readinessReport, timeRange } = backendFixture();
  const cards = {};
  const dashboard = await buildOverviewDashboard({
    tenantId: "backend-tenant",
    resourceId: "backend-res",
    workspaceId: "backend-ws",
    mapping,
    schemaProfile,
    readinessReport,
    timeRange,
    cacheTtlMs: 60000,
    azureClient: createMockClient(),
    azureMode: "mock",
    onCard: (name, data) => { cards[name] = data; },
  });
  return { dashboard, cards };
}

test("dashboard surfaces backend dependency telemetry", async () => {
  const { dashboard, cards } = await runBackendDashboard();

  assert.ok(dashboard.backend, "dashboard carries a backend KPI block");
  assert.ok(dashboard.backend.dependencyCalls > 0, "dependency call count is populated");
  assert.ok(dashboard.backend.dependencyP95Ms > 0, "dependency p95 is populated");
  assert.ok(Array.isArray(dashboard.tables.slowDependencies), "slowDependencies is a table");
  assert.ok(dashboard.tables.slowDependencies.length > 0, "slowDependencies has rows");
  assert.ok(dashboard.charts.dependencyTypes.length > 0, "dependencyTypes has rows");

  // The dependency type shares sum to ~1 (a proportion of total calls).
  const shareSum = dashboard.charts.dependencyTypes.reduce((s, r) => s + r.share, 0);
  assert.ok(Math.abs(shareSum - 1) < 0.001, "dependency type shares normalize to 1");

  assert.equal(cards.backendKpis?.availability?.hasDependencies, true);
  assert.ok(cards.dependencies?.slowDependencies?.length > 0);
});

test("dashboard surfaces exceptions without raw messages", async () => {
  const { dashboard, cards } = await runBackendDashboard();
  assert.ok(dashboard.tables.topExceptions.length > 0, "topExceptions has rows");
  const ex = dashboard.tables.topExceptions[0];
  assert.ok(ex.type, "exception row has a type");
  assert.ok(ex.problemId, "exception row has a problemId");
  // No free-text message must ever reach the payload.
  assert.equal(ex.message, undefined, "no raw message leaks into the payload");
  assert.ok(dashboard.backend.exceptionCount > 0, "exception count is aggregated");
  assert.equal(cards.exceptions?.availability?.hasExceptions, true);
});

test("dashboard surfaces per-service health and status-code mix", async () => {
  const { dashboard, cards } = await runBackendDashboard();
  assert.ok(dashboard.tables.serviceHealth.length > 0, "serviceHealth has rows");
  assert.ok(dashboard.tables.serviceHealth[0].role, "service row carries a role label");
  assert.equal(cards.serviceHealth?.multiService, true);

  const classes = dashboard.charts.statusCodes.map((r) => r.class);
  assert.ok(classes.includes("2xx"), "status codes include a 2xx bucket");
  assert.ok(classes.includes("5xx"), "status codes include a 5xx bucket");
  // Ordered 2xx -> 3xx -> 4xx -> 5xx.
  assert.equal(classes[0], "2xx");
});

test("availability flags expose backend signals", async () => {
  const { dashboard } = await runBackendDashboard();
  assert.equal(dashboard.availability.hasDependencies, true);
  assert.equal(dashboard.availability.hasExceptions, true);
});
