/* Dashboard D v2 — main composition.
   3 tabs × 2 viewports × 2 variations (A = editorial, B = console). */

function MarketingTabContent({ desktop, variant, interaction }) {
  const filtered = interaction === 'filter';
  const kpis = filtered ? DASH_KPIS_FILTERED : DASH_KPIS_MARKETING;
  return (
    <>
      {variant === 'a'
        ? <DashNarrationA desktop={desktop} tab="marketing" />
        : <DashNarrationB tab="marketing" />}

      {filtered && (
        <DashFilterBar chips={[{ key: 'page', value: '/pricing' }]} />
      )}

      <KpiGrid kpis={kpis} variant={variant} desktop={desktop} />

      <PanelInsights desktop={desktop} />

      {interaction === 'hover-trend'
        ? <PanelTrafficTrendHover />
        : <PanelTrafficTrend desktop={desktop} />}

      <div className="kr-dash-section-h">Audience</div>
      {filtered ? <PanelTopPagesFiltered /> : <PanelTopPages />}
      <PanelGeo desktop={desktop} />

      <div className="kr-dash-section-h">Engagement</div>
      <div className={`kr-dash-grid-2 ${desktop ? 'kr-dash-grid-2--desktop' : ''}`}>
        <PanelPeakHours />
        <PanelFunnel />
      </div>

      <div className="kr-dash-section-h">Acquisition</div>
      <PanelCampaigns />

      <div className="kr-dash-section-h">Tech</div>
      <div className={`kr-dash-grid-3 ${desktop ? 'kr-dash-grid-3--desktop' : ''}`}>
        {interaction === 'hover-donut'
          ? <CategoryDonutFocused title="Browser" data={DASH_BROWSERS} focusIdx={1} />
          : <CategoryDonut title="Browser" data={DASH_BROWSERS} />}
        <CategoryDonut title="OS" data={DASH_OS} />
        <CategoryDonut title="Device" data={DASH_DEVICES} />
      </div>
    </>
  );
}

function TechnicalTabContent({ desktop, variant }) {
  return (
    <>
      {variant === 'a'
        ? <DashNarrationA desktop={desktop} tab="technical" />
        : <DashNarrationB tab="technical" />}

      <KpiGrid kpis={DASH_KPIS_TECHNICAL} variant={variant} desktop={desktop} />

      <div className={`kr-dash-grid-2 ${desktop ? 'kr-dash-grid-2--desktop' : ''}`} style={{ marginBottom: 12 }}>
        <PanelFrontendPerf />
        <PanelSlowEndpoints />
      </div>

      <PanelSessions />
    </>
  );
}

function ReadinessTabContent({ desktop, variant }) {
  return (
    <>
      {variant === 'a'
        ? <DashNarrationA desktop={desktop} tab="readiness" />
        : <DashNarrationB tab="readiness" />}

      <PanelScoreHero desktop={desktop} />
      <PanelSignalBreakdown desktop={desktop} />
      <PanelImproveCoverage desktop={desktop} />
    </>
  );
}

/* Topbar reused from D2; we adapt the active tab to "Services" since the
   user is inside a service. Sub-tabs handle Marketing/Technical/Readiness. */

/* Dashboard root */
function DashboardD2({ viewport, theme, tab = 'marketing', variant = 'a', interaction }) {
  const Frame = viewport === 'mobile' ? MobileFrame : DesktopFrame;
  const desktop = viewport === 'desktop';
  const url = `keren.run/services/vikl-app-service-prd/${tab}`;
  const serviceName = 'vikl-web-prd';

  const scopeLabel = interaction === 'filter'
    ? `${tab} · ${serviceName} · 7d · filter: /pricing`
    : `${tab} · ${serviceName} · 7d`;

  return (
    <Frame theme={theme} url={url}>
      <div className="kr-d-frame" style={{ position: 'relative' }}>
        <TopbarD2 active="Services" />
        <div className={`kr-d-body ${desktop ? 'kr-d-body--desktop' : ''}`} style={{ paddingBottom: 32 }}>
          <DashPageHeader
            serviceName={serviceName}
            tab={tab}
            desktop={desktop}
            narration={
              tab === 'marketing'
                ? 'Marketing dashboard — visitors, sessions, pages, geography, campaigns, and devices for the last 7 days.'
                : tab === 'technical'
                ? 'Technical dashboard — backend response, error rate, frontend performance, slow endpoints, and session timelines.'
                : 'Readiness — score across 9 signals, with prompts to close the remaining gaps.'
            }
          />

          <DashSubtabs active={tab} />

          {tab === 'marketing'  && <MarketingTabContent  desktop={desktop} variant={variant} interaction={interaction} />}
          {tab === 'technical'  && <TechnicalTabContent  desktop={desktop} variant={variant} />}
          {tab === 'readiness'  && <ReadinessTabContent  desktop={desktop} variant={variant} />}
        </div>

        <CommandBarD2Dashboard scope={scopeLabel} />

        {interaction === 'cmdk' && <CommandPalette />}
        {interaction === 'drill' && <DrillDrawer />}
      </div>
    </Frame>
  );
}

/* Dashboard-flavored command bar: no forward CTA, range shortcuts on the right.
   Keeps the same visual language but signals "this is a viewing surface". */
function CommandBarD2Dashboard({ scope }) {
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
          <span className="kr-d2-cmdbar-kbd">1</span>
          <span className="kr-d2-cmdbar-kbd">7</span>
          <span className="kr-d2-cmdbar-kbd">30</span>
          range
        </span>
        <span className="kr-d2-cmdbar-cell">
          <span className="kr-d2-cmdbar-kbd">⌘E</span>
          export
        </span>
        <span className="kr-d2-cmdbar-cell">
          <span className="kr-d2-cmdbar-kbd">⌘K</span>
          filter
        </span>
        <span className="kr-d2-cmdbar-cell">
          <span className="kr-d2-cmdbar-kbd">R</span>
          refresh
        </span>
      </div>
    </div>
  );
}

Object.assign(window, {
  DashboardD2, CommandBarD2Dashboard,
  MarketingTabContent, TechnicalTabContent, ReadinessTabContent,
});
