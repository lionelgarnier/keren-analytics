import { buildReadinessReport } from "./readiness.js";
import { buildSchemaProfile } from "./schemaProfile.js";
import { buildSchemaScan } from "./schemaScan.js";
import { persistScan } from "./scanStore.js";
import { getOrComputeMapping } from "./aiMappingService.js";
import { buildMapping, mergeWithValidation } from "./mapping.js";
import { getActiveValidation } from "./validationStore.js";
import { buildOverviewDashboard } from "./dashboard.js";
import { resolveTimeRange, toKqlDatetime } from "./timeRange.js";
import { loadKqlTemplate, renderTemplate } from "./kql.js";
import { logStateTransition, getTenant, updateTenant } from "./metadataStore.js";
import { PipelineStates } from "./stateMachine.js";

export async function runOverviewPipeline({
  tenantId,
  rangeKey,
  azureClient,
  cacheTtlMs,
  customStart,
  customEnd,
  onProgress,
  azureMode,
}) {
  const progress = typeof onProgress === "function" ? onProgress : () => {};
  const timeRange = resolveTimeRange(rangeKey, customStart, customEnd);
  const now = new Date();
  let readinessWindow = {
    start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    end: now,
  };
  logStateTransition(tenantId, { state: PipelineStates.DISCOVERING_RESOURCES });
  progress("Discovering resources", 0);

  const tenant = getTenant(tenantId);
  let selectedResource = tenant.selectedResource;

  if (!selectedResource) {
    const discovered = await azureClient.discoverResources(tenantId);
    if (discovered.length === 1) {
      selectedResource = { ...discovered[0], selectedAt: new Date().toISOString() };
      updateTenant(tenantId, { selectedResource });
      logStateTransition(tenantId, {
        state: PipelineStates.SELECTING_RESOURCE,
        detail: "auto-selected",
      });
    } else {
      logStateTransition(tenantId, {
        state: PipelineStates.SELECTING_RESOURCE,
        detail: "requires-selection",
      });
      return {
        requiresSelection: true,
        resources: discovered,
      };
    }
  }

  logStateTransition(tenantId, { state: PipelineStates.CHECKING_ACCESS });
  progress("Checking workspace access", 0.05);
  const access = await azureClient.checkAccess(selectedResource.workspaceId);
  if (!access.ok) {
    logStateTransition(tenantId, { state: PipelineStates.NO_ACCESS, detail: access.reason });
    return {
      error: "NO_ACCESS",
      message: access.reason || "Missing permissions for workspace.",
    };
  }

  const timeParams = {
    timeStart: toKqlDatetime(timeRange.start),
    timeEnd: toKqlDatetime(timeRange.end),
  };
  const readinessParams = {
    timeStart: toKqlDatetime(readinessWindow.start),
    timeEnd: toKqlDatetime(readinessWindow.end),
  };

  logStateTransition(tenantId, { state: PipelineStates.READINESS_PROBES });
  progress("Running readiness probes", 0.08);
  const readinessTemplate = loadKqlTemplate("readiness-probes");
  const readinessKql = renderTemplate(readinessTemplate, readinessParams);
  const readinessResult = await azureClient.queryWorkspace({
    resourceId: selectedResource.resourceId,
    workspaceId: selectedResource.workspaceId,
    kql: readinessKql,
    queryName: "readiness",
    timeRangeKey: "24h",
  });
  const readinessRows = extractRows(readinessResult);
  let readinessReport = buildReadinessReport({
    probeResult: readinessRows[0] || {},
    window: readinessWindow,
  });

  if (readinessReport.overallStatus === "EMPTY" || readinessReport.confidence < 0.4) {
    readinessWindow = {
      start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      end: now,
    };
    const fallbackParams = {
      timeStart: toKqlDatetime(readinessWindow.start),
      timeEnd: toKqlDatetime(readinessWindow.end),
    };
    const fallbackKql = renderTemplate(readinessTemplate, fallbackParams);
    const fallbackResult = await azureClient.queryWorkspace({
      resourceId: selectedResource.resourceId,
      workspaceId: selectedResource.workspaceId,
      kql: fallbackKql,
      queryName: "readinessFallback",
      timeRangeKey: "7d",
    });
    const fallbackRows = extractRows(fallbackResult);
    const fallbackReport = buildReadinessReport({
      probeResult: fallbackRows[0] || {},
      window: readinessWindow,
    });
    if (fallbackReport.overallStatus !== "EMPTY") {
      readinessReport = fallbackReport;
    }
  }
  updateTenant(tenantId, { readinessReport });

  logStateTransition(tenantId, { state: PipelineStates.SCHEMA_PROFILING });
  progress("Profiling schema", 0.15);
  const schemaStart = new Date(Math.min(
    timeRange.start.getTime(),
    now.getTime() - 30 * 24 * 60 * 60 * 1000,
  ));
  const schemaTimeParams = {
    timeStart: toKqlDatetime(schemaStart),
    timeEnd: toKqlDatetime(now),
  };
  const schemaTablesTemplate = loadKqlTemplate("schema-tables");
  const schemaTablesKql = renderTemplate(schemaTablesTemplate, schemaTimeParams);
  const tablesResult = await azureClient.queryWorkspace({
    resourceId: selectedResource.resourceId,
    workspaceId: selectedResource.workspaceId,
    kql: schemaTablesKql,
    queryName: "schemaTables",
    timeRangeKey: "30d",
  });

  const schemaCustomTemplate = loadKqlTemplate("schema-custom-dimensions");
  const schemaCustomKql = renderTemplate(schemaCustomTemplate, schemaTimeParams);
  const customResult = await azureClient.queryWorkspace({
    resourceId: selectedResource.resourceId,
    workspaceId: selectedResource.workspaceId,
    kql: schemaCustomKql,
    queryName: "schemaCustomDimensions",
    timeRangeKey: "30d",
  });

  const schemaProfile = buildSchemaProfile({
    tablesResult: extractRows(tablesResult),
    customDimensionsResult: extractRows(customResult),
  });
  updateTenant(tenantId, { schemaProfile });

  logStateTransition(tenantId, { state: PipelineStates.SCHEMA_SCAN });
  progress("Scanning schema enrichment", 0.18);
  const scan = await runSchemaScan({
    azureClient,
    selectedResource,
    schemaTimeParams,
    schemaProfile,
    readinessReport,
  });
  if (scan) {
    try {
      persistScan(tenantId, scan);
    } catch (error) {
      logStateTransition(tenantId, {
        state: PipelineStates.SCHEMA_SCAN,
        detail: `persist-failed: ${error.message}`,
      });
    }
  }

  // F3: optional AI mapping enrichment. Cached per scan_id so re-runs
  // don't re-spend tokens. Never blocks the pipeline — degraded fallback
  // returns the empty proposal shape so the wizard can still render.
  logStateTransition(tenantId, { state: PipelineStates.AI_ANALYSIS });
  progress("AI mapping analysis", 0.20);
  let aiMapping = null;
  try {
    aiMapping = await getOrComputeMapping(tenantId, { readinessReport });
    if (aiMapping?.degraded) {
      logStateTransition(tenantId, {
        state: PipelineStates.AI_ANALYSIS,
        detail: `degraded: ${aiMapping.reason || "unknown"}`,
      });
    }
  } catch (error) {
    logStateTransition(tenantId, {
      state: PipelineStates.AI_ANALYSIS,
      detail: `ai-failed: ${error.message}`,
    });
  }

  logStateTransition(tenantId, { state: PipelineStates.MAPPING_BUILD });
  progress("Building data mapping", 0.22);
  const deterministicMapping = buildMapping({ schemaProfile, readinessReport });
  const validation = getActiveValidation(tenantId);
  const mapping = mergeWithValidation(deterministicMapping, validation);
  updateTenant(tenantId, { mapping });

  logStateTransition(tenantId, { state: PipelineStates.DASHBOARD_BUILD });
  progress("Building dashboard", 0.25);
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
    onProgress: (label, pct) => progress(label, 0.25 + pct * 0.7),
    azureMode,
  });

  logStateTransition(tenantId, { state: PipelineStates.CACHING_RESULTS });
  progress("Finalizing", 0.98);
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
