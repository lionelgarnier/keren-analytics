import test from "node:test";
import assert from "node:assert/strict";
import { renderTemplate } from "../src/core/kql.js";

test("renderTemplate rejects disallowed params", () => {
  const template = "table {{tableName}}";
  assert.throws(
    () => renderTemplate(template, { tableName: "badTable" }, { tableName: ["requests"] }),
    /not allowed/
  );
});

test("renderTemplate substitutes params", () => {
  const template = "let start={{timeStart}};";
  const rendered = renderTemplate(template, { timeStart: 'datetime("2024-01-01T00:00:00Z")' });
  assert.equal(rendered, 'let start=datetime("2024-01-01T00:00:00Z");');
});
