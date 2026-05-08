/**
 * Readiness Score: gamified 0-100 score with point breakdown.
 *
 * Each signal category has a weight. The score is the sum of weights
 * for available signals. This drives user engagement by showing a clear
 * path to improve telemetry coverage.
 */

const SIGNAL_WEIGHTS = {
  pageViews:       { points: 20, label: "Page Views",       category: "required",    description: "Frontend page view tracking" },
  requests:        { points: 15, label: "Backend Requests",  category: "required",    description: "Server-side request telemetry" },
  sessionId:       { points: 15, label: "Session Tracking",  category: "required",    description: "Session identification" },
  userId:          { points: 15, label: "User Identity",     category: "recommended", description: "Authenticated user tracking" },
  userIdDegraded:  { points: 0,  label: "User Identity",     category: "recommended", description: "user_AuthenticatedId is nearly empty — visitor counts are over-estimated" },
  userAgent:       { points: 10, label: "Device & Browser",  category: "recommended", description: "Client environment details" },
  geo:             { points: 10, label: "Geo Location",      category: "optional",    description: "Geographic enrichment" },
  browserTimings:  { points: 15, label: "Frontend Perf",     category: "optional",    description: "Browser timing metrics" },
};

/**
 * Compute the readiness score from a readiness report.
 * @param {object} readinessReport - The readiness report from buildReadinessReport
 * @returns {object} Score breakdown
 */
export function computeReadinessScore(readinessReport) {
  if (!readinessReport) {
    return { score: 0, maxScore: 100, percentage: 0, breakdown: [], grade: "F", quickWins: [] };
  }

  const signals = readinessReport.availableSignals || {};
  let score = 0;
  const isDegraded = Boolean(signals.userIdDegraded);
  const maxScore = Object.entries(SIGNAL_WEIGHTS).reduce((sum, [key, w]) => {
    if (key === "userIdDegraded") return sum;
    return sum + w.points;
  }, 0);
  const breakdown = [];

  for (const [key, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    if (key === "userIdDegraded" && !signals.userIdDegraded) continue;
    if (key === "userId" && signals.userIdDegraded) continue;

    const available = Boolean(signals[key]);
    if (available) score += weight.points;
    breakdown.push({
      signal: key,
      label: weight.label,
      points: key === "userIdDegraded" ? SIGNAL_WEIGHTS.userId.points : weight.points,
      available,
      category: weight.category,
      description: weight.description,
    });
  }

  // Sort: available first, then by points descending
  breakdown.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return b.points - a.points;
  });

  const quickWins = breakdown
    .filter((row) => !row.available && row.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((row) => ({ signal: row.signal, label: row.label, points: row.points }));

  return {
    score,
    maxScore,
    percentage: Math.round((score / maxScore) * 100),
    breakdown,
    grade: gradeFromScore(score, maxScore),
    quickWins,
  };
}

function gradeFromScore(score, maxScore) {
  const pct = (score / maxScore) * 100;
  if (pct >= 90) return "A";
  if (pct >= 75) return "B";
  if (pct >= 55) return "C";
  if (pct >= 35) return "D";
  return "F";
}
