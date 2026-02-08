/**
 * Generate LLM-ready prompts for improving telemetry coverage.
 *
 * Each prompt is contextual: it includes the detected stack, the specific
 * missing signal, and produces a copy-paste prompt that works with
 * Cursor, Copilot, ChatGPT, or any code-aware LLM.
 */

const STACK_HINTS = {
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
function detectStack(schemaProfile) {
  if (!schemaProfile) return "generic";
  const keys = [];
  const customKeys = schemaProfile.customDimensionsKeys || {};
  for (const tableKeys of Object.values(customKeys)) {
    if (Array.isArray(tableKeys)) keys.push(...tableKeys);
  }
  const joined = keys.join(" ").toLowerCase();
  if (joined.includes("react") || joined.includes("next")) return "react";
  if (joined.includes("angular")) return "angular";
  if (joined.includes("vue") || joined.includes("nuxt")) return "vue";
  if (joined.includes("express") || joined.includes("node")) return "node";
  if (joined.includes("aspnet") || joined.includes("dotnet")) return "dotnet";
  if (joined.includes("django") || joined.includes("flask")) return "python";
  if (joined.includes("spring") || joined.includes("java")) return "java";
  return "generic";
}

const PROMPT_TEMPLATES = {
  pageViews: (stack, resource) => `I need to add page view tracking to my ${stack.name} application using Azure Application Insights.

Context:
- App Insights resource: ${resource || "[your-resource-name]"}
- Framework: ${stack.name}
- SDK to use: ${stack.sdk}
- Signal missing: pageViews (no page view telemetry detected)

What I need:
1. Install and configure the Application Insights SDK (${stack.sdk})
2. Automatically track every route change / page navigation as a pageView
3. Include the page URL path and page title in each event
4. For SPA: ensure client-side route changes are tracked (not just initial load)
5. Do NOT send any PII (no email, no full name in telemetry)

Generate the complete code with file paths and installation commands.`,

  requests: (stack, resource) => `I need to enable backend request tracking in my ${stack.name} application using Azure Application Insights.

Context:
- App Insights resource: ${resource || "[your-resource-name]"}
- Framework: ${stack.name}
- SDK to use: ${stack.sdk}
- Signal missing: requests (no server-side request telemetry detected)

What I need:
1. Install and configure server-side Application Insights SDK
2. Auto-collect all incoming HTTP requests (method, URL, status, duration)
3. Capture request headers relevant for analytics (user-agent, referer)
4. Enable dependency tracking for outbound calls (databases, APIs)
5. Set up proper sampling to control costs (adaptive sampling recommended)

Generate the complete code with file paths and installation commands.`,

  userId: (stack, resource) => `I need to attach authenticated user identity to Azure Application Insights telemetry in my ${stack.name} application.

Context:
- App Insights resource: ${resource || "[your-resource-name]"}
- Framework: ${stack.name}
- Signal missing: userId (no user_AuthenticatedId detected)

What I need:
1. After user authentication, set the authenticated user ID on the telemetry context
2. Use a hashed or pseudonymized ID (NOT raw email or PII)
3. Ensure the user ID propagates to all subsequent telemetry (pageViews, requests, events)
4. For frontend: set via appInsights.setAuthenticatedUserContext()
5. For backend: set via TelemetryClient context

Generate the complete code. Show both frontend and backend if applicable.`,

  sessionId: (stack, resource) => `I need to ensure session tracking is properly configured in my ${stack.name} application using Azure Application Insights.

Context:
- App Insights resource: ${resource || "[your-resource-name]"}
- Framework: ${stack.name}
- Signal missing: sessionId (no session_Id detected)

What I need:
1. Verify the Application Insights SDK is configured to generate session IDs
2. Ensure session_Id is set on all telemetry items
3. Configure session timeout (default 30 min is fine)
4. If using a custom session mechanism, bridge it to Application Insights

Generate the configuration code needed.`,

  userAgent: (stack, resource) => `I need to ensure device and browser information is captured in my ${stack.name} application using Azure Application Insights.

Context:
- App Insights resource: ${resource || "[your-resource-name]"}
- Framework: ${stack.name}
- Signal missing: client_Browser / client_OS / client_Type

What I need:
1. Verify the JavaScript SDK is loaded on all pages (this auto-captures user agent)
2. Ensure the SDK configuration has enableAutoRouteTracking: true
3. Confirm client_Browser, client_OS, and client_Type fields are populated

This is usually automatic with the JS SDK. Show the minimal config to verify.`,

  geo: (stack, resource) => `I need to enable geographic enrichment in Azure Application Insights for my ${stack.name} application.

Context:
- App Insights resource: ${resource || "[your-resource-name]"}
- Signal missing: geo data (no geographic information detected)

What I need:
1. Check that client IP addresses are properly forwarded to Application Insights
2. If behind a proxy/load balancer: configure X-Forwarded-For header forwarding
3. Verify geo-enrichment is enabled in the Application Insights resource settings (Azure Portal)
4. Note: geo-enrichment happens server-side in Azure, not in the SDK

Provide the configuration steps (both Azure Portal and code if applicable).`,

  browserTimings: (stack, resource) => `I need to capture frontend performance metrics (browser timings) in my ${stack.name} application using Azure Application Insights.

Context:
- App Insights resource: ${resource || "[your-resource-name]"}
- Framework: ${stack.name}
- SDK to use: ${stack.sdk}
- Signal missing: browserTimings (no page load performance data)

What I need:
1. Install the Application Insights JavaScript SDK if not already present
2. Enable browser timing collection (enableAutoRouteTracking, enableAjaxPerfTracking)
3. Capture: network time, send time, receive time, DOM processing time
4. Capture: TTFB, LCP, FID, CLS (Web Vitals) if possible
5. Set proper sampling to control costs

Generate the complete frontend configuration code.`,
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

function signalLabel(signal) {
  const labels = {
    pageViews: "Page View Tracking",
    requests: "Backend Request Tracking",
    userId: "User Identity",
    sessionId: "Session Tracking",
    userAgent: "Device & Browser Info",
    geo: "Geo Enrichment",
    browserTimings: "Frontend Performance",
  };
  return labels[signal] || signal;
}
