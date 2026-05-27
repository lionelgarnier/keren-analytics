/**
 * Cloud provider factory.
 *
 * V1 ships Azure only. The `CLOUD_PROVIDER` env var defaults to "azure" and
 * is the only supported value; future Scaleway / AWS / GCP adapters will
 * register themselves here (see ADR 0004 for the V2 traction gate).
 *
 * `AZURE_MODE` (mock | real) selects the implementation within the Azure
 * provider. Tests force mock via `NODE_ENV=test` (see config.js).
 *
 * Note: KQL templates remain under `kql/` for V1. The `queries/azure/`
 * relocation proposed in `docs/architecture-multicloud.md` is deferred to
 * V2 — moving the current KQL template set would also require updating `core/kql.js` path
 * resolution and `tests/kql.test.js`, which is out of scope for this refacto.
 */
import { config } from "../config.js";
import { createMockClient } from "./azure/mockClient.js";
import { createRealClient } from "./azure/realClient.js";
import { assertProviderClient } from "./interface.js";

const SUPPORTED_PROVIDERS = new Set(["azure"]);

export function getProviderClient() {
  const providerName = process.env.CLOUD_PROVIDER || "azure";
  if (!SUPPORTED_PROVIDERS.has(providerName)) {
    throw new Error(
      `Unsupported CLOUD_PROVIDER "${providerName}". V1 supports: ${[...SUPPORTED_PROVIDERS].join(", ")}.`
    );
  }
  const client = config.azureMode === "real" ? createRealClient() : createMockClient();
  return assertProviderClient(client, providerName);
}

/**
 * Back-compat alias. Existing call sites and tests use `getAzureClient`;
 * keeping the name avoids a churny rename across the codebase. It will be
 * dropped (or kept as a thin wrapper) when a second provider lands.
 */
export const getAzureClient = getProviderClient;
