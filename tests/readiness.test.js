import test from "node:test";
import assert from "node:assert/strict";
import { buildReadinessReport } from "../src/core/readiness.js";

test("buildReadinessReport marks EMPTY when no events", () => {
  const report = buildReadinessReport({
    probeResult: { pageViewsCount: 0, requestsCount: 0 },
    window: { start: new Date(), end: new Date() },
  });
  assert.equal(report.overallStatus, "EMPTY");
});

test("buildReadinessReport marks PARTIAL when missing signals", () => {
  const report = buildReadinessReport({
    probeResult: { pageViewsCount: 10, requestsCount: 0, userAuthCount: 0 },
    window: { start: new Date(), end: new Date() },
  });
  assert.equal(report.overallStatus, "PARTIAL");
  assert.equal(report.availableSignals.pageViews, true);
  assert.equal(report.availableSignals.requests, false);
});
