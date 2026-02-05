import express from "express";
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

app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(express.static(path.resolve(__dirname, "..", "public")));

function ensureAuth(req, res, next) {
  if (req.session.tenantId) return next();
  if (config.azureMode === "mock") {
    req.session.tenantId = req.query.tenant || "mock-tenant";
    return next();
  }
  return res.status(401).json({ error: "AUTH_REQUIRED" });
}

app.get("/auth/login", (req, res) => {
  if (config.azureMode === "mock") {
    const tenant = req.query.tenant || "mock-tenant";
    return res.redirect(`/auth/callback?tenant=${encodeURIComponent(tenant)}&code=mock`);
  }
  return res.status(501).json({ error: "REAL_AUTH_NOT_CONFIGURED" });
});

app.get("/auth/callback", (req, res) => {
  if (config.azureMode === "mock") {
    const tenant = req.query.tenant || "mock-tenant";
    req.session.tenantId = tenant;
    return res.redirect("/");
  }
  return res.status(501).json({ error: "REAL_AUTH_NOT_CONFIGURED" });
});

app.get("/auth/session", (req, res) => {
  res.json({
    authenticated: Boolean(req.session.tenantId),
    tenantId: req.session.tenantId || null,
    mode: config.azureMode,
  });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
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
    return res.status(403).json(result);
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
    return res.status(403).json(result);
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
  const recommendations = buildRecommendations(tenant.readinessReport);
  res.json({ recommendations });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
}

export { app };
