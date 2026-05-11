import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMappingPrompt,
  MAPPING_RESPONSE_SCHEMA,
  CANONICAL_FIELDS,
} from "../src/ai/promptBuilder.js";

const exampleScan = {
  scannedAt: "2026-05-11T10:00:00Z",
  tables: { pageViews: true, requests: true, browserTimings: false },
  customDimensions: [
    { tableName: "pageViews", keyName: "uid", cardinality: 312, occurrences: 1500, samples: ["abc", "def"] },
    { tableName: "requests", keyName: "campaign", cardinality: 12, occurrences: 540, samples: ["launch-2026"] },
  ],
  eventNames: [{ name: "checkout_started", count: 320 }],
  timestampSpan: [{ tableName: "pageViews", earliest: "2026-04-11", latest: "2026-05-10", eventCount: 4200 }],
  gaps: [{ id: "no-browser-timings", severity: "medium", title: "x" }],
};

test("MAPPING_RESPONSE_SCHEMA is a strict, well-formed JSON schema", () => {
  assert.equal(MAPPING_RESPONSE_SCHEMA.type, "object");
  assert.equal(MAPPING_RESPONSE_SCHEMA.additionalProperties, false);
  for (const required of ["mapping_proposals", "missing_signals", "dashboard_recommendations", "summary"]) {
    assert.ok(MAPPING_RESPONSE_SCHEMA.required.includes(required), `missing required: ${required}`);
    assert.ok(MAPPING_RESPONSE_SCHEMA.properties[required], `missing property: ${required}`);
  }

  // Canonical enum is the four canonicals we already use.
  const canonicalEnum = MAPPING_RESPONSE_SCHEMA.properties.mapping_proposals.items.properties.canonical.enum;
  assert.deepEqual(canonicalEnum, CANONICAL_FIELDS);
  assert.equal(CANONICAL_FIELDS.length, 4);

  // Every nested object has additionalProperties: false (strict mode requires it).
  const proposal = MAPPING_RESPONSE_SCHEMA.properties.mapping_proposals.items;
  assert.equal(proposal.additionalProperties, false);
  const signal = MAPPING_RESPONSE_SCHEMA.properties.missing_signals.items;
  assert.equal(signal.additionalProperties, false);
  assert.equal(MAPPING_RESPONSE_SCHEMA.properties.dashboard_recommendations.additionalProperties, false);
});

test("buildMappingPrompt returns system + user + schema + name", () => {
  const result = buildMappingPrompt({ scan: exampleScan, readinessReport: null });
  assert.equal(typeof result.systemPrompt, "string");
  assert.ok(result.systemPrompt.length > 100);
  assert.equal(typeof result.userPrompt, "string");
  assert.equal(result.schemaName, "mapping_analysis_response");
  assert.strictEqual(result.schema, MAPPING_RESPONSE_SCHEMA);
});

test("buildMappingPrompt embeds scan data verbatim (after compaction)", () => {
  const result = buildMappingPrompt({ scan: exampleScan, readinessReport: null });
  assert.ok(result.userPrompt.includes('"uid"'));
  assert.ok(result.userPrompt.includes('"campaign"'));
  assert.ok(result.userPrompt.includes('"checkout_started"'));
  assert.ok(result.userPrompt.includes('"no-browser-timings"'));
});

test("buildMappingPrompt includes readiness when provided", () => {
  const readiness = {
    overallStatus: "OK",
    availableSignals: { pageViews: true, sessionId: false },
    probeCounts: { pageViewsCount: 4200, userAuthCount: 0 },
  };
  const result = buildMappingPrompt({ scan: exampleScan, readinessReport: readiness });
  assert.ok(result.userPrompt.includes('"overallStatus": "OK"'));
  assert.ok(result.userPrompt.includes('"pageViewsCount": 4200'));
});

test("buildMappingPrompt caps customDimensions samples to 3 (cost discipline)", () => {
  const noisyScan = {
    ...exampleScan,
    customDimensions: [
      {
        tableName: "pageViews", keyName: "noisy",
        cardinality: 99, occurrences: 99,
        samples: ["a", "b", "c", "d", "e", "f", "g"],
      },
    ],
  };
  const result = buildMappingPrompt({ scan: noisyScan, readinessReport: null });
  // Only 3 samples should leak through; "d", "e", "f", "g" must NOT appear.
  assert.ok(result.userPrompt.includes('"a"'));
  assert.ok(result.userPrompt.includes('"b"'));
  assert.ok(result.userPrompt.includes('"c"'));
  assert.equal(result.userPrompt.includes('"d"'), false);
  assert.equal(result.userPrompt.includes('"g"'), false);
});
