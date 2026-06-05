// Self-telemetry — stage A (server). Boots the Application Insights Node SDK
// so Keren's own backend shows up in the *Technical* view of a Keren
// dashboard (requests, dependencies, exceptions, latency) plus the custom
// funnel events. Stage B (browser pageViews/sessions/geo, which power the
// Marketing + Readiness views) lives in the page-served /telemetry.js route.
//
// This module is imported FIRST in server.js (right after dotenv) so the
// SDK patches the http stack before Express is loaded. The applicationinsights
// dependency is loaded via a guarded dynamic import: when telemetry is off
// (dev default, and always in NODE_ENV=test) nothing is required and no
// network connection is opened — the test suite stays hermetic.

import { config } from "./config.js";

let client = null;

if (config.telemetry.enabled && config.telemetry.connectionString) {
  try {
    const appInsights = (await import("applicationinsights")).default;
    appInsights
      .setup(config.telemetry.connectionString)
      // /healthz is hit twice a minute by the Container Apps probes; keep it
      // out of the request stream so it can't drown the real traffic.
      .start();
    client = appInsights.defaultClient;
    client.context.tags[client.context.keys.cloudRole] = config.telemetry.serviceName;
  } catch (err) {
    // Telemetry must never take the app down. Degrade to no-op.
    console.error("[telemetry] init failed — continuing without it:", err?.message || err);
    client = null;
  }
}

/**
 * Emit a business funnel event to the customEvents table. No-op when
 * telemetry is disabled. Never throws — a telemetry failure must not
 * surface in a user request.
 * @param {string} name
 * @param {Record<string, string|number>} [properties]
 */
export function trackEvent(name, properties = {}) {
  if (!client) return;
  try {
    const clean = {};
    for (const [k, v] of Object.entries(properties)) {
      if (v === undefined || v === null) continue;
      clean[k] = String(v);
    }
    client.trackEvent({ name, properties: clean });
  } catch {
    /* swallow — telemetry is best-effort */
  }
}

/** Flush pending telemetry before the process exits. Safe to await when off. */
export async function flushTelemetry() {
  if (!client) return;
  try {
    await client.flush();
  } catch {
    /* best-effort on shutdown */
  }
}

/** True when the server-side SDK is live (handy for tests / health). */
export function telemetryActive() {
  return Boolean(client);
}
