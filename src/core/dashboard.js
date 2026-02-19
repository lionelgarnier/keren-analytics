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

/**
 * Build Sankey node/link structure from page navigation rows.
 */
function buildSankeyFromNav(navRows) {
  if (!navRows || navRows.length === 0) return null;
  const sources = new Set(navRows.map((r) => r.from));
  const targets = new Set(navRows.map((r) => r.to));
  const allIds = new Set([...sources, ...targets]);
  const inValue = {};
  const outValue = {};
  allIds.forEach((id) => { inValue[id] = 0; outValue[id] = 0; });
  navRows.forEach((r) => {
    const v = r.transitions || r.count || 0;
    outValue[r.from] += v;
    inValue[r.to] += v;
  });

  const funnelPaths = new Set(["/pricing", "/signup", "/checkout", "/register"]);
  function groupOf(p) {
    if (funnelPaths.has(p)) return "funnel";
    if (p === "/" || p.startsWith("/blog") || p.startsWith("/docs")) return "info";
    return "other";
  }

  const nodes = [...allIds].map((id) => {
    let step = 1;
    if (id === "/" || !targets.has(id)) step = 0;
    else if (!sources.has(id)) step = 2;
    return { id, step, group: groupOf(id), value: Math.max(inValue[id], outValue[id]) };
  });
  const links = navRows.map((r) => ({ source: r.from, target: r.to, value: r.transitions || r.count || 0 }));
  return { nodes, links };
}

/**
 * Derive KPI sparkline data from daily trend rows.
 */
function buildSparklines(trendRows) {
  if (!trendRows || trendRows.length < 3) return null;
  const visitorPts = trendRows.map((r) => r.visitors || 0);

  function detectAnomaly(pts) {
    if (pts.length < 7) return null;
    const avg = pts.reduce((s, v) => s + v, 0) / pts.length;
    const std = Math.sqrt(pts.reduce((s, v) => s + (v - avg) ** 2, 0) / pts.length);
    const last = pts[pts.length - 1];
    if (std > 0 && Math.abs(last - avg) > 2 * std) {
      return { direction: last > avg ? "up" : "down", magnitude: Math.round((Math.abs(last - avg) / std) * 10) / 10 };
    }
    return null;
  }
  return {
    visitors: { points: visitorPts, anomaly: detectAnomaly(visitorPts) },
    sessions: { points: visitorPts, anomaly: null },
  };
}

/**
 * Group flat session event rows into session timeline objects.
 */
function buildSessionTimelines(rows) {
  if (!rows || rows.length === 0) return null;
  const sessionMap = new Map();
  rows.forEach((row) => {
    const sid = row.sessionId;
    if (!sessionMap.has(sid)) {
      sessionMap.set(sid, { sessionId: String(sid).substring(0, 8), device: row.device || "Unknown", country: row.country || "", rawEvents: [] });
    }
    sessionMap.get(sid).rawEvents.push({ path: row.pagePath, ts: new Date(row.timestamp).getTime() });
  });
  return [...sessionMap.values()].map((s) => {
    const events = s.rawEvents.sort((a, b) => a.ts - b.ts);
    const t0 = events[0].ts;
    return {
      sessionId: s.sessionId,
      converted: false,
      pageCount: events.length,
      duration: events.length > 1 ? (events[events.length - 1].ts - t0) / 1000 : 0,
      device: s.device,
      country: s.country,
      events: events.map((e, i) => ({
        type: "pageView",
        path: e.path,
        label: e.path,
        duration: i < events.length - 1 ? Math.round((events[i + 1].ts - e.ts) / 1000) : null,
        timestamp: Math.round((e.ts - t0) / 1000),
      })),
    };
  });
}

/**
 * Transform URL parameter query rows into the frontend-expected shape.
 */
function buildUrlParamsData(rows) {
  if (!rows || rows.length === 0) return null;
  const totalScanned = Number(rows[0]?.totalScanned) || 0;
  const urlsWithParams = Number(rows[0]?.urlsWithParams) || 0;
  return {
    discovered: rows.map((row) => ({
      param: row.paramName,
      frequency: Number(row.frequency) || 0,
      isUtm: Boolean(row.isUtm),
      topValues: row.topValue ? [{ value: String(row.topValue), count: Number(row.frequency) || 0 }] : [],
    })),
    totalUrlsScanned: totalScanned,
    urlsWithParams,
  };
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
  onProgress,
}) {
  const TOTAL_QUERIES = 18;
  let queryIndex = 0;
  const progress = typeof onProgress === "function" ? onProgress : () => {};
  function queryProgress(label) {
    progress(label, queryIndex / TOTAL_QUERIES);
    queryIndex++;
  }
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

  queryProgress("Counting visitors");
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

  queryProgress("Counting sessions");
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

  queryProgress("Loading top pages");
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

  queryProgress("Analyzing navigation paths");
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

  queryProgress("Detecting browsers");
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

  queryProgress("Detecting operating systems");
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

  queryProgress("Detecting devices");
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

  queryProgress("Measuring performance");
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

  queryProgress("Finding slow endpoints");
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

  queryProgress("Computing daily trend");
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

  queryProgress("Loading geo distribution");
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

  queryProgress("Analyzing peak hours");
  const peakHoursResult = hasPageTable
    ? await runQuery({
        tenantId, resourceId, workspaceId,
        queryName: "peakHours",
        templateName: "peak-hours",
        params: { ...timeParams, tableName, sessionIdExpr: sessionExpr },
        allowedValues: {
          tableName: ["pageViews", "requests"],
          sessionIdExpr: allowedExpr.sessionIdExpr,
        },
        timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
      })
    : emptyResult;

  queryProgress("Scanning URL parameters");
  const urlParamsResult = hasPageTable
    ? await runQuery({
        tenantId, resourceId, workspaceId,
        queryName: "urlParams",
        templateName: "url-parameters",
        params: { ...timeParams, tableName },
        allowedValues: { tableName: ["pageViews", "requests"] },
        timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
      })
    : emptyResult;

  queryProgress("Loading campaign data");
  const campaignResult = hasPageTable
    ? await runQuery({
        tenantId, resourceId, workspaceId,
        queryName: "campaignBreakdown",
        templateName: "campaign-breakdown",
        params: {
          ...timeParams,
          tableName,
          userIdExpr: userIdExpr || mappingExpressions.userId.anonymous,
          sessionIdExpr: sessionExpr,
        },
        allowedValues: {
          tableName: ["pageViews", "requests"],
          userIdExpr: allowedExpr.userIdExpr,
          sessionIdExpr: allowedExpr.sessionIdExpr,
        },
        timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
      })
    : emptyResult;

  queryProgress("Reconstructing sessions");
  const sessionTimelinesResult = hasPageTable
    ? await runQuery({
        tenantId, resourceId, workspaceId,
        queryName: "sessionTimelines",
        templateName: "session-timelines",
        params: {
          ...timeParams,
          tableName,
          sessionIdExpr: sessionExpr,
          pagePathExpr,
        },
        allowedValues: {
          tableName: ["pageViews", "requests"],
          sessionIdExpr: allowedExpr.sessionIdExpr,
          pagePathExpr: allowedExpr.pagePathExpr,
        },
        timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
      })
    : emptyResult;

  const referrerExpr =
    mapping.canonicalReferrer?.expr || mappingExpressions.referrer.referrer;

  queryProgress("Analyzing referrers");
  const referrerResult = hasPageTable
    ? await runQuery({
        tenantId,
        resourceId,
        workspaceId,
        queryName: "referrerSources",
        templateName: "referrer-sources",
        params: { ...timeParams, tableName, referrerExpr },
        allowedValues: {
          tableName: ["pageViews", "requests"],
          referrerExpr: allowedExpr.referrerExpr,
        },
        timeRangeKey: timeRange.key,
        mappingVersion: mapping.version,
        ttlMs: cacheTtlMs,
        azureClient,
      })
    : emptyResult;

  queryProgress("Measuring frontend timings");
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
  const peakHoursRows = toRows(peakHoursResult);
  const urlParamRows = toRows(urlParamsResult);
  const campaignRows = toRows(campaignResult);
  const sessionTimelineRows = toRows(sessionTimelinesResult);

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
      userFlow: buildSankeyFromNav(topNavRows),
      abTests: null,
      kpiSparklines: buildSparklines(dailyTrendRows),
      sessionReplays: buildSessionTimelines(sessionTimelineRows),
      peakHours: peakHoursRows.map((row) => ({
        dayIndex: Number(row.dayIndex),
        hour: Number(row.hour),
        count: Number(row.count) || 0,
      })),
      urlParams: buildUrlParamsData(urlParamRows),
      campaignBreakdown: campaignRows.map((row) => ({
        source: row.source,
        medium: row.medium,
        campaign: row.campaign,
        visitors: Number(row.visitors) || 0,
        sessions: Number(row.sessions) || 0,
        signups: 0,
        convRate: 0,
      })),
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
