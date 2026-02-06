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

app.get("/auth/login", (req, res) => {
  if (config.azureMode === "mock") {
    const tenant = req.query.tenant || "mock-tenant";
    if (!isValidTenantId(tenant)) {
      return res.status(400).json({ error: "INVALID_TENANT_ID" });
    }
    return res.redirect(`/auth/callback?tenant=${encodeURIComponent(tenant)}&code=mock`);
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
  const cached = tenant.discoveryCache;
  if (cached && Date.now() - cached.cachedAt < config.discoveryCacheMs) {
    return res.json({ resources: cached.resources, cached: true });
  }

  const resources = await azureClient.discoverResources(tenantId);
  updateTenant(tenantId, { discoveryCache: { cachedAt: Date.now(), resources } });
  if (resources.length === 1) {
    updateTenant(tenantId, {
      selectedResource: { ...resources[0], selectedAt: new Date().toISOString() },
    });
    return res.json({ resources, autoSelected: true });
  }
  res.json({ resources, autoSelected: false });
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

if (process.env.NODE_ENV !== "test") {
  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
}

export { app };
