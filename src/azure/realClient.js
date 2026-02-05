import { config } from "../config.js";

const armEndpoint = "https://management.azure.com";
const logAnalyticsEndpoint = "https://api.loganalytics.io";

async function fetchJson(url, options = {}, timeoutMs = config.queryTimeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, { ...options, signal: controller.signal });
  clearTimeout(timeout);
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Azure API error: ${response.status}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }
  return response.json();
}

function getAccessToken() {
  const token = process.env.AZURE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("AZURE_ACCESS_TOKEN is required for real Azure mode.");
  }
  return token;
}

const workspaceCache = new Map();

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
  workspaceCache.set(workspaceResourceId, customerId);
  return customerId;
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
          const retryable = error.status === 429 || error.status === 503;
          if (!retryable || attempt === 1) {
            throw error;
          }
        }
      }
      return null;
    },
  };
}
