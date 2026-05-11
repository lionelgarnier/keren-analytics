/**
 * Azure AI Foundry provider — Track F3 (ADR 0005, addendum 2026-05-11).
 *
 * Calls the Foundry **project** Responses API:
 *   `https://<project>.services.ai.azure.com/api/projects/<project>/openai/v1/responses`
 *
 * Auth: Managed Identity in prod, `az` CLI token in dev — both handled
 * transparently by `DefaultAzureCredential`. Token audience is
 * `https://ai.azure.com/.default` (NOT `cognitiveservices.azure.com/.default`
 * — the project endpoint requires the Foundry audience; using the wrong
 * one returns 401 with an `audience is incorrect` message).
 *
 * Required role on the Foundry Project for the MI:
 *   `Azure AI User` (read + inference). Set manually for now — see
 *   `docs/maintainer-todo.md` § "Assigner le rôle Azure AI User".
 */
import {
  AzureCliCredential,
  ChainedTokenCredential,
  ManagedIdentityCredential,
} from "@azure/identity";

const TOKEN_SCOPE = "https://ai.azure.com/.default";

/**
 * Build an explicit credential chain that ignores `AZURE_CLIENT_ID` /
 * `AZURE_CLIENT_SECRET` env vars (those belong to the OAuth user app
 * registration, NOT the backend MI — `DefaultAzureCredential` would
 * otherwise pick them up via `EnvironmentCredential` and fail with a
 * "missing_tenant_id" error).
 *
 * Order matters: in prod, `IDENTITY_ENDPOINT` is set by Container Apps
 * → use `ManagedIdentityCredential` first (the MI's client ID comes
 * from `AZURE_FOUNDRY_CLIENT_ID` when set). In dev, that env var is
 * absent → fall through to `AzureCliCredential` immediately.
 *
 * We deliberately do NOT put MI first in dev: `ManagedIdentityCredential`
 * probes the IMDS endpoint and can hang for 30+ s on hosts without it.
 */
function buildCredential() {
  const miClientId = process.env.AZURE_FOUNDRY_CLIENT_ID || undefined;
  const credentials = [];
  if (process.env.IDENTITY_ENDPOINT || process.env.AZURE_FOUNDRY_CLIENT_ID) {
    credentials.push(
      new ManagedIdentityCredential(miClientId ? { clientId: miClientId } : undefined)
    );
  }
  credentials.push(new AzureCliCredential());
  return new ChainedTokenCredential(...credentials);
}

export function createAzureFoundryProvider({
  endpoint,
  deployment,
  requestTimeoutMs = 20000,
  credential,
} = {}) {
  if (!endpoint) {
    throw new Error("AzureFoundry provider: endpoint is required (set AZURE_FOUNDRY_ENDPOINT)");
  }
  if (!deployment) {
    throw new Error("AzureFoundry provider: deployment is required (set AZURE_FOUNDRY_DEPLOYMENT)");
  }

  const cred = credential || buildCredential();

  async function getAccessToken(abortSignal) {
    const { token } = await cred.getToken(TOKEN_SCOPE, { abortSignal });
    if (!token) {
      throw new Error("AzureFoundry: empty token from credential");
    }
    return token;
  }

  return {
    name: "azure-foundry",

    capabilities() {
      // F3 only wires mappingAnalysis. Narration / nlToKql / instrumentation
      // stay post-launch even though the same provider could serve them.
      return {
        mappingAnalysis: true,
        narration: false,
        nlToKql: false,
        instrumentation: false,
      };
    },

    async generate({ task, systemPrompt, userPrompt, schema, schemaName, abortSignal }) {
      if (task !== "mappingAnalysis") return null;

      const controller = new AbortController();
      const onAbort = () => controller.abort();
      if (abortSignal) {
        if (abortSignal.aborted) controller.abort();
        else abortSignal.addEventListener("abort", onAbort, { once: true });
      }
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

      const startedAt = Date.now();
      try {
        const token = await getAccessToken(abortSignal);
        const body = {
          model: deployment,
          instructions: systemPrompt,
          input: userPrompt,
          text: {
            format: {
              type: "json_schema",
              name: schemaName || "ai_response",
              schema,
              strict: true,
            },
          },
        };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`AzureFoundry: HTTP ${res.status} — ${text.slice(0, 300)}`);
        }

        const json = await res.json();
        const message = json?.output?.find((o) => o?.type === "message");
        const textPart = message?.content?.find((c) => c?.type === "output_text");
        const rawText = textPart?.text;
        if (!rawText) {
          throw new Error("AzureFoundry: response missing output_text");
        }

        let parsed;
        try {
          parsed = JSON.parse(rawText);
        } catch (err) {
          // Strict json_schema mode shouldn't produce invalid JSON. Returning
          // null lets the caller fall back instead of crashing the pipeline.
          return null;
        }

        const usage = json?.usage || {};
        return {
          output: parsed,
          usage: {
            inputTokens: Number(usage.input_tokens) || 0,
            outputTokens: Number(usage.output_tokens) || 0,
            totalTokens: Number(usage.total_tokens) || 0,
          },
          model: json?.model || deployment,
          latencyMs: Date.now() - startedAt,
        };
      } finally {
        clearTimeout(timeout);
        if (abortSignal) abortSignal.removeEventListener("abort", onAbort);
      }
    },
  };
}
