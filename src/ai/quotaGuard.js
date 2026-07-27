/**
 * Daily quota guard for LLM spend — Track F3 (ADR 0005).
 *
 * Tracks accumulated EUR spend per UTC day, persisted in SQLite so the cap is a
 * genuine *daily* budget that survives a redeploy — the previous in-memory
 * counter reset on every process restart, turning "10 €/day" into "10 € per
 * process lifetime". Once `dailyEurCap` is reached, `isUnderCap()` returns
 * false and callers degrade to the deterministic fallback.
 *
 * Spend is computed from the provider's reported token usage (which we trust).
 * `isUnderCap()` is a soft pre-check (it does NOT pre-debit); actual usage is
 * recorded via `recordUsage()` once the provider returns.
 */
import { config } from "../config.js";
import { getDb } from "../core/db.js";

function dayKey(now) {
  // Passed in by callers that can supply a clock; `new Date()` is disallowed in
  // some contexts, but here we accept an injected time for testability.
  return (now instanceof Date ? now : new Date()).toISOString().slice(0, 10);
}

function readRow(key) {
  const row = getDb().prepare("SELECT spend_eur, call_count FROM ai_quota WHERE day_key = ?").get(key);
  return row || { spend_eur: 0, call_count: 0 };
}

export function getSnapshot(now) {
  const key = dayKey(now);
  const row = readRow(key);
  return {
    dayKey: key,
    spendEur: row.spend_eur,
    callCount: row.call_count,
    capEur: config.aiDailyEurCap,
    remainingEur: Math.max(0, config.aiDailyEurCap - row.spend_eur),
  };
}

export function isUnderCap(now) {
  return readRow(dayKey(now)).spend_eur < config.aiDailyEurCap;
}

export function estimateCost({ inputTokens = 0, outputTokens = 0 } = {}) {
  const inEur = (Number(inputTokens) || 0) * (config.aiPricePerMillionInputEur / 1_000_000);
  const outEur = (Number(outputTokens) || 0) * (config.aiPricePerMillionOutputEur / 1_000_000);
  return inEur + outEur;
}

export function recordUsage(usage, now) {
  const key = dayKey(now);
  const cost = estimateCost(usage);
  getDb()
    .prepare(
      `INSERT INTO ai_quota (day_key, spend_eur, call_count) VALUES (?, ?, 1)
       ON CONFLICT(day_key) DO UPDATE SET
         spend_eur = spend_eur + excluded.spend_eur,
         call_count = call_count + 1`
    )
    .run(key, cost);
  return { cost, snapshot: getSnapshot(now) };
}

/** Test-only: clear all recorded spend. */
export function __resetQuotaForTests() {
  getDb().prepare("DELETE FROM ai_quota").run();
}
