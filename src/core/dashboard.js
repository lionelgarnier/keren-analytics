import { auditEvent } from "./audit.js";
import { buildCacheKey, cacheStore } from "./cache.js";
import { loadKqlTemplate, renderTemplate } from "./kql.js";
import { toKqlDatetime, previousTimeRange, comparisonLabel } from "./timeRange.js";
import { allowedKqlExpressions, mappingExpressions } from "./mapping.js";
import { buildNarration } from "./narration.js";
import { scrubPii } from "./schemaScan.js";

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

/**
 * Build the period-over-period delta payload for a single KPI (B4).
 * Returns null when the previous value is 0 — the UI surfaces "—" rather
 * than rendering a misleading +∞% chip on first-time-connected tenants.
 */
function deltaEntry(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) {
    return { current: cur, previous: 0, deltaPct: null, direction: "neutral" };
  }
  const deltaPct = ((cur - prev) / prev) * 100;
  let direction = "neutral";
  if (deltaPct > 0.5) direction = "up";
  else if (deltaPct < -0.5) direction = "down";
  return {
    current: cur,
    previous: prev,
    deltaPct: Math.round(deltaPct * 10) / 10,
    direction,
  };
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
    resourceId,
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
 * Exported for unit testing of the PII-scrub / UTM-gating behaviour.
 */
export function buildUrlParamsData(rows) {
  if (!rows || rows.length === 0) return null;
  const totalScanned = Number(rows[0]?.totalScanned) || 0;
  const urlsWithParams = Number(rows[0]?.urlsWithParams) || 0;
  return {
    discovered: rows.map((row) => {
      const isUtm = Boolean(row.isUtm);
      // Only UTM params expose a sample value — that value IS the campaign
      // name the user wants. For every other param the raw value is pure
      // risk (auth tokens, tenant/user UUIDs, OAuth scopes have all been
      // observed here); the param name + frequency carry the analytics
      // signal. Whatever does get emitted is still PII-scrubbed.
      return {
        param: row.paramName,
        frequency: Number(row.frequency) || 0,
        isUtm,
        topValues:
          isUtm && row.topValue
            ? [{ value: scrubPii(String(row.topValue)), count: Number(row.frequency) || 0 }]
            : [],
      };
    }),
    totalUrlsScanned: totalScanned,
    urlsWithParams,
  };
}

/**
 * Max concurrent KQL queries against a single Log Analytics workspace.
 * Kept conservative — the Azure Monitor query API throttles per-workspace
 * concurrency, and the 18 dashboard queries are independent so a small
 * pool already collapses the cold-cache wait from ~18 serial round-trips
 * to ~3 waves.
 */
const QUERY_CONCURRENCY = 6;

/**
 * Bounded-concurrency scheduler. Returns a `schedule(thunk)` function that
 * resolves with the thunk's result, never running more than `limit` thunks
 * at once. Rejections propagate to the caller of `schedule`.
 */
function createLimiter(limit) {
  let active = 0;
  const queue = [];
  const pump = () => {
    if (active >= limit || queue.length === 0) return;
    active++;
    const { thunk, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(thunk)
      .then(resolve, reject)
      .finally(() => {
        active--;
        pump();
      });
  };
  return (thunk) =>
    new Promise((resolve, reject) => {
      queue.push({ thunk, resolve, reject });
      pump();
    });
}

/**
 * Build the overview dashboard.
 *
 * The 18 KQL queries are fired concurrently through a bounded pool — each
 * query is independent (it only needs the mapping / schema / time window
 * computed up front). A failed query is isolated: it degrades to an empty
 * result and its card is flagged `error`, instead of taking the whole
 * dashboard down.
 *
 * Two callbacks drive progressive rendering:
 *  - `onProgress(label, pct)` — fires as each query settles.
 *  - `onCard(name, data)` — fires once per card the instant its dependency
 *    queries resolve, so the client can fill that card while others load.
 *    `data` is either the card payload or `{ error: true, message }`.
 *
 * The fully-assembled `dashboard` object is still returned for the
 * non-streaming JSON path and for `buildNarration`.
 */
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
  onCard,
  azureMode,
  aiMapping,
}) {
  const progress = typeof onProgress === "function" ? onProgress : () => {};
  const emitCard = typeof onCard === "function" ? onCard : () => {};

  const allowedExpr = allowedKqlExpressions(mapping);
  const pageTable = mapping.pageTable || (schemaProfile?.tables?.requests ? "requests" : "pageViews");
  const tableName = schemaProfile?.tables?.[pageTable] ? pageTable : "requests";
  const hasPageTable = schemaProfile?.tables?.pageViews || schemaProfile?.tables?.requests;
  const hasRequests = schemaProfile?.tables?.requests || readinessReport?.availableSignals?.requests;
  const hasGeo = readinessReport?.availableSignals?.geo;
  const hasBrowserTimings = readinessReport?.availableSignals?.browserTimings || schemaProfile?.tables?.browserTimings;
  // Backend / APM signals (Track: backend telemetry expansion). Gate the
  // dependency + exception cards on the readiness probe, falling back to the
  // schema-profile table presence so a freshly-scanned resource still renders.
  const hasDependencies = Boolean(readinessReport?.availableSignals?.dependencies || schemaProfile?.tables?.dependencies);
  const hasExceptions = Boolean(readinessReport?.availableSignals?.exceptions || schemaProfile?.tables?.exceptions);
  // Per-signal availability — whether the identity/page-view columns are
  // actually populated (readiness probes them with isnotempty guards). The
  // dashboard uses these to gate KPIs that would otherwise render a
  // degenerate value (e.g. dcountif=0 sessions, all-zero peak hours).
  const hasUserId = Boolean(readinessReport?.availableSignals?.userId);
  const hasSessionId = Boolean(readinessReport?.availableSignals?.sessionId);
  const hasPageViews = Boolean(readinessReport?.availableSignals?.pageViews);
  const signalAvailability = { hasUserId, hasSessionId, hasPageViews };
  const sessionExpr =
    mapping.canonicalSessionId?.expr ||
    (schemaProfile?.tables?.requests ? mappingExpressions.sessionId.operation : mappingExpressions.sessionId.session);
  const pagePathExpr = mapping.canonicalPagePath?.expr || mappingExpressions.pagePath.urlPath;
  const userIdExpr = mapping.canonicalUserId?.expr || "";
  const referrerExpr = mapping.canonicalReferrer?.expr || mappingExpressions.referrer.referrer;

  const timeParams = {
    timeStart: toKqlDatetime(timeRange.start),
    timeEnd: toKqlDatetime(timeRange.end),
  };

  const uniqueTemplate = userIdExpr ? "unique-visitors-user" : "unique-visitors-session";
  const binSize = binSizeForRange(timeRange.key);

  // Period-over-period KPIs (B4) — only today / 7d / 30d define a
  // predecessor; anything else returns null and the UI hides the chips.
  const prevRange = previousTimeRange(timeRange);

  const emptyResult = { tables: [{ columns: [], rows: [] }] };

  const tableNameAllowed = ["pageViews", "requests"];

  // --- Query specs --------------------------------------------------------
  // Each spec's `run` is a thunk so the param object is built lazily, only
  // when the query is actually scheduled. Disabled queries (missing schema
  // signal) never run — they resolve to `emptyResult`, exactly as before.
  const querySpecs = [
    {
      name: "uniqueVisitors",
      label: "Counting visitors",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "uniqueVisitors",
          templateName: uniqueTemplate,
          params: {
            ...timeParams,
            tableName,
            userIdExpr: userIdExpr || mappingExpressions.userId.anonymous,
            sessionIdExpr: sessionExpr,
          },
          allowedValues: { tableName: tableNameAllowed, ...allowedExpr },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "sessions",
      label: "Counting sessions",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "sessions",
          templateName: "sessions",
          params: { ...timeParams, tableName, sessionIdExpr: sessionExpr },
          allowedValues: { tableName: tableNameAllowed, sessionIdExpr: allowedExpr.sessionIdExpr },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "topPages",
      label: "Loading top pages",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "topPages",
          templateName: "top-pages",
          params: { ...timeParams, tableName, pagePathExpr },
          allowedValues: { tableName: tableNameAllowed, pagePathExpr: allowedExpr.pagePathExpr },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "topNavigation",
      label: "Analyzing navigation paths",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "topNavigation",
          templateName: "top-navigation",
          params: { ...timeParams, tableName, pagePathExpr, sessionIdExpr: sessionExpr },
          allowedValues: {
            tableName: tableNameAllowed,
            pagePathExpr: allowedExpr.pagePathExpr,
            sessionIdExpr: allowedExpr.sessionIdExpr,
          },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "techBrowser",
      label: "Detecting browsers",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "techBrowser",
          templateName: "tech-browser",
          params: { ...timeParams, tableName },
          allowedValues: { tableName: tableNameAllowed },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "techOs",
      label: "Detecting operating systems",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "techOs",
          templateName: "tech-os",
          params: { ...timeParams, tableName },
          allowedValues: { tableName: tableNameAllowed },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "techDevice",
      label: "Detecting devices",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "techDevice",
          templateName: "tech-device",
          params: { ...timeParams, tableName },
          allowedValues: { tableName: tableNameAllowed },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "performance",
      label: "Measuring performance",
      enabled: Boolean(hasRequests),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "performance",
          templateName: "performance",
          params: { ...timeParams },
          allowedValues: {},
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "slowEndpoints",
      label: "Finding slow endpoints",
      enabled: Boolean(hasRequests),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "slowEndpoints",
          templateName: "slow-endpoints",
          params: { ...timeParams },
          allowedValues: {},
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "dailyTrend",
      label: "Computing daily trend",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "dailyTrend",
          templateName: "daily-trend",
          params: { ...timeParams, tableName, pagePathExpr, sessionIdExpr: sessionExpr, binSize },
          allowedValues: {
            tableName: tableNameAllowed,
            pagePathExpr: allowedExpr.pagePathExpr,
            sessionIdExpr: allowedExpr.sessionIdExpr,
            binSize: ["1h", "1d"],
          },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "geoDistribution",
      label: "Loading geo distribution",
      enabled: Boolean(hasGeo),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "geoDistribution",
          templateName: "geo-distribution",
          params: { ...timeParams, tableName },
          allowedValues: { tableName: tableNameAllowed },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "peakHours",
      label: "Analyzing peak hours",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "peakHours",
          templateName: "peak-hours",
          params: { ...timeParams, tableName, sessionIdExpr: sessionExpr },
          allowedValues: { tableName: tableNameAllowed, sessionIdExpr: allowedExpr.sessionIdExpr },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "urlParams",
      label: "Scanning URL parameters",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "urlParams",
          templateName: "url-parameters",
          params: { ...timeParams, tableName },
          allowedValues: { tableName: tableNameAllowed },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "campaignBreakdown",
      label: "Loading campaign data",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
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
            tableName: tableNameAllowed,
            userIdExpr: allowedExpr.userIdExpr,
            sessionIdExpr: allowedExpr.sessionIdExpr,
          },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "sessionTimelines",
      label: "Reconstructing sessions",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "sessionTimelines",
          templateName: "session-timelines",
          params: { ...timeParams, tableName, sessionIdExpr: sessionExpr, pagePathExpr },
          allowedValues: {
            tableName: tableNameAllowed,
            sessionIdExpr: allowedExpr.sessionIdExpr,
            pagePathExpr: allowedExpr.pagePathExpr,
          },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "referrerSources",
      label: "Analyzing referrers",
      enabled: Boolean(hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "referrerSources",
          templateName: "referrer-sources",
          params: { ...timeParams, tableName, referrerExpr },
          allowedValues: { tableName: tableNameAllowed, referrerExpr: allowedExpr.referrerExpr },
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "browserTimings",
      label: "Measuring frontend timings",
      enabled: Boolean(hasBrowserTimings),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "browserTimings",
          templateName: "browser-timings",
          params: { ...timeParams },
          allowedValues: {},
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "previousKpis",
      label: "Comparing to previous period",
      enabled: Boolean(prevRange && hasPageTable),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "previousKpis",
          templateName: "previous-kpis",
          params: {
            timeStart: toKqlDatetime(prevRange.start),
            timeEnd: toKqlDatetime(prevRange.end),
            tableName,
            userIdExpr: userIdExpr || mappingExpressions.userId.anonymous,
            sessionIdExpr: sessionExpr,
          },
          allowedValues: { tableName: tableNameAllowed, ...allowedExpr },
          timeRangeKey: prevRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "dependencyOverview",
      label: "Summarizing dependencies",
      enabled: hasDependencies,
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "dependencyOverview",
          templateName: "dependency-overview",
          params: { ...timeParams },
          allowedValues: {},
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "slowDependencies",
      label: "Finding slow dependencies",
      enabled: hasDependencies,
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "slowDependencies",
          templateName: "slow-dependencies",
          params: { ...timeParams },
          allowedValues: {},
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "dependencyTypes",
      label: "Classifying dependencies",
      enabled: hasDependencies,
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "dependencyTypes",
          templateName: "dependency-types",
          params: { ...timeParams },
          allowedValues: {},
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "topExceptions",
      label: "Collecting exceptions",
      enabled: hasExceptions,
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "topExceptions",
          templateName: "top-exceptions",
          params: { ...timeParams },
          allowedValues: {},
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "serviceHealth",
      label: "Checking service health",
      enabled: Boolean(hasRequests),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "serviceHealth",
          templateName: "service-health",
          params: { ...timeParams },
          allowedValues: {},
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
    {
      name: "statusCodes",
      label: "Bucketing status codes",
      enabled: Boolean(hasRequests),
      run: () =>
        runQuery({
          tenantId, resourceId, workspaceId,
          queryName: "statusCodes",
          templateName: "status-codes",
          params: { ...timeParams },
          allowedValues: {},
          timeRangeKey: timeRange.key, mappingVersion: mapping.version, ttlMs: cacheTtlMs, azureClient,
        }),
    },
  ];

  // --- Fire every query through the bounded pool --------------------------
  // Each entry of `queryPromises` resolves to a query result and NEVER
  // rejects — a failed query is recorded in `failed` and degrades to an
  // empty result so the rest of the dashboard still builds.
  const schedule = createLimiter(QUERY_CONCURRENCY);
  const failed = new Set();
  const total = querySpecs.length;
  let settled = 0;
  const queryPromises = {};
  for (const spec of querySpecs) {
    queryPromises[spec.name] = (async () => {
      if (!spec.enabled) {
        settled++;
        progress(spec.label, settled / total);
        return emptyResult;
      }
      try {
        return await schedule(spec.run);
      } catch (error) {
        failed.add(spec.name);
        console.error(`[dashboard] query '${spec.name}' failed: ${error.message}`);
        return emptyResult;
      } finally {
        settled++;
        progress(spec.label, settled / total);
      }
    })();
  }

  const q = (name) => queryPromises[name];
  const anyFailed = (...names) => names.some((name) => failed.has(name));
  const failMessage = (names) =>
    `${names.filter((name) => failed.has(name)).join(", ")} query failed`;

  // Card payload accumulators — each assembler owns a disjoint set of keys,
  // so concurrent writes never collide. Pre-seeded with safe defaults so
  // that, even if an assembler throws before writing its slice, the
  // composed `result` still has a well-formed value for every field.
  const kpis = {
    uniqueVisitors: 0,
    sessions: 0,
    avgResponseTimeMs: 0,
    p95ResponseTimeMs: 0,
    errorRate: 0,
    clientErrorRate: 0,
    comparison: null,
  };
  const charts = {
    dailyTrend: [],
    topPages: [],
    topNavigationPaths: [],
    browsers: [],
    os: [],
    devices: [],
    geoDistribution: [],
    userFlow: null,
    abTests: null,
    kpiSparklines: null,
    sessionReplays: null,
    peakHours: [],
    urlParams: null,
    campaignBreakdown: [],
    referrerSources: [],
    browserTimings: null,
    dependencyTypes: [],
    statusCodes: [],
  };
  const tables = { slowEndpoints: [], slowDependencies: [], topExceptions: [], serviceHealth: [] };
  const backend = {
    dependencyCalls: 0,
    dependencyFailureRate: 0,
    dependencyP95Ms: 0,
    distinctTargets: 0,
    exceptionCount: 0,
    distinctExceptionTypes: 0,
  };

  /** Emit a card: the data payload, or an error stub if any dep failed. */
  function publish(name, deps, data) {
    if (anyFailed(...deps)) {
      emitCard(name, { error: true, message: failMessage(deps) });
    } else {
      emitCard(name, data);
    }
  }

  /**
   * Run a card assembler in isolation. A thrown transform error degrades
   * to an error stub for that assembler's card(s) instead of rejecting the
   * whole `Promise.all` and taking the entire dashboard build down.
   */
  async function runAssembler(cardNames, fn) {
    try {
      await fn();
    } catch (error) {
      console.error(`[dashboard] assembler for '${cardNames.join(", ")}' threw: ${error.message}`);
      for (const name of cardNames) {
        emitCard(name, { error: true, message: "card data could not be built" });
      }
    }
  }

  // --- Card assemblers ----------------------------------------------------
  // Each awaits only the queries it needs, transforms the rows, writes its
  // slice of the result, and publishes the card the instant its data lands.

  async function assembleMarketingKpis() {
    const deps = ["uniqueVisitors", "sessions", "dailyTrend", "previousKpis"];
    const [uvR, sR, dtR, pkR] = await Promise.all(deps.map(q));
    const currentVisitors = toSingleValue(toRows(uvR), "uniqueVisitors");
    const currentSessions = toSingleValue(toRows(sR), "sessions");
    const currentPageViews = toRows(dtR).reduce((sum, r) => sum + (Number(r.pageViews) || 0), 0);
    const prevRows = toRows(pkR);
    const comparison = prevRange
      ? {
          previousRangeKey: prevRange.key,
          label: comparisonLabel(timeRange.key),
          uniqueVisitors: deltaEntry(currentVisitors, toSingleValue(prevRows, "uniqueVisitors")),
          sessions: deltaEntry(currentSessions, toSingleValue(prevRows, "sessions")),
          pageViews: deltaEntry(currentPageViews, toSingleValue(prevRows, "pageViews")),
        }
      : null;
    kpis.uniqueVisitors = currentVisitors;
    kpis.sessions = currentSessions;
    kpis.comparison = comparison;
    // Visitors + sessions are the heart of this card; a trend or
    // period-comparison query failure only costs the page-views tile or
    // the delta chips, so it must not blank the whole KPI row.
    publish("marketingKpis", ["uniqueVisitors", "sessions"], {
      uniqueVisitors: currentVisitors,
      sessions: currentSessions,
      pageViews: currentPageViews,
      pagesPerSession: currentSessions > 0 ? currentPageViews / currentSessions : null,
      comparison,
      availability: signalAvailability,
    });
  }

  async function assembleTechnicalKpis() {
    const perfRows = toRows(await q("performance"));
    kpis.avgResponseTimeMs = Number(toSingleValue(perfRows, "avgDuration")) || 0;
    kpis.p95ResponseTimeMs = Number(toSingleValue(perfRows, "p95Duration")) || 0;
    kpis.errorRate = Number(toSingleValue(perfRows, "errorRate")) || 0;
    kpis.clientErrorRate = Number(toSingleValue(perfRows, "clientErrorRate")) || 0;
    publish("technicalKpis", ["performance"], {
      avgResponseTimeMs: kpis.avgResponseTimeMs,
      p95ResponseTimeMs: kpis.p95ResponseTimeMs,
      errorRate: kpis.errorRate,
      clientErrorRate: kpis.clientErrorRate,
    });
  }

  async function assembleDailyTrend() {
    const dailyTrendRows = toRows(await q("dailyTrend"));
    charts.dailyTrend = dailyTrendRows.map((row) => ({
      period: row.period,
      visitors: row.visitors || 0,
      pageViews: row.pageViews || 0,
    }));
    charts.kpiSparklines = buildSparklines(dailyTrendRows);
    publish("dailyTrend", ["dailyTrend"], {
      dailyTrend: charts.dailyTrend,
      kpiSparklines: charts.kpiSparklines,
    });
  }

  async function assembleTopPages() {
    charts.topPages = toRows(await q("topPages")).map((row) => ({
      path: row.pagePath,
      views: row.viewCount ?? row.views,
      share: row.share,
    }));
    publish("topPages", ["topPages"], { topPages: charts.topPages });
  }

  async function assembleUserFlow() {
    const topNavRows = toRows(await q("topNavigation"));
    charts.topNavigationPaths = topNavRows.map((row) => ({
      from: row.from,
      to: row.to,
      count: row.transitions,
    }));
    charts.userFlow = buildSankeyFromNav(topNavRows);
    publish("userFlow", ["topNavigation"], {
      userFlow: charts.userFlow,
      topNavigationPaths: charts.topNavigationPaths,
    });
  }

  function shareList(rows, labelKey, total, listedSum) {
    return [
      ...rows.map((row) => ({
        name: row[labelKey],
        count: row.count,
        share: safeDivide(row.count, total),
      })),
      total > listedSum
        ? { name: "Other", count: total - listedSum, share: safeDivide(total - listedSum, total) }
        : null,
    ].filter(Boolean);
  }

  async function assembleTechMix(name, queryName, labelKey) {
    const rows = toRows(await q(queryName));
    const total = Number(rows[0]?.total) || rows.reduce((sum, row) => sum + (row.count || 0), 0);
    const listedSum = rows.reduce((sum, row) => sum + (row.count || 0), 0);
    const list = shareList(rows, labelKey, total, listedSum);
    charts[name] = list;
    publish(name, [queryName], { [name]: list });
  }

  async function assembleGeo() {
    const geoRows = toRows(await q("geoDistribution"));
    const totalGeo = geoRows.reduce((sum, row) => sum + (row.count || 0), 0);
    charts.geoDistribution = geoRows.map((row) => ({
      country: row.country,
      count: row.count,
      share: row.share || safeDivide(row.count, totalGeo),
    }));
    publish("geo", ["geoDistribution"], { geoDistribution: charts.geoDistribution });
  }

  async function assemblePeakHours() {
    charts.peakHours = toRows(await q("peakHours")).map((row) => ({
      dayIndex: Number(row.dayIndex),
      hour: Number(row.hour),
      count: Number(row.count) || 0,
    }));
    publish("peakHours", ["peakHours"], {
      peakHours: charts.peakHours,
      availability: signalAvailability,
    });
  }

  async function assembleCampaigns() {
    const deps = ["campaignBreakdown", "urlParams"];
    const [cR, uR] = await Promise.all(deps.map(q));
    charts.campaignBreakdown = toRows(cR).map((row) => ({
      source: row.source,
      medium: row.medium,
      campaign: row.campaign,
      visitors: Number(row.visitors) || 0,
      sessions: Number(row.sessions) || 0,
    }));
    charts.urlParams = buildUrlParamsData(toRows(uR));
    publish("campaigns", deps, {
      campaignBreakdown: charts.campaignBreakdown,
      urlParams: charts.urlParams,
    });
  }

  async function assembleReferrers() {
    charts.referrerSources = toRows(await q("referrerSources")).map((row) => ({
      source: row.source,
      count: row.count,
    }));
    publish("referrers", ["referrerSources"], { referrerSources: charts.referrerSources });
  }

  async function assembleSlowEndpoints() {
    tables.slowEndpoints = toRows(await q("slowEndpoints")).map((row) => ({
      path: row.path,
      p50: row.p50 || 0,
      p95: row.p95,
      p99: row.p99 || 0,
      avgDuration: row.avgDuration || 0,
      count: row.count,
      errorRate: row.errorRate || 0,
    }));
    publish("slowEndpoints", ["slowEndpoints"], { slowEndpoints: tables.slowEndpoints });
  }

  async function assembleBrowserTimings() {
    const rows = toRows(await q("browserTimings"));
    charts.browserTimings = rows.length > 0
      ? {
          avgNetwork: Number(rows[0].avgNetworkDuration) || 0,
          avgSend: Number(rows[0].avgSendDuration) || 0,
          avgReceive: Number(rows[0].avgReceiveDuration) || 0,
          avgProcessing: Number(rows[0].avgProcessingDuration) || 0,
          avgTotal: Number(rows[0].avgTotalDuration) || 0,
          p95Total: Number(rows[0].p95TotalDuration) || 0,
          sampleCount: Number(rows[0].sampleCount) || 0,
        }
      : null;
    publish("browserTimings", ["browserTimings"], { browserTimings: charts.browserTimings });
  }

  async function assembleSessionReplays() {
    charts.sessionReplays = buildSessionTimelines(toRows(await q("sessionTimelines")));
    publish("sessionReplays", ["sessionTimelines"], { sessionReplays: charts.sessionReplays });
  }

  // --- Backend / APM assemblers -------------------------------------------

  async function assembleBackendKpis() {
    const deps = ["dependencyOverview", "topExceptions"];
    const [doR, teR] = await Promise.all(deps.map(q));
    const ov = toRows(doR)[0] || {};
    const exRows = toRows(teR);
    backend.dependencyCalls = Number(ov.totalCalls) || 0;
    backend.dependencyFailureRate = Number(ov.failureRate) || 0;
    backend.dependencyP95Ms = Number(ov.p95Duration) || 0;
    backend.distinctTargets = Number(ov.distinctTargets) || 0;
    backend.exceptionCount = exRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
    backend.distinctExceptionTypes = new Set(exRows.map((row) => row.type)).size;
    // No hard deps: this KPI row should render even if one of dependency /
    // exception telemetry is absent — the availability flags tell the
    // frontend which tiles to gate behind a "not tracked" hint.
    publish("backendKpis", [], {
      dependencyCalls: backend.dependencyCalls,
      dependencyFailureRate: backend.dependencyFailureRate,
      dependencyP95Ms: backend.dependencyP95Ms,
      distinctTargets: backend.distinctTargets,
      exceptionCount: backend.exceptionCount,
      distinctExceptionTypes: backend.distinctExceptionTypes,
      availability: { hasDependencies, hasExceptions },
    });
  }

  async function assembleDependencies() {
    const deps = ["slowDependencies", "dependencyTypes"];
    const [sdR, dtR] = await Promise.all(deps.map(q));
    tables.slowDependencies = toRows(sdR).map((row) => ({
      target: row.target,
      type: row.type,
      p50: Number(row.p50) || 0,
      p95: Number(row.p95) || 0,
      p99: Number(row.p99) || 0,
      avgDuration: Number(row.avgDuration) || 0,
      count: Number(row.count) || 0,
      failureRate: Number(row.failureRate) || 0,
    }));
    const typeRows = toRows(dtR);
    const totalTypes = typeRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
    charts.dependencyTypes = typeRows.map((row) => ({
      type: row.type,
      count: Number(row.count) || 0,
      failureRate: Number(row.failureRate) || 0,
      share: safeDivide(Number(row.count) || 0, totalTypes),
    }));
    publish("dependencies", deps, {
      slowDependencies: tables.slowDependencies,
      dependencyTypes: charts.dependencyTypes,
      availability: { hasDependencies },
    });
  }

  async function assembleExceptions() {
    tables.topExceptions = toRows(await q("topExceptions")).map((row) => ({
      type: row.type,
      problemId: row.problemId,
      count: Number(row.count) || 0,
      affectedOperations: Number(row.affectedOperations) || 0,
      affectedUsers: Number(row.affectedUsers) || 0,
      lastSeen: row.lastSeen || null,
    }));
    publish("exceptions", ["topExceptions"], {
      topExceptions: tables.topExceptions,
      availability: { hasExceptions },
    });
  }

  async function assembleServiceHealth() {
    tables.serviceHealth = toRows(await q("serviceHealth")).map((row) => ({
      role: row.role,
      count: Number(row.count) || 0,
      avgDuration: Number(row.avgDuration) || 0,
      p95: Number(row.p95) || 0,
      errorRate: Number(row.errorRate) || 0,
    }));
    publish("serviceHealth", ["serviceHealth"], {
      serviceHealth: tables.serviceHealth,
      multiService: Boolean(readinessReport?.availableSignals?.multiService),
    });
  }

  async function assembleStatusCodes() {
    const rows = toRows(await q("statusCodes"));
    const total = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
    const order = { "2xx": 0, "3xx": 1, "4xx": 2, "5xx": 3, other: 4 };
    charts.statusCodes = rows
      .map((row) => ({
        class: row.codeClass,
        count: Number(row.count) || 0,
        share: safeDivide(Number(row.count) || 0, total),
      }))
      .sort((a, b) => (order[a.class] ?? 9) - (order[b.class] ?? 9));
    publish("statusCodes", ["statusCodes"], { statusCodes: charts.statusCodes });
  }

  // Content scoring + funnel are derived entirely on the client from the
  // navigation + top-pages data. They produce no slice of `result`; they
  // just need both arrays once both queries land.
  async function assembleNavDerived() {
    const deps = ["topNavigation", "topPages"];
    const [tnR, tpR] = await Promise.all(deps.map(q));
    const payload = {
      topNavigationPaths: toRows(tnR).map((row) => ({ from: row.from, to: row.to, count: row.transitions })),
      topPages: toRows(tpR).map((row) => ({ path: row.pagePath, views: row.viewCount ?? row.views, share: row.share })),
    };
    publish("contentScoring", deps, payload);
    publish("funnel", deps, payload);
  }

  await Promise.all([
    runAssembler(["marketingKpis"], assembleMarketingKpis),
    runAssembler(["technicalKpis"], assembleTechnicalKpis),
    runAssembler(["dailyTrend"], assembleDailyTrend),
    runAssembler(["topPages"], assembleTopPages),
    runAssembler(["userFlow"], assembleUserFlow),
    runAssembler(["browsers"], () => assembleTechMix("browsers", "techBrowser", "browser")),
    runAssembler(["os"], () => assembleTechMix("os", "techOs", "os")),
    runAssembler(["devices"], () => assembleTechMix("devices", "techDevice", "device")),
    runAssembler(["geo"], assembleGeo),
    runAssembler(["peakHours"], assemblePeakHours),
    runAssembler(["campaigns"], assembleCampaigns),
    runAssembler(["referrers"], assembleReferrers),
    runAssembler(["slowEndpoints"], assembleSlowEndpoints),
    runAssembler(["browserTimings"], assembleBrowserTimings),
    runAssembler(["sessionReplays"], assembleSessionReplays),
    runAssembler(["contentScoring", "funnel"], assembleNavDerived),
    runAssembler(["backendKpis"], assembleBackendKpis),
    runAssembler(["dependencies"], assembleDependencies),
    runAssembler(["exceptions"], assembleExceptions),
    runAssembler(["serviceHealth"], assembleServiceHealth),
    runAssembler(["statusCodes"], assembleStatusCodes),
  ]);

  // --- Compose the full dashboard object ----------------------------------
  const result = {
    kpis: {
      uniqueVisitors: kpis.uniqueVisitors,
      sessions: kpis.sessions,
      avgResponseTimeMs: kpis.avgResponseTimeMs,
      p95ResponseTimeMs: kpis.p95ResponseTimeMs,
      errorRate: kpis.errorRate,
      clientErrorRate: kpis.clientErrorRate,
      comparison: kpis.comparison,
    },
    charts: {
      dailyTrend: charts.dailyTrend,
      topPages: charts.topPages,
      topNavigationPaths: charts.topNavigationPaths,
      browsers: charts.browsers,
      os: charts.os,
      devices: charts.devices,
      geoDistribution: charts.geoDistribution,
      userFlow: charts.userFlow,
      abTests: null,
      kpiSparklines: charts.kpiSparklines,
      sessionReplays: charts.sessionReplays,
      peakHours: charts.peakHours,
      urlParams: charts.urlParams,
      campaignBreakdown: charts.campaignBreakdown,
      referrerSources: charts.referrerSources,
      browserTimings: charts.browserTimings,
      dependencyTypes: charts.dependencyTypes,
      statusCodes: charts.statusCodes,
    },
    tables: {
      slowEndpoints: tables.slowEndpoints,
      slowDependencies: tables.slowDependencies,
      topExceptions: tables.topExceptions,
      serviceHealth: tables.serviceHealth,
    },
    backend: {
      dependencyCalls: backend.dependencyCalls,
      dependencyFailureRate: backend.dependencyFailureRate,
      dependencyP95Ms: backend.dependencyP95Ms,
      distinctTargets: backend.distinctTargets,
      exceptionCount: backend.exceptionCount,
      distinctExceptionTypes: backend.distinctExceptionTypes,
    },
    availability: {
      hasPageTable: Boolean(hasPageTable),
      hasRequests: Boolean(hasRequests),
      hasGeo: Boolean(hasGeo),
      hasBrowserTimings: Boolean(hasBrowserTimings),
      hasDependencies,
      hasExceptions,
      hasUserId,
      hasSessionId,
      hasPageViews,
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

  // Narration is non-critical framing text — never let it sink a dashboard
  // whose cards have already streamed and rendered.
  try {
    result.narration = buildNarration({
      azureMode,
      dashboard: result,
      mapping,
      range: timeRange.key,
      aiMapping,
      readinessReport,
    });
  } catch (error) {
    console.error(`[dashboard] buildNarration failed: ${error.message}`);
    result.narration = null;
  }

  return result;
}
