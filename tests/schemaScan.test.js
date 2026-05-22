import test from "node:test";
import assert from "node:assert/strict";

import {
  scrubPii,
  scrubSamples,
  detectGaps,
  buildSchemaScan,
} from "../src/core/schemaScan.js";

// ── PII scrub ──────────────────────────────────────────────────

test("scrubPii: replaces emails", () => {
  assert.equal(scrubPii("contact ada@example.com today"), "contact <email> today");
  assert.equal(
    scrubPii("user1@example.com,bob@test.io"),
    "<email>,<email>"
  );
});

test("scrubPii: replaces SSNs", () => {
  assert.equal(scrubPii("ssn 123-45-6789 here"), "ssn <ssn> here");
});

test("scrubPii: replaces IPv4 addresses", () => {
  assert.equal(scrubPii("from 10.0.0.1 to 192.168.1.1"), "from <ip> to <ip>");
});

test("scrubPii: replaces phone-shaped strings", () => {
  assert.equal(scrubPii("+33 1 23 45 67 89"), "<phone>");
  assert.equal(scrubPii("call 555-0100 now"), "call <phone> now");
});

test("scrubPii: replaces UUIDs and long hex tokens", () => {
  assert.equal(
    scrubPii("tenant 9795c661-067f-5e14-854d-1fba7be53827 here"),
    "tenant <uuid> here"
  );
  assert.equal(
    scrubPii("token=c9e8ccfca7720f5b99b7fbdb12bdf63691181227547c81dec2a72e17113d4220"),
    "token=<token>"
  );
});

test("scrubPii: leaves benign values alone", () => {
  assert.equal(scrubPii("/pricing"), "/pricing");
  assert.equal(scrubPii("checkout_started"), "checkout_started");
  assert.equal(scrubPii("v1.2.3"), "v1.2.3");
  assert.equal(scrubPii("deadbeef"), "deadbeef"); // 8 hex — below the token threshold
});

test("scrubPii: passes non-string values through unchanged", () => {
  assert.equal(scrubPii(42), 42);
  assert.equal(scrubPii(null), null);
  assert.equal(scrubPii(undefined), undefined);
});

test("scrubSamples: maps array element-wise; non-array becomes empty", () => {
  assert.deepEqual(
    scrubSamples(["ada@example.com", "/pricing"]),
    ["<email>", "/pricing"]
  );
  assert.deepEqual(scrubSamples(null), []);
  assert.deepEqual(scrubSamples("not-an-array"), []);
});

// ── Gap detection ──────────────────────────────────────────────

const emptyReadiness = {
  probeCounts: {
    pageViewsCount: 0, requestsCount: 0,
    userAuthCount: 0, userAnonCount: 0,
    sessionCount: 0, requestSessionCount: 0,
    browserTimingsCount: 0,
  },
};

test("detectGaps: flags missing user identity when no built-in + no alias match", () => {
  const gaps = detectGaps({
    schemaProfile: { tables: { pageViews: true } },
    readinessReport: emptyReadiness,
    customDimensions: [{ keyName: "page" }, { keyName: "country" }],
  });
  assert.ok(gaps.find((g) => g.id === "no-user-id"), "expected no-user-id gap");
});

test("detectGaps: skips no-user-id when authenticated user IDs are present", () => {
  const gaps = detectGaps({
    schemaProfile: { tables: { pageViews: true } },
    readinessReport: {
      probeCounts: { ...emptyReadiness.probeCounts, userAuthCount: 500 },
    },
    customDimensions: [],
  });
  assert.equal(gaps.find((g) => g.id === "no-user-id"), undefined);
});

test("detectGaps: skips no-user-id when an aliased CD key exists (e.g. uid)", () => {
  const gaps = detectGaps({
    schemaProfile: { tables: {} },
    readinessReport: emptyReadiness,
    customDimensions: [{ keyName: "uid" }],
  });
  assert.equal(gaps.find((g) => g.id === "no-user-id"), undefined);
});

test("detectGaps: flags no-session-id when session counts are zero and no alias", () => {
  const gaps = detectGaps({
    schemaProfile: { tables: {} },
    readinessReport: emptyReadiness,
    customDimensions: [{ keyName: "uid" }],
  });
  assert.ok(gaps.find((g) => g.id === "no-session-id"));
});

test("detectGaps: flags no-campaign-tracking unless utm_* or referrer alias is present", () => {
  const withoutCampaign = detectGaps({
    schemaProfile: { tables: { pageViews: true } },
    readinessReport: emptyReadiness,
    customDimensions: [{ keyName: "uid" }],
  });
  assert.ok(withoutCampaign.find((g) => g.id === "no-campaign-tracking"));

  const withUtm = detectGaps({
    schemaProfile: { tables: { pageViews: true } },
    readinessReport: emptyReadiness,
    customDimensions: [{ keyName: "uid" }, { keyName: "utm_source" }],
  });
  assert.equal(withUtm.find((g) => g.id === "no-campaign-tracking"), undefined);
});

test("detectGaps: flags no-browser-timings when table absent and probe count zero", () => {
  const gaps = detectGaps({
    schemaProfile: { tables: { pageViews: true, browserTimings: false } },
    readinessReport: emptyReadiness,
    customDimensions: [],
  });
  assert.ok(gaps.find((g) => g.id === "no-browser-timings"));
});

// ── buildSchemaScan ────────────────────────────────────────────

test("buildSchemaScan: assembles payload, scrubs samples, copies tables, captures gaps", () => {
  const scan = buildSchemaScan({
    schemaProfile: { tables: { pageViews: true, requests: true, browserTimings: false } },
    readinessReport: emptyReadiness,
    eventVolumes: [
      { name: "checkout_started", count: 320 },
      { name: "feature_clicked", count: 1200 },
    ],
    customDimensionSamples: [
      {
        tableName: "requests", keyName: "userEmail",
        cardinality: 312, occurrences: 312,
        samples: ["ada@example.com", "bob@test.io"],
      },
      {
        tableName: "pageViews", keyName: "page",
        cardinality: 28, occurrences: 1200,
        samples: ["/", "/pricing"],
      },
    ],
    timestampSpan: [
      { tableName: "pageViews", earliest: "2026-04-01T00:00:00Z", latest: "2026-05-01T00:00:00Z", eventCount: 4200 },
    ],
  });

  assert.deepEqual(scan.tables, { pageViews: true, requests: true, browserTimings: false });
  assert.equal(scan.eventNames.length, 2);
  assert.equal(scan.eventNames[0].name, "checkout_started");

  const userEmailRow = scan.customDimensions.find((c) => c.keyName === "userEmail");
  assert.deepEqual(userEmailRow.samples, ["<email>", "<email>"]);
  assert.equal(userEmailRow.cardinality, 312);

  assert.equal(scan.timestampSpan.length, 1);
  assert.equal(scan.timestampSpan[0].tableName, "pageViews");

  // No user identity, no session, no campaign, no browser timings → 4 gaps.
  const ids = scan.gaps.map((g) => g.id);
  assert.ok(ids.includes("no-user-id"));
  assert.ok(ids.includes("no-session-id"));
  assert.ok(ids.includes("no-campaign-tracking"));
  assert.ok(ids.includes("no-browser-timings"));

  assert.ok(scan.scannedAt);
  assert.equal(typeof scan.scannedAt, "string");
});

test("buildSchemaScan: tolerates missing inputs (legacy shape: schemaCustomDimensions key)", () => {
  const scan = buildSchemaScan({
    schemaProfile: { tables: {} },
    readinessReport: emptyReadiness,
    eventVolumes: undefined,
    customDimensionSamples: [
      // Old shape from schema-custom-dimensions.kql: `key`/`keyCount`
      { tableName: "pageViews", key: "page", keyCount: 1200 },
    ],
    timestampSpan: null,
  });
  assert.equal(scan.eventNames.length, 0);
  assert.equal(scan.customDimensions.length, 1);
  assert.equal(scan.customDimensions[0].keyName, "page");
  assert.equal(scan.customDimensions[0].occurrences, 1200);
  assert.deepEqual(scan.customDimensions[0].samples, []);
  assert.deepEqual(scan.timestampSpan, []);
});

test("buildSchemaScan: roundtrips through JSON without loss", () => {
  const scan = buildSchemaScan({
    schemaProfile: { tables: { pageViews: true } },
    readinessReport: emptyReadiness,
    eventVolumes: [{ name: "x", count: 1 }],
    customDimensionSamples: [
      { tableName: "pageViews", keyName: "page", cardinality: 1, occurrences: 1, samples: ["/"] },
    ],
    timestampSpan: [{ tableName: "pageViews", earliest: "a", latest: "b", eventCount: 1 }],
  });
  const roundTripped = JSON.parse(JSON.stringify(scan));
  assert.deepEqual(roundTripped, scan);
});
