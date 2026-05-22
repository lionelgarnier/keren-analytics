import test from "node:test";
import assert from "node:assert/strict";
import { buildNarration } from "../src/core/narration.js";

const sampleDashboard = {
  kpis: {
    uniqueVisitors: 24500,
    sessions: 38200,
    avgResponseTimeMs: 320,
    p95ResponseTimeMs: 880,
    errorRate: 0.021,
  },
  charts: {
    campaignBreakdown: [
      { source: "google", medium: "cpc", campaign: "spring", visitors: 480 },
      { source: "linkedin", medium: "social", campaign: "ph", visitors: 310 },
    ],
    peakHours: [
      { dayIndex: 2, hour: 14, count: 1200 },
      { dayIndex: 3, hour: 10, count: 800 },
    ],
  },
};

const sampleMappingAuth = {
  canonicalUserId: { source: "user_AuthenticatedId" },
};

const sampleMappingCustom = {
  canonicalUserId: { source: 'tostring(customDimensions["uid"])' },
};

test("buildNarration: mock mode returns no badge", () => {
  const r = buildNarration({
    azureMode: "mock",
    dashboard: sampleDashboard,
    mapping: sampleMappingAuth,
    range: "7d",
  });
  assert.equal(r.enabled, true);
  assert.equal(r.mode, "mock");
  assert.equal(r.badge, null);
  assert.equal(r.headline, "Environment analysis");
  assert.match(r.tagline, /AI explains/i);
});

test("buildNarration: real mode adds preview badge when no AI mapping", () => {
  const r = buildNarration({
    azureMode: "real",
    dashboard: sampleDashboard,
    mapping: sampleMappingAuth,
    range: "7d",
  });
  assert.equal(r.mode, "preview");
  assert.match(r.badge, /Preview/i);
  assert.match(r.badge, /real LLM/i);
});

test("buildNarration: real mode + degraded AI keeps the preview badge", () => {
  const r = buildNarration({
    azureMode: "real",
    dashboard: sampleDashboard,
    mapping: sampleMappingAuth,
    range: "7d",
    aiMapping: { degraded: true, source: "deterministic", reason: "no provider" },
  });
  assert.equal(r.mode, "preview");
  assert.match(r.badge, /Preview/i);
});

test("buildNarration: real mode + non-degraded AI drops the preview badge and flips mode to 'ai'", () => {
  const r = buildNarration({
    azureMode: "real",
    dashboard: sampleDashboard,
    mapping: sampleMappingAuth,
    range: "7d",
    aiMapping: { degraded: false, source: "azure-foundry", proposals: { mapping_proposals: [] } },
  });
  assert.equal(r.mode, "ai");
  assert.equal(r.badge, null);
});

test("buildNarration: paragraph includes visitor + session counts and a source", () => {
  const r = buildNarration({
    azureMode: "mock",
    dashboard: sampleDashboard,
    mapping: sampleMappingAuth,
    range: "7d",
  });
  assert.match(r.paragraph, /25k|24k|24,5/);
  assert.match(r.paragraph, /38k/);
  assert.match(r.paragraph, /google/);
  assert.match(r.paragraph, /the last 7 days/);
});

test("buildNarration: peak hour mentions the day name and time", () => {
  const r = buildNarration({
    azureMode: "mock",
    dashboard: sampleDashboard,
    mapping: sampleMappingAuth,
    range: "7d",
  });
  assert.match(r.paragraph, /Wednesday/);
  assert.match(r.paragraph, /14:00/);
});

test("buildNarration: error rate above 3% triggers a warning sentence", () => {
  const r = buildNarration({
    azureMode: "mock",
    dashboard: { ...sampleDashboard, kpis: { ...sampleDashboard.kpis, errorRate: 0.045 } },
    mapping: sampleMappingAuth,
    range: "7d",
  });
  assert.match(r.paragraph, /4\.5%/);
  assert.match(r.paragraph, /above the 3% comfort threshold/);
});

test("buildNarration: error rate within band reads as healthy", () => {
  const r = buildNarration({
    azureMode: "mock",
    dashboard: sampleDashboard,
    mapping: sampleMappingAuth,
    range: "7d",
  });
  assert.match(r.paragraph, /healthy band/);
});

test("buildNarration: authenticated mapping reads as standard ID", () => {
  const r = buildNarration({
    azureMode: "mock",
    dashboard: sampleDashboard,
    mapping: sampleMappingAuth,
    range: "7d",
  });
  assert.match(r.paragraph, /standard authenticated ID/);
});

test("buildNarration: custom-dimension mapping names the key", () => {
  const r = buildNarration({
    azureMode: "mock",
    dashboard: sampleDashboard,
    mapping: sampleMappingCustom,
    range: "7d",
  });
  assert.match(r.paragraph, /'uid'/);
  assert.match(r.paragraph, /no authenticated user ID detected/);
});

test("buildNarration: empty dashboard falls back to a sober sentence", () => {
  const r = buildNarration({
    azureMode: "mock",
    dashboard: { kpis: { uniqueVisitors: 0, sessions: 0, errorRate: 0 }, charts: {} },
    mapping: {},
    range: "today",
  });
  assert.match(r.paragraph, /very little traffic/);
  assert.match(r.paragraph, /today/);
});

test("buildNarration: empty identity signals never claim visitor counts", () => {
  // dcountif() now yields 0 for an empty column, but even a stale `1` must
  // not be narrated as a real visitor figure — trust the readiness probe.
  const r = buildNarration({
    azureMode: "real",
    dashboard: {
      kpis: { uniqueVisitors: 1, sessions: 1, errorRate: 0.04 },
      charts: { peakHours: [{ dayIndex: 0, hour: 0, count: 0 }] },
    },
    mapping: sampleMappingAuth,
    range: "7d",
    readinessReport: {
      availableSignals: { userId: false, sessionId: false },
      probeCounts: { userAuthCount: 0 },
    },
  });
  assert.doesNotMatch(r.paragraph, /captured 1 visitors/);
  assert.match(r.paragraph, /not populated|unavailable/i);
  assert.match(r.paragraph, /Readiness/);
});

test("buildNarration: an empty user ID column is not called cohort-ready", () => {
  const r = buildNarration({
    azureMode: "real",
    dashboard: sampleDashboard,
    mapping: sampleMappingAuth,
    range: "7d",
    readinessReport: {
      availableSignals: { userId: false, sessionId: true },
      probeCounts: { userAuthCount: 0 },
    },
  });
  assert.doesNotMatch(r.paragraph, /suitable for cohort analysis/);
  assert.match(r.paragraph, /user ID column is empty/i);
});

test("buildNarration: a uniform peak-hours grid produces no peak sentence", () => {
  const flat = [];
  for (let h = 0; h < 24; h++) flat.push({ dayIndex: 0, hour: h, count: 1 });
  const r = buildNarration({
    azureMode: "mock",
    dashboard: { ...sampleDashboard, charts: { ...sampleDashboard.charts, peakHours: flat } },
    mapping: sampleMappingAuth,
    range: "7d",
  });
  assert.doesNotMatch(r.paragraph, /Traffic peaks on/);
});

test("buildNarration: never leaks unrendered template tokens", () => {
  for (const mode of ["mock", "real"]) {
    const r = buildNarration({
      azureMode: mode,
      dashboard: sampleDashboard,
      mapping: sampleMappingAuth,
      range: "30d",
    });
    assert.doesNotMatch(r.paragraph, /\{\{|\}\}/);
    assert.doesNotMatch(r.paragraph, /undefined|NaN|null/);
    assert.ok(r.paragraph.length >= 60, `paragraph too short: ${r.paragraph}`);
    assert.ok(r.paragraph.length <= 700, `paragraph too long: ${r.paragraph.length}`);
  }
});
