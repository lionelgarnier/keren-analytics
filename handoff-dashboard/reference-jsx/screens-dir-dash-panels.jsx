/* Dashboard D v2 — Panel components (tables, funnel, sessions, etc.) */

function PanelTopPages() {
  const max = Math.max(...DASH_TOP_PAGES.map((p) => p.views));
  return (
    <div className="kr-dash-panel">
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">Top pages</h3>
        <span className="kr-dash-panel-meta">
          <span>{DASH_TOP_PAGES.length} routes</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>hide technical ▣</span>
        </span>
      </div>
      <table className="kr-dash-table">
        <thead>
          <tr>
            <th>Path</th>
            <th className="is-num">Views</th>
            <th className="is-num" style={{ width: 180 }}>Share</th>
          </tr>
        </thead>
        <tbody>
          {DASH_TOP_PAGES.map((p) => (
            <tr key={p.path}>
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

function PanelTrafficTrend({ desktop }) {
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
      <TrendChart kind="rising" />
    </div>
  );
}

function PanelGeo({ desktop }) {
  // Pin positions (rough percentages on the placeholder map)
  const pinPositions = [
    { iso: 'FR', x: 50, y: 38, big: true,  label: 'FR · 58%' },
    { iso: 'US', x: 22, y: 42, big: false, label: 'US' },
    { iso: 'GB', x: 47, y: 30, big: false, label: 'GB' },
    { iso: 'DE', x: 53, y: 33, big: false, label: 'DE' },
    { iso: 'ES', x: 47, y: 42, big: false, label: 'ES' },
    { iso: 'BE', x: 51, y: 32, big: false, label: '' },
  ];
  const max = Math.max(...DASH_GEO.map((g) => g.share));
  return (
    <div className="kr-dash-panel">
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">Geographic distribution</h3>
        <span className="kr-dash-panel-meta">42K unique visitors · 36 countries</span>
      </div>
      <div className={`kr-dash-geo ${desktop ? 'kr-dash-geo--desktop' : ''}`}>
        <div className="kr-dash-geo-map">
          <div className="kr-dash-geo-map-grid" />
          {pinPositions.map((p) => (
            <React.Fragment key={p.iso}>
              <div
                className={`kr-dash-geo-map-pin ${p.big ? 'kr-dash-geo-map-pin--lg' : ''}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              />
              {p.label && (
                <div className="kr-dash-geo-map-label" style={{ left: `${p.x}%`, top: `${p.y}%`, marginTop: 18 }}>
                  {p.label}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
        <table className="kr-dash-table">
          <thead>
            <tr>
              <th>Country</th>
              <th className="is-num">Visitors</th>
              <th className="is-num">Share</th>
            </tr>
          </thead>
          <tbody>
            {DASH_GEO.map((g) => (
              <tr key={g.iso}>
                <td>
                  <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10.5, color: 'var(--kr-text-muted)', marginRight: 8 }}>{g.iso}</span>
                  {g.country}
                </td>
                <td className="is-num">{g.visitors.toLocaleString()}</td>
                <td className="is-num">
                  <div className="kr-dash-table-bar-cell">
                    <div className="kr-dash-table-bar" style={{ width: 70 }}>
                      <div className="kr-dash-table-bar-fill" style={{ width: `${(g.share / max) * 100}%` }} />
                    </div>
                    <span className="kr-dash-table-bar-pct">{g.share.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PanelPeakHours() {
  return (
    <div className="kr-dash-panel">
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">Peak hours</h3>
        <span className="kr-dash-panel-meta">UTC+1 · 7 days</span>
      </div>
      <PeakHoursHeatmap />
    </div>
  );
}

function PanelCampaigns() {
  const max = Math.max(...DASH_CAMPAIGNS.map((c) => c.visitors));
  return (
    <div className="kr-dash-panel">
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">Campaigns &amp; sources</h3>
        <span className="kr-dash-panel-meta">UTM · 4 campaigns · 24% of traffic</span>
      </div>
      <table className="kr-dash-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Medium</th>
            <th>Campaign</th>
            <th className="is-num">Visitors</th>
            <th className="is-num">Sessions</th>
            <th className="is-num" style={{ width: 110 }}>Share</th>
          </tr>
        </thead>
        <tbody>
          {DASH_CAMPAIGNS.map((c) => (
            <tr key={c.campaign}>
              <td className="is-mono">{c.source}</td>
              <td className="is-mono is-dim">{c.medium}</td>
              <td>{c.campaign}</td>
              <td className="is-num">{c.visitors.toLocaleString()}</td>
              <td className="is-num">{c.sessions.toLocaleString()}</td>
              <td className="is-num">
                <div className="kr-dash-table-bar-cell">
                  <div className="kr-dash-table-bar" style={{ width: 60 }}>
                    <div className="kr-dash-table-bar-fill" style={{ width: `${(c.visitors / max) * 100}%` }} />
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PanelFunnel() {
  return (
    <div className="kr-dash-panel">
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">Conversion funnel</h3>
        <span className="kr-dash-panel-meta">10.0% landing → signup</span>
      </div>
      <div className="kr-dash-funnel">
        {DASH_FUNNEL.map((step, i) => {
          const prev = i > 0 ? DASH_FUNNEL[i - 1] : null;
          const drop = prev ? ((prev.count - step.count) / prev.count) * 100 : 0;
          return (
            <div key={step.step} className="kr-dash-funnel-row">
              <div className="kr-dash-funnel-head">
                <span><strong>{step.step}</strong></span>
                <span className="kr-dash-funnel-head-meta">{step.count.toLocaleString()} · {step.pct.toFixed(1)}%</span>
              </div>
              <div className="kr-dash-funnel-bar">
                <div className="kr-dash-funnel-bar-fill" style={{ width: `${step.pct}%` }} />
              </div>
              {prev && drop > 0 && (
                <div className="kr-dash-funnel-drop">↓ {drop.toFixed(1)}% drop-off</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PanelSlowEndpoints() {
  return (
    <div className="kr-dash-panel">
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">Slow endpoints</h3>
        <span className="kr-dash-panel-meta">{DASH_SLOW_ENDPOINTS.length} routes · sorted p95</span>
      </div>
      <table className="kr-dash-table">
        <thead>
          <tr>
            <th>Path</th>
            <th className="is-num">P50</th>
            <th className="is-num">P95</th>
            <th className="is-num">P99</th>
            <th className="is-num">Calls</th>
            <th className="is-num">Err%</th>
          </tr>
        </thead>
        <tbody>
          {DASH_SLOW_ENDPOINTS.map((e) => (
            <tr key={e.path}>
              <td className="is-mono" style={{ fontSize: 11.5 }}>{e.path}</td>
              <td className="is-num">{e.p50}</td>
              <td className="is-num" style={{ color: e.p95 > 1000 ? 'var(--kr-warn)' : undefined }}>{e.p95}</td>
              <td className="is-num">{e.p99}</td>
              <td className="is-num is-dim">{e.calls.toLocaleString()}</td>
              <td className="is-num" style={{ color: e.err > 1 ? 'var(--kr-warn)' : 'var(--kr-text-muted)' }}>
                {e.err.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PanelFrontendPerf() {
  return (
    <div className="kr-dash-panel">
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">Frontend performance</h3>
        <span className="kr-dash-panel-meta">avg 1.24s · p95 3.10s · 42K samples</span>
      </div>
      <TrendChart kind="spiky" />
      <div style={{
        display: 'flex', gap: 16,
        fontFamily: 'Geist Mono, monospace', fontSize: 11,
        color: 'var(--kr-text-muted)', letterSpacing: 0.4,
        paddingTop: 4, borderTop: '1px solid var(--kr-border)', marginTop: 4
      }}>
        <span>DNS · 12 ms</span><span>TCP · 38 ms</span><span>TTFB · 142 ms</span>
        <span>DOM · 612 ms</span><span>Load · 1,240 ms</span>
      </div>
    </div>
  );
}

function PanelSessions() {
  return (
    <div className="kr-dash-panel">
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">Session timelines</h3>
        <span className="kr-dash-panel-meta">reconstructed from events · recent sessions</span>
      </div>
      <div className="kr-dash-sessions">
        {DASH_SESSIONS.map((s) => (
          <div key={s.id} className="kr-dash-session">
            <div className="kr-dash-session-head">
              <span className="kr-dash-session-id">{s.id}</span>
              <span className="kr-dash-session-meta">{s.country} · {s.device} · {s.steps} steps · {s.dur}</span>
              <span className={`kr-dash-session-status ${s.endedOk ? 'is-ok' : 'is-bad'}`}>
                {s.endedOk ? '✓ complete' : '✕ errored'}
              </span>
            </div>
            <div className="kr-dash-session-track">
              {s.timeline.map((step, i) => (
                <React.Fragment key={i}>
                  <span className={`kr-dash-session-step ${step.startsWith('✕') ? 'is-error' : ''}`}>{step}</span>
                  {i < s.timeline.length - 1 && <span className="kr-dash-session-step-sep">→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelInsights({ desktop }) {
  return (
    <div className={`kr-dash-insights ${desktop ? 'kr-dash-insights--desktop' : ''}`}>
      {DASH_INSIGHTS.map((ins, i) => (
        <div key={i} className={`kr-dash-insight kr-dash-insight--${ins.kind}`}>
          <span className="kr-dash-insight-dot" />
          <span dangerouslySetInnerHTML={{ __html:
            ins.text.replace(/(\d+(?:\.\d+)?%|\d+[A-Za-z]+|\d+\.\d+)/g, '<strong>$1</strong>')
          }} />
        </div>
      ))}
    </div>
  );
}

/* Score gradient defs (one per page, but cheap to repeat) */
function ScoreGradientDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id="krDashScoreGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--kr-ok)" />
          <stop offset="100%" stopColor="var(--kr-accent)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* Readiness score hero */
function PanelScoreHero({ desktop }) {
  const score = 71;
  const C = 2 * Math.PI * 56;
  const dash = (score / 100) * C;
  return (
    <div className={`kr-dash-score-hero ${desktop ? 'kr-dash-score-hero--desktop' : ''}`}>
      <ScoreGradientDefs />
      <div className="kr-dash-score-ring">
        <svg viewBox="0 0 130 130">
          <circle className="kr-dash-score-ring-bg" cx="65" cy="65" r="56" />
          <circle
            className="kr-dash-score-ring-fill"
            cx="65" cy="65" r="56"
            strokeDasharray={`${dash} ${C - dash}`}
          />
        </svg>
        <div className="kr-dash-score-ring-label">
          <span className="kr-dash-score-num">{score}</span>
          <span className="kr-dash-score-of">/100 · B</span>
        </div>
      </div>
      <div className="kr-dash-score-meta">
        <h2 className="kr-dash-score-grade"><strong>Strong foundation</strong> · 2 signals away from a complete picture</h2>
        <p className="kr-dash-score-desc">
          Request, browser, page, and geographic telemetry are all in place. Adding session id and authenticated user id unlocks cohorts, retention, and end-to-end funnels.
        </p>
        <div className="kr-dash-score-bar">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`kr-dash-score-bar-cell ${i < 7 ? 'is-on-ok' : 'is-off'}`} />
          ))}
        </div>
        <div className="kr-dash-score-bar-foot">
          <span>0</span>
          <span>{score} of 100 captured</span>
          <span>100</span>
        </div>
      </div>
    </div>
  );
}

function PanelSignalBreakdown({ desktop }) {
  return (
    <div className="kr-dash-panel">
      <div className="kr-dash-panel-head">
        <h3 className="kr-dash-panel-title">Signal breakdown</h3>
        <span className="kr-dash-panel-meta">9 signals · 71 / 100 points</span>
      </div>
      <div className={`kr-dash-signals ${desktop ? 'kr-dash-signals--desktop' : ''}`}>
        {DASH_READINESS_SIGNALS.map((s) => (
          <div key={s.name} className={`kr-dash-signal kr-dash-signal--${s.state}`}>
            <span className="kr-dash-signal-name">{s.name}</span>
            <span className="kr-dash-signal-score">
              <span className="kr-dash-signal-score-num">{s.score}</span>
              <span className="kr-dash-signal-score-weight"> / {s.weight}</span>
            </span>
            <span className="kr-dash-signal-sub">
              {s.state === 'miss' && <span className="kr-dash-signal-miss-tag">missing</span>}
              {s.sub}
              {s.missing && (
                <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10.5, marginLeft: 'auto', color: 'var(--kr-warn)' }}>
                  {s.missing}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelImproveCoverage({ desktop }) {
  return (
    <div className="kr-d-find-improve" style={{ marginTop: 24 }}>
      <div className="kr-d-find-improve-head">
        <div>
          <h3 className="kr-d-find-improve-title">Improve your coverage</h3>
          <p className="kr-d-find-improve-sub">Three signals to instrument. We've drafted the prompts so you can ship them in minutes.</p>
        </div>
      </div>
      {DASH_MISSING_PROMPTS.map((m) => (
        <div key={m.field} className={`kr-d-find-improve-item ${desktop ? 'kr-d-find-improve-item--desktop' : ''}`}>
          <div className="kr-d-find-improve-field">
            <span className="kr-d-find-improve-field-tag">missing</span>
            {m.field}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--kr-text)', marginBottom: 4 }}>{m.title}</div>
            <div className="kr-d-find-improve-desc">{m.desc}</div>
            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10.5, color: 'var(--kr-text-muted)', letterSpacing: 0.4, marginTop: 6 }}>
              unlocks · {m.impact}
            </div>
          </div>
          <button className="kr-d-find-improve-cta">
            <span className="kr-d-find-improve-cta-kbd">⌘</span> Use prompt
          </button>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  PanelTopPages, PanelTrafficTrend, PanelGeo, PanelPeakHours, PanelCampaigns,
  PanelFunnel, PanelSlowEndpoints, PanelFrontendPerf, PanelSessions, PanelInsights,
  PanelScoreHero, PanelSignalBreakdown, PanelImproveCoverage,
});
