import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function loadConfig(env) {
  const r = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import('./src/config.js').then(m => process.stdout.write(JSON.stringify({ ok: true, secret: m.config.sessionSecret }))).catch(e => { process.stderr.write(e.message); process.exit(1); });",
    ],
    {
      cwd: repoRoot,
      env: { PATH: process.env.PATH, ...env },
      encoding: "utf8",
    }
  );
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("config: throws in production when SESSION_SECRET is missing", () => {
  const r = loadConfig({ NODE_ENV: "production" });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /SESSION_SECRET is required in production/);
  assert.match(r.stderr, /no value/);
});

test("config: throws in production when SESSION_SECRET is a placeholder", () => {
  for (const placeholder of ["dev-secret-change-me", "change-me-in-production"]) {
    const r = loadConfig({ NODE_ENV: "production", SESSION_SECRET: placeholder });
    assert.equal(r.code, 1, `expected throw for placeholder ${placeholder}`);
    assert.match(r.stderr, /placeholder value/);
  }
});

test("config: accepts a real secret in production", () => {
  const r = loadConfig({
    NODE_ENV: "production",
    SESSION_SECRET: "a".repeat(64),
  });
  assert.equal(r.code, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.secret, "a".repeat(64));
});

test("config: dev mode falls back to default secret with warning", () => {
  const r = loadConfig({});
  assert.equal(r.code, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.secret, "dev-secret-change-me");
});

test("config: test mode falls back silently", () => {
  const r = loadConfig({ NODE_ENV: "test" });
  assert.equal(r.code, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.secret, "dev-secret-change-me");
});
