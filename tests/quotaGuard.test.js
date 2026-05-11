import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateCost,
  isUnderCap,
  recordUsage,
  getSnapshot,
  __resetQuotaForTests,
} from "../src/ai/quotaGuard.js";
import { config } from "../src/config.js";

test("estimateCost: input + output tokens at configured EUR rates", () => {
  // Defaults from config: 0.25 €/M input, 1.00 €/M output.
  assert.equal(config.aiPricePerMillionInputEur, 0.25);
  assert.equal(config.aiPricePerMillionOutputEur, 1.0);

  const cost = estimateCost({ inputTokens: 1_000_000, outputTokens: 500_000 });
  assert.equal(cost, 0.25 + 0.5);
});

test("isUnderCap is true on a fresh day, false after recording over the cap", () => {
  __resetQuotaForTests();
  assert.equal(isUnderCap(), true);

  // Push spend just past the cap.
  const overshoot = config.aiDailyEurCap + 1;
  // 1M output tokens cost 1 € by default. Need cap+1 € total.
  const tokensNeeded = Math.ceil((overshoot / config.aiPricePerMillionOutputEur) * 1_000_000);
  recordUsage({ inputTokens: 0, outputTokens: tokensNeeded });

  assert.equal(isUnderCap(), false);
  const snap = getSnapshot();
  assert.ok(snap.spendEur > config.aiDailyEurCap);
  assert.equal(snap.callCount, 1);
});

test("recordUsage advances spend incrementally", () => {
  __resetQuotaForTests();
  recordUsage({ inputTokens: 1000, outputTokens: 1000 });
  const a = getSnapshot();
  recordUsage({ inputTokens: 1000, outputTokens: 1000 });
  const b = getSnapshot();
  assert.ok(b.spendEur > a.spendEur);
  assert.equal(b.callCount, a.callCount + 1);
});

test("getSnapshot reports remainingEur = cap - spend (clamped to 0)", () => {
  __resetQuotaForTests();
  const fresh = getSnapshot();
  assert.equal(fresh.remainingEur, config.aiDailyEurCap);

  recordUsage({ inputTokens: 0, outputTokens: 1_000_000 }); // 1 €
  const after = getSnapshot();
  assert.equal(after.remainingEur, config.aiDailyEurCap - 1);
});
