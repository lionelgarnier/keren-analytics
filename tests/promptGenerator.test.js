import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generatePrompts } from "../src/core/promptGenerator.js";

describe("generatePrompts", () => {
  it("returns empty array when readinessReport is null", () => {
    const result = generatePrompts({ readinessReport: null });
    assert.deepEqual(result, []);
  });

  it("returns no prompts when all signals are available", () => {
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
    const result = generatePrompts({ readinessReport: report });
    assert.equal(result.length, 0);
  });

  it("generates prompts for missing signals", () => {
    const report = {
      availableSignals: {
        pageViews: false,
        requests: true,
        sessionId: true,
        userId: false,
        userAgent: true,
        geo: false,
        browserTimings: false,
      },
    };
    const result = generatePrompts({
      readinessReport: report,
      resourceName: "test-app",
    });
    assert.equal(result.length, 4);
    const signals = result.map((r) => r.signal);
    assert.ok(signals.includes("pageViews"));
    assert.ok(signals.includes("userId"));
    assert.ok(signals.includes("geo"));
    assert.ok(signals.includes("browserTimings"));
  });

  it("includes resource name in prompt text", () => {
    const report = {
      availableSignals: {
        pageViews: false,
        requests: true,
        sessionId: true,
        userId: true,
        userAgent: true,
        geo: true,
        browserTimings: true,
      },
    };
    const result = generatePrompts({
      readinessReport: report,
      resourceName: "my-app-insights",
    });
    assert.equal(result.length, 1);
    assert.ok(result[0].prompt.includes("my-app-insights"));
  });

  it("detects generic stack when no schema profile", () => {
    const report = {
      availableSignals: {
        pageViews: false,
        requests: true,
        sessionId: true,
        userId: true,
        userAgent: true,
        geo: true,
        browserTimings: true,
      },
    };
    const result = generatePrompts({ readinessReport: report });
    assert.equal(result[0].detectedStack, "Web Application");
  });
});
