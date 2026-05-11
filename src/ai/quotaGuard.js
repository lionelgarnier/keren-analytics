/**
 * In-memory daily quota guard for LLM spend — Track F3 (ADR 0005).
 *
 * Tracks accumulated EUR spend per UTC day. Once `dailyEurCap` is
 * reached, subsequent `tryReserve()` calls return `{ allowed: false }`
 * and the caller must degrade to the deterministic fallback. Spend is
 * computed from the provider's reported token usage (which we trust).
 *
 * Resets at UTC midnight. Single-process — multi-instance deployments
 * would each have their own counter; acceptable while we run a single
 * replica on Container Apps (cf. CLAUDE.md § Known gaps).
 */
import { config } from "../config.js";

let state = {
  dayKey: null,
  spendEur: 0,
  callCount: 0,
};

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function rolloverIfNeeded(now = new Date()) {
  const today = dayKey(now);
  if (state.dayKey !== today) {
    state = { dayKey: today, spendEur: 0, callCount: 0 };
  }
}

export function getSnapshot() {
  rolloverIfNeeded();
  return {
    dayKey: state.dayKey,
    spendEur: state.spendEur,
    callCount: state.callCount,
    capEur: config.aiDailyEurCap,
    remainingEur: Math.max(0, config.aiDailyEurCap - state.spendEur),
  };
}

/**
 * Check whether a call is allowed under today's cap. Does NOT pre-debit
 * — callers must record actual usage via `recordUsage()` once the
 * provider returns. The cap is a soft pre-check + hard post-check.
 */
export function isUnderCap() {
  rolloverIfNeeded();
  return state.spendEur < config.aiDailyEurCap;
}

/**
 * Convert token usage to EUR using the configured per-million prices.
 */
export function estimateCost({ inputTokens = 0, outputTokens = 0 } = {}) {
  const inEur = (Number(inputTokens) || 0) * (config.aiPricePerMillionInputEur / 1_000_000);
  const outEur = (Number(outputTokens) || 0) * (config.aiPricePerMillionOutputEur / 1_000_000);
  return inEur + outEur;
}

export function recordUsage(usage) {
  rolloverIfNeeded();
  const cost = estimateCost(usage);
  state.spendEur += cost;
  state.callCount += 1;
  return { cost, snapshot: getSnapshot() };
}

/** Test-only: force the counter back to zero. */
export function __resetQuotaForTests() {
  state = { dayKey: null, spendEur: 0, callCount: 0 };
}
