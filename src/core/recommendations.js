/**
 * Map of action categories to specific remediation steps.
 */
const actionStepsByCategory = {
  pageViews: [
    "Verify the Application Insights JavaScript SDK is loaded on all pages",
    "Confirm trackPageView() is called on each route change (SPA) or page load",
    "Re-check readiness in 24h after deploying changes",
  ],
  requests: [
    "Ensure the server-side Application Insights SDK is configured",
    "Verify the SDK auto-collects HTTP requests (or add manual tracking)",
    "Re-check readiness in 24h after deploying changes",
  ],
  customEvents: [
    "Identify key user actions and add trackEvent() calls",
    "Deploy updated instrumentation to your application",
    "Re-check readiness in 24h after deploying changes",
  ],
  dependencies: [
    "Enable dependency tracking in the Application Insights SDK configuration",
    "Verify external service calls (databases, APIs) are being captured",
    "Re-check readiness in 24h after deploying changes",
  ],
  exceptions: [
    "Add global exception handling with trackException()",
    "Ensure unhandled promise rejections and errors are captured",
    "Re-check readiness in 24h after deploying changes",
  ],
  geoEnrichment: [
    "Check that client IP addresses are forwarded correctly to Application Insights",
    "Verify geo-enrichment is enabled in Application Insights resource settings",
    "Re-check readiness in 24h after configuration changes",
  ],
  default: [
    "Review instrumentation in your app for the relevant signal",
    "Deploy updated telemetry config",
    "Re-check readiness in 24h",
  ],
};

/**
 * Infer the action category from the action title or signal field.
 */
function inferCategory(action) {
  const text = (action.signal || action.title || "").toLowerCase();
  if (text.includes("pageview") || text.includes("page view")) return "pageViews";
  if (text.includes("request")) return "requests";
  if (text.includes("custom") || text.includes("event")) return "customEvents";
  if (text.includes("dependency") || text.includes("dependencies")) return "dependencies";
  if (text.includes("exception") || text.includes("error")) return "exceptions";
  if (text.includes("geo") || text.includes("location")) return "geoEnrichment";
  return "default";
}

export function buildRecommendations(readinessReport) {
  if (!readinessReport) return [];
  const actions = readinessReport.recommendedActions || [];
  return actions.map((action) => {
    const category = inferCategory(action);
    return {
      title: action.title,
      why: action.message,
      steps: actionStepsByCategory[category] || actionStepsByCategory.default,
    };
  });
}
