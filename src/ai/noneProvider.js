/**
 * "None" AI provider — Track F3 (ADR 0005).
 *
 * Returns `null` from `generate()` so the caller falls through to the
 * deterministic mapping/recommendations layer. This is the default
 * (tests, self-hosters without an LLM budget, opt-out users).
 */

export function createNoneProvider() {
  return {
    name: "none",
    capabilities() {
      return {
        mappingAnalysis: false,
        narration: false,
        nlToKql: false,
        instrumentation: false,
      };
    },
    async generate() {
      return null;
    },
  };
}
