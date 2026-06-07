import test from "node:test";
import assert from "node:assert/strict";
import { trackEvent, flushTelemetry, telemetryActive } from "../src/telemetry.js";

// In NODE_ENV=test (forced by .env.test) self-telemetry is hard-disabled:
// the applicationinsights dependency is never dynamically imported and no
// network connection is opened. These tests lock that hermetic contract.

test("telemetry is inactive under NODE_ENV=test", () => {
  assert.equal(telemetryActive(), false);
});

test("trackEvent is a no-op when telemetry is disabled (never throws)", () => {
  assert.doesNotThrow(() => trackEvent("dashboard_rendered", { tenant: "abc", range: "7d" }));
  assert.doesNotThrow(() => trackEvent("tenant_connected"));
});

test("flushTelemetry resolves when telemetry is disabled", async () => {
  await assert.doesNotReject(flushTelemetry());
});
