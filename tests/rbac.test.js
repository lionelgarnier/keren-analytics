import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";

/**
 * RBAC and no-data test scenarios.
 *
 * These tests create a temporary Express app with a mock client that
 * simulates access-denied and empty-data situations, verifying that the
 * server returns the correct HTTP status codes and error payloads.
 */

// --- Helper: create a server with a custom mock client ---

async function createTestApp(mockClientOverrides = {}) {
  // We dynamically import and patch the azure client module.
  // The simplest approach: import the app factory pieces and wire them.
  const { default: express } = await import("express");
  const { default: session } = await import("express-session");
  const { runOverviewPipeline, runSetupScan } = await import("../src/core/orchestrator.js");
  const { buildRecommendations } = await import("../src/core/recommendations.js");
  const { getTenant, updateTenant } = await import("../src/core/metadataStore.js");

  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );

  // Mock auth: always set tenant with unique ID to avoid state pollution
  const tenantId = `rbac-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  app.use((req, _res, next) => {
    if (!req.session.tenantId) {
      req.session.tenantId = tenantId;
    }
    next();
  });

  const fakeClient = {
    async discoverResources() {
      return mockClientOverrides.discoverResources
        ? mockClientOverrides.discoverResources()
        : [
            {
              resourceId: "/subscriptions/sub/rg/rg/providers/Microsoft.Insights/components/ai",
              subscriptionId: "sub",
              resourceGroup: "rg",
              appInsightsName: "test-ai",
              workspaceId: "/subscriptions/sub/rg/rg/providers/Microsoft.OperationalInsights/workspaces/ws",
            },
          ];
    },
    async checkAccess() {
      return mockClientOverrides.checkAccess
        ? mockClientOverrides.checkAccess()
        : { ok: true };
    },
    async queryWorkspace(opts) {
      if (mockClientOverrides.queryWorkspace) {
        return mockClientOverrides.queryWorkspace(opts);
      }
      // Default: return empty results
      return { tables: [{ columns: [], rows: [] }] };
    },
  };

  app.get("/dashboard/overview", async (req, res) => {
    const rangeKey = req.query.range || "7d";
    const tenantId = req.session.tenantId;
    try {
      // CONFIG once, then RENDER — same split as the real server.
      const setup = await runSetupScan({ tenantId, azureClient: fakeClient });
      if (setup.requiresSelection) {
        return res.status(409).json({ error: "RESOURCE_SELECTION_REQUIRED", resources: setup.resources });
      }
      if (setup.error) {
        return res.status(setup.error === "NO_ACCESS" ? 403 : 500).json(setup);
      }
      const result = await runOverviewPipeline({
        tenantId,
        rangeKey,
        azureClient: fakeClient,
        cacheTtlMs: 60000,
      });
      if (result.error) {
        const code = result.error === "NO_ACCESS" ? 403 : 500;
        return res.status(code).json(result);
      }
      res.json({
        dashboard: result.dashboard,
        readiness: result.readinessReport,
      });
    } catch (error) {
      res.status(500).json({ error: "PIPELINE_ERROR", message: error.message });
    }
  });

  return app;
}

// --- Tests ---

test("RBAC: access denied returns 403 with NO_ACCESS error", async () => {
  const app = await createTestApp({
    checkAccess: () => ({ ok: false, reason: "Insufficient permissions: Log Analytics Reader role required." }),
  });
  const request = supertest.agent(app);
  const res = await request.get("/dashboard/overview?range=7d");
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "NO_ACCESS");
  assert.ok(res.body.message.includes("permissions") || res.body.message.includes("Insufficient"));
});

test("RBAC: multiple resources require selection returns 409", async () => {
  const app = await createTestApp({
    discoverResources: () => [
      {
        resourceId: "/sub/rg/providers/Microsoft.Insights/components/ai1",
        subscriptionId: "sub",
        resourceGroup: "rg",
        appInsightsName: "app1",
        workspaceId: "/sub/rg/providers/Microsoft.OperationalInsights/workspaces/ws1",
      },
      {
        resourceId: "/sub/rg/providers/Microsoft.Insights/components/ai2",
        subscriptionId: "sub",
        resourceGroup: "rg",
        appInsightsName: "app2",
        workspaceId: "/sub/rg/providers/Microsoft.OperationalInsights/workspaces/ws2",
      },
    ],
  });
  const request = supertest.agent(app);
  const res = await request.get("/dashboard/overview?range=7d");
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "RESOURCE_SELECTION_REQUIRED");
  assert.equal(res.body.resources.length, 2);
});

test("No-data: empty telemetry returns dashboard with EMPTY readiness", async () => {
  const app = await createTestApp({
    queryWorkspace: () => ({
      tables: [
        {
          columns: [
            { name: "pageViewsCount", type: "long" },
            { name: "requestsCount", type: "long" },
            { name: "userAuthCount", type: "long" },
            { name: "userAnonCount", type: "long" },
            { name: "sessionCount", type: "long" },
            { name: "requestSessionCount", type: "long" },
            { name: "browserCount", type: "long" },
            { name: "osCount", type: "long" },
            { name: "deviceCount", type: "long" },
            { name: "geoCount", type: "long" },
            { name: "browserTimingsCount", type: "long" },
            { name: "latestTimestamp", type: "datetime" },
            { name: "tableName", type: "string" },
            { name: "count", type: "long" },
            { name: "key", type: "string" },
            { name: "keyCount", type: "long" },
          ],
          rows: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, null, 0, null, 0]],
        },
      ],
    }),
  });
  const request = supertest.agent(app);
  const res = await request.get("/dashboard/overview?range=7d");
  assert.equal(res.status, 200);
  assert.ok(res.body.readiness);
  assert.equal(res.body.readiness.overallStatus, "EMPTY");
  assert.ok(res.body.readiness.recommendedActions.length > 0, "Should have recommended actions");
});

test("No-data: partial telemetry (requests only) returns PARTIAL readiness", async () => {
  const app = await createTestApp({
    queryWorkspace: (opts) => {
      // Readiness probe: return partial data (requests only)
      if (opts.queryName === "readiness" || opts.queryName === "readinessFallback") {
        return {
          tables: [
            {
              columns: [
                { name: "pageViewsCount", type: "long" },
                { name: "requestsCount", type: "long" },
                { name: "userAuthCount", type: "long" },
                { name: "userAnonCount", type: "long" },
                { name: "sessionCount", type: "long" },
                { name: "requestSessionCount", type: "long" },
                { name: "browserCount", type: "long" },
                { name: "osCount", type: "long" },
                { name: "deviceCount", type: "long" },
                { name: "geoCount", type: "long" },
                { name: "browserTimingsCount", type: "long" },
                { name: "latestTimestamp", type: "datetime" },
              ],
              rows: [[0, 500, 0, 0, 0, 200, 0, 0, 0, 0, 0, new Date().toISOString()]],
            },
          ],
        };
      }
      // Schema: only requests table
      if (opts.queryName === "schemaTables") {
        return {
          tables: [
            {
              columns: [
                { name: "tableName", type: "string" },
                { name: "count", type: "long" },
              ],
              rows: [["requests", 500]],
            },
          ],
        };
      }
      // All other queries: empty results
      return { tables: [{ columns: [], rows: [] }] };
    },
  });
  const request = supertest.agent(app);
  const res = await request.get("/dashboard/overview?range=7d");
  assert.equal(res.status, 200);
  assert.ok(res.body.readiness);
  assert.equal(res.body.readiness.overallStatus, "PARTIAL");
  assert.equal(res.body.readiness.availableSignals.requests, true);
  assert.equal(res.body.readiness.availableSignals.pageViews, false);
});

test("RBAC: readiness report shows NO_ACCESS signals when specific", async () => {
  const { buildReadinessReport } = await import("../src/core/readiness.js");
  const report = buildReadinessReport({
    probeResult: {
      pageViewsCount: 0,
      requestsCount: 0,
      userAuthCount: 0,
      userAnonCount: 0,
      sessionCount: 0,
      requestSessionCount: 0,
      browserCount: 0,
      osCount: 0,
      deviceCount: 0,
      geoCount: 0,
      browserTimingsCount: 0,
    },
    window: { start: new Date(), end: new Date() },
  });
  assert.equal(report.overallStatus, "EMPTY");
  assert.equal(report.confidence, 0.2);
  // All signals should be missing
  for (const [key, val] of Object.entries(report.availableSignals)) {
    assert.equal(val, false, `Signal ${key} should be false`);
  }
  // Should recommend enabling pageviews and requests at minimum
  const actionIds = report.recommendedActions.map((a) => a.id);
  assert.ok(actionIds.includes("enable-pageviews"));
  assert.ok(actionIds.includes("enable-requests"));
});

// Custom range validation tests removed — custom range feature not yet in scope.
