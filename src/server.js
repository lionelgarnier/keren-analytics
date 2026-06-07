import "dotenv/config";
// Imported before Express so the App Insights Node SDK can patch the http
// stack before any server module loads. See src/telemetry.js.
import { trackEvent, flushTelemetry } from "./telemetry.js";
import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { getAzureClient } from "./providers/factory.js";
import { createMockClient } from "./providers/azure/mockClient.js";
import { runOverviewPipeline, runSetupScan } from "./core/orchestrator.js";
import { buildRecommendations } from "./core/recommendations.js";
import { computeReadinessScore } from "./core/readinessScore.js";
import { generatePrompts } from "./core/promptGenerator.js";
import { getTenant, updateTenant, setResourceAiOptOut, getResourceAiOptOut } from "./core/metadataStore.js";
import { buildAiDisclosure } from "./ai/disclosure.js";
import { getLatestScan, getScannedResourceIds } from "./core/scanStore.js";
import { getLatestMapping } from "./core/mappingStore.js";
import {
  persistValidation,
  getActiveValidation,
  getConfiguredResourceIds,
} from "./core/validationStore.js";
import { runWithToken } from "./providers/azure/tokenStore.js";
import { createRateLimiter } from "./core/rateLimit.js";
import { startBackupScheduler, restoreLatestSnapshot } from "./core/backupScheduler.js";
import { createAzureFoundryProvider } from "./ai/azureFoundry.js";
import { buildTelemetryContract, renderContractMarkdown } from "./core/telemetryContract.js";

const app = express();
const azureClient = getAzureClient();
const previewClient = createMockClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ========== OAuth constants ========== */
const ENTRA_AUTHORITY = "https://login.microsoftonline.com";
const OAUTH_SCOPES = "https://management.azure.com/.default offline_access openid profile";
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

/** True when the app has an Entra ID client ID configured for OAuth */
const oauthConfigured = Boolean(config.azureClientId);

/* ========== Reverse proxy trust (Render, Railway, Heroku, etc.) ========== */
const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  app.set("trust proxy", 1);
}

/* ========== Security headers ========== */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // js.monitor.azure.com: App Insights browser SDK (self-telemetry,
        // stage B). The /telemetry.js bootstrap injects this CDN script.
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://js.monitor.azure.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org"],
        // *.in.applicationinsights / *.livediagnostics: App Insights ingestion
        // + Live Metrics endpoints the browser SDK posts telemetry to.
        connectSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
          "https://js.monitor.azure.com",
          "https://*.in.applicationinsights.azure.com",
          "https://*.livediagnostics.monitor.azure.com",
        ],
      },
    },
  })
);

app.use(express.json({ limit: "1mb" }));

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
/*
 * Static asset caching. No bundler → filenames aren't content-hashed, so
 * we can't blanket-cache everything as immutable: a deploy must be able to
 * push fresh JS/CSS/HTML. We split by type:
 *   - HTML (SPA shell + marketing pages): no-cache so a deploy lands at
 *     once; the ETag still yields cheap 304s.
 *   - Stable media/fonts: cache hard (7d). These are the bulk of an
 *     anonymous landing-page hit (demo.gif, og-image, demo-*.webp), so a
 *     traffic spike — e.g. an HN front-page post — serves them from the
 *     browser cache and never touches the single replica a second time.
 *   - JS/CSS: short max-age + revalidate so a deploy isn't masked by a
 *     stale bundle while still saving most re-fetches.
 */
/* ========== Public telemetry contract (ADR 0006) ==========
 * Served dynamically from src/core/telemetryContract.js so the live spec is
 * always derived from the current scorer/mapping/prompts — the committed
 * snapshots under public/ are just a discoverable copy. Registered before
 * express.static so the dynamic handler is authoritative, and before the rate
 * limiters since these are public, cacheable discovery endpoints with no
 * tenant data. */
app.get("/.well-known/telemetry-contract.json", (_req, res) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.json(buildTelemetryContract());
});
app.get("/llms.txt", (_req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(renderContractMarkdown());
});

const MEDIA_EXTENSIONS = new Set([
  ".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2",
]);
app.use(
  express.static(path.resolve(__dirname, "..", "public"), {
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".html") {
        res.setHeader("Cache-Control", "no-cache");
      } else if (MEDIA_EXTENSIONS.has(ext)) {
        res.setHeader("Cache-Control", "public, max-age=604800");
      } else if (ext === ".js" || ext === ".css") {
        res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
      }
    },
  })
);

/* ========== Rate limiting ==========
 *
 * Static assets are served above and short-circuit before the limiters,
 * so only dynamic / API routes count against the per-IP buckets. Auth
 * endpoints get a stricter limit on top of the general cap so an attacker
 * burning the OAuth flow can't also DoS the dashboard. Disabled in test
 * mode — see tests/rateLimit.test.js for direct unit coverage.
 */
const skipInTests = (mw) => (req, res, next) =>
  process.env.NODE_ENV === "test" ? next() : mw(req, res, next);

const apiLimiter = skipInTests(
  createRateLimiter({
    name: "api",
    windowMs: 60_000,
    max: 60,
    message: "API rate limit reached (60 requests per minute per IP).",
  })
);
const authLimiter = skipInTests(
  createRateLimiter({
    name: "auth",
    windowMs: 60_000,
    max: 20,
    message: "Too many authentication attempts (20 per minute per IP).",
  })
);

app.use("/auth", authLimiter);
app.use(apiLimiter);

/* ========== Helpers ========== */

function isValidTenantId(tenantId) {
  return typeof tenantId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(tenantId);
}

// Stable, non-reversible id for telemetry. We want to count distinct tenants
// in the funnel without ever sending a raw tenant GUID or PII to App Insights.
function hashForTelemetry(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
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

function ensureCsrfToken(req) {
  if (!req.session) return null;
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  return req.session.csrfToken;
}

function verifyCsrf(req, res, next) {
  if (process.env.NODE_ENV === "test") return next();
  const expected = req.session?.csrfToken;
  const provided = req.get("X-CSRF-Token");
  if (!expected || !provided || provided !== expected) {
    return res.status(403).json({ error: "CSRF_MISMATCH" });
  }
  return next();
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
  if (req.session.tenantId) {
    ensureCsrfToken(req);
    return next();
  }

  // Mock mode: auto-set tenant
  if (config.azureMode === "mock") {
    const tenant = req.query.tenant || "mock-tenant";
    if (!isValidTenantId(tenant)) {
      return res.status(400).json({ error: "INVALID_TENANT_ID" });
    }
    req.session.tenantId = tenant;
    ensureCsrfToken(req);
    return next();
  }

  // Real mode with OAuth token in session
  if (req.session.azureAccessToken) {
    const payload = decodeJwtPayload(req.session.azureAccessToken);
    const tid = payload?.tid;
    if (tid && isValidTenantId(tid)) {
      req.session.tenantId = tid;
      ensureCsrfToken(req);
      return next();
    }
  }

  return res.status(401).json({ error: "AUTH_REQUIRED" });
}

function errorStatusCode(result) {
  if (result.errorCode === "ACCESS_DENIED" || result.errorCode === "FORBIDDEN") return 403;
  if (result.errorCode === "NOT_FOUND") return 404;
  // Resource not configured yet — the client redirects to the setup wizard.
  if (result.error === "SETUP_REQUIRED") return 409;
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
    ensureCsrfToken(req);

    trackEvent("tenant_connected", { tenant: hashForTelemetry(req.session.tenantId) });
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
    csrfToken: ensureCsrfToken(req),
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
          "2. Name: 'Keren Analytics' (or any name)",
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

app.post("/auth/logout", verifyCsrf, (req, res) => {
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

app.post("/azure/select", ensureAuth, verifyCsrf, (req, res) => {
  const tenantId = req.session.tenantId;
  const { resourceId, workspaceId, subscriptionId, resourceGroup, appInsightsName } = req.body || {};
  if (!resourceId || !workspaceId) {
    return res.status(400).json({ error: "INVALID_SELECTION" });
  }
  const prev = getTenant(tenantId).selectedResource;
  const changed = !prev || prev.resourceId !== resourceId;
  updateTenant(tenantId, {
    selectedResource: {
      resourceId,
      workspaceId,
      subscriptionId,
      resourceGroup,
      appInsightsName,
      selectedAt: new Date().toISOString(),
    },
    ...(changed ? { readinessReport: null, schemaProfile: null, mapping: null } : {}),
  });
  res.json({ ok: true });
});

app.post("/azure/select/clear", ensureAuth, verifyCsrf, (req, res) => {
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
    azureMode: config.azureMode,
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
  const streamParam = req.query?.stream;
  const acceptHeader = req.headers.accept || "";
  const wantStream =
    streamParam === "1" ||
    streamParam === 1 ||
    streamParam === true ||
    streamParam === "true" ||
    acceptHeader.includes("application/x-ndjson");
  res.set("Cache-Control", "no-store");
  res.vary("Accept");
  console.log(
    `[overview] tenant=${tenantId} range=${rangeKey} stream=${wantStream} streamParam=${String(streamParam)} accept=${acceptHeader} query=${JSON.stringify(req.query)}`
  );

  if (wantStream) {
    res.set({ "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    let closed = false;
    req.on("close", () => { closed = true; console.log("[stream] client disconnected"); });

    function send(obj) {
      if (closed) return;
      const line = JSON.stringify(obj) + "\n";
      console.log("[stream] send:", obj.type, obj.label || "");
      res.write(line);
    }

    try {
      const result = await runOverviewPipeline({
        tenantId, rangeKey, azureClient,
        cacheTtlMs: config.cacheTtlMs[rangeKey] || config.cacheTtlMs["7d"],
        azureMode: config.azureMode,
        onProgress(label, pct) { send({ type: "progress", label, pct: Math.round(pct * 100) }); },
        onCard(name, data) { send({ type: "card", name, data }); },
      });
      console.log("[stream] pipeline done, requiresSelection:", !!result.requiresSelection, "error:", !!result.error);
      if (result.requiresSelection) {
        send({ type: "error", error: "RESOURCE_SELECTION_REQUIRED", resources: result.resources });
      } else if (result.error) {
        send({ type: "error", ...result });
      } else {
        const readinessScore = computeReadinessScore(result.readinessReport);
        trackEvent("dashboard_rendered", { tenant: hashForTelemetry(tenantId), range: rangeKey, score: readinessScore?.score, streamed: true });
        send({ type: "done", dashboard: result.dashboard, readiness: result.readinessReport, readinessScore, schemaProfile: result.schemaProfile, mapping: result.mapping, recommendations: buildRecommendations(result.readinessReport) });
      }
    } catch (error) {
      console.error("[stream] pipeline error:", error.message, error.stack);
      send({ type: "error", error: "PIPELINE_ERROR", message: error.message });
    }
    console.log("[stream] ending response, closed:", closed);
    if (!closed) res.end();
    return;
  }

  try {
    const result = await runOverviewPipeline({
      tenantId,
      rangeKey,
      azureClient,
      cacheTtlMs: config.cacheTtlMs[rangeKey] || config.cacheTtlMs["7d"],
      azureMode: config.azureMode,
    });

    if (result.requiresSelection) {
      return res.status(409).json({ error: "RESOURCE_SELECTION_REQUIRED", resources: result.resources });
    }
    if (result.error) {
      return res.status(errorStatusCode(result)).json(result);
    }
    const readinessScore = computeReadinessScore(result.readinessReport);
    trackEvent("dashboard_rendered", { tenant: hashForTelemetry(tenantId), range: rangeKey, score: readinessScore?.score });
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
  res.set("Cache-Control", "no-store");
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
  res.set("Cache-Control", "no-store");
  res.json({ prompts });
});

/* ========== Setup wizard (Track F4 — ADR 0005) ========== */

// Static page that hosts the 4-step wizard SPA.
app.get("/setup", (_req, res) => {
  res.sendFile(path.resolve(__dirname, "..", "public", "setup.html"));
});

/**
 * Discover the tenant's App Insights resources, honouring the discovery
 * cache. Shared by /api/setup/services so the hub sees the same list as
 * /azure/discover without double-billing the ARM API.
 */
async function loadResourcesCached(tenantId) {
  const tenant = getTenant(tenantId);
  const cached = tenant.discoveryCache;
  if (cached && Date.now() - cached.cachedAt < config.discoveryCacheMs) {
    return cached.resources;
  }
  const resources = await azureClient.discoverResources(tenantId);
  updateTenant(tenantId, { discoveryCache: { cachedAt: Date.now(), resources } });
  return resources;
}

/**
 * Setup hub data source: the tenant's resources, each tagged with its
 * per-resource configuration status. Drives the post-login service
 * picker — replaces the tenant-global needsSetup redirect.
 *   - ready        : a validation exists for this resource
 *   - incomplete   : scanned but never validated (wizard abandoned)
 *   - unconfigured : neither
 */
app.get("/api/setup/services", ensureAuth, async (req, res) => {
  const tenantId = req.session.tenantId;
  try {
    const resources = await loadResourcesCached(tenantId);
    const tenant = getTenant(tenantId);
    const configured = new Set(getConfiguredResourceIds(tenantId));
    const scanned = new Set(getScannedResourceIds(tenantId));
    const services = resources.map((r) => {
      let status = "unconfigured";
      if (configured.has(r.resourceId)) status = "ready";
      else if (scanned.has(r.resourceId)) status = "incomplete";
      return { ...r, status };
    });
    res.set("Cache-Control", "no-store");
    res.json({
      services,
      autoSelected: resources.length === 1,
      selectedResourceId: tenant.selectedResource?.resourceId || null,
    });
  } catch (error) {
    console.error("Setup services error:", error.message);
    const status = error.status || error.cause?.status || 500;
    const isExpired = status === 401;
    res.status(status).json({
      error: "DISCOVERY_FAILED",
      message: isExpired
        ? "Azure access token expired. Please sign in again."
        : error.message,
    });
  }
});

// State check for one resource: tells the wizard whether setup is still
// needed for the currently-selected resource.
app.get("/api/setup/state", ensureAuth, (req, res) => {
  const tenantId = req.session.tenantId;
  const tenant = getTenant(tenantId);
  const resourceId = tenant.selectedResource?.resourceId || null;
  const validation = resourceId ? getActiveValidation(tenantId, resourceId) : null;
  const scan = resourceId ? getLatestScan(tenantId, resourceId) : null;
  const mapping = resourceId ? getLatestMapping(tenantId, resourceId) : null;
  res.set("Cache-Control", "no-store");
  res.json({
    needsSetup: !validation,
    hasScan: !!scan,
    hasMapping: !!mapping,
    selectedResource: tenant.selectedResource || null,
    latestScanId: scan?.id || null,
    latestMappingId: mapping?.id || null,
    validation: validation
      ? { id: validation.id, decision: validation.decision, validatedAt: validation.validatedAt }
      : null,
  });
});

// Per-resource "configure with / without AI" choice, set from the Services
// hub split-button before the scan runs. `optOut: true` means the next scan
// for this resource skips the LLM entirely (deterministic mapping only, zero
// outbound). Scoped by resourceId — never tenant-global (see CLAUDE.md
// invariant: setup state is per-resource).
app.post("/api/setup/ai-preference", ensureAuth, verifyCsrf, (req, res) => {
  const tenantId = req.session.tenantId;
  const { resourceId, optOut } = req.body || {};
  if (typeof resourceId !== "string" || !resourceId) {
    return res.status(400).json({ error: "MISSING_RESOURCE_ID", message: "resourceId is required" });
  }
  if (typeof optOut !== "boolean") {
    return res.status(400).json({ error: "INVALID_OPT_OUT", message: "optOut must be a boolean" });
  }
  setResourceAiOptOut(tenantId, resourceId, optOut);
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, resourceId, optOut });
});

// Trigger the CONFIG phase: a fresh scan + AI analysis for the selected
// resource. This is the only entry point that re-runs the scan/LLM —
// dashboard loads reuse its snapshot and never re-config.
app.post("/api/setup/scan", ensureAuth, verifyCsrf, async (req, res) => {
  const tenantId = req.session.tenantId;
  try {
    const result = await runSetupScan({ tenantId, azureClient });
    if (result.requiresSelection) {
      return res.status(409).json({ error: "RESOURCE_SELECTION_REQUIRED", resources: result.resources });
    }
    if (result.error === "NO_ACCESS") {
      return res.status(403).json({ error: "NO_ACCESS", message: result.message });
    }
    res.set("Cache-Control", "no-store");
    trackEvent("setup_scan_completed", {
      tenant: hashForTelemetry(tenantId),
      overallStatus: result.readinessReport?.overallStatus,
    });
    res.json({
      ok: true,
      scanId: result.scanId || null,
      mappingId: result.mappingId || null,
      readiness: result.readinessReport
        ? {
            overallStatus: result.readinessReport.overallStatus,
            availableSignals: result.readinessReport.availableSignals,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ error: "SCAN_FAILED", message: error.message });
  }
});

// Streaming variant of /api/setup/scan: same CONFIG phase, but the
// wizard gets a Server-Sent Event per stage so it can render real
// numbers as they land instead of a fake ticker. Plain POST /scan above
// is kept as a non-streaming fallback (and is what the API tests use).
//
// Event protocol:
//   event: step  data: { step, payload }   — one per pipeline stage
//   event: done  data: { ok, scanId, mappingId }
//   event: fail  data: { error, message }  — app-level failure
// The client closes the EventSource on done/fail; "fail" is named (not
// "error") so it can't collide with EventSource's native error event.
app.get("/api/setup/scan/stream", ensureAuth, async (req, res) => {
  const tenantId = req.session.tenantId;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let closed = false;
  req.on("close", () => { closed = true; });

  const send = (event, data) => {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Keep idle-timeout proxies from dropping the connection while the
  // (potentially slow) AI call runs between the scan and "ai" events.
  const heartbeat = setInterval(() => {
    if (!closed) res.write(": keep-alive\n\n");
  }, 15000);

  try {
    const result = await runSetupScan({
      tenantId,
      azureClient,
      onStep: (step, payload) => send("step", { step, payload }),
    });
    if (result.requiresSelection) {
      send("fail", { error: "RESOURCE_SELECTION_REQUIRED" });
    } else if (result.error === "NO_ACCESS") {
      send("fail", { error: "NO_ACCESS", message: result.message });
    } else {
      trackEvent("setup_scan_completed", {
        tenant: hashForTelemetry(tenantId),
        overallStatus: result.readinessReport?.overallStatus,
        streamed: true,
      });
      send("done", {
        ok: true,
        scanId: result.scanId || null,
        mappingId: result.mappingId || null,
      });
    }
  } catch (error) {
    send("fail", { error: "SCAN_FAILED", message: error.message });
  } finally {
    clearInterval(heartbeat);
    if (!closed) res.end();
  }
});

const CANONICAL_FIELDS = [
  "canonicalUserId",
  "canonicalSessionId",
  "canonicalPagePath",
  "canonicalReferrer",
];

function confidenceFromMatchType(matchType) {
  if (matchType === "builtin") return "high";
  if (matchType === "user-override") return "high";
  if (matchType === "alias" || matchType === "pattern") return "medium";
  return "low";
}

/**
 * Assemble a per-canonical "effective mapping" the wizard can render
 * uniformly, whether the AI produced proposals (Track F3) or only the
 * deterministic mapping is available (Track F4 degraded path).
 *
 * Priority per field: AI proposal (if non-degraded) > deterministic
 * mapping field > null (no proposal at all).
 */
function buildEffectiveMapping(deterministicMapping, aiMapping) {
  const aiProposals = aiMapping?.degraded ? [] : (aiMapping?.proposals?.mapping_proposals || []);
  const byCanonical = Object.fromEntries(aiProposals.map((p) => [p.canonical, p]));
  return CANONICAL_FIELDS.map((field) => {
    const ai = byCanonical[field];
    if (ai) {
      return {
        canonical: field,
        source: ai.source,
        expr: ai.expr,
        origin: "ai",
        confidence: ai.confidence,
        reasoning: ai.reasoning,
      };
    }
    const det = deterministicMapping?.[field];
    if (det && det.expr) {
      return {
        canonical: field,
        source: det.source,
        expr: det.expr,
        origin: "deterministic",
        confidence: confidenceFromMatchType(det.matchType),
        reasoning: `Resolved via ${det.matchType} from the schema profile.`,
      };
    }
    return { canonical: field, source: null, expr: null, origin: null, confidence: "low", reasoning: "No source found in the scan." };
  });
}

// Returns scan + AI mapping for the wizard's "AI findings" + "Validate" steps.
app.get("/api/setup/findings", ensureAuth, (req, res) => {
  const tenantId = req.session.tenantId;
  const tenant = getTenant(tenantId);
  const resourceId = tenant.selectedResource?.resourceId || null;
  if (!resourceId) {
    return res.status(409).json({
      error: "RESOURCE_NOT_SELECTED",
      message: "Select a resource before loading findings.",
    });
  }
  const scan = getLatestScan(tenantId, resourceId);
  const mapping = getLatestMapping(tenantId, resourceId);
  const validation = getActiveValidation(tenantId, resourceId);
  if (!scan) {
    return res.status(409).json({
      error: "NO_SCAN",
      message: "Run /api/setup/scan first to produce a scan.",
    });
  }
  const effectiveMapping = buildEffectiveMapping(tenant.mapping, mapping);
  res.set("Cache-Control", "no-store");
  res.json({
    selectedResource: tenant.selectedResource || null,
    scan: { id: scan.id, scannedAt: scan.scannedAt, ...scan.payload },
    mapping: mapping
      ? {
          id: mapping.id,
          source: mapping.source,
          degraded: mapping.degraded,
          createdAt: mapping.createdAt,
          proposals: mapping.proposals,
        }
      : null,
    effectiveMapping,
    validation: validation || null,
  });
});

const ALLOWED_OVERRIDE_FIELDS = new Set([
  "canonicalUserId", "canonicalSessionId", "canonicalPagePath", "canonicalReferrer",
]);
const VALID_DECISIONS = new Set(["accept_all", "override", "reject"]);

// Persist the user's accept/override/reject decision. Subsequent dashboard
// loads will apply the override via mergeWithValidation in the orchestrator.
app.post("/api/setup/validate", ensureAuth, verifyCsrf, (req, res) => {
  const tenantId = req.session.tenantId;
  const { decision, overrides } = req.body || {};
  // Validate the request body (400) before checking tenant state (409).
  if (!VALID_DECISIONS.has(decision)) {
    return res.status(400).json({ error: "INVALID_DECISION", message: "decision must be accept_all|override|reject" });
  }
  const resourceId = getTenant(tenantId).selectedResource?.resourceId || null;
  if (!resourceId) {
    return res.status(409).json({
      error: "RESOURCE_NOT_SELECTED",
      message: "Select a resource before validating.",
    });
  }
  let cleanedOverrides = null;
  if (decision === "override") {
    if (!overrides || typeof overrides !== "object") {
      return res.status(400).json({ error: "MISSING_OVERRIDES", message: "decision=override requires overrides object" });
    }
    cleanedOverrides = {};
    for (const [field, value] of Object.entries(overrides)) {
      if (!ALLOWED_OVERRIDE_FIELDS.has(field)) continue;
      if (!value || typeof value.expr !== "string" || typeof value.source !== "string") continue;
      // Light KQL safety: forbid newlines/semicolons/pipe so user input can't
      // smuggle a multi-statement KQL through the renderer's whitelist later.
      if (/[;|\r\n]/.test(value.expr)) {
        return res.status(400).json({ error: "INVALID_OVERRIDE_EXPR", field });
      }
      cleanedOverrides[field] = { source: value.source.slice(0, 200), expr: value.expr.slice(0, 500) };
    }
    if (Object.keys(cleanedOverrides).length === 0) {
      return res.status(400).json({ error: "MISSING_OVERRIDES", message: "no valid override fields provided" });
    }
  }
  const mapping = getLatestMapping(tenantId, resourceId);
  // accept_all: snapshot the effective mapping (AI proposals + deterministic
  // fallback) into `overrides`. Without this, the dashboard pipeline would
  // re-derive the deterministic mapping on every load and silently discard
  // AI-only proposals (see mergeWithValidation chain).
  if (decision === "accept_all") {
    const tenant = getTenant(tenantId);
    const effective = buildEffectiveMapping(tenant.mapping, mapping);
    const snapshot = {};
    for (const row of effective) {
      if (!ALLOWED_OVERRIDE_FIELDS.has(row.canonical)) continue;
      if (!row.source || !row.expr) continue;
      snapshot[row.canonical] = { source: row.source, expr: row.expr };
    }
    cleanedOverrides = Object.keys(snapshot).length > 0 ? snapshot : null;
  }
  const persisted = persistValidation(tenantId, resourceId, {
    mappingId: mapping?.id || null,
    decision,
    overrides: cleanedOverrides,
  });
  trackEvent("validation_accepted", { tenant: hashForTelemetry(tenantId), decision });
  res.json({ ok: true, validation: persisted });
});

/* ========== Preview mode (no auth required) ========== */

/**
 * Preview has no setup wizard, so the demo tenant owns its config: run
 * the CONFIG phase once when no snapshot exists yet, then RENDER. Real
 * tenants always configure through the wizard (/api/setup/scan).
 */
async function runPreviewPipeline(rangeKey, onProgress, onCard) {
  const opts = {
    tenantId: "preview-tenant",
    rangeKey,
    azureClient: previewClient,
    cacheTtlMs: config.cacheTtlMs[rangeKey] || config.cacheTtlMs["7d"],
    azureMode: "mock",
    onProgress,
    onCard,
  };
  let result = await runOverviewPipeline(opts);
  if (result.error === "SETUP_REQUIRED") {
    await runSetupScan({ tenantId: "preview-tenant", azureClient: previewClient });
    result = await runOverviewPipeline(opts);
  }
  return result;
}

app.get("/preview/dashboard", async (req, res) => {
  const requestedRange = req.query.range || "7d";
  const rangeKey = ["today", "7d", "30d"].includes(requestedRange) ? requestedRange : "7d";
  const streamParam = req.query?.stream;
  const acceptHeader = req.headers.accept || "";
  const wantStream =
    streamParam === "1" ||
    streamParam === 1 ||
    streamParam === true ||
    streamParam === "true" ||
    acceptHeader.includes("application/x-ndjson");
  res.set("Cache-Control", "no-store");
  res.vary("Accept");
  console.log(
    `[preview] range=${rangeKey} stream=${wantStream} streamParam=${String(streamParam)} accept=${acceptHeader} query=${JSON.stringify(req.query)}`
  );

  if (wantStream) {
    res.set({ "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    let closed = false;
    req.on("close", () => { closed = true; });
    function send(obj) { if (!closed) res.write(JSON.stringify(obj) + "\n"); }

    try {
      const result = await runPreviewPipeline(
        rangeKey,
        (label, pct) => { send({ type: "progress", label, pct: Math.round(pct * 100) }); },
        (name, data) => { send({ type: "card", name, data }); }
      );
      if (result.error) {
        send({ type: "error", ...result });
      } else {
        const readinessScore = computeReadinessScore(result.readinessReport);
        send({ type: "done", dashboard: result.dashboard, readiness: result.readinessReport, readinessScore, preview: true });
      }
    } catch (error) {
      send({ type: "error", error: "PREVIEW_ERROR", message: error.message });
    }
    if (!closed) res.end();
    return;
  }

  try {
    const result = await runPreviewPipeline(rangeKey);
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

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, mode: config.azureMode, aiProvider: config.aiProvider });
});

// What the AI does with telemetry, derived from config — drives the Services
// hub "Configure" menu (which providers are offered) and its inline data
// popover (what's sent / never sent, and where). Per-resource opt-out state
// is attached when ?resourceId= is supplied so the hub can reflect a prior
// choice. No secrets in the payload — it's a config read.
app.get("/api/ai/disclosure", ensureAuth, (req, res) => {
  const tenantId = req.session.tenantId;
  const disclosure = buildAiDisclosure(config);
  const resourceId = typeof req.query.resourceId === "string" ? req.query.resourceId : null;
  res.set("Cache-Control", "no-store");
  res.json({
    ...disclosure,
    optOut: resourceId ? getResourceAiOptOut(tenantId, resourceId) : false,
  });
});

app.get("/api/ai/ping", async (_req, res) => {
  if (config.aiProvider !== "azure-foundry") {
    return res.json({
      ok: true,
      provider: config.aiProvider,
      configured: config.aiProvider === "none",
      message: "AI provider is disabled or deterministic-only.",
    });
  }

  if (!config.azureFoundryEndpoint || !config.azureFoundryDeployment) {
    return res.status(503).json({
      ok: false,
      provider: "azure-foundry",
      configured: false,
      message: "AZURE_FOUNDRY_ENDPOINT or AZURE_FOUNDRY_DEPLOYMENT is missing.",
    });
  }

  try {
    const provider = createAzureFoundryProvider({
      endpoint: config.azureFoundryEndpoint,
      deployment: config.azureFoundryDeployment,
      requestTimeoutMs: 8000,
    });
    const probe = await provider.generate({
      task: "mappingAnalysis",
      systemPrompt: "Respond with strict JSON only.",
      userPrompt: "Health check ping.",
      schemaName: "ping",
      schema: {
        type: "object",
        properties: { pong: { type: "boolean" } },
        required: ["pong"],
        additionalProperties: false,
      },
    });
    if (!probe?.output?.pong) {
      return res.status(503).json({
        ok: false,
        provider: "azure-foundry",
        configured: true,
        message: "Foundry probe returned an unexpected payload.",
      });
    }
    return res.json({ ok: true, provider: "azure-foundry", configured: true });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      provider: "azure-foundry",
      configured: true,
      message: error.message,
    });
  }
});

app.get("/privacy", (_req, res) => {
  res.sendFile(path.resolve(__dirname, "..", "public", "privacy.html"));
});

/* ========== Self-telemetry: browser bootstrap (stage B) ========== */
// Served as JS from 'self' (CSP-friendly, no inline script) and rendered
// per-request so the connection string is injected server-side and the
// authenticated-user id is a *hashed* tenant id — never the raw tenant GUID
// or any PII (privacy invariant). The browser SDK feeds pageViews/sessions/
// geo/browserTimings, which power the Marketing + Readiness views when a
// Keren dashboard is pointed at Keren's own App Insights resource.
app.get("/telemetry.js", (req, res) => {
  res.set("Content-Type", "application/javascript; charset=utf-8");
  res.set("Cache-Control", "no-store");
  if (!config.telemetry.enabled || !config.telemetry.browserConnectionString) {
    return res.send("/* keren self-telemetry disabled */\n");
  }
  const cs = JSON.stringify(config.telemetry.browserConnectionString);
  const tenantId = req.session?.tenantId;
  const authUser = tenantId ? JSON.stringify(hashForTelemetry(tenantId)) : "null";
  res.send(
    `(function () {
  var cs = ${cs};
  var authUser = ${authUser};
  var s = document.createElement("script");
  s.src = "https://js.monitor.azure.com/scripts/b/ai.3.gbl.min.js";
  s.crossOrigin = "anonymous";
  s.onload = function () {
    try {
      var ai = new Microsoft.ApplicationInsights.ApplicationInsights({
        config: {
          connectionString: cs,
          enableAutoRouteTracking: true,
          autoTrackPageVisitTime: true,
          disableFetchTracking: false
        }
      });
      ai.loadAppInsights();
      if (authUser) { ai.setAuthenticatedUserContext(authUser); }
      ai.trackPageView();
      window.appInsights = ai;
    } catch (e) { /* telemetry is best-effort */ }
  };
  document.head.appendChild(s);
})();
`
  );
});

/* ========== SPA catch-all (History API routing) ========== */
const API_ROUTE = /^\/(auth|azure|dashboard|readiness|recommendations|prompts|docs|api|setup)(\/|$)/;
app.get("/{*splat}", (req, res, next) => {
  if (API_ROUTE.test(req.path) || req.path.startsWith("/preview/")) return next();
  res.sendFile(path.resolve(__dirname, "..", "public", "index.html"));
});

/* ========== Server ========== */
let server;
let backupScheduler;
if (process.env.NODE_ENV !== "test") {
  // Restore the latest Blob snapshot before opening the DB. The Container
  // Apps filesystem is ephemeral, so without this every redeploy starts
  // from an empty DB even though hourly backups exist. Awaited before
  // listen() so it completes ahead of the first request (and thus the
  // first lazy getDb()); a failure degrades to the previous behaviour
  // (empty local DB) rather than blocking boot.
  (async () => {
    try {
      await restoreLatestSnapshot({ logger: console });
    } catch (err) {
      console.error("[restore] failed — continuing with local DB:", err?.message || err);
    }

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

    // In-process SQLite → Azure Blob backup. No-op when BACKUP_BLOB_ACCOUNT
    // is unset (dev, first deploy before infra is wired).
    backupScheduler = startBackupScheduler();
    server.on("close", () => backupScheduler?.stop?.());

    // Container Apps sends SIGTERM before stopping a replica; take a final
    // snapshot so a graceful redeploy loses nothing (RPO ≈ 0). A 5s guard
    // forces exit if the snapshot or close hangs past the grace window.
    let shuttingDown = false;
    const gracefulShutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[backup] ${signal} received — final snapshot before exit`);
      const forced = setTimeout(() => process.exit(0), 5000);
      forced.unref();
      try {
        await backupScheduler?.runOnce?.();
      } catch (err) {
        console.error("[backup] final snapshot failed:", err?.message || err);
      }
      await flushTelemetry();
      server.close(() => process.exit(0));
    };
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  })();
}

export { app, server };
