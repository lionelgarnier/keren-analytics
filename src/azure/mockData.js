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

export const mockQueryRows = {
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
  readinessFallback: [
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
    { pagePath: "/docs", views: 1200, share: 0.1 },
    { pagePath: "/blog", views: 900, share: 0.08 },
    { pagePath: "/signup", views: 780, share: 0.07 },
  ],
  topNavigation: [
    { from: "/", to: "/pricing", transitions: 640 },
    { from: "/pricing", to: "/signup", transitions: 420 },
    { from: "/", to: "/docs", transitions: 310 },
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
    {
      avgDuration: 248,
      p95Duration: 810,
      errorRate: 0.021,
    },
  ],
  slowEndpoints: [
    { path: "/api/orders", p95: 980, count: 420 },
    { path: "/api/login", p95: 870, count: 300 },
  ],
};

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
