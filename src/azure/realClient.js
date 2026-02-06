import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { getCurrentToken } from "./tokenStore.js";

const armEndpoint = "https://management.azure.com";

// Resolve .env path once (project root)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envFilePath = resolve(__dirname, "../../.env");

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

/**
 * Read the latest AZURE_ACCESS_TOKEN directly from .env on every call.
 * This allows updating .env without restarting the server (handy for POC/dev).
 * Falls back to process.env if .env cannot be read.
 */
function readTokenFromEnvFile() {
  try {
    const content = readFileSync(envFilePath, "utf8");
    const match = content.match(/^AZURE_ACCESS_TOKEN\s*=\s*(.+)$/m);
    if (match) return match[1].trim();
  } catch { /* .env not found or unreadable — fall through */ }
  return null;
}

/**
 * Resolve the current access token using this priority:
 * 1. Request-scoped token from OAuth (via AsyncLocalStorage)
 * 2. AZURE_ACCESS_TOKEN from .env file
 * 3. AZURE_ACCESS_TOKEN from process.env
 *
 * Also validates JWT expiry when possible.
 */
function getAccessToken() {
  // 1. OAuth token (set by server middleware via AsyncLocalStorage)
  const oauthToken = getCurrentToken();
  if (oauthToken) return oauthToken;

  // 2–3. Legacy: read from .env or process.env
  const token = readTokenFromEnvFile() || process.env.AZURE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("No Azure access token available. Sign in via the web UI or set AZURE_ACCESS_TOKEN in .env.");
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
            "Azure access token has expired. Sign in again via the web UI or refresh your token."
          );
        }
      }
    } catch (e) {
      if (e.message.includes("expired") || e.message.includes("Sign in")) {
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

/**
 * Normalize the App Insights ARM proxy response format (PascalCase) to the
 * format expected by the rest of the codebase (camelCase).
 *
 * App Insights returns: { Tables: [{ Columns: [{ ColumnName, DataType }], Rows: [...] }] }
 * We need:              { tables: [{ columns: [{ name, type }], rows: [...] }] }
 */
function normalizeAppInsightsResponse(raw) {
  // If already in the expected format, return as-is (Log Analytics direct)
  if (raw.tables) return raw;

  const tables = (raw.Tables || []).map((t) => ({
    name: t.TableName || t.name || "PrimaryResult",
    columns: (t.Columns || t.columns || []).map((c) => ({
      name: c.ColumnName || c.name,
      type: c.ColumnType || c.DataType || c.type || "string",
    })),
    rows: t.Rows || t.rows || [],
  }));
  return { tables };
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
    async queryWorkspace({ resourceId, workspaceId, kql }) {
      const token = getAccessToken();
      const body = JSON.stringify({ query: kql });
      // Query through the App Insights ARM proxy so the management.azure.com
      // token works and classic table names (pageViews, requests, etc.) are used.
      const queryResourceId = resourceId || workspaceId;
      const url = `${armEndpoint}${queryResourceId}/api/query?api-version=2015-05-01`;
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const raw = await fetchJson(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body,
          });
          return normalizeAppInsightsResponse(raw);
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
