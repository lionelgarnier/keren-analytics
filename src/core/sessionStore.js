/**
 * Persistent, encrypted session store backed by node:sqlite (the same DB as
 * the rest of the app, so it inherits the Blob backup + restore-on-boot).
 *
 * Replaces express-session's default MemoryStore, which (a) leaks memory /
 * enables a trivial DoS by creating unbounded sessions, (b) drops every session
 * on each Container App redeploy, and (c) holds Azure refresh tokens
 * (user_impersonation) in plaintext on the heap.
 *
 * The whole session blob is encrypted at rest with AES-256-GCM, keyed from
 * SESSION_SECRET — so the stored refresh/access tokens are never readable from
 * a DB dump or Blob snapshot without the secret. No new dependency: crypto is
 * node:crypto, storage is node:sqlite.
 */
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { getDb } from "./db.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // matches the cookie maxAge

function deriveKey(secret) {
  // Fixed, app-specific salt: the secret is the entropy source, and a stable
  // salt lets any replica/restore decrypt sessions written by another.
  return scryptSync(String(secret), "keren-session-store-v1", 32);
}

function encrypt(key, plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

function decrypt(key, blob) {
  const [ivB64, tagB64, ctB64] = String(blob).split(".");
  if (!ivB64 || !tagB64 || !ctB64) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    // Wrong key (rotated secret) or tampered blob — treat as no session.
    return null;
  }
}

/**
 * Build a session store class bound to `session.Store`, then return an instance.
 * @param {import("express-session")} session - the express-session module
 * @param {{ secret: string, ttlMs?: number }} opts
 */
export function createSessionStore(session, { secret, ttlMs = DEFAULT_TTL_MS } = {}) {
  const key = deriveKey(secret);

  class SqliteSessionStore extends session.Store {
    constructor() {
      super();
      this.ttlMs = ttlMs;
      // Periodic prune of expired rows so the table can't grow unbounded.
      this.pruneTimer = setInterval(() => this.prune(), 60 * 60 * 1000);
      if (typeof this.pruneTimer.unref === "function") this.pruneTimer.unref();
    }

    // Resolve the live handle per call — never cache it: tests (and a reconnect)
    // can close and recreate the connection, which would leave a cached handle
    // pointing at a destroyed :memory: database.
    get db() {
      return getDb();
    }

    _expiryFromSession(sess) {
      const maxAge = sess?.cookie?.maxAge;
      return Date.now() + (typeof maxAge === "number" ? maxAge : this.ttlMs);
    }

    get(sid, cb) {
      try {
        const row = this.db.prepare("SELECT data, expires FROM sessions WHERE sid = ?").get(sid);
        if (!row) return cb(null, null);
        if (row.expires < Date.now()) {
          this.db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
          return cb(null, null);
        }
        const json = decrypt(key, row.data);
        if (json === null) return cb(null, null);
        return cb(null, JSON.parse(json));
      } catch (err) {
        return cb(err);
      }
    }

    set(sid, sess, cb) {
      try {
        const data = encrypt(key, JSON.stringify(sess));
        const expires = this._expiryFromSession(sess);
        this.db
          .prepare(
            `INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
             ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`
          )
          .run(sid, data, expires);
        return cb ? cb(null) : undefined;
      } catch (err) {
        return cb ? cb(err) : undefined;
      }
    }

    touch(sid, sess, cb) {
      try {
        this.db
          .prepare("UPDATE sessions SET expires = ? WHERE sid = ?")
          .run(this._expiryFromSession(sess), sid);
        return cb ? cb(null) : undefined;
      } catch (err) {
        return cb ? cb(err) : undefined;
      }
    }

    destroy(sid, cb) {
      try {
        this.db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
        return cb ? cb(null) : undefined;
      } catch (err) {
        return cb ? cb(err) : undefined;
      }
    }

    prune() {
      try {
        this.db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
      } catch {
        // best-effort housekeeping
      }
    }
  }

  return new SqliteSessionStore();
}
