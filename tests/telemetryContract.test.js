import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTelemetryContract,
  renderContractMarkdown,
} from "../src/core/telemetryContract.js";
import { SIGNAL_WEIGHTS } from "../src/core/readinessScore.js";
import { ALIASES } from "../src/core/mapping.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "public");

describe("buildTelemetryContract", () => {
  it("has the expected top-level shape", () => {
    const c = buildTelemetryContract();
    assert.ok(c.contractVersion);
    assert.ok(c.generatedAt);
    assert.equal(c.product.url, "https://keren.run");
    assert.ok(Array.isArray(c.signals));
    assert.ok(Array.isArray(c.namingConventions));
    assert.ok(Array.isArray(c.instrumentationConfig));
    assert.ok(Array.isArray(c.stacks));
    assert.ok(Array.isArray(c.recipes));
  });

  it("contractVersion is deterministic and ignores generatedAt", () => {
    const a = buildTelemetryContract();
    const b = buildTelemetryContract();
    assert.equal(a.contractVersion, b.contractVersion);
    delete a.generatedAt;
    delete b.generatedAt;
    assert.deepEqual(a, b);
  });

  it("exposes every weighted signal except the degraded variant, with matching points", () => {
    const c = buildTelemetryContract();
    const expected = Object.keys(SIGNAL_WEIGHTS).filter((k) => k !== "userIdDegraded");
    const ids = c.signals.map((s) => s.id);
    assert.deepEqual([...ids].sort(), [...expected].sort());
    assert.equal(c.signals.some((s) => s.id === "userIdDegraded"), false);
    for (const s of c.signals) {
      assert.equal(s.points, SIGNAL_WEIGHTS[s.id].points, `points for ${s.id}`);
    }
  });

  it("maxScore equals the sum of non-degraded signal weights", () => {
    const c = buildTelemetryContract();
    const expected = Object.entries(SIGNAL_WEIGHTS).reduce(
      (sum, [k, w]) => (k === "userIdDegraded" ? sum : sum + w.points),
      0
    );
    assert.equal(c.scoring.maxScore, expected);
  });

  it("naming conventions mirror the mapping alias table", () => {
    const c = buildTelemetryContract();
    const fields = c.namingConventions.map((n) => n.canonicalField);
    assert.deepEqual([...fields].sort(), Object.keys(ALIASES).sort());
    for (const n of c.namingConventions) {
      assert.deepEqual(n.recognizedNames, ALIASES[n.canonicalField].exact);
      assert.equal(n.recommendedCustomDimensionName, ALIASES[n.canonicalField].exact[0]);
      assert.equal(n.recognizedNamePattern, ALIASES[n.canonicalField].pattern.source);
    }
  });

  it("ships one ready-to-paste prompt per signal recipe with no PII leakage hint", () => {
    const c = buildTelemetryContract();
    assert.ok(c.recipes.length >= 1);
    for (const r of c.recipes) {
      assert.ok(r.prompt.length > 0);
      assert.ok(r.signal && r.label);
    }
  });
});

describe("committed snapshots stay in sync (run `npm run build:contract`)", () => {
  it("public/.well-known/telemetry-contract.json matches the module", () => {
    const onDisk = JSON.parse(
      readFileSync(resolve(publicDir, ".well-known", "telemetry-contract.json"), "utf8")
    );
    const fresh = buildTelemetryContract();
    delete onDisk.generatedAt;
    delete fresh.generatedAt;
    assert.deepEqual(onDisk, fresh);
  });

  it("public/llms.txt matches the module", () => {
    const onDisk = readFileSync(resolve(publicDir, "llms.txt"), "utf8");
    assert.equal(onDisk, renderContractMarkdown() + "\n");
  });
});
