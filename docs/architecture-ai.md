# Architecture Decision: AI Provider & Privacy

## Status

DRAFT — proposed. No code yet. Implementation gated on the first AI surface
shipping (see `docs/launch-strategy.md` § 4 and § 11).

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
[`src/azure/client.js`](../src/azure/client.js) and the cloud provider pattern
in [`architecture-multicloud.md`](architecture-multicloud.md). All four AI
features call a single `aiClient` interface; the implementation is selected by
env var.

Three implementations at launch:

| Provider | Outbound traffic | Recommended for |
|---|---|---|
| `none` (default) | None | Anyone who hasn't decided yet. AI surfaces show deterministic fallback content. Always works. |
| `ollama` | LAN-only | Self-hosters, regulated buyers, EU-strict tenants. **Zero third-party AI exposure.** |
| `azure-openai` | To customer's Azure OpenAI | Azure-native customers who already have private endpoint + no-train contracts. Best quality. |

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
AI_PROVIDER=none|ollama|azure-openai

# --- AI_PROVIDER=ollama ---
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL_DEFAULT=llama-3.1:8b-instruct
OLLAMA_MODEL_CODER=qwen2.5-coder:7b
OLLAMA_MODEL_FAST=phi-3.5:mini

# --- AI_PROVIDER=azure-openai ---
AZURE_OPENAI_ENDPOINT=https://your-instance.openai.azure.com
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT_DEFAULT=gpt-4o-mini
AZURE_OPENAI_DEPLOYMENT_CODER=gpt-4o

# --- common ---
# Soft guard: if a provider call exceeds this, abort and use fallback.
AI_REQUEST_TIMEOUT_MS=15000
# Hard cap per tenant per hour.
AI_MAX_REQUESTS_PER_TENANT_HOUR=20
```

`AZURE_OPENAI_API_KEY` is a secret and must never be logged. The full
prompt and response also must never be logged at info level — they contain
sanitized but workspace-identifying metadata. Audit logs record
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

- [`src/azure/client.js`](../src/azure/client.js) — pattern this follows
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
