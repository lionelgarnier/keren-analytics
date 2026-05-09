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
};
