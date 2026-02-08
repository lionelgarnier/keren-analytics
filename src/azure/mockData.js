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

/* ========== Realistic random helpers ========== */

/** Seeded random that changes every few minutes (keeps demo stable within a page load) */
function sessionSeed() {
  return Math.floor(Date.now() / (3 * 60 * 1000));
}

/** Simple seeded pseudo-random (mulberry32) */
function seededRandom(seed) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Returns a function that produces consistent pseudo-random numbers for this session */
function createRng() {
  let s = sessionSeed();
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s >>> 0) / 0x7fffffff;
  };
}

/** Add realistic variance: +/- pct% around value */
function vary(value, pct, rng) {
  const factor = 1 + (rng() * 2 - 1) * (pct / 100);
  return Math.max(1, Math.round(value * factor));
}

/* ========== Range-aware multipliers ========== */
const RANGE_SCALE = { today: 0.07, "7d": 0.25, "30d": 1.0 };

function scale(value, rangeKey) {
  return Math.round(value * (RANGE_SCALE[rangeKey] || 1));
}

/* ========== Daily trend generators ========== */

function generateHourlyTrend() {
  const hours = [];
  const now = new Date();
  const rng = createRng();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCHours(d.getUTCHours() - i, 0, 0, 0);
    const h = d.getUTCHours();
    const isActive = h >= 7 && h <= 22;
    const isPeak = (h >= 9 && h <= 12) || (h >= 14 && h <= 18);
    const base = isPeak ? 14 : isActive ? 7 : 2;
    const visitors = vary(base, 25, rng);
    hours.push({
      period: d.toISOString(),
      visitors,
      pageViews: vary(visitors * 3, 15, rng),
    });
  }
  return hours;
}

function generateDailyTrend(numDays) {
  const days = [];
  const now = new Date();
  const rng = createRng();
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    const dow = d.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const base = isWeekend ? 35 : 58;
    const growth = Math.floor((numDays - 1 - i) * 0.5);
    const visitors = vary(base + growth, 18, rng);
    days.push({
      period: d.toISOString(),
      visitors,
      pageViews: vary(visitors * 3, 12, rng),
    });
  }
  return days;
}

/* ========== Baseline data (30d) with variance ========== */

function generateBaseline() {
  const rng = createRng();

  return {
    readiness: [
      {
        pageViewsCount: vary(4200, 10, rng),
        requestsCount: vary(3900, 10, rng),
        userAuthCount: vary(800, 15, rng),
        userAnonCount: vary(3500, 10, rng),
        sessionCount: vary(2100, 10, rng),
        requestSessionCount: vary(2000, 10, rng),
        browserCount: vary(3800, 8, rng),
        osCount: vary(3700, 8, rng),
        deviceCount: vary(3200, 8, rng),
        geoCount: vary(3000, 10, rng),
        browserTimingsCount: vary(900, 15, rng),
        latestTimestamp: new Date().toISOString(),
      },
    ],
    schemaTables: [
      { tableName: "pageViews", count: vary(4200, 10, rng) },
      { tableName: "requests", count: vary(3900, 10, rng) },
      { tableName: "browserTimings", count: vary(900, 15, rng) },
    ],
    schemaCustomDimensions: [
      { tableName: "pageViews", key: "page", keyCount: vary(1200, 12, rng) },
      { tableName: "requests", key: "sessionId", keyCount: vary(800, 12, rng) },
      { tableName: "customEvents", key: "checkoutStep", keyCount: vary(120, 20, rng) },
    ],
    uniqueVisitors: [{ uniqueVisitors: vary(1523, 12, rng) }],
    sessions: [{ sessions: vary(1844, 12, rng) }],
    topPages: [
      { pagePath: "/", views: vary(3200, 10, rng), share: 0.28 },
      { pagePath: "/pricing", views: vary(1800, 12, rng), share: 0.16 },
      { pagePath: "/docs", views: vary(1200, 14, rng), share: 0.10 },
      { pagePath: "/blog", views: vary(900, 15, rng), share: 0.08 },
      { pagePath: "/signup", views: vary(780, 15, rng), share: 0.07 },
      { pagePath: "/about", views: vary(620, 18, rng), share: 0.05 },
      { pagePath: "/contact", views: vary(410, 18, rng), share: 0.04 },
      { pagePath: "/features", views: vary(380, 18, rng), share: 0.03 },
      { pagePath: "/changelog", views: vary(290, 20, rng), share: 0.025 },
      { pagePath: "/terms", views: vary(120, 25, rng), share: 0.01 },
    ],
    topNavigation: [
      { from: "/", to: "/pricing", transitions: vary(640, 12, rng) },
      { from: "/pricing", to: "/signup", transitions: vary(420, 14, rng) },
      { from: "/", to: "/docs", transitions: vary(310, 14, rng) },
      { from: "/docs", to: "/pricing", transitions: vary(180, 18, rng) },
      { from: "/blog", to: "/signup", transitions: vary(95, 20, rng) },
    ],
    techBrowser: [
      { browser: "Chrome", count: vary(2300, 8, rng), total: vary(3600, 8, rng) },
      { browser: "Edge", count: vary(700, 12, rng), total: vary(3600, 8, rng) },
      { browser: "Safari", count: vary(400, 15, rng), total: vary(3600, 8, rng) },
      { browser: "Firefox", count: vary(200, 18, rng), total: vary(3600, 8, rng) },
    ],
    techOs: [
      { os: "Windows", count: vary(1900, 8, rng), total: vary(3600, 8, rng) },
      { os: "macOS", count: vary(900, 12, rng), total: vary(3600, 8, rng) },
      { os: "Linux", count: vary(500, 15, rng), total: vary(3600, 8, rng) },
      { os: "iOS", count: vary(200, 18, rng), total: vary(3600, 8, rng) },
    ],
    techDevice: [
      { device: "Desktop", count: vary(2500, 8, rng), total: vary(3600, 8, rng) },
      { device: "Mobile", count: vary(900, 12, rng), total: vary(3600, 8, rng) },
      { device: "Tablet", count: vary(200, 20, rng), total: vary(3600, 8, rng) },
    ],
    performance: [
      {
        avgDuration: vary(248, 15, rng),
        p95Duration: vary(810, 12, rng),
        errorRate: Math.round((0.015 + seededRandom(sessionSeed()) * 0.02) * 1000) / 1000,
      },
    ],
    slowEndpoints: [
      { path: "/api/orders", p50: vary(320, 12, rng), p95: vary(980, 10, rng), p99: vary(2400, 10, rng), avgDuration: vary(450, 12, rng), count: vary(420, 15, rng), errorRate: 0.03 },
      { path: "/api/login", p50: vary(210, 15, rng), p95: vary(870, 12, rng), p99: vary(1800, 10, rng), avgDuration: vary(340, 15, rng), count: vary(300, 18, rng), errorRate: 0.01 },
      { path: "/api/products", p50: vary(180, 12, rng), p95: vary(650, 10, rng), p99: vary(1500, 10, rng), avgDuration: vary(280, 12, rng), count: vary(890, 12, rng), errorRate: 0.005 },
      { path: "/api/search", p50: vary(250, 14, rng), p95: vary(720, 12, rng), p99: vary(1900, 10, rng), avgDuration: vary(390, 14, rng), count: vary(560, 14, rng), errorRate: 0.02 },
      { path: "/api/checkout", p50: vary(340, 12, rng), p95: vary(1100, 10, rng), p99: vary(3200, 8, rng), avgDuration: vary(520, 12, rng), count: vary(210, 18, rng), errorRate: 0.045 },
      { path: "/api/users/me", p50: vary(45, 20, rng), p95: vary(180, 15, rng), p99: vary(450, 12, rng), avgDuration: vary(80, 18, rng), count: vary(1200, 10, rng), errorRate: 0.002 },
      { path: "/api/analytics", p50: vary(520, 12, rng), p95: vary(1400, 10, rng), p99: vary(3800, 8, rng), avgDuration: vary(680, 12, rng), count: vary(150, 20, rng), errorRate: 0.06 },
    ],
    geoDistribution: [
      { country: "United States", count: vary(1200, 10, rng), share: 0.36 },
      { country: "France", count: vary(450, 14, rng), share: 0.13 },
      { country: "Germany", count: vary(380, 14, rng), share: 0.11 },
      { country: "United Kingdom", count: vary(320, 15, rng), share: 0.10 },
      { country: "Canada", count: vary(280, 15, rng), share: 0.08 },
      { country: "Netherlands", count: vary(190, 18, rng), share: 0.06 },
      { country: "Japan", count: vary(150, 20, rng), share: 0.04 },
      { country: "Australia", count: vary(120, 20, rng), share: 0.04 },
      { country: "Brazil", count: vary(95, 22, rng), share: 0.03 },
      { country: "India", count: vary(80, 25, rng), share: 0.02 },
    ],
    browserTimings: [
      {
        avgNetworkDuration: vary(85, 15, rng),
        avgSendDuration: vary(12, 20, rng),
        avgReceiveDuration: vary(38, 18, rng),
        avgProcessingDuration: vary(320, 12, rng),
        avgTotalDuration: vary(480, 12, rng),
        p95TotalDuration: vary(1200, 10, rng),
        sampleCount: vary(900, 15, rng),
      },
    ],
    referrerSources: [
      { source: "Direct", count: vary(1800, 10, rng) },
      { source: "Organic Search", count: vary(1100, 12, rng) },
      { source: "Referral", count: vary(480, 15, rng) },
      { source: "Social", count: vary(320, 18, rng) },
      { source: "Email", count: vary(180, 20, rng) },
    ],
  };
}

// Generate baseline once per module load (stable within a server restart,
// but varies between restarts for a realistic feel)
const baseline = generateBaseline();

/* ========== Public API ========== */

/**
 * Return mock rows for a given query name, adapted to the requested time range.
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
    return [{ uniqueVisitors: scale(baseline.uniqueVisitors[0].uniqueVisitors, rk) }];
  }
  if (queryName === "sessions") {
    return [{ sessions: scale(baseline.sessions[0].sessions, rk) }];
  }

  // Count-based tables — scale counts
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
    const t = scale(baseline.techBrowser[0].total, rk);
    return baseline.techBrowser.map((r) => ({ ...r, count: scale(r.count, rk), total: t }));
  }
  if (queryName === "techOs") {
    const t = scale(baseline.techOs[0].total, rk);
    return baseline.techOs.map((r) => ({ ...r, count: scale(r.count, rk), total: t }));
  }
  if (queryName === "techDevice") {
    const t = scale(baseline.techDevice[0].total, rk);
    return baseline.techDevice.map((r) => ({ ...r, count: scale(r.count, rk), total: t }));
  }
  if (queryName === "browserTimings") {
    return baseline.browserTimings.map((r) => ({ ...r, sampleCount: scale(r.sampleCount, rk) }));
  }
  if (queryName === "referrerSources") {
    return baseline.referrerSources.map((r) => ({ ...r, count: scale(r.count, rk) }));
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
