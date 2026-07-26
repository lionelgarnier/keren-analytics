import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../config.js";
import { getCurrentToken } from "./tokenStore.js";

const armEndpoint = "https://management.azure.com";

// Build an ARM URL from a caller-supplied resource path and re-assert that the
// resolved origin is still management.azure.com. A resource id like
// "@evil.tld/x" would otherwise make the WHATWG URL parser treat the endpoint
// host as userinfo and send the delegated Bearer token to the attacker host
// (SSRF + token exfiltration). Server-side format validation already rejects
// such ids, but this is the last line of defence at the point of use.
function armUrl(resourcePath, query = "") {
  const url = new URL(`${resourcePath}${query}`, armEndpoint);
  if (url.origin !== armEndpoint) {
    throw new AzureApiError("Refusing to call a non-ARM host.", {
      status: 400,
      code: "INVALID_RESOURCE_ID",
      actionable: "The selected resource id is malformed. Re-select the resource.",
    });
  }
  return url.toString();
}

// Resolve .env path once (project root)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envFilePath = resolve(__dirname, "../../../.env");

/* ========== HTTP helpers ========== */

/**
 * Categorized Azure API error for actionable user messages.
 */
class AzureApiError extends Error {
  constructor(message, { status, code, retryAfter, body, actionable } = {}) {
    super(message);
    this.name = "AzureApiError";
    this.status = status || 500;
    this.code = code || "UNKNOWN";
    this.retryAfter = retryAfter || null;
    this.body = body || null;
    this.actionable = actionable || null;
  }
}

async function fetchJson(url, options = {}, timeoutMs = config.queryTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new AzureApiError("Azure API request timed out. The query may be too complex or the workspace is under load.", {
        status: 408,
        code: "TIMEOUT",
        actionable: "Try again in a few seconds, or select a shorter time range.",
      });
    }
    throw new AzureApiError(`Network error connecting to Azure: ${err.message}`, {
      status: 0,
      code: "NETWORK_ERROR",
      actionable: "Check your network connection and try again.",
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    let parsedBody = null;
    try { parsedBody = JSON.parse(text); } catch {}

    const azureCode = parsedBody?.error?.code || "";
    const azureMessage = parsedBody?.error?.message || text?.substring(0, 200) || "";

    // Categorize the error for actionable UI messages
    const errorInfo = categorizeAzureError(response.status, azureCode, azureMessage);

    throw new AzureApiError(errorInfo.message, {
      status: response.status,
      code: errorInfo.code,
      retryAfter: response.headers?.get("Retry-After") || null,
      body: text,
      actionable: errorInfo.actionable,
    });
  }
  return response.json();
}

/**
 * Categorize Azure API errors into actionable messages.
 */
function categorizeAzureError(status, azureCode, azureMessage) {
  // Authentication errors
  if (status === 401 || azureCode === "ExpiredAuthenticationToken" || azureCode === "InvalidAuthenticationToken") {
    return {
      code: "AUTH_EXPIRED",
      message: "Your Azure session has expired.",
      actionable: "Sign out and sign in again to refresh your credentials.",
    };
  }

  // Authorization / RBAC errors
  if (status === 403 || azureCode === "AuthorizationFailed" || azureCode === "Authorization_RequestDenied") {
    return {
      code: "RBAC_DENIED",
      message: "You don't have permission to access this resource.",
      actionable: "Ask your Azure admin to grant you 'Reader' on the subscription and 'Log Analytics Reader' on the workspace.",
    };
  }

  // Not found (deleted resource, wrong ID)
  if (status === 404 || azureCode === "ResourceNotFound" || azureCode === "ResourceGroupNotFound") {
    return {
      code: "NOT_FOUND",
      message: "The Azure resource was not found. It may have been deleted or moved.",
      actionable: "Go back and re-discover your resources.",
    };
  }

  // Throttling
  if (status === 429) {
    return {
      code: "THROTTLED",
      message: "Azure API rate limit reached.",
      actionable: "Wait a moment and try again. If this persists, reduce query frequency.",
    };
  }

  // Service unavailable
  if (status === 503 || status === 502 || status === 504) {
    return {
      code: "SERVICE_UNAVAILABLE",
      message: "Azure service is temporarily unavailable.",
      actionable: "This is usually temporary. Try again in 30 seconds.",
    };
  }

  // Query-specific errors
  if (azureCode === "BadArgumentError" || azureCode === "SemanticError") {
    return {
      code: "QUERY_ERROR",
      message: `Query error: ${azureMessage.substring(0, 150)}`,
      actionable: "This may indicate a schema mismatch. Try re-discovering your resources.",
    };
  }

  // Workspace-specific: no data
  if (azureMessage.includes("does not have any data") || azureMessage.includes("has no data")) {
    return {
      code: "NO_DATA",
      message: "The workspace has no telemetry data in the selected time range.",
      actionable: "Check that your application is sending telemetry to Application Insights, then try a longer time range (30 days).",
    };
  }

  // Generic fallback
  return {
    code: "AZURE_ERROR",
    message: `Azure API error (${status}): ${azureMessage.substring(0, 150) || "Unknown error"}`,
    actionable: "Check your Azure configuration and try again.",
  };
}

/* ========== Token management ========== */

/**
 * Read the latest AZURE_ACCESS_TOKEN directly from .env on every call.
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
 */
function getAccessToken() {
  // 1. OAuth token (set by server middleware via AsyncLocalStorage)
  const oauthToken = getCurrentToken();
  if (oauthToken) return oauthToken;

  // 2–3. Legacy: read from .env or process.env
  const token = readTokenFromEnvFile() || process.env.AZURE_ACCESS_TOKEN;
  if (!token) {
    throw new AzureApiError(
      "No Azure access token available.",
      {
        status: 401,
        code: "NO_TOKEN",
        actionable: "Sign in via the web UI, or set AZURE_ACCESS_TOKEN in .env for CLI usage.",
      }
    );
  }

  // Best-effort JWT expiry validation
  const parts = token.split(".");
  if (parts.length === 3) {
    try {
      const payloadJson = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      const payload = JSON.parse(payloadJson);
      if (typeof payload.exp === "number") {
        const nowInSeconds = Math.floor(Date.now() / 1000);
        const skewSeconds = 60;
        if (payload.exp <= nowInSeconds + skewSeconds) {
          throw new AzureApiError(
            "Your Azure access token has expired.",
            {
              status: 401,
              code: "TOKEN_EXPIRED",
              actionable: "Sign in again via the web UI, or refresh your token with: az account get-access-token",
            }
          );
        }
      }
    } catch (e) {
      if (e instanceof AzureApiError) throw e;
      // Malformed JWT — let it pass, Azure will reject it with a proper error
    }
  }

  return token;
}

/* ========== Workspace cache ========== */

const workspaceCache = new Map();
const MAX_WORKSPACE_CACHE = config.maxWorkspaceCacheSize || 100;

async function resolveWorkspaceCustomerId(workspaceResourceId) {
  if (workspaceCache.has(workspaceResourceId)) {
    return workspaceCache.get(workspaceResourceId);
  }
  const token = getAccessToken();
  const url = armUrl(workspaceResourceId, "?api-version=2022-10-01");
  const data = await fetchJson(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const customerId = data?.properties?.customerId;
  if (!customerId) {
    throw new AzureApiError(
      "Unable to resolve workspace. The workspace may not be properly configured.",
      {
        status: 400,
        code: "WORKSPACE_INVALID",
        actionable: "Ensure the App Insights resource is workspace-based (not classic). Check the workspace in Azure Portal.",
      }
    );
  }
  // Evict oldest entry if cache is full
  if (workspaceCache.size >= MAX_WORKSPACE_CACHE) {
    const firstKey = workspaceCache.keys().next().value;
    workspaceCache.delete(firstKey);
  }
  workspaceCache.set(workspaceResourceId, customerId);
  return customerId;
}

/* ========== Retry helpers ========== */

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

/* ========== Response normalization ========== */

/**
 * Normalize the App Insights ARM proxy response format (PascalCase) to the
 * format expected by the rest of the codebase (camelCase).
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

/**
 * Validate that a query result has the expected structure.
 * Returns an empty-but-valid result if the response is malformed.
 */
function validateQueryResult(result, queryName) {
  if (!result || !result.tables || !Array.isArray(result.tables)) {
    console.warn(`Query '${queryName}' returned unexpected format, using empty result`);
    return { tables: [{ name: "PrimaryResult", columns: [], rows: [] }] };
  }
  if (result.tables.length === 0) {
    return { tables: [{ name: "PrimaryResult", columns: [], rows: [] }] };
  }
  return result;
}

/* ========== Client ========== */

export function createRealClient() {
  return {
    async discoverResources() {
      const token = getAccessToken();
      let subs;
      try {
        subs = await fetchJson(`${armEndpoint}/subscriptions?api-version=2020-01-01`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        if (error.code === "AUTH_EXPIRED" || error.code === "TOKEN_EXPIRED") throw error;
        throw new AzureApiError(
          `Unable to list subscriptions: ${error.message}`,
          { status: error.status, code: error.code || "DISCOVERY_ERROR", actionable: error.actionable || "Check your Azure credentials." }
        );
      }

      const subscriptions = subs.value || [];
      if (subscriptions.length === 0) {
        throw new AzureApiError(
          "No Azure subscriptions found for this account.",
          {
            status: 404,
            code: "NO_SUBSCRIPTIONS",
            actionable: "Ensure your account has access to at least one Azure subscription with Application Insights resources.",
          }
        );
      }

      const resources = [];
      const errors = [];

      for (const sub of subscriptions) {
        const subId = sub.subscriptionId;
        try {
          const aiList = await fetchJson(
            `${armEndpoint}/subscriptions/${subId}/providers/Microsoft.Insights/components?api-version=2020-02-02`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          for (const item of aiList.value || []) {
            const workspaceId = item?.properties?.WorkspaceResourceId;
            if (!workspaceId) {
              // Classic (non-workspace-based) App Insights — skip with note
              errors.push({
                resource: item.name,
                reason: "Classic App Insights (not workspace-based). Migrate to workspace-based for Keren Analytics support.",
              });
              continue;
            }
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
        } catch (error) {
          // Skip individual subscription errors (RBAC), continue with others
          if (error.code === "RBAC_DENIED") {
            errors.push({
              subscription: subId,
              reason: `No read access to subscription ${subId}. Ask your admin for Reader role.`,
            });
            continue;
          }
          // Re-throw auth errors
          if (error.code === "AUTH_EXPIRED" || error.code === "TOKEN_EXPIRED") throw error;
          errors.push({ subscription: subId, reason: error.message });
        }
      }

      // Attach discovery warnings (non-fatal) to the result
      if (resources.length === 0 && errors.length > 0) {
        throw new AzureApiError(
          "No accessible Application Insights resources found.",
          {
            status: 404,
            code: "NO_RESOURCES",
            actionable: "Ensure you have workspace-based Application Insights resources and Reader access to the subscription.",
          }
        );
      }

      // Attach warnings as metadata (will be ignored by existing callers but useful for UI)
      resources._warnings = errors.length > 0 ? errors : undefined;
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
          code: error.code,
          actionable: error.actionable,
        };
      }
    },

    async queryWorkspace({ resourceId, workspaceId, kql, queryName }) {
      const token = getAccessToken();
      const body = JSON.stringify({ query: kql });
      const queryResourceId = resourceId || workspaceId;
      const url = armUrl(queryResourceId, "/api/query?api-version=2015-05-01");

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
          const normalized = normalizeAppInsightsResponse(raw);
          return validateQueryResult(normalized, queryName);
        } catch (error) {
          lastError = error;
          const retryable = error.code === "THROTTLED" || error.code === "SERVICE_UNAVAILABLE";
          if (!retryable || attempt === 1) {
            // Don't fail the whole pipeline for individual query errors
            // unless it's an auth/permission issue
            if (error.code === "AUTH_EXPIRED" || error.code === "TOKEN_EXPIRED" || error.code === "RBAC_DENIED") {
              throw error;
            }
            // For query-level errors, log and return empty result
            console.error(`Query '${queryName}' failed (attempt ${attempt + 1}):`, error.message);
            if (error.code === "NO_DATA" || error.code === "QUERY_ERROR") {
              return { tables: [{ name: "PrimaryResult", columns: [], rows: [] }] };
            }
            throw error;
          }
          // Backoff: respect Retry-After header or default delay
          const backoffMs = parseRetryAfterMs(error.retryAfter);
          await delay(backoffMs);
        }
      }
      throw lastError || new AzureApiError("Failed to query workspace after retries.", { code: "RETRY_EXHAUSTED" });
    },
  };
}

export { AzureApiError };
