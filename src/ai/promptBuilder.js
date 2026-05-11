/**
 * Prompt + JSON schema builder for the F3 mapping analysis task.
 *
 * The F2 schema scan already PII-scrubs sample values (see
 * `src/core/schemaScan.js`), so this module just composes the prompts —
 * it does NOT re-sanitize. Any field added to the payload must come
 * from a scan source that is already scrubbed.
 */

export const CANONICAL_FIELDS = ["canonicalUserId", "canonicalSessionId", "canonicalPagePath", "canonicalReferrer"];

export const MAPPING_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mapping_proposals", "missing_signals", "dashboard_recommendations", "summary"],
  properties: {
    mapping_proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["canonical", "source", "expr", "confidence", "reasoning"],
        properties: {
          canonical: { type: "string", enum: CANONICAL_FIELDS },
          source: {
            type: "string",
            description:
              "Where the value comes from. Built-in field name (e.g. user_AuthenticatedId, session_Id) OR customDimensions.<key>.",
          },
          expr: {
            type: "string",
            description:
              "KQL expression that yields the canonical value, e.g. user_AuthenticatedId or tostring(customDimensions[\"uid\"]).",
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reasoning: {
            type: "string",
            description: "One sentence explaining why this proposal was chosen.",
          },
        },
      },
    },
    missing_signals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["signal", "why_missing", "recommended_kql", "remediation"],
        properties: {
          signal: { type: "string" },
          why_missing: { type: "string" },
          recommended_kql: {
            type: "string",
            description: "A short KQL snippet that would surface this signal if the data were present.",
          },
          remediation: {
            type: "string",
            description: "Plain-language instrumentation step the engineer should take.",
          },
        },
      },
    },
    dashboard_recommendations: {
      type: "object",
      additionalProperties: false,
      required: ["feature", "hide", "rationale"],
      properties: {
        feature: {
          type: "array",
          description: "Chart / panel ids to prominently feature given what's instrumented.",
          items: { type: "string" },
        },
        hide: {
          type: "array",
          description: "Chart / panel ids to hide because the underlying signal is missing.",
          items: { type: "string" },
        },
        rationale: { type: "string" },
      },
    },
    summary: {
      type: "string",
      description:
        "Two or three sentences of plain-language analysis the user will see on the wizard's first screen.",
    },
  },
};

const SYSTEM_PROMPT = `You are an Azure Application Insights telemetry analyst.
You receive a JSON payload describing a tenant's schema: which tables hold events,
which custom-dimension keys are present (with PII-scrubbed sample values and
cardinality), which timestamps span what window, and which gaps a deterministic
heuristic already flagged.

Your job: propose how to map the four canonical analytics fields
(canonicalUserId, canonicalSessionId, canonicalPagePath, canonicalReferrer) onto
what the tenant actually has. For each, choose between:
  - a built-in App Insights field (user_AuthenticatedId, user_Id, session_Id,
    operation_Id, url, name, client_Browser…) if the probeCounts show it's populated, OR
  - a custom dimension key, expressed as tostring(customDimensions["<key>"]).

Confidence rules (apply literally):
  - "high"   = built-in field with non-zero counts, OR a custom key that appears
               in 2+ tables.
  - "medium" = custom key that appears in only one table but matches an obvious
               semantic alias (uid, sessionId, page, etc).
  - "low"    = inference from name semantics alone (opaque key, unsure mapping).

Also enumerate missing_signals: each gap from the scan plus any you spot yourself,
with a remediation step the engineer can paste. Each missing_signal MUST include
a recommended_kql snippet — if no useful query is possible until the data is
instrumented, use a literal placeholder like "// requires instrumentation: add
session_Id to all pageView events" rather than leaving the field empty.

Rules:
- Only reference columns / keys present in the scan. Do not invent fields.
- Do not include any PII in your output (the input is already scrubbed; the
  output must stay sanitized too).
- "expr" must be syntactically valid KQL — use tostring() around customDimensions
  lookups, parse_url(url).Path for path extraction, etc.
- The "feature" and "hide" arrays in dashboard_recommendations refer to logical
  panel ids: traffic, users, sessions, geo, devices, campaigns, performance,
  pages. Use those exact strings.

Be concise. Reasoning fields are one sentence.`;

function compactScan(scan) {
  if (!scan) return {};
  return {
    tables: scan.tables || {},
    eventNames: (scan.eventNames || []).slice(0, 20),
    customDimensions: (scan.customDimensions || []).map((cd) => ({
      table: cd.tableName,
      key: cd.keyName,
      cardinality: cd.cardinality,
      occurrences: cd.occurrences,
      samples: (cd.samples || []).slice(0, 3),
    })),
    timestampSpan: scan.timestampSpan || [],
    gaps: (scan.gaps || []).map((g) => ({ id: g.id, severity: g.severity, title: g.title })),
  };
}

function compactReadiness(readinessReport) {
  if (!readinessReport) return {};
  return {
    overallStatus: readinessReport.overallStatus,
    availableSignals: readinessReport.availableSignals,
    probeCounts: readinessReport.probeCounts,
  };
}

export function buildMappingPrompt({ scan, readinessReport }) {
  const payload = {
    scan: compactScan(scan),
    readiness: compactReadiness(readinessReport),
  };
  const userPrompt = [
    "Here is the tenant's telemetry scan (PII already scrubbed):",
    "",
    JSON.stringify(payload, null, 2),
    "",
    "Return a JSON object matching the provided schema.",
  ].join("\n");
  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    schema: MAPPING_RESPONSE_SCHEMA,
    schemaName: "mapping_analysis_response",
  };
}
