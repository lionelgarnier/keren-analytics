import { buildReadinessReport } from "./readiness.js";
import { buildSchemaProfile } from "./schemaProfile.js";
import { buildSchemaScan } from "./schemaScan.js";
import { persistScan, getLatestScan } from "./scanStore.js";
import { getOrComputeMapping } from "./aiMappingService.js";
import { getMappingForScan } from "./mappingStore.js";
import { buildMapping, mergeWithValidation } from "./mapping.js";
import { getActiveValidation } from "./validationStore.js";
import { buildOverviewDashboard } from "./dashboard.js";
import { resolveTimeRange, toKqlDatetime } from "./timeRange.js";
import { loadKqlTemplate, renderTemplate } from "./kql.js";
import { logStateTransition, getTenant, updateTenant, getResourceAiOptOut } from "./metadataStore.js";
import { PipelineStates } from "./stateMachine.js";

/*
 * Two distinct phases — keep them separate, never run config twice.
 *
 *   runSetupScan()       CONFIG — done once (setup wizard + "Re-scan").
 *                        Discovers, probes readiness, profiles the schema,
 *                        scans, calls the LLM. Persists a `scans` row that
 *                        is a complete config snapshot (schemaProfile +
 *                        readinessReport live inside the scan payload).
 *
 *   runOverviewPipeline() RENDER — done on every dashboard load.
 *                        Reuses the latest config snapshot, runs ONLY the
 *                        dashboard KQL queries. No scan, no LLM call, no
 *                        readiness/schema probing. Lazily triggers
 *                        runSetupScan() exactly once if no snapshot exists.
 */

/**
 * Resolve the resource the pipeline should target. Auto-selects when the
 * tenant holds exactly one App Insights; returns `requiresSelection` when
 * a choice is needed. Shared by both phases.
 */
async function resolveSelectedResource(tenantId, azureClient) {
  const tenant = getTenant(tenantId);
  if (tenant.selectedResource) return { selectedResource: tenant.selectedResource };

  const discovered = await azureClient.discoverResources(tenantId);
  if (discovered.length === 1) {
    const selectedResource = { ...discovered[0], selectedAt: new Date().toISOString() };
    updateTenant(tenantId, { selectedResource });
    logStateTransition(tenantId, {
      state: PipelineStates.SELECTING_RESOURCE,
      detail: "auto-selected",
    });
    return { selectedResource };
  }
  logStateTransition(tenantId, {
    state: PipelineStates.SELECTING_RESOURCE,
    detail: "requires-selection",
  });
  return { requiresSelection: true, resources: discovered };
}

/**
 * CONFIG phase. Runs the expensive one-time work — readiness probes,
 * schema profiling, the schema scan, and the LLM mapping call — and
 * persists a `scans` row carrying the full config snapshot. Never builds
 * the dashboard. Called by the setup wizard (`/api/setup/scan*`) and,
 * lazily, by runOverviewPipeline when no snapshot exists yet.
 */
// In-process single-flight for the CONFIG phase. Two concurrent scans for the
// same tenant (double-click, client retry, /scan + /scan/stream racing) would
// each write a scan row and fire a SEPARATE billable LLM call, neither seeing
// the other's cache. Coalescing them onto one promise makes the duplicate wait
// and share the result. Keyed by tenant (a tenant scans its selected resource,
// so this is effectively per-resource for the concurrency that matters).
const inflightScans = new Map();

export async function runSetupScan(args) {
  const key = args?.tenantId;
  if (key && inflightScans.has(key)) {
    return inflightScans.get(key);
  }
  const promise = runSetupScanImpl(args);
  if (key) {
    inflightScans.set(key, promise);
    promise.finally(() => {
      if (inflightScans.get(key) === promise) inflightScans.delete(key);
    });
  }
  return promise;
}

async function runSetupScanImpl({ tenantId, azureClient, onProgress, onStep }) {
  const progress = typeof onProgress === "function" ? onProgress : () => {};
  // F4 streaming: structured per-stage events the setup wizard renders as
  // live previews. No-op when the caller doesn't pass one.
  const emitStep = typeof onStep === "function" ? onStep : () => {};
  const now = new Date();

  logStateTransition(tenantId, { state: PipelineStates.DISCOVERING_RESOURCES });
  progress("Discovering resources", 0);
  const resolved = await resolveSelectedResource(tenantId, azureClient);
  if (resolved.requiresSelection) {
    return { requiresSelection: true, resources: resolved.resources };
  }
  const selectedResource = resolved.selectedResource;

  logStateTransition(tenantId, { state: PipelineStates.CHECKING_ACCESS });
  progress("Checking workspace access", 0.05);
  const access = await azureClient.checkAccess(selectedResource.workspaceId);
  if (!access.ok) {
    logStateTransition(tenantId, { state: PipelineStates.NO_ACCESS, detail: access.reason });
    return { error: "NO_ACCESS", message: access.reason || "Missing permissions for workspace." };
  }

  emitStep("connect", {
    resourceName: selectedResource.appInsightsName || selectedResource.name || null,
    subscriptionId: selectedResource.subscriptionId || null,
    resourceGroup: selectedResource.resourceGroup || null,
    workspaceId: selectedResource.workspaceId || null,
  });

  // ── Readiness probes (24h window, widen to 7d if empty / low-confidence) ──
  let readinessWindow = { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now };
  logStateTransition(tenantId, { state: PipelineStates.READINESS_PROBES });
  progress("Running readiness probes", 0.1);
  const readinessTemplate = loadKqlTemplate("readiness-probes");
  const readinessResult = await azureClient.queryWorkspace({
    resourceId: selectedResource.resourceId,
    workspaceId: selectedResource.workspaceId,
    kql: renderTemplate(readinessTemplate, {
      timeStart: toKqlDatetime(readinessWindow.start),
      timeEnd: toKqlDatetime(readinessWindow.end),
    }),
    queryName: "readiness",
    timeRangeKey: "24h",
  });
  let readinessReport = buildReadinessReport({
    probeResult: extractRows(readinessResult)[0] || {},
    window: readinessWindow,
  });

  if (readinessReport.overallStatus === "EMPTY" || readinessReport.confidence < 0.4) {
    readinessWindow = { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now };
    const fallbackResult = await azureClient.queryWorkspace({
      resourceId: selectedResource.resourceId,
      workspaceId: selectedResource.workspaceId,
      kql: renderTemplate(readinessTemplate, {
        timeStart: toKqlDatetime(readinessWindow.start),
        timeEnd: toKqlDatetime(readinessWindow.end),
      }),
      queryName: "readinessFallback",
      timeRangeKey: "7d",
    });
    const fallbackReport = buildReadinessReport({
      probeResult: extractRows(fallbackResult)[0] || {},
      window: readinessWindow,
    });
    if (fallbackReport.overallStatus !== "EMPTY") readinessReport = fallbackReport;
  }
  updateTenant(tenantId, { readinessReport });

  // ── Schema profiling (fixed 30-day window) ──
  logStateTransition(tenantId, { state: PipelineStates.SCHEMA_PROFILING });
  progress("Profiling schema", 0.2);
  const schemaTimeParams = {
    timeStart: toKqlDatetime(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
    timeEnd: toKqlDatetime(now),
  };
  const tablesResult = await azureClient.queryWorkspace({
    resourceId: selectedResource.resourceId,
    workspaceId: selectedResource.workspaceId,
    kql: renderTemplate(loadKqlTemplate("schema-tables"), schemaTimeParams),
    queryName: "schemaTables",
    timeRangeKey: "30d",
  });
  const customResult = await azureClient.queryWorkspace({
    resourceId: selectedResource.resourceId,
    workspaceId: selectedResource.workspaceId,
    kql: renderTemplate(loadKqlTemplate("schema-custom-dimensions"), schemaTimeParams),
    queryName: "schemaCustomDimensions",
    timeRangeKey: "30d",
  });
  const schemaProfile = buildSchemaProfile({
    tablesResult: extractRows(tablesResult),
    customDimensionsResult: extractRows(customResult),
  });
  updateTenant(tenantId, { schemaProfile });

  // ── Schema scan — persisted as the config snapshot ──
  logStateTransition(tenantId, { state: PipelineStates.SCHEMA_SCAN });
  progress("Scanning schema enrichment", 0.35);
  const scan = await runSchemaScan({
    azureClient,
    selectedResource,
    schemaTimeParams,
    schemaProfile,
    readinessReport,
  });
  let scanId = null;
  let scanPersisted = false;
  if (scan) {
    try {
      scanId = persistScan(tenantId, selectedResource.resourceId, scan).id;
      scanPersisted = true;
    } catch (error) {
      logStateTransition(tenantId, {
        state: PipelineStates.SCHEMA_SCAN,
        detail: `persist-failed: ${error.message}`,
      });
    }
  }

  // The scan's headline numbers are final here — stream them before the
  // (slower) AI call so the wizard fills in three steps at once.
  const deterministicMapping = buildMapping({ schemaProfile, readinessReport });
  if (scan) emitScanSteps(emitStep, scan, deterministicMapping);

  // ── AI mapping — cached per scan_id, so this is the only place the LLM
  //    is ever called. A dashboard render reuses this row, never re-calls.
  //    When the user opted this resource out of AI, no prompt is built and
  //    nothing leaves the box — getOrComputeMapping persists the
  //    deterministic fallback instead. ──
  logStateTransition(tenantId, { state: PipelineStates.AI_ANALYSIS });
  const aiOptOut = getResourceAiOptOut(tenantId, selectedResource.resourceId);
  progress(aiOptOut ? "Building deterministic mapping" : "AI mapping analysis", 0.55);
  let aiMapping = null;
  try {
    aiMapping = await getOrComputeMapping(tenantId, selectedResource.resourceId, {
      readinessReport,
      optOut: aiOptOut,
      // Hand the freshly-persisted scan directly so the mapping is computed for
      // THIS run's scan, not whatever getLatestScan returns (avoids mapping a
      // concurrent run's scan). If persist failed, scanId is null and we let
      // getOrComputeMapping fall back rather than map against a stale row.
      scanRow: scanPersisted && scanId != null ? { id: scanId, payload: scan } : undefined,
    });
    if (aiMapping?.degraded) {
      logStateTransition(tenantId, {
        state: PipelineStates.AI_ANALYSIS,
        detail: aiOptOut ? "ai-disabled-by-user" : `degraded: ${aiMapping.reason || "unknown"}`,
      });
    }
  } catch (error) {
    logStateTransition(tenantId, {
      state: PipelineStates.AI_ANALYSIS,
      detail: `ai-failed: ${error.message}`,
    });
  }

  const aiRecs = aiMapping?.proposals?.dashboard_recommendations || {};
  emitStep("ai", {
    degraded: !aiMapping || !!aiMapping.degraded,
    // Distinguishes a deliberate opt-out ("AI off") from an unexpected
    // degrade (quota/error) so the wizard can label the scan row honestly.
    disabled: aiOptOut,
    summary: aiMapping?.proposals?.summary || null,
    ready: (aiRecs.feature || []).length,
    needsInstrumentation: (aiRecs.hide || []).length,
  });

  logStateTransition(tenantId, { state: PipelineStates.MAPPING_BUILD });
  progress("Building data mapping", 0.9);
  const validation = getActiveValidation(tenantId, selectedResource.resourceId);
  const mapping = mergeWithValidation(deterministicMapping, validation);
  updateTenant(tenantId, { mapping });

  logStateTransition(tenantId, { state: PipelineStates.READY });
  progress("Done", 1);

  return {
    resources: [selectedResource],
    scanId,
    mappingId: aiMapping?.id || null,
    readinessReport,
    schemaProfile,
    mapping,
    aiMapping,
  };
}

/**
 * RENDER phase. Runs on every dashboard load. Reuses the persisted config
 * snapshot (latest `scans` row for the resource) and runs ONLY the
 * dashboard KQL queries via buildOverviewDashboard. No new scan, no LLM
 * call, no readiness/schema re-probe — and crucially, no config: this
 * phase never runs setup work.
 *
 * If no config snapshot exists, the resource simply isn't set up yet —
 * we return `SETUP_REQUIRED` so the caller routes the user to the setup
 * wizard. Config belongs to the wizard, never to a dashboard load.
 */
export async function runOverviewPipeline({
  tenantId,
  rangeKey,
  azureClient,
  cacheTtlMs,
  customStart,
  customEnd,
  onProgress,
  onCard,
  azureMode,
}) {
  const progress = typeof onProgress === "function" ? onProgress : () => {};
  const emitCard = typeof onCard === "function" ? onCard : () => {};
  const timeRange = resolveTimeRange(rangeKey, customStart, customEnd);

  logStateTransition(tenantId, { state: PipelineStates.DISCOVERING_RESOURCES });
  progress("Loading dashboard", 0);
  const resolved = await resolveSelectedResource(tenantId, azureClient);
  if (resolved.requiresSelection) {
    return { requiresSelection: true, resources: resolved.resources };
  }
  const selectedResource = resolved.selectedResource;

  logStateTransition(tenantId, { state: PipelineStates.CHECKING_ACCESS });
  const access = await azureClient.checkAccess(selectedResource.workspaceId);
  if (!access.ok) {
    logStateTransition(tenantId, { state: PipelineStates.NO_ACCESS, detail: access.reason });
    return { error: "NO_ACCESS", message: access.reason || "Missing permissions for workspace." };
  }

  // RENDER only — never configures. The config snapshot is produced once
  // by the setup wizard (runSetupScan). If it's missing, the resource
  // isn't set up: return SETUP_REQUIRED so the caller sends the user to
  // the wizard, rather than silently doing config work on a page load.
  const scan = getLatestScan(tenantId, selectedResource.resourceId);
  if (!scan?.payload?.schemaProfile || !scan?.payload?.readinessReport) {
    return { error: "SETUP_REQUIRED", message: "This resource has not been configured yet." };
  }

  const schemaProfile = scan.payload.schemaProfile;
  const readinessReport = scan.payload.readinessReport;
  // Keep the tenant scratch (read by /readiness, /recommendations, /prompts)
  // in sync with the resource currently being rendered.
  updateTenant(tenantId, { readinessReport, schemaProfile });

  // Persisted AI mapping for this scan — a DB read, never an LLM call.
  const aiMapping = getMappingForScan(tenantId, scan.id);

  logStateTransition(tenantId, { state: PipelineStates.MAPPING_BUILD });
  const deterministicMapping = buildMapping({ schemaProfile, readinessReport });
  const validation = getActiveValidation(tenantId, selectedResource.resourceId);
  const mapping = mergeWithValidation(deterministicMapping, validation);
  updateTenant(tenantId, { mapping });

  logStateTransition(tenantId, { state: PipelineStates.DASHBOARD_BUILD });
  progress("Building dashboard", 0);
  const dashboard = await buildOverviewDashboard({
    tenantId,
    resourceId: selectedResource.resourceId,
    workspaceId: selectedResource.workspaceId,
    mapping,
    aiMapping,
    schemaProfile,
    timeRange,
    cacheTtlMs,
    azureClient,
    readinessReport,
    onProgress: (label, pct) => progress(label, pct),
    onCard: (name, data) => emitCard(name, data),
    azureMode,
  });

  logStateTransition(tenantId, { state: PipelineStates.CACHING_RESULTS });
  logStateTransition(tenantId, { state: PipelineStates.READY });
  progress("Done", 1);

  return {
    resources: [selectedResource],
    readinessReport,
    schemaProfile,
    mapping,
    dashboard,
  };
}

/**
 * Run the three F2 enrichment queries in parallel and assemble the
 * scan payload. Any single query failing degrades that piece to an
 * empty list rather than failing the whole pipeline — the dashboard
 * doesn't depend on the scan, only the wizard / AI surface does.
 */
async function runSchemaScan({
  azureClient,
  selectedResource,
  schemaTimeParams,
  schemaProfile,
  readinessReport,
}) {
  async function fetchRows(templateName, queryName) {
    try {
      const tpl = loadKqlTemplate(templateName);
      const kql = renderTemplate(tpl, schemaTimeParams);
      const result = await azureClient.queryWorkspace({
        resourceId: selectedResource.resourceId,
        workspaceId: selectedResource.workspaceId,
        kql,
        queryName,
        timeRangeKey: "30d",
      });
      return extractRows(result);
    } catch {
      return [];
    }
  }

  const [eventVolumes, customDimensionSamples, timestampSpan] = await Promise.all([
    fetchRows("event-volumes", "eventVolumes"),
    fetchRows("custom-dimension-samples", "customDimensionSamples"),
    fetchRows("timestamp-span", "timestampSpan"),
  ]);

  return buildSchemaScan({
    schemaProfile,
    readinessReport,
    eventVolumes,
    customDimensionSamples,
    timestampSpan,
  });
}

function extractRows(result) {
  if (!result || !result.tables || result.tables.length === 0) return [];
  const table = result.tables[0];
  const columns = table.columns.map((col) => col.name);
  return table.rows.map((row) => {
    const obj = {};
    columns.forEach((name, index) => {
      obj[name] = row[index];
    });
    return obj;
  });
}

/**
 * F4 streaming — push the three "scan landed" wizard steps with their
 * headline numbers. Pure transform over the assembled scan; the wizard
 * renders each as a live preview under its scanning-log row. Identity
 * coverage uses the deterministic mapping (the AI merge happens later,
 * but the per-field "resolved?" verdict is stable enough for a preview).
 */
const CANONICAL_IDENTITY_FIELDS = [
  "canonicalUserId",
  "canonicalSessionId",
  "canonicalPagePath",
  "canonicalReferrer",
];

function emitScanSteps(emitStep, scan, deterministicMapping) {
  const cds = scan.customDimensions || [];
  const cdTables = new Set(cds.map((c) => c.tableName).filter(Boolean));
  emitStep("customDimensions", {
    keyCount: cds.length,
    tableCount: cdTables.size,
    sampleKeys: cds.slice(0, 8).map((c) => c.keyName).filter(Boolean),
  });

  const events = scan.eventNames || [];
  const totalEvents = events.reduce((sum, e) => sum + (Number(e.count) || 0), 0);
  emitStep("eventVolumes", {
    totalEvents,
    eventTypeCount: events.length,
    tableCount: Object.values(scan.tables || {}).filter(Boolean).length,
    topEvents: [...events]
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 3)
      .map((e) => ({ name: e.name, count: e.count || 0 })),
  });

  const fields = CANONICAL_IDENTITY_FIELDS.map((canonical) => ({
    canonical,
    resolved: !!deterministicMapping?.[canonical]?.expr,
  }));
  emitStep("identity", {
    fields,
    resolved: fields.filter((f) => f.resolved).length,
    total: fields.length,
    gapCount: (scan.gaps || []).length,
  });
}
