import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";

import { app } from "../src/server.js";
import { __resetForTests } from "../src/core/metadataStore.js";

// The suite runs with KEREN_DISABLE_CSRF=1 (.env.test). These tests flip it OFF
// so verifyCsrf actually runs, then restore it. verifyCsrf reads the env at
// call time, so this toggles enforcement per request.
async function withCsrfEnforced(fn) {
  const prev = process.env.KEREN_DISABLE_CSRF;
  delete process.env.KEREN_DISABLE_CSRF;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.KEREN_DISABLE_CSRF;
    else process.env.KEREN_DISABLE_CSRF = prev;
  }
}

async function authed() {
  const agent = supertest.agent(app);
  await agent.get(`/auth/login?tenant=csrf-${process.pid}-${Date.now()}`).redirects(5).expect(200);
  const session = await agent.get("/auth/session").expect(200);
  return { agent, csrfToken: session.body.csrfToken };
}

test("mutating route rejects a POST with no CSRF token", async () => {
  __resetForTests();
  await withCsrfEnforced(async () => {
    const { agent } = await authed();
    const res = await agent.post("/azure/select/clear").expect(403);
    assert.equal(res.body.error, "CSRF_MISMATCH");
  });
});

test("mutating route accepts a POST carrying the session's CSRF token", async () => {
  __resetForTests();
  await withCsrfEnforced(async () => {
    const { agent, csrfToken } = await authed();
    assert.ok(csrfToken, "session should issue a csrfToken");
    await agent.post("/azure/select/clear").set("X-CSRF-Token", csrfToken).expect(200);
  });
});

test("mutating route rejects a POST with a wrong CSRF token", async () => {
  __resetForTests();
  await withCsrfEnforced(async () => {
    const { agent } = await authed();
    const res = await agent.post("/azure/select/clear").set("X-CSRF-Token", "not-the-token").expect(403);
    assert.equal(res.body.error, "CSRF_MISMATCH");
  });
});

test("scan/stream rejects without the csrf query token", async () => {
  __resetForTests();
  await withCsrfEnforced(async () => {
    const { agent } = await authed();
    const res = await agent.get("/api/setup/scan/stream").expect(403);
    assert.equal(res.body.error, "CSRF_MISMATCH");
  });
});
