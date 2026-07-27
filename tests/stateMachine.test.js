import test from "node:test";
import assert from "node:assert/strict";

import { PipelineStates } from "../src/core/stateMachine.js";
import { logStateTransition, getTenant } from "../src/core/metadataStore.js";
import { __resetForTests } from "../src/core/metadataStore.js";

test("PipelineStates values are unique, non-empty strings", () => {
  const values = Object.values(PipelineStates);
  assert.ok(values.length > 0);
  for (const v of values) {
    assert.equal(typeof v, "string");
    assert.ok(v.length > 0);
  }
  assert.equal(new Set(values).size, values.length, "no duplicate state values");
});

test("logStateTransition persists named states in order (per-tenant history)", () => {
  __resetForTests();
  const tenantId = "sm-tenant";
  const seq = [
    PipelineStates.DISCOVERING_RESOURCES,
    PipelineStates.CHECKING_ACCESS,
    PipelineStates.READINESS_PROBES,
    PipelineStates.READY,
  ];
  for (const state of seq) logStateTransition(tenantId, { state });

  const history = getTenant(tenantId).stateTransitions.map((t) => t.state);
  assert.deepEqual(history, seq);
});

test("logStateTransition records a detail when provided", () => {
  __resetForTests();
  logStateTransition("sm-detail", { state: PipelineStates.NO_ACCESS, detail: "missing RBAC" });
  const last = getTenant("sm-detail").stateTransitions.at(-1);
  assert.equal(last.state, PipelineStates.NO_ACCESS);
  assert.equal(last.detail, "missing RBAC");
});
