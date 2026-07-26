import test from "node:test";
import assert from "node:assert/strict";
import session from "express-session";

import { createSessionStore } from "../src/core/sessionStore.js";
import { getDb } from "../src/core/db.js";
import { __resetForTests } from "../src/core/metadataStore.js";

const SECRET = "s".repeat(48);

function store() {
  return createSessionStore(session, { secret: SECRET });
}

const get = (s, sid) => new Promise((res, rej) => s.get(sid, (e, v) => (e ? rej(e) : res(v))));
const set = (s, sid, sess) => new Promise((res, rej) => s.set(sid, sess, (e) => (e ? rej(e) : res())));
const destroy = (s, sid) => new Promise((res, rej) => s.destroy(sid, (e) => (e ? rej(e) : res())));

test("round-trips a session and stores the blob encrypted at rest", async () => {
  __resetForTests();
  const s = store();
  const sess = { cookie: { maxAge: 60000 }, tenantId: "acme", azureRefreshToken: "SECRET-REFRESH-TOKEN" };
  await set(s, "sid-a", sess);

  const got = await get(s, "sid-a");
  assert.equal(got.tenantId, "acme");
  assert.equal(got.azureRefreshToken, "SECRET-REFRESH-TOKEN");

  // The raw column must not contain the plaintext token.
  const row = getDb().prepare("SELECT data FROM sessions WHERE sid = ?").get("sid-a");
  assert.ok(row && typeof row.data === "string");
  assert.ok(!row.data.includes("SECRET-REFRESH-TOKEN"), "token must be encrypted at rest");
});

test("returns null for an expired session and prunes it", async () => {
  __resetForTests();
  const s = store();
  await set(s, "sid-exp", { cookie: { maxAge: -1000 }, tenantId: "x" });
  assert.equal(await get(s, "sid-exp"), null);
});

test("destroy removes the session", async () => {
  __resetForTests();
  const s = store();
  await set(s, "sid-d", { cookie: { maxAge: 60000 }, tenantId: "x" });
  await destroy(s, "sid-d");
  assert.equal(await get(s, "sid-d"), null);
});

test("a wrong secret cannot decrypt (returns null, no throw)", async () => {
  __resetForTests();
  const writer = store();
  await set(writer, "sid-r", { cookie: { maxAge: 60000 }, tenantId: "x" });
  const reader = createSessionStore(session, { secret: "different-secret-entirely" });
  assert.equal(await get(reader, "sid-r"), null);
});
