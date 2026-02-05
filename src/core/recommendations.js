export function buildRecommendations(readinessReport) {
  if (!readinessReport) return [];
  const actions = readinessReport.recommendedActions || [];
  return actions.map((action) => ({
    title: action.title,
    why: action.message,
    steps: [
      "Review instrumentation in your app",
      "Deploy updated telemetry config",
      "Re-check readiness in 24h",
    ],
  }));
}
