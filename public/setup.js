/**
 * Setup wizard — Track F4 (ADR 0005).
 *
 * 4-step state machine over /api/setup/{state,scan,findings,validate}.
 * Vanilla JS to match public/app.js conventions; no bundler.
 */
(function () {
  "use strict";

  const STEPS = ["scanning", "findings", "validate", "complete"];

  // Each scanning step in the log is clickable post-scan: a renderer maps the
  // findings payload onto a debug panel that expands beneath the step row.
  // This gives the user (and us, when debugging) full transparency about what
  // the orchestrator actually fetched at each stage.
  const SCANNING_STEPS = [
    { key: "connect", label: "Connecting to Application Insights…" },
    { key: "customDimensions", label: "Reading custom dimensions…" },
    { key: "eventVolumes", label: "Counting event types and volumes…" },
    { key: "identity", label: "Detecting user identity, sessions, and page paths…" },
    { key: "ai", label: "Asking the AI to make sense of it…" },
  ];

  const state = {
    step: "scanning",
    findings: null,        // /api/setup/findings response
    overrides: {},         // user-edited canonical fields
    activeSources: {},     // current "best guess" per canonical, used as form default
  };

  // ── DOM helpers ───────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  function show(step) {
    state.step = step;
    for (const s of STEPS) {
      const panel = document.querySelector(`#step-${s}`);
      if (panel) panel.classList.toggle("hidden", s !== step);
    }
    for (const li of document.querySelectorAll(".setup-step")) {
      const s = li.dataset.step;
      const idx = STEPS.indexOf(s);
      const cur = STEPS.indexOf(step);
      li.classList.toggle("active", idx === cur);
      li.classList.toggle("done", idx < cur);
    }
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ── Scanning log helpers ──────────────────────────────────────
  // The log starts as a fixed list of "pending" steps. The narration ticker
  // marks the active one, and once /api/setup/scan returns we mark them all
  // done and wire each row to its renderStepDetails() debug panel.

  function initScanningLog() {
    const ul = $("scanningLog");
    ul.innerHTML = "";
    for (const step of SCANNING_STEPS) {
      const li = document.createElement("li");
      li.className = "setup-log-line setup-log-pending";
      li.dataset.step = step.key;
      li.innerHTML = `
        <button type="button" class="setup-log-toggle" aria-expanded="false" aria-disabled="true">
          <span class="setup-log-marker" aria-hidden="true"></span>
          <span class="setup-log-text"></span>
          <span class="setup-log-chevron" aria-hidden="true">▸</span>
        </button>
        <div class="setup-log-details" role="region" hidden></div>
      `;
      li.querySelector(".setup-log-text").textContent = step.label;
      ul.appendChild(li);
    }
  }

  function markStepActive(idx) {
    const items = $("scanningLog").children;
    for (let i = 0; i < items.length; i++) {
      items[i].classList.toggle("setup-log-active", i === idx);
    }
  }

  function markStepsComplete(findings) {
    for (const li of $("scanningLog").children) {
      li.classList.remove("setup-log-pending", "setup-log-active");
      li.classList.add("setup-log-done");
      const toggle = li.querySelector(".setup-log-toggle");
      const details = li.querySelector(".setup-log-details");
      toggle.removeAttribute("aria-disabled");
      details.innerHTML = renderStepDetails(li.dataset.step, findings);
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        details.hidden = expanded;
      });
    }
  }

  function renderStepDetails(key, findings) {
    const f = findings || {};
    if (key === "connect") return renderConnectDetails(f);
    if (key === "customDimensions") return renderCustomDimensionsDetails(f);
    if (key === "eventVolumes") return renderEventVolumesDetails(f);
    if (key === "identity") return renderIdentityDetails(f);
    if (key === "ai") return renderAiDetails(f);
    return "";
  }

  function renderConnectDetails(f) {
    const r = f.selectedResource || {};
    const span = f.scan?.timestampSpan || {};
    const rows = [
      ["Resource", r.appInsightsName || r.name],
      ["Subscription", r.subscriptionId],
      ["Resource group", r.resourceGroup],
      ["Workspace ID", r.workspaceId],
      ["Scanned at", f.scan?.scannedAt],
      ["Earliest event", span.earliest],
      ["Latest event", span.latest],
    ];
    return `<dl class="setup-log-kv">${rows.map(([k, v]) => `
      <dt>${escapeHtml(k)}</dt><dd>${v ? `<code>${escapeHtml(v)}</code>` : "<em>—</em>"}</dd>
    `).join("")}</dl>`;
  }

  function renderCustomDimensionsDetails(f) {
    const cds = f.scan?.customDimensions || [];
    if (cds.length === 0) {
      return `<p class="setup-log-empty">No custom dimensions found in the scan window.</p>`;
    }
    const rows = cds.map((cd) => `
      <tr>
        <td><code>${escapeHtml(cd.keyName)}</code></td>
        <td><code>${escapeHtml(cd.tableName)}</code></td>
        <td>${cd.cardinality ?? "?"}</td>
        <td>${cd.occurrences ?? "?"}</td>
        <td>${(cd.samples || []).slice(0, 3).map((s) => `<code>${escapeHtml(s)}</code>`).join(", ") || "<em>—</em>"}</td>
      </tr>
    `).join("");
    return `
      <p class="setup-log-summary">${cds.length} custom-dimension key(s) detected across all tables. Sample values are PII-scrubbed before persistence.</p>
      <div class="setup-log-table-wrap">
        <table class="setup-log-table">
          <thead><tr><th>Key</th><th>Table</th><th>Cardinality</th><th>Occurrences</th><th>Sample values</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderEventVolumesDetails(f) {
    const tables = f.scan?.tables || {};
    const events = f.scan?.eventNames || [];
    const tablePills = Object.entries(tables).map(([name, present]) => `
      <li class="setup-pill setup-pill-${present ? "present" : "missing"}">${escapeHtml(name)}</li>
    `).join("") || `<li class="setup-log-empty">No table presence info reported.</li>`;
    const evRows = events.length === 0
      ? `<tr><td colspan="2"><em>No events recorded in the scan window.</em></td></tr>`
      : events.map((e) => `
          <tr><td><code>${escapeHtml(e.name)}</code></td><td>${e.count}</td></tr>
        `).join("");
    return `
      <h4 class="setup-log-h4">Tables populated</h4>
      <ul class="setup-pill-list setup-log-pills">${tablePills}</ul>
      <h4 class="setup-log-h4">Event types (${events.length})</h4>
      <div class="setup-log-table-wrap">
        <table class="setup-log-table">
          <thead><tr><th>Event name</th><th>Count</th></tr></thead>
          <tbody>${evRows}</tbody>
        </table>
      </div>
    `;
  }

  function renderIdentityDetails(f) {
    const eff = Array.isArray(f.effectiveMapping) ? f.effectiveMapping : [];
    const gaps = f.scan?.gaps || [];
    const mapRows = eff.length === 0
      ? `<tr><td colspan="4"><em>No mapping produced yet.</em></td></tr>`
      : eff.map((row) => `
          <tr>
            <td><code>${escapeHtml(row.canonical)}</code></td>
            <td>${row.source ? `<code>${escapeHtml(row.source)}</code>` : "<em>—</em>"}</td>
            <td><span class="setup-origin setup-origin-${escapeHtml(row.origin || "none")}">${escapeHtml(row.origin || "missing")}</span></td>
            <td><span class="setup-confidence setup-confidence-${escapeHtml(row.confidence)}">${escapeHtml(row.confidence)}</span></td>
          </tr>
        `).join("");
    const gapBlock = gaps.length === 0
      ? `<p class="setup-log-empty">No gaps detected — canonical identity coverage looks complete.</p>`
      : `<ul class="setup-gaps-list">${gaps.map((g) => `
          <li class="setup-gap setup-gap-${escapeHtml(g.severity || "medium")}">
            <strong>${escapeHtml(g.title)}</strong><span>${escapeHtml(g.detail || "")}</span>
          </li>
        `).join("")}</ul>`;
    return `
      <h4 class="setup-log-h4">Effective canonical mapping</h4>
      <div class="setup-log-table-wrap">
        <table class="setup-log-table">
          <thead><tr><th>Canonical field</th><th>Source</th><th>Origin</th><th>Confidence</th></tr></thead>
          <tbody>${mapRows}</tbody>
        </table>
      </div>
      <h4 class="setup-log-h4">Gaps flagged by the heuristic</h4>
      ${gapBlock}
    `;
  }

  function renderAiDetails(f) {
    const m = f.mapping;
    if (!m) {
      return `<p class="setup-log-empty">No AI mapping was returned — the deterministic fallback is in effect.</p>`;
    }
    const kv = [
      ["Source", m.source],
      ["Degraded", m.degraded ? "yes (fell back to deterministic)" : "no"],
      ["Created at", m.createdAt],
    ];
    const recs = m.proposals?.dashboard_recommendations;
    const recsBlock = recs ? `
      <h4 class="setup-log-h4">Dashboard recommendations</h4>
      <dl class="setup-log-kv">
        <dt>Feature</dt><dd>${(recs.feature || []).map((s) => `<code>${escapeHtml(s)}</code>`).join(", ") || "<em>—</em>"}</dd>
        <dt>Hide</dt><dd>${(recs.hide || []).map((s) => `<code>${escapeHtml(s)}</code>`).join(", ") || "<em>—</em>"}</dd>
        <dt>Rationale</dt><dd>${escapeHtml(recs.rationale || "—")}</dd>
      </dl>
    ` : "";
    return `
      <dl class="setup-log-kv">${kv.map(([k, v]) => `
        <dt>${escapeHtml(k)}</dt><dd>${v ? escapeHtml(v) : "<em>—</em>"}</dd>
      `).join("")}</dl>
      <h4 class="setup-log-h4">AI summary</h4>
      <p class="setup-log-prose">${escapeHtml(m.proposals?.summary || "—")}</p>
      ${recsBlock}
      <h4 class="setup-log-h4">Raw proposals payload</h4>
      <pre class="setup-log-json"><code>${escapeHtml(JSON.stringify(m.proposals ?? null, null, 2))}</code></pre>
    `;
  }

  // ── API ───────────────────────────────────────────────────────
  async function api(method, url, body) {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    let payload = null;
    try { payload = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
      const message = payload?.message || payload?.error || res.statusText;
      const err = new Error(message);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  // ── Step 1 — Resource selection + Scanning ────────────────────
  //
  // Sub-views inside #step-scanning: a resource picker (only when the
  // tenant has >1 App Insights and none is selected) and the scanning
  // animation. We pre-flight /azure/discover so the picker is offered
  // *before* /api/setup/scan ever runs — without that, the orchestrator
  // returned RESOURCE_SELECTION_REQUIRED and the wizard had no UI to
  // resolve it.
  function showPickerView() {
    $("resourcePicker").classList.remove("hidden");
    $("scanningPanel").classList.add("hidden");
  }
  function showScanningView() {
    $("resourcePicker").classList.add("hidden");
    $("scanningPanel").classList.remove("hidden");
  }

  async function startStep1() {
    show("scanning");
    const pickerErrorEl = $("resourcePickerError");
    pickerErrorEl.classList.add("hidden");
    pickerErrorEl.textContent = "";

    let discovery;
    try {
      discovery = await api("GET", "/azure/discover");
    } catch (err) {
      // No picker yet → render the error in the scanning panel so the user
      // still sees something actionable. 401 falls through to runScan which
      // handles auth redirect.
      showScanningView();
      await runScan({ skipApiCall: true, prefetchError: err });
      return;
    }

    const resources = discovery.resources || [];
    if (resources.length === 0) {
      showScanningView();
      const errorEl = $("scanningError");
      errorEl.innerHTML = "";
      const msg = document.createElement("p");
      msg.className = "setup-error-message";
      msg.textContent =
        "No Application Insights resources found in this tenant. Create one in Azure, then come back.";
      errorEl.appendChild(msg);
      errorEl.classList.remove("hidden");
      $("scanningNarration").textContent = "Nothing to scan.";
      return;
    }

    if (discovery.selectedResource || discovery.autoSelected || resources.length === 1) {
      // Single resource → orchestrator already wrote selectedResource, or a
      // prior selection survives. Skip the picker.
      showScanningView();
      await runScan();
      return;
    }

    renderResourcePicker(resources);
    showPickerView();
  }

  function renderResourcePicker(resources) {
    const list = $("resourcePickerList");
    list.innerHTML = "";

    // Same env detection / sort order as /services so users see the same
    // grouping in both surfaces.
    const sorted = [...resources].sort((a, b) =>
      (a.appInsightsName || "").localeCompare(b.appInsightsName || "")
    );

    for (const resource of sorted) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "setup-resource-card";

      const name = document.createElement("div");
      name.className = "setup-resource-card-name";
      name.textContent = resource.appInsightsName || "(unnamed)";
      card.appendChild(name);

      const meta = document.createElement("div");
      meta.className = "setup-resource-card-meta";
      const parts = [];
      if (resource.resourceGroup) parts.push(resource.resourceGroup);
      if (resource.subscriptionId) parts.push(resource.subscriptionId.slice(0, 8) + "…");
      meta.textContent = parts.join(" · ");
      card.appendChild(meta);

      card.addEventListener("click", () => selectResource(resource, card));
      list.appendChild(card);
    }
  }

  async function selectResource(resource, cardEl) {
    const list = $("resourcePickerList");
    const errorEl = $("resourcePickerError");
    errorEl.classList.add("hidden");
    for (const c of list.children) c.disabled = true;
    if (cardEl) cardEl.classList.add("loading");

    try {
      await api("POST", "/azure/select", {
        resourceId: resource.resourceId,
        workspaceId: resource.workspaceId,
        subscriptionId: resource.subscriptionId,
        resourceGroup: resource.resourceGroup,
        appInsightsName: resource.appInsightsName,
      });
      showScanningView();
      await runScan();
    } catch (err) {
      for (const c of list.children) c.disabled = false;
      if (cardEl) cardEl.classList.remove("loading");
      errorEl.textContent = err.message || "Could not select that resource.";
      errorEl.classList.remove("hidden");
    }
  }

  async function runScan(opts = {}) {
    const narrationEl = $("scanningNarration");
    const headingEl = $("scanningHeading");
    const spinnerEl = $("scanningSpinner");
    const footerEl = $("scanningFooter");
    const errorEl = $("scanningError");

    // Reset scanning view for a fresh run (including Re-scan from findings).
    errorEl.classList.add("hidden");
    errorEl.innerHTML = "";
    footerEl.classList.add("hidden");
    spinnerEl.classList.remove("hidden");
    headingEl.textContent = "Scanning your telemetry…";
    initScanningLog();

    let i = 0;
    const tick = () => {
      if (i >= SCANNING_STEPS.length) return;
      narrationEl.textContent = SCANNING_STEPS[i].label;
      markStepActive(i);
      i += 1;
    };
    tick();
    const interval = setInterval(tick, 1100);

    const handleFailure = (err) => {
      narrationEl.textContent = "Scan failed.";
      headingEl.textContent = "Scan failed.";
      spinnerEl.classList.add("hidden");
      errorEl.innerHTML = "";
      const msgEl = document.createElement("p");
      msgEl.className = "setup-error-message";
      const actionsEl = document.createElement("div");
      actionsEl.className = "setup-error-actions";

      if (err.status === 401) {
        // Session expired — bounce to "/" so the OAuth flow takes over.
        msgEl.textContent = "You're not signed in. Redirecting…";
        setTimeout(() => { window.location.href = "/"; }, 1200);
      } else if (err.status === 409 && err.payload?.error === "RESOURCE_SELECTION_REQUIRED") {
        // Should not happen now that startStep1() pre-flights, but stay safe:
        // re-run the pre-flight, which will surface the picker.
        msgEl.textContent = "A resource selection is required. Loading picker…";
        setTimeout(() => startStep1(), 600);
      } else {
        msgEl.textContent = err.message || "Unknown error";
        const retryBtn = document.createElement("button");
        retryBtn.type = "button";
        retryBtn.className = "btn-primary";
        retryBtn.textContent = "Retry";
        retryBtn.addEventListener("click", () => startStep1());
        actionsEl.appendChild(retryBtn);
      }

      errorEl.appendChild(msgEl);
      if (actionsEl.childElementCount > 0) errorEl.appendChild(actionsEl);
      errorEl.classList.remove("hidden");
    };

    if (opts.skipApiCall) {
      clearInterval(interval);
      handleFailure(opts.prefetchError || new Error("Scan unavailable"));
      return;
    }

    try {
      await api("POST", "/api/setup/scan");
      clearInterval(interval);
      await loadFindings();
      // Don't auto-advance: stay on the scanning panel so the user can inspect
      // what was retrieved at each step. They click "Continue" to move on.
      spinnerEl.classList.add("hidden");
      headingEl.textContent = "Scan complete.";
      narrationEl.textContent = "Click any step to inspect what we collected.";
      markStepsComplete(state.findings);
      footerEl.classList.remove("hidden");
    } catch (err) {
      clearInterval(interval);
      handleFailure(err);
    }
  }

  // ── Step 2 — Findings ─────────────────────────────────────────
  async function loadFindings() {
    state.findings = await api("GET", "/api/setup/findings");
    renderFindings();
  }

  // Dashboard panels the AI is told to score in promptBuilder.js. Order here
  // drives the visual grid order on step 2; labels stay short to fit a card.
  const DASHBOARD_PANELS = [
    { id: "traffic",     label: "Traffic trends",      hint: "Visits over time, hourly peaks." },
    { id: "users",       label: "User analytics",      hint: "Unique users, cohorts, retention." },
    { id: "sessions",    label: "Session insights",    hint: "Length, engagement, return rate." },
    { id: "pages",       label: "Top pages",           hint: "Most-viewed paths, content performance." },
    { id: "geo",         label: "Geo distribution",    hint: "Where your traffic comes from." },
    { id: "devices",     label: "Devices & browsers",  hint: "OS, browser, screen split." },
    { id: "performance", label: "Performance",         hint: "Slow endpoints, request duration." },
    { id: "campaigns",   label: "Campaigns & sources", hint: "UTM tracking, referrer attribution." },
  ];

  function renderFindings() {
    const f = state.findings;
    if (!f) return;
    const resName = f.selectedResource?.appInsightsName || f.selectedResource?.name || "your resource";
    $("findingsSubtitle").textContent =
      `Scanned ${resName} on ${new Date(f.scan.scannedAt).toLocaleString()}.`;

    // AI summary (banner). When the AI was degraded, we still get a deterministic
    // result — say so explicitly so the user knows the cards below are
    // heuristic, not LLM-judged.
    const m = f.mapping;
    const summary = m?.proposals?.summary;
    const summaryEl = $("findingsSummary");
    summaryEl.innerHTML = "";
    if (summary) {
      summaryEl.classList.remove("hidden");
      summaryEl.innerHTML = `
        <p class="setup-summary-text">${escapeHtml(summary)}</p>
        <span class="setup-summary-source">via ${escapeHtml(m?.source || "ai")}</span>
      `;
    } else if (m?.degraded || !m) {
      summaryEl.classList.remove("hidden");
      summaryEl.innerHTML = `
        <p class="setup-summary-text">No AI summary — the cards below reflect a deterministic heuristic. The dashboard will still render based on what we detected.</p>
        <span class="setup-summary-source setup-summary-source-fallback">deterministic fallback</span>
      `;
    } else {
      summaryEl.classList.add("hidden");
    }

    // Graph-level cards: ✓ ready / ! needs setup / · partial, driven entirely
    // by AI's dashboard_recommendations. We trust the AI here — there is no
    // hard signal→panel table on the backend (would have to be maintained as
    // panels evolve). Low-confidence overrides are caught in step 3.
    const recs = m?.proposals?.dashboard_recommendations || { feature: [], hide: [] };
    const featureSet = new Set(recs.feature || []);
    const hideSet = new Set(recs.hide || []);
    const grid = $("graphsGrid");
    grid.innerHTML = "";
    for (const panel of DASHBOARD_PANELS) {
      const featured = featureSet.has(panel.id);
      const hidden = hideSet.has(panel.id);
      let statusClass, statusLabel, icon;
      if (featured) { statusClass = "ready"; statusLabel = "Ready"; icon = "✓"; }
      else if (hidden) { statusClass = "missing"; statusLabel = "Needs instrumentation"; icon = "!"; }
      else { statusClass = "partial"; statusLabel = "Partial"; icon = "·"; }
      const card = document.createElement("article");
      card.className = `setup-graph-card setup-graph-${statusClass}`;
      card.innerHTML = `
        <span class="setup-graph-card-icon" aria-hidden="true">${icon}</span>
        <div class="setup-graph-card-body">
          <h4>${escapeHtml(panel.label)}</h4>
          <p class="setup-graph-card-hint">${escapeHtml(panel.hint)}</p>
        </div>
        <span class="setup-graph-card-status">${escapeHtml(statusLabel)}</span>
      `;
      grid.appendChild(card);
    }

    // Stash activeSources for the validate step; step 2 no longer renders the
    // technical proposals table itself.
    state.activeSources = {};
    for (const row of (f.effectiveMapping || [])) {
      state.activeSources[row.canonical] = { source: row.source, expr: row.expr };
    }

    // "Improve your coverage" — primary action is the AI-generated code prompt
    // the user pastes into Cursor / Claude Code. The KQL stays available under
    // a disclosure for power users who want to see the query that would run.
    const ms = m?.proposals?.missing_signals || [];
    const msUl = $("missingSignalsList");
    const coverageIntro = $("coverageIntro");
    msUl.innerHTML = "";
    if (ms.length === 0) {
      coverageIntro.textContent = "Solid coverage — nothing flagged.";
    } else {
      coverageIntro.textContent = "Add the signals below to unlock the ‘Needs instrumentation’ panels.";
      for (const s of ms) {
        const li = document.createElement("li");
        li.className = "setup-missing";
        const codePrompt = s.code_prompt || "";
        const kqlSnippet = s.recommended_kql || "";
        li.innerHTML = `
          <div class="setup-missing-head">
            <strong>${escapeHtml(s.signal)}</strong>
            <span class="setup-missing-actions"></span>
          </div>
          <p class="setup-missing-why">${escapeHtml(s.why_missing)}</p>
          <p class="setup-missing-remediation">${escapeHtml(s.remediation || "")}</p>
          ${codePrompt ? `
            <details class="setup-prompt-disclosure">
              <summary>Show the prompt</summary>
              <pre class="setup-missing-prompt"><code>${escapeHtml(codePrompt)}</code></pre>
            </details>
          ` : ""}
          ${kqlSnippet ? `
            <details class="setup-kql-disclosure">
              <summary>Show the KQL this would unlock (power users)</summary>
              <pre class="setup-missing-kql"><code>${escapeHtml(kqlSnippet)}</code></pre>
            </details>
          ` : ""}
        `;
        if (codePrompt && typeof window.createPromptActionButton === "function") {
          const actionBtn = window.createPromptActionButton({ prompt: codePrompt, label: "Use prompt" });
          li.querySelector(".setup-missing-actions").appendChild(actionBtn);
        }
        msUl.appendChild(li);
      }
    }
  }

  // ── Step 3 — Validate ────────────────────────────────────────
  function renderValidate() {
    const f = state.findings;
    const effective = Array.isArray(f?.effectiveMapping) ? f.effectiveMapping : [];
    const fields = ["canonicalUserId", "canonicalSessionId", "canonicalPagePath", "canonicalReferrer"];
    const byCanonical = Object.fromEntries(effective.map((r) => [r.canonical, r]));

    // Auto-expand the technical disclosure + show a warning when the AI is
    // unsure about any field. The user can still one-click save, but the
    // critical bit is now visible without an extra click.
    const lowConf = effective
      .filter((r) => fields.includes(r.canonical) && r.confidence === "low")
      .map((r) => r.canonical);
    const warn = $("validateWarning");
    const disclosure = $("mappingDisclosure");
    if (lowConf.length > 0) {
      warn.innerHTML = `
        <strong>Heads up — low confidence on:</strong>
        ${lowConf.map((name) => `<code>${escapeHtml(name)}</code>`).join(", ")}.
        Open the technical mapping below and confirm before saving.
      `;
      warn.classList.remove("hidden");
      disclosure.open = true;
    } else {
      warn.classList.add("hidden");
      disclosure.open = false;
    }

    const tbody = $("validateBody");
    tbody.innerHTML = "";

    for (const field of fields) {
      const proposal = byCanonical[field];
      const ovr = state.overrides[field];
      const active = ovr || proposal || { source: "(no source)", expr: "" };
      const isOverridden = !!ovr;
      const tr = document.createElement("tr");
      tr.dataset.field = field;
      tr.innerHTML = `
        <td><code>${escapeHtml(field)}</code></td>
        <td>
          <input type="text" class="setup-input" data-bind="source"
                 value="${escapeHtml(active.source || "")}" placeholder="customDimensions.uid"
                 ${isOverridden ? "" : "readonly"} />
        </td>
        <td>
          <input type="text" class="setup-input setup-input-mono" data-bind="expr"
                 value="${escapeHtml(active.expr || "")}" placeholder='tostring(customDimensions["uid"])'
                 ${isOverridden ? "" : "readonly"} />
        </td>
        <td>
          ${isOverridden
            ? `<button class="btn btn-ghost setup-row-btn" data-action="reset">Reset</button>`
            : `<button class="btn btn-ghost setup-row-btn" data-action="edit">Override</button>`}
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr");
        const field = tr.dataset.field;
        const proposal = byCanonical[field];
        state.overrides[field] = proposal
          ? { source: proposal.source, expr: proposal.expr }
          : { source: "", expr: "" };
        renderValidate();
        updateValidateButtons();
      });
    });
    tbody.querySelectorAll('button[data-action="reset"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr");
        const field = tr.dataset.field;
        delete state.overrides[field];
        renderValidate();
        updateValidateButtons();
      });
    });
    tbody.querySelectorAll(".setup-input").forEach((input) => {
      input.addEventListener("input", () => {
        const tr = input.closest("tr");
        const field = tr.dataset.field;
        if (!state.overrides[field]) return;
        state.overrides[field][input.dataset.bind] = input.value;
      });
    });

    updateValidateButtons();
  }

  function updateValidateButtons() {
    const hasOverrides = Object.keys(state.overrides).length > 0;
    $("validateAcceptAll").classList.toggle("hidden", hasOverrides);
    $("validateSaveOverrides").classList.toggle("hidden", !hasOverrides);
  }

  async function submitValidation(decision) {
    const body = decision === "override"
      ? { decision, overrides: state.overrides }
      : { decision };
    try {
      await api("POST", "/api/setup/validate", body);
      show("complete");
      setTimeout(() => { window.location.href = "/"; }, 1200);
    } catch (err) {
      alert(`Could not save: ${err.message}`);
    }
  }

  // ── Wire up ───────────────────────────────────────────────────
  function init() {
    $("scanningContinue").addEventListener("click", () => {
      show("findings");
    });
    $("scanningRescan").addEventListener("click", () => {
      startStep1();
    });
    $("findingsBack").addEventListener("click", () => {
      startStep1();
    });
    $("findingsContinue").addEventListener("click", () => {
      renderValidate();
      show("validate");
    });
    $("validateBack").addEventListener("click", () => {
      show("findings");
    });
    $("validateAcceptAll").addEventListener("click", () => submitValidation("accept_all"));
    $("validateSaveOverrides").addEventListener("click", () => submitValidation("override"));

    // Theme toggle (mirror of app.js behavior).
    const themeBtn = $("themeToggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") || "light";
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        try { localStorage.setItem("keren-theme", next); } catch {}
      });
    }

    startStep1();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
