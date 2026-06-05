import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";

import { app } from "../src/server.js";
import { buildAiDisclosure } from "../src/ai/disclosure.js";
import {
  __resetForTests,
  getResourceAiOptOut,
  setResourceAiOptOut,
} from "../src/core/metadataStore.js";

function withFreshDb() {
  __resetForTests();
  return () => __resetForTests();
}

async function authedAgent(tenantSuffix) {
  const agent = supertest.agent(app);
  const tenant = `aidisc-${tenantSuffix}-${process.pid}-${Date.now()}`;
  await agent.get(`/auth/login?tenant=${tenant}`).redirects(5).expect(200);
  return { agent, tenant };
}

// ── Disclosure module (pure) ──────────────────────────────────────────────

test("buildAiDisclosure: none provider offers only the deterministic option", () => {
  const d = buildAiDisclosure({ aiProvider: "none" });
  assert.equal(d.provider, "none");
  assert.equal(d.configured, false);
  assert.equal(d.available.length, 1);
  assert.equal(d.available[0].optOut, true);
  assert.equal(d.available[0].outbound, false);
  // The privacy contract is always present so the popover can render it.
  assert.ok(d.dataContract.sent.length > 0);
  assert.ok(d.dataContract.never.length > 0);
});

test("buildAiDisclosure: azure-foundry exposes provider, region and outbound flag", () => {
  const d = buildAiDisclosure({
    aiProvider: "azure-foundry",
    azureFoundryEndpoint: "https://proj.services.ai.azure.com/api/projects/proj/openai/v1/responses",
    azureFoundryDeployment: "gpt-5.4-mini",
    azureFoundryRegion: "France Central (UE)",
  });
  assert.equal(d.configured, true);
  // First option is the AI default, second is the opt-out.
  assert.equal(d.available[0].optOut, false);
  assert.equal(d.available[0].outbound, true);
  assert.equal(d.available[0].provider, "Azure OpenAI");
  assert.equal(d.available[0].location, "France Central (UE)");
  assert.equal(d.available[1].optOut, true);
});

test("buildAiDisclosure: foundry selected but unconfigured falls back to deterministic-only", () => {
  const d = buildAiDisclosure({ aiProvider: "azure-foundry", azureFoundryEndpoint: "", azureFoundryDeployment: "" });
  assert.equal(d.configured, false);
  assert.equal(d.available.length, 1);
  assert.equal(d.available[0].optOut, true);
});

// ── Per-resource opt-out store ────────────────────────────────────────────

test("setResourceAiOptOut round-trips and is isolated per resource", () => {
  const restore = withFreshDb();
  try {
    const tenant = `store-${process.pid}-${Date.now()}`;
    assert.equal(getResourceAiOptOut(tenant, "res-a"), false);
    setResourceAiOptOut(tenant, "res-a", true);
    assert.equal(getResourceAiOptOut(tenant, "res-a"), true);
    // A different resource under the same tenant is unaffected.
    assert.equal(getResourceAiOptOut(tenant, "res-b"), false);
    // Flipping back works.
    setResourceAiOptOut(tenant, "res-a", false);
    assert.equal(getResourceAiOptOut(tenant, "res-a"), false);
  } finally { restore(); }
});

// ── Disclosure endpoint ───────────────────────────────────────────────────

test("GET /api/ai/disclosure reflects the configured provider (none in tests)", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("endpoint");
    const res = await agent.get("/api/ai/disclosure").expect(200);
    assert.equal(res.body.provider, "none");
    assert.equal(res.body.configured, false);
    assert.equal(res.body.optOut, false);
    assert.ok(Array.isArray(res.body.available));
    assert.ok(res.body.dataContract.sent.length > 0);
  } finally { restore(); }
});

test("GET /api/ai/disclosure?resourceId reports a prior opt-out choice", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("endpoint-pref");
    await agent.get("/azure/discover").expect(200);
    const state = await agent.get("/api/setup/state").expect(200);
    const resourceId = state.body.selectedResource.resourceId;
    await agent.post("/api/setup/ai-preference").send({ resourceId, optOut: true }).expect(200);
    const res = await agent.get(`/api/ai/disclosure?resourceId=${encodeURIComponent(resourceId)}`).expect(200);
    assert.equal(res.body.optOut, true);
  } finally { restore(); }
});

// ── ai-preference endpoint validation ─────────────────────────────────────

test("POST /api/setup/ai-preference validates its body", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("validate");
    const noId = await agent.post("/api/setup/ai-preference").send({ optOut: true });
    assert.equal(noId.status, 400);
    assert.equal(noId.body.error, "MISSING_RESOURCE_ID");

    const badFlag = await agent.post("/api/setup/ai-preference").send({ resourceId: "r", optOut: "yes" });
    assert.equal(badFlag.status, 400);
    assert.equal(badFlag.body.error, "INVALID_OPT_OUT");
  } finally { restore(); }
});

// ── Opt-out threads through the scan ──────────────────────────────────────

test("scan stream marks the AI step disabled when the resource opted out", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("optout-on");
    await agent.get("/azure/discover").expect(200);
    const state = await agent.get("/api/setup/state").expect(200);
    const resourceId = state.body.selectedResource.resourceId;
    await agent.post("/api/setup/ai-preference").send({ resourceId, optOut: true }).expect(200);

    const res = await agent.get("/api/setup/scan/stream").buffer(true).expect(200);
    const aiBlock = res.text
      .split("\n\n")
      .find((b) => b.includes('"step":"ai"'));
    assert.ok(aiBlock, "stream must include an ai step");
    const payload = JSON.parse(aiBlock.split("\ndata: ")[1]).payload;
    assert.equal(payload.disabled, true);
    assert.equal(payload.degraded, true);
  } finally { restore(); }
});

test("scan stream leaves the AI step enabled by default (no opt-out)", async () => {
  const restore = withFreshDb();
  try {
    const { agent } = await authedAgent("optout-off");
    const res = await agent.get("/api/setup/scan/stream").buffer(true).expect(200);
    const aiBlock = res.text
      .split("\n\n")
      .find((b) => b.includes('"step":"ai"'));
    assert.ok(aiBlock, "stream must include an ai step");
    const payload = JSON.parse(aiBlock.split("\ndata: ")[1]).payload;
    assert.equal(payload.disabled, false);
  } finally { restore(); }
});
