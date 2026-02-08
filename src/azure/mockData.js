export const mockResources = [
  {
    resourceId:
      "/subscriptions/mock-sub/resourceGroups/mock-rg/providers/Microsoft.Insights/components/mock-appinsights",
    subscriptionId: "mock-sub",
    resourceGroup: "mock-rg",
    appInsightsName: "mock-appinsights",
    workspaceId:
      "/subscriptions/mock-sub/resourceGroups/mock-rg/providers/Microsoft.OperationalInsights/workspaces/mock-law",
    lastTelemetryAt: new Date().toISOString(),
    environmentHint: "prod",
  },
  {
    resourceId:
      "/subscriptions/mock-sub/resourceGroups/mock-rg/providers/Microsoft.Insights/components/mock-appinsights-staging",
    subscriptionId: "mock-sub",
    resourceGroup: "mock-rg",
    appInsightsName: "mock-appinsights-staging",
    workspaceId:
      "/subscriptions/mock-sub/resourceGroups/mock-rg/providers/Microsoft.OperationalInsights/workspaces/mock-law-staging",
    lastTelemetryAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    environmentHint: "staging",
  },
];

/* ========== Range-aware multipliers ========== */
const RANGE_SCALE = { today: 0.07, "7d": 0.25, "30d": 1.0 };

function scale(value, rangeKey) {
  return Math.round(value * (RANGE_SCALE[rangeKey] || 1));
}

/* ========== Daily trend generators ========== */

function generateHourlyTrend() {
  const hours = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCHours(d.getUTCHours() - i, 0, 0, 0);
    const h = d.getUTCHours();
    const isActive = h >= 7 && h <= 22;
    const isPeak = h >= 9 && h <= 12 || h >= 14 && h <= 18;
    const base = isPeak ? 12 : isActive ? 6 : 2;
    const variation = ((i * 3 + 1) % 5) - 2;
    const visitors = Math.max(1, base + variation);
    hours.push({
      period: d.toISOString(),
      visitors,
      pageViews: visitors * 3 + ((i * 7) % 5),
    });
  }
  return hours;
}

function generateDailyTrend(numDays) {
  const days = [];
  const now = new Date();
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    const dow = d.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const base = isWeekend ? 35 : 55;
    const growth = Math.floor((numDays - 1 - i) * 0.4);
    const variation = ((i * 7 + 3) % 11) - 5;
    const visitors = Math.max(10, base + growth + variation);
    days.push({
      period: d.toISOString(),
      visitors,
      pageViews: visitors * 3 + ((i * 13) % 20),
    });
  }
  return days;
}

/* ========== Baseline data (30d) ========== */

const baseline = {
  readiness: [
    {
      pageViewsCount: 4200,
      requestsCount: 3900,
      userAuthCount: 800,
      userAnonCount: 3500,
      sessionCount: 2100,
      requestSessionCount: 2000,
      browserCount: 3800,
      osCount: 3700,
      deviceCount: 3200,
      geoCount: 3000,
      browserTimingsCount: 900,
      latestTimestamp: new Date().toISOString(),
    },
  ],
  schemaTables: [
    { tableName: "pageViews", count: 4200 },
    { tableName: "requests", count: 3900 },
    { tableName: "browserTimings", count: 900 },
  ],
  schemaCustomDimensions: [
    { tableName: "pageViews", key: "page", keyCount: 1200 },
    { tableName: "requests", key: "sessionId", keyCount: 800 },
    { tableName: "customEvents", key: "checkoutStep", keyCount: 120 },
  ],
  uniqueVisitors: [{ uniqueVisitors: 1523 }],
  sessions: [{ sessions: 1844 }],
  topPages: [
    { pagePath: "/", views: 3200, share: 0.28 },
    { pagePath: "/pricing", views: 1800, share: 0.16 },
    { pagePath: "/docs", views: 1200, share: 0.10 },
    { pagePath: "/blog", views: 900, share: 0.08 },
    { pagePath: "/signup", views: 780, share: 0.07 },
    { pagePath: "/about", views: 620, share: 0.05 },
    { pagePath: "/contact", views: 410, share: 0.04 },
    { pagePath: "/features", views: 380, share: 0.03 },
    { pagePath: "/changelog", views: 290, share: 0.025 },
    { pagePath: "/terms", views: 120, share: 0.01 },
  ],
  topNavigation: [
    { from: "/", to: "/pricing", transitions: 640 },
    { from: "/pricing", to: "/signup", transitions: 420 },
    { from: "/", to: "/docs", transitions: 310 },
    { from: "/docs", to: "/pricing", transitions: 180 },
    { from: "/blog", to: "/signup", transitions: 95 },
  ],
  techBrowser: [
    { browser: "Chrome", count: 2300, total: 3600 },
    { browser: "Edge", count: 700, total: 3600 },
    { browser: "Safari", count: 400, total: 3600 },
    { browser: "Firefox", count: 200, total: 3600 },
  ],
  techOs: [
    { os: "Windows", count: 1900, total: 3600 },
    { os: "macOS", count: 900, total: 3600 },
    { os: "Linux", count: 500, total: 3600 },
    { os: "iOS", count: 200, total: 3600 },
  ],
  techDevice: [
    { device: "Desktop", count: 2500, total: 3600 },
    { device: "Mobile", count: 900, total: 3600 },
    { device: "Tablet", count: 200, total: 3600 },
  ],
  performance: [
    { avgDuration: 248, p95Duration: 810, errorRate: 0.021 },
  ],
  slowEndpoints: [
    { path: "/api/orders", p50: 320, p95: 980, p99: 2400, avgDuration: 450, count: 420, errorRate: 0.03 },
    { path: "/api/login", p50: 210, p95: 870, p99: 1800, avgDuration: 340, count: 300, errorRate: 0.01 },
    { path: "/api/products", p50: 180, p95: 650, p99: 1500, avgDuration: 280, count: 890, errorRate: 0.005 },
    { path: "/api/search", p50: 250, p95: 720, p99: 1900, avgDuration: 390, count: 560, errorRate: 0.02 },
    { path: "/api/checkout", p50: 340, p95: 1100, p99: 3200, avgDuration: 520, count: 210, errorRate: 0.045 },
    { path: "/api/users/me", p50: 45, p95: 180, p99: 450, avgDuration: 80, count: 1200, errorRate: 0.002 },
    { path: "/api/analytics", p50: 520, p95: 1400, p99: 3800, avgDuration: 680, count: 150, errorRate: 0.06 },
  ],
  geoDistribution: [
    { country: "United States", count: 1200, share: 0.36 },
    { country: "France", count: 450, share: 0.13 },
    { country: "Germany", count: 380, share: 0.11 },
    { country: "United Kingdom", count: 320, share: 0.10 },
    { country: "Canada", count: 280, share: 0.08 },
    { country: "Netherlands", count: 190, share: 0.06 },
    { country: "Japan", count: 150, share: 0.04 },
    { country: "Australia", count: 120, share: 0.04 },
    { country: "Brazil", count: 95, share: 0.03 },
    { country: "India", count: 80, share: 0.02 },
  ],
  browserTimings: [
    {
      avgNetworkDuration: 85,
      avgSendDuration: 12,
      avgReceiveDuration: 38,
      avgProcessingDuration: 320,
      avgTotalDuration: 480,
      p95TotalDuration: 1200,
      sampleCount: 900,
    },
  ],
};

/* ========== Endpoint detail generator ========== */

function generateEndpointDetail(numPoints, baseAvg, baseP95) {
  const points = [];
  const now = new Date();
  for (let i = numPoints - 1; i >= 0; i--) {
    const d = new Date(now);
    if (numPoints <= 24) {
      d.setUTCHours(d.getUTCHours() - i, 0, 0, 0);
    } else {
      d.setUTCDate(d.getUTCDate() - i);
      d.setUTCHours(0, 0, 0, 0);
    }
    const variation = ((i * 7 + 3) % 11) - 5;
    const avgDuration = Math.max(10, baseAvg + variation * 10);
    const p95 = Math.max(avgDuration * 1.5, baseP95 + variation * 20);
    points.push({
      period: d.toISOString(),
      avgDuration: Math.round(avgDuration),
      p50: Math.round(avgDuration * 0.8),
      p95: Math.round(p95),
      p99: Math.round(p95 * 1.5),
      count: Math.max(5, 30 + ((i * 3) % 15) - 7),
      errorRate: Math.max(0, (0.02 + ((i * 5) % 7) * 0.005 - 0.01)),
    });
  }
  return points;
}

/* ========== Public API ========== */

/**
 * Return mock rows for a given query name, adapted to the requested time range.
 * - dailyTrend: returns hourly points for "today", 7 points for "7d", 30 for "30d"
 * - KPI and count-based queries: values scaled proportionally to the range
 * - Readiness / schema / tech / performance: returned as-is (range-independent)
 */
export function getMockRows(queryName, timeRangeKey) {
  const rk = timeRangeKey || "7d";

  // Daily trend — range-specific shape
  if (queryName === "dailyTrend") {
    if (rk === "today") return generateHourlyTrend();
    if (rk === "7d") return generateDailyTrend(7);
    return generateDailyTrend(30);
  }

  // KPIs — scale by range
  if (queryName === "uniqueVisitors") {
    return [{ uniqueVisitors: scale(1523, rk) }];
  }
  if (queryName === "sessions") {
    return [{ sessions: scale(1844, rk) }];
  }

  // Count-based tables — scale counts, keep shares
  if (queryName === "topPages") {
    return baseline.topPages.map((r) => ({ ...r, views: scale(r.views, rk) }));
  }
  if (queryName === "topNavigation") {
    return baseline.topNavigation.map((r) => ({ ...r, transitions: scale(r.transitions, rk) }));
  }
  if (queryName === "slowEndpoints") {
    return baseline.slowEndpoints.map((r) => ({ ...r, count: scale(r.count, rk) }));
  }
  if (queryName === "geoDistribution") {
    return baseline.geoDistribution.map((r) => ({ ...r, count: scale(r.count, rk) }));
  }

  // Tech distributions — scale counts + totals
  if (queryName === "techBrowser") {
    const t = scale(3600, rk);
    return baseline.techBrowser.map((r) => ({ ...r, count: scale(r.count, rk), total: t }));
  }
  if (queryName === "techOs") {
    const t = scale(3600, rk);
    return baseline.techOs.map((r) => ({ ...r, count: scale(r.count, rk), total: t }));
  }
  if (queryName === "techDevice") {
    const t = scale(3600, rk);
    return baseline.techDevice.map((r) => ({ ...r, count: scale(r.count, rk), total: t }));
  }
  if (queryName === "browserTimings") {
    return baseline.browserTimings.map((r) => ({ ...r, sampleCount: scale(r.sampleCount, rk) }));
  }

  // Endpoint detail
  if (queryName === "endpointDetail") {
    const numPoints = rk === "today" ? 24 : rk === "30d" ? 30 : 7;
    return generateEndpointDetail(numPoints, 280, 800);
  }

  // Readiness, schema, performance — range-independent
  if (queryName === "readinessFallback") return baseline.readiness;
  return baseline[queryName] || [];
}

// Keep backward-compatible export for tests
export const mockQueryRows = baseline;

export function buildTable(rows) {
  if (!rows || rows.length === 0) {
    return {
      tables: [
        {
          name: "PrimaryResult",
          columns: [],
          rows: [],
        },
      ],
    };
  }
  const columns = Object.keys(rows[0]).map((name) => ({
    name,
    type: typeof rows[0][name] === "number" ? "real" : "string",
  }));
  const tableRows = rows.map((row) => columns.map((col) => row[col.name]));
  return {
    tables: [
      {
        name: "PrimaryResult",
        columns,
        rows: tableRows,
      },
    ],
  };
}
