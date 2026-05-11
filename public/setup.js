/**
 * Setup wizard — Track F4 (ADR 0005).
 *
 * 4-step state machine over /api/setup/{state,scan,findings,validate}.
 * Vanilla JS to match public/app.js conventions; no bundler.
 */
(function () {
  "use strict";

  const STEPS = ["scanning", "findings", "validate", "complete"];

  const SCANNING_NARRATION = [
    "Connecting to Application Insights…",
    "Reading custom dimensions…",
    "Counting event types and volumes…",
    "Detecting user identity, sessions, and page paths…",
    "Asking the AI to make sense of it…",
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

  function appendLog(text, kind = "info") {
    const li = document.createElement("li");
    li.className = `setup-log-line setup-log-${kind}`;
    li.textContent = text;
    $("scanningLog").appendChild(li);
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
    const errorEl = $("scanningError");
    errorEl.classList.add("hidden");
    errorEl.innerHTML = "";
    $("scanningLog").innerHTML = "";

    let i = 0;
    const tick = () => {
      if (i >= SCANNING_NARRATION.length) return;
      narrationEl.textContent = SCANNING_NARRATION[i];
      appendLog(SCANNING_NARRATION[i]);
      i += 1;
    };
    tick();
    const interval = setInterval(tick, 1100);

    const handleFailure = (err) => {
      narrationEl.textContent = "Scan failed.";
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
      const result = await api("POST", "/api/setup/scan");
      clearInterval(interval);
      narrationEl.textContent = "Scan complete.";
      appendLog(`Scan complete (scan #${result.scanId || "?"}, mapping #${result.mappingId || "?"}).`, "ok");
      await loadFindings();
      show("findings");
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

  function renderFindings() {
    const f = state.findings;
    if (!f) return;
    const resName = f.selectedResource?.appInsightsName || f.selectedResource?.name || "your resource";
    $("findingsSubtitle").textContent =
      `Scanned ${escapeHtml(resName)} on ${new Date(f.scan.scannedAt).toLocaleString()}.`;

    // Tables present
    const tablesUl = $("tablesList");
    tablesUl.innerHTML = "";
    const tables = f.scan.tables || {};
    const present = Object.entries(tables).filter(([, v]) => v).map(([k]) => k);
    const missing = Object.entries(tables).filter(([, v]) => !v).map(([k]) => k);
    for (const name of present) {
      const li = document.createElement("li");
      li.className = "setup-pill setup-pill-present";
      li.textContent = name;
      tablesUl.appendChild(li);
    }
    for (const name of missing) {
      const li = document.createElement("li");
      li.className = "setup-pill setup-pill-missing";
      li.textContent = name;
      li.title = "Not populated in the scan window";
      tablesUl.appendChild(li);
    }

    // Custom dimensions
    const cds = f.scan.customDimensions || [];
    $("customDimsCount").textContent = `(${cds.length})`;
    const cdUl = $("customDimsList");
    cdUl.innerHTML = "";
    for (const cd of cds.slice(0, 12)) {
      const li = document.createElement("li");
      li.className = "setup-cd-row";
      li.innerHTML = `
        <div class="setup-cd-key">${escapeHtml(cd.keyName)}<span class="setup-cd-table">@ ${escapeHtml(cd.tableName)}</span></div>
        <div class="setup-cd-meta">cardinality ${cd.cardinality ?? "?"} · ${cd.occurrences ?? "?"} occurrences</div>
        ${cd.samples && cd.samples.length ? `<div class="setup-cd-samples">e.g. ${cd.samples.slice(0,3).map((s) => `<code>${escapeHtml(s)}</code>`).join(", ")}</div>` : ""}
      `;
      cdUl.appendChild(li);
    }
    if (cds.length > 12) {
      const li = document.createElement("li");
      li.className = "setup-cd-more";
      li.textContent = `…and ${cds.length - 12} more`;
      cdUl.appendChild(li);
    }

    // Event names
    const evs = f.scan.eventNames || [];
    $("eventNamesCount").textContent = `(${evs.length})`;
    const evUl = $("eventNamesList");
    evUl.innerHTML = "";
    for (const ev of evs.slice(0, 10)) {
      const li = document.createElement("li");
      li.className = "setup-pill";
      li.innerHTML = `${escapeHtml(ev.name)} <span class="setup-pill-count">${ev.count}</span>`;
      evUl.appendChild(li);
    }

    // Gaps
    const gaps = f.scan.gaps || [];
    const gapsUl = $("gapsList");
    gapsUl.innerHTML = "";
    if (gaps.length === 0) {
      const li = document.createElement("li");
      li.className = "setup-gap-empty";
      li.textContent = "None — your instrumentation covers the canonical signals.";
      gapsUl.appendChild(li);
    } else {
      for (const gap of gaps) {
        const li = document.createElement("li");
        li.className = `setup-gap setup-gap-${escapeHtml(gap.severity || "medium")}`;
        li.innerHTML = `<strong>${escapeHtml(gap.title)}</strong><span>${escapeHtml(gap.detail || "")}</span>`;
        gapsUl.appendChild(li);
      }
    }

    // Effective mapping = unified view across AI proposals + deterministic
    // fallback. Wizard always shows what the dashboard will actually use,
    // regardless of AI status. Source badge per row tells the user which
    // layer is responsible.
    const m = f.mapping;
    const effective = Array.isArray(f.effectiveMapping) ? f.effectiveMapping : [];
    const tagEl = $("mappingSource");
    const hasAi = m && !m.degraded;
    if (hasAi) {
      tagEl.textContent = `via ${m.source}`;
      tagEl.className = "setup-source-tag setup-source-ai";
    } else {
      tagEl.textContent = "deterministic fallback";
      tagEl.className = "setup-source-tag setup-source-fallback";
    }
    $("aiSummary").textContent =
      m?.proposals?.summary ||
      "No AI summary available — your dashboard will use the deterministic mapping shown below. You can still override any field in the next step.";

    const proposalsBody = $("proposalsBody");
    proposalsBody.innerHTML = "";
    state.activeSources = {};
    for (const row of effective) {
      state.activeSources[row.canonical] = { source: row.source, expr: row.expr };
      const originTag = row.origin === "ai"
        ? `<span class="setup-origin setup-origin-ai">AI</span>`
        : row.origin === "deterministic"
          ? `<span class="setup-origin setup-origin-det">deterministic</span>`
          : `<span class="setup-origin setup-origin-none">missing</span>`;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${escapeHtml(row.canonical)}</code> ${originTag}</td>
        <td>${row.source ? `<code>${escapeHtml(row.source)}</code>` : "<em>—</em>"}</td>
        <td><span class="setup-confidence setup-confidence-${escapeHtml(row.confidence)}">${escapeHtml(row.confidence)}</span></td>
        <td class="setup-cell-reasoning">${escapeHtml(row.reasoning || "")}</td>
      `;
      proposalsBody.appendChild(tr);
    }

    // Missing signals
    const ms = m?.proposals?.missing_signals || [];
    const msUl = $("missingSignalsList");
    msUl.innerHTML = "";
    if (ms.length === 0) {
      const li = document.createElement("li");
      li.className = "setup-missing-empty";
      li.textContent = "Nothing flagged. Solid telemetry coverage.";
      msUl.appendChild(li);
    } else {
      for (const s of ms) {
        const li = document.createElement("li");
        li.className = "setup-missing";
        const kqlSnippet = s.recommended_kql || "";
        li.innerHTML = `
          <div class="setup-missing-head">
            <strong>${escapeHtml(s.signal)}</strong>
            <button class="setup-copy-btn" data-copy="${escapeHtml(kqlSnippet)}" type="button">Copy KQL</button>
          </div>
          <p class="setup-missing-why">${escapeHtml(s.why_missing)}</p>
          ${kqlSnippet ? `<pre class="setup-missing-kql"><code>${escapeHtml(kqlSnippet)}</code></pre>` : ""}
          <p class="setup-missing-remediation">${escapeHtml(s.remediation || "")}</p>
        `;
        msUl.appendChild(li);
      }
    }
    msUl.querySelectorAll(".setup-copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const text = btn.dataset.copy || "";
        navigator.clipboard?.writeText(text).then(() => {
          btn.textContent = "Copied";
          setTimeout(() => { btn.textContent = "Copy KQL"; }, 1500);
        }).catch(() => { /* clipboard denied — leave label */ });
      });
    });
  }

  // ── Step 3 — Validate ────────────────────────────────────────
  function renderValidate() {
    const f = state.findings;
    const effective = Array.isArray(f?.effectiveMapping) ? f.effectiveMapping : [];
    const fields = ["canonicalUserId", "canonicalSessionId", "canonicalPagePath", "canonicalReferrer"];
    const byCanonical = Object.fromEntries(effective.map((r) => [r.canonical, r]));
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
