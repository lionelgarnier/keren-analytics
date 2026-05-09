// Minimal fixed-window per-IP rate limiter, in-memory.
//
// Why no `express-rate-limit` dependency: CLAUDE.md mandates a minimal
// dep set, the demo runs single-instance so a memory store is fine, and
// the implementation is small enough to audit. If/when Phase 3 adds a
// shared store (Redis), swap the buckets for a Redis-backed counter
// without changing the public API.

const namespaces = new Map(); // name -> Map<ip, {count, resetAt}>

function getBucket(name) {
  let bucket = namespaces.get(name);
  if (!bucket) {
    bucket = new Map();
    namespaces.set(name, bucket);
  }
  return bucket;
}

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function send429(req, res, retryAfterSec, message) {
  res.set("Retry-After", String(retryAfterSec));
  if (req.accepts(["json", "html"]) === "html") {
    res
      .status(429)
      .type("html")
      .send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Too many requests</title>
<style>
  body{font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:6em auto;padding:0 1em;color:#222}
  h1{font-size:1.4em;margin-bottom:.6em}
  p{margin:.6em 0}
  code{background:#f3f3f3;padding:.1em .3em;border-radius:3px}
</style></head>
<body>
  <h1>High traffic — try again in a few minutes.</h1>
  <p>${message}</p>
  <p>This is a per-IP cap, not an outage. Refreshing now won't help, but waiting roughly one minute will.</p>
  <p>If you're running Keren Analytics yourself, this limit is configurable — see <code>src/core/rateLimit.js</code>.</p>
</body></html>`);
    return;
  }
  res.status(429).json({
    error: "RATE_LIMITED",
    message,
    retryAfter: retryAfterSec,
  });
}

export function createRateLimiter({ windowMs, max, name = "default", message = "Too many requests." }) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error("windowMs must be a positive number");
  if (!Number.isFinite(max) || max <= 0) throw new Error("max must be a positive number");

  return function rateLimit(req, res, next) {
    const bucket = getBucket(name);
    const ip = clientIp(req);
    const now = Date.now();
    const entry = bucket.get(ip);

    if (!entry || entry.resetAt <= now) {
      bucket.set(ip, { count: 1, resetAt: now + windowMs });
      res.set("X-RateLimit-Limit", String(max));
      res.set("X-RateLimit-Remaining", String(max - 1));
      return next();
    }

    if (entry.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.set("X-RateLimit-Limit", String(max));
      res.set("X-RateLimit-Remaining", "0");
      return send429(req, res, retryAfter, message);
    }

    entry.count += 1;
    res.set("X-RateLimit-Limit", String(max));
    res.set("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    next();
  };
}

// Periodic cleanup so the maps don't grow unbounded under sustained
// per-IP traffic (e.g. a botnet spreading across many addresses).
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const bucket of namespaces.values()) {
    for (const [ip, entry] of bucket) {
      if (entry.resetAt <= now) bucket.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

// For tests only — clears all in-memory state.
export function _resetForTests() {
  namespaces.clear();
}
