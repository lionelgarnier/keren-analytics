import { config } from "../config.js";

const armEndpoint = "https://management.azure.com";
const logAnalyticsEndpoint = "https://api.loganalytics.io";

async function fetchJson(url, options = {}, timeoutMs = config.queryTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Azure API error: ${response.status}`);
    error.status = response.status;
    error.body = text;
    error.retryAfter = response.headers?.get("Retry-After") || null;
    throw error;
  }
  return response.json();
}

function getAccessToken() {
  const token = process.env.AZURE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("AZURE_ACCESS_TOKEN is required for real Azure mode.");
  }

  // Best-effort validation: if the token looks like a JWT, check its expiry.
  const parts = token.split(".");
  if (parts.length === 3) {
    try {
      const payloadJson = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      const payload = JSON.parse(payloadJson);
      if (typeof payload.exp === "number") {
        const nowInSeconds = Math.floor(Date.now() / 1000);
        const skewSeconds = 60; // treat tokens expiring within 60s as expired
        if (payload.exp <= nowInSeconds + skewSeconds) {
          throw new Error(
            "AZURE_ACCESS_TOKEN has expired or is about to expire. " +
              "Obtain a new access token and update the AZURE_ACCESS_TOKEN environment variable."
          );
        }
      }
    } catch (e) {
      // If parsing fails and it's not our expiry error, fall back to using the token as-is.
      if (e.message.includes("AZURE_ACCESS_TOKEN has expired")) {
        throw e;
      }
    }
  }

  return token;
}

/** Bounded workspace cache with LRU-style eviction */
const workspaceCache = new Map();
const MAX_WORKSPACE_CACHE = config.maxWorkspaceCacheSize || 100;

async function resolveWorkspaceCustomerId(workspaceResourceId) {
  if (workspaceCache.has(workspaceResourceId)) {
    return workspaceCache.get(workspaceResourceId);
  }
  const token = getAccessToken();
  const url = `${armEndpoint}${workspaceResourceId}?api-version=2022-10-01`;
  const data = await fetchJson(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const customerId = data?.properties?.customerId;
  if (!customerId) {
    throw new Error("Workspace customerId not found.");
  }
  // Evict oldest entry if cache is full
  if (workspaceCache.size >= MAX_WORKSPACE_CACHE) {
    const firstKey = workspaceCache.keys().next().value;
    workspaceCache.delete(firstKey);
  }
  workspaceCache.set(workspaceResourceId, customerId);
  return customerId;
}

/**
 * Parse Retry-After header value into milliseconds.
 * Supports both delay-seconds and HTTP-date formats.
 */
function parseRetryAfterMs(retryAfter) {
  if (!retryAfter) return 1000;
  const seconds = Number(retryAfter);
  if (!isNaN(seconds)) return Math.min(seconds * 1000, 30000);
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) return Math.max(date.getTime() - Date.now(), 0);
  return 1000;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRealClient() {
  return {
    async discoverResources() {
      const token = getAccessToken();
      const subs = await fetchJson(`${armEndpoint}/subscriptions?api-version=2020-01-01`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const resources = [];
      for (const sub of subs.value || []) {
        const subId = sub.subscriptionId;
        const aiList = await fetchJson(
          `${armEndpoint}/subscriptions/${subId}/providers/Microsoft.Insights/components?api-version=2020-02-02`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        for (const item of aiList.value || []) {
          const workspaceId = item?.properties?.WorkspaceResourceId;
          if (!workspaceId) continue;
          resources.push({
            resourceId: item.id,
            subscriptionId: subId,
            resourceGroup: item.id.split("/resourceGroups/")[1]?.split("/")[0] || null,
            appInsightsName: item.name,
            workspaceId,
            lastTelemetryAt: item?.properties?.LastModifiedTime || null,
            environmentHint: item?.tags?.environment || null,
          });
        }
      }
      return resources;
    },
    async checkAccess(workspaceResourceId) {
      try {
        await resolveWorkspaceCustomerId(workspaceResourceId);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          reason: error.message || "Unable to access workspace.",
        };
      }
    },
    async queryWorkspace({ workspaceId, kql }) {
      const token = getAccessToken();
      const customerId = await resolveWorkspaceCustomerId(workspaceId);
      const body = JSON.stringify({ query: kql });
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await fetchJson(`${logAnalyticsEndpoint}/v1/workspaces/${customerId}/query`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body,
          });
        } catch (error) {
          lastError = error;
          const retryable = error.status === 429 || error.status === 503;
          if (!retryable || attempt === 1) {
            throw error;
          }
          // Backoff: respect Retry-After header or default delay
          const backoffMs = parseRetryAfterMs(error.retryAfter);
          await delay(backoffMs);
        }
      }
      throw lastError || new Error("Failed to query workspace after retries.");
    },
  };
}
