import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { app } from "../src/server.js";

test("mock auth and dashboard overview flow", async () => {
  const request = supertest.agent(app);
  await request.get("/auth/login").redirects(2).expect(200);

  const discovery = await request.get("/azure/discover").expect(200);
  assert.ok(discovery.body.resources.length >= 1);

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
