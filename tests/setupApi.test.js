import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";

import { app } from "../src/server.js";
import { __resetForTests } from "../src/core/metadataStore.js";

function withFreshDb() {
  __resetForTests();
  return () => __resetForTests();
}

async function authedAgent(tenantSuffix) {
  const agent = supertest.agent(app);
  // Mock-mode auth: /auth/login redirects through callback and sets the
  // session. Pass a unique tenant id so tests don't cross-contaminate.
  const tenant = `setup-${tenantSuffix}-${process.pid}-${Date.now()}`;
  await agent.get(`/auth/login?tenant=${tenant}`).redirects(5).expect(200);
  return { agent, tenant };
}

test("GET /setup serves the wizard HTML", async () => {
  const restore = withFreshDb();
  try {
    const res = await supertest(app).get("/setup").expect(200);
    assert.match(res.text, /Setup wizard/i);
    assert.match(res.text, /step-scanning/);
    assert.match(res.text, /\/setup\.js/);
  } finally { restore(); }
});

test("/api/setup/state on fresh tenant reports needsSetup=true and no scan", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("fresh");
    const res = await agent.get("/api/setup/state").expect(200);
    assert.equal(res.body.needsSetup, true);
    assert.equal(res.body.hasScan, false);
    assert.equal(res.body.hasMapping, false);
    assert.equal(res.body.latestScanId, null);
    assert.equal(res.body.validation, null);
  } finally { restore(); }
});

test("/api/setup/scan produces a scan + mapping, /findings then exposes them", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("scan");
    const scanRes = await agent.post("/api/setup/scan").expect(200);
    assert.equal(scanRes.body.ok, true);
    assert.ok(scanRes.body.scanId > 0);
    assert.ok(scanRes.body.mappingId > 0);
    assert.ok(scanRes.body.readiness);

    const findingsRes = await agent.get("/api/setup/findings").expect(200);
    assert.ok(findingsRes.body.scan, "scan in findings");
    assert.equal(findingsRes.body.scan.id, scanRes.body.scanId);
    assert.ok(Array.isArray(findingsRes.body.scan.customDimensions));
    assert.ok(Array.isArray(findingsRes.body.scan.eventNames));
    assert.ok(findingsRes.body.mapping, "mapping in findings");
    assert.equal(findingsRes.body.mapping.id, scanRes.body.mappingId);
    // Tests run with AI_PROVIDER=none, so the mapping is the deterministic
    // fallback (degraded=true).
    assert.equal(findingsRes.body.mapping.degraded, true);
    assert.equal(findingsRes.body.mapping.source, "deterministic");
    assert.equal(findingsRes.body.validation, null);
  } finally { restore(); }
});

test("/api/setup/findings exposes effectiveMapping with deterministic origin when AI is degraded", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("effective");
    await agent.post("/api/setup/scan").expect(200);
    const res = await agent.get("/api/setup/findings").expect(200);
    assert.ok(Array.isArray(res.body.effectiveMapping));
    assert.equal(res.body.effectiveMapping.length, 4);
    const fields = res.body.effectiveMapping.map((r) => r.canonical);
    assert.deepEqual(fields, [
      "canonicalUserId", "canonicalSessionId", "canonicalPagePath", "canonicalReferrer",
    ]);
    // Tests run with AI_PROVIDER=none → degraded mapping → every populated
    // row must originate from the deterministic mapping (or be null).
    for (const row of res.body.effectiveMapping) {
      if (row.source) assert.equal(row.origin, "deterministic", `${row.canonical}: ${row.origin}`);
    }
    // The mock fixtures populate at least userId + sessionId + pagePath via
    // built-in fields, so the wizard always has something to validate.
    const populated = res.body.effectiveMapping.filter((r) => r.source);
    assert.ok(populated.length >= 2, `expected ≥2 populated rows, got ${populated.length}`);
  } finally { restore(); }
});

test("/api/setup/scan can be re-run to refresh the scan (covers re-scan flow)", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("rescan");
    const first = await agent.post("/api/setup/scan").expect(200);
    const second = await agent.post("/api/setup/scan").expect(200);
    // Each call inserts a new scan row, so scanId monotonically increases.
    assert.ok(second.body.scanId >= first.body.scanId);
  } finally { restore(); }
});

test("/api/setup/scan/stream emits a step event per stage then done", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("stream");
    const res = await agent
      .get("/api/setup/scan/stream")
      .buffer(true)
      .expect(200);
    assert.match(res.headers["content-type"], /text\/event-stream/);

    // One "step" event per pipeline stage, each carrying real numbers.
    for (const step of ["connect", "customDimensions", "eventVolumes", "identity", "ai"]) {
      assert.match(res.text, new RegExp(`"step":"${step}"`), `missing step: ${step}`);
    }

    // Terminal "done" event carries the persisted scan + mapping ids.
    const doneBlock = res.text
      .split("\n\n")
      .find((b) => b.startsWith("event: done"));
    assert.ok(doneBlock, "stream must end with a done event");
    const donePayload = JSON.parse(doneBlock.split("\ndata: ")[1]);
    assert.equal(donePayload.ok, true);
    assert.ok(donePayload.scanId > 0);
    assert.ok(donePayload.mappingId > 0);

    // The stream is a real scan — /findings now exposes it like POST /scan.
    const findings = await agent.get("/api/setup/findings").expect(200);
    assert.equal(findings.body.scan.id, donePayload.scanId);
  } finally { restore(); }
});

test("/api/setup/findings returns 409 NO_SCAN before a scan exists", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("noscan");
    // Discovery auto-selects the single mock resource, so we exercise the
    // "resource selected, no scan yet" path rather than RESOURCE_NOT_SELECTED.
    await agent.get("/azure/discover").expect(200);
    const res = await agent.get("/api/setup/findings");
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "NO_SCAN");
  } finally { restore(); }
});

test("/api/setup/services tags resources with their per-resource status", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("services");
    // Before any setup → unconfigured.
    const before = await agent.get("/api/setup/services").expect(200);
    assert.ok(Array.isArray(before.body.services));
    assert.ok(before.body.services.length >= 1);
    assert.equal(before.body.services[0].status, "unconfigured");

    // Scanned but not validated → incomplete.
    await agent.post("/api/setup/scan").expect(200);
    const mid = await agent.get("/api/setup/services").expect(200);
    assert.equal(mid.body.services[0].status, "incomplete");

    // Validated → ready.
    await agent.post("/api/setup/validate").send({ decision: "accept_all" }).expect(200);
    const after = await agent.get("/api/setup/services").expect(200);
    assert.equal(after.body.services[0].status, "ready");
  } finally { restore(); }
});

test("/api/setup/services/traffic returns sparkline points for configured resources only", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("traffic");

    // Unconfigured → no traffic entry yet.
    const before = await agent.get("/api/setup/services/traffic").expect(200);
    assert.equal(before.body.range, "7d");
    assert.deepEqual(before.body.traffic, {});

    // Configure the resource (scan + validate), then traffic appears.
    await agent.post("/api/setup/scan").expect(200);
    await agent.post("/api/setup/validate").send({ decision: "accept_all" }).expect(200);

    const services = await agent.get("/api/setup/services").expect(200);
    const resourceId = services.body.services[0].resourceId;

    const after = await agent.get("/api/setup/services/traffic").expect(200);
    const entry = after.body.traffic[resourceId];
    assert.ok(entry, "configured resource should have a traffic entry");
    assert.ok(Array.isArray(entry.points) && entry.points.length > 0, "points populated");
    assert.ok(entry.points.every((p) => Number.isFinite(p)), "points are numeric");
    assert.ok(Number.isFinite(entry.total) && entry.total > 0, "total is a positive number");
  } finally { restore(); }
});

test("dashboard render reuses the config snapshot — no re-scan per load", async () => {
  // The core config/render split: setup scan is the CONFIG phase (runs
  // once); every /dashboard/overview is the RENDER phase and must never
  // create a new scan or re-run the pipeline's config stages.
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("reuse");
    const scanRes = await agent.post("/api/setup/scan").expect(200);
    const scanId = scanRes.body.scanId;
    assert.ok(scanId > 0);
    await agent.post("/api/setup/validate").send({ decision: "accept_all" }).expect(200);

    // Several dashboard loads across ranges.
    await agent.get("/dashboard/overview?range=7d").expect(200);
    await agent.get("/dashboard/overview?range=30d").expect(200);
    await agent.get("/dashboard/overview?range=today").expect(200);

    // Still the same scan — the render phase never re-scanned.
    const state = await agent.get("/api/setup/state").expect(200);
    assert.equal(state.body.latestScanId, scanId, "render must not create a new scan");
  } finally { restore(); }
});

test("dashboard load with no config returns SETUP_REQUIRED — never configures inline", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("nocfg");
    // No /api/setup/scan first — the render phase must refuse, not
    // silently run config work on a dashboard load.
    const res = await agent.get("/dashboard/overview?range=7d");
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "SETUP_REQUIRED");

    // And it must not have created a scan as a side effect.
    const state = await agent.get("/api/setup/state").expect(200);
    assert.equal(state.body.latestScanId, null);
  } finally { restore(); }
});

test("/api/setup/validate accept_all flips state.needsSetup to false", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("accept");
    await agent.post("/api/setup/scan").expect(200);
    const before = await agent.get("/api/setup/state").expect(200);
    assert.equal(before.body.needsSetup, true);

    const v = await agent.post("/api/setup/validate")
      .send({ decision: "accept_all" })
      .expect(200);
    assert.equal(v.body.ok, true);
    assert.ok(v.body.validation.id > 0);

    const after = await agent.get("/api/setup/state").expect(200);
    assert.equal(after.body.needsSetup, false);
    assert.equal(after.body.validation.decision, "accept_all");
  } finally { restore(); }
});

test("/api/setup/validate override rejects invalid decision values", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("invalid");
    const res = await agent.post("/api/setup/validate").send({ decision: "shrug" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "INVALID_DECISION");
  } finally { restore(); }
});

test("/api/setup/validate override rejects expr containing KQL terminators", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("kqlinj");
    await agent.post("/api/setup/scan").expect(200);
    const res = await agent.post("/api/setup/validate").send({
      decision: "override",
      overrides: {
        canonicalUserId: {
          source: "x",
          expr: 'tostring(customDimensions["uid"]); evil',
        },
      },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "INVALID_OVERRIDE_EXPR");
    assert.equal(res.body.field, "canonicalUserId");
  } finally { restore(); }
});

test("/api/setup/validate override roundtrips and is reflected in /state", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("override");
    await agent.post("/api/setup/scan").expect(200);
    const v = await agent.post("/api/setup/validate")
      .send({
        decision: "override",
        overrides: {
          canonicalUserId: {
            source: "customDimensions.uid",
            expr: 'tostring(customDimensions["uid"])',
          },
        },
      })
      .expect(200);
    assert.equal(v.body.ok, true);

    const state = await agent.get("/api/setup/state").expect(200);
    assert.equal(state.body.needsSetup, false);
    assert.equal(state.body.validation.decision, "override");

    const findings = await agent.get("/api/setup/findings").expect(200);
    assert.equal(findings.body.validation.decision, "override");
    assert.equal(findings.body.validation.overrides.canonicalUserId.source, "customDimensions.uid");
  } finally { restore(); }
});

test("accept_all snapshots the effective mapping and flows through to the dashboard", async () => {
  // Regression: before this fix, accept_all stored decision=accept_all with
  // overrides=null, and the dashboard silently re-derived the deterministic
  // mapping — discarding any AI-only proposal the user had just approved.
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("acceptflow");
    await agent.post("/api/setup/scan").expect(200);
    await agent.post("/api/setup/validate")
      .send({ decision: "accept_all" })
      .expect(200);

    const findings = await agent.get("/api/setup/findings").expect(200);
    assert.equal(findings.body.validation.decision, "accept_all");
    assert.ok(findings.body.validation.overrides, "accept_all must snapshot overrides");
    assert.ok(findings.body.validation.overrides.canonicalUserId, "userId snapshotted");

    const dashboard = await agent.get("/dashboard/overview?range=7d").expect(200);
    const mapping = dashboard.body.mapping;
    assert.ok(mapping?.canonicalUserId?.expr, "dashboard mapping must carry canonicalUserId");
    assert.equal(mapping.canonicalUserId.matchType, "user-override");
  } finally { restore(); }
});

test("override flows through to mapping on the next dashboard pipeline run", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("flow");
    await agent.post("/api/setup/scan").expect(200);
    await agent.post("/api/setup/validate").send({
      decision: "override",
      overrides: {
        canonicalUserId: {
          source: "customDimensions.UNIQUE_USER",
          expr: 'tostring(customDimensions["UNIQUE_USER"])',
        },
      },
    }).expect(200);

    const dashboard = await agent.get("/dashboard/overview?range=7d").expect(200);
    const mapping = dashboard.body.mapping;
    assert.ok(mapping, "dashboard mapping payload");
    assert.equal(mapping.canonicalUserId.source, "customDimensions.UNIQUE_USER");
    assert.equal(mapping.canonicalUserId.matchType, "user-override");
  } finally { restore(); }
});
