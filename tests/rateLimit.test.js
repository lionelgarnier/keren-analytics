import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, _resetForTests } from "../src/core/rateLimit.js";

function mockReqRes({ ip = "1.2.3.4", accept = "application/json" } = {}) {
  const req = {
    ip,
    headers: { accept },
    accepts(types) {
      if (!Array.isArray(types)) types = [types];
      const a = (accept || "").toLowerCase();
      // Naive but sufficient for tests: pick the first preferred type that
      // the Accept header mentions; default to the first option.
      for (const t of types) {
        if (t === "html" && a.includes("text/html")) return "html";
        if (t === "json" && (a.includes("application/json") || a === "*/*" || a === "")) return "json";
      }
      return types[0];
    },
  };
  const headers = {};
  let statusCode = 200;
  let body = null;
  let bodyType = null;
  const res = {
    set(name, value) { headers[name.toLowerCase()] = String(value); return res; },
    status(code) { statusCode = code; return res; },
    type(t) { bodyType = t; return res; },
    send(b) { body = b; return res; },
    json(b) { bodyType = "json"; body = b; return res; },
  };
  function snapshot() {
    return { statusCode, headers, body, bodyType };
  }
  return { req, res, snapshot };
}

test("createRateLimiter passes requests under the cap", () => {
  _resetForTests();
  const mw = createRateLimiter({ windowMs: 1000, max: 3, name: "t1" });
  let nextCalls = 0;
  const next = () => nextCalls++;
  for (let i = 0; i < 3; i++) {
    const { req, res } = mockReqRes();
    mw(req, res, next);
  }
  assert.equal(nextCalls, 3);
});

test("createRateLimiter blocks the first request over the cap with 429 JSON", () => {
  _resetForTests();
  const mw = createRateLimiter({ windowMs: 1000, max: 2, name: "t2", message: "stop" });
  const next = () => {};
  for (let i = 0; i < 2; i++) {
    const { req, res } = mockReqRes();
    mw(req, res, next);
  }
  const { req, res, snapshot } = mockReqRes();
  let nextCalled = false;
  mw(req, res, () => (nextCalled = true));
  const snap = snapshot();
  assert.equal(nextCalled, false);
  assert.equal(snap.statusCode, 429);
  assert.equal(snap.body.error, "RATE_LIMITED");
  assert.equal(snap.body.message, "stop");
  assert.ok(snap.body.retryAfter >= 1);
  assert.equal(snap.headers["retry-after"], String(snap.body.retryAfter));
  assert.equal(snap.headers["x-ratelimit-limit"], "2");
  assert.equal(snap.headers["x-ratelimit-remaining"], "0");
});

test("createRateLimiter returns an HTML 429 when the client prefers text/html", () => {
  _resetForTests();
  const mw = createRateLimiter({ windowMs: 1000, max: 1, name: "t3" });
  // Burn the budget.
  mw(mockReqRes({ accept: "text/html" }).req, mockReqRes({ accept: "text/html" }).res, () => {});
  const { req, res, snapshot } = mockReqRes({ accept: "text/html" });
  mw(req, res, () => {});
  const snap = snapshot();
  assert.equal(snap.statusCode, 429);
  assert.equal(snap.bodyType, "html");
  assert.match(snap.body, /High traffic/i);
  assert.match(snap.body, /per-IP cap/i);
});

test("createRateLimiter isolates buckets per IP", () => {
  _resetForTests();
  const mw = createRateLimiter({ windowMs: 1000, max: 1, name: "t4" });
  let aPassed = 0;
  let bPassed = 0;
  mw(mockReqRes({ ip: "10.0.0.1" }).req, mockReqRes().res, () => aPassed++);
  mw(mockReqRes({ ip: "10.0.0.2" }).req, mockReqRes().res, () => bPassed++);
  assert.equal(aPassed, 1);
  assert.equal(bPassed, 1);
});

test("createRateLimiter resets after the window elapses", () => {
  _resetForTests();
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const mw = createRateLimiter({ windowMs: 1000, max: 1, name: "t5" });
    let passed = 0;
    mw(mockReqRes().req, mockReqRes().res, () => passed++);
    // Second call inside the window: blocked.
    let blocked = false;
    const second = mockReqRes();
    mw(second.req, second.res, () => (blocked = false));
    assert.equal(second.snapshot().statusCode, 429);
    // Advance past the window.
    now += 1500;
    mw(mockReqRes().req, mockReqRes().res, () => passed++);
    assert.equal(passed, 2);
    void blocked;
  } finally {
    Date.now = realNow;
  }
});

test("createRateLimiter buckets are isolated by name", () => {
  _resetForTests();
  const a = createRateLimiter({ windowMs: 1000, max: 1, name: "bucket-a" });
  const b = createRateLimiter({ windowMs: 1000, max: 1, name: "bucket-b" });
  let aPassed = 0;
  let bPassed = 0;
  // Same IP, different limiters — each gets its own budget.
  a(mockReqRes().req, mockReqRes().res, () => aPassed++);
  b(mockReqRes().req, mockReqRes().res, () => bPassed++);
  assert.equal(aPassed, 1);
  assert.equal(bPassed, 1);
});

test("createRateLimiter exposes X-RateLimit-Remaining accurately", () => {
  _resetForTests();
  const mw = createRateLimiter({ windowMs: 1000, max: 3, name: "t6" });
  const remainings = [];
  for (let i = 0; i < 3; i++) {
    const { req, res, snapshot } = mockReqRes();
    mw(req, res, () => {});
    remainings.push(snapshot().headers["x-ratelimit-remaining"]);
  }
  assert.deepEqual(remainings, ["2", "1", "0"]);
});

test("createRateLimiter rejects invalid options eagerly", () => {
  assert.throws(() => createRateLimiter({ windowMs: 0, max: 5 }), /windowMs/);
  assert.throws(() => createRateLimiter({ windowMs: 1000, max: 0 }), /max/);
  assert.throws(() => createRateLimiter({ windowMs: -1, max: 5 }), /windowMs/);
  assert.throws(() => createRateLimiter({ windowMs: NaN, max: 5 }), /windowMs/);
});
