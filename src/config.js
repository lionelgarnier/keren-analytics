const sessionSecret = process.env.SESSION_SECRET || "dev-secret-change-me";

if (sessionSecret === "dev-secret-change-me" && process.env.NODE_ENV !== "test") {
  console.warn(
    "WARNING: Using default session secret. Set SESSION_SECRET environment variable for production use."
  );
}

export const config = {
  port: Number(process.env.PORT || 3000),
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
};
