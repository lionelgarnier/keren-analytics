# Architecture Decision: Multi-Cloud Abstraction

## Status

ACCEPTED — Updated 2026-05-09 to reflect ADR 0001 (portfolio/showcase
positioning), ADR 0002 (Scaleway as demo host), ADR 0003 (Terraform one-click
deploy). Multi-cloud is now a **first-class deliverable**, not a speculative
Phase 4 gated on traction. Azure implementation exists. Scaleway, AWS, GCP
adapters scheduled per ADR 0001 § Decision 3.

## Context

Easy Analytics started with Azure (Application Insights + Log Analytics). Per
ADR 0001, the project pivots to a portfolio/showcase angle: the same app must
ingest telemetry from **Azure App Insights, AWS CloudWatch + X-Ray, GCP Cloud
Logging + Trace, and Scaleway Cockpit (Loki/Prometheus)** — each behind the
same UX, with no cloud-specific code in `src/core/`.

The architecture must therefore make multi-cloud real and testable, not
hypothetical, while staying minimal (no abstraction layer that exists only to
be elegant — every adapter must have a working consumer).

## Decision

Introduce a **Cloud Provider Interface** that abstracts all cloud-specific
operations behind a unified contract. The current `getAzureClient()` factory
pattern in `src/azure/client.js` already follows this approach and serves as the
foundation.

## Architecture

### Provider Interface Contract

Every cloud provider adapter must implement this interface:

```javascript
/**
 * CloudProvider interface contract.
 * Each provider (Azure, AWS, GCP) must implement all methods.
 */
const CloudProviderInterface = {
  /** Unique provider identifier */
  provider: "azure" | "aws" | "gcp",

  /**
   * Discover available telemetry resources for the tenant.
   * @param {string} tenantId
   * @returns {Promise<Resource[]>}
   */
  discoverResources(tenantId) {},

  /**
   * Check if the current credentials have sufficient access.
   * @param {string} resourceId
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  checkAccess(resourceId) {},

  /**
   * Execute an analytics query against the telemetry store.
   * @param {QueryParams} params
   * @returns {Promise<QueryResult>}
   */
  queryWorkspace(params) {},

  /**
   * Return the readiness probe query for this provider.
   * @returns {string} - Provider-specific query text
   */
  getReadinessQuery() {},

  /**
   * Return available signal types for this provider.
   * @returns {string[]} - e.g., ["pageViews", "requests", "traces"]
   */
  getSupportedSignals() {},
};
```

### Unified Resource Model

```javascript
/**
 * Normalized resource representation across all providers.
 */
const Resource = {
  /** Cloud provider */
  provider: "azure",
  /** Provider-specific resource ID */
  resourceId: "/subscriptions/.../microsoft.insights/components/myapp",
  /** Human-readable name */
  name: "My Application",
  /** Provider-specific workspace/log group/project ID */
  workspaceId: "workspace-guid",
  /** Additional provider-specific metadata */
  metadata: {},
};
```

### Unified Query Result Model

```javascript
/**
 * Normalized query result. All providers must return this format.
 * This is already the format used by the Azure client (Log Analytics API format).
 */
const QueryResult = {
  tables: [
    {
      columns: [{ name: "column1", type: "string" }],
      rows: [["value1"]],
    },
  ],
};
```

### Directory Structure (Target)

```
src/
  providers/
    interface.js          # Shared interface definition and validation
    factory.js            # Provider factory (replaces current azure/client.js)
    azure/
      client.js           # Azure real client (current realClient.js)
      mockClient.js       # Azure mock client (current mockClient.js)
      mockData.js         # Azure mock data
      queryAdapter.js     # Translates generic queries to KQL
    aws/
      client.js           # AWS real client (CloudWatch + X-Ray)
      mockClient.js       # AWS mock client
      queryAdapter.js     # Translates generic queries to CloudWatch Insights
    gcp/
      client.js           # GCP real client (Cloud Logging + Trace)
      mockClient.js       # GCP mock client
      queryAdapter.js     # Translates generic queries to GCP log queries
    scaleway/
      client.js           # Scaleway Cockpit client (Loki / Prometheus)
      mockClient.js       # Scaleway mock client
      queryAdapter.js     # Translates generic queries to LogQL / PromQL
  core/
    (unchanged - provider-agnostic orchestration)
  queries/
    azure/                # KQL templates (current kql/ folder)
    aws/                  # CloudWatch Insights queries
    gcp/                  # GCP log queries
    scaleway/             # LogQL / PromQL queries for Cockpit
```

### Migration Path from Current Architecture

The current code already uses the right pattern. The migration is incremental:

**Step 1 - Formalize the interface** (no breaking changes)
- Extract the implicit interface from `mockClient.js` and `realClient.js`
- Add `provider` field to resources
- Move `src/azure/` to `src/providers/azure/`
- Update `client.js` factory to support provider selection

**Step 2 - Add query abstraction**
- Create a query adapter layer that maps generic query names to provider-specific
  query languages (KQL for Azure, CloudWatch Insights for AWS, etc.)
- The current KQL templates become the Azure-specific implementation

**Step 3 - Implement AWS provider**
- Implement the CloudProvider interface for AWS
- Map Application Insights signals to CloudWatch equivalents:

| Azure Signal | AWS Equivalent |
|-------------|----------------|
| pageViews | CloudWatch RUM events |
| requests | X-Ray traces / ALB access logs |
| exceptions | CloudWatch Logs (error level) |
| dependencies | X-Ray subsegments |
| browserTimings | CloudWatch RUM performance |
| customEvents | Custom CloudWatch metrics / events |

**Step 4 - Implement GCP provider**
- Same pattern as AWS
- Map to Cloud Logging, Cloud Trace, and Cloud Monitoring

**Step 5 - Implement Scaleway provider**
- Same pattern. Backend: Scaleway Cockpit (Grafana + Loki + Prometheus stack
  managed by Scaleway).
- Map to LogQL (logs) and PromQL (metrics).

### Authentication per Provider

| Provider | Auth Method | Token Storage |
|----------|------------|---------------|
| Azure | Entra ID OAuth + PKCE | Session (current) |
| AWS | IAM Identity Center / Cognito OAuth | Session |
| GCP | Google OAuth + Workload Identity | Session |
| Scaleway | IAM API key (operator-scoped) or OAuth (when GA) | Session |

Each provider handles its own auth flow, but the session management is shared.

### Operator vs end-user accounts (no paid cloud subscription required)

A recurring confusion: does the **operator** (the person hosting the public
demo) need a paid account on each cloud they want to support? **No.** The
distinction is the same one already documented in `docs/setup-entra-id.md` for
Azure, generalized:

| Provider | What the operator needs (free) | What the end user brings |
|---|---|---|
| Azure | Entra ID tenant (free with any Microsoft account or M365 Developer Program) → register a multi-tenant app → `AZURE_CLIENT_ID` + secret | Their own Azure subscription with App Insights, signs in via OAuth, consents once |
| AWS | AWS account (free tier) → create a Cognito user pool or IAM Identity Center app for delegated access | Their own AWS account with CloudWatch / X-Ray data, signs in via OAuth |
| GCP | Google Cloud account (free tier) → create an OAuth client → client ID + secret | Their own GCP project with Cloud Logging data, signs in via Google OAuth |
| Scaleway | Scaleway account (free tier) → create an IAM application + API key for the operator instance | Their own Scaleway project with Cockpit data; for V1, BYOK (paste API key in UI), OAuth when Scaleway ships it |

Consequence: the public demo on Scaleway can support **all four cloud
backends** without the operator ever paying any of the four providers for
data-side resources. End users bring their own paid resources and OAuth
consent. This preserves the privacy invariant: **no raw data leaves the end
user's tenant** — the demo server only orchestrates queries with the user's
delegated token and returns aggregates.

## AI / LLM provider abstraction (LiteLLM)

The four AI surfaces (`docs/architecture-ai.md`) need a provider-agnostic LLM
client for the same reasons the telemetry layer does: portfolio coherence,
self-hoster choice, no vendor lock.

**Decision**: when wiring the first server-side LLM call, use
[**LiteLLM**](https://github.com/BerriAI/litellm) (Node SDK or OpenAI-compatible
proxy) as the abstraction layer. LiteLLM normalizes 100+ providers behind the
OpenAI Chat Completions API.

This complements `docs/architecture-ai.md` (which defines `none` / `ollama` /
`azure-openai` providers): LiteLLM is the **implementation mechanism** behind
the `aiClient` interface, not a fourth provider. The selection logic stays
the same (`AI_PROVIDER` env var); LiteLLM's job is to make adding a fifth or
sixth provider a config change instead of a code change.

Switching the LLM provider becomes config-only:

```bash
# Default — Scaleway Generative APIs (EU, Mistral)
LLM_MODEL=openai/mistral-large-3-675b
LLM_API_BASE=https://api.scaleway.ai/v1
LLM_API_KEY=${SCW_SECRET_KEY}

# Switch to Azure OpenAI (e.g., for Azure-native operators)
LLM_MODEL=azure/gpt-4o
LLM_API_BASE=https://<resource>.openai.azure.com
LLM_API_KEY=${AZURE_OPENAI_KEY}

# Switch to AWS Bedrock
LLM_MODEL=bedrock/anthropic.claude-sonnet-4-6
AWS_REGION=eu-west-3

# Switch to GCP Vertex AI
LLM_MODEL=vertex_ai/gemini-2.5-pro
VERTEX_PROJECT=easy-analytics
VERTEX_LOCATION=europe-west1

# Self-host (privacy-first, default for `ai-provider=ollama`)
LLM_MODEL=ollama/qwen2.5-coder:7b
LLM_API_BASE=http://localhost:11434
```

Application code (orchestrator, prompt generator) never references a provider
SDK directly. It calls the `aiClient.complete()` method, which delegates to
LiteLLM with the resolved config.

This unlocks the cross-cloud LLM benchmark deliverable (ADR 0001 § Decision 5,
expected article: "Mistral Large 3 vs Claude vs Gemini vs local Qwen on
real B2B telemetry tasks") with no extra plumbing — same prompt, four configs.

## Mapping Implications

The current mapping logic (`src/core/mapping.js`) uses Azure-specific field names
(e.g., `user_AuthenticatedId`, `session_Id`). For multi-cloud support:

1. The mapping layer needs a provider-specific field resolver
2. The canonical mapping remains the same (userId, sessionId, pagePath, etc.)
3. Each provider adapter translates canonical field names to provider-specific ones

```
Canonical Field    Azure                    AWS                     GCP
---------------------------------------------------------------------------
userId             user_AuthenticatedId     cognitoIdentityId       user_id
sessionId          session_Id               sessionId               session_id
pagePath           url.Path                 eventType=pageView.url  httpRequest.requestUrl
userAgent          client_Browser           userAgent               userAgent
```

## Key Design Principles

1. **Core stays cloud-agnostic** : The orchestrator, dashboard builder, cache, and
   readiness logic never import provider-specific code directly.
2. **Providers are self-contained** : Each provider directory contains everything
   needed (client, mock, queries, field mapping).
3. **Incremental adoption** : Adding a new provider doesn't require changing core code.
4. **Mock-first development** : Every provider has a mock client for development
   and testing.
5. **Same UX across clouds** : The dashboard looks identical regardless of provider.
   Users don't need to know which cloud is backing the data.

## Consequences

- Azure remains the only implemented data provider at the time of writing
- The abstraction adds a thin layer but no runtime overhead
- Scaleway, AWS, GCP connectors are developed independently per ADR 0001 phasing
- The query template system must support multiple query languages (KQL,
  CloudWatch Insights, GCP log queries, LogQL/PromQL)
- Mapping and readiness logic must be parameterized by provider
- The LLM layer goes through LiteLLM so adding/swapping a model is config-only

## Timeline (revised — supersedes previous Q1/Q3/Q4 2026 schedule)

Aligned with ADR 0001 § Decision 3:

- **Phase A** (immediate, post-rename): Formalize interface, refactor
  `src/azure/` → `src/providers/azure/`, ship Scaleway adapter (Cockpit) +
  Terraform Scaleway. Demo public on Scaleway.
- **Phase B**: Azure adapter relocated, LiteLLM wired for AI surfaces, Azure
  Terraform module. Article: "same app, two clouds".
- **Phase C**: AWS CloudWatch + X-Ray adapter, GCP Cloud Logging + Trace
  adapter, Terraform modules. Article: cross-cloud LLM benchmark, cost
  comparison.

No traction gates — these are the portfolio deliverables themselves
(see ADR 0001).

## Related decisions

- [ADR 0001](adr/0001-positioning-portfolio.md) — Portfolio/showcase pivot,
  multi-cloud as primary deliverable
- [ADR 0002](adr/0002-hosting-scaleway.md) — Scaleway as the demo host
- [ADR 0003](adr/0003-terraform-one-click-deploy.md) — Terraform per-cloud
  one-click deploy
- [`architecture-ai.md`](architecture-ai.md) — AI provider abstraction
  (`none` / `ollama` / `azure-openai`), now implemented via LiteLLM
