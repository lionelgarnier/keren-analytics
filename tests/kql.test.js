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

test("error-rate templates separate server (5xx) from client (4xx) errors", () => {
  clearTemplateCache();
  const params = {
    timeStart: 'datetime("2024-01-01T00:00:00Z")',
    timeEnd: 'datetime("2024-01-08T00:00:00Z")',
  };
  const perf = renderTemplate(loadKqlTemplate("performance"), params);
  assert.ok(perf.includes("clientErrorRate"), "performance exposes a separate clientErrorRate");
  assert.ok(perf.includes("statusCode >= 500"), "performance counts 5xx as server errors");
  // The old definition counted every failure (incl. 404s) as an error.
  assert.ok(!/countif\(success == false\)/.test(perf), "performance no longer counts every failure as an error");

  const slow = renderTemplate(loadKqlTemplate("slow-endpoints"), params);
  assert.ok(slow.includes("statusCode >= 500"), "slow-endpoints counts 5xx as server errors");
});

test("backend APM templates render and target the right tables", () => {
  clearTemplateCache();
  const params = {
    timeStart: 'datetime("2024-01-01T00:00:00Z")',
    timeEnd: 'datetime("2024-01-08T00:00:00Z")',
  };

  const depOverview = renderTemplate(loadKqlTemplate("dependency-overview"), params);
  assert.ok(/^dependencies/m.test(depOverview) || depOverview.includes("\ndependencies"), "dependency-overview reads the dependencies table");
  assert.ok(depOverview.includes("failureRate"), "dependency-overview exposes failureRate");

  const slowDeps = renderTemplate(loadKqlTemplate("slow-dependencies"), params);
  assert.ok(slowDeps.includes("percentile(duration, 95)"), "slow-dependencies computes p95");
  assert.ok(slowDeps.includes("by depTarget, depType"), "slow-dependencies groups by target + type");

  const depTypes = renderTemplate(loadKqlTemplate("dependency-types"), params);
  assert.ok(depTypes.includes("by depType"), "dependency-types groups by type");

  const svc = renderTemplate(loadKqlTemplate("service-health"), params);
  assert.ok(svc.includes("cloud_RoleName"), "service-health pivots on cloud_RoleName");
  assert.ok(svc.includes("statusCode >= 500"), "service-health counts 5xx as server errors");

  const codes = renderTemplate(loadKqlTemplate("status-codes"), params);
  assert.ok(codes.includes('"5xx"') && codes.includes('"2xx"'), "status-codes buckets response classes");
});

test("top-exceptions template never projects raw exception messages (PII guard)", () => {
  clearTemplateCache();
  const rendered = renderTemplate(loadKqlTemplate("top-exceptions"), {
    timeStart: 'datetime("2024-01-01T00:00:00Z")',
    timeEnd: 'datetime("2024-01-08T00:00:00Z")',
  });
  assert.ok(rendered.includes("problemId"), "exceptions surface the safe problemId");
  // Raw message / stack-trace fields routinely carry user PII — they must
  // never leave the workspace.
  assert.ok(!/outerMessage/i.test(rendered), "no outerMessage");
  assert.ok(!/\bmessage\b/i.test(rendered), "no raw message field");
  assert.ok(!/details/i.test(rendered), "no exception details blob");
});

test("service-traffic template unions the main tables and bins by day", () => {
  clearTemplateCache();
  const rendered = renderTemplate(loadKqlTemplate("service-traffic"), {
    timeStart: 'datetime("2024-01-01T00:00:00Z")',
    timeEnd: 'datetime("2024-01-08T00:00:00Z")',
  });
  // isfuzzy lets a resource missing a table (e.g. no pageViews on a backend
  // service) still return a result instead of failing the whole union.
  assert.ok(rendered.includes("union isfuzzy=true"), "tolerates missing tables");
  for (const table of ["requests", "pageViews", "customEvents", "dependencies", "exceptions"]) {
    assert.ok(rendered.includes(table), `unions ${table}`);
  }
  assert.ok(rendered.includes("bin(timestamp, 1d)"), "buckets per day");
  assert.ok(rendered.includes("count = count()"), "exposes a count column");
});

test("readiness-probes template probes backend signals", () => {
  clearTemplateCache();
  const rendered = renderTemplate(loadKqlTemplate("readiness-probes"), {
    timeStart: 'datetime("2024-01-01T00:00:00Z")',
    timeEnd: 'datetime("2024-01-08T00:00:00Z")',
  });
  assert.ok(rendered.includes("dependenciesCount"), "probes dependency volume");
  assert.ok(rendered.includes("exceptionsCount"), "probes exception volume");
  assert.ok(rendered.includes("roleCount"), "probes distinct cloud roles");
});
