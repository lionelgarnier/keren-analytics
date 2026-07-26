import test from "node:test";
import assert from "node:assert/strict";

import { createMockClient } from "../src/providers/azure/mockClient.js";

// Mock parity (CLAUDE.md invariant): the mock client must return the SAME shape
// as the real client — the Log Analytics table envelope { tables: [...] } — for
// EVERY query. A prior `{ _raw: ... }` branch broke this for 7 queries, so
// their cards silently rendered empty in mock mode and the public demo.
const QUERY_NAMES = [
  "uniqueVisitors", "sessions", "dailyTrend", "topPages", "topNavigation",
  "geoDistribution", "peakHours", "urlParams", "campaignBreakdown",
  "performance", "browserTimings", "techBrowser", "techOs", "techDevice",
  "referrerSources", "statusCodes", "slowEndpoints", "topExceptions",
  "dependencyOverview", "dependencyTypes", "slowDependencies", "serviceHealth",
  "sessionTimelines", "previousKpis",
];

test("mock queryWorkspace returns the table envelope for every query (no _raw)", async () => {
  const client = createMockClient();
  for (const queryName of QUERY_NAMES) {
    const result = await client.queryWorkspace({ queryName, timeRangeKey: "7d" });
    assert.ok(result && Array.isArray(result.tables), `${queryName} must return { tables: [...] }`);
    assert.equal(result._raw, undefined, `${queryName} must not use the _raw shape`);
    const table = result.tables[0];
    assert.ok(table && Array.isArray(table.columns) && Array.isArray(table.rows), `${queryName} table shape`);
  }
});
