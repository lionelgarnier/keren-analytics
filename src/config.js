export const config = {
  port: Number(process.env.PORT || 3000),
  azureMode: process.env.AZURE_MODE || "mock",
  sessionSecret: process.env.SESSION_SECRET || "dev-secret-change-me",
  cacheTtlMs: {
    today: 5 * 60 * 1000,
    "7d": 15 * 60 * 1000,
    "30d": 15 * 60 * 1000,
  },
  discoveryCacheMs: 10 * 60 * 1000,
  queryTimeoutMs: 12 * 1000,
};
