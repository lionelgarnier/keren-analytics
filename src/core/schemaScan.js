/**
 * Schema scan — Track F2 (ADR 0005).
 *
 * Pure transformation layer that combines what the orchestrator already
 * collects (schemaProfile + readinessReport) with three additional
 * summary queries (eventVolumes, customDimensionSamples, timestampSpan)
 * to produce a single JSON document the AI mapping service (F3) and
 * setup wizard UI (F4) consume.
 *
 * No Azure calls live here. Persistence is in `scanStore.js`.
 */
import { ALIASES } from "./mapping.js";

// PII patterns. Each sample value returned by KQL passes through these
// before being persisted, so a leaked email/phone/SSN/IP never lands in
// the scan payload (or, downstream, in a prompt sent to an LLM).
//
// Conservative match — false positives on odd strings are acceptable
// because the field is "show me a few example values for context", not
// a data export. Order matters: email before phone (a phone-like substring
// in an email's local-part shouldn't be replaced first).
const PII_PATTERNS = [
  { name: "email", regex: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: "<email>" },
  { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "<ssn>" },
  { name: "ipv4", regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "<ip>" },
  // UUIDs (tenant/user identifiers) and long hex strings (auth/session
  // tokens, API keys) — both observed leaking through URL query params.
  // UUID before hextoken so a dashed UUID is labelled as such.
  {
    name: "uuid",
    regex: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    replacement: "<uuid>",
  },
  { name: "hextoken", regex: /\b[0-9a-fA-F]{32,}\b/g, replacement: "<token>" },
  // Phone last — its loose pattern is the most likely to over-match.
  // Min 8 chars total (e.g. `555-0100`); accepts `+`, spaces, `()`,
  // `.`, `-` as separators.
  { name: "phone", regex: /\+?\d[\d\s().-]{6,}\d/g, replacement: "<phone>" },
];

export function scrubPii(value) {
  if (typeof value !== "string") return value;
  let out = value;
  for (const { regex, replacement } of PII_PATTERNS) {
    out = out.replace(regex, replacement);
  }
  return out;
}

export function scrubSamples(samples) {
  if (!Array.isArray(samples)) return [];
  return samples.map(scrubPii);
}

function collectCdKeys(customDimensions) {
  if (!Array.isArray(customDimensions)) return [];
  const seen = new Set();
  const keys = [];
  for (const cd of customDimensions) {
    if (cd && typeof cd.keyName === "string" && !seen.has(cd.keyName)) {
      seen.add(cd.keyName);
      keys.push(cd.keyName);
    }
  }
  return keys;
}

function matchesAlias(keys, alias) {
  if (!alias) return false;
  const exactSet = new Set((alias.exact || []).map((a) => a.toLowerCase()));
  for (const k of keys) {
    if (exactSet.has(k.toLowerCase())) return true;
    if (alias.pattern && alias.pattern.test(k)) return true;
  }
  return false;
}

const UTM_PATTERN = /^utm[_-]?(source|medium|campaign|term|content)$/i;

/**
 * Heuristic gap detection — flags signals that are absent today and
 * would unlock new dashboard surfaces if instrumented. Each gap has
 * an `id` so F4 (wizard) and F3 (AI recommendations) can reason about
 * which ones the LLM has already proposed remediation for.
 */
export function detectGaps({ schemaProfile, readinessReport, customDimensions }) {
  const gaps = [];
  const probeCounts = readinessReport?.probeCounts || {};
  const tables = schemaProfile?.tables || {};
  const cdKeys = collectCdKeys(customDimensions);

  const hasAuthUser = (probeCounts.userAuthCount || 0) > 0;
  const hasCustomUser = matchesAlias(cdKeys, ALIASES.userId);
  if (!hasAuthUser && !hasCustomUser) {
    gaps.push({
      id: "no-user-id",
      severity: "high",
      title: "No user identity field detected",
      detail:
        "user_AuthenticatedId is empty and no custom dimension matches common user-id naming conventions (uid, userId, accountId…). Cohort analysis and per-user retention require this.",
    });
  }

  const hasBuiltinSession =
    (probeCounts.sessionCount || 0) + (probeCounts.requestSessionCount || 0) > 0;
  const hasCustomSession = matchesAlias(cdKeys, ALIASES.sessionId);
  if (!hasBuiltinSession && !hasCustomSession) {
    gaps.push({
      id: "no-session-id",
      severity: "high",
      title: "No session identifier detected",
      detail:
        "session_Id is empty and no custom dimension looks like a session key. Session-level metrics (duration, depth, bounce) cannot be computed.",
    });
  }

  const hasCampaign =
    matchesAlias(cdKeys, ALIASES.referrer) ||
    cdKeys.some((k) => UTM_PATTERN.test(k));
  if (!hasCampaign) {
    gaps.push({
      id: "no-campaign-tracking",
      severity: "medium",
      title: "No campaign or referrer tracking",
      detail:
        "No custom dimension matches utm_source / utm_medium / refUri / referrer patterns. Acquisition attribution will be empty.",
    });
  }

  const hasBrowserTimings =
    !!tables.browserTimings || (probeCounts.browserTimingsCount || 0) > 0;
  if (!hasBrowserTimings) {
    gaps.push({
      id: "no-browser-timings",
      severity: "medium",
      title: "No browser performance timings",
      detail:
        "browserTimings table has no events — Web Vitals (LCP, FID, CLS) and page-load duration are not available.",
    });
  }

  return gaps;
}

// Custom-dimension keys and event names are attacker-influenceable: an end
// user of the observed app controls what dimension keys / event names get
// emitted. They flow verbatim into the LLM mapping prompt, so they are a
// prompt-injection vector. Sanitize at scan time (the single point where they
// enter the system), not only where they're consumed.
const SAFE_CUSTOM_KEY = /^[A-Za-z0-9_.-]{1,128}$/;

// A key that isn't allowlist-safe can never build a valid customDimensions[...]
// access anyway, so replacing it with a marker loses nothing usable while
// removing any injected KQL/instruction text from the prompt.
function sanitizeKeyName(key) {
  if (typeof key !== "string") return null;
  const scrubbed = scrubPii(key);
  return SAFE_CUSTOM_KEY.test(scrubbed) ? scrubbed : "<unsafe-key>";
}

// Event names are free-text (e.g. "search:<query>") so an allowlist is too
// strict — scrub PII, strip newlines (injected instruction blocks), and cap.
function sanitizeEventName(name) {
  return scrubPii(String(name)).replace(/[\r\n]+/g, " ").slice(0, 120);
}

function normalizeCustomDimensions(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    tableName: row.tableName ?? null,
    keyName: sanitizeKeyName(row.keyName ?? row.key ?? null),
    cardinality: typeof row.cardinality === "number" ? row.cardinality : null,
    occurrences: typeof row.occurrences === "number"
      ? row.occurrences
      : typeof row.keyCount === "number" ? row.keyCount : null,
    samples: scrubSamples(row.samples),
  })).filter((cd) => cd.keyName);
}

function normalizeEventNames(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && r.name)
    .map((r) => ({ name: sanitizeEventName(r.name), count: Number(r.count) || 0 }));
}

function normalizeSpan(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && r.tableName)
    .map((r) => ({
      tableName: r.tableName,
      earliest: r.earliest ?? null,
      latest: r.latest ?? null,
      eventCount: typeof r.eventCount === "number" ? r.eventCount : 0,
    }));
}

/**
 * Assemble a scan payload from pre-fetched results. Pure function — no
 * I/O, no state. Caller is responsible for persisting via scanStore.
 *
 * The payload is the **config snapshot**: it embeds `schemaProfile` and
 * `readinessReport` verbatim so a dashboard render can rebuild the
 * mapping from the persisted scan alone — without re-probing readiness
 * or re-profiling the schema. See orchestrator.runOverviewPipeline.
 */
export function buildSchemaScan({
  schemaProfile,
  readinessReport,
  eventVolumes,
  customDimensionSamples,
  timestampSpan,
  scannedAt,
}) {
  const customDimensions = normalizeCustomDimensions(customDimensionSamples);
  const eventNames = normalizeEventNames(eventVolumes);
  const span = normalizeSpan(timestampSpan);
  const gaps = detectGaps({ schemaProfile, readinessReport, customDimensions });

  return {
    scannedAt: scannedAt || new Date().toISOString(),
    tables: { ...(schemaProfile?.tables || {}) },
    customDimensions,
    eventNames,
    timestampSpan: span,
    gaps,
    // Config snapshot — consumed by the render phase, not shown in the UI.
    schemaProfile: schemaProfile || null,
    readinessReport: readinessReport || null,
  };
}
