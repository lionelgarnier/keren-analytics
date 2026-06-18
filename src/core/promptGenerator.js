/**
 * Generate LLM-ready prompts for improving telemetry coverage.
 *
 * Each prompt follows a 3-phase approach:
 *   1. Audit — scan the codebase to understand what's already in place
 *   2. Gap analysis — identify what's missing for the specific signal
 *   3. Implementation — make the minimal targeted changes
 *
 * This avoids prescriptive "install and configure" instructions that
 * assume nothing exists, which is almost never the case in real projects.
 */

export const STACK_HINTS = {
  nextjs: { name: "Next.js / App Router", sdk: "@microsoft/applicationinsights-web" },
  sveltekit: { name: "SvelteKit", sdk: "@microsoft/applicationinsights-web" },
  remix: { name: "Remix", sdk: "@microsoft/applicationinsights-web" },
  astro: { name: "Astro", sdk: "@microsoft/applicationinsights-web" },
  react: { name: "React (SPA)", sdk: "@microsoft/applicationinsights-react-js" },
  angular: { name: "Angular (SPA)", sdk: "@microsoft/applicationinsights-web" },
  vue: { name: "Vue.js (SPA)", sdk: "@microsoft/applicationinsights-web" },
  node: { name: "Node.js", sdk: "applicationinsights" },
  dotnet: { name: ".NET / ASP.NET", sdk: "Microsoft.ApplicationInsights" },
  python: { name: "Python", sdk: "opencensus-ext-azure" },
  java: { name: "Java / Spring", sdk: "applicationinsights-agent" },
  generic: { name: "Web Application", sdk: "@microsoft/applicationinsights-web" },
};

/**
 * Try to detect the stack from schema profile custom dimensions.
 */
export function detectStack(schemaProfile) {
  if (!schemaProfile) return "generic";
  const keys = [];
  const customKeys = schemaProfile.customDimensionsKeys || {};
  for (const tableKeys of Object.values(customKeys)) {
    if (Array.isArray(tableKeys)) keys.push(...tableKeys);
  }
  const joined = keys.join(" ").toLowerCase();
  if (joined.includes("next")) return "nextjs";
  if (joined.includes("sveltekit") || joined.includes("svelte")) return "sveltekit";
  if (joined.includes("remix")) return "remix";
  if (joined.includes("astro")) return "astro";
  if (joined.includes("react")) return "react";
  if (joined.includes("angular")) return "angular";
  if (joined.includes("vue") || joined.includes("nuxt")) return "vue";
  if (joined.includes("express") || joined.includes("node")) return "node";
  if (joined.includes("aspnet") || joined.includes("dotnet")) return "dotnet";
  if (joined.includes("django") || joined.includes("flask")) return "python";
  if (joined.includes("spring") || joined.includes("java")) return "java";
  return "generic";
}

export const PROMPT_TEMPLATES = {
  pageViews: (stack, resource) => `My ${stack.name} application is connected to Azure Application Insights (resource: ${resource || "[your-resource-name]"}), but **no pageView telemetry is reaching Application Insights**.

## What I need
Page view events must appear in the Application Insights \`pageViews\` table, with the page URL path and page title.${stack.name.includes("SPA") ? " For a SPA, client-side route changes must be tracked — not just the initial page load." : ""}

## Your approach
1. **Audit** — Search this codebase for any existing Application Insights setup: SDK imports, configuration files, connection strings, \`trackPageView\` calls, or equivalent. Also check package.json / dependencies for \`${stack.sdk}\` or similar packages.
2. **Gap analysis** — Based on what you find, identify the specific reason pageViews are missing. Common causes:
   - SDK installed but pageView auto-tracking is disabled
   - SDK configured but the connection string / instrumentation key is wrong or missing
   - SDK not initialized early enough in the app lifecycle${stack.name.includes("SPA") ? "\n   - Route change tracking not enabled (enableAutoRouteTracking: false or missing)" : ""}
   - SDK not installed at all
3. **Fix** — Make the minimal changes needed to close the gap. If the SDK is already installed, do NOT reinstall or reconfigure from scratch — only adjust what's missing. If nothing exists, then set up the SDK with pageView tracking enabled.

Do NOT send any PII (no email, no full name) in telemetry.`,

  requests: (stack, resource) => `My ${stack.name} application is connected to Azure Application Insights (resource: ${resource || "[your-resource-name]"}), but **no server-side request telemetry is reaching Application Insights**.

## What I need
HTTP requests must appear in the Application Insights \`requests\` table, including method, URL, status code, and duration.

## Your approach
1. **Audit** — Search this codebase for any existing Application Insights server-side setup: SDK imports (e.g. \`${stack.sdk}\`), initialization code, middleware, connection strings. Check package/dependency files.
2. **Gap analysis** — Identify why requests are not being tracked. Common causes:
   - SDK installed but not initialized before the web framework starts listening
   - Auto-collection is disabled in configuration
   - Connection string / instrumentation key is wrong or missing
   - SDK not installed at all
3. **Fix** — Make the minimal changes needed. If the SDK is already present, just adjust the configuration. If it's missing entirely, add server-side telemetry with request auto-collection enabled. Also consider:
   - Dependency tracking for outbound calls (databases, APIs) — enable if not already
   - Adaptive sampling to control costs`,

  userId: (stack, resource) => `My ${stack.name} application is connected to Azure Application Insights (resource: ${resource || "[your-resource-name]"}), but **no authenticated user ID (\`user_AuthenticatedId\`) appears in the telemetry**.

## What I need
After a user logs in, all subsequent telemetry (pageViews, requests, custom events) must carry a pseudonymized user identifier in the \`user_AuthenticatedId\` field.

## Your approach
1. **Audit** — Search this codebase for:
   - How authentication works (auth provider, session management, login flow)
   - Any existing calls to \`setAuthenticatedUserContext()\`, \`context.user\`, or telemetry initializers that set user identity
   - Where the Application Insights SDK is initialized (frontend and/or backend)
2. **Gap analysis** — Identify why the user ID is missing. Common causes:
   - Authentication exists but nobody wired it to Application Insights
   - \`setAuthenticatedUserContext()\` is called with the wrong arguments or at the wrong time
   - User ID is set on frontend but not propagated to backend, or vice versa
3. **Fix** — Wire the authenticated user ID to Application Insights at the right point in the auth flow. Use a hashed or pseudonymized ID — never raw email or PII. Show changes for both frontend and backend if both exist.`,

  userIdDegraded: (stack, resource) => `My ${stack.name} application is connected to Azure Application Insights (resource: ${resource || "[your-resource-name]"}). Users **do authenticate**, but the \`user_AuthenticatedId\` field is nearly empty — less than 10 % of telemetry carries it. As a result, unique-visitor counts fall back to anonymous IDs (\`user_Id\`) and are **significantly over-estimated**.

## What I need
After a user logs in, every subsequent telemetry item (pageViews, requests, custom events) must carry a stable, pseudonymized identifier in \`user_AuthenticatedId\`.

## Your approach
1. **Audit** — Search this codebase for:
   - How authentication works (auth provider, session/token management, login flow)
   - Where the Application Insights SDK is initialized — both frontend and backend
   - Any existing calls to \`setAuthenticatedUserContext()\` or telemetry initializers that set \`user_AuthenticatedId\`
   - Whether the user ID is available in a cookie, JWT claim, or server-side session after login
2. **Gap analysis** — The SDK is collecting data, but the authenticated user ID is missing from almost all events. Common causes:
   - \`setAuthenticatedUserContext()\` is never called after login
   - It is called, but at the wrong time (before the auth token is available, or only on one page)
   - The frontend sets it, but the backend SDK doesn't receive or propagate it
   - The value passed is empty, null, or changes across sessions for the same user
3. **Fix** — Wire the authenticated user ID at the earliest reliable point after login:
   - **Frontend (JS SDK):** call \`appInsights.setAuthenticatedUserContext(hashedUserId)\` once the user session is established. Use a hashed or opaque ID — never raw email or PII.
   - **Backend (.NET / Node / Java / Python):** set \`TelemetryContext.User.AuthenticatedUserId\` (or equivalent) via a telemetry initializer or middleware that reads the auth session.
   - Ensure the same stable ID is used on both sides so frontend and backend telemetry can be correlated.

Do NOT send any PII (no email, no full name) in telemetry.`,

  sessionId: (stack, resource) => `My ${stack.name} application is connected to Azure Application Insights (resource: ${resource || "[your-resource-name]"}), but **no \`session_Id\` appears in the telemetry**.

## What I need
Every telemetry item must carry a \`session_Id\` that groups user activity into sessions (default 30-minute timeout is fine).

## Your approach
1. **Audit** — Search this codebase for the Application Insights SDK configuration. Check whether session tracking is explicitly disabled, or if a custom session mechanism overrides the default behavior.
2. **Gap analysis** — Session IDs are normally auto-generated by the JavaScript SDK. Common reasons they're missing:
   - SDK is configured with \`disableSessionTracking: true\` or equivalent
   - A custom telemetry initializer strips the session ID
   - The SDK is only server-side with no frontend component (server SDK doesn't auto-generate sessions)
   - Cookie consent blocking prevents the session cookie from being set
3. **Fix** — Make the minimal adjustment to restore session tracking. This is usually a configuration flag, not new code.`,

  userAgent: (stack, resource) => `My ${stack.name} application is connected to Azure Application Insights (resource: ${resource || "[your-resource-name]"}), but **device and browser information (\`client_Browser\`, \`client_OS\`) is missing from the telemetry**.

## What I need
Telemetry must include the user's browser name, OS, and device type — populated automatically from the user-agent header.

## Your approach
1. **Audit** — Search this codebase for the Application Insights JavaScript SDK setup. Check if it's loaded on all pages and whether any configuration disables user-agent collection.
2. **Gap analysis** — This data is normally auto-collected by the JS SDK. Common reasons it's missing:
   - No frontend JavaScript SDK (only server-side tracking)
   - SDK loaded but user-agent parsing is disabled
   - A telemetry initializer or proxy strips these fields
3. **Fix** — If the JS SDK is already present, verify the configuration. If there's no frontend SDK, add the minimal JavaScript snippet to collect client-side context. This is typically a small configuration change, not a major implementation.`,

  geo: (stack, resource) => `My ${stack.name} application is connected to Azure Application Insights (resource: ${resource || "[your-resource-name]"}), but **no geographic information (country, city) appears in the telemetry**.

## What I need
Telemetry must include geo-location data so we can analyze usage by region.

## Your approach
1. **Audit** — Check how the application is deployed:
   - Is it behind a reverse proxy, CDN, or load balancer?
   - Is the Application Insights SDK sending telemetry directly from the client browser, or only from the server?
   - Check the Azure Portal: is geo-enrichment enabled on the Application Insights resource?
2. **Gap analysis** — Geo-enrichment is done server-side by Azure based on the client IP. Common reasons it fails:
   - A reverse proxy or load balancer replaces the client IP with its own, and \`X-Forwarded-For\` is not configured
   - All telemetry is server-side only, and the server's IP (not the user's) gets geo-resolved
   - IP collection is explicitly disabled in the SDK configuration
3. **Fix** — The fix depends on the root cause:
   - If behind a proxy: ensure \`X-Forwarded-For\` is forwarded
   - If no frontend SDK: add client-side telemetry or forward the real client IP
   - If IP collection is disabled: re-enable it (note: Application Insights can use IP for geo without storing it)`,

  browserTimings: (stack, resource) => `My ${stack.name} application is connected to Azure Application Insights (resource: ${resource || "[your-resource-name]"}), but **no browser timing / page load performance data appears in the telemetry**.

## What I need
The Application Insights \`browserTimings\` table must receive page load performance metrics: network time, DOM processing time, and ideally Web Vitals (LCP, FID, CLS).

## Your approach
1. **Audit** — Search this codebase for the Application Insights JavaScript SDK. Check the configuration for performance-related settings: \`enableAutoRouteTracking\`, \`enableAjaxPerfTracking\`, \`maxAjaxCallsPerView\`, and any custom performance tracking.
2. **Gap analysis** — Browser timings require the JS SDK on the frontend. Common reasons they're missing:
   - No frontend JavaScript SDK (server-side only)
   - JS SDK present but auto-tracking of performance is disabled
   - SDK initialized too late (after page load events have already fired)
   - Sampling is too aggressive, filtering out performance data
3. **Fix** — If the JS SDK is present, enable browser timing collection in the configuration. If no frontend SDK exists, add the minimal setup with performance tracking enabled. Consider:
   - \`enableAutoRouteTracking: true\` for SPA navigation timing
   - \`enableAjaxPerfTracking: true\` for XHR/fetch performance
   - Reasonable sampling to control costs without losing performance visibility`,
};

/**
 * Generate prompts for all missing signals.
 * @param {object} readinessReport
 * @param {object} schemaProfile
 * @param {string} [resourceName]
 * @returns {object[]} Array of prompt objects
 */
export function generatePrompts({ readinessReport, schemaProfile, resourceName }) {
  if (!readinessReport) return [];

  const signals = readinessReport.availableSignals || {};
  const stackKey = detectStack(schemaProfile);
  const stack = STACK_HINTS[stackKey];
  const prompts = [];

  for (const [signal, available] of Object.entries(signals)) {
    if (!available && PROMPT_TEMPLATES[signal]) {
      prompts.push({
        signal,
        label: signalLabel(signal),
        prompt: PROMPT_TEMPLATES[signal](stack, resourceName),
        detectedStack: stack.name,
      });
    }
  }

  return prompts;
}

export function signalLabel(signal) {
  const labels = {
    pageViews: "Page View Tracking",
    requests: "Backend Request Tracking",
    userId: "User Identity",
    userIdDegraded: "User Identity (degraded)",
    sessionId: "Session Tracking",
    userAgent: "Device & Browser Info",
    geo: "Geo Enrichment",
    browserTimings: "Frontend Performance",
  };
  return labels[signal] || signal;
}
