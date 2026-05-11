/**
 * AI provider interface — Track F3 (ADR 0005).
 *
 * Mirrors the cloud provider contract in `src/providers/interface.js`.
 * Providers are capability-typed by task; the caller asks for
 * `task: "mappingAnalysis"` and the provider routes internally to the
 * appropriate model / deployment.
 *
 * Privacy invariant (cf. `docs/architecture-ai.md` § Privacy boundary):
 * inputs are already PII-scrubbed before reaching `generate()`. For F3
 * specifically, the F2 schema scan applies `scrubPii` at sample collection
 * time, so the provider trusts what it receives.
 *
 * @typedef {"mappingAnalysis" | "narration" | "nlToKql" | "instrumentation"} AITask
 *
 * @typedef {Object} AIGenerateArgs
 * @property {AITask} task
 * @property {string} systemPrompt    - high-level role + constraints
 * @property {string} userPrompt      - the actual content (already sanitized)
 * @property {object} schema          - JSON Schema the response must conform to
 * @property {string} schemaName      - identifier for the schema (e.g. "mappingResponse")
 * @property {AbortSignal} [abortSignal]
 *
 * @typedef {Object} AIUsage
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} totalTokens
 *
 * @typedef {Object} AIGenerateResult
 * @property {object} output    - parsed JSON matching the schema
 * @property {AIUsage} usage
 * @property {string} model     - deployment name actually used
 * @property {number} latencyMs
 *
 * @typedef {Object} AIProvider
 * @property {string} name                                    - "none" | "azure-foundry" | ...
 * @property {() => {[k in AITask]?: boolean}} capabilities
 * @property {(args: AIGenerateArgs) => Promise<AIGenerateResult | null>} generate
 */

export const AI_PROVIDER_METHODS = Object.freeze([
  "name",
  "capabilities",
  "generate",
]);

export function assertAiProvider(provider, label) {
  if (!provider || typeof provider !== "object") {
    throw new Error(`AI provider "${label}" did not return a provider object`);
  }
  for (const key of AI_PROVIDER_METHODS) {
    if (provider[key] === undefined) {
      throw new Error(`AI provider "${label}" is missing required member "${key}"`);
    }
  }
  if (typeof provider.capabilities !== "function" || typeof provider.generate !== "function") {
    throw new Error(`AI provider "${label}" capabilities/generate must be functions`);
  }
  return provider;
}
