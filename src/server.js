import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import express from "express";
import helmet from "helmet";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { getAzureClient } from "./azure/client.js";
import { runOverviewPipeline } from "./core/orchestrator.js";
import { buildRecommendations } from "./core/recommendations.js";
import { getTenant, updateTenant } from "./core/metadataStore.js";

const app = express();
const azureClient = getAzureClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
      },
    },
  })
);

app.use(express.json({ limit: "1mb" }));

const isProduction = process.env.NODE_ENV === "production";
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);
app.use(express.static(path.resolve(__dirname, "..", "public")));

/**
 * Validate tenant ID to prevent path traversal / injection attacks.
 * Only alphanumeric characters, hyphens, and underscores are allowed.
 */
function isValidTenantId(tenantId) {
  return typeof tenantId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(tenantId);
}

// Resolve .env path once (project root)
const __serverDirname = dirname(fileURLToPath(import.meta.url));
const envFilePath = resolve(__serverDirname, "../.env");

/**
 * Read the latest AZURE_ACCESS_TOKEN directly from .env file.
 * Allows updating .env without restarting the server.
 */
function readTokenFromEnvFile() {
  try {
    const content = readFileSync(envFilePath, "utf8");
    const match = content.match(/^AZURE_ACCESS_TOKEN\s*=\s*(.+)$/m);
    if (match) return match[1].trim();
  } catch { /* .env not found or unreadable */ }
  return null;
}

/**
 * Extract tenant ID from the AZURE_ACCESS_TOKEN JWT (tid claim).
 * Used in real mode POC before full Entra ID OAuth is implemented.
 * Re-reads from .env on every call so token refreshes are picked up live.
 */
function extractTenantFromToken() {
  const token = readTokenFromEnvFile() || process.env.AZURE_ACCESS_TOKEN;
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    return payload.tid || null;
  } catch {
    return null;
  }
}

function ensureAuth(req, res, next) {
  if (!req.session) {
    return res.status(500).json({ error: "SESSION_UNAVAILABLE" });
  }
  if (req.session.tenantId) return next();
  if (config.azureMode === "mock") {
    const tenant = req.query.tenant || "mock-tenant";
    if (!isValidTenantId(tenant)) {
      return res.status(400).json({ error: "INVALID_TENANT_ID" });
    }
    req.session.tenantId = tenant;
    return next();
  }
  // Real mode POC: auto-authenticate using tenant from access token
  if (config.azureMode === "real") {
    const tid = extractTenantFromToken();
    if (tid && isValidTenantId(tid)) {
      req.session.tenantId = tid;
      return next();
    }
  }
  return res.status(401).json({ error: "AUTH_REQUIRED" });
}

/**
 * Determine the appropriate HTTP status code for pipeline errors.
 */
function errorStatusCode(result) {
  if (result.errorCode === "ACCESS_DENIED" || result.errorCode === "FORBIDDEN") return 403;
  if (result.errorCode === "NOT_FOUND") return 404;
  return 500;
}

// DEBUG endpoint — shows token info as read by the server (remove in production)
app.get("/debug/token", (req, res) => {
  const token = readTokenFromEnvFile() || process.env.AZURE_ACCESS_TOKEN;
  if (!token) return res.json({ error: "No token found in .env or process.env" });
  const parts = token.split(".");
  if (parts.length !== 3) return res.json({ error: "Token is not a valid JWT", tokenStart: token.substring(0, 40) });
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    res.json({
      tokenStart: token.substring(0, 40) + "...",
      iat: new Date(payload.iat * 1000).toISOString(),
      exp: new Date(payload.exp * 1000).toISOString(),
      now: new Date().toISOString(),
      expiresInMinutes: Math.round((payload.exp - now) / 60),
      expired: payload.exp <= now + 60,
      tid: payload.tid,
      upn: payload.upn,
      envFilePath,
    });
  } catch (e) {
    res.json({ error: "Failed to decode token", message: e.message, tokenStart: token.substring(0, 40) });
  }
});

app.get("/auth/login", (req, res) => {
  if (config.azureMode === "mock") {
    const tenant = req.query.tenant || "mock-tenant";
    if (!isValidTenantId(tenant)) {
      return res.status(400).json({ error: "INVALID_TENANT_ID" });
    }
    return res.redirect(`/auth/callback?tenant=${encodeURIComponent(tenant)}&code=mock`);
  }
  // Real mode POC: auto-login using tenant from access token
  const tid = extractTenantFromToken();
  if (tid && isValidTenantId(tid)) {
    req.session.tenantId = tid;
    return res.redirect("/");
  }
  return res.status(501).json({ error: "REAL_AUTH_NOT_CONFIGURED" });
});

app.get("/auth/callback", (req, res) => {
  if (config.azureMode === "mock") {
    const tenant = req.query.tenant || "mock-tenant";
    if (!isValidTenantId(tenant)) {
      return res.status(400).json({ error: "INVALID_TENANT_ID" });
    }
    req.session.tenantId = tenant;
    return res.redirect("/");
  }
  // Real mode POC: auto-login using tenant from access token
  const tid = extractTenantFromToken();
  if (tid && isValidTenantId(tid)) {
    req.session.tenantId = tid;
    return res.redirect("/");
  }
  return res.status(501).json({ error: "REAL_AUTH_NOT_CONFIGURED" });
});

app.get("/auth/session", (req, res) => {
  res.json({
    authenticated: Boolean(req.session?.tenantId),
    tenantId: req.session?.tenantId || null,
    mode: config.azureMode,
  });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "LOGOUT_FAILED" });
    }
    res.json({ ok: true });
  });
});

app.get("/azure/discover", ensureAuth, async (req, res) => {
  const tenantId = req.session.tenantId;
  const tenant = getTenant(tenantId);

  // If a resource is already selected, return it alongside the discovery
  const selectedName = tenant.selectedResource?.appInsightsName || null;

  const cached = tenant.discoveryCache;
  if (cached && Date.now() - cached.cachedAt < config.discoveryCacheMs) {
    return res.json({ resources: cached.resources, cached: true, selectedResource: selectedName });
  }

  try {
    const resources = await azureClient.discoverResources(tenantId);
    updateTenant(tenantId, { discoveryCache: { cachedAt: Date.now(), resources } });
    if (resources.length === 1) {
      updateTenant(tenantId, {
        selectedResource: { ...resources[0], selectedAt: new Date().toISOString() },
      });
      return res.json({ resources, autoSelected: true, selectedResource: resources[0].appInsightsName });
    }
    res.json({ resources, autoSelected: false, selectedResource: selectedName });
  } catch (error) {
    console.error("Discovery error:", error.message);
    const azureBody = error.body || error.cause?.body;
    if (azureBody) console.error("Azure API body:", azureBody);
    let azureError;
    if (azureBody) {
      try { azureError = JSON.parse(azureBody).error || azureBody; } catch { azureError = azureBody; }
    }
    const status = error.status || error.cause?.status || 500;
    const isExpired = status === 401 || (typeof azureError?.code === "string" && azureError.code.includes("ExpiredAuth"));
    res.status(status).json({
      error: "DISCOVERY_FAILED",
      message: isExpired
        ? "Azure access token expired. Please refresh it with: az account get-access-token --resource https://management.azure.com --query accessToken -o tsv"
        : error.message,
      azureError,
    });
  }
});

app.post("/azure/select", ensureAuth, (req, res) => {
  const tenantId = req.session.tenantId;
  const { resourceId, workspaceId, subscriptionId, resourceGroup, appInsightsName } = req.body || {};
  if (!resourceId || !workspaceId) {
    return res.status(400).json({ error: "INVALID_SELECTION" });
  }
  updateTenant(tenantId, {
    selectedResource: {
      resourceId,
      workspaceId,
      subscriptionId,
      resourceGroup,
      appInsightsName,
      selectedAt: new Date().toISOString(),
    },
  });
  res.json({ ok: true });
});

app.post("/azure/select/clear", ensureAuth, (req, res) => {
  const tenantId = req.session.tenantId;
  updateTenant(tenantId, { selectedResource: null });
  res.json({ ok: true });
});

app.get("/readiness", ensureAuth, async (req, res) => {
  const tenantId = req.session.tenantId;
  const tenant = getTenant(tenantId);
  if (!tenant.selectedResource) {
    return res.status(409).json({ error: "RESOURCE_NOT_SELECTED" });
  }
  if (tenant.readinessReport) {
    return res.json(tenant.readinessReport);
  }
  const requestedRange = req.query.range || "7d";
  const rangeKey = ["today", "7d", "30d"].includes(requestedRange) ? requestedRange : "7d";
  const result = await runOverviewPipeline({
    tenantId,
    rangeKey,
    azureClient,
    cacheTtlMs: config.cacheTtlMs[rangeKey] || config.cacheTtlMs["7d"],
  });
  if (result.error) {
    return res.status(errorStatusCode(result)).json(result);
  }
  res.json(result.readinessReport);
});

app.get("/dashboard/overview", ensureAuth, async (req, res) => {
  const requestedRange = req.query.range || "7d";
  const rangeKey = ["today", "7d", "30d"].includes(requestedRange) ? requestedRange : "7d";
  const tenantId = req.session.tenantId;
  try {
    const result = await runOverviewPipeline({
      tenantId,
      rangeKey,
      azureClient,
      cacheTtlMs: config.cacheTtlMs[rangeKey] || config.cacheTtlMs["7d"],
    });

    if (result.requiresSelection) {
      return res.status(409).json({ error: "RESOURCE_SELECTION_REQUIRED", resources: result.resources });
    }
    if (result.error) {
      return res.status(errorStatusCode(result)).json(result);
    }
    res.json({
      dashboard: result.dashboard,
      readiness: result.readinessReport,
      schemaProfile: result.schemaProfile,
      mapping: result.mapping,
      recommendations: buildRecommendations(result.readinessReport),
    });
  } catch (error) {
    console.error("Dashboard pipeline error:", error.message);
    // Surface Azure API error details from any level of the error chain
    const azureBody = error.body || error.cause?.body;
    if (azureBody) console.error("Azure API body:", azureBody);
    let azureError;
    if (azureBody) {
      try { azureError = JSON.parse(azureBody).error || azureBody; } catch { azureError = azureBody; }
    }
    res.status(error.status || error.cause?.status || 500).json({
      error: "PIPELINE_ERROR",
      message: error.message,
      azureError,
    });
  }
});

app.get("/recommendations", ensureAuth, (req, res) => {
  const tenantId = req.session.tenantId;
  const tenant = getTenant(tenantId);
  if (!tenant.readinessReport) {
    return res.status(409).json({ error: "READINESS_NOT_CHECKED", message: "Run readiness check first." });
  }
  const recommendations = buildRecommendations(tenant.readinessReport);
  res.json({ recommendations });
});

// Keep server reference and process alive (Express 5 + Node 22 ESM workaround)
let server;
if (process.env.NODE_ENV !== "test") {
  server = app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port} (mode: ${config.azureMode})`);
  });
  // Workaround: Node 22 + Express 5 ESM may let the event loop drain prematurely.
  // A ref'd timer ensures the process stays alive while the server is listening.
  const keepAlive = setInterval(() => {}, 2_147_483_647);
  server.on("close", () => clearInterval(keepAlive));
}

export { app, server };
