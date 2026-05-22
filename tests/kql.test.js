import test from "node:test";
import assert from "node:assert/strict";
import { renderTemplate, loadKqlTemplate, clearTemplateCache } from "../src/core/kql.js";

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

test("identity-count templates use dcountif so empty columns yield 0", () => {
  // Bare dcount() of an all-empty-string column returns 1; dcountif() with an
  // isnotempty guard returns 0. These five templates count an identity column.
  clearTemplateCache();
  const params = {
    timeStart: 'datetime("2024-01-01T00:00:00Z")',
    timeEnd: 'datetime("2024-01-08T00:00:00Z")',
    tableName: "requests",
    userIdExpr: "user_AuthenticatedId",
    sessionIdExpr: "session_Id",
    pagePathExpr: "name",
    binSize: "1d",
  };
  const templates = [
    "unique-visitors-user",
    "unique-visitors-session",
    "sessions",
    "peak-hours",
    "daily-trend",
  ];
  for (const name of templates) {
    const rendered = renderTemplate(loadKqlTemplate(name), params);
    assert.ok(rendered.includes("dcountif("), `${name} should count with dcountif`);
    assert.ok(!rendered.includes("dcount("), `${name} should have no bare dcount(`);
  }
});
