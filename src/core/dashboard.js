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
  resourceId,
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
      resourceId,
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
    const wrappedError = new Error(`Query '${queryName}' (template: ${templateName}) failed: ${error.message}`);
    wrappedError.cause = error;
    wrappedError.queryName = queryName;
    throw wrappedError;
  }
}

/**
 * Safe division helper to prevent division by zero.
 */
function safeDivide(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Choose the time bin size for daily trend based on range key.
 */
function binSizeForRange(rangeKey) {
  return rangeKey === "today" ? "1h" : "1d";
}

export async function buildOverviewDashboard({
  tenantId,
  resourceId,
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
  const hasGeo = readinessReport?.availableSignals?.geo;
  const hasBrowserTimings = readinessReport?.availableSignals?.browserTimings || schemaProfile?.tables?.browserTimings;
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
  const binSize = binSizeForRange(timeRange.key);

  const emptyResult = { tables: [{ columns: [], rows: [] }] };

  // --- Core queries (same as Phase 1) ---

  const uniqueVisitorsResult = hasPageTable
    ? await runQuery({
        tenantId,
        resourceId,
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
        resourceId,
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
        resourceId,
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
        resourceId,
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
        resourceId,
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
        resourceId,
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
        resourceId,
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
        resourceId,
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
        resourceId,
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

  // --- Phase 2 new queries ---

  const dailyTrendResult = hasPageTable
    ? await runQuery({
        tenantId,
        resourceId,
        workspaceId,
        queryName: "dailyTrend",
        templateName: "daily-trend",
        params: {
          ...timeParams,
          tableName,
          pagePathExpr,
          sessionIdExpr: sessionExpr,
          binSize,
        },
        allowedValues: {
          tableName: ["pageViews", "requests"],
          pagePathExpr: allowedExpr.pagePathExpr,
          sessionIdExpr: allowedExpr.sessionIdExpr,
          binSize: ["1h", "1d"],
        },
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  const geoResult = hasGeo
    ? await runQuery({
        tenantId,
        resourceId,
        workspaceId,
        queryName: "geoDistribution",
        templateName: "geo-distribution",
        params: { ...timeParams, tableName },
        allowedValues: { tableName: ["pageViews", "requests"] },
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  const abTestsResult = hasPageTable
    ? await runQuery({ tenantId, resourceId, workspaceId, queryName: "abTests", templateName: "top-pages", params: { ...timeParams, tableName, pagePathExpr }, allowedValues: { tableName: ["pageViews", "requests"], pagePathExpr: allowedExpr.pagePathExpr }, timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient })
    : { _raw: null };

  const kpiSparklinesResult = hasPageTable
    ? await runQuery({ tenantId, resourceId, workspaceId, queryName: "kpiSparklines", templateName: "top-pages", params: { ...timeParams, tableName, pagePathExpr }, allowedValues: { tableName: ["pageViews", "requests"], pagePathExpr: allowedExpr.pagePathExpr }, timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient })
    : { _raw: null };

  const sessionReplaysResult = hasPageTable
    ? await runQuery({ tenantId, resourceId, workspaceId, queryName: "sessionReplays", templateName: "top-pages", params: { ...timeParams, tableName, pagePathExpr }, allowedValues: { tableName: ["pageViews", "requests"], pagePathExpr: allowedExpr.pagePathExpr }, timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient })
    : { _raw: null };

  const peakHoursResult = hasPageTable
    ? await runQuery({
        tenantId, resourceId, workspaceId,
        queryName: "peakHours",
        templateName: "top-pages",
        params: { ...timeParams, tableName, pagePathExpr },
        allowedValues: { tableName: ["pageViews", "requests"], pagePathExpr: allowedExpr.pagePathExpr },
        timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
      })
    : { _raw: null };

  const urlParamsResult = hasPageTable
    ? await runQuery({
        tenantId, resourceId, workspaceId,
        queryName: "urlParams",
        templateName: "top-pages",
        params: { ...timeParams, tableName, pagePathExpr },
        allowedValues: { tableName: ["pageViews", "requests"], pagePathExpr: allowedExpr.pagePathExpr },
        timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
      })
    : { _raw: null };

  const campaignResult = hasPageTable
    ? await runQuery({
        tenantId, resourceId, workspaceId,
        queryName: "campaignBreakdown",
        templateName: "top-pages",
        params: { ...timeParams, tableName, pagePathExpr },
        allowedValues: { tableName: ["pageViews", "requests"], pagePathExpr: allowedExpr.pagePathExpr },
        timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
      })
    : { _raw: null };

  const userFlowResult = hasPageTable
    ? await runQuery({
        tenantId,
        resourceId,
        workspaceId,
        queryName: "userFlow",
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
    : { _raw: null };

  const referrerResult = hasPageTable
    ? await runQuery({
        tenantId,
        resourceId,
        workspaceId,
        queryName: "referrerSources",
        templateName: "referrer-sources",
        params: { ...timeParams, tableName },
        allowedValues: { tableName: ["pageViews", "requests"] },
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  const browserTimingsResult = hasBrowserTimings
    ? await runQuery({
        tenantId,
        resourceId,
        workspaceId,
        queryName: "browserTimings",
        templateName: "browser-timings",
        params: { ...timeParams },
        allowedValues: {},
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  // --- Process results ---

  const uniqueRows = toRows(uniqueVisitorsResult);
  const sessionRows = toRows(sessionsResult);
  const topPagesRows = toRows(topPagesResult);
  const topNavRows = toRows(topNavResult);
  const browsersRows = toRows(browsersResult);
  const osRows = toRows(osResult);
  const devicesRows = toRows(deviceResult);
  const perfRows = toRows(performanceResult);
  const slowRows = toRows(slowEndpointsResult);
  const dailyTrendRows = toRows(dailyTrendResult);
  const geoRows = toRows(geoResult);
  const referrerRows = toRows(referrerResult);
  const browserTimingsRows = toRows(browserTimingsResult);

  const totalBrowser =
    Number(browsersRows[0]?.total) || browsersRows.reduce((sum, row) => sum + (row.count || 0), 0);
  const totalOs = Number(osRows[0]?.total) || osRows.reduce((sum, row) => sum + (row.count || 0), 0);
  const totalDevices =
    Number(devicesRows[0]?.total) || devicesRows.reduce((sum, row) => sum + (row.count || 0), 0);

  const browserListedSum = browsersRows.reduce((sum, row) => sum + (row.count || 0), 0);
  const osListedSum = osRows.reduce((sum, row) => sum + (row.count || 0), 0);
  const devicesListedSum = devicesRows.reduce((sum, row) => sum + (row.count || 0), 0);

  const totalGeo = geoRows.reduce((sum, row) => sum + (row.count || 0), 0);

  return {
    kpis: {
      uniqueVisitors: toSingleValue(uniqueRows, "uniqueVisitors"),
      sessions: toSingleValue(sessionRows, "sessions"),
      avgResponseTimeMs: Number(toSingleValue(perfRows, "avgDuration")) || 0,
      p95ResponseTimeMs: Number(toSingleValue(perfRows, "p95Duration")) || 0,
      errorRate: Number(toSingleValue(perfRows, "errorRate")) || 0,
    },
    charts: {
      dailyTrend: dailyTrendRows.map((row) => ({
        period: row.period,
        visitors: row.visitors || 0,
        pageViews: row.pageViews || 0,
      })),
      topPages: topPagesRows.map((row) => ({
        path: row.pagePath,
        views: row.viewCount ?? row.views,
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
          share: safeDivide(row.count, totalBrowser),
        })),
        totalBrowser > browserListedSum
          ? {
              name: "Other",
              count: totalBrowser - browserListedSum,
              share: safeDivide(totalBrowser - browserListedSum, totalBrowser),
            }
          : null,
      ].filter(Boolean),
      os: [
        ...osRows.map((row) => ({
          name: row.os,
          count: row.count,
          share: safeDivide(row.count, totalOs),
        })),
        totalOs > osListedSum
          ? {
              name: "Other",
              count: totalOs - osListedSum,
              share: safeDivide(totalOs - osListedSum, totalOs),
            }
          : null,
      ].filter(Boolean),
      devices: [
        ...devicesRows.map((row) => ({
          name: row.device,
          count: row.count,
          share: safeDivide(row.count, totalDevices),
        })),
        totalDevices > devicesListedSum
          ? {
              name: "Other",
              count: totalDevices - devicesListedSum,
              share: safeDivide(totalDevices - devicesListedSum, totalDevices),
            }
          : null,
      ].filter(Boolean),
      geoDistribution: geoRows.map((row) => ({
        country: row.country,
        count: row.count,
        share: row.share || safeDivide(row.count, totalGeo),
      })),
      userFlow: userFlowResult?._raw || null,
      abTests: abTestsResult?._raw || null,
      kpiSparklines: kpiSparklinesResult?._raw || null,
      sessionReplays: sessionReplaysResult?._raw || null,
      peakHours: peakHoursResult?._raw || null,
      urlParams: urlParamsResult?._raw || null,
      campaignBreakdown: campaignResult?._raw || null,
      referrerSources: referrerRows.map((row) => ({
        source: row.source,
        count: row.count,
      })),
      browserTimings: browserTimingsRows.length > 0
        ? {
            avgNetwork: Number(browserTimingsRows[0].avgNetworkDuration) || 0,
            avgSend: Number(browserTimingsRows[0].avgSendDuration) || 0,
            avgReceive: Number(browserTimingsRows[0].avgReceiveDuration) || 0,
            avgProcessing: Number(browserTimingsRows[0].avgProcessingDuration) || 0,
            avgTotal: Number(browserTimingsRows[0].avgTotalDuration) || 0,
            p95Total: Number(browserTimingsRows[0].p95TotalDuration) || 0,
            sampleCount: Number(browserTimingsRows[0].sampleCount) || 0,
          }
        : null,
    },
    tables: {
      slowEndpoints: slowRows.map((row) => ({
        path: row.path,
        p50: row.p50 || 0,
        p95: row.p95,
        p99: row.p99 || 0,
        avgDuration: row.avgDuration || 0,
        count: row.count,
        errorRate: row.errorRate || 0,
      })),
    },
    availability: {
      hasPageTable: Boolean(hasPageTable),
      hasRequests: Boolean(hasRequests),
      hasGeo: Boolean(hasGeo),
      hasBrowserTimings: Boolean(hasBrowserTimings),
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
