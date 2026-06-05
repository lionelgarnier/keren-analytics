const PLACEHOLDER_SECRETS = new Set([
  "dev-secret-change-me",
  "change-me-in-production",
]);

const rawSessionSecret = process.env.SESSION_SECRET;
const nodeEnv = process.env.NODE_ENV;
const isPlaceholder = !rawSessionSecret || PLACEHOLDER_SECRETS.has(rawSessionSecret);

if (isPlaceholder && nodeEnv === "production") {
  throw new Error(
    "SESSION_SECRET is required in production (got " +
      (rawSessionSecret ? "a placeholder value" : "no value") +
      "). Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  );
}

const sessionSecret = rawSessionSecret || "dev-secret-change-me";
const port = Number(process.env.PORT || 3000);

if (isPlaceholder && nodeEnv !== "test" && nodeEnv !== "production") {
  console.warn(
    "WARNING: Using default session secret. Set SESSION_SECRET environment variable for production use."
  );
}

export const config = {
  port,
  // Tests always run in mock mode to avoid hitting real Azure APIs
  azureMode: process.env.NODE_ENV === "test" ? "mock" : (process.env.AZURE_MODE || "mock"),
  sessionSecret,
  cacheTtlMs: {
    today: 5 * 60 * 1000,
    "7d": 15 * 60 * 1000,
    "30d": 15 * 60 * 1000,
  },
  discoveryCacheMs: 10 * 60 * 1000,
  queryTimeoutMs: 12 * 1000,
  /** Maximum number of state transitions retained per tenant */
  maxStateTransitions: 200,
  /** Maximum number of workspace cache entries */
  maxWorkspaceCacheSize: 100,

  // --- OAuth (Entra ID) ---
  /** Application (client) ID from the Entra ID app registration */
  azureClientId: process.env.AZURE_CLIENT_ID || "",
  /** Client secret from the Entra ID app registration (Certificates & secrets) */
  azureClientSecret: process.env.AZURE_CLIENT_SECRET || "",
  /** OAuth redirect URI — must match the app registration */
  azureRedirectUri: process.env.AZURE_REDIRECT_URI || `http://localhost:${port}/auth/callback`,
  /** Entra ID tenant: "organizations" (multi-tenant work accounts), "common", or a specific tenant ID */
  azureTenantId: process.env.AZURE_TENANT_ID || "organizations",

  // --- AI provider (ADR 0005, Track F3) ---
  /** Provider selector: "none" disables LLM calls; "azure-foundry" wires the Foundry Responses API. */
  aiProvider:
    process.env.NODE_ENV === "test"
      ? "none"
      : (process.env.AI_PROVIDER || "none"),
  /** Foundry project Responses API endpoint (full URL incl. /openai/v1/responses). */
  azureFoundryEndpoint: process.env.AZURE_FOUNDRY_ENDPOINT || "",
  /** Foundry model deployment name (e.g. "gpt-5.4-mini"). */
  azureFoundryDeployment: process.env.AZURE_FOUNDRY_DEPLOYMENT || "",
  /**
   * Human-readable region the Foundry deployment lives in, surfaced in the
   * setup AI disclosure so the user sees where their (sanitized) metadata
   * goes. The Foundry *project* endpoint hostname doesn't encode the region,
   * so it can't be derived — set AZURE_FOUNDRY_REGION explicitly. Defaults
   * to the canonical hosted deployment (ADR 0004); override when deploying
   * elsewhere.
   */
  azureFoundryRegion: process.env.AZURE_FOUNDRY_REGION || "France Central (UE)",
  /** Per-call request timeout (ms). */
  aiRequestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS || 20000),
  /** Hard daily spend cap in EUR. Beyond this, providers degrade to deterministic fallback. */
  aiDailyEurCap: Number(process.env.AI_DAILY_EUR_CAP || 10),
  /** EUR per million input tokens (gpt-5.4-mini est.) — overridable via env once invoiced for real. */
  aiPricePerMillionInputEur: Number(process.env.AI_PRICE_PER_M_IN_EUR || 0.25),
  /** EUR per million output tokens. */
  aiPricePerMillionOutputEur: Number(process.env.AI_PRICE_PER_M_OUT_EUR || 1.0),
};
