import test from "node:test";
import assert from "node:assert/strict";

import { __resetForTests } from "../src/core/metadataStore.js";
import {
  persistValidation,
  getActiveValidation,
  listValidations,
} from "../src/core/validationStore.js";

function freshTenant(label) {
  return `${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function withFreshDb() {
  __resetForTests();
  return () => __resetForTests();
}

test("persistValidation rejects unknown decisions", () => {
  const restore = withFreshDb();
  try {
    assert.throws(
      () => persistValidation(freshTenant("bad"), { decision: "shrug" }),
      /invalid decision/
    );
  } finally { restore(); }
});

test("accept_all roundtrip: stored as decision='accept_all', overrides null", () => {
  const restore = withFreshDb();
  try {
    const tenantId = freshTenant("accept");
    // mappingId omitted (FK on validations.mapping_id requires a real row;
    // null is allowed and is the realistic case when no AI mapping exists).
    const v = persistValidation(tenantId, { decision: "accept_all" });
    assert.ok(v.id > 0);
    const active = getActiveValidation(tenantId);
    assert.equal(active.decision, "accept_all");
    assert.equal(active.mappingId, null);
    assert.equal(active.overrides, null);
  } finally { restore(); }
});

test("override roundtrip: overrides JSON survives serialization", () => {
  const restore = withFreshDb();
  try {
    const tenantId = freshTenant("override");
    const overrides = {
      canonicalUserId: { source: "customDimensions.uid", expr: 'tostring(customDimensions["uid"])' },
      canonicalSessionId: { source: "session_Id", expr: "session_Id" },
    };
    persistValidation(tenantId, { decision: "override", overrides });
    const active = getActiveValidation(tenantId);
    assert.equal(active.decision, "override");
    assert.deepEqual(active.overrides, overrides);
  } finally { restore(); }
});

test("getActiveValidation returns the most recent row", () => {
  const restore = withFreshDb();
  try {
    const tenantId = freshTenant("recent");
    persistValidation(tenantId, { decision: "accept_all" });
    persistValidation(tenantId, { decision: "reject" });
    const active = getActiveValidation(tenantId);
    assert.equal(active.decision, "reject");
    assert.equal(active.mappingId, null);
  } finally { restore(); }
});

test("listValidations returns history descending", () => {
  const restore = withFreshDb();
  try {
    const tenantId = freshTenant("list");
    persistValidation(tenantId, { decision: "accept_all" });
    persistValidation(tenantId, { decision: "override", overrides: { canonicalUserId: { source: "x", expr: "y" } } });
    const all = listValidations(tenantId);
    assert.equal(all.length, 2);
    assert.equal(all[0].decision, "override");
    assert.equal(all[1].decision, "accept_all");
  } finally { restore(); }
});
