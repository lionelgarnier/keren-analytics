import { auditEvent } from "./audit.js";
import { buildCacheKey, cacheStore } from "./cache.js";
import { loadKqlTemplate, renderTemplate } from "./kql.js";
import { toKqlDatetime } from "./timeRange.js";
import { allowedKqlExpressions, mappingExpressions } from "./mapping.js";

function toRows(result) {
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

function toSingleValue(rows, key) {
  if (!rows || rows.length === 0) return 0;
  return rows[0][key] ?? 0;
}

async function runQuery({
  tenantId,
  workspaceId,
  queryName,
  templateName,
  params,
  allowedValues,
  timeRangeKey,
  mappingVersion,
  ttlMs,
  azureClient,
}) {
  const cacheKey = buildCacheKey({
    tenantId,
    workspaceId,
    queryName,
    timeRangeKey,
    mappingVersion,
  });
  const cached = cacheStore.get(cacheKey);
  if (cached) return cached;

  const template = loadKqlTemplate(templateName);
  const kql = renderTemplate(template, params, allowedValues);

  const start = Date.now();
  try {
    const result = await azureClient.queryWorkspace({
      workspaceId,
      kql,
      queryName,
      timeRangeKey,
    });
    const durationMs = Date.now() - start;
    auditEvent({
      tenantId,
      workspaceId,
      queryName,
      durationMs,
      rowCount: result?.tables?.[0]?.rows?.length || 0,
      status: "ok",
    });
    cacheStore.set(cacheKey, result, ttlMs);
    return result;
  } catch (error) {
    auditEvent({
      tenantId,
      workspaceId,
      queryName,
      durationMs: Date.now() - start,
      rowCount: 0,
      status: "error",
      error: error.message,
    });
    throw error;
  }
}

export async function buildOverviewDashboard({
  tenantId,
  workspaceId,
  mapping,
  schemaProfile,
  timeRange,
  cacheTtlMs,
  azureClient,
  readinessReport,
}) {
  const allowedExpr = allowedKqlExpressions();
  const pageTable = mapping.pageTable || (schemaProfile?.tables?.requests ? "requests" : "pageViews");
  const tableName = schemaProfile?.tables?.[pageTable] ? pageTable : "requests";
  const hasPageTable = schemaProfile?.tables?.pageViews || schemaProfile?.tables?.requests;
  const hasRequests = schemaProfile?.tables?.requests || readinessReport?.availableSignals?.requests;
  const sessionExpr =
    mapping.canonicalSessionId?.expr ||
    (schemaProfile?.tables?.requests ? mappingExpressions.sessionId.operation : mappingExpressions.sessionId.session);
  const pagePathExpr = mapping.canonicalPagePath?.expr || mappingExpressions.pagePath.urlPath;
  const userIdExpr = mapping.canonicalUserId?.expr || "";

  const timeParams = {
    timeStart: toKqlDatetime(timeRange.start),
    timeEnd: toKqlDatetime(timeRange.end),
  };

  const uniqueTemplate = userIdExpr ? "unique-visitors-user" : "unique-visitors-session";

  const emptyResult = { tables: [{ columns: [], rows: [] }] };

  const uniqueVisitorsResult = hasPageTable
    ? await runQuery({
        tenantId,
        workspaceId,
        queryName: "uniqueVisitors",
        templateName: uniqueTemplate,
        params: {
          ...timeParams,
          tableName,
          userIdExpr: userIdExpr || mappingExpressions.userId.anonymous,
          sessionIdExpr: sessionExpr,
        },
        allowedValues: {
          tableName: ["pageViews", "requests"],
          ...allowedExpr,
        },
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  const sessionsResult = hasPageTable
    ? await runQuery({
        tenantId,
        workspaceId,
        queryName: "sessions",
        templateName: "sessions",
        params: {
          ...timeParams,
          tableName,
          sessionIdExpr: sessionExpr,
        },
        allowedValues: {
          tableName: ["pageViews", "requests"],
          sessionIdExpr: allowedExpr.sessionIdExpr,
        },
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  const topPagesResult = hasPageTable
    ? await runQuery({
        tenantId,
        workspaceId,
        queryName: "topPages",
        templateName: "top-pages",
        params: {
          ...timeParams,
          tableName,
          pagePathExpr,
        },
        allowedValues: {
          tableName: ["pageViews", "requests"],
          pagePathExpr: allowedExpr.pagePathExpr,
        },
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  const topNavResult = hasPageTable
    ? await runQuery({
        tenantId,
        workspaceId,
        queryName: "topNavigation",
        templateName: "top-navigation",
        params: {
          ...timeParams,
          tableName,
          pagePathExpr,
          sessionIdExpr: sessionExpr,
        },
        allowedValues: {
          tableName: ["pageViews", "requests"],
          pagePathExpr: allowedExpr.pagePathExpr,
          sessionIdExpr: allowedExpr.sessionIdExpr,
        },
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  const browsersResult = hasPageTable
    ? await runQuery({
        tenantId,
        workspaceId,
        queryName: "techBrowser",
        templateName: "tech-browser",
        params: { ...timeParams, tableName },
        allowedValues: { tableName: ["pageViews", "requests"] },
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  const osResult = hasPageTable
    ? await runQuery({
        tenantId,
        workspaceId,
        queryName: "techOs",
        templateName: "tech-os",
        params: { ...timeParams, tableName },
        allowedValues: { tableName: ["pageViews", "requests"] },
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  const deviceResult = hasPageTable
    ? await runQuery({
        tenantId,
        workspaceId,
        queryName: "techDevice",
        templateName: "tech-device",
        params: { ...timeParams, tableName },
        allowedValues: { tableName: ["pageViews", "requests"] },
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  const performanceResult = hasRequests
    ? await runQuery({
        tenantId,
        workspaceId,
        queryName: "performance",
        templateName: "performance",
        params: { ...timeParams },
        allowedValues: {},
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  const slowEndpointsResult = hasRequests
    ? await runQuery({
        tenantId,
        workspaceId,
        queryName: "slowEndpoints",
        templateName: "slow-endpoints",
        params: { ...timeParams },
        allowedValues: {},
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  const uniqueRows = toRows(uniqueVisitorsResult);
  const sessionRows = toRows(sessionsResult);
  const topPagesRows = toRows(topPagesResult);
  const topNavRows = toRows(topNavResult);
  const browsersRows = toRows(browsersResult);
  const osRows = toRows(osResult);
  const devicesRows = toRows(deviceResult);
  const perfRows = toRows(performanceResult);
  const slowRows = toRows(slowEndpointsResult);

  const totalBrowser =
    Number(browsersRows[0]?.total) || browsersRows.reduce((sum, row) => sum + (row.count || 0), 0);
  const totalOs = Number(osRows[0]?.total) || osRows.reduce((sum, row) => sum + (row.count || 0), 0);
  const totalDevices =
    Number(devicesRows[0]?.total) || devicesRows.reduce((sum, row) => sum + (row.count || 0), 0);

  return {
    kpis: {
      uniqueVisitors: toSingleValue(uniqueRows, "uniqueVisitors"),
      sessions: toSingleValue(sessionRows, "sessions"),
      avgResponseTimeMs: Number(toSingleValue(perfRows, "avgDuration")) || 0,
      p95ResponseTimeMs: Number(toSingleValue(perfRows, "p95Duration")) || 0,
      errorRate: Number(toSingleValue(perfRows, "errorRate")) || 0,
    },
    charts: {
      topPages: topPagesRows.map((row) => ({
        path: row.pagePath,
        views: row.views,
        share: row.share,
      })),
      topNavigationPaths: topNavRows.map((row) => ({
        from: row.from,
        to: row.to,
        count: row.transitions,
      })),
      browsers: [
        ...browsersRows.map((row) => ({
          name: row.browser,
          count: row.count,
          share: totalBrowser ? row.count / totalBrowser : 0,
        })),
        totalBrowser > browsersRows.reduce((sum, row) => sum + row.count, 0)
          ? {
              name: "Other",
              count: totalBrowser - browsersRows.reduce((sum, row) => sum + row.count, 0),
              share:
                (totalBrowser - browsersRows.reduce((sum, row) => sum + row.count, 0)) / totalBrowser,
            }
          : null,
      ].filter(Boolean),
      os: [
        ...osRows.map((row) => ({
          name: row.os,
          count: row.count,
          share: totalOs ? row.count / totalOs : 0,
        })),
        totalOs > osRows.reduce((sum, row) => sum + row.count, 0)
          ? {
              name: "Other",
              count: totalOs - osRows.reduce((sum, row) => sum + row.count, 0),
              share: (totalOs - osRows.reduce((sum, row) => sum + row.count, 0)) / totalOs,
            }
          : null,
      ].filter(Boolean),
      devices: [
        ...devicesRows.map((row) => ({
          name: row.device,
          count: row.count,
          share: totalDevices ? row.count / totalDevices : 0,
        })),
        totalDevices > devicesRows.reduce((sum, row) => sum + row.count, 0)
          ? {
              name: "Other",
              count: totalDevices - devicesRows.reduce((sum, row) => sum + row.count, 0),
              share:
                (totalDevices - devicesRows.reduce((sum, row) => sum + row.count, 0)) / totalDevices,
            }
          : null,
      ].filter(Boolean),
    },
    tables: {
      slowEndpoints: slowRows.map((row) => ({
        path: row.path,
        p95: row.p95,
        count: row.count,
      })),
    },
    meta: {
      mappingVersion: mapping.version,
      dataFreshness: readinessReport?.latestTimestamp || null,
      timeRange: timeRange.key,
      generatedAt: new Date().toISOString(),
      mappingUsed: {
        pageTable: tableName,
        userIdSource: mapping.canonicalUserId?.source || null,
        sessionIdSource: mapping.canonicalSessionId?.source || null,
      },
    },
  };
}
