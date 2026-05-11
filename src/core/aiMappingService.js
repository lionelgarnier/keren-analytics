/**
 * AI mapping service — Track F3 (ADR 0005).
 *
 * Wires F2 scan + AI provider + mapping cache. The shape of the
 * returned object matches the JSON schema in
 * `src/ai/promptBuilder.js` (with the extra `degraded` flag + `source`
 * indicator so callers and the UI can react accordingly).
 *
 * Never throws on provider error: degraded fallback is the contract.
 * The dashboard pipeline must not break because the LLM was unhappy.
 */
import { getLatestScan } from "./scanStore.js";
import { persistMapping, getMappingForScan } from "./mappingStore.js";
import { getAiProvider } from "../ai/factory.js";
import { buildMappingPrompt } from "../ai/promptBuilder.js";
import { isUnderCap, recordUsage } from "../ai/quotaGuard.js";

const DEGRADED_PROPOSAL = {
  mapping_proposals: [],
  missing_signals: [],
  dashboard_recommendations: { feature: [], hide: [], rationale: "" },
  summary: "",
};

function isWellFormed(proposal) {
  return (
    proposal &&
    typeof proposal === "object" &&
    Array.isArray(proposal.mapping_proposals) &&
    Array.isArray(proposal.missing_signals) &&
    proposal.dashboard_recommendations &&
    Array.isArray(proposal.dashboard_recommendations.feature) &&
    typeof proposal.summary === "string"
  );
}

function fallback(reason) {
  return {
    source: "deterministic",
    degraded: true,
    proposals: { ...DEGRADED_PROPOSAL, summary: "" },
    reason,
  };
}

/**
 * Compute (or fetch from cache) the AI mapping proposals for the tenant's
 * latest scan. Returns null if no scan exists yet (caller should run the
 * pipeline first).
 *
 * @param {string} tenantId
 * @param {object} [opts]
 * @param {object} [opts.readinessReport] - readiness payload to attach to the prompt
 * @param {AbortSignal} [opts.abortSignal]
 * @returns {Promise<null | { id, scanId, source, proposals, degraded, createdAt, reason? }>}
 */
export async function getOrComputeMapping(tenantId, { readinessReport, abortSignal, provider } = {}) {
  const scan = getLatestScan(tenantId);
  if (!scan) return null;

  const cached = getMappingForScan(tenantId, scan.id);
  if (cached) return cached;

  const aiProvider = provider || getAiProvider();
  const supportsMapping = aiProvider.capabilities().mappingAnalysis;
  if (!supportsMapping) {
    const fb = fallback("provider does not support mappingAnalysis");
    const persisted = persistMapping(tenantId, scan.id, {
      source: fb.source,
      proposals: fb.proposals,
      degraded: true,
    });
    return { ...persisted, scanId: scan.id, ...fb };
  }

  if (!isUnderCap()) {
    const fb = fallback("daily LLM spend cap reached");
    const persisted = persistMapping(tenantId, scan.id, {
      source: fb.source,
      proposals: fb.proposals,
      degraded: true,
    });
    return { ...persisted, scanId: scan.id, ...fb };
  }

  const { systemPrompt, userPrompt, schema, schemaName } = buildMappingPrompt({
    scan: scan.payload,
    readinessReport,
  });

  let result;
  try {
    result = await aiProvider.generate({
      task: "mappingAnalysis",
      systemPrompt,
      userPrompt,
      schema,
      schemaName,
      abortSignal,
    });
  } catch (err) {
    const fb = fallback(`provider error: ${err.message}`);
    const persisted = persistMapping(tenantId, scan.id, {
      source: fb.source,
      proposals: fb.proposals,
      degraded: true,
    });
    return { ...persisted, scanId: scan.id, ...fb };
  }

  if (!result || !isWellFormed(result.output)) {
    const fb = fallback(result ? "provider response failed shape check" : "provider returned null");
    const persisted = persistMapping(tenantId, scan.id, {
      source: fb.source,
      proposals: fb.proposals,
      degraded: true,
    });
    return { ...persisted, scanId: scan.id, ...fb };
  }

  recordUsage(result.usage);

  const persisted = persistMapping(tenantId, scan.id, {
    source: aiProvider.name,
    proposals: result.output,
    degraded: false,
  });
  return {
    ...persisted,
    scanId: scan.id,
    source: aiProvider.name,
    proposals: result.output,
    degraded: false,
  };
}
