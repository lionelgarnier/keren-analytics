#!/usr/bin/env node
//
// Repeatable security audit for easy-analytics-for-azure.
//
// Run: `npm run audit:security` (or `node scripts/security-audit.mjs`).
//
// Each check returns PASS / WARN / FAIL. The script exits non-zero only on
// FAIL, so the CI badge stays green for documented and accepted gaps. Add a
// new check by appending to the `checks` list at the bottom — anything that
// can be encoded as a deterministic file/grep/process check belongs here.
//
// Pair file: SECURITY.md (human-readable posture + reporting policy).

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const ciMode = process.argv.includes("--ci") || !process.stdout.isTTY;

const results = [];
function record(name, status, detail) {
  results.push({ name, status, detail });
}

async function listJsFiles(dir) {
  const out = [];
  async function walk(d) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && p.endsWith(".js")) out.push(p);
    }
  }
  await walk(dir);
  return out;
}

// ── Check: no sensitive data in console.* calls ─────────────────────────
async function checkNoSensitiveLogging() {
  const files = await listJsFiles(path.join(repoRoot, "src"));
  // Match a console.<method>(...) that mentions a known sensitive value
  // identifier. We require the *argument* to contain the identifier to
  // avoid false positives on words like "secretStatus".
  const sensitive = /console\.\w+\([^)]*\b(?:access[_-]?[Tt]oken|refresh[_-]?[Tt]oken|code[_-]?[Vv]erifier|client[_-]?[Ss]ecret|sessionSecret|cookieSecret|authorization|api[_-]?key|password|req\.headers)\b/;
  // Lines that only log a length, prefix, or status are intentionally allowed.
  // The .length exemption is scoped to the SENSITIVE value's own length
  // (e.g. token.length) — a blanket `.length` match let `console.log(f(token),
  // x.length)` slip through.
  const safe = [
    /\.substring\s*\(\s*0\s*,/,
    /(?:token|secret|verifier|key|password)\.length\b/i,
    /\bsecretStatus\b/,
  ];
  const offenders = [];
  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (sensitive.test(lines[i]) && !safe.some((re) => re.test(lines[i]))) {
        offenders.push(`${path.relative(repoRoot, file)}:${i + 1}`);
      }
    }
  }
  if (offenders.length === 0) {
    record("No sensitive data in console.*", "PASS", `${files.length} JS files scanned`);
  } else {
    record("No sensitive data in console.*", "FAIL", `Suspicious calls: ${offenders.join(", ")}`);
  }
}

// ── Check: session cookie hardening ─────────────────────────────────────
async function checkSessionHardening() {
  const content = await fs.readFile(path.join(repoRoot, "src/server.js"), "utf8");
  // Match the cookie sub-block directly rather than the whole session({...})
  // call — the latter can contain nested `{ ... }` (e.g. store: factory({...}))
  // that a non-greedy matcher would stop at before reaching the cookie config.
  const block = content.match(/cookie\s*:\s*\{([\s\S]*?)\}/);
  if (!block) {
    record("Session cookie hardening", "FAIL", "session cookie block not found");
    return;
  }
  const cfg = block[1];
  const requirements = [
    { label: "httpOnly: true", re: /httpOnly\s*:\s*true/ },
    { label: "sameSite set", re: /sameSite\s*:\s*["'](lax|strict|none)["']/i },
    { label: "secure tied to NODE_ENV=production", re: /secure\s*:\s*isProduction\b/ },
  ];
  const missing = requirements.filter((r) => !r.re.test(cfg)).map((r) => r.label);
  if (missing.length === 0) {
    record("Session cookie hardening", "PASS", "httpOnly, sameSite, secure-in-prod");
  } else {
    record("Session cookie hardening", "FAIL", `Missing: ${missing.join("; ")}`);
  }
}

// ── Check: CSP directives ───────────────────────────────────────────────
async function checkCsp() {
  const content = await fs.readFile(path.join(repoRoot, "src/server.js"), "utf8");
  const block = content.match(/contentSecurityPolicy\s*:\s*\{[\s\S]*?directives\s*:\s*\{([\s\S]*?)\}\s*,?\s*\}/);
  if (!block) {
    record("CSP configured", "FAIL", "contentSecurityPolicy.directives not found");
    return;
  }
  const cfg = block[1];
  const scriptSrcMatch = cfg.match(/scriptSrc\s*:\s*\[([^\]]*)\]/);
  const scriptSrc = scriptSrcMatch ? scriptSrcMatch[1].trim() : "";
  if (/unsafe-inline|unsafe-eval/.test(scriptSrc)) {
    record("CSP script-src has no 'unsafe-*'", "FAIL", `scriptSrc: ${scriptSrc}`);
  } else {
    record("CSP script-src has no 'unsafe-*'", "PASS", scriptSrc || "'self'");
  }
  const cdnHosts = [...new Set((cfg.match(/https?:\/\/[^"'\s,]+/g) || []))];
  if (cdnHosts.length === 0) {
    record("CSP CDN allowlist", "PASS", "No external origins allowed");
  } else {
    record("CSP CDN allowlist", "WARN", `Allowed: ${cdnHosts.join(", ")} (supply-chain trust required)`);
  }
}

// ── Check: no raw telemetry persistence ─────────────────────────────────
async function checkNoTelemetryPersistence() {
  const files = await listJsFiles(path.join(repoRoot, "src"));
  const writePattern = /\bfs\.(writeFile|appendFile|writeFileSync|appendFileSync|createWriteStream)\b/;
  // The two known/allowed sinks:
  //   - core/audit.js          metadata events (tenantId, queryName, durationMs, status)
  //   - core/metadataStore.js  per-tenant setup metadata + aggregated dashboard
  //                            config in data/store.json (no raw telemetry rows)
  // Adding a new sink? Either allowlist it here AND document why in
  // SECURITY.md, or reroute it. The whole point of this check is to make
  // surprise persistence loud.
  const allowFiles = new Set([
    "src/core/audit.js",
    "src/core/metadataStore.js",
  ]);
  const offenders = [];
  for (const file of files) {
    const rel = path.relative(repoRoot, file).split(path.sep).join("/");
    if (allowFiles.has(rel)) continue;
    const content = await fs.readFile(file, "utf8");
    if (writePattern.test(content)) offenders.push(rel);
  }
  if (offenders.length === 0) {
    record("No raw telemetry persistence", "PASS", `${allowFiles.size} known sinks, no others`);
  } else {
    record("No raw telemetry persistence", "FAIL", `Unexpected fs writes in: ${offenders.join(", ")}`);
  }
}

// ── Check: committed env files contain no real-looking secrets ─────────
async function checkCommittedEnvSafe() {
  const targets = [".env.example", ".env.test"];
  const failures = [];
  for (const t of targets) {
    let content;
    try {
      content = await fs.readFile(path.join(repoRoot, t), "utf8");
    } catch {
      continue;
    }
    const sessionMatch = content.match(/^SESSION_SECRET\s*=\s*(.+)$/m);
    if (sessionMatch && !/(change[-_]?me|placeholder|dev[-_]secret|your[-_])/i.test(sessionMatch[1])) {
      failures.push(`${t}: SESSION_SECRET looks real`);
    }
    if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(content)) {
      failures.push(`${t}: JWT-shaped string committed`);
    }
    const clientSecretMatch = content.match(/^AZURE_CLIENT_SECRET\s*=\s*(.+)$/m);
    if (clientSecretMatch && /[A-Za-z0-9~._-]{30,}/.test(clientSecretMatch[1]) && !/your|placeholder|<|change/i.test(clientSecretMatch[1])) {
      failures.push(`${t}: AZURE_CLIENT_SECRET looks real`);
    }
  }
  if (failures.length === 0) {
    record("Committed env files are placeholders", "PASS", ".env.example and .env.test scanned");
  } else {
    record("Committed env files are placeholders", "FAIL", failures.join("; "));
  }
}

// ── Check: npm audit (high+) ────────────────────────────────────────────
function checkNpmAudit() {
  const r = spawnSync("npm", ["audit", "--json"], { cwd: repoRoot, encoding: "utf8" });
  // npm audit exits non-zero when vulns found — that's expected, we read stdout regardless.
  let report;
  try {
    report = JSON.parse(r.stdout || "{}");
  } catch {
    record("npm audit (high+)", "WARN", "Could not parse npm audit output");
    return;
  }
  const counts = report.metadata?.vulnerabilities || {};
  const blocking = (counts.high || 0) + (counts.critical || 0);
  const moderate = counts.moderate || 0;
  const low = counts.low || 0;
  if (blocking === 0 && moderate === 0 && low === 0) {
    record("npm audit", "PASS", "0 vulnerabilities");
  } else if (blocking === 0) {
    record("npm audit (high+)", "WARN", `${moderate} moderate, ${low} low (no high/critical)`);
  } else {
    record("npm audit (high+)", "FAIL", `${counts.critical || 0} critical, ${counts.high || 0} high, ${moderate} moderate, ${low} low`);
  }
}

// ── Render & exit ───────────────────────────────────────────────────────
function render() {
  const c = (color, s) => (ciMode ? s : `\x1b[${color}m${s}\x1b[0m`);
  const tint = { PASS: (s) => c("32", s), WARN: (s) => c("33", s), FAIL: (s) => c("31", s) };
  console.log(c("1", "Security audit — easy-analytics-for-azure"));
  console.log("=".repeat(58));
  for (const r of results) {
    const status = `[${r.status}]`.padEnd(7);
    console.log(`${tint[r.status](status)} ${r.name.padEnd(42)} ${c("90", r.detail || "")}`);
  }
  const counts = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  console.log("");
  console.log(
    `Summary: ${results.length} checks — ` +
      `${counts.PASS || 0} passed, ${counts.WARN || 0} warning, ${counts.FAIL || 0} failed`
  );
  return (counts.FAIL || 0) === 0 ? 0 : 1;
}

await checkNoSensitiveLogging();
await checkSessionHardening();
await checkCsp();
await checkNoTelemetryPersistence();
await checkCommittedEnvSafe();
checkNpmAudit();
process.exit(render());
