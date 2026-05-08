import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeReadinessScore } from "../src/core/readinessScore.js";

describe("computeReadinessScore", () => {
  it("returns zero score when readinessReport is null", () => {
    const result = computeReadinessScore(null);
    assert.equal(result.score, 0);
    assert.equal(result.grade, "F");
  });

  it("returns full score when all signals are available", () => {
    const report = {
      availableSignals: {
        pageViews: true,
        requests: true,
        sessionId: true,
        userId: true,
        userAgent: true,
        geo: true,
        browserTimings: true,
      },
    };
    const result = computeReadinessScore(report);
    assert.equal(result.score, 100);
    assert.equal(result.percentage, 100);
    assert.equal(result.grade, "A");
    assert.equal(result.breakdown.length, 7);
    assert.ok(result.breakdown.every((b) => b.available));
  });

  it("returns partial score when some signals are missing", () => {
    const report = {
      availableSignals: {
        pageViews: true,
        requests: true,
        sessionId: true,
        userId: false,
        userAgent: false,
        geo: false,
        browserTimings: false,
      },
    };
    const result = computeReadinessScore(report);
    assert.equal(result.score, 50); // 20 + 15 + 15
    assert.equal(result.grade, "D"); // 50% falls in 35-55 range
    const available = result.breakdown.filter((b) => b.available);
    const missing = result.breakdown.filter((b) => !b.available);
    assert.equal(available.length, 3);
    assert.equal(missing.length, 4);
  });

  it("sorts breakdown with available first", () => {
    const report = {
      availableSignals: {
        pageViews: false,
        requests: true,
        sessionId: false,
        userId: false,
        userAgent: true,
        geo: false,
        browserTimings: false,
      },
    };
    const result = computeReadinessScore(report);
    // Available items should come first
    const firstTwo = result.breakdown.slice(0, 2);
    assert.ok(firstTwo.every((b) => b.available));
  });

  it("exposes quickWins: top 3 unavailable signals by points", () => {
    const report = {
      availableSignals: {
        pageViews: true,
        requests: true,
        sessionId: false,
        userId: false,
        userAgent: false,
        geo: false,
        browserTimings: false,
      },
    };
    const result = computeReadinessScore(report);
    assert.ok(Array.isArray(result.quickWins));
    assert.equal(result.quickWins.length, 3);
    // Sorted by points descending; tied at 15 (sessionId, userId, browserTimings)
    assert.ok(result.quickWins[0].points >= result.quickWins[1].points);
    assert.ok(result.quickWins[1].points >= result.quickWins[2].points);
    for (const q of result.quickWins) {
      assert.ok(q.signal);
      assert.ok(q.label);
      assert.ok(Number.isFinite(q.points));
      assert.ok(q.points > 0);
    }
  });

  it("quickWins is empty when score is perfect", () => {
    const report = {
      availableSignals: {
        pageViews: true, requests: true, sessionId: true, userId: true,
        userAgent: true, geo: true, browserTimings: true,
      },
    };
    const result = computeReadinessScore(report);
    assert.deepEqual(result.quickWins, []);
  });

  it("quickWins is empty for null readiness report", () => {
    const result = computeReadinessScore(null);
    assert.deepEqual(result.quickWins, []);
  });
});
