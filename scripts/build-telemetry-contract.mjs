#!/usr/bin/env node
/**
 * Regenerate the committed telemetry-contract snapshots (ADR 0006, Phase 0).
 *
 * The live endpoints (/.well-known/telemetry-contract.json, /llms.txt) are
 * served dynamically from src/core/telemetryContract.js — these files are a
 * discoverable, version-controlled copy for static hosts and the docs bundle.
 * `tests/telemetryContract.test.js` fails if they fall out of sync, so run
 * this after changing signals, the mapping aliases, or the prompt templates.
 *
 *   npm run build:contract
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTelemetryContract,
  renderContractMarkdown,
} from "../src/core/telemetryContract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "public");
const wellKnownDir = resolve(publicDir, ".well-known");

const contract = buildTelemetryContract();

mkdirSync(wellKnownDir, { recursive: true });
const jsonPath = resolve(wellKnownDir, "telemetry-contract.json");
const txtPath = resolve(publicDir, "llms.txt");

writeFileSync(jsonPath, JSON.stringify(contract, null, 2) + "\n");
writeFileSync(txtPath, renderContractMarkdown(contract) + "\n");

console.log(`telemetry contract version ${contract.contractVersion}`);
console.log(`  wrote ${jsonPath}`);
console.log(`  wrote ${txtPath}`);
