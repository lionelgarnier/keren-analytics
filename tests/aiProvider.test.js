import test from "node:test";
import assert from "node:assert/strict";

import { assertAiProvider } from "../src/ai/interface.js";
import { createNoneProvider } from "../src/ai/noneProvider.js";
import { createAzureFoundryProvider } from "../src/ai/azureFoundry.js";
import { __resetAiProviderForTests, getAiProvider } from "../src/ai/factory.js";

test("noneProvider satisfies the AI provider contract and returns null", async () => {
  const provider = createNoneProvider();
  assertAiProvider(provider, "none");
  assert.equal(provider.name, "none");
  assert.deepEqual(provider.capabilities(), {
    mappingAnalysis: false,
    narration: false,
    nlToKql: false,
    instrumentation: false,
  });
  const result = await provider.generate({
    task: "mappingAnalysis",
    systemPrompt: "x", userPrompt: "y", schema: {}, schemaName: "z",
  });
  assert.equal(result, null);
});

test("azureFoundryProvider throws when endpoint or deployment is missing", () => {
  assert.throws(() => createAzureFoundryProvider({ endpoint: "", deployment: "x" }), /endpoint is required/);
  assert.throws(() => createAzureFoundryProvider({ endpoint: "https://x", deployment: "" }), /deployment is required/);
});

test("azureFoundryProvider satisfies the AI provider contract", () => {
  const provider = createAzureFoundryProvider({
    endpoint: "https://example.invalid/openai/v1/responses",
    deployment: "gpt-5.4-mini",
  });
  assertAiProvider(provider, "azure-foundry");
  assert.equal(provider.name, "azure-foundry");
  assert.equal(provider.capabilities().mappingAnalysis, true);
  assert.equal(provider.capabilities().narration, false);
});

test("factory returns the noneProvider when AI_PROVIDER=none (test default)", () => {
  __resetAiProviderForTests();
  const provider = getAiProvider();
  assert.equal(provider.name, "none");
  // Cached across calls.
  assert.strictEqual(getAiProvider(), provider);
});

test("assertAiProvider rejects malformed providers", () => {
  assert.throws(() => assertAiProvider(null, "x"), /did not return a provider object/);
  assert.throws(() => assertAiProvider({ name: "x" }, "x"), /missing required member/);
  assert.throws(
    () => assertAiProvider({ name: "x", capabilities: "not-a-fn", generate: () => {} }, "x"),
    /must be functions/
  );
});
