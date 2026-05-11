/**
 * Deterministic, no-LLM narration of a dashboard payload.
 *
 * The "AI explains what your telemetry looks like" panel on the demo URL
 * (and the same panel — with a "preview" badge — in real mode) is rendered
 * from this module. Every sentence is derived from the dashboard payload
 * the user already sees, so we never invent numbers.
 *
 * When real Azure OpenAI integration ships post-launch, this module's
 * shape (`{ headline, paragraph, badge, tagline, mode }`) is what the
 * frontend consumes — the LLM just produces a richer `paragraph`.
 */

const TAGLINE = "AI explains what your telemetry looks like.";
const PREVIEW_BADGE = "Preview — real LLM coming soon";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const RANGE_LABELS = {
  today: "today",
  "7d": "the last 7 days",
  "30d": "the last 30 days",
};

function fmtCount(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1_000)}k`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

function fmtPct(n) {
  return `${(Number(n) * 100).toFixed(1)}%`;
}

function topCampaign(charts) {
  const list = charts?.campaignBreakdown || [];
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => (b.visitors || 0) - (a.visitors || 0));
  const top = sorted[0];
  if (!top || !top.source) return null;
  const label = top.medium && top.medium !== "(none)"
    ? `${top.source} / ${top.medium}`
    : top.source;
  return label;
}

function peakWindow(charts) {
  const peaks = charts?.peakHours || [];
  if (peaks.length === 0) return null;
  const top = peaks.reduce((best, row) => (row.count > (best?.count || 0) ? row : best), null);
  if (!top || !Number.isFinite(top.dayIndex) || !Number.isFinite(top.hour)) return null;
  const day = DAY_NAMES[top.dayIndex] || null;
  if (!day) return null;
  return `${day} around ${String(top.hour).padStart(2, "0")}:00`;
}

function userIdSentence(mapping) {
  const userId = mapping?.canonicalUserId;
  if (!userId || !userId.source) {
    return "No user identifier is mapped — cohort analysis falls back to anonymous IDs.";
  }
  const source = String(userId.source);
  if (source.startsWith("user_AuthenticatedId")) {
    return "User identity uses the standard authenticated ID, suitable for cohort analysis.";
  }
  if (source.includes("customDimensions")) {
    const m = source.match(/customDimensions\["([^"]+)"\]/);
    const key = m ? m[1] : "a custom dimension";
    return `User identity is tracked via the custom dimension '${key}' — no authenticated user ID detected.`;
  }
  return `User identity is mapped to '${source}'.`;
}

function errorSentence(errorRate) {
  if (!Number.isFinite(errorRate) || errorRate <= 0) return null;
  const pct = fmtPct(errorRate);
  if (errorRate > 0.03) {
    return `Error rate sits at ${pct} — above the 3% comfort threshold; check the Technical tab.`;
  }
  return `Error rate sits at ${pct} — well within the healthy band.`;
}

function buildParagraph({ dashboard, mapping, range }) {
  const kpis = dashboard?.kpis || {};
  const charts = dashboard?.charts || {};
  const rangeLabel = RANGE_LABELS[range] || "the selected window";

  const visitors = fmtCount(kpis.uniqueVisitors);
  const sessions = fmtCount(kpis.sessions);
  const top = topCampaign(charts);
  const peak = peakWindow(charts);

  const sentences = [];

  if (kpis.uniqueVisitors > 0 || kpis.sessions > 0) {
    const sourceClause = top ? `, mostly via ${top}` : "";
    sentences.push(
      `Your environment captured ${visitors} visitors across ${sessions} sessions over ${rangeLabel}${sourceClause}.`
    );
  } else {
    sentences.push(
      `Your environment is connected over ${rangeLabel} but the selected window has very little traffic — try expanding the range or checking the Readiness tab.`
    );
  }

  if (peak) {
    sentences.push(`Traffic peaks on ${peak}, suggesting a concentrated audience or timezone.`);
  }

  const errSent = errorSentence(kpis.errorRate);
  if (errSent) sentences.push(errSent);

  sentences.push(userIdSentence(mapping));

  return sentences.join(" ");
}

export function buildNarration({ azureMode, dashboard, mapping, range, aiMapping }) {
  const paragraph = buildParagraph({ dashboard, mapping, range });
  const isMock = azureMode === "mock";
  // After Track F3, the wizard runs a real LLM call when `AI_PROVIDER=azure-foundry`
  // and persists the proposals. When that succeeded for the active scan
  // (aiMapping non-null, non-degraded, source != "deterministic"), the
  // "preview" qualifier no longer holds — drop the badge and flip the
  // mode to "ai".
  const hasRealAi = !!(aiMapping && !aiMapping.degraded && aiMapping.source && aiMapping.source !== "deterministic");
  let mode;
  if (isMock) mode = "mock";
  else if (hasRealAi) mode = "ai";
  else mode = "preview";
  return {
    enabled: true,
    mode,
    headline: "Environment analysis",
    paragraph,
    badge: isMock || hasRealAi ? null : PREVIEW_BADGE,
    tagline: TAGLINE,
  };
}
