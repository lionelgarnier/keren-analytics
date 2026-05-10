/**
 * Cloud Provider Interface — V1 Azure-only contract.
 *
 * This file documents the surface that every provider adapter must expose.
 * V1 ships a single Azure adapter; the interface is formalised here so that
 * a future Scaleway / AWS / GCP adapter (V2, conditional on traction —
 * see ADR 0004) can be slotted in without touching the orchestration core.
 *
 * Mock parity is part of the contract: `mockClient` and `realClient` MUST
 * expose the same surface so tests can run in mock mode while production
 * uses the real client. See CLAUDE.md § "Key invariants".
 *
 * @typedef {Object} ProviderResource
 * @property {string} provider           - "azure" | "aws" | "gcp" | "scaleway"
 * @property {string} resourceId         - provider-specific fully-qualified id
 * @property {string} name               - human-readable name
 * @property {string} [workspaceId]      - log workspace / project id
 * @property {string} [location]         - region / zone
 * @property {string} [resourceGroup]    - Azure-specific (kept for back-compat)
 * @property {string} [subscriptionId]   - Azure-specific
 *
 * @typedef {Object} ProviderQueryResult
 * @property {Array<{columns: Array<{name: string, type: string}>, rows: Array<Array<unknown>>}>} tables
 *
 * @typedef {Object} ProviderClient
 * @property {() => Promise<ProviderResource[]>} discoverResources
 * @property {(workspaceResourceId: string) => Promise<{ok: boolean, reason?: string}>} checkAccess
 * @property {(params: {resourceId?: string, workspaceId: string, kql: string, queryName?: string, timeRangeKey?: string}) => Promise<ProviderQueryResult>} queryWorkspace
 */

/** Names of the methods every provider client must implement. */
export const PROVIDER_METHODS = Object.freeze([
  "discoverResources",
  "checkAccess",
  "queryWorkspace",
]);

/**
 * Lightweight runtime check: throw if the client is missing a required method.
 * Used by the factory so a misconfigured provider fails loud at startup
 * rather than at the first request.
 *
 * @param {unknown} client
 * @param {string} providerName
 * @returns {ProviderClient}
 */
export function assertProviderClient(client, providerName) {
  if (!client || typeof client !== "object") {
    throw new Error(`Provider "${providerName}" did not return a client object`);
  }
  for (const method of PROVIDER_METHODS) {
    if (typeof client[method] !== "function") {
      throw new Error(
        `Provider "${providerName}" client is missing required method "${method}"`
      );
    }
  }
  return client;
}
