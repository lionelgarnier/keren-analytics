/**
 * AI disclosure — single source of truth for "what data is sent, where, and
 * to whom" during setup. Powers the Services-hub "Configure" split-button
 * menu and its inline "Quelles données sont envoyées ?" popover.
 *
 * Everything here is derived from `config` (provider + region) plus the
 * privacy contract documented in `docs/architecture-ai.md` § Privacy
 * boundary. No PII, no secrets — this is a config read, safe to expose to an
 * authenticated session.
 */

// The privacy contract, verbatim from architecture-ai.md so the popover and
// the doc can never drift. `sent` = leaves the box (sanitized); `never` =
// blocked by the scrubber before any prompt is built.
const DATA_CONTRACT = {
  sent: [
    "Table names (requests, pageViews, …)",
    "Custom dimension keys (not their values)",
    "Aggregated, rounded counters",
    "Event names",
    "Top page paths (ID-like segments are hashed)",
    "Detected stack (e.g. next, node)",
  ],
  never: [
    "Raw log rows",
    "Custom dimension values",
    "Emails, IPs, names, phone numbers (PII blocklist)",
    "OAuth tokens, session cookies, API keys",
    "Source code, repository URLs",
  ],
};

/**
 * Describe a single provider as a hub menu option.
 * @param {"azure-foundry"|"none"} mode
 */
function describeProvider(mode, config) {
  switch (mode) {
    case "azure-foundry":
      return {
        mode: "azure-foundry",
        optOut: false,
        label: "Configure with AI",
        provider: "Azure OpenAI",
        location: config.azureFoundryRegion || "Azure",
        outbound: true,
        detail: "AI auto-mapping · sanitized metadata only",
      };
    case "none":
    default:
      return {
        mode: "none",
        optOut: true,
        label: "Configure without AI",
        provider: null,
        location: null,
        outbound: false,
        detail: "Heuristic mapping · no outbound calls",
      };
  }
}

/**
 * Build the disclosure payload for the current deployment.
 *
 * `available` is the ordered list of choices the hub split-button renders:
 * always "sans IA", preceded by the configured AI provider when one is
 * wired. The first entry is the default primary action.
 *
 * @param {object} config - the app config (provider, region)
 * @returns {{provider:string, configured:boolean, available:Array, dataContract:object}}
 */
export function buildAiDisclosure(config) {
  const provider = config.aiProvider || "none";
  const noAi = describeProvider("none", config);

  let available;
  if (provider === "azure-foundry") {
    const configured = Boolean(config.azureFoundryEndpoint && config.azureFoundryDeployment);
    // If the operator selected Foundry but left it unconfigured, AI can't run
    // — offer only the deterministic path rather than a button that degrades.
    available = configured ? [describeProvider("azure-foundry", config), noAi] : [noAi];
  } else {
    available = [noAi];
  }

  return {
    provider,
    // True when at least one real AI option is offered (drives whether the
    // hub shows a drill-down or a plain "Configurer" button).
    configured: available.some((o) => !o.optOut),
    available,
    dataContract: DATA_CONTRACT,
  };
}
