import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { getAzureClient } from "./azure/client.js";
import { runOverviewPipeline } from "./core/orchestrator.js";
import { buildRecommendations } from "./core/recommendations.js";
import { computeReadinessScore } from "./core/readinessScore.js";
import { generatePrompts } from "./core/promptGenerator.js";
import { getTenant, updateTenant } from "./core/metadataStore.js";
import { runWithToken } from "./azure/tokenStore.js";

const app = express();
const azureClient = getAzureClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ========== OAuth constants ========== */
const ENTRA_AUTHORITY = "https://login.microsoftonline.com";
const OAUTH_SCOPES = "https://management.azure.com/.default offline_access openid profile";
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

/** True when the app has an Entra ID client ID configured for OAuth */
const oauthConfigured = Boolean(config.azureClientId);

/* ========== Security headers ========== */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
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

/* ========== Helpers ========== */

function isValidTenantId(tenantId) {
  return typeof tenantId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(tenantId);
}

function decodeJwtPayload(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 - Date.now() < TOKEN_EXPIRY_BUFFER_MS;
}

/* ========== PKCE helpers ========== */

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function generateState() {
  return crypto.randomBytes(16).toString("hex");
}

/* ========== OAuth token exchange ========== */

async function exchangeCodeForTokens(code, codeVerifier) {
  const params = new URLSearchParams({
    client_id: config.azureClientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.azureRedirectUri,
    code_verifier: codeVerifier,
    scope: OAUTH_SCOPES,
  });
  if (config.azureClientSecret) {
    params.set("client_secret", config.azureClientSecret);
  }

  const response = await fetch(
    `${ENTRA_AUTHORITY}/${config.azureTenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${err.error_description || err.error || response.status}`);
  }
  return response.json();
}

async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    client_id: config.azureClientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: OAUTH_SCOPES,
  });
  if (config.azureClientSecret) {
    params.set("client_secret", config.azureClientSecret);
  }

  const response = await fetch(
    `${ENTRA_AUTHORITY}/${config.azureTenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Token refresh failed: ${err.error_description || err.error || response.status}`);
  }
  return response.json();
}

/* ========== Token middleware ========== */

/**
 * For authenticated real-mode requests with an OAuth token in the session,
 * scope the token to the current request via AsyncLocalStorage.
 * Also auto-refreshes the token when it's about to expire.
 */
function azureTokenMiddleware(req, res, next) {
  const token = req.session?.azureAccessToken;
  if (!token) return next();

  // Auto-refresh if expiring soon
  if (isTokenExpiringSoon(token) && req.session.azureRefreshToken) {
    refreshAccessToken(req.session.azureRefreshToken)
      .then((result) => {
        req.session.azureAccessToken = result.access_token;
        if (result.refresh_token) {
          req.session.azureRefreshToken = result.refresh_token;
        }
        runWithToken(result.access_token, () => next());
      })
      .catch((err) => {
        console.error("Token auto-refresh failed:", err.message);
        // Continue with the old token; it may still work or the user will get an error
        runWithToken(token, () => next());
      });
    return;
  }

  runWithToken(token, () => next());
}

app.use(azureTokenMiddleware);

/* ========== Auth middleware ========== */

function ensureAuth(req, res, next) {
  if (!req.session) {
    return res.status(500).json({ error: "SESSION_UNAVAILABLE" });
  }
  if (req.session.tenantId) return next();

  // Mock mode: auto-set tenant
  if (config.azureMode === "mock") {
    const tenant = req.query.tenant || "mock-tenant";
    if (!isValidTenantId(tenant)) {
      return res.status(400).json({ error: "INVALID_TENANT_ID" });
    }
    req.session.tenantId = tenant;
    return next();
  }

  // Real mode with OAuth token in session
  if (req.session.azureAccessToken) {
    const payload = decodeJwtPayload(req.session.azureAccessToken);
    const tid = payload?.tid;
    if (tid && isValidTenantId(tid)) {
      req.session.tenantId = tid;
      return next();
    }
  }

  return res.status(401).json({ error: "AUTH_REQUIRED" });
}

function errorStatusCode(result) {
  if (result.errorCode === "ACCESS_DENIED" || result.errorCode === "FORBIDDEN") return 403;
  if (result.errorCode === "NOT_FOUND") return 404;
  return 500;
}

/* ========== Auth routes ========== */

app.get("/auth/login", (req, res) => {
  // Mock mode: use mock flow
  if (config.azureMode === "mock") {
    const tenant = req.query.tenant || "mock-tenant";
    if (!isValidTenantId(tenant)) {
      return res.status(400).json({ error: "INVALID_TENANT_ID" });
    }
    return res.redirect(`/auth/callback?tenant=${encodeURIComponent(tenant)}&code=mock`);
  }

  // Real mode: require OAuth
  if (!oauthConfigured) {
    return res.status(501).json({
      error: "OAUTH_NOT_CONFIGURED",
      message: "Set AZURE_CLIENT_ID in .env to enable sign-in. See /auth/setup for instructions.",
    });
  }

  // Build PKCE and redirect to Microsoft
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  req.session.oauthState = state;
  req.session.oauthCodeVerifier = codeVerifier;

  const authUrl = new URL(`${ENTRA_AUTHORITY}/${config.azureTenantId}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set("client_id", config.azureClientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", config.azureRedirectUri);
  authUrl.searchParams.set("scope", OAUTH_SCOPES);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  res.redirect(authUrl.toString());
});

app.get("/auth/callback", async (req, res) => {
  // Mock mode
  if (config.azureMode === "mock") {
    const tenant = req.query.tenant || "mock-tenant";
    if (!isValidTenantId(tenant)) {
      return res.status(400).json({ error: "INVALID_TENANT_ID" });
    }
    req.session.tenantId = tenant;
    return res.redirect("/");
  }

  // OAuth callback
  const { code, state, error: oauthError, error_description } = req.query;

  if (oauthError) {
    console.error("OAuth error:", oauthError, error_description);
    return res.redirect(`/?auth_error=${encodeURIComponent(error_description || oauthError)}`);
  }

  if (!code || !state) {
    return res.status(400).json({ error: "INVALID_CALLBACK", message: "Missing code or state." });
  }

  // Validate state
  if (state !== req.session.oauthState) {
    return res.status(400).json({ error: "STATE_MISMATCH", message: "OAuth state mismatch." });
  }

  const codeVerifier = req.session.oauthCodeVerifier;
  if (!codeVerifier) {
    return res.status(400).json({ error: "MISSING_VERIFIER", message: "PKCE code verifier not found in session." });
  }

  // Clean up PKCE state
  delete req.session.oauthState;
  delete req.session.oauthCodeVerifier;

  try {
    const tokens = await exchangeCodeForTokens(code, codeVerifier);

    req.session.azureAccessToken = tokens.access_token;
    if (tokens.refresh_token) {
      req.session.azureRefreshToken = tokens.refresh_token;
    }

    // Extract tenant and user info from token
    const payload = decodeJwtPayload(tokens.access_token);
    if (payload?.tid && isValidTenantId(payload.tid)) {
      req.session.tenantId = payload.tid;
    }
    req.session.userName = payload?.name || null;
    req.session.userUpn = payload?.upn || payload?.preferred_username || null;

    res.redirect("/");
  } catch (err) {
    console.error("Token exchange error:", err.message);
    res.redirect(`/?auth_error=${encodeURIComponent(err.message)}`);
  }
});

app.get("/auth/session", (req, res) => {
  const tokenPayload = req.session?.azureAccessToken
    ? decodeJwtPayload(req.session.azureAccessToken)
    : null;

  res.json({
    authenticated: Boolean(req.session?.tenantId),
    tenantId: req.session?.tenantId || null,
    mode: config.azureMode,
    oauthConfigured,
    user: req.session?.userName
      ? { name: req.session.userName, upn: req.session.userUpn }
      : null,
    tokenExpiry: tokenPayload?.exp
      ? new Date(tokenPayload.exp * 1000).toISOString()
      : null,
  });
});

/** Return setup instructions for OAuth app registration */
app.get("/auth/setup", (req, res) => {
  res.json({
    configured: oauthConfigured,
    instructions: oauthConfigured
      ? "OAuth is configured. Click 'Connect Azure' to sign in."
      : [
          "1. Go to Azure Portal → Entra ID → App registrations → New registration",
          "2. Name: 'Easy Analytics' (or any name)",
          "3. Supported account types: 'Accounts in any organizational directory'",
          `4. Redirect URI (Web): ${config.azureRedirectUri}`,
          "5. Click Register",
          "6. Go to API permissions → Add a permission → APIs my organization uses → 'Azure Service Management'",
          "7. Select Delegated permissions → check 'user_impersonation' → Add permissions",
          "8. Go to Certificates & secrets → New client secret → copy the Value",
          "9. Copy the Application (client) ID from the Overview page",
          "10. Add to .env: AZURE_CLIENT_ID=<client-id> and AZURE_CLIENT_SECRET=<secret-value>",
          "11. Restart the server",
        ],
    currentRedirectUri: config.azureRedirectUri,
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

/* ========== Azure routes ========== */

app.get("/azure/discover", ensureAuth, async (req, res) => {
  const tenantId = req.session.tenantId;
  const tenant = getTenant(tenantId);
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
        ? "Azure access token expired. Please sign in again."
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
    const readinessScore = computeReadinessScore(result.readinessReport);
    res.json({
      dashboard: result.dashboard,
      readiness: result.readinessReport,
      readinessScore,
      schemaProfile: result.schemaProfile,
      mapping: result.mapping,
      recommendations: buildRecommendations(result.readinessReport),
    });
  } catch (error) {
    console.error("Dashboard pipeline error:", error.message);
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
  const readinessScore = computeReadinessScore(tenant.readinessReport);
  res.json({ recommendations, readinessScore });
});

app.get("/prompts", ensureAuth, (req, res) => {
  const tenantId = req.session.tenantId;
  const tenant = getTenant(tenantId);
  if (!tenant.readinessReport) {
    return res.status(409).json({ error: "READINESS_NOT_CHECKED", message: "Run readiness check first." });
  }
  const resourceName = tenant.selectedResource?.appInsightsName || null;
  const prompts = generatePrompts({
    readinessReport: tenant.readinessReport,
    schemaProfile: tenant.schemaProfile,
    resourceName,
  });
  res.json({ prompts });
});

/* ========== Preview mode (no auth required) ========== */

app.get("/preview/dashboard", async (req, res) => {
  const requestedRange = req.query.range || "7d";
  const rangeKey = ["today", "7d", "30d"].includes(requestedRange) ? requestedRange : "7d";
  try {
    const result = await runOverviewPipeline({
      tenantId: "preview-tenant",
      rangeKey,
      azureClient,
      cacheTtlMs: config.cacheTtlMs[rangeKey] || config.cacheTtlMs["7d"],
    });
    if (result.error) {
      return res.status(500).json(result);
    }
    const readinessScore = computeReadinessScore(result.readinessReport);
    res.json({
      dashboard: result.dashboard,
      readiness: result.readinessReport,
      readinessScore,
      preview: true,
    });
  } catch (error) {
    res.status(500).json({ error: "PREVIEW_ERROR", message: error.message });
  }
});

/* ========== Server ========== */
let server;
if (process.env.NODE_ENV !== "test") {
  server = app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port} (mode: ${config.azureMode})`);
    if (config.azureMode === "real") {
      if (oauthConfigured) {
        const secretStatus = config.azureClientSecret ? "secret: yes" : "secret: MISSING";
        console.log(`OAuth configured (client: ${config.azureClientId.substring(0, 8)}..., ${secretStatus})`);
      } else {
        console.log("OAuth not configured — set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in .env for browser sign-in");
      }
    }
  });
  const keepAlive = setInterval(() => {}, 2_147_483_647);
  server.on("close", () => clearInterval(keepAlive));
}

export { app, server };
