/* Dashboard D v2 — Interaction overlays.
   Four representative states: hover-trend, filter-applied, cmdk, drill. */

/* ── Tooltip on a specific point of the trend chart ── */
function TrendChartWithTip() {
  // We anchor the tooltip at x=70% (Thu) — value computed to match TrendChart's curve
  const W = 1000, H = 200;
  const focusX = 0.72 * W;
  // Approximate y for kind="rising" at i=22 (matches pattern)
  const focusY = 60;

  // Compute the full series same as TrendChart kind="rising"
  const pts = [];
  const seed = 'rising'.length * 7;
  for (let i = 0; i < 30; i++) {
    const t = i / 29;
    let v = 22 + t * 62 + Math.sin(i * 0.6 + seed) * 8 + (i > 22 ? 6 : 0);
    pts.push(Math.max(6, Math.min(96, v)));
  }
  const step = W / (pts.length - 1);
  const linePath = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(H - (v / 100) * H + 10).toFixed(1)}`).join(' ');
  const fillPath = `${linePath} L${W} ${H} L0 ${H} Z`;
  const focusIdx = 22;
  const focusPtX = focusIdx * step;
  const focusPtY = H - (pts[focusIdx] / 100) * H + 10;

  return (
    <div style={{ position: 'relative' }}>
      <svg className="kr-dash-trend" viewBox={`0 -10 ${W} ${H + 30}`} preserveAspectRatio="none">
        <g className="kr-dash-trend-grid">
          {[40, 80, 120, 160].map((y) => <line key={y} x1="0" x2={W} y1={y} y2={y} />)}
        </g>
        <path d={fillPath} className="kr-dash-trend-path-fill" />
        <path d={linePath} className="kr-dash-trend-path-line" />
        <line x1={focusPtX} x2={focusPtX} y1={-10} y2={H + 4} className="kr-dash-trend-guide" />
        <circle cx={focusPtX} cy={focusPtY} r="5" className="kr-dash-trend-dot" />
        {['Mon 18', 'Tue 19', 'Wed 20', 'Thu 21', 'Fri 22', 'Sat 23', 'Sun 24'].map((l, i, a) => (
          <text
            key={l}
            className="kr-dash-trend-axis-label"
            x={(i / (a.length - 1)) * W}
            y={H + 18}
            textAnchor={i === 0 ? 'start' : i === a.length - 1 ? 'end' : 'middle'}
            fill={i === 3 ? 'var(--kr-text)' : undefined}
          >{l}</text>
        ))}
      </svg>
      <div className="kr-dash-tip" style={{ left: 'calc(72% - 100px)', top: -12 }}>
        <div className="kr-dash-tip-head">Thursday · Mar 21</div>
        <div className="kr-dash-tip-row">
          <span className="kr-dash-tip-label"><span className="kr-dash-tip-swatch" /> Sessions</span>
          <span>
            <span className="kr-dash-tip-value">9,420</span>
          </span>
        </div>
        <div className="kr-dash-tip-row">
          <span className="kr-dash-tip-label" style={{ color: 'var(--kr-text-muted)' }}>vs avg 7d</span>
          <span className="kr-dash-tip-delta">+18.4%</span>
        </div>
        <div className="kr-dash-tip-foot">peak hour · 14:00–15:00 · 1,180 sess</div>
      </div>
    </div>
  );
}

function PanelTrafficTrendHover() {
  return (
    <div className="kr-dash-panel">
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">Traffic · last 7 days</h3>
        <span className="kr-dash-panel-meta">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 2, background: 'var(--kr-accent)' }} /> sessions
          </span>
          <span>peak Thu · 9.4K</span>
        </span>
      </div>
      <TrendChartWithTip />
    </div>
  );
}

/* ── Filter chip bar (sits just below sub-tabs when filters are active) ── */
function DashFilterBar({ chips }) {
  return (
    <div className="kr-dash-filterbar">
      <span className="kr-dash-filterbar-label">filtered to</span>
      {chips.map((c) => (
        <span key={`${c.key}-${c.value}`} className="kr-dash-filterchip">
          <span className="kr-dash-filterchip-key">{c.key}</span>
          <span className="kr-dash-filterchip-val">{c.value}</span>
          <span className="kr-dash-filterchip-x">×</span>
        </span>
      ))}
      <span className="kr-dash-filterbar-impact">8 panels re-scoped</span>
      <button className="kr-dash-filterbar-clear">clear all</button>
    </div>
  );
}

/* Filtered top-pages panel: row 2 (the filter target) is highlighted */
function PanelTopPagesFiltered() {
  // Filtered KPIs — for /pricing
  const filteredPages = [
    { path: '/pricing',            views: 22140, share: 100, selected: true },
    { path: '/pricing/team',       views: 6420,  share: 29 },
    { path: '/pricing/enterprise', views: 3210,  share: 14.5 },
    { path: '/pricing/compare',    views: 1840,  share: 8.3 },
  ];
  const max = Math.max(...filteredPages.map((p) => p.views));
  return (
    <div className="kr-dash-panel">
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">Top pages</h3>
        <span className="kr-dash-panel-meta">
          <span className="kr-dash-panel-filterbadge">
            <span className="kr-dash-panel-filterbadge-dot" />
            filtered
          </span>
          <span>4 routes match</span>
        </span>
      </div>
      <table className="kr-dash-table">
        <thead>
          <tr>
            <th>Path</th>
            <th className="is-num">Views</th>
            <th className="is-num" style={{ width: 180 }}>Share within filter</th>
          </tr>
        </thead>
        <tbody>
          {filteredPages.map((p) => (
            <tr key={p.path} className={p.selected ? 'is-selected' : ''}>
              <td className="is-mono">{p.path}</td>
              <td className="is-num">{p.views.toLocaleString()}</td>
              <td className="is-num">
                <div className="kr-dash-table-bar-cell">
                  <div className="kr-dash-table-bar" style={{ width: 100 }}>
                    <div className="kr-dash-table-bar-fill" style={{ width: `${(p.views / max) * 100}%` }} />
                  </div>
                  <span className="kr-dash-table-bar-pct">{p.share.toFixed(1)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Replacement KPI strip (Variation A) showing filtered values */
const DASH_KPIS_FILTERED = [
  { label: 'Unique visitors · /pricing', value: '8,402',  delta: '+34.2%', trend: 'up',   spark: 'rising', compare: '6,261 prev 7d' },
  { label: 'Sessions · /pricing',        value: '11,420', delta: '+28.7%', trend: 'up',   spark: 'rising', compare: '8,872 prev 7d' },
  { label: 'Page views · /pricing',      value: '22,140', delta: '+19.4%', trend: 'up',   spark: 'mound',  compare: '18,540 prev 7d' },
  { label: 'Conv. rate · pricing → signup', value: '4.2', unit: '%', delta: '+0.8 pt', trend: 'up', spark: 'flat', compare: '3.4% prev 7d' },
];

/* ── Command palette ⌘K ── */
function CommandPalette() {
  return (
    <div className="kr-dash-cmdk-scrim">
      <div className="kr-dash-cmdk">
        <div className="kr-dash-cmdk-input">
          <span className="kr-dash-cmdk-input-prefix">›</span>
          <span className="kr-dash-cmdk-input-text">pric</span>
          <span className="kr-dash-cmdk-input-caret" />
          <span className="kr-dash-cmdk-input-esc">esc</span>
        </div>
        <div className="kr-dash-cmdk-group">
          <div className="kr-dash-cmdk-group-label">Pages — 4 matches</div>
          <div className="kr-dash-cmdk-item is-active">
            <span className="kr-dash-cmdk-item-glyph">/</span>
            <span>Filter to <strong>/pricing</strong></span>
            <span className="kr-dash-cmdk-item-meta">22,140 views</span>
            <span className="kr-dash-cmdk-item-kbd">↵</span>
          </div>
          <div className="kr-dash-cmdk-item">
            <span className="kr-dash-cmdk-item-glyph">/</span>
            <span>Filter to <strong>/pricing/team</strong></span>
            <span className="kr-dash-cmdk-item-meta">6,420 views</span>
            <span className="kr-dash-cmdk-item-kbd">↵</span>
          </div>
          <div className="kr-dash-cmdk-item">
            <span className="kr-dash-cmdk-item-glyph">/</span>
            <span>Filter to <strong>/pricing/enterprise</strong></span>
            <span className="kr-dash-cmdk-item-meta">3,210 views</span>
            <span className="kr-dash-cmdk-item-kbd">↵</span>
          </div>
        </div>
        <div className="kr-dash-cmdk-group">
          <div className="kr-dash-cmdk-group-label">Campaigns — 1 match</div>
          <div className="kr-dash-cmdk-item">
            <span className="kr-dash-cmdk-item-glyph">⤴</span>
            <span>Filter to campaign <strong>spring-saas</strong></span>
            <span className="kr-dash-cmdk-item-meta">google · cpc</span>
            <span className="kr-dash-cmdk-item-kbd">↵</span>
          </div>
        </div>
        <div className="kr-dash-cmdk-group">
          <div className="kr-dash-cmdk-group-label">Jump to</div>
          <div className="kr-dash-cmdk-item">
            <span className="kr-dash-cmdk-item-glyph">⌘</span>
            <span>Switch tab · <strong>Technical</strong></span>
            <span className="kr-dash-cmdk-item-meta">slow endpoints, sessions</span>
            <span className="kr-dash-cmdk-item-kbd">⌘2</span>
          </div>
          <div className="kr-dash-cmdk-item">
            <span className="kr-dash-cmdk-item-glyph">⌘</span>
            <span>Change range · <strong>Last 30 days</strong></span>
            <span className="kr-dash-cmdk-item-meta">extends scope</span>
            <span className="kr-dash-cmdk-item-kbd">30</span>
          </div>
          <div className="kr-dash-cmdk-item">
            <span className="kr-dash-cmdk-item-glyph">↗</span>
            <span>Switch service · <strong>vikl-api-stg</strong></span>
            <span className="kr-dash-cmdk-item-meta">incomplete</span>
            <span className="kr-dash-cmdk-item-kbd">⌘\</span>
          </div>
        </div>
        <div className="kr-dash-cmdk-foot">
          <span className="kr-dash-cmdk-foot-cell">↑↓ navigate</span>
          <span className="kr-dash-cmdk-foot-cell">↵ select</span>
          <span className="kr-dash-cmdk-foot-cell">⌘↵ open in new tab</span>
          <span className="kr-dash-cmdk-foot-cell">esc close</span>
        </div>
      </div>
    </div>
  );
}

/* ── Drill drawer — right-side panel exploding a KPI ── */
function DrillDrawer() {
  return (
    <>
      <div className="kr-dash-drill-scrim" />
      <div className="kr-dash-drill">
        <div className="kr-dash-drill-head">
          <div className="kr-dash-drill-h">
            <span className="kr-dash-drill-eyebrow">drill · KPI</span>
            <h3 className="kr-dash-drill-title">
              Unique visitors
              <span className="kr-dash-drill-delta">+12.4%</span>
            </h3>
            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--kr-text-muted)', letterSpacing: 0.4 }}>
              42,189 · last 7 days · vs 37,521 prev 7d
            </div>
          </div>
          <button className="kr-dash-drill-close">esc</button>
        </div>
        <div className="kr-dash-drill-body">
          <div className="kr-dash-drill-section">
            <span className="kr-dash-drill-section-h">Trend · 7 days</span>
            <div className="kr-dash-drill-mini-trend">
              <TrendChart kind="rising" />
            </div>
          </div>
          <div className="kr-dash-drill-section">
            <span className="kr-dash-drill-section-h">Top sources</span>
            <table className="kr-dash-table">
              <tbody>
                {[
                  { src: 'google / organic',    v: 18402, p: 43.6 },
                  { src: 'direct',              v: 9410,  p: 22.3 },
                  { src: 'linkedin / social',   v: 3420,  p: 8.1 },
                  { src: 'newsletter / email',  v: 2104,  p: 5.0 },
                  { src: 'producthunt / ref',   v: 1840,  p: 4.4 },
                ].map((s) => (
                  <tr key={s.src}>
                    <td className="is-mono" style={{ fontSize: 12 }}>{s.src}</td>
                    <td className="is-num">{s.v.toLocaleString()}</td>
                    <td className="is-num" style={{ width: 90 }}>
                      <div className="kr-dash-table-bar-cell">
                        <div className="kr-dash-table-bar" style={{ width: 50 }}>
                          <div className="kr-dash-table-bar-fill" style={{ width: `${s.p * 2.2}%` }} />
                        </div>
                        <span className="kr-dash-table-bar-pct">{s.p.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="kr-dash-drill-section">
            <span className="kr-dash-drill-section-h">By hour · UTC+1</span>
            <PeakHoursHeatmap />
          </div>
          <div className="kr-dash-drill-section">
            <span className="kr-dash-drill-section-h">Top entry pages</span>
            <table className="kr-dash-table">
              <tbody>
                {[
                  { path: '/', v: 18402 },
                  { path: '/pricing', v: 9410 },
                  { path: '/blog/anatomie-saas', v: 6210 },
                  { path: '/login', v: 4801 },
                ].map((p) => (
                  <tr key={p.path}>
                    <td className="is-mono">{p.path}</td>
                    <td className="is-num">{p.v.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Donut focus state (Browser panel with Safari segment focused) ── */
function CategoryDonutFocused({ title, data, focusIdx = 1 }) {
  // Same as CategoryDonut but with one row highlighted and a tooltip
  return (
    <div className="kr-dash-panel" style={{ position: 'relative' }}>
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">{title}</h3>
      </div>
      <div className="kr-dash-donut">
        <DonutChart data={data} />
        <div className="kr-dash-donut-legend">
          {data.map((d, i) => (
            <div key={d.name} className={`kr-dash-donut-row ${i === focusIdx ? 'is-focused' : ''}`}>
              <span className={`kr-dash-donut-swatch kr-dash-donut-swatch--${d.color}`} />
              <span className="kr-dash-donut-name">{d.name}</span>
              <span className="kr-dash-donut-pct">{d.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="kr-dash-tip" style={{ left: 86, top: 78 }}>
        <div className="kr-dash-tip-head">{data[focusIdx].name}</div>
        <div className="kr-dash-tip-row">
          <span className="kr-dash-tip-label">Share</span>
          <span className="kr-dash-tip-value">{data[focusIdx].pct.toFixed(1)}%</span>
        </div>
        <div className="kr-dash-tip-row">
          <span className="kr-dash-tip-label">Visitors</span>
          <span className="kr-dash-tip-value">7,679</span>
        </div>
        <div className="kr-dash-tip-foot">click to filter dashboard</div>
      </div>
    </div>
  );
}

Object.assign(window, {
  TrendChartWithTip, PanelTrafficTrendHover,
  DashFilterBar, PanelTopPagesFiltered, DASH_KPIS_FILTERED,
  CommandPalette, DrillDrawer, CategoryDonutFocused,
});
