/* Dashboard mock data — realistic for vikl.fr.
   Single source so both variants stay in sync. */

const DASH_KPIS_MARKETING = [
  { label: 'Unique visitors', value: '42,189', delta: '+12.4%', trend: 'up', spark: 'rising', compare: '37,521 prev 7d' },
  { label: 'Sessions',        value: '58,402', delta: '+8.7%',  trend: 'up', spark: 'rising', compare: '53,723 prev 7d' },
  { label: 'Page views',      value: '184,210', delta: '+5.2%', trend: 'up', spark: 'mound',  compare: '175,094 prev 7d' },
  { label: 'Pages / session', value: '3.15',   delta: '−2.1%',  trend: 'down', spark: 'flat', compare: '3.22 prev 7d' },
];

const DASH_KPIS_TECHNICAL = [
  { label: 'Avg response',  value: '142',   unit: 'ms',  delta: '−6.0%', trend: 'up',   spark: 'flat',  compare: '151 ms prev 7d' },
  { label: 'P95 response',  value: '480',   unit: 'ms',  delta: '+3.4%', trend: 'down', spark: 'spiky', compare: '464 ms prev 7d' },
  { label: 'Error rate',    value: '0.42',  unit: '%',   delta: '−0.18 pt', trend: 'up', spark: 'flat', compare: '0.60 % prev 7d' },
  { label: 'Frontend avg',  value: '1,240', unit: 'ms',  delta: '+1.1%', trend: 'down', spark: 'rising', compare: '1,226 ms prev 7d' },
];

const DASH_INSIGHTS = [
  { kind: 'ok',   text: 'Error rate healthy at 0.42% — well under 3% threshold.' },
  { kind: 'up',   text: 'Sessions up 8.7% vs last week, driven by /pricing (+34%).' },
  { kind: 'warn', text: 'P95 response trending up — investigate /api/exports.' },
];

const DASH_TOP_PAGES = [
  { path: '/',                   views: 48210, share: 26.2 },
  { path: '/pricing',            views: 22140, share: 12.0 },
  { path: '/blog/anatomie-saas', views: 18302, share: 9.9 },
  { path: '/login',              views: 14580, share: 7.9 },
  { path: '/dashboard',          views: 12410, share: 6.7 },
  { path: '/docs/getting-started', views: 9802, share: 5.3 },
  { path: '/changelog',          views: 7104,  share: 3.9 },
];

const DASH_GEO = [
  { country: 'France',         iso: 'FR', share: 58.4, visitors: 24634 },
  { country: 'United States',  iso: 'US', share: 12.1, visitors: 5104 },
  { country: 'United Kingdom', iso: 'GB', share: 7.8,  visitors: 3290 },
  { country: 'Germany',        iso: 'DE', share: 5.2,  visitors: 2194 },
  { country: 'Spain',          iso: 'ES', share: 3.9,  visitors: 1645 },
  { country: 'Belgium',        iso: 'BE', share: 2.7,  visitors: 1139 },
];

const DASH_CAMPAIGNS = [
  { source: 'google',    medium: 'cpc',     campaign: 'spring-saas',    visitors: 8210, sessions: 11042 },
  { source: 'linkedin',  medium: 'social',  campaign: 'launch-2026',    visitors: 3420, sessions: 4710 },
  { source: 'newsletter',medium: 'email',   campaign: 'weekly-digest',  visitors: 2104, sessions: 2890 },
  { source: 'producthunt', medium: 'referral', campaign: 'launch-day',  visitors: 1840, sessions: 2430 },
];

const DASH_BROWSERS = [
  { name: 'Chrome',  pct: 62.4, color: 'a' },
  { name: 'Safari',  pct: 18.2, color: 'b' },
  { name: 'Firefox', pct: 8.7,  color: 'c' },
  { name: 'Edge',    pct: 7.1,  color: 'd' },
  { name: 'Other',   pct: 3.6,  color: 'e' },
];
const DASH_OS = [
  { name: 'macOS',   pct: 38.5, color: 'a' },
  { name: 'Windows', pct: 32.1, color: 'b' },
  { name: 'iOS',     pct: 14.4, color: 'c' },
  { name: 'Android', pct: 10.2, color: 'd' },
  { name: 'Linux',   pct: 4.8,  color: 'e' },
];
const DASH_DEVICES = [
  { name: 'Desktop', pct: 71.2, color: 'a' },
  { name: 'Mobile',  pct: 24.5, color: 'b' },
  { name: 'Tablet',  pct: 4.3,  color: 'c' },
];

// 7×24 heatmap grid (rows = days Mon→Sun, cols = hours 0→23)
const DASH_PEAK_HOURS = (() => {
  const rows = [];
  for (let d = 0; d < 7; d++) {
    const row = [];
    for (let h = 0; h < 24; h++) {
      // Peak hours: 9-12 and 14-18 on weekdays; weekend dip
      const weekend = d >= 5 ? 0.45 : 1;
      const peak = (h >= 9 && h <= 12) || (h >= 14 && h <= 18) ? 0.9 : (h >= 7 && h <= 21 ? 0.55 : 0.18);
      const noise = (Math.sin(d * 7 + h * 2.3) + 1) * 0.15;
      row.push(Math.min(1, peak * weekend + noise * 0.3));
    }
    rows.push(row);
  }
  return rows;
})();

const DASH_FUNNEL = [
  { step: 'Landing',   count: 42189, pct: 100 },
  { step: 'Viewed pricing', count: 22140, pct: 52.5 },
  { step: 'Started signup', count: 6840,  pct: 16.2 },
  { step: 'Completed signup', count: 4210, pct: 10.0 },
];

const DASH_SLOW_ENDPOINTS = [
  { path: 'GET /api/exports/csv',     p50: 612, p95: 2840, p99: 4120, calls: 1042, err: 0.8 },
  { path: 'POST /api/dashboard/save', p50: 410, p95: 1820, p99: 2940, calls: 2810, err: 0.2 },
  { path: 'GET /api/insights/run',    p50: 320, p95: 1240, p99: 1890, calls: 8201, err: 1.4 },
  { path: 'GET /api/scan/schema',     p50: 240, p95:  920, p99: 1480, calls: 612,  err: 0.0 },
  { path: 'GET /api/workspaces',      p50:  74, p95:  220, p99:  410, calls: 18420, err: 0.1 },
];

const DASH_SESSIONS = [
  { id: 'sess_9f2a…0c', country: 'FR', device: 'Desktop', steps: 8, dur: '3m 42s', endedOk: true,
    timeline: ['/', '/pricing', '/login', '/dashboard', '/dashboard/marketing', '/dashboard/technical', '/settings', '/logout'] },
  { id: 'sess_77b1…e4', country: 'US', device: 'Mobile',  steps: 5, dur: '1m 18s', endedOk: false,
    timeline: ['/', '/blog/anatomie-saas', '/pricing', '/signup', '✕ 500'] },
  { id: 'sess_3c0d…91', country: 'GB', device: 'Desktop', steps: 11, dur: '6m 04s', endedOk: true,
    timeline: ['/', '/docs/getting-started', '/docs/azure-setup', '/pricing', '/login', '/dashboard', '/dashboard/readiness', '/setup', '/services', '/dashboard', '/logout'] },
];

const DASH_READINESS_SIGNALS = [
  { name: 'Request telemetry',    weight: 18, score: 18, state: 'ok',   sub: 'Captured on every request · 154/154 events' },
  { name: 'Browser timings',      weight: 14, score: 14, state: 'ok',   sub: 'JS SDK active · 42K samples / 7d' },
  { name: 'Page routes',          weight: 12, score: 12, state: 'ok',   sub: '92% routes resolved to a canonical path' },
  { name: 'Geographic data',      weight: 10, score: 10, state: 'ok',   sub: 'client_CountryOrRegion present on 99% events' },
  { name: 'Device & tech',        weight: 10, score: 9,  state: 'ok',   sub: 'browser + OS detected · device sparse on iOS' },
  { name: 'Custom dimensions',    weight: 8,  score: 8,  state: 'ok',   sub: '30 dimensions captured · 25 unused' },
  { name: 'Session continuity',   weight: 10, score: 0,  state: 'miss', sub: 'No session id emitted', missing: 'session_Id' },
  { name: 'User identity',        weight: 12, score: 0,  state: 'miss', sub: 'No canonical user id', missing: 'user_AuthenticatedId' },
  { name: 'Campaign attribution', weight: 6,  score: 0,  state: 'miss', sub: 'UTM params not captured', missing: 'utm_source' },
];

const DASH_MISSING_PROMPTS = [
  { field: 'session_Id',
    title: 'Emit a stable session identifier',
    desc: 'Generate a UUID at session start, persist in sessionStorage, attach to every event and request.',
    impact: 'Session continuity · User flow · Funnel' },
  { field: 'user_AuthenticatedId',
    title: 'Attach the canonical user id',
    desc: 'When the user authenticates, set appInsights.setAuthenticatedUserContext with your internal user id.',
    impact: 'Users · Cohorts · Retention' },
  { field: 'utm_source',
    title: 'Capture UTM parameters on landing',
    desc: 'Read utm_source/medium/campaign from the URL on first page-view and attach as custom properties on subsequent events.',
    impact: 'Campaigns · Sources' },
];

Object.assign(window, {
  DASH_KPIS_MARKETING, DASH_KPIS_TECHNICAL, DASH_INSIGHTS,
  DASH_TOP_PAGES, DASH_GEO, DASH_CAMPAIGNS,
  DASH_BROWSERS, DASH_OS, DASH_DEVICES,
  DASH_PEAK_HOURS, DASH_FUNNEL, DASH_SLOW_ENDPOINTS, DASH_SESSIONS,
  DASH_READINESS_SIGNALS, DASH_MISSING_PROMPTS,
});
