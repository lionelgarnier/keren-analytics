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
    const isLunchDip = h === 13;
    const base = isLunchDip ? 9 : isPeak ? 14 : isActive ? 7 : 2;
    const visitors = vary(base, 25, rng);
    hours.push({
      period: d.toISOString(),
      visitors,
      pageViews: vary(visitors * 3, 15, rng),
    });
  }
  return hours;
}

// Day of the launch spike inside the demo dataset. Placed 4 days ago so it
// lands inside both the 7d and 30d windows and tells the same story
// regardless of which range the visitor selects on first load.
const ANOMALY_DAYS_AGO = 4;
const ANOMALY_VISITORS_MULTIPLIER = 2.4;

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
    const growth = Math.floor((numDays - 1 - i) * 0.7);
    const isAnomaly = i === ANOMALY_DAYS_AGO;
    const rawBase = base + growth;
    const visitors = isAnomaly
      ? Math.round(rawBase * ANOMALY_VISITORS_MULTIPLIER)
      : vary(rawBase, 18, rng);
    days.push({
      period: d.toISOString(),
      visitors,
      pageViews: isAnomaly ? Math.round(visitors * 3.4) : vary(visitors * 3, 12, rng),
      anomaly: isAnomaly ? "traffic_spike" : undefined,
    });
  }
  return days;
}

/* ========== Multi-step user flow (Sankey data) ========== */

const PAGE_CATEGORIES = {
  "/": "funnel",
  "/pricing": "funnel",
  "/signup": "funnel",
  "/checkout": "funnel",
  "/docs": "info",
  "/blog": "info",
  "/about": "info",
  "/features": "info",
  "/changelog": "info",
  "/contact": "other",
  "/terms": "other",
  "/settings": "other",
};

function categorize(path) {
  return PAGE_CATEGORIES[path] || "other";
}

function generateUserFlow(rng) {
  // Build a realistic 5-step user flow with nodes and links
  // Each step is a column, nodes are pages/groups, links connect steps
  const nodes = [];
  const links = [];

  // Step 0: Entry pages (where users land)
  const step0 = [
    { id: "s0-/", label: "/", step: 0, group: "funnel", value: vary(1800, 10, rng) },
    { id: "s0-/blog", label: "/blog", step: 0, group: "info", value: vary(600, 14, rng) },
    { id: "s0-/docs", label: "/docs", step: 0, group: "info", value: vary(420, 15, rng) },
    { id: "s0-/about", label: "/about", step: 0, group: "other", value: vary(180, 18, rng) },
  ];

  // Step 1: 2nd page
  const step1 = [
    { id: "s1-/pricing", label: "/pricing", step: 1, group: "funnel", value: vary(920, 12, rng) },
    { id: "s1-/docs", label: "/docs", step: 1, group: "info", value: vary(480, 14, rng) },
    { id: "s1-/features", label: "/features", step: 1, group: "info", value: vary(260, 16, rng) },
    { id: "s1-/blog", label: "/blog", step: 1, group: "info", value: vary(150, 18, rng) },
    { id: "s1-exit", label: "Exit", step: 1, group: "exit", value: vary(380, 12, rng) },
  ];

  // Step 2: 3rd page
  const step2 = [
    { id: "s2-/pricing", label: "/pricing", step: 2, group: "funnel", value: vary(580, 12, rng) },
    { id: "s2-/signup", label: "/signup", step: 2, group: "funnel", value: vary(420, 14, rng) },
    { id: "s2-/docs", label: "/docs", step: 2, group: "info", value: vary(280, 15, rng) },
    { id: "s2-/about", label: "/about", step: 2, group: "other", value: vary(90, 20, rng) },
    { id: "s2-exit", label: "Exit", step: 2, group: "exit", value: vary(440, 12, rng) },
  ];

  // Step 3: 4th page
  const step3 = [
    { id: "s3-/signup", label: "/signup", step: 3, group: "funnel", value: vary(380, 14, rng) },
    { id: "s3-/pricing", label: "/pricing", step: 3, group: "funnel", value: vary(200, 16, rng) },
    { id: "s3-/docs", label: "/docs", step: 3, group: "info", value: vary(140, 18, rng) },
    { id: "s3-exit", label: "Exit", step: 3, group: "exit", value: vary(520, 10, rng) },
  ];

  // Step 4: 5th page (mostly exits and conversions)
  const step4 = [
    { id: "s4-/signup", label: "/signup", step: 4, group: "funnel", value: vary(180, 16, rng) },
    { id: "s4-/checkout", label: "/checkout", step: 4, group: "funnel", value: vary(120, 18, rng) },
    { id: "s4-exit", label: "Exit", step: 4, group: "exit", value: vary(580, 10, rng) },
  ];

  nodes.push(...step0, ...step1, ...step2, ...step3, ...step4);

  // Links: connect steps with realistic flow proportions
  // Step 0 → Step 1
  links.push(
    { source: "s0-/", target: "s1-/pricing", value: vary(640, 12, rng) },
    { source: "s0-/", target: "s1-/docs", value: vary(280, 14, rng) },
    { source: "s0-/", target: "s1-/features", value: vary(200, 16, rng) },
    { source: "s0-/", target: "s1-exit", value: vary(180, 14, rng) },
    { source: "s0-/blog", target: "s1-/pricing", value: vary(140, 16, rng) },
    { source: "s0-/blog", target: "s1-/docs", value: vary(80, 20, rng) },
    { source: "s0-/blog", target: "s1-exit", value: vary(120, 15, rng) },
    { source: "s0-/docs", target: "s1-/pricing", value: vary(120, 18, rng) },
    { source: "s0-/docs", target: "s1-/features", value: vary(60, 22, rng) },
    { source: "s0-/docs", target: "s1-exit", value: vary(60, 20, rng) },
    { source: "s0-/about", target: "s1-/pricing", value: vary(40, 22, rng) },
    { source: "s0-/about", target: "s1-/blog", value: vary(30, 25, rng) },
    { source: "s0-/about", target: "s1-exit", value: vary(30, 22, rng) },
  );
  // Step 1 → Step 2
  links.push(
    { source: "s1-/pricing", target: "s2-/signup", value: vary(380, 12, rng) },
    { source: "s1-/pricing", target: "s2-/docs", value: vary(140, 16, rng) },
    { source: "s1-/pricing", target: "s2-exit", value: vary(200, 14, rng) },
    { source: "s1-/docs", target: "s2-/pricing", value: vary(180, 14, rng) },
    { source: "s1-/docs", target: "s2-/about", value: vary(50, 22, rng) },
    { source: "s1-/docs", target: "s2-exit", value: vary(100, 16, rng) },
    { source: "s1-/features", target: "s2-/pricing", value: vary(140, 16, rng) },
    { source: "s1-/features", target: "s2-exit", value: vary(60, 20, rng) },
    { source: "s1-/blog", target: "s2-/pricing", value: vary(50, 20, rng) },
    { source: "s1-/blog", target: "s2-exit", value: vary(40, 22, rng) },
  );
  // Step 2 → Step 3
  links.push(
    { source: "s2-/signup", target: "s3-/signup", value: vary(200, 14, rng) },
    { source: "s2-/signup", target: "s3-exit", value: vary(120, 16, rng) },
    { source: "s2-/pricing", target: "s3-/signup", value: vary(180, 14, rng) },
    { source: "s2-/pricing", target: "s3-/pricing", value: vary(80, 18, rng) },
    { source: "s2-/pricing", target: "s3-exit", value: vary(180, 14, rng) },
    { source: "s2-/docs", target: "s3-/pricing", value: vary(100, 18, rng) },
    { source: "s2-/docs", target: "s3-/docs", value: vary(60, 20, rng) },
    { source: "s2-/docs", target: "s3-exit", value: vary(60, 18, rng) },
    { source: "s2-/about", target: "s3-exit", value: vary(50, 22, rng) },
  );
  // Step 3 → Step 4
  links.push(
    { source: "s3-/signup", target: "s4-/checkout", value: vary(120, 16, rng) },
    { source: "s3-/signup", target: "s4-exit", value: vary(160, 14, rng) },
    { source: "s3-/pricing", target: "s4-/signup", value: vary(100, 18, rng) },
    { source: "s3-/pricing", target: "s4-exit", value: vary(60, 20, rng) },
    { source: "s3-/docs", target: "s4-/signup", value: vary(40, 22, rng) },
    { source: "s3-/docs", target: "s4-exit", value: vary(60, 20, rng) },
  );

  return { nodes, links };
}

/* ========== A/B Test auto-detection ========== */

function generateAbTests(rng) {
  return [
    {
      param: "ab_test",
      testName: "pricing_v2",
      variants: [
        { name: "control", visitors: vary(310, 12, rng), sessions: vary(380, 12, rng), conversions: vary(18, 20, rng), avgDuration: vary(4200, 15, rng), bounceRate: vary(42, 12, rng) / 100 },
        { name: "pricing_v2", visitors: vary(305, 12, rng), sessions: vary(370, 12, rng), conversions: vary(28, 18, rng), avgDuration: vary(5100, 15, rng), bounceRate: vary(35, 14, rng) / 100 },
      ],
      detectedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      status: "running",
    },
    {
      param: "ab_test",
      testName: "cta_green",
      variants: [
        { name: "control", visitors: vary(290, 14, rng), sessions: vary(340, 14, rng), conversions: vary(22, 18, rng), avgDuration: vary(3800, 15, rng), bounceRate: vary(38, 12, rng) / 100 },
        { name: "cta_green", visitors: vary(288, 14, rng), sessions: vary(335, 14, rng), conversions: vary(31, 16, rng), avgDuration: vary(4500, 15, rng), bounceRate: vary(33, 14, rng) / 100 },
      ],
      detectedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      status: "running",
    },
  ];
}

/* ========== KPI sparklines with anomaly detection ========== */

function generateKpiSparklines(rng) {
  // 7 data points for each KPI (last 7 periods)
  function sparkline(base, volatility, trend) {
    const points = [];
    for (let i = 6; i >= 0; i--) {
      const trendVal = trend ? (6 - i) * trend : 0;
      points.push(vary(base + trendVal, volatility, rng));
    }
    return points;
  }

  function detectAnomaly(points) {
    if (points.length < 4) return null;
    const recent = points[points.length - 1];
    const prev = points.slice(0, -1);
    const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
    const stddev = Math.sqrt(prev.reduce((s, v) => s + (v - avg) ** 2, 0) / prev.length);
    if (stddev === 0) return null;
    const zScore = (recent - avg) / stddev;
    if (Math.abs(zScore) > 1.8) {
      const pctChange = ((recent - avg) / avg * 100).toFixed(0);
      return {
        direction: zScore > 0 ? "up" : "down",
        pctChange: Number(pctChange),
        zScore: Math.round(zScore * 10) / 10,
      };
    }
    return null;
  }

  const visitors = sparkline(220, 12, 7);
  const sessions = sparkline(260, 10, 9);
  // Trailing spike — tells a "errors just regressed, look here" story on the
  // KPI tile. Pairs with the visitor anomaly four days ago (separate signal).
  const errorRate = [0.018, 0.021, 0.019, 0.022, 0.020, 0.019, 0.034].map(v => vary(Math.round(v * 1000), 8, rng) / 1000);
  // Subtle downward trend on response time (perf is improving) — gives the
  // dashboard a positive secondary signal alongside the error regression.
  const avgResponse = sparkline(258, 8, -2);

  return {
    visitors: { points: visitors, anomaly: detectAnomaly(visitors) },
    sessions: { points: sessions, anomaly: detectAnomaly(sessions) },
    errorRate: { points: errorRate, anomaly: detectAnomaly(errorRate.map(v => Math.round(v * 1000))) },
    avgResponse: { points: avgResponse, anomaly: detectAnomaly(avgResponse) },
  };
}

/* ========== Session replay timelines ========== */

function generateSessionReplays(rng) {
  const now = Date.now();
  return [
    {
      sessionId: "sess-" + vary(84210, 5, rng),
      startedAt: new Date(now - vary(1800, 30, rng) * 1000).toISOString(),
      duration: vary(342, 20, rng),
      pageCount: 6,
      converted: true,
      device: "Desktop",
      country: "United States",
      events: [
        { type: "pageView", path: "/", duration: vary(12, 25, rng), timestamp: 0 },
        { type: "pageView", path: "/pricing", duration: vary(45, 20, rng), timestamp: vary(15, 20, rng) },
        { type: "click", label: "View plans", timestamp: vary(35, 20, rng) },
        { type: "pageView", path: "/pricing#enterprise", duration: vary(62, 18, rng), timestamp: vary(60, 15, rng) },
        { type: "pageView", path: "/signup", duration: vary(38, 22, rng), timestamp: vary(130, 15, rng) },
        { type: "click", label: "Create account", timestamp: vary(168, 12, rng) },
        { type: "pageView", path: "/signup/confirm", duration: vary(8, 30, rng), timestamp: vary(172, 12, rng) },
        { type: "conversion", label: "Signup completed", timestamp: vary(180, 12, rng) },
      ],
    },
    {
      sessionId: "sess-" + vary(77503, 5, rng),
      startedAt: new Date(now - vary(3600, 20, rng) * 1000).toISOString(),
      duration: vary(185, 20, rng),
      pageCount: 4,
      converted: false,
      device: "Mobile",
      country: "France",
      events: [
        { type: "pageView", path: "/blog/getting-started", duration: vary(65, 20, rng), timestamp: 0 },
        { type: "pageView", path: "/docs", duration: vary(42, 22, rng), timestamp: vary(68, 15, rng) },
        { type: "pageView", path: "/pricing", duration: vary(25, 25, rng), timestamp: vary(115, 14, rng) },
        { type: "pageView", path: "/about", duration: vary(18, 28, rng), timestamp: vary(145, 14, rng) },
        { type: "exit", label: "Left site", timestamp: vary(165, 14, rng) },
      ],
    },
    {
      sessionId: "sess-" + vary(91847, 5, rng),
      startedAt: new Date(now - vary(7200, 15, rng) * 1000).toISOString(),
      duration: vary(520, 18, rng),
      pageCount: 8,
      converted: true,
      device: "Desktop",
      country: "Germany",
      events: [
        { type: "pageView", path: "/", duration: vary(8, 30, rng), timestamp: 0 },
        { type: "pageView", path: "/features", duration: vary(55, 18, rng), timestamp: vary(10, 20, rng) },
        { type: "pageView", path: "/docs", duration: vary(120, 15, rng), timestamp: vary(70, 14, rng) },
        { type: "pageView", path: "/docs/api-reference", duration: vary(95, 18, rng), timestamp: vary(195, 12, rng) },
        { type: "click", label: "Compare plans", timestamp: vary(295, 12, rng) },
        { type: "pageView", path: "/pricing", duration: vary(80, 16, rng), timestamp: vary(300, 12, rng) },
        { type: "pageView", path: "/signup", duration: vary(45, 20, rng), timestamp: vary(385, 10, rng) },
        { type: "click", label: "Start free trial", timestamp: vary(430, 10, rng) },
        { type: "conversion", label: "Trial started", timestamp: vary(435, 10, rng) },
      ],
    },
    {
      sessionId: "sess-" + vary(63298, 5, rng),
      startedAt: new Date(now - vary(5400, 18, rng) * 1000).toISOString(),
      duration: vary(42, 25, rng),
      pageCount: 1,
      converted: false,
      device: "Mobile",
      country: "United Kingdom",
      events: [
        { type: "pageView", path: "/blog/analytics-best-practices", duration: vary(38, 22, rng), timestamp: 0 },
        { type: "exit", label: "Bounced", timestamp: vary(40, 22, rng) },
      ],
    },
    {
      sessionId: "sess-" + vary(55102, 5, rng),
      startedAt: new Date(now - vary(9000, 12, rng) * 1000).toISOString(),
      duration: vary(280, 18, rng),
      pageCount: 5,
      converted: false,
      device: "Desktop",
      country: "Canada",
      events: [
        { type: "pageView", path: "/", duration: vary(15, 22, rng), timestamp: 0 },
        { type: "pageView", path: "/docs", duration: vary(85, 16, rng), timestamp: vary(18, 18, rng) },
        { type: "pageView", path: "/docs/setup", duration: vary(60, 18, rng), timestamp: vary(108, 14, rng) },
        { type: "error", label: "404 /docs/old-page", timestamp: vary(172, 14, rng) },
        { type: "pageView", path: "/contact", duration: vary(25, 25, rng), timestamp: vary(180, 14, rng) },
        { type: "exit", label: "Left site", timestamp: vary(210, 14, rng) },
      ],
    },
  ];
}

/* ========== Peak hours heatmap ========== */

function generatePeakHours(rng) {
  // 7 days x 24 hours grid of visitor counts
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const grid = [];
  for (let d = 0; d < 7; d++) {
    const isWeekend = d >= 5;
    for (let h = 0; h < 24; h++) {
      const isNight = h < 6 || h > 22;
      const isPeak = !isWeekend && ((h >= 9 && h <= 12) || (h >= 14 && h <= 17));
      const isMorning = !isWeekend && h >= 7 && h <= 9;
      const isEvening = h >= 18 && h <= 21;
      let base = isNight ? 2 : isWeekend ? 8 : isPeak ? 28 : isMorning ? 15 : isEvening ? 12 : 8;
      // Tuesday and Wednesday are slightly higher
      if (d === 1 || d === 2) base = Math.round(base * 1.15);
      // Friday afternoon dip
      if (d === 4 && h >= 15) base = Math.round(base * 0.75);
      grid.push({
        day: days[d],
        dayIndex: d,
        hour: h,
        count: vary(base, 20, rng),
      });
    }
  }
  return grid;
}

/* ========== URL parameter auto-detection ========== */

function generateUrlParams(rng) {
  // Simulates what auto-detection would find by scanning URLs in telemetry
  return {
    // Discovered parameters with their frequency and top values
    discovered: [
      {
        param: "utm_source",
        frequency: vary(2800, 10, rng),
        isUtm: true,
        topValues: [
          { value: "google", count: vary(1100, 12, rng) },
          { value: "linkedin", count: vary(620, 14, rng) },
          { value: "twitter", count: vary(380, 16, rng) },
          { value: "newsletter", count: vary(350, 15, rng) },
          { value: "partner_acme", count: vary(180, 20, rng) },
        ],
      },
      {
        param: "utm_medium",
        frequency: vary(2800, 10, rng),
        isUtm: true,
        topValues: [
          { value: "cpc", count: vary(980, 12, rng) },
          { value: "social", count: vary(720, 14, rng) },
          { value: "email", count: vary(540, 15, rng) },
          { value: "referral", count: vary(310, 18, rng) },
          { value: "organic", count: vary(250, 18, rng) },
        ],
      },
      {
        param: "utm_campaign",
        frequency: vary(2200, 12, rng),
        isUtm: true,
        topValues: [
          { value: "spring_launch_2026", count: vary(680, 12, rng) },
          { value: "product_hunt", count: vary(420, 15, rng) },
          { value: "retargeting_q1", count: vary(380, 14, rng) },
          { value: "blog_promo", count: vary(290, 18, rng) },
          { value: "partner_webinar", count: vary(180, 20, rng) },
        ],
      },
      {
        param: "ref",
        frequency: vary(850, 15, rng),
        isUtm: false,
        topValues: [
          { value: "homepage_banner", count: vary(320, 14, rng) },
          { value: "footer_link", count: vary(210, 18, rng) },
          { value: "blog_cta", count: vary(180, 18, rng) },
          { value: "email_sig", count: vary(140, 20, rng) },
        ],
      },
      {
        param: "promo",
        frequency: vary(420, 18, rng),
        isUtm: false,
        topValues: [
          { value: "SPRING20", count: vary(220, 15, rng) },
          { value: "WELCOME10", count: vary(130, 20, rng) },
          { value: "PARTNER50", count: vary(70, 25, rng) },
        ],
      },
      {
        param: "ab_test",
        frequency: vary(1200, 12, rng),
        isUtm: false,
        topValues: [
          { value: "pricing_v2", count: vary(620, 14, rng) },
          { value: "cta_green", count: vary(580, 14, rng) },
        ],
      },
    ],
    totalUrlsScanned: vary(11500, 8, rng),
    urlsWithParams: vary(4800, 10, rng),
  };
}

function generateCampaignBreakdown(rng) {
  // UTM source x medium x campaign aggregation with metrics
  return [
    { source: "google", medium: "cpc", campaign: "spring_launch_2026", visitors: vary(480, 12, rng), sessions: vary(620, 12, rng), signups: vary(42, 18, rng), convRate: 0.068 },
    { source: "linkedin", medium: "social", campaign: "product_hunt", visitors: vary(310, 14, rng), sessions: vary(380, 14, rng), signups: vary(28, 20, rng), convRate: 0.074 },
    { source: "google", medium: "cpc", campaign: "retargeting_q1", visitors: vary(280, 14, rng), sessions: vary(340, 14, rng), signups: vary(31, 18, rng), convRate: 0.091 },
    { source: "newsletter", medium: "email", campaign: "blog_promo", visitors: vary(220, 16, rng), sessions: vary(260, 16, rng), signups: vary(18, 22, rng), convRate: 0.069 },
    { source: "twitter", medium: "social", campaign: "spring_launch_2026", visitors: vary(180, 18, rng), sessions: vary(210, 18, rng), signups: vary(8, 25, rng), convRate: 0.038 },
    { source: "partner_acme", medium: "referral", campaign: "partner_webinar", visitors: vary(120, 20, rng), sessions: vary(150, 20, rng), signups: vary(15, 22, rng), convRate: 0.100 },
    { source: "google", medium: "organic", campaign: "(none)", visitors: vary(350, 12, rng), sessions: vary(420, 12, rng), signups: vary(12, 25, rng), convRate: 0.029 },
    { source: "linkedin", medium: "social", campaign: "retargeting_q1", visitors: vary(90, 22, rng), sessions: vary(110, 22, rng), signups: vary(9, 28, rng), convRate: 0.082 },
  ];
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
      { browser: "Chrome", count: vary(2200, 8, rng), total: vary(3800, 8, rng) },
      { browser: "Mobile Safari", count: vary(560, 12, rng), total: vary(3800, 8, rng) },
      { browser: "Edge", count: vary(520, 12, rng), total: vary(3800, 8, rng) },
      { browser: "Safari", count: vary(310, 14, rng), total: vary(3800, 8, rng) },
      { browser: "Firefox", count: vary(150, 18, rng), total: vary(3800, 8, rng) },
      { browser: "Samsung Internet", count: vary(80, 22, rng), total: vary(3800, 8, rng) },
    ],
    techOs: [
      { os: "Windows", count: vary(1700, 8, rng), total: vary(3800, 8, rng) },
      { os: "macOS", count: vary(820, 12, rng), total: vary(3800, 8, rng) },
      { os: "iOS", count: vary(560, 14, rng), total: vary(3800, 8, rng) },
      { os: "Linux", count: vary(380, 15, rng), total: vary(3800, 8, rng) },
      { os: "Android", count: vary(280, 16, rng), total: vary(3800, 8, rng) },
    ],
    techDevice: [
      { device: "Desktop", count: vary(2400, 8, rng), total: vary(3800, 8, rng) },
      { device: "Mobile", count: vary(1100, 10, rng), total: vary(3800, 8, rng) },
      { device: "Tablet", count: vary(260, 18, rng), total: vary(3800, 8, rng) },
    ],
    performance: [
      {
        avgDuration: vary(248, 15, rng),
        p95Duration: vary(810, 12, rng),
        errorRate: Math.round((0.015 + seededRandom(sessionSeed()) * 0.02) * 1000) / 1000,
      },
    ],
    // /api/checkout is intentionally the unmistakable outlier so the demo
    // tells a clean "fix this first" story on the Technical tab.
    slowEndpoints: [
      { path: "/api/checkout", p50: vary(720, 10, rng), p95: vary(2400, 8, rng), p99: vary(6100, 8, rng), avgDuration: vary(1180, 10, rng), count: vary(210, 18, rng), errorRate: 0.082 },
      { path: "/api/analytics", p50: vary(520, 12, rng), p95: vary(1400, 10, rng), p99: vary(3800, 8, rng), avgDuration: vary(680, 12, rng), count: vary(150, 20, rng), errorRate: 0.06 },
      { path: "/api/orders", p50: vary(320, 12, rng), p95: vary(980, 10, rng), p99: vary(2400, 10, rng), avgDuration: vary(450, 12, rng), count: vary(420, 15, rng), errorRate: 0.03 },
      { path: "/api/search", p50: vary(250, 14, rng), p95: vary(720, 12, rng), p99: vary(1900, 10, rng), avgDuration: vary(390, 14, rng), count: vary(560, 14, rng), errorRate: 0.02 },
      { path: "/api/login", p50: vary(210, 15, rng), p95: vary(870, 12, rng), p99: vary(1800, 10, rng), avgDuration: vary(340, 15, rng), count: vary(300, 18, rng), errorRate: 0.01 },
      { path: "/api/products", p50: vary(180, 12, rng), p95: vary(650, 10, rng), p99: vary(1500, 10, rng), avgDuration: vary(280, 12, rng), count: vary(890, 12, rng), errorRate: 0.005 },
      { path: "/api/users/me", p50: vary(45, 20, rng), p95: vary(180, 15, rng), p99: vary(450, 12, rng), avgDuration: vary(80, 18, rng), count: vary(1200, 10, rng), errorRate: 0.002 },
    ],
    geoDistribution: [
      { country: "United States", count: vary(1200, 10, rng), share: 0.31 },
      { country: "France", count: vary(450, 14, rng), share: 0.12 },
      { country: "Germany", count: vary(380, 14, rng), share: 0.10 },
      { country: "United Kingdom", count: vary(330, 14, rng), share: 0.09 },
      { country: "Canada", count: vary(280, 15, rng), share: 0.07 },
      { country: "Netherlands", count: vary(220, 16, rng), share: 0.06 },
      { country: "Spain", count: vary(190, 16, rng), share: 0.05 },
      { country: "Italy", count: vary(170, 17, rng), share: 0.045 },
      { country: "Australia", count: vary(150, 18, rng), share: 0.04 },
      { country: "Japan", count: vary(150, 20, rng), share: 0.04 },
      { country: "Brazil", count: vary(110, 20, rng), share: 0.03 },
      { country: "India", count: vary(95, 22, rng), share: 0.025 },
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
    userFlow: generateUserFlow(rng),
    // Peak hours heatmap (day-of-week x hour)
    peakHours: generatePeakHours(rng),
    // A/B Test auto-detected variants comparison
    abTests: generateAbTests(rng),
    // KPI sparklines (7 data points for mini trend)
    kpiSparklines: generateKpiSparklines(rng),
    // Session replay timelines (sample sessions)
    sessionReplays: generateSessionReplays(rng),
    // Auto-detected URL parameters with top values
    urlParams: generateUrlParams(rng),
    // Campaign (UTM) breakdown with metrics
    campaignBreakdown: generateCampaignBreakdown(rng),
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

  // A/B tests
  if (queryName === "abTests") {
    return baseline.abTests.map((t) => ({
      ...t,
      variants: t.variants.map((v) => ({
        ...v,
        visitors: scale(v.visitors, rk),
        sessions: scale(v.sessions, rk),
        conversions: scale(v.conversions, rk),
      })),
    }));
  }
  // KPI sparklines
  if (queryName === "kpiSparklines") {
    return baseline.kpiSparklines;
  }
  // Session replays
  if (queryName === "sessionReplays") {
    return baseline.sessionReplays;
  }

  // Peak hours heatmap
  if (queryName === "peakHours") {
    return baseline.peakHours.map((r) => ({ ...r, count: scale(r.count, rk) }));
  }

  // URL parameters — scale frequencies
  if (queryName === "urlParams") {
    const params = baseline.urlParams;
    return {
      discovered: params.discovered.map((p) => ({
        ...p,
        frequency: scale(p.frequency, rk),
        topValues: p.topValues.map((v) => ({ ...v, count: scale(v.count, rk) })),
      })),
      totalUrlsScanned: scale(params.totalUrlsScanned, rk),
      urlsWithParams: scale(params.urlsWithParams, rk),
    };
  }
  if (queryName === "campaignBreakdown") {
    return baseline.campaignBreakdown.map((r) => ({
      ...r,
      visitors: scale(r.visitors, rk),
      sessions: scale(r.sessions, rk),
      signups: scale(r.signups, rk),
    }));
  }

  // User flow — scale all values by range
  if (queryName === "userFlow") {
    const flow = baseline.userFlow;
    return {
      nodes: flow.nodes.map((n) => ({ ...n, value: scale(n.value, rk) })),
      links: flow.links.map((l) => ({ ...l, value: scale(l.value, rk) })),
    };
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
