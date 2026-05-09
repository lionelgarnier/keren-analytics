import test from "node:test";
import assert from "node:assert/strict";
import { allowedKqlExpressions, buildMapping } from "../src/core/mapping.js";

test("buildMapping prefers authenticated user and pageViews", () => {
  const mapping = buildMapping({
    schemaProfile: {
      tables: { pageViews: true, requests: true },
      customDimensionsKeys: {},
    },
    readinessReport: {
      availableSignals: { pageViews: true, requests: true },
      probeCounts: { userAuthCount: 10, sessionCount: 20 },
    },
  });

  assert.equal(mapping.canonicalUserId.source, "user_AuthenticatedId");
  assert.equal(mapping.canonicalUserId.matchType, "builtin");
  assert.equal(mapping.canonicalSessionId.source, "session_Id");
  assert.equal(mapping.canonicalSessionId.matchType, "builtin");
  assert.equal(mapping.canonicalPagePath.source, "pageViews.url");
  assert.equal(mapping.canonicalPagePath.matchType, "builtin");
  assert.equal(mapping.pageTable, "pageViews");
});

test("buildMapping falls back to requests when no pageViews", () => {
  const mapping = buildMapping({
    schemaProfile: {
      tables: { pageViews: false, requests: true },
      customDimensionsKeys: {},
    },
    readinessReport: {
      availableSignals: { pageViews: false, requests: true },
      probeCounts: { userAuthCount: 0, userAnonCount: 10 },
    },
  });

  assert.equal(mapping.canonicalUserId.source, "user_Id");
  assert.equal(mapping.canonicalPagePath.source, "requests.url");
  assert.equal(mapping.pageTable, "requests");
});

test("buildMapping resolves userId via exact alias when no built-in user fields", () => {
  const mapping = buildMapping({
    schemaProfile: {
      tables: { pageViews: false, requests: true },
      customDimensionsKeys: {
        requests: ["uid", "region"],
      },
    },
    readinessReport: {
      availableSignals: { pageViews: false, requests: true },
      probeCounts: { userAuthCount: 0, userAnonCount: 0, sessionCount: 5 },
    },
  });

  assert.equal(mapping.canonicalUserId.source, "customDimensions.uid");
  assert.equal(mapping.canonicalUserId.expr, 'tostring(customDimensions["uid"])');
  assert.equal(mapping.canonicalUserId.matchType, "alias");
  assert.equal(mapping.canonicalUserId.matchedKey, "uid");
  assert.deepEqual(mapping.canonicalUserId.tablesSeen, ["requests"]);
  assert.equal(mapping.canonicalUserId.confidence, "medium");
});

test("buildMapping alias match is case-insensitive", () => {
  const mapping = buildMapping({
    schemaProfile: {
      tables: { pageViews: true },
      customDimensionsKeys: {
        pageViews: ["VisitorId"],
      },
    },
    readinessReport: {
      availableSignals: { pageViews: true },
      probeCounts: { userAuthCount: 0, userAnonCount: 0 },
    },
  });

  assert.equal(mapping.canonicalUserId.matchType, "alias");
  assert.equal(mapping.canonicalUserId.matchedKey, "VisitorId");
  assert.equal(mapping.canonicalUserId.expr, 'tostring(customDimensions["VisitorId"])');
});

test("buildMapping resolves sessionId via regex pattern when no exact alias", () => {
  const mapping = buildMapping({
    schemaProfile: {
      tables: { pageViews: true },
      customDimensionsKeys: {
        pageViews: ["browsing_token"],
      },
    },
    readinessReport: {
      availableSignals: { pageViews: true },
      probeCounts: { userAuthCount: 1, sessionCount: 0, requestSessionCount: 0 },
    },
  });

  assert.equal(mapping.canonicalSessionId.matchType, "pattern");
  assert.equal(mapping.canonicalSessionId.matchedKey, "browsing_token");
  assert.equal(mapping.canonicalSessionId.source, "customDimensions.browsing_token");
});

test("buildMapping cross-table consistency boosts confidence to high", () => {
  const mapping = buildMapping({
    schemaProfile: {
      tables: { pageViews: true, requests: true },
      customDimensionsKeys: {
        pageViews: ["uid", "env"],
        requests: ["uid", "region"],
        customEvents: ["uid", "feature"],
      },
    },
    readinessReport: {
      availableSignals: { pageViews: true, requests: true },
      probeCounts: { userAuthCount: 0, userAnonCount: 0 },
    },
  });

  assert.equal(mapping.canonicalUserId.matchedKey, "uid");
  assert.deepEqual(mapping.canonicalUserId.tablesSeen, ["pageViews", "requests", "customEvents"]);
  assert.equal(mapping.canonicalUserId.confidence, "high");
});

test("buildMapping prefers the cross-table alias hit over a single-table one", () => {
  const mapping = buildMapping({
    schemaProfile: {
      tables: { pageViews: true, requests: true },
      customDimensionsKeys: {
        pageViews: ["sub", "uid"],
        requests: ["uid"],
      },
    },
    readinessReport: {
      availableSignals: { pageViews: true, requests: true },
      probeCounts: { userAuthCount: 0, userAnonCount: 0 },
    },
  });

  assert.equal(mapping.canonicalUserId.matchedKey, "uid");
  assert.equal(mapping.canonicalUserId.confidence, "high");
});

test("buildMapping built-in user wins over custom alias", () => {
  const mapping = buildMapping({
    schemaProfile: {
      tables: { pageViews: true },
      customDimensionsKeys: {
        pageViews: ["uid"],
      },
    },
    readinessReport: {
      availableSignals: { pageViews: true },
      probeCounts: { userAuthCount: 100, userAnonCount: 0 },
    },
  });

  assert.equal(mapping.canonicalUserId.source, "user_AuthenticatedId");
  assert.equal(mapping.canonicalUserId.matchType, "builtin");
});

test("buildMapping returns null userId when no signals or aliases match", () => {
  const mapping = buildMapping({
    schemaProfile: {
      tables: { pageViews: true },
      customDimensionsKeys: {
        pageViews: ["acmeXid", "b2b_ref_47"],
      },
    },
    readinessReport: {
      availableSignals: { pageViews: true },
      probeCounts: { userAuthCount: 0, userAnonCount: 0 },
    },
  });

  assert.equal(mapping.canonicalUserId, null);
});

test("buildMapping skips unsafe custom dimension keys", () => {
  const mapping = buildMapping({
    schemaProfile: {
      tables: { pageViews: true },
      customDimensionsKeys: {
        pageViews: ['evil"; drop"', "uid"],
      },
    },
    readinessReport: {
      availableSignals: { pageViews: true },
      probeCounts: { userAuthCount: 0, userAnonCount: 0 },
    },
  });

  assert.equal(mapping.canonicalUserId.matchedKey, "uid");
  assert.equal(mapping.canonicalUserId.expr, 'tostring(customDimensions["uid"])');
});

test("allowedKqlExpressions extends whitelist with mapping-derived custom exprs", () => {
  const mapping = buildMapping({
    schemaProfile: {
      tables: { pageViews: true },
      customDimensionsKeys: {
        pageViews: ["uid", "browsing_token"],
      },
    },
    readinessReport: {
      availableSignals: { pageViews: true },
      probeCounts: { userAuthCount: 0, userAnonCount: 0 },
    },
  });

  const allowed = allowedKqlExpressions(mapping);
  assert.ok(allowed.userIdExpr.includes('tostring(customDimensions["uid"])'));
  assert.ok(allowed.sessionIdExpr.includes('tostring(customDimensions["browsing_token"])'));
  // Static defaults remain whitelisted too.
  assert.ok(allowed.userIdExpr.includes("user_AuthenticatedId"));
});

test("allowedKqlExpressions without mapping returns the static defaults", () => {
  const allowed = allowedKqlExpressions();
  assert.ok(allowed.userIdExpr.includes("user_AuthenticatedId"));
  assert.ok(allowed.userIdExpr.includes("user_Id"));
  assert.ok(allowed.sessionIdExpr.includes("session_Id"));
});
