import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { app } from "../src/server.js";

test("landing page (A5): tagline, comparison table, FAQ, footer present", async () => {
  const request = supertest(app);
  const res = await request.get("/").expect(200);
  const body = res.text;
  // Tagline + key value props from the rewrite. Asserting on the literal
  // copy locks the launch positioning so an accidental edit (or AI
  // re-rewrite) shows up as a failing test.
  assert.match(body, /Azure App Insights → Marketing/);
  assert.match(body, /AI-mapped schema/);
  assert.match(body, /Try the demo/);
  assert.match(body, /Star on GitHub/);
  // Comparison table
  assert.match(body, /How it compares/);
  assert.match(body, /Easy Analytics/);
  assert.match(body, /Datadog/);
  assert.match(body, /Power BI/);
  // FAQ
  assert.match(body, /Does it store my telemetry data\?/);
  assert.match(body, /How does it connect to Azure\?/);
  assert.match(body, /Is the AI part required\?/);
  // Footer
  assert.match(body, /MIT License/);
  assert.match(body, /garniel6@gmail\.com/);
});

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
