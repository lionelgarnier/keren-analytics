# Architecture Decision: AI Provider & Privacy

## Status

ACCEPTED — Track F (F1-F5) shipped 2026-05-11. The provider abstraction
is live with `none` (deterministic fallback / test default) and
`azure-foundry` (Azure AI Foundry project Responses API, Managed Identity
auth) — both wired end-to-end through the orchestrator, the setup
wizard, and the dashboard. Confirms the broad strokes of this ADR; one
correction is documented inline below (`azure-openai` superseded by
`azure-foundry`, cf. ADR 0005 addendum 2026-05-11).

The Context / Decision / Architecture / Configuration sections below
remain the canonical reference for **adding new providers or new tasks**.
The shipped state diverges from the original draft on three points,
which are flagged inline; the divergence is intentional and was driven
by what we learned during F3 implementation.

**What is live today** (Track F3 + F4 + F5) :
- `src/ai/interface.js` — provider contract (`name` / `capabilities()` / `generate()`)
- `src/ai/factory.js` — `AI_PROVIDER=none|azure-foundry` selector (cached)
- `src/ai/noneProvider.js` — deterministic fallback (zero outbound traffic)
- `src/ai/azureFoundry.js` — Foundry project Responses API, Managed Identity
  via `ChainedTokenCredential(MI → AzureCli)`, audience `https://ai.azure.com/.default`
- `src/ai/promptBuilder.js` — JSON-schema-strict response for `mappingAnalysis`
- `src/ai/quotaGuard.js` — daily EUR cap with deterministic fallback on overflow
- `src/core/aiMappingService.js` — orchestrates scan → cache → provider → persist
- `src/core/validationStore.js` — Layer 3 user overrides (Track F4)
- `src/core/narration.js` — `Preview` badge auto-drops when a real AI mapping
  is present (Track F5)

**Still planned, post-launch** :
- `ollama` provider (self-hosted, zero outbound)
- `narration`, `nlToKql`, `instrumentation` task wirings (only
  `mappingAnalysis` is wired today; the contract handles the others)

### Inline divergences from the original draft

1. **Configured provider is `azure-foundry`, not `azure-openai`.** The
   Foundry project endpoint exposes the same OpenAI Responses API surface,
   with future-proof model swap (Mistral, Cohere, Llama) under one
   endpoint. Token audience is `https://ai.azure.com/.default` (not
   `cognitiveservices.azure.com/.default`). Cf. ADR 0005 addendum.

2. **No `AZURE_OPENAI_API_KEY` env var.** Auth is Managed Identity in
   production (`Azure AI User` role on the Foundry Project) and
   `AzureCliCredential` (`az login`) in dev. Zero API keys in env.

3. **Quota guard is EUR-based, not request-count-based.** The original
   draft proposed `AI_MAX_REQUESTS_PER_TENANT_HOUR`; F3 ships
   `AI_DAILY_EUR_CAP=10` with real per-call cost estimation from token
   usage. This survives cost variance across models far better than
   request count.

4. **`mappingAnalysis` schema gained `code_prompt` (2026-05-12).** The
   missing-signals branch of the response now requires `code_prompt`
   alongside `recommended_kql` and `remediation`. The wizard surfaces
   `code_prompt` as the primary call to action (a self-contained prompt
   the user pastes into Cursor / Copilot / Claude Code so it can detect
   their stack and produce the code diff); `recommended_kql` is kept for
   power users behind a disclosure. Existing AI mappings persisted before
   this change have no `code_prompt` — the frontend treats it as optional
   (the wizard falls back to KQL-only rendering when the field is absent)
   and any new scan repopulates the schema.

5. **Validation overrides apply on any decision (2026-05-12).**
   `mergeWithValidation` used to require `decision === "override"` to
   apply overrides — and `accept_all` was always persisted with
   `overrides: null`, so AI-only proposals were silently discarded on
   the next pipeline run. The API now snapshots the effective mapping
   into `validation.overrides` on `accept_all`, and `mergeWithValidation`
   applies overrides whenever they exist. The `decision` label is now
   pure audit. Regression covered by
   `tests/setupApi.test.js` → "accept_all snapshots the effective mapping
   and flows through to the dashboard".

The rest of this doc — privacy contract, sanitizer rules, deployment
patterns — is unchanged and remains binding on any new provider.

## Context

The four AI surfaces specced in `docs/backlog/ai-*.md` —
[environment analysis](backlog/ai-environment-analysis.md),
[setup wizard](backlog/ai-setup-wizard.md),
[natural-language queries](backlog/ai-natural-language-queries.md),
[instrumentation assistant](backlog/ai-instrumentation-assistant.md) — all
assume a single backend: Azure OpenAI. That assumption has three problems.

**1. The privacy story is weaker than the product positioning.** The product
sells "no raw data leaves your tenant" (see the launch strategy § 2.1 trust
angle). Telemetry never leaves, true — but the AI metadata we *do* send
(custom dimension keys, page paths, event names, detected stack) is itself
sensitive. It can leak product names, customer-facing routes, internal tenant
identifiers, and proprietary feature names. Pointing that at an LLM run by
Microsoft, OpenAI, or Anthropic — even with no-train contracts and Azure
private endpoints — narrows the addressable market.

**2. Regulated and EU buyers cannot accept any third-party LLM.** Banks,
healthcare, public sector, and GDPR-strict EU shops will not deploy a tool
that calls out to a foreign-cloud LLM, regardless of contract. Self-hosters
specifically often want zero outbound AI traffic. Azure OpenAI in-region helps
but doesn't close the gap: the data still leaves the tenant's perimeter.

**3. The OSS demo budget cannot sustain LLM costs at HN-scale traffic.**
Launch strategy § 7 caps inference at 30-80 €/mo. A Show HN front-page spike
(8-30k visitors in a day) running narration + nl-to-KQL on Azure OpenAI burns
through that in hours, then either we rate-limit (degrades the demo) or pay
(out of budget). A local model on the demo VM has a hard, fixed cost.

The four AI tasks specced in this repo do not need GPT-4-class quality. They
need: structured JSON output, light reasoning over a small context window
(≤ 4k tokens), and decent code/KQL fluency. 7-8B open-weights instruct or
coder models meet that bar.

## Decision

Introduce an **AI provider abstraction** modeled on
[`src/providers/factory.js`](../src/providers/factory.js) and the cloud provider
pattern in [`architecture-multicloud.md`](architecture-multicloud.md). All four AI
features call a single `aiClient` interface; the implementation is selected by
env var.

Three implementations at launch:

| Provider | Outbound traffic | Status | Recommended for |
|---|---|---|---|
| `none` (default) | None | **Live** (F3) | Anyone who hasn't decided yet. AI surfaces show deterministic fallback. Always works. Tests force this. |
| `azure-foundry` | To customer's Azure AI Foundry | **Live** (F3, mappingAnalysis) | Azure-native customers. Managed Identity auth, no API keys. Supersedes the original `azure-openai` plan per ADR 0005. |
| `ollama` | LAN-only | Planned | Self-hosters, regulated buyers, EU-strict tenants. **Zero third-party AI exposure.** Post-launch. |

Future:

- `openai-compatible` — generic OpenAI-protocol endpoint (vLLM, llama.cpp
  server, LiteLLM proxy). Cheap to add.
- `bedrock`, `vertex` — Phase 4, parallel to the cloud provider work.

## Architecture

```
┌─────────────────────── core (provider-agnostic) ──────────────────────┐
│                                                                        │
│  llmAnalysis.js   setupWizard.js   nlQuery.js   instrumentation.js    │
│         │              │             │             │                  │
│         └──────────────┴─────┬───────┴─────────────┘                  │
│                              ▼                                        │
│                       core/aiSanitize.js                              │
│                  (PII / value scrubbing, only place                   │
│                   that builds AI prompts)                             │
│                              │                                        │
│                              ▼                                        │
│                       core/aiClient.js                                │
│                  (factory + capability-typed interface)               │
│                              │                                        │
└──────────────────────────────┼────────────────────────────────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
   ai/noneProvider.js   ai/ollamaProvider.js   ai/azureOpenAIProvider.js
   (returns null +      (HTTP → Ollama,        (HTTP → Azure OpenAI,
    deterministic        local, no auth)        bearer + private EP)
    fallback hook)
```

Same pattern as `getAzureClient()`. Selection via
`AI_PROVIDER=none|ollama|azure-openai`. Tests force `AI_PROVIDER=none` the
same way they force `azureMode=mock`.

## Provider Interface

```js
/**
 * AIProvider interface contract.
 * Each provider must implement all methods.
 */
const AIProviderInterface = {
  /** Unique provider identifier */
  provider: "none" | "ollama" | "azure-openai",

  /**
   * Which capabilities this provider can satisfy.
   * Callers use this to decide whether to attempt the call or jump
   * straight to the deterministic fallback.
   */
  capabilities() {
    return {
      mappingAnalysis: true,
      narration: true,
      nlToKql: true,
      instrumentation: true,
    };
  },

  /**
   * Generate a structured JSON response for a typed task.
   * The provider picks the right model for the task; callers do not specify.
   * Throws on transport error; returns null on schema-validation failure
   * (caller renders deterministic fallback).
   *
   * @param {object} args
   * @param {"mappingAnalysis"|"narration"|"nlToKql"|"instrumentation"} args.task
   * @param {string} args.prompt - already sanitized by aiSanitize.js
   * @param {object} args.schema - JSON schema the response must match
   * @param {number} [args.maxTokens]
   * @param {AbortSignal} [args.abortSignal]
   * @returns {Promise<object|null>}
   */
  async generate(args) {},
};
```

**Capability-typed by task, not by model.** The caller asks for
`task: "nlToKql"`. The provider routes to the appropriate model
internally — `ollama` to a coder model, `azure-openai` to a smarter
deployment. The four AI features stay model-agnostic.

## Per-task model recommendations (Ollama)

| Task | Model | Approx RAM | Why |
|---|---|---|---|
| `mappingAnalysis` | `phi-3.5-mini` (3.8B) or `llama-3.2-3b` | 4 GB | Schema reasoning over ≤ 2k-token context, structured JSON. Small models do this well. |
| `narration` | `llama-3.1-8b-instruct` or `qwen-2.5-7b-instruct` | 8 GB | Tonal quality matters. 7-8B reads natural; 3B reads obviously machine-written. |
| `nlToKql` | `qwen-2.5-coder-7b` | 8 GB | KQL is closer to SQL than to prose. A coder model is non-negotiable here. |
| `instrumentation` | `qwen-2.5-coder-7b` | 8 GB | Generates code snippets. Same constraints as nlToKql. |

Total VRAM: ~16 GB if all loaded in parallel; ~8 GB with Ollama's
load-on-demand (cold start adds ~3-8s on the first call after eviction).

For `azure-openai`:
- All tasks → `gpt-4o-mini` baseline (cheap, in-tenant).
- Upgrade `nlToKql` and `instrumentation` to `gpt-4o` if quality matters more
  than cost.

For `none`:
- All tasks return `null`. The caller renders the deterministic fallback that
  is already specced in each AI doc (alias-only mapping, canned narration,
  static prompt cards).

## Privacy boundary — the security contract

**This contract binds every provider, including future ones.**

`core/aiSanitize.js` is the only module that constructs AI prompts. It
receives data from the deterministic pipeline and produces a payload that
contains:

| Allowed (sanitized) | Forbidden |
|---|---|
| Table names from `schemaProfile` | Raw log rows |
| Custom dimension **keys** | Custom dimension **values** |
| Aggregate counts, rounded to 1 sig fig when < 1000 | Precise counts that could be a tenant fingerprint |
| Mapping result (canonical fields only) | OAuth tokens, session cookies, API keys |
| Top N page paths, with paths-that-look-like-IDs hashed | Email, IP, name, phone, any field on the PII denylist |
| Event names | Event property values |
| Detected stack (e.g. `"next"`, `"node"`) | Source code, repo URLs |
| User's natural-language question (`nlToKql` only) | Anything the user did not type themselves |

The sanitizer is centralized so providers don't each re-implement the
denylist. Any new provider trusts that the input was already scrubbed.

`nlToKql` is the only path that takes free-form user text. The user's
question is forwarded verbatim because the user typed it knowing it would be
sent. The schema profile context attached to it remains sanitized.

## Outbound traffic per provider

| Provider | Outbound? | Endpoint | Sensitivity of payload |
|---|---|---|---|
| `none` | No | n/a | n/a |
| `ollama` | LAN-only | `OLLAMA_HOST` (default `http://localhost:11434`) | sanitized metadata |
| `azure-openai` | Yes — to customer's Azure | `AZURE_OPENAI_ENDPOINT`, private endpoint preferred | sanitized metadata |
| `openai-compatible` (future) | Yes — to user-configured endpoint | `OPENAI_COMPATIBLE_BASE_URL` | sanitized metadata |

Self-hosters get **zero outbound AI traffic** with `AI_PROVIDER=ollama`. This
is the answer for "we cannot accept any third-party LLM call".

## Configuration

```env
# AI provider selector. Default: none.
AI_PROVIDER=none|azure-foundry          # `ollama` planned, not yet wired

# --- AI_PROVIDER=azure-foundry (Track F3 — ADR 0005) ---
# Full project Responses API URL (incl. /openai/v1/responses path).
AZURE_FOUNDRY_ENDPOINT=https://<project>.services.ai.azure.com/api/projects/<project>/openai/v1/responses
AZURE_FOUNDRY_DEPLOYMENT=gpt-5.4-mini
# Optional: client ID of the user-assigned Managed Identity to use in
# Container Apps (when AZURE_CLIENT_ID is reserved for the OAuth user app).
AZURE_FOUNDRY_CLIENT_ID=<uami-client-id>

# --- AI_PROVIDER=ollama (planned, post-launch) ---
# OLLAMA_HOST=http://localhost:11434
# OLLAMA_MODEL_DEFAULT=llama-3.1:8b-instruct
# OLLAMA_MODEL_CODER=qwen2.5-coder:7b

# --- common ---
AI_REQUEST_TIMEOUT_MS=20000
AI_DAILY_EUR_CAP=10
# Pricing for the cost estimator that drives the cap. Defaults assume
# gpt-5.4-mini list price; override once invoiced for real.
AI_PRICE_PER_M_IN_EUR=0.25
AI_PRICE_PER_M_OUT_EUR=1.0
```

**Auth** : the `azure-foundry` provider uses **Managed Identity** (no API
keys). The Foundry project endpoint expects an access token with audience
`https://ai.azure.com/.default` (NOT `cognitiveservices.azure.com/.default`
— using the wrong audience returns `HTTP 401: audience is incorrect`).
The MI must hold the **`Azure AI User`** role on the Foundry Project (cf.
`docs/maintainer-todo.md` § "Assigner le rôle Azure AI User").

The full prompt and response must never be logged at info level — they
contain sanitized but workspace-identifying metadata. Audit logs record
`{ tenant, task, provider, model, latencyMs, tokens, ok }` only.

## Deployment patterns

### Pattern A — self-hosted, 100% local (recommended for regulated buyers)

```
┌────────────────────────────────────┐
│  Single host (Docker Compose / k8s)│
│  ┌──────────────────────────────┐  │
│  │ keren-analytics               │  │  AI_PROVIDER=ollama
│  │ Node 22, Express             │  │  OLLAMA_HOST=http://ollama:11434
│  └────────────┬─────────────────┘  │
│               │                    │
│  ┌────────────▼─────────────────┐  │
│  │ ollama (sidecar)             │  │  models pre-pulled at image build
│  │ phi-3.5-mini, qwen2.5-coder  │  │  GPU passthrough optional
│  └──────────────────────────────┘  │
└────────────────┬───────────────────┘
                 │
                 │ outbound: only to user's Azure tenant (telemetry queries)
                 ▼
        Azure ARM + Log Analytics
```

Shipped as `docker-compose.local-ai.yml` alongside the existing
`docker-compose.yml`. Models pre-pulled at image build to avoid cold-start
download timeouts. CPU-only is feasible for `mappingAnalysis` and `narration`
(latency 5-20s); `nlToKql` is painful without a GPU and should fall back to
`none` if no GPU is detected.

### Pattern B — in-tenant Azure (for Azure-native customers)

```
Customer's Azure tenant
┌──────────────────────────────────────────┐
│  ┌─────────────┐    ┌──────────────────┐ │
│  │ App Service │───▶│ Azure OpenAI     │ │  AI_PROVIDER=azure-openai
│  │ (this app)  │    │ (private EP)     │ │  no-train contract
│  └─────────────┘    └──────────────────┘ │
└──────────────────────────────────────────┘
```

Best quality. The "data stays in your tenant" promise holds when Azure
OpenAI is configured with a private endpoint and the customer's no-train
contract: data does not leave the tenant's Azure perimeter, and is not used
to train Microsoft's models.

### Pattern C — no AI (default OSS)

`AI_PROVIDER=none`. Everything still works; AI surfaces show deterministic
fallback content (alias-based mapping, canned narration, static prompt
cards). Zero infra cost. This is the pre-launch demo configuration.

## Quality expectations

We don't promise GPT-4 quality on the local provider. Realistic baseline:

| Task | Local 7-8B | Azure OpenAI gpt-4o-mini | Notes |
|---|---|---|---|
| `mappingAnalysis` | ~90% | 100% | Structured reasoning over a small JSON. Small models hold up. |
| `narration` | ~85% | 100% | Tone matters; local copy reads more "AI-ish" but is acceptable. |
| `nlToKql` | ~60-75% | 100% | Hardest task. KQL is uncommon in training data. Mitigations below. |
| `instrumentation` | ~80% | 100% | Snippet generation is well-trodden ground for coder models. |

Mitigations for local `nlToKql` (the worst case):

- Inject 5-10 hand-written few-shot examples into the system prompt
- Tighten the JSON schema (table whitelist, chart enum) so invalid outputs
  are rejected upstream of the user
- The preview-then-run pattern in
  [`ai-natural-language-queries.md`](backlog/ai-natural-language-queries.md)
  catches drift before execution — already specced
- Hard fallback to `none` (UI message: "I couldn't translate this — try
  rewording or pick a built-in chart") on two consecutive schema failures

## Trade-offs vs the original spec

| | Original (Azure OpenAI only) | This proposal |
|---|---|---|
| Privacy story | "Azure OpenAI no-train, in-tenant" | "100% local available; Azure OpenAI optional" |
| Reach | Azure OpenAI customers | Azure + regulated/EU + self-hosters |
| OSS demo cost | LLM-per-visitor, capped | Fits inside the launch § 7 budget on Ollama |
| Code complexity | Single API call | One factory + 2-3 providers (~150-250 LoC each) |
| Time to first AI feature | 0.5 day | +1 day for the abstraction |

The 1-day overhead is amortized across four consumers and pays for itself the
first time we change LLM provider, change pricing tier, or add a regulated
tenant who can't use Azure OpenAI.

## Phase alignment

- **Pre-launch** (`docs/launch-strategy.md` § 4): ship the abstraction with
  `none` only. The pre-launch AI work (Layer 1 of mapping, canned narration
  on the demo) does not need a real LLM. Cost: included in the existing 80h
  budget.
- **Phase 3 (post-traction gate)**: ship `ollama` as the recommended
  self-host default. Add `docker-compose.local-ai.yml`. This is the moment
  the "100% local AI" bullet becomes a real README selling point.
- **Phase 3+ (paid hosted SaaS)**: `azure-openai` becomes the hosted-demo
  default with per-tenant cost cap.
- **Phase 4 (multi-cloud)**: add `bedrock` and `vertex` adapters parallel to
  the cloud provider work.

## Implementation scope

| Component | Estimate | Depends on |
|---|---|---|
| `core/aiClient.js` (factory + interface) | 0.5 day | none |
| `core/aiSanitize.js` (PII / value scrubbing) | 0.5 day | `schemaProfile` |
| `ai/noneProvider.js` (no-op + fallback hook) | 0.25 day | `aiClient` |
| `ai/ollamaProvider.js` (HTTP, JSON mode, retry, timeout) | 1 day | `aiClient` |
| `ai/azureOpenAIProvider.js` (existing path wired through factory) | 0.5 day | `aiClient` |
| Per-task fallback paths (deterministic copy assembly) | 1 day | `promptGenerator`, `recommendations` (partial) |
| `docker-compose.local-ai.yml` + pre-pulled models | 0.5 day | `ollamaProvider` |
| Tests (mocked transport, fallback paths, schema validation, sanitizer) | 1 day | all providers |
| **Total — minimum to ship** | **~4-5 days** | |

The four AI surfaces each consume this client, so the abstraction cost is
amortized.

## What this is NOT

- **Not a model serving infrastructure.** Hosting Ollama is the user's
  responsibility (sidecar in compose, dedicated GPU node in k8s). We
  document but don't operate it.
- **Not an agent framework.** Each AI call is single-shot (request → JSON →
  done). No multi-turn, no tool calling, no autonomous loops. Dashboards
  never wait on AI.
- **Not a way around the per-feature security guardrails.** `nlToKql` still
  requires the preview-then-run pattern, table whitelist, time-range
  injection, etc. — see
  [`ai-natural-language-queries.md`](backlog/ai-natural-language-queries.md).

## Open questions

- Ship a fourth `openai-compatible` provider on day one? Folds easily into
  `ollamaProvider` since the wire protocol is similar. Probably yes.
- For the public demo: `none` (free, fast, canned copy) vs `ollama` on a
  small instance (showcases the AI angle, costs ~30 €/mo)? Probably `none`
  with server-side canned narration; revisit post-launch if the demo
  feels lifeless.
- Should Ollama models be auto-pulled on first start, or required to be
  pre-pulled? Auto-pull is friendlier but downloads ~5 GB and trips the
  health check.
- Rate limit applies per tenant for hosted; per IP for self-host (no tenant
  boundary). Where do we enforce — `aiClient` middleware or per-route?
- JSON-schema strictness: too tight, small models fail constantly; too
  loose, the validation guard becomes meaningless. Needs empirical tuning
  per task.

## References

- [`src/providers/factory.js`](../src/providers/factory.js) — pattern this follows
- [`docs/architecture-multicloud.md`](architecture-multicloud.md) — sibling
  abstraction, same factory shape
- [`docs/architecture-auth.md`](architecture-auth.md) — for the
  decoupled-auth context that informs how providers are configured
- [`docs/backlog/ai-environment-analysis.md`](backlog/ai-environment-analysis.md)
  — first consumer of this client
- [`docs/backlog/ai-setup-wizard.md`](backlog/ai-setup-wizard.md),
  [`ai-natural-language-queries.md`](backlog/ai-natural-language-queries.md),
  [`ai-instrumentation-assistant.md`](backlog/ai-instrumentation-assistant.md)
  — other consumers
- Ollama — https://ollama.com (canonical local runtime)
- Microsoft Phi-3.5 — https://huggingface.co/microsoft/Phi-3.5-mini-instruct
- Qwen 2.5 Coder — https://qwenlm.github.io/blog/qwen2.5-coder
