import { buildReadinessReport } from "./readiness.js";
import { buildSchemaProfile } from "./schemaProfile.js";
import { buildMapping } from "./mapping.js";
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
}) {
  const timeRange = resolveTimeRange(rangeKey, customStart, customEnd);
  const now = new Date();
  let readinessWindow = {
    start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    end: now,
  };
  logStateTransition(tenantId, { state: PipelineStates.DISCOVERING_RESOURCES });

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
  const schemaTablesTemplate = loadKqlTemplate("schema-tables");
  const schemaTablesKql = renderTemplate(schemaTablesTemplate, timeParams);
  const tablesResult = await azureClient.queryWorkspace({
    resourceId: selectedResource.resourceId,
    workspaceId: selectedResource.workspaceId,
    kql: schemaTablesKql,
    queryName: "schemaTables",
    timeRangeKey: timeRange.key,
  });

  const schemaCustomTemplate = loadKqlTemplate("schema-custom-dimensions");
  const schemaCustomKql = renderTemplate(schemaCustomTemplate, timeParams);
  const customResult = await azureClient.queryWorkspace({
    resourceId: selectedResource.resourceId,
    workspaceId: selectedResource.workspaceId,
    kql: schemaCustomKql,
    queryName: "schemaCustomDimensions",
    timeRangeKey: timeRange.key,
  });

  const schemaProfile = buildSchemaProfile({
    tablesResult: extractRows(tablesResult),
    customDimensionsResult: extractRows(customResult),
  });
  updateTenant(tenantId, { schemaProfile });

  logStateTransition(tenantId, { state: PipelineStates.MAPPING_BUILD });
  const mapping = buildMapping({ schemaProfile, readinessReport });
  updateTenant(tenantId, { mapping });

  logStateTransition(tenantId, { state: PipelineStates.DASHBOARD_BUILD });
  const dashboard = await buildOverviewDashboard({
    tenantId,
    resourceId: selectedResource.resourceId,
    workspaceId: selectedResource.workspaceId,
    mapping,
    schemaProfile,
    timeRange,
    cacheTtlMs,
    azureClient,
    readinessReport,
  });

  logStateTransition(tenantId, { state: PipelineStates.CACHING_RESULTS });
  logStateTransition(tenantId, { state: PipelineStates.READY });

  return {
    resources: [selectedResource],
    readinessReport,
    schemaProfile,
    mapping,
    dashboard,
  };
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
