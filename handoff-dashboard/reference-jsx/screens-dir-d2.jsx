/* Direction D v2 — Console SaaS, refined.
   What changed vs D:
   - Resource cards: meta replaced with `┌├└` tree (borrowed from E)
   - Persistent command bar at bottom (borrowed from C)
   - Spark wrapped in surface-2 panel; cleaner separation
   - Header has a primary action button + breadcrumb badge
   - Scanning step list now shown as a code-tree, not list-of-rows
*/

function TopbarD2({ active = 'Services' }) {
  return (
    <div className="kr-d-topbar">
      <div className="kr-d-topbar-l">
        <span className="kr-d-mark">
          <span className="kr-d-mark-glyph">K</span>
          Keren
          <span className="kr-d-mark-tag">VIKL</span>
        </span>
        <div className="kr-d-tabs">
          <span className={`kr-d-tab ${active === 'Services' ? 'is-active' : ''}`}>Services</span>
          <span className={`kr-d-tab ${active === 'Setup' ? 'is-active' : ''}`}>Setup</span>
          <span className="kr-d-tab">Audit</span>
          <span className="kr-d-tab">Settings</span>
        </div>
      </div>
      <div className="kr-d-topbar-r">
        <span className="kr-d-mark-tag" style={{ marginLeft: 0 }}>⌘ K</span>
        <span className="kr-d-avatar">LG</span>
      </div>
    </div>
  );
}

function SparkBarsD2({ kind = 'rising', n = 20 }) {
  const heights = React.useMemo(() => {
    const seed = kind.length;
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      let v;
      if (kind === 'rising') v = 28 + t * 62 + Math.sin(i + seed) * 8;
      else if (kind === 'flat') v = 52 + Math.sin(i + seed) * 14;
      else if (kind === 'spiky') v = 28 + Math.abs(Math.sin(i * 0.9 + seed)) * 64;
      else if (kind === 'placeholder') v = 8 + (i % 3) * 4;
      else v = 50;
      return Math.max(6, Math.min(96, v));
    });
  }, [kind, n]);
  return (
    <div className="kr-d2-spark">
      {heights.map((h, i) => <span key={i} className="kr-d2-spark-bar" style={{ height: `${h}%` }} />)}
    </div>
  );
}

/* ───── Resource card v2 ───── */
function ResourceCardD2({ r }) {
  const sparkKind = {
    'vikl-app-service-prd': 'placeholder',
    'vikl-web-prd': 'rising',
    'vikl-api-stg': 'spiky',
    'keren-edge-dev': 'flat',
  }[r.id] || 'flat';

  const isUnconfigured = r.status === 'unconfigured';

  return (
    <div className={`kr-d2-rescard kr-d-rescard--${r.status} kr-d2-rescard--${r.status}`}>
      <div className="kr-d2-rescard-head">
        <div>
          <div className="kr-d2-rescard-name">
            {r.name}
          </div>
          <div className="kr-d2-rescard-sub">
            Application Insights
            <span style={{ opacity: 0.5 }}>·</span>
            <span className={`kr-d-env kr-d-env--${r.env}`}>{r.envLabel}</span>
          </div>
        </div>
        <span className={`kr-d-statpill kr-d-statpill--${r.status}`}>
          <span className="kr-d-statpill-dot" />
          {r.statusLabel}
        </span>
      </div>

      <div className="kr-d2-spark-wrap">
        <div className="kr-d2-spark-head">
          <span>Events · 7d</span>
          <span className={`kr-d2-spark-val ${isUnconfigured ? 'kr-d2-spark-val-mute' : ''}`}>{r.metrics.events}</span>
        </div>
        <SparkBarsD2 kind={sparkKind} n={22} />
      </div>

      <div className="kr-d2-tree">
        <div className="kr-d2-tree-line">
          <span className="kr-d2-tree-glyph">┌</span>
          <span className="kr-d2-tree-key">sub</span>
          <span className="kr-d2-tree-val kr-d2-tree-val-mute">{r.sub}</span>
        </div>
        <div className="kr-d2-tree-line">
          <span className="kr-d2-tree-glyph">├</span>
          <span className="kr-d2-tree-key">rg</span>
          <span className="kr-d2-tree-val">{r.resourceGroup}</span>
        </div>
        <div className="kr-d2-tree-line">
          <span className="kr-d2-tree-glyph">└</span>
          <span className="kr-d2-tree-key">ws</span>
          <span className="kr-d2-tree-val">{r.workspace}</span>
        </div>
      </div>

      <div className="kr-d2-cardcta">
        <span className={`kr-d2-cta-link ${isUnconfigured ? 'is-mute' : ''} ${r.status === 'incomplete' ? 'is-warn' : ''}`}>
          {r.action} <span style={{ fontFamily: 'Geist Mono, monospace' }}>→</span>
        </span>
        {r.status === 'ready' && (
          <button className="kr-d2-cta-secondary">Reconfigure</button>
        )}
        {isUnconfigured && (
          <span className="kr-d2-cta-kbd">↵</span>
        )}
      </div>
    </div>
  );
}

/* ───── Global command bar (v2 signature) ───── */
function CommandBarD2({ scope = 'services', ctaLabel = '+ Connect workspace', ctaAccent = false }) {
  return (
    <div className="kr-d2-cmdbar">
      <div className="kr-d2-cmdbar-l">
        <span className="kr-d2-cmdbar-status">
          <span className="kr-d2-cmdbar-status-dot" />
          synced · 16:54:22
        </span>
        <span className="kr-d2-cmdbar-sep">·</span>
        <span>{scope}</span>
      </div>
      <div className="kr-d2-cmdbar-r">
        <span className="kr-d2-cmdbar-cell">
          <span className="kr-d2-cmdbar-kbd">↑</span>
          <span className="kr-d2-cmdbar-kbd">↓</span>
          navigate
        </span>
        <span className="kr-d2-cmdbar-cell">
          <span className="kr-d2-cmdbar-kbd">↵</span>
          open
        </span>
        <span className="kr-d2-cmdbar-cell">
          <span className="kr-d2-cmdbar-kbd">⌘K</span>
          filter
        </span>
        <button className={`kr-d2-cmdbar-action ${ctaAccent ? 'kr-d2-cmdbar-action-accent' : ''}`}>
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

/* ───── Select Resource D v2 ───── */
function SelectD2({ viewport, theme, toggleTheme }) {
  const Frame = viewport === 'mobile' ? MobileFrame : DesktopFrame;
  const desktop = viewport === 'desktop';
  return (
    <Frame theme={theme} url="keren.run/services">
      <div className="kr-d-frame">
        <TopbarD2 active="Services" />
        <div className={`kr-d-body ${desktop ? 'kr-d-body--desktop' : ''}`} style={{ paddingBottom: 24 }}>
          <div className="kr-d2-pageheader" style={!desktop ? { flexDirection: 'column', alignItems: 'flex-start' } : undefined}>
            <div className="kr-d2-pageheader-l">
              <div className="kr-d2-breadcrumb">
                <span>vikl.fr</span>
                <span className="kr-d2-breadcrumb-sep">/</span>
                <span className="kr-d2-breadcrumb-here">services</span>
                <span className="kr-d2-breadcrumb-tag">4 connected</span>
              </div>
              <h1 className={`kr-d2-h1 ${desktop ? 'kr-d2-h1--xl' : ''}`}>Services</h1>
              <p className="kr-d2-sub">
                4 Application Insights workspaces. Open a ready service or finish setting one up — Keren maps the schema, then the AI tells you what's renderable.
              </p>
            </div>
            {desktop && (
              <div className="kr-d2-pageheader-r">
                <button className="kr-d2-headeraction">⌘K Filter</button>
                <button className="kr-d2-headeraction kr-d2-headeraction-accent">+ Connect workspace</button>
              </div>
            )}
          </div>

          <div className="kr-d-toolbar">
            <div className="kr-d-chips">
              <span className="kr-d-chip is-active">All <span className="kr-d-chip-count">4</span></span>
              <span className="kr-d-chip">Prod <span className="kr-d-chip-count">2</span></span>
              <span className="kr-d-chip">Staging <span className="kr-d-chip-count">1</span></span>
              <span className="kr-d-chip">Dev <span className="kr-d-chip-count">1</span></span>
            </div>
            {desktop && (
              <div className="kr-d-search" style={{ minWidth: 260 }}>
                <Icon.Search s={12} />
                <span>Filter by name, workspace, group…</span>
                <span className="kr-d-search-kbd">⌘K</span>
              </div>
            )}
          </div>

          <div className={`kr-d-resgrid ${desktop ? 'kr-d-resgrid--desktop' : ''}`}>
            {RESOURCES.map((r) => <ResourceCardD2 key={r.id} r={r} />)}
          </div>
        </div>

        <CommandBarD2 scope="services · 4 nodes" />
      </div>
    </Frame>
  );
}

/* ───── Scanning D v2 — scan as a growing schema tree ───── */
function ScanD2({ viewport, theme, toggleTheme }) {
  const Frame = viewport === 'mobile' ? MobileFrame : DesktopFrame;
  const desktop = viewport === 'desktop';

  return (
    <Frame theme={theme} url="keren.run/setup">
      <div className="kr-d-frame">
        <TopbarD2 active="Setup" />
        <div className={`kr-d-body ${desktop ? 'kr-d-body--desktop' : ''}`}>
          <div className="kr-d2-pageheader" style={!desktop ? { flexDirection: 'column', alignItems: 'flex-start' } : undefined}>
            <div className="kr-d2-pageheader-l">
              <div className="kr-d2-breadcrumb">
                <span>vikl.fr</span>
                <span className="kr-d2-breadcrumb-sep">/</span>
                <span>services</span>
                <span className="kr-d2-breadcrumb-sep">/</span>
                <span className="kr-d2-breadcrumb-here">vikl-app-service-prd</span>
                <span className="kr-d2-breadcrumb-sep">/</span>
                <span className="kr-d2-breadcrumb-here">setup</span>
              </div>
              <h1 className={`kr-d2-h1 ${desktop ? 'kr-d2-h1--xl' : ''}`}>Scanning telemetry</h1>
              <p className="kr-d2-sub">
                Reading custom dimensions, counting event types, mapping identity. The schema fills in as we go — Keren will then ask the model what dashboards your tenant can credibly render.
              </p>
            </div>
            {desktop && (
              <div className="kr-d2-pageheader-r">
                <button className="kr-d2-headeraction">Re-scan</button>
                <button className="kr-d2-headeraction kr-d2-headeraction-accent">Continue →</button>
              </div>
            )}
          </div>

          <div className="kr-d-progress">
            {[
              { label: 'Scanning', state: 'active', num: '01' },
              { label: 'AI findings', state: 'pending', num: '02' },
              { label: 'Validate', state: 'pending', num: '03' },
              { label: 'Save', state: 'pending', num: '04' },
            ].map((s) => (
              <div key={s.num} className={`kr-d-progress-step is-${s.state}`}>
                <div className="kr-d-progress-bar"><div className="kr-d-progress-bar-fill" /></div>
                <div className="kr-d-progress-label">
                  <span><span className="kr-d-progress-label-num">{s.num}</span> · {s.label}</span>
                  <span>{s.state === 'active' ? '48%' : s.state === 'done' ? '✓' : ''}</span>
                </div>
              </div>
            ))}
          </div>

          <div className={`kr-d-scan ${desktop ? 'kr-d-scan--desktop' : ''}`}>
            {/* Live "now" card — unchanged from D, still strong */}
            <div className="kr-d-scan-now">
              <div className="kr-d-scan-now-tag">
                <span className="kr-pulse-dot" /> Live · step 03 of 05
              </div>
              <h2 className="kr-d-scan-now-title">Counting event types &amp; volumes</h2>
              <p className="kr-d-scan-now-detail">
                requests · pageViews · dependencies · traces · exceptions · customEvents — 6 tables · 154 events captured in a 7-day window.
              </p>
              <div className="kr-d-scan-stats">
                <div className="kr-d-scan-stat">
                  <div className="kr-d-scan-stat-num">30</div>
                  <div className="kr-d-scan-stat-label">Dimensions</div>
                </div>
                <div className="kr-d-scan-stat">
                  <div className="kr-d-scan-stat-num">154</div>
                  <div className="kr-d-scan-stat-label">Events / 7d</div>
                </div>
                <div className="kr-d-scan-stat">
                  <div className="kr-d-scan-stat-num">6</div>
                  <div className="kr-d-scan-stat-label">Tables</div>
                </div>
              </div>
            </div>

            {/* Tree-formatted scan progress (replaces flat list) */}
            <div className="kr-d2-scan-tree">
              <div className="kr-d2-scan-tree-head">
                <span>scan.tree · vikl-app-service-prd</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--kr-accent)' }}>
                  <span className="kr-pulse-dot" /> streaming
                </span>
              </div>
              <div className="kr-d2-scan-tree-body">
                <div className="kr-d2-scan-tree-row">
                  <span className="kr-d2-scan-tree-glyph">┌</span>
                  <span className="kr-d2-scan-tree-text">connect <span style={{ color: 'var(--kr-accent)' }}>vikl-app-service-prd</span></span>
                  <span className="kr-d2-scan-tree-count is-ok">✓ 1.2s</span>
                </div>
                <div className="kr-d2-scan-tree-row">
                  <span className="kr-d2-scan-tree-glyph">├</span>
                  <span className="kr-d2-scan-tree-text">read.customDimensions</span>
                  <span className="kr-d2-scan-tree-count is-ok">✓ 30 fields</span>
                </div>
                <div className="kr-d2-scan-tree-row kr-d2-scan-tree-pad">
                  <span className="kr-d2-scan-tree-glyph">├─</span>
                  <span className="kr-d2-scan-tree-text-mute kr-d2-scan-tree-text">http.request.header.host</span>
                  <span className="kr-d2-scan-tree-count is-ok">✓</span>
                </div>
                <div className="kr-d2-scan-tree-row kr-d2-scan-tree-pad">
                  <span className="kr-d2-scan-tree-glyph">├─</span>
                  <span className="kr-d2-scan-tree-text-mute kr-d2-scan-tree-text">http.request.header.x_k8se_app_name</span>
                  <span className="kr-d2-scan-tree-count is-ok">✓</span>
                </div>
                <div className="kr-d2-scan-tree-row kr-d2-scan-tree-pad">
                  <span className="kr-d2-scan-tree-glyph">└─</span>
                  <span className="kr-d2-scan-tree-text-mute kr-d2-scan-tree-text">+ 28 more dimensions</span>
                  <span className="kr-d2-scan-tree-count">··</span>
                </div>
                <div className="kr-d2-scan-tree-row is-active">
                  <span className="kr-d2-scan-tree-glyph">├</span>
                  <span className="kr-d2-scan-tree-text">count.events</span>
                  <span className="kr-d2-scan-tree-count is-active">◐ 154 / ?</span>
                </div>
                <div className="kr-d2-scan-tree-row kr-d2-scan-tree-pad">
                  <span className="kr-d2-scan-tree-glyph">├─</span>
                  <span className="kr-d2-scan-tree-text-mute kr-d2-scan-tree-text">requests · pageViews · dependencies</span>
                  <span className="kr-d2-scan-tree-count is-active">running</span>
                </div>
                <div className="kr-d2-scan-tree-row kr-d2-scan-tree-pad">
                  <span className="kr-d2-scan-tree-glyph">└─</span>
                  <span className="kr-d2-scan-tree-text-mute kr-d2-scan-tree-text">traces · exceptions · customEvents</span>
                  <span className="kr-d2-scan-tree-count">queued</span>
                </div>
                <div className="kr-d2-scan-tree-row">
                  <span className="kr-d2-scan-tree-glyph">├</span>
                  <span className="kr-d2-scan-tree-text-mute kr-d2-scan-tree-text">detect.identity</span>
                  <span className="kr-d2-scan-tree-count">queued</span>
                </div>
                <div className="kr-d2-scan-tree-row">
                  <span className="kr-d2-scan-tree-glyph">└</span>
                  <span className="kr-d2-scan-tree-text-mute kr-d2-scan-tree-text">llm.summarize</span>
                  <span className="kr-d2-scan-tree-count">queued</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <CommandBarD2 scope="setup · scanning · 03 / 05" ctaLabel="Continue → findings" ctaAccent />
      </div>
    </Frame>
  );
}

/* ───── AI findings D v2 — same hero, command bar at bottom ───── */
function FindingsD2({ viewport, theme, toggleTheme }) {
  const Frame = viewport === 'mobile' ? MobileFrame : DesktopFrame;
  const desktop = viewport === 'desktop';

  const sparkMap = { traffic: 'rising', pages: 'flat', perf: 'spiky', geo: 'flat', tech: 'rising' };

  return (
    <Frame theme={theme} url="keren.run/setup">
      <div className="kr-d-frame">
        <TopbarD2 active="Setup" />
        <div className={`kr-d-body ${desktop ? 'kr-d-body--desktop' : ''}`}>
          <div className="kr-d2-pageheader" style={!desktop ? { flexDirection: 'column', alignItems: 'flex-start' } : undefined}>
            <div className="kr-d2-pageheader-l">
              <div className="kr-d2-breadcrumb">
                <span>vikl.fr</span>
                <span className="kr-d2-breadcrumb-sep">/</span>
                <span>vikl-app-service-prd</span>
                <span className="kr-d2-breadcrumb-sep">/</span>
                <span className="kr-d2-breadcrumb-here">findings</span>
                <span className="kr-d2-breadcrumb-tag" style={{ color: 'var(--kr-accent)', background: 'var(--kr-accent-soft)', borderColor: 'transparent' }}>
                  AI · gpt-4.1
                </span>
              </div>
              <h1 className={`kr-d2-h1 ${desktop ? 'kr-d2-h1--xl' : ''}`}>What we can render</h1>
              <p className="kr-d2-sub">
                5 of 7 dashboards can render now. 2 need extra instrumentation to be useful — we've drafted the prompts so you can ship them in minutes.
              </p>
            </div>
            {desktop && (
              <div className="kr-d2-pageheader-r">
                <button className="kr-d2-headeraction">← Re-scan</button>
                <button className="kr-d2-headeraction kr-d2-headeraction-accent">Review &amp; save →</button>
              </div>
            )}
          </div>

          <div className="kr-d-progress">
            {[
              { label: 'Scanning', state: 'done', num: '01' },
              { label: 'AI findings', state: 'active', num: '02' },
              { label: 'Validate', state: 'pending', num: '03' },
              { label: 'Save', state: 'pending', num: '04' },
            ].map((s) => (
              <div key={s.num} className={`kr-d-progress-step is-${s.state}`}>
                <div className="kr-d-progress-bar"><div className="kr-d-progress-bar-fill" /></div>
                <div className="kr-d-progress-label">
                  <span><span className="kr-d-progress-label-num">{s.num}</span> · {s.label}</span>
                  <span>{s.state === 'active' ? 'now' : s.state === 'done' ? '✓' : ''}</span>
                </div>
              </div>
            ))}
          </div>

          <div className={`kr-d-find-hero ${desktop ? 'kr-d-find-hero--desktop' : ''}`}>
            <div className="kr-d-find-gauge">
              <div className="kr-d-find-gauge-tag">Readiness score</div>
              <div className="kr-d-find-gauge-num">71<sup>/100</sup></div>
              <div className="kr-d-find-gauge-track">
                <div className="kr-d-find-gauge-fill" style={{ width: '71%' }} />
              </div>
              <div style={{ display: 'flex', gap: 12, fontFamily: 'Geist Mono, monospace', fontSize: 10.5, color: 'var(--kr-text-muted)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                <span>↑ 29 to perfect</span>
                <span>· 2 signals</span>
              </div>
            </div>
            <div>
              <div className="kr-d-find-summary">
                Your tenant has <strong>strong request-level telemetry, browser timings,</strong> and <strong>page-route signals,</strong> but does not currently emit user or session identity. Traffic, pages, performance, geography, and devices render now. Users and campaigns stay incomplete until identity and attribution are instrumented.
              </div>
              <div className="kr-d-find-summary-meta">
                <span>via azure-foundry · gpt-4.1</span>
                <span>·</span>
                <span>scanned 16:54:22</span>
              </div>
            </div>
          </div>

          <div className="kr-d-find-section-title">
            <h3>What we can render</h3>
            <span>5 ready · 2 to instrument</span>
          </div>

          <div className={`kr-d-find-grid ${desktop ? 'kr-d-find-grid--desktop' : ''}`}>
            {PANELS.map((p) => (
              <div key={p.id} className={`kr-d-find-card kr-d-find-card--${p.state === 'ok' ? 'ok' : 'needs'}`}>
                <div className="kr-d-find-card-head">
                  <div>
                    <div className="kr-d-find-card-name">{p.title}</div>
                    <div className="kr-d-find-card-desc">{p.desc}</div>
                  </div>
                  <span className={`kr-d-statpill kr-d-statpill--${p.state === 'ok' ? 'ready' : 'incomplete'}`}>
                    <span className="kr-d-statpill-dot" />
                    {p.state === 'ok' ? 'Ready' : 'Signal needed'}
                  </span>
                </div>
                <div className="kr-d-find-card-preview">
                  {p.state === 'ok'
                    ? <Spark kind={sparkMap[p.id] || 'rising'} w={200} h={40} />
                    : <><span>blocked on</span><code>{p.missing}</code></>}
                </div>
              </div>
            ))}
          </div>

          <div className="kr-d-find-improve">
            <div className="kr-d-find-improve-head">
              <div>
                <h3 className="kr-d-find-improve-title">Improve your coverage</h3>
                <p className="kr-d-find-improve-sub">Two signals away from a complete picture. We've drafted the prompts you can paste into your codebase.</p>
              </div>
            </div>
            {MISSING_SIGNALS.map((m) => (
              <div key={m.field} className={`kr-d-find-improve-item ${desktop ? 'kr-d-find-improve-item--desktop' : ''}`}>
                <div className="kr-d-find-improve-field">
                  <span className="kr-d-find-improve-field-tag">missing</span>
                  {m.field}
                </div>
                <div className="kr-d-find-improve-desc">{m.desc}</div>
                <button className="kr-d-find-improve-cta">
                  <span className="kr-d-find-improve-cta-kbd">⌘</span> Use prompt
                </button>
              </div>
            ))}
          </div>
        </div>

        <CommandBarD2 scope="setup · findings · 02 / 04" ctaLabel="Review & save →" ctaAccent />
      </div>
    </Frame>
  );
}

Object.assign(window, { SelectD2, ScanD2, FindingsD2 });
