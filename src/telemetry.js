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
    appInsights.setup(config.telemetry.connectionString).start();
    client = appInsights.defaultClient;
    client.context.tags[client.context.keys.cloudRole] = config.telemetry.serviceName;
    // /healthz is hit by the Container Apps liveness + readiness probes (~8
    // req/min); filter those request items out so they don't drown real
    // traffic in the Technical view or burn the Log Analytics daily quota.
    // (The comment here used to claim this happened, but no processor existed.)
    client.addTelemetryProcessor((envelope) => {
      const baseType = envelope?.data?.baseType;
      const url = envelope?.data?.baseData?.url || "";
      const name = envelope?.data?.baseData?.name || "";
      if (baseType === "RequestData" && (url.includes("/healthz") || name.includes("/healthz"))) {
        return false; // drop
      }
      return true;
    });
    // Fixed-rate sampling (default 100 = no-op). Lower TELEMETRY_SAMPLING_PERCENT
    // to cut ingestion cost during a traffic spike.
    client.config.samplingPercentage = config.telemetry.samplingPercentage;
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

/**
 * Report an exception to App Insights. Best-effort and safe when telemetry is
 * off (no-op). Use for 500s and process-level crash handlers so failures are
 * correlated in the Technical view instead of vanishing into stdout.
 * @param {Error} error
 * @param {Record<string, string|number>} [properties]
 */
export function trackException(error, properties = {}) {
  if (!client) return;
  try {
    const clean = {};
    for (const [k, v] of Object.entries(properties)) {
      if (v === undefined || v === null) continue;
      clean[k] = String(v);
    }
    client.trackException({ exception: error instanceof Error ? error : new Error(String(error)), properties: clean });
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
