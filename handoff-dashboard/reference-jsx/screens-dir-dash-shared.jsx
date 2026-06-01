/* Dashboard D v2 — shared chart primitives + KPI cards (variant A & B) */

/* ───── Trend line chart placeholder (smoothed line + filled area) ───── */
function TrendChart({ kind = 'rising', height = 200 }) {
  // Build a series of 30 points
  const pts = React.useMemo(() => {
    const out = [];
    const seed = kind.length * 7;
    for (let i = 0; i < 30; i++) {
      const t = i / 29;
      let v;
      if (kind === 'rising') v = 22 + t * 62 + Math.sin(i * 0.6 + seed) * 8 + (i > 22 ? 6 : 0);
      else if (kind === 'flat') v = 50 + Math.sin(i * 0.45 + seed) * 12;
      else if (kind === 'spiky') v = 35 + Math.abs(Math.sin(i * 0.9 + seed)) * 40;
      else v = 50;
      out.push(Math.max(6, Math.min(96, v)));
    }
    return out;
  }, [kind]);

  const W = 1000;
  const H = 200;
  const step = W / (pts.length - 1);
  const linePath = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(H - (v / 100) * H + 10).toFixed(1)}`).join(' ');
  const fillPath = `${linePath} L${W} ${H} L0 ${H} Z`;

  const gridY = [40, 80, 120, 160];
  const xLabels = ['Mon 18', 'Tue 19', 'Wed 20', 'Thu 21', 'Fri 22', 'Sat 23', 'Sun 24'];

  return (
    <svg className="kr-dash-trend" viewBox={`0 -10 ${W} ${H + 30}`} preserveAspectRatio="none">
      <g className="kr-dash-trend-grid">
        {gridY.map((y) => <line key={y} x1="0" x2={W} y1={y} y2={y} />)}
      </g>
      <path d={fillPath} className="kr-dash-trend-path-fill" />
      <path d={linePath} className="kr-dash-trend-path-line" />
      {xLabels.map((l, i) => (
        <text
          key={l}
          className="kr-dash-trend-axis-label"
          x={(i / (xLabels.length - 1)) * W}
          y={H + 18}
          textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
        >{l}</text>
      ))}
    </svg>
  );
}

/* ───── KPI sparkline (tiny line for variation B) ───── */
function KpiSparkline({ kind }) {
  const d = sparkPath(kind, 100, 24);
  return (
    <svg className="kr-dash-kpi-b-spark-svg" viewBox="0 0 100 24" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ───── Donut chart (browser / OS / device) ───── */
function DonutChart({ data }) {
  const total = data.reduce((s, d) => s + d.pct, 0);
  const R = 42, CX = 60, CY = 60, STROKE = 16;
  let offset = 0;
  const C = 2 * Math.PI * R;

  return (
    <svg className="kr-dash-donut-svg" viewBox="0 0 120 120">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--kr-surface-2)" strokeWidth={STROKE} />
      <g transform="rotate(-90 60 60)">
        {data.map((d, i) => {
          const frac = d.pct / total;
          const len = frac * C;
          const seg = (
            <circle key={d.name}
              cx={CX} cy={CY} r={R} fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
              strokeDashoffset={(-offset).toFixed(2)}
              style={{
                color: d.color === 'a' ? 'var(--kr-accent)'
                  : d.color === 'e' ? 'var(--kr-text-muted)'
                  : 'var(--kr-accent)',
                opacity: d.color === 'a' ? 1
                  : d.color === 'b' ? 0.7
                  : d.color === 'c' ? 0.45
                  : d.color === 'd' ? 0.28
                  : 0.45,
              }}
            />
          );
          offset += len;
          return seg;
        })}
      </g>
    </svg>
  );
}

function CategoryDonut({ title, data }) {
  return (
    <div className="kr-dash-panel">
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">{title}</h3>
      </div>
      <div className="kr-dash-donut">
        <DonutChart data={data} />
        <div className="kr-dash-donut-legend">
          {data.map((d) => (
            <div key={d.name} className="kr-dash-donut-row">
              <span className={`kr-dash-donut-swatch kr-dash-donut-swatch--${d.color}`} />
              <span className="kr-dash-donut-name">{d.name}</span>
              <span className="kr-dash-donut-pct">{d.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───── Peak hours heatmap ───── */
function PeakHoursHeatmap() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div>
      <div className="kr-dash-peaks">
        {DASH_PEAK_HOURS.map((row, d) => (
          <React.Fragment key={d}>
            <span className="kr-dash-peaks-day">{days[d]}</span>
            {row.map((v, h) => (
              <span
                key={h}
                className="kr-dash-peaks-cell"
                style={{ opacity: 0.12 + v * 0.78 }}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
      <div className="kr-dash-peaks-foot">
        <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  );
}

/* ───── KPI cards ───── */

// Variation A — dense, no spark per card
function KpiCardA({ k }) {
  const isUp = k.trend === 'up';
  return (
    <div className="kr-dash-kpi-a">
      <span className="kr-dash-kpi-a-label">{k.label}</span>
      <div className="kr-dash-kpi-a-row">
        <span className="kr-dash-kpi-a-value">{k.value}</span>
        {k.unit && <span className="kr-dash-kpi-a-unit">{k.unit}</span>}
        <span className={`kr-dash-kpi-a-delta ${isUp ? 'is-up' : 'is-down'}`}>{k.delta}</span>
      </div>
      <span className="kr-dash-kpi-a-compare">vs · {k.compare}</span>
    </div>
  );
}

// Variation B — spark-wrap, label + value + sparkline panel
function KpiCardB({ k }) {
  const isUp = k.trend === 'up';
  return (
    <div className="kr-dash-kpi-b">
      <div className="kr-dash-kpi-b-head">
        <span className="kr-dash-kpi-b-label">{k.label}</span>
        <span className={`kr-dash-kpi-b-delta ${isUp ? 'is-up' : 'is-down'}`}>{k.delta}</span>
      </div>
      <div className="kr-dash-kpi-b-row">
        <span className="kr-dash-kpi-b-value">{k.value}</span>
        {k.unit && <span className="kr-dash-kpi-b-unit">{k.unit}</span>}
      </div>
      <div className="kr-dash-kpi-b-spark">
        <div className="kr-dash-kpi-b-spark-meta">
          <span>7d</span>
          <span>{k.compare}</span>
        </div>
        <KpiSparkline kind={k.spark} />
      </div>
    </div>
  );
}

function KpiGrid({ kpis, variant, desktop }) {
  const Card = variant === 'a' ? KpiCardA : KpiCardB;
  return (
    <div className={`kr-dash-kpis ${desktop ? 'kr-dash-kpis--desktop' : ''}`}>
      {kpis.map((k) => <Card key={k.label} k={k} />)}
    </div>
  );
}

/* ───── Page header (Dashboard variant — has range selector instead of CTAs) ───── */
function DashPageHeader({ serviceName, tab, desktop, range = '7d', narration }) {
  const tabLabel = tab === 'marketing' ? 'marketing' : tab === 'technical' ? 'technical' : 'readiness';
  return (
    <div className="kr-d2-pageheader" style={!desktop ? { flexDirection: 'column', alignItems: 'flex-start' } : undefined}>
      <div className="kr-d2-pageheader-l">
        <div className="kr-d2-breadcrumb">
          <span>vikl.fr</span>
          <span className="kr-d2-breadcrumb-sep">/</span>
          <span>services</span>
          <span className="kr-d2-breadcrumb-sep">/</span>
          <span>{serviceName}</span>
          <span className="kr-d2-breadcrumb-sep">/</span>
          <span className="kr-d2-breadcrumb-here">{tabLabel}</span>
          <span className="kr-d2-breadcrumb-tag">live</span>
        </div>
        <h1 className={`kr-d2-h1 ${desktop ? 'kr-d2-h1--xl' : ''}`}>{serviceName}</h1>
        <p className="kr-d2-sub">{narration}</p>
      </div>
      {desktop && (
        <div className="kr-d2-pageheader-r">
          <div className="kr-dash-range">
            {['Today', '7d', '30d'].map((r) => (
              <button key={r} className={`kr-dash-range-btn ${r === range ? 'is-active' : ''}`}>{r}</button>
            ))}
          </div>
          <button className="kr-d2-headeraction">Export</button>
        </div>
      )}
    </div>
  );
}

/* ───── Sub-tab bar (Marketing / Technical / Readiness) ───── */
function DashSubtabs({ active, syncTime = '16:54:22' }) {
  const tabs = [
    { id: 'marketing', label: 'Marketing', num: 12 },
    { id: 'technical', label: 'Technical', num: 6 },
    { id: 'readiness', label: 'Readiness', num: '71/100' },
  ];
  return (
    <div className="kr-dash-subtabs">
      {tabs.map((t) => (
        <span key={t.id} className={`kr-dash-subtab ${t.id === active ? 'is-active' : ''}`}>
          {t.label}
          <span className="kr-dash-subtab-num">{t.num}</span>
        </span>
      ))}
      <span className="kr-dash-subtab-meta">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--kr-ok)', boxShadow: '0 0 0 2px var(--kr-ok-soft)' }} />
          synced · {syncTime}
        </span>
      </span>
    </div>
  );
}

/* ───── Narration — Variation A (editorial) ───── */
function DashNarrationA({ desktop, tab }) {
  const body = tab === 'marketing' ? (
    <>
      Strong week — <strong>traffic up 12% vs prior period</strong>, driven by <strong>/pricing</strong> (+34%) and renewed share from the LinkedIn launch campaign. Sessions are healthy, error rate sits well under threshold at 0.42%. Two signals remain to unlock user-level cohorts: <strong>session id and authenticated user id</strong>.
    </>
  ) : tab === 'technical' ? (
    <>
      Backend response stable at <strong>p50 142&nbsp;ms / p95 480&nbsp;ms</strong>. <strong>P95 ticked up 3.4%</strong> — concentrated on <code style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12.5 }}>GET /api/exports/csv</code> (p95 2.8s). Error rate dropped to 0.42% from 0.60% last week.
    </>
  ) : (
    <>
      You're at <strong>71/100</strong> — strong request, browser, and geo coverage. Two missing signals account for most of the gap: <strong>session id</strong> and <strong>user identity</strong>. Wire them up and you unlock cohorts, retention, and end-to-end funnels.
    </>
  );
  return (
    <div className={`kr-dash-narr-a ${desktop ? 'kr-dash-narr-a--desktop' : ''}`}>
      <span className="kr-dash-narr-a-tag">
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--kr-accent)' }} />
        AI · gpt-4.1
      </span>
      <div>
        <div className="kr-dash-narr-a-body">{body}</div>
        <div className="kr-dash-narr-a-meta">
          <span>scanned 16:54:22</span>
          <span className="kr-dash-narr-a-meta-dot" />
          <span>scope · last 7 days</span>
          <span className="kr-dash-narr-a-meta-dot" />
          <span>via azure-foundry</span>
        </div>
      </div>
    </div>
  );
}

/* ───── Narration — Variation B (condensed strip) ───── */
function DashNarrationB({ tab }) {
  const text = tab === 'marketing'
    ? <><strong>Traffic up 12%</strong> — /pricing leads (+34%). 2 signals still needed for cohorts.</>
    : tab === 'technical'
    ? <><strong>p95 +3.4%</strong> — concentrated on <code style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>/api/exports/csv</code>. Error rate down to 0.42%.</>
    : <><strong>71/100</strong> — session id and user identity missing. Adding both unlocks cohorts + retention.</>;
  return (
    <div className="kr-dash-narr-b">
      <span className="kr-dash-narr-b-tag">AI</span>
      <span className="kr-dash-narr-b-text">{text}</span>
      <span className="kr-dash-narr-b-cta">expand <span style={{ marginLeft: 4 }}>↗</span></span>
    </div>
  );
}

Object.assign(window, {
  TrendChart, KpiSparkline, DonutChart, CategoryDonut, PeakHoursHeatmap,
  KpiCardA, KpiCardB, KpiGrid,
  DashPageHeader, DashSubtabs, DashNarrationA, DashNarrationB,
});
