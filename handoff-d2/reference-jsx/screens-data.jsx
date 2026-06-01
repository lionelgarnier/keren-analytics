/* Shared data + utilities for the Keren resource/setup explorations. */

// ── Resources (3 envs, varied states, real-looking) ─────────────────────────
const RESOURCES = [
  {
    id: 'vikl-app-service-prd',
    name: 'vikl-app-service-prd',
    type: 'Application Insights',
    env: 'prod',
    envLabel: 'PRD',
    workspace: 'workspaceviklappprd9bb7',
    resourceGroup: 'vikl-app-prd',
    sub: '0c50b591…85a3',
    status: 'unconfigured',
    statusLabel: 'À configurer',
    action: 'Configurer',
    metrics: { events: '— ', volume: '— ' },
  },
  {
    id: 'vikl-web-prd',
    name: 'vikl-web-prd',
    type: 'Application Insights',
    env: 'prod',
    envLabel: 'PRD',
    workspace: 'DefaultWorkspace-0c50b591…',
    resourceGroup: 'vikl-web-prd',
    sub: '0c50b591…85a3',
    status: 'ready',
    statusLabel: 'Prêt',
    action: 'Ouvrir',
    metrics: { events: '14.2K / day', volume: '7d · 99.8%' },
  },
  {
    id: 'vikl-api-stg',
    name: 'vikl-api-stg',
    type: 'Application Insights',
    env: 'staging',
    envLabel: 'STG',
    workspace: 'workspaceviklapistg2c14',
    resourceGroup: 'vikl-api-stg',
    sub: '7a9f1004…22be',
    status: 'incomplete',
    statusLabel: 'Configuration incomplète',
    action: 'Reprendre la config',
    metrics: { events: '3.1K / day', volume: 'mapping 3/4' },
  },
  {
    id: 'keren-edge-dev',
    name: 'keren-edge-dev',
    type: 'Application Insights',
    env: 'dev',
    envLabel: 'DEV',
    workspace: 'workspacekerenedgedev0a91',
    resourceGroup: 'keren-edge-dev',
    sub: '7a9f1004…22be',
    status: 'ready',
    statusLabel: 'Prêt',
    action: 'Ouvrir',
    metrics: { events: '480 / day', volume: '7d · 96.0%' },
  },
];

// ── Scan log lines (mirrors the live wizard text) ───────────────────────────
const SCAN_LOG = [
  {
    state: 'done',
    title: 'Connecting to Application Insights…',
    titleDone: 'Connected to vikl-app-service-prd · workspace linked',
    detail: null,
    time: '16:54:08',
    glyph: '✓',
  },
  {
    state: 'done',
    title: 'Reading custom dimensions…',
    titleDone: 'Read custom dimensions',
    detail: '30 custom dimensions · 1 table',
    chips: [
      'http.request.header.host',
      'http.request.header.x_envoy_expected_rq_timeout',
      'http.request.header.x_k8se_protocol',
      'http.request.header.x_k8se_app_namespace',
      'http.request.header.x_k8se_app_name',
      '+25 more',
    ],
    time: '16:54:11',
    glyph: '✓',
  },
  {
    state: 'active',
    title: 'Counting event types and volumes…',
    titleDone: '154 events · 8 type(s) · 6 table(s)',
    detail: 'requests · pageViews · dependencies · traces · exceptions · customEvents',
    time: '16:54:13',
    glyph: '◐',
  },
  {
    state: 'pending',
    title: 'Detecting user identity, sessions, and page paths…',
    titleDone: '3/4 identity fields · 3 gap(s) flagged',
    detail: null,
    time: '—',
    glyph: '→',
  },
  {
    state: 'pending',
    title: 'Asking the AI to make sense of it…',
    titleDone: '6 panel(s) ready · 2 to instrument',
    detail: null,
    time: '—',
    glyph: '→',
  },
];

// ── Findings panels (graph-level verdict from setup wizard) ────────────────
const PANELS = [
  { id: 'traffic', title: 'Traffic trends', desc: 'Visits over time, hourly peaks.', state: 'ok', spark: 'rising' },
  { id: 'pages', title: 'Top pages', desc: 'Pages, drop-offs, navigation.', state: 'ok', spark: 'flat' },
  { id: 'perf', title: 'Performance', desc: 'Slow endpoints, request duration.', state: 'ok', spark: 'spiky' },
  { id: 'geo', title: 'Geography', desc: 'Country, city, language splits.', state: 'ok', spark: 'mound' },
  { id: 'tech', title: 'Devices & tech', desc: 'Browser, OS, device class.', state: 'ok', spark: 'rising' },
  { id: 'users', title: 'Users & cohorts', desc: 'Unique users, retention.', state: 'needs', missing: 'canonicalUserId' },
  { id: 'campaigns', title: 'Campaigns & sources', desc: 'UTM tracking, referrer attribution.', state: 'needs', missing: 'utm_source' },
];

const MISSING_SIGNALS = [
  {
    field: 'canonicalUserId',
    title: 'No built-in user identifier',
    desc: 'Instrument a stable anonymous-or-authenticated user id on every client event and request to unlock user-level cohorts and retention.',
    impact: 'Users · Cohorts · Retention',
  },
  {
    field: 'utm_source',
    title: 'No campaign attribution',
    desc: 'Capture the inbound UTM tags on landing to attribute sessions to campaigns and sources.',
    impact: 'Campaigns · Sources',
  },
];

// ── Sparkline path generators (small, deterministic, reusable) ──────────────
function sparkPath(kind, w = 100, h = 28) {
  const pts = {
    rising: [4, 8, 7, 10, 9, 14, 12, 16, 18, 22, 24],
    flat:   [12, 13, 11, 12, 13, 14, 12, 13, 11, 12, 13],
    spiky:  [8, 9, 14, 10, 22, 11, 24, 12, 19, 10, 9],
    mound:  [4, 8, 12, 18, 22, 24, 22, 18, 12, 8, 4],
  }[kind] || [10, 10, 10, 10, 10];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const range = Math.max(1, max - min);
  const step = w / (pts.length - 1);
  return pts.map((v, i) => {
    const x = (i * step).toFixed(1);
    const y = (h - ((v - min) / range) * (h - 2) - 1).toFixed(1);
    return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
  }).join(' ');
}

// Mini line chart with axis baseline
function Spark({ kind, w = 100, h = 28, color }) {
  const d = sparkPath(kind, w, h);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color || 'currentColor'} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Tiny SVG icons (line) we re-use across all directions
const Icon = {
  Folder: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="kr-i">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Db: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="kr-i">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  Sub: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="kr-i">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Search: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="kr-i">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Arrow: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="kr-i">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  ),
  Check: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="kr-i">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Bang: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="kr-i">
      <line x1="12" y1="6" x2="12" y2="14" />
      <circle cx="12" cy="18" r="0.6" fill="currentColor" />
    </svg>
  ),
  Sun: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="kr-i">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
};

// Frame chrome wrappers
function MobileFrame({ theme = 'light', tone = 'tight', children }) {
  return (
    <div className="kr-screen" data-theme={theme} style={{ fontSize: 13 }}>
      <div className="kr-statusbar">
        <span>16:54</span>
        <span className="kr-statusbar-right kr-mono" style={{ fontSize: 11 }}>
          <span>•••</span>
          <span>5G</span>
          <span className="kr-batt" />
        </span>
      </div>
      {children}
    </div>
  );
}

function DesktopFrame({ theme = 'light', url = 'keren.run/services', children }) {
  return (
    <div className="kr-screen" data-theme={theme}>
      <div className="kr-browserchrome">
        <div className="kr-traffic"><span /><span /><span /></div>
        <div className="kr-addrbar">
          <span>🔒</span>
          <span>{url}</span>
        </div>
        <div className="kr-mono" style={{ fontSize: 11, color: 'var(--kr-text-muted)' }}>⌘L</div>
      </div>
      {children}
    </div>
  );
}

Object.assign(window, {
  RESOURCES, SCAN_LOG, PANELS, MISSING_SIGNALS,
  sparkPath, Spark, Icon, MobileFrame, DesktopFrame,
});
