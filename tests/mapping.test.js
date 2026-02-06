import test from "node:test";
import assert from "node:assert/strict";
import { buildMapping } from "../src/core/mapping.js";

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
  assert.equal(mapping.canonicalSessionId.source, "session_Id");
  assert.equal(mapping.canonicalPagePath.source, "pageViews.url");
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
