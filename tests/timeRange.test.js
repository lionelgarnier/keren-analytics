import test from "node:test";
import assert from "node:assert/strict";
import { resolveTimeRange, previousTimeRange, comparisonLabel } from "../src/core/timeRange.js";

test("previousTimeRange: 7d → prev7d, end aligned to current start", () => {
  const cur = resolveTimeRange("7d");
  const prev = previousTimeRange(cur);
  assert.ok(prev);
  assert.equal(prev.key, "prev7d");
  // Within ~1 second tolerance because resolveTimeRange snapshots `now`
  // independently in each call.
  const drift = Math.abs(prev.end.getTime() - cur.start.getTime());
  assert.ok(drift < 2000, `prev.end and cur.start drift ${drift}ms`);
  // Prev window length matches current
  const curLen = cur.end.getTime() - cur.start.getTime();
  const prevLen = prev.end.getTime() - prev.start.getTime();
  assert.ok(Math.abs(curLen - prevLen) < 2000);
});

test("previousTimeRange: 30d → prev30d", () => {
  const prev = previousTimeRange(resolveTimeRange("30d"));
  assert.ok(prev);
  assert.equal(prev.key, "prev30d");
});

test("previousTimeRange: today → yesterday", () => {
  const prev = previousTimeRange(resolveTimeRange("today"));
  assert.ok(prev);
  assert.equal(prev.key, "yesterday");
});

test("previousTimeRange: custom or unknown range → null", () => {
  // resolveTimeRange("custom", start, end) keeps key="custom"; that's the
  // only way to reach the custom branch from a real call site.
  const customRange = resolveTimeRange("custom", "2026-01-01", "2026-01-15");
  assert.equal(customRange.key, "custom");
  assert.equal(previousTimeRange(customRange), null);
  assert.equal(previousTimeRange(null), null);
  assert.equal(previousTimeRange({ key: "made-up" }), null);
});

test("comparisonLabel: human-readable per-range caption", () => {
  assert.equal(comparisonLabel("today"), "vs yesterday");
  assert.equal(comparisonLabel("7d"), "vs last week");
  assert.equal(comparisonLabel("30d"), "vs last month");
  assert.equal(comparisonLabel("custom"), null);
  assert.equal(comparisonLabel(undefined), null);
});
