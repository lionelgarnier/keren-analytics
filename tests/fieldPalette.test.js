import test from "node:test";
import assert from "node:assert/strict";

import { buildFieldPalette } from "../src/core/fieldPalette.js";

// A scan payload shaped like schemaScan.buildSchemaScan output.
const scan = {
  tables: { pageViews: true, requests: true, customEvents: true },
  customDimensions: [
    { tableName: "customEvents", keyName: "uid", cardinality: 4200, occurrences: 9100, samples: ["<uuid>"] },
    { tableName: "pageViews", keyName: "uid", cardinality: 4200, occurrences: 800, samples: [] },
    { tableName: "customEvents", keyName: "tenant", cardinality: 3, occurrences: 9100, samples: ["acme"] },
    { tableName: "pageViews", keyName: "refUri", cardinality: 50, occurrences: 800, samples: ["https://x"] },
  ],
  eventNames: [{ name: "request", count: 8900 }],
};

test("builds a palette keyed by the four canonical fields", () => {
  const palette = buildFieldPalette(scan);
  assert.deepEqual(
    Object.keys(palette).sort(),
    ["canonicalPagePath", "canonicalReferrer", "canonicalSessionId", "canonicalUserId"]
  );
});

test("offers built-in columns per field", () => {
  const palette = buildFieldPalette(scan);
  const userBuiltins = palette.canonicalUserId.filter((c) => c.kind === "builtin").map((c) => c.source);
  assert.ok(userBuiltins.includes("user_AuthenticatedId"));
  assert.ok(userBuiltins.includes("user_Id"));
  // pagePath builtins follow the present event table.
  const pageBuiltins = palette.canonicalPagePath.filter((c) => c.kind === "builtin").map((c) => c.source);
  assert.ok(pageBuiltins.includes("pageViews.url"));
});

test("alias-matched custom dimension is recommended and ranks first among custom", () => {
  const palette = buildFieldPalette(scan);
  const custom = palette.canonicalUserId.filter((c) => c.kind === "custom");
  assert.equal(custom[0].label, "uid");
  assert.equal(custom[0].recommended, true);
  assert.equal(custom[0].expr, 'tostring(customDimensions["uid"])');
  // Seen in two tables -> high confidence.
  assert.equal(custom[0].confidence, "high");
  assert.deepEqual(custom[0].meta.tables.sort(), ["customEvents", "pageViews"]);
});

test("non-matching custom dimensions are still offered (low confidence, not recommended)", () => {
  const palette = buildFieldPalette(scan);
  const tenant = palette.canonicalUserId.find((c) => c.label === "tenant");
  assert.ok(tenant, "every safe custom dimension should be selectable");
  assert.equal(tenant.recommended, false);
  assert.equal(tenant.confidence, "low");
});

test("custom dimension keys are deduped across tables into one candidate", () => {
  const palette = buildFieldPalette(scan);
  const uids = palette.canonicalUserId.filter((c) => c.label === "uid");
  assert.equal(uids.length, 1);
});

test("rejects injection-unsafe custom dimension keys", () => {
  const palette = buildFieldPalette({
    tables: {},
    customDimensions: [{ tableName: "customEvents", keyName: 'evil"]) | drop', cardinality: 1, occurrences: 1, samples: [] }],
  });
  for (const candidates of Object.values(palette)) {
    assert.ok(candidates.every((c) => c.kind !== "custom"), "unsafe key must not become a candidate");
  }
});

test("tolerates an empty / missing scan", () => {
  const palette = buildFieldPalette({});
  assert.equal(palette.canonicalReferrer.some((c) => c.kind === "builtin"), true);
  assert.doesNotThrow(() => buildFieldPalette(null));
});
