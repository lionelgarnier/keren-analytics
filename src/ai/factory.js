/**
 * AI provider factory — Track F3 (ADR 0005).
 *
 * Selects the right provider based on `config.aiProvider`. Tests force
 * "none" via `.env.test` so no LLM is ever hit in CI.
 */
import { config } from "../config.js";
import { assertAiProvider } from "./interface.js";
import { createNoneProvider } from "./noneProvider.js";
import { createAzureFoundryProvider } from "./azureFoundry.js";

let cachedProvider = null;
let cachedKey = null;

function makeProvider(name) {
  switch (name) {
    case "none":
      return createNoneProvider();
    case "azure-foundry":
      return createAzureFoundryProvider({
        endpoint: config.azureFoundryEndpoint,
        deployment: config.azureFoundryDeployment,
        requestTimeoutMs: config.aiRequestTimeoutMs,
      });
    default:
      throw new Error(`Unknown AI_PROVIDER value: "${name}" (expected "none" or "azure-foundry")`);
  }
}

export function getAiProvider() {
  const name = config.aiProvider || "none";
  if (cachedProvider && cachedKey === name) return cachedProvider;
  cachedProvider = assertAiProvider(makeProvider(name), name);
  cachedKey = name;
  return cachedProvider;
}

/** Test-only: drop the cached provider so a different config can take effect. */
export function __resetAiProviderForTests() {
  cachedProvider = null;
  cachedKey = null;
}
