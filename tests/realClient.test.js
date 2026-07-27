import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AzureApiError,
  categorizeAzureError,
  normalizeAppInsightsResponse,
  parseRetryAfterMs,
  validateQueryResult,
} from "../src/providers/azure/realClient.js";

// These tests call the real production functions (previously the suite only
// re-asserted hand-built literals and never executed categorizeAzureError /
// normalizeAppInsightsResponse at all).

describe("AzureApiError", () => {
  it("carries status/code/actionable", () => {
    const err = new AzureApiError("boom", { status: 403, code: "RBAC_DENIED", actionable: "ask admin" });
    assert.ok(err instanceof Error);
    assert.equal(err.status, 403);
    assert.equal(err.code, "RBAC_DENIED");
    assert.equal(err.actionable, "ask admin");
  });

  it("defaults to 500 / UNKNOWN", () => {
    const err = new AzureApiError("generic");
    assert.equal(err.status, 500);
    assert.equal(err.code, "UNKNOWN");
  });
});

describe("categorizeAzureError", () => {
  it("maps 401 and auth codes to AUTH_EXPIRED", () => {
    assert.equal(categorizeAzureError(401, "", "").code, "AUTH_EXPIRED");
    assert.equal(categorizeAzureError(200, "ExpiredAuthenticationToken", "").code, "AUTH_EXPIRED");
  });

  it("maps 403 / AuthorizationFailed to RBAC_DENIED", () => {
    assert.equal(categorizeAzureError(403, "", "").code, "RBAC_DENIED");
    assert.equal(categorizeAzureError(200, "AuthorizationFailed", "").code, "RBAC_DENIED");
  });

  it("maps 404 to NOT_FOUND and 429 to THROTTLED", () => {
    assert.equal(categorizeAzureError(404, "", "").code, "NOT_FOUND");
    assert.equal(categorizeAzureError(429, "", "").code, "THROTTLED");
  });

  it("maps 502/503/504 to SERVICE_UNAVAILABLE", () => {
    for (const s of [502, 503, 504]) {
      assert.equal(categorizeAzureError(s, "", "").code, "SERVICE_UNAVAILABLE");
    }
  });

  it("maps query semantic errors to QUERY_ERROR and truncates the message", () => {
    const long = "x".repeat(500);
    const r = categorizeAzureError(400, "SemanticError", long);
    assert.equal(r.code, "QUERY_ERROR");
    assert.ok(r.message.length < 200, "message is truncated");
  });

  it("detects 'no data' messages", () => {
    assert.equal(categorizeAzureError(200, "", "workspace does not have any data").code, "NO_DATA");
  });

  it("falls back to AZURE_ERROR", () => {
    assert.equal(categorizeAzureError(418, "Teapot", "brew").code, "AZURE_ERROR");
  });
});

describe("normalizeAppInsightsResponse", () => {
  it("passes through camelCase (Log Analytics direct) unchanged", () => {
    const camel = { tables: [{ name: "PrimaryResult", columns: [{ name: "c", type: "long" }], rows: [[1]] }] };
    assert.strictEqual(normalizeAppInsightsResponse(camel), camel);
  });

  it("converts PascalCase (ARM proxy) to camelCase", () => {
    const pascal = {
      Tables: [{
        TableName: "PrimaryResult",
        Columns: [{ ColumnName: "count_", DataType: "long" }, { ColumnName: "name", ColumnType: "string" }],
        Rows: [[42, "a"], [13, "b"]],
      }],
    };
    const out = normalizeAppInsightsResponse(pascal);
    assert.equal(out.tables[0].name, "PrimaryResult");
    assert.deepEqual(out.tables[0].columns.map((c) => c.name), ["count_", "name"]);
    assert.equal(out.tables[0].columns[0].type, "long");
    assert.equal(out.tables[0].rows.length, 2);
  });

  it("yields an empty tables array when there are none", () => {
    assert.deepEqual(normalizeAppInsightsResponse({ Tables: [] }), { tables: [] });
  });
});

describe("validateQueryResult", () => {
  it("returns an empty-but-valid result for malformed input", () => {
    const out = validateQueryResult(null, "q1");
    assert.ok(Array.isArray(out.tables) && out.tables.length === 1);
    assert.deepEqual(out.tables[0].rows, []);
  });

  it("normalizes an empty tables array to one empty table", () => {
    const out = validateQueryResult({ tables: [] }, "q2");
    assert.equal(out.tables.length, 1);
    assert.deepEqual(out.tables[0].columns, []);
  });

  it("passes a valid result through", () => {
    const valid = { tables: [{ name: "PrimaryResult", columns: [{ name: "c" }], rows: [[1]] }] };
    assert.strictEqual(validateQueryResult(valid, "q3"), valid);
  });
});

describe("parseRetryAfterMs", () => {
  it("parses seconds and clamps to 30s", () => {
    assert.equal(parseRetryAfterMs("5"), 5000);
    assert.equal(parseRetryAfterMs("120"), 30000);
  });

  it("defaults to 1000ms when absent or unparseable", () => {
    assert.equal(parseRetryAfterMs(undefined), 1000);
    assert.equal(parseRetryAfterMs("not-a-date"), 1000);
  });
});
