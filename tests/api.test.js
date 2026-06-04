import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { app } from "../src/server.js";
import { buildOverviewDashboard, buildUrlParamsData } from "../src/core/dashboard.js";
import { buildMapping } from "../src/core/mapping.js";
import { resolveTimeRange } from "../src/core/timeRange.js";

/** superagent parser: buffer an application/x-ndjson body into a raw string. */
function ndjsonParser(res, cb) {
  let data = "";
  res.setEncoding("utf8");
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => cb(null, data));
}

/** Parse a buffered NDJSON body into an array of message objects. */
function parseNdjson(body) {
  return String(body).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

test("landing page (A5): tagline, comparison table, FAQ, footer present", async () => {
  const request = supertest(app);
  const res = await request.get("/").expect(200);
  const body = res.text;
  // Headline + key value props from the V2 landing rewrite. Asserting on
  // the literal copy locks the launch positioning so an accidental edit
  // (or AI re-rewrite) shows up as a failing test.
  assert.match(body, /The Azure dashboard/);
  assert.match(body, /Application Insights/);
  assert.match(body, /Try the demo/);
  assert.match(body, /Open the demo/);
  // Comparison table
  assert.match(body, /How it compares/);
  assert.match(body, /Datadog/);
  assert.match(body, /Power BI/);
  // FAQ
  assert.match(body, /Does it store my telemetry data\?/);
  assert.match(body, /How does it connect to Azure\?/);
  assert.match(body, /Is the AI part required\?/);
  // Footer
  assert.match(body, /MIT/);
  assert.match(body, /garniel6@gmail\.com/);
});

test("healthz returns liveness status and mode", async () => {
  const request = supertest(app);
  const res = await request.get("/healthz").expect(200);

  assert.equal(res.body.ok, true);
  assert.equal(typeof res.body.mode, "string");
});

test("mock auth and dashboard overview flow", async () => {
  const request = supertest.agent(app);
  await request.get("/auth/login").redirects(2).expect(200);

  const discovery = await request.get("/azure/discover").expect(200);
  assert.ok(discovery.body.resources.length >= 1);

  // CONFIG phase (the setup wizard's job) must run before the dashboard
  // can RENDER — dashboard loads never configure.
  await request.post("/api/setup/scan").expect(200);

  const dashboard = await request.get("/dashboard/overview?range=7d").expect(200);
  assert.ok(dashboard.body.dashboard);
  assert.ok(dashboard.body.readiness);

  // Narration panel is wired into the dashboard payload (B2). Tests run in
  // mock mode (.env.test) so the panel reports `mode: "mock"` and no badge.
  const narration = dashboard.body.dashboard.narration;
  assert.ok(narration, "dashboard payload should include narration");
  assert.equal(narration.mode, "mock");
  assert.equal(narration.badge, null);
  assert.ok(narration.paragraph && narration.paragraph.length > 0);

  // Error rate is split: errorRate is server (5xx) failures only, with 4xx
  // client errors surfaced separately so 404s no longer inflate the rate.
  const kpis = dashboard.body.dashboard.kpis;
  assert.ok(Number.isFinite(kpis.errorRate), "kpis.errorRate is numeric");
  assert.ok(Number.isFinite(kpis.clientErrorRate), "kpis.clientErrorRate is numeric");

  // Period-over-period comparison (B4) — 7d range has prev7d as predecessor.
  const cmp = dashboard.body.dashboard.kpis.comparison;
  assert.ok(cmp, "dashboard.kpis.comparison should be present for 7d range");
  assert.equal(cmp.previousRangeKey, "prev7d");
  assert.equal(cmp.label, "vs last week");
  for (const key of ["uniqueVisitors", "sessions", "pageViews"]) {
    const entry = cmp[key];
    assert.ok(entry, `comparison.${key} should be present`);
    assert.ok(Number.isFinite(entry.current));
    assert.ok(Number.isFinite(entry.previous));
    assert.ok(["up", "down", "neutral"].includes(entry.direction));
  }
});

test("dashboard overview stream emits per-card messages then one done", async () => {
  const request = supertest.agent(app);
  await request.get("/auth/login").redirects(2).expect(200);
  await request.get("/azure/discover").expect(200);
  await request.post("/api/setup/scan").expect(200);

  const res = await request
    .get("/dashboard/overview?range=7d&stream=1")
    .buffer(true)
    .parse(ndjsonParser)
    .expect(200);
  const messages = parseNdjson(res.body);

  const cards = messages.filter((m) => m.type === "card");
  const done = messages.filter((m) => m.type === "done");
  assert.ok(cards.length > 0, "stream should emit card messages");
  assert.equal(done.length, 1, "stream should end with exactly one done message");

  // Every card name resolves; mock mode never fails a query.
  const cardNames = new Set(cards.map((c) => c.name));
  for (const expected of ["marketingKpis", "technicalKpis", "dailyTrend", "topPages", "geo"]) {
    assert.ok(cardNames.has(expected), `expected a '${expected}' card`);
  }
  assert.ok(!cards.some((c) => c.data && c.data.error), "no card should carry an error in mock mode");

  // Card coverage: a streamed card carries the same data as the final payload.
  const dailyTrendCard = cards.find((c) => c.name === "dailyTrend");
  assert.deepEqual(
    dailyTrendCard.data.dailyTrend,
    done[0].dashboard.charts.dailyTrend,
    "dailyTrend card data should match the done payload"
  );
});

test("preview dashboard stream also emits per-card messages", async () => {
  const res = await supertest(app)
    .get("/preview/dashboard?range=7d&stream=1")
    .buffer(true)
    .parse(ndjsonParser)
    .expect(200);
  const messages = parseNdjson(res.body);
  assert.ok(messages.some((m) => m.type === "card"), "preview should emit card messages");
  assert.equal(messages.filter((m) => m.type === "done").length, 1);
});

const EMPTY_TABLE = { tables: [{ columns: [], rows: [] }] };

/** Minimal-but-valid inputs for a direct buildOverviewDashboard() call. */
function dashboardFixture() {
  const schemaProfile = {
    tables: { pageViews: {}, requests: {}, browserTimings: {} },
    customDimensionsKeys: {},
  };
  const readinessReport = {
    probeCounts: { userAnonCount: 10, sessionCount: 10 },
    availableSignals: { geo: true, requests: true, browserTimings: true, pageViews: true },
    latestTimestamp: null,
  };
  return {
    schemaProfile,
    readinessReport,
    mapping: buildMapping({ schemaProfile, readinessReport }),
    timeRange: resolveTimeRange("7d"),
  };
}

/**
 * Build a dashboard against a fake azureClient. `label` keys the tenant /
 * resource so each test gets its own cache namespace (cacheStore is a
 * process-wide singleton — a shared id would leak results between tests).
 */
async function runDashboardWithClient(label, azureClient) {
  const { mapping, schemaProfile, readinessReport, timeRange } = dashboardFixture();
  const cards = {};
  const dashboard = await buildOverviewDashboard({
    tenantId: `isolation-${label}`,
    resourceId: `res-${label}`,
    workspaceId: `ws-${label}`,
    mapping,
    schemaProfile,
    readinessReport,
    timeRange,
    cacheTtlMs: 60000,
    azureClient,
    azureMode: "mock",
    onCard: (name, data) => { cards[name] = data; },
  });
  return { dashboard, cards };
}

test("dashboard: a failed query is isolated to its own card", async () => {
  const { dashboard, cards } = await runDashboardWithClient("geo-fail", {
    async queryWorkspace({ queryName }) {
      if (queryName === "geoDistribution") throw new Error("simulated KQL failure");
      return EMPTY_TABLE;
    },
  });

  // The dashboard still builds — one failed query no longer takes it down.
  assert.ok(dashboard && dashboard.charts, "dashboard builds despite a failed query");
  assert.deepEqual(dashboard.charts.geoDistribution, [], "failed query degrades to empty data");

  // The geo card is flagged; unrelated cards are unaffected.
  assert.equal(cards.geo?.error, true, "geo card carries an error flag");
  assert.equal(cards.topPages?.error, undefined, "topPages card has no error");
  assert.ok(Array.isArray(cards.topPages?.topPages), "topPages card still carries data");
  assert.equal(cards.marketingKpis?.error, undefined, "marketingKpis card has no error");
});

test("dashboard: a non-critical query failure does not blank the marketing KPI card", async () => {
  // previousKpis feeds only the period-over-period delta chips. Its failure
  // must NOT flag the whole Marketing KPI card as an error.
  const { cards } = await runDashboardWithClient("prevkpis-fail", {
    async queryWorkspace({ queryName }) {
      if (queryName === "previousKpis") throw new Error("simulated comparison failure");
      return EMPTY_TABLE;
    },
  });

  assert.equal(cards.marketingKpis?.error, undefined, "marketingKpis must not error on previousKpis failure");
  assert.equal(typeof cards.marketingKpis?.uniqueVisitors, "number", "marketingKpis still carries visitor data");
  assert.equal(typeof cards.marketingKpis?.sessions, "number", "marketingKpis still carries session data");
});

test("dashboard: availability exposes per-signal flags from readiness", async () => {
  const { dashboard, cards } = await runDashboardWithClient("availability", {
    async queryWorkspace() { return EMPTY_TABLE; },
  });
  const av = dashboard.availability;
  assert.equal(typeof av.hasUserId, "boolean");
  assert.equal(typeof av.hasSessionId, "boolean");
  assert.equal(typeof av.hasPageViews, "boolean");
  // The fixture's readiness has pageViews available but no userId/sessionId.
  assert.equal(av.hasPageViews, true);
  assert.equal(av.hasUserId, false);
  assert.equal(av.hasSessionId, false);
  // The marketingKpis + peakHours cards carry the flags for the frontend.
  assert.equal(cards.marketingKpis?.availability?.hasSessionId, false);
  assert.equal(cards.peakHours?.availability?.hasSessionId, false);
});

test("buildUrlParamsData: scrubs UTM values and withholds non-UTM values", () => {
  const rows = [
    { paramName: "utm_source", frequency: 120, isUtm: true, topValue: "newsletter", totalScanned: 500, urlsWithParams: 200 },
    { paramName: "utm_campaign", frequency: 10, isUtm: true, topValue: "promo-ada@example.com", totalScanned: 500, urlsWithParams: 200 },
    { paramName: "token", frequency: 30, isUtm: false, topValue: "c9e8ccfca7720f5b99b7fbdb12bdf63691181227547c81dec2a72e17113d4220", totalScanned: 500, urlsWithParams: 200 },
  ];
  const out = buildUrlParamsData(rows);
  const find = (name) => out.discovered.find((p) => p.param === name);
  // UTM param keeps a sample value, PII-scrubbed.
  assert.deepEqual(find("utm_source").topValues, [{ value: "newsletter", count: 120 }]);
  assert.deepEqual(find("utm_campaign").topValues, [{ value: "<email>", count: 10 }]);
  // Non-UTM param exposes no raw value at all — the auth token never leaves.
  assert.deepEqual(find("token").topValues, []);
});

test("dashboard: an assembler transform exception is isolated to its card", async () => {
  // A topNavigation row with a null `from` makes buildSankeyFromNav throw
  // inside assembleUserFlow (groupOf(null) -> null.startsWith). The throw
  // must degrade to an error card, not reject the whole dashboard build.
  const malformedNav = {
    tables: [{
      columns: [{ name: "from" }, { name: "to" }, { name: "transitions" }],
      rows: [[null, "/checkout", 5]],
    }],
  };
  const { dashboard, cards } = await runDashboardWithClient("assembler-throw", {
    async queryWorkspace({ queryName }) {
      if (queryName === "topNavigation") return malformedNav;
      return EMPTY_TABLE;
    },
  });

  assert.ok(dashboard && dashboard.charts, "dashboard still builds despite an assembler throwing");
  assert.equal(cards.userFlow?.error, true, "userFlow card is flagged after its assembler threw");
  assert.equal(cards.topPages?.error, undefined, "unrelated cards are unaffected");
  assert.equal(cards.geo?.error, undefined, "unrelated cards are unaffected");
});
