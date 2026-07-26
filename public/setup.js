/**
 * Setup wizard — Track F4 (ADR 0005), Direction D v2 chrome.
 *
 * 4-step state machine over /api/setup/{state,scan,findings,validate}.
 * Vanilla JS to match public/app.js conventions; no bundler.
 *
 * D v2 is presentation-only: the state machine, fetch calls, SSE handling,
 * prompt-action-button, and validate flow are unchanged from the original
 * wizard. Only the DOM each render function emits (and the page chrome —
 * topbar / progress strip / command bar) changed. See handoff-d2/.
 */
(function () {
  "use strict";

  const STEPS = ["scanning", "findings", "validate", "complete"];

  // The five pipeline stages the scan streams over SSE. Order drives both the
  // live "now" card and the schema tree on the right of the scanning split.
  const SCANNING_STEPS = [
    { key: "connect", label: "Connecting to Application Insights…" },
    { key: "customDimensions", label: "Reading custom dimensions…" },
    { key: "eventVolumes", label: "Counting event types and volumes…" },
    { key: "identity", label: "Detecting user identity, sessions, and page paths…" },
    { key: "ai", label: "Asking the AI to make sense of it…" },
  ];

  // Tree-row labels (mono, terse) + live-card copy per pipeline stage.
  const SCAN_TREE_LABELS = {
    connect: "connect",
    customDimensions: "read.customDimensions",
    eventVolumes: "count.events",
    identity: "detect.identity",
    ai: "llm.summarize",
  };
  const SCAN_TITLES = {
    connect: "Connecting to telemetry",
    customDimensions: "Reading custom dimensions",
    eventVolumes: "Counting event types & volumes",
    identity: "Detecting identity & sessions",
    ai: "Asking the model to make sense of it",
  };
  const SCAN_DETAILS = {
    connect: "Linking the Application Insights workspace and checking access.",
    customDimensions: "Enumerating custom dimensions across every table.",
    eventVolumes: "requests · pageViews · dependencies · traces · exceptions · customEvents.",
    identity: "Resolving user, session, and page-path fields from the schema.",
    ai: "Scoring which dashboards your tenant can credibly render.",
  };

  const state = {
    step: "scanning",
    findings: null,        // /api/setup/findings response
    overrides: {},         // user-edited canonical fields
    customEditing: {},     // per-field: true when the user picked "Custom KQL…"
    activeSources: {},     // current "best guess" per canonical, used as form default
    csrfToken: null,
    resourceName: null,    // for the breadcrumb / scan tree title
    scanStepIdx: 0,        // active pipeline stage (0-based) for the cmdbar scope
    scanComplete: false,   // gates the "Continue" CTA on the scanning step
    advancedMapping: false, // deep-link (?mode=mapping): jump straight to the
                            // technical mapping editor, skipping scan + findings
    manualMode: false,      // ?mode=manual: run the scan, then land directly in
                            // the mapping editor (skip the AI findings cards)
  };

  // ── DOM helpers ───────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  // Shared HTML escaper (defined in escapeHtml.js, loaded before this script).
  const escapeHtml = window.escapeHtml;

  function show(step) {
    state.step = step;
    for (const s of STEPS) {
      const panel = document.querySelector(`#step-${s}`);
      if (panel) panel.classList.toggle("hidden", s !== step);
    }
    renderChrome(step);
  }

  // ── Page chrome (header + progress strip + command bar) ───────
  // Rebuilt per step. Buttons are wired here (not in init) because the header
  // and command bar markup is re-rendered as the wizard advances.

  const PROGRESS = [
    { label: "Scanning", num: "01" },
    { label: "AI findings", num: "02" },
    { label: "Confirm", num: "03" },
    { label: "Save", num: "04" },
  ];

  function renderProgress(cur) {
    return PROGRESS.map((s, i) => {
      const cls = i < cur ? "is-done" : i === cur ? "is-active" : "";
      const marker = i < cur ? "✓" : i === cur ? "now" : "";
      return `
        <div class="d2-progress-step ${cls}">
          <div class="d2-progress-bar"><div class="d2-progress-bar-fill"></div></div>
          <div class="d2-progress-label">
            <span><span class="d2-progress-label-num">${s.num}</span> · ${s.label}</span>
            <span>${marker}</span>
          </div>
        </div>`;
    }).join("");
  }

  function headerAction(id, label, accent) {
    return `<button type="button" class="d2-headeraction${accent ? " d2-headeraction--accent" : ""}" id="${id}">${label}</button>`;
  }

  function cmdbar(scope, cta) {
    const ctaHtml = cta
      ? `<button type="button" class="d2-cmdbar-action${cta.accent ? " d2-cmdbar-action--accent" : ""}" id="${cta.id}"${cta.disabled ? " disabled" : ""}>${cta.label}</button>`
      : "";
    // The wizard is linear — there's no list to navigate or filter — so the
    // only real shortcut is ↵ to advance. Only advertise it when the step has
    // an enabled CTA (handled live by the keydown listener in init()).
    const hint = cta && !cta.disabled
      ? `<span class="d2-cmdbar-cell"><span class="d2-cmdbar-kbd">↵</span>continue</span>`
      : "";
    return `
      <div class="d2-cmdbar-l">
        <span class="d2-cmdbar-status"><span class="d2-cmdbar-status-dot"></span>synced · ${new Date().toLocaleTimeString([], { hour12: false })}</span>
        <span class="d2-cmdbar-sep">·</span>
        <span id="setupCmdScope">${scope}</span>
      </div>
      <div class="d2-cmdbar-r">
        ${hint}
        ${ctaHtml}
      </div>`;
  }

  function renderChrome(step) {
    const header = $("setupHeader");
    const progress = $("setupProgress");
    const bar = $("setupCmdbar");
    const res = state.resourceName || "resource";
    const curIdx = STEPS.indexOf(step);
    progress.innerHTML = renderProgress(curIdx);
    // The deep-link mapping editor skips the scan/findings steps, so the
    // 4-step strip would misrepresent progress — hide it.
    progress.style.display = state.advancedMapping ? "none" : "";

    if (step === "scanning") {
      header.classList.remove("hidden");
      header.innerHTML = `
        <div class="d2-pageheader-l">
          <div class="d2-breadcrumb">
            <span>vikl.fr</span><span class="d2-breadcrumb-sep">/</span>
            <span>services</span><span class="d2-breadcrumb-sep">/</span>
            <span class="d2-breadcrumb-here">${escapeHtml(res)}</span><span class="d2-breadcrumb-sep">/</span>
            <span class="d2-breadcrumb-here">setup</span>
          </div>
          <h1 class="d2-h1">Scanning telemetry</h1>
          <p class="d2-sub">Reading custom dimensions, counting event types, mapping identity. The schema fills in as we go — Keren will then ask the model what dashboards your tenant can credibly render.</p>
        </div>
        <div class="d2-pageheader-r">
          ${headerAction("scanningRescan", "Re-scan", false)}
          ${headerActionDisabled("scanningContinue", "Continue →", true, !state.scanComplete)}
        </div>`;
      $("scanningRescan").addEventListener("click", () => startStep1());
      $("scanningContinue").addEventListener("click", () => {
        if (!state.scanComplete) return;
        if (state.manualMode) gotoValidate(); else show("findings");
      });
      bar.innerHTML = cmdbar(
        `setup · scanning · ${String(state.scanStepIdx + 1).padStart(2, "0")} / 05`,
        {
          id: "cmdContinue",
          label: state.manualMode ? "Continue → mapping" : "Continue → findings",
          accent: true,
          disabled: !state.scanComplete,
        }
      );
      $("cmdContinue")?.addEventListener("click", () => {
        if (!state.scanComplete) return;
        if (state.manualMode) gotoValidate(); else show("findings");
      });
      return;
    }

    if (step === "findings") {
      const c = computeFindingCounts();
      const proceedLabel = "Build my dashboard →";
      // Low-confidence fields no longer force a confirm step. We surface
      // them inline so nothing is hidden, and point at the always-available
      // "Edit mapping" action (and the dashboard's Mapping link) for refining.
      const lowConf = lowConfidenceFields();
      const lowConfNote = lowConf.length > 0
        ? ` We weren't fully sure about ${lowConf.map(humanizeField).join(", ")} — refine ${lowConf.length === 1 ? "it" : "them"} anytime from the dashboard.`
        : "";
      header.classList.remove("hidden");
      header.innerHTML = `
        <div class="d2-pageheader-l">
          <div class="d2-breadcrumb">
            <span>vikl.fr</span><span class="d2-breadcrumb-sep">/</span>
            <span>${escapeHtml(res)}</span><span class="d2-breadcrumb-sep">/</span>
            <span class="d2-breadcrumb-here">findings</span>
            <span class="d2-breadcrumb-tag d2-breadcrumb-tag--ai">AI · ${escapeHtml(c.modelTag)}</span>
          </div>
          <h1 class="d2-h1">What we can render</h1>
          <p class="d2-sub">${c.ready} of ${c.total} dashboards can render now.${c.needs > 0 ? ` ${c.needs} need extra instrumentation to be useful — we've drafted the prompts so you can ship them in minutes.` : ""}${lowConfNote}</p>
        </div>
        <div class="d2-pageheader-r">
          ${headerAction("findingsBack", "← Re-scan", false)}
          ${headerAction("findingsAdvanced", "Edit mapping", false)}
          ${headerAction("findingsContinue", proceedLabel, true)}
        </div>`;
      $("findingsBack").addEventListener("click", () => startStep1());
      $("findingsAdvanced").addEventListener("click", () => gotoValidate());
      $("findingsContinue").addEventListener("click", () => proceedFromFindings());
      bar.innerHTML = cmdbar("setup · findings · 02 / 04",
        { id: "cmdReview", label: proceedLabel, accent: true });
      $("cmdReview").addEventListener("click", () => proceedFromFindings());
      return;
    }

    // validate + complete keep the legacy panel headings; the d2 page header is
    // hidden so the heading isn't duplicated.
    header.classList.add("hidden");
    header.innerHTML = "";
    if (step === "validate") {
      bar.innerHTML = cmdbar("setup · validate · 03 / 04",
        { id: "cmdSave", label: "Save mapping →", accent: true });
      $("cmdSave").addEventListener("click", () => {
        const overrides = Object.keys(state.overrides).length > 0;
        submitValidation(overrides ? "override" : "accept_all");
      });
    } else {
      bar.innerHTML = cmdbar("setup · save · done", null);
    }
  }

  function headerActionDisabled(id, label, accent, disabled) {
    return `<button type="button" class="d2-headeraction${accent ? " d2-headeraction--accent" : ""}" id="${id}"${disabled ? " disabled" : ""}>${label}</button>`;
  }

  const CANONICAL_FIELDS = [
    "canonicalUserId", "canonicalSessionId", "canonicalPagePath", "canonicalReferrer",
    "canonicalBrowser", "canonicalOs", "canonicalDevice",
  ];

  // Editor grouping. "Identity & navigation" fields drive identity/traffic
  // queries; "Device & browser" fields drive the tech breakdown panels. Both
  // are genuine column mappings — distinct from instrumentation signals
  // (geo, browserTimings, dependencies, exceptions) which a mapping can't fix
  // and which surface on the findings step with a code prompt instead.
  const FIELD_GROUPS = [
    { title: "Identity & navigation", fields: ["canonicalUserId", "canonicalSessionId", "canonicalPagePath", "canonicalReferrer"] },
    { title: "Device & browser", fields: ["canonicalBrowser", "canonicalOs", "canonicalDevice"] },
  ];

  // Canonical fields the AI flagged as low-confidence in the current findings.
  function lowConfidenceFields() {
    const effective = Array.isArray(state.findings?.effectiveMapping)
      ? state.findings.effectiveMapping
      : [];
    return effective
      .filter((r) => CANONICAL_FIELDS.includes(r.canonical) && r.confidence === "low")
      .map((r) => r.canonical);
  }

  // Human-readable label per canonical field, for the low-confidence note.
  const FIELD_LABELS = {
    canonicalUserId: "user identity",
    canonicalSessionId: "sessions",
    canonicalPagePath: "page paths",
    canonicalReferrer: "referrers",
    canonicalBrowser: "browser",
    canonicalOs: "operating system",
    canonicalDevice: "device type",
  };
  function humanizeField(field) {
    return FIELD_LABELS[field] || field;
  }

  // Findings CTA always builds the dashboard — even when a field is
  // low-confidence. The validation/edit screen is no longer a forced step:
  // it's reachable on demand via the "Edit mapping" action here and the
  // dashboard's "Mapping" link (/setup?mode=mapping). This keeps the happy
  // path at a single click; nothing the AI guessed is hidden, since the
  // findings copy flags any uncertain field inline.
  function proceedFromFindings() {
    submitValidation("accept_all");
  }

  function gotoValidate() {
    renderValidate();
    if (state.advancedMapping) {
      const heading = document.querySelector("#step-validate .setup-h2");
      const sub = document.querySelector("#step-validate .setup-subtitle");
      if (heading) heading.textContent = "Edit field mapping";
      if (sub) {
        sub.textContent =
          "Override how each canonical field maps to your telemetry, then save. " +
          "Your dashboard re-renders with the new mapping.";
      }
    }
    show("validate");
  }

  // Deep-link entry (?mode=mapping): edit an already-configured resource's
  // mapping without re-running the scan. Falls back to a full scan if the
  // resource has no findings yet.
  async function startMappingEditor() {
    try {
      await loadFindings();
    } catch {
      state.advancedMapping = false;
      startStep1();
      return;
    }
    gotoValidate();
  }

  // ── SSE reveal queue ──────────────────────────────────────────
  // The scan yields step events in bursts; this staggers their reveal so the
  // tree still reads as sequential progress.
  let revealQueue = [];
  let revealing = false;

  function resetRevealQueue() {
    revealQueue = [];
    revealing = false;
  }
  function enqueueReveal(fn) {
    revealQueue.push(fn);
    if (!revealing) drainRevealQueue();
  }
  function drainRevealQueue() {
    const next = revealQueue.shift();
    if (!next) { revealing = false; return; }
    revealing = true;
    next();
    setTimeout(drainRevealQueue, 320);
  }

  // ── Scanning tree ─────────────────────────────────────────────
  function initScanningTree() {
    const body = $("scanningLog");
    body.innerHTML = "";
    SCANNING_STEPS.forEach((step, i) => {
      const glyph = i === 0 ? "┌" : i === SCANNING_STEPS.length - 1 ? "└" : "├";
      const row = document.createElement("div");
      row.className = "d2-scan-tree-row";
      row.dataset.step = step.key;
      row.innerHTML = `
        <span class="d2-scan-tree-glyph">${glyph}</span>
        <span class="d2-scan-tree-text d2-scan-tree-text-mute">${SCAN_TREE_LABELS[step.key]}</span>
        <span class="d2-scan-tree-count">queued</span>
      `;
      body.appendChild(row);
    });
    if ($("scanTreeTitle")) {
      $("scanTreeTitle").textContent = `scan.tree · ${state.resourceName || "telemetry"}`;
    }
  }

  function treeRow(stepKey) {
    return $("scanningLog").querySelector(`.d2-scan-tree-row[data-step="${stepKey}"]`);
  }

  function treeCount(key, p) {
    if (key === "connect") return "✓ linked";
    if (key === "customDimensions") return `✓ ${p.keyCount || 0} fields`;
    if (key === "eventVolumes") return `✓ ${p.totalEvents || 0} events`;
    if (key === "identity") return `✓ ${p.resolved || 0}/${p.total || 4}`;
    if (key === "ai") return p.disabled ? "✓ AI off" : (p.degraded ? "✓ heuristic" : `✓ ${p.ready || 0} ready`);
    return "✓";
  }

  // Padded child rows for the data-rich stages (custom dimensions sample keys).
  function insertSubRows(row, key, p) {
    if (key !== "customDimensions") return;
    const keys = (p.sampleKeys || []).slice(0, 3);
    if (keys.length === 0) return;
    const extra = (p.keyCount || 0) - keys.length;
    const frag = document.createDocumentFragment();
    const lines = keys.map((k) => ({ glyph: "├─", text: k, count: "✓" }));
    if (extra > 0) lines.push({ glyph: "└─", text: `+ ${extra} more dimensions`, count: "··" });
    else if (lines.length) lines[lines.length - 1].glyph = "└─";
    for (const ln of lines) {
      const el = document.createElement("div");
      el.className = "d2-scan-tree-row d2-scan-tree-pad";
      el.innerHTML = `
        <span class="d2-scan-tree-glyph">${ln.glyph}</span>
        <span class="d2-scan-tree-text d2-scan-tree-text-mute">${escapeHtml(ln.text)}</span>
        <span class="d2-scan-tree-count${ln.count === "✓" ? " is-ok" : ""}">${ln.count}</span>
      `;
      frag.appendChild(el);
    }
    row.after(frag);
  }

  function updateScanStats(key, p) {
    if (key === "customDimensions") {
      if (p.keyCount != null) $("scanStatDims").textContent = p.keyCount;
      if (p.tableCount != null) $("scanStatTables").textContent = p.tableCount;
    }
    if (key === "eventVolumes") {
      if (p.totalEvents != null) $("scanStatEvents").textContent = p.totalEvents;
      if (p.tableCount != null) $("scanStatTables").textContent = p.tableCount;
    }
  }

  // Reflect the active pipeline stage in the left "live now" card + cmdbar.
  function updateLiveCard(activeIdx) {
    const step = SCANNING_STEPS[activeIdx];
    if (!step) return;
    state.scanStepIdx = activeIdx;
    $("scanNowTag").textContent = `LIVE · STEP ${String(activeIdx + 1).padStart(2, "0")} OF 05`;
    $("scanningHeading").textContent = SCAN_TITLES[step.key] || step.label;
    $("scanningNarration").textContent = SCAN_DETAILS[step.key] || step.label;
    const scope = $("setupCmdScope");
    if (scope) scope.textContent = `setup · scanning · ${String(activeIdx + 1).padStart(2, "0")} / 05`;
  }

  // Mark a stage done, advance the active row, and update the live card.
  function applyStepEvent(stepKey, payload) {
    const p = payload || {};
    const row = treeRow(stepKey);
    if (!row) return;
    const idx = SCANNING_STEPS.findIndex((s) => s.key === stepKey);

    row.classList.remove("is-active");
    row.querySelector(".d2-scan-tree-text").classList.remove("d2-scan-tree-text-mute");
    const countEl = row.querySelector(".d2-scan-tree-count");
    countEl.className = "d2-scan-tree-count is-ok";
    countEl.textContent = treeCount(stepKey, p);
    insertSubRows(row, stepKey, p);
    updateScanStats(stepKey, p);

    if (stepKey === "connect" && p.resourceName && p.resourceName !== state.resourceName) {
      state.resourceName = p.resourceName;
      if ($("scanTreeTitle")) $("scanTreeTitle").textContent = `scan.tree · ${p.resourceName}`;
      if (state.step === "scanning") renderChrome("scanning");
    }

    const next = SCANNING_STEPS[idx + 1];
    if (next) {
      const nextRow = treeRow(next.key);
      if (nextRow) {
        nextRow.classList.add("is-active");
        nextRow.querySelector(".d2-scan-tree-text").classList.remove("d2-scan-tree-text-mute");
        const nc = nextRow.querySelector(".d2-scan-tree-count");
        nc.className = "d2-scan-tree-count is-active";
        nc.textContent = "running";
      }
      updateLiveCard(idx + 1);
    }
  }

  // ── API ───────────────────────────────────────────────────────
  async function api(method, url, body) {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (method !== "GET" && method !== "HEAD" && state.csrfToken) {
      opts.headers["X-CSRF-Token"] = state.csrfToken;
    }
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, { credentials: "same-origin", ...opts });
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

  // ── Step 1 — Scanning ─────────────────────────────────────────
  function showScanningView() {
    $("scanningPanel").classList.remove("hidden");
  }

  async function startStep1() {
    state.scanComplete = false;
    state.scanStepIdx = 0;
    show("scanning");
    showScanningView();

    let discovery;
    try {
      discovery = await api("GET", "/azure/discover");
    } catch (err) {
      // 401 falls through to runScan, which handles the auth redirect.
      await runScan({ skipApiCall: true, prefetchError: err });
      return;
    }

    const resources = discovery.resources || [];
    if (resources.length === 0) {
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

    const selName =
      discovery.selectedResource?.appInsightsName ||
      discovery.selectedResource ||
      (resources.length === 1 ? resources[0].appInsightsName : null);
    if (selName) {
      state.resourceName = typeof selName === "string" ? selName : selName.appInsightsName;
      if (state.step === "scanning") renderChrome("scanning");
    }

    if (discovery.selectedResource || discovery.autoSelected || resources.length === 1) {
      // A resource is already selected. Scan it.
      await runScan();
      return;
    }

    // Several resources, none selected — the /services hub is the picker.
    window.location.href = "/services";
  }

  let activeEventSource = null;

  // Drives step 1 over /api/setup/scan/stream. Each SSE "step" event advances
  // the schema tree; "done" loads the findings and enables Continue.
  function runScan(opts = {}) {
    const narrationEl = $("scanningNarration");
    const headingEl = $("scanningHeading");
    const errorEl = $("scanningError");

    // Reset scanning view for a fresh run (including Re-scan from findings).
    if (activeEventSource) { activeEventSource.close(); activeEventSource = null; }
    resetRevealQueue();
    state.scanComplete = false;
    state.scanStepIdx = 0;
    errorEl.classList.add("hidden");
    errorEl.innerHTML = "";
    initScanningTree();
    if ($("scanTreeStream")) $("scanTreeStream").style.display = "";

    // Light up the first step; the rest advance as SSE events arrive.
    const firstRow = treeRow(SCANNING_STEPS[0].key);
    if (firstRow) {
      firstRow.classList.add("is-active");
      firstRow.querySelector(".d2-scan-tree-text").classList.remove("d2-scan-tree-text-mute");
      const fc = firstRow.querySelector(".d2-scan-tree-count");
      fc.className = "d2-scan-tree-count is-active";
      fc.textContent = "running";
    }
    updateLiveCard(0);
    if (state.step === "scanning") renderChrome("scanning");

    const handleFailure = (err) => {
      resetRevealQueue();
      narrationEl.textContent = "Scan failed.";
      headingEl.textContent = "Scan failed.";
      if ($("scanTreeStream")) $("scanTreeStream").style.display = "none";
      errorEl.innerHTML = "";
      const msgEl = document.createElement("p");
      msgEl.className = "setup-error-message";
      const actionsEl = document.createElement("div");
      actionsEl.className = "setup-error-actions";

      if (err.status === 401) {
        msgEl.textContent = "You're not signed in. Redirecting…";
        setTimeout(() => { window.location.href = "/"; }, 1200);
      } else if (
        err.status === 409 &&
        (err.payload?.error === "RESOURCE_SELECTION_REQUIRED" ||
          err.payload?.error === "RESOURCE_NOT_SELECTED")
      ) {
        msgEl.textContent = "Choose a resource first. Redirecting…";
        setTimeout(() => { window.location.href = "/services"; }, 800);
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
      handleFailure(opts.prefetchError || new Error("Scan unavailable"));
      return;
    }

    // Stay on the scanning panel so the user can inspect the tree. They click
    // "Continue" (header or command bar) to advance.
    const finishScan = () => {
      headingEl.textContent = "Scan complete";
      narrationEl.textContent = state.manualMode
        ? "Schema mapped — opening the mapping editor…"
        : "Schema mapped — opening the AI findings…";
      $("scanNowTag").textContent = "DONE · 05 OF 05";
      if ($("scanTreeStream")) $("scanTreeStream").style.display = "none";
      state.scanComplete = true;
      if (state.step === "scanning") renderChrome("scanning");
      // Auto-advance once the scan is done. A short beat lets the completed
      // tree register, then we move on. Manual mode lands in the mapping
      // editor; the default flow lands on the AI findings cards. The header /
      // command-bar Continue buttons stay wired as a fallback.
      if (state.manualMode) {
        setTimeout(() => { if (state.scanComplete) gotoValidate(); }, 800);
      } else if (!state.advancedMapping) {
        setTimeout(() => {
          if (state.step === "scanning" && state.scanComplete) show("findings");
        }, 1000);
      }
    };

    let settled = false;
    // EventSource can't send an X-CSRF-Token header, so pass the token as a
    // query param — it's unreadable to a cross-origin page (same-origin policy),
    // which is what the CSRF check on the server relies on.
    const streamUrl = state.csrfToken
      ? `/api/setup/scan/stream?csrf=${encodeURIComponent(state.csrfToken)}`
      : "/api/setup/scan/stream";
    const es = new EventSource(streamUrl);
    activeEventSource = es;

    es.addEventListener("step", (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      enqueueReveal(() => applyStepEvent(msg.step, msg.payload));
    });

    es.addEventListener("done", async () => {
      settled = true;
      es.close();
      if (activeEventSource === es) activeEventSource = null;
      try {
        await loadFindings();
      } catch (err) {
        handleFailure(err);
        return;
      }
      // Queued so the finish lands after the last step's reveal.
      enqueueReveal(finishScan);
    });

    es.addEventListener("fail", (e) => {
      settled = true;
      es.close();
      if (activeEventSource === es) activeEventSource = null;
      let msg = {};
      try { msg = JSON.parse(e.data); } catch { /* keep {} */ }
      const err = new Error(msg.message || msg.error || "Scan failed.");
      if (msg.error === "NO_ACCESS") err.status = 403;
      else if (msg.error === "RESOURCE_SELECTION_REQUIRED") err.status = 409;
      else err.status = 500;
      err.payload = msg;
      handleFailure(err);
    });

    es.onerror = () => {
      if (settled) return; // expected close right after done/fail
      settled = true;
      es.close();
      if (activeEventSource === es) activeEventSource = null;
      handleFailure(new Error(
        "Lost the connection to the scan. Your session may have expired — retry, or sign in again.",
      ));
    };
  }

  // ── Step 2 — Findings ─────────────────────────────────────────
  async function loadFindings() {
    state.findings = await api("GET", "/api/setup/findings");
    if (state.findings?.selectedResource) {
      state.resourceName =
        state.findings.selectedResource.appInsightsName ||
        state.findings.selectedResource.name ||
        state.resourceName;
    }
    renderFindings();
  }

  // Dashboard panels the AI is told to score in promptBuilder.js. Order here
  // drives the visual grid order on step 2; labels stay short to fit a card.
  const DASHBOARD_PANELS = [
    { id: "traffic",     label: "Traffic trends",      hint: "Visits over time, hourly peaks." },
    { id: "users",       label: "Users & cohorts",     hint: "Unique users, cohorts, retention." },
    { id: "sessions",    label: "Session insights",    hint: "Length, engagement, return rate." },
    { id: "pages",       label: "Top pages",           hint: "Most-viewed paths, content performance." },
    { id: "geo",         label: "Geography",           hint: "Country, city, language splits." },
    { id: "devices",     label: "Devices & tech",      hint: "Browser, OS, device class." },
    { id: "performance", label: "Performance",         hint: "Slow endpoints, request duration." },
    { id: "campaigns",   label: "Campaigns & sources", hint: "UTM tracking, referrer attribution." },
  ];

  // Best-effort "blocked on <field>" hint for panels the AI tells us to hide.
  // The actionable, data-true guidance is the improve list below.
  const PANEL_BLOCKERS = {
    users: "canonicalUserId",
    sessions: "canonicalSessionId",
    campaigns: "utm_source",
    geo: "client_CountryOrRegion",
    devices: "client_Browser",
  };

  // Mirror of src/core/readinessScore.js (kept in sync) so the gauge can be
  // computed client-side from the readinessReport already in the findings
  // payload, without an extra endpoint.
  const SIGNAL_WEIGHTS = {
    pageViews: 20, requests: 15, sessionId: 15, userId: 15,
    userAgent: 10, geo: 10, browserTimings: 15,
  };
  function readinessPercentage(report) {
    if (!report) return 0;
    const signals = report.availableSignals || {};
    const degraded = Boolean(signals.userIdDegraded);
    let score = 0;
    for (const [key, points] of Object.entries(SIGNAL_WEIGHTS)) {
      if (key === "userId" && degraded) continue;
      if (signals[key]) score += points;
    }
    return Math.round(score); // maxScore == 100
  }

  // Spark shape per ready panel (line chart). Mirrors handoff-d2 sparkPath.
  const SPARK_KIND = {
    traffic: "rising", users: "mound", sessions: "flat", pages: "flat",
    geo: "mound", devices: "rising", performance: "spiky", campaigns: "rising",
  };
  function sparkPath(kind, w = 200, h = 40) {
    const pts = {
      rising: [4, 8, 7, 10, 9, 14, 12, 16, 18, 22, 24],
      flat: [12, 13, 11, 12, 13, 14, 12, 13, 11, 12, 13],
      spiky: [8, 9, 14, 10, 22, 11, 24, 12, 19, 10, 9],
      mound: [4, 8, 12, 18, 22, 24, 22, 18, 12, 8, 4],
    }[kind] || [10, 10, 10, 10, 10];
    const max = Math.max(...pts), min = Math.min(...pts);
    const range = Math.max(1, max - min);
    const step = w / (pts.length - 1);
    return pts.map((v, i) => {
      const x = (i * step).toFixed(1);
      const y = (h - ((v - min) / range) * (h - 2) - 1).toFixed(1);
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    }).join(" ");
  }

  // Resolve each panel to ready / needs, using dashboard_recommendations.
  function panelVerdicts() {
    const m = state.findings?.mapping;
    const recs = m?.proposals?.dashboard_recommendations || { feature: [], hide: [] };
    const featureSet = new Set(recs.feature || []);
    const hideSet = new Set(recs.hide || []);
    return DASHBOARD_PANELS.map((panel) => {
      let state_;
      if (hideSet.has(panel.id)) state_ = "needs";
      else if (featureSet.has(panel.id)) state_ = "ready";
      else state_ = "ready"; // partial / unscored panels still render
      return { ...panel, verdict: state_ };
    });
  }

  function computeFindingCounts() {
    const verdicts = panelVerdicts();
    const ready = verdicts.filter((v) => v.verdict === "ready").length;
    const needs = verdicts.filter((v) => v.verdict === "needs").length;
    const m = state.findings?.mapping;
    const missing = m?.proposals?.missing_signals || [];
    const score = readinessPercentage(state.findings?.scan?.readinessReport);
    return {
      ready, needs, total: verdicts.length, score,
      missingCount: missing.length,
      modelTag: (m?.source || "ai").replace(/^azure-/, ""),
    };
  }

  function renderFindings() {
    const f = state.findings;
    if (!f) return;
    const counts = computeFindingCounts();
    const m = f.mapping;

    // Hero: readiness gauge + AI summary.
    const hero = $("findingsSummary");
    const summary = m?.proposals?.summary;
    const summaryHtml = summary
      ? `<div class="d2-find-summary">${escapeHtml(summary)}</div>`
      : `<div class="d2-find-summary">${m?.degraded || !m
          ? "No AI summary — the cards below reflect a deterministic heuristic. The dashboard still renders based on what we detected."
          : "Your telemetry has been scanned. The cards below show what each dashboard can render today."}</div>`;
    const sourceMeta = m
      ? `<div class="d2-find-summary-meta"><span>via ${escapeHtml(m.source || "ai")}</span><span>·</span><span>scanned ${new Date(f.scan.scannedAt).toLocaleTimeString([], { hour12: false })}</span></div>`
      : "";
    hero.classList.remove("hidden");
    hero.innerHTML = `
      <div class="d2-find-gauge">
        <div class="d2-find-gauge-tag">Readiness score</div>
        <div class="d2-find-gauge-num">${counts.score}<sup>/100</sup></div>
        <div class="d2-find-gauge-track"><div class="d2-find-gauge-fill" style="width:${counts.score}%"></div></div>
        <div class="d2-find-gauge-meta">
          <span>↑ ${100 - counts.score} to perfect</span>
          <span>· ${counts.missingCount} signal${counts.missingCount === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div>
        ${summaryHtml}
        ${sourceMeta}
      </div>
    `;

    // Section title counts.
    $("findingsCounts").textContent = `${counts.ready} ready · ${counts.needs} to instrument`;

    // Findings grid: ready cards get a sparkline, needs cards a blocked-on tag.
    const grid = $("graphsGrid");
    grid.innerHTML = "";
    for (const panel of panelVerdicts()) {
      const card = document.createElement("div");
      const ready = panel.verdict === "ready";
      card.className = `d2-find-card${ready ? "" : " d2-find-card--needs"}`;
      const pill = ready
        ? `<span class="d2-statpill d2-statpill--ready"><span class="d2-statpill-dot"></span>Ready</span>`
        : `<span class="d2-statpill d2-statpill--incomplete"><span class="d2-statpill-dot"></span>Signal needed</span>`;
      const preview = ready
        ? `<div class="d2-find-card-preview"><svg viewBox="0 0 200 40" preserveAspectRatio="none"><path d="${sparkPath(SPARK_KIND[panel.id] || "rising")}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg></div>`
        : `<div class="d2-find-card-preview"><span>blocked on</span><code>${escapeHtml(PANEL_BLOCKERS[panel.id] || "signal")}</code></div>`;
      card.innerHTML = `
        <div class="d2-find-card-head">
          <div>
            <div class="d2-find-card-name">${escapeHtml(panel.label)}</div>
            <div class="d2-find-card-desc">${escapeHtml(panel.hint)}</div>
          </div>
          ${pill}
        </div>
        ${preview}
      `;
      grid.appendChild(card);
    }

    // Stash activeSources for the validate step.
    state.activeSources = {};
    for (const row of (f.effectiveMapping || [])) {
      state.activeSources[row.canonical] = { source: row.source, expr: row.expr };
    }

    // Improve list: one row per missing signal, with the AI code prompt wired
    // into the shared split-button (promptActionButton.js).
    const ms = m?.proposals?.missing_signals || [];
    const list = $("missingSignalsList");
    const section = $("coverageSection");
    const intro = $("coverageIntro");
    list.innerHTML = "";
    if (ms.length === 0) {
      if (section) section.classList.add("hidden");
      return;
    }
    if (section) section.classList.remove("hidden");
    intro.textContent = "Two signals away from a complete picture — we've drafted the prompts you can paste into your codebase.";
    for (const s of ms) {
      const item = document.createElement("div");
      item.className = "d2-find-improve-item";
      const desc = s.why_missing || s.remediation || "";
      item.innerHTML = `
        <div class="d2-find-improve-field">
          <span class="d2-find-improve-field-tag">missing</span>
          ${escapeHtml(s.signal)}
        </div>
        <div class="d2-find-improve-desc">${escapeHtml(desc)}</div>
        <div class="d2-find-improve-cta-wrap"></div>
      `;
      const codePrompt = s.code_prompt || "";
      const ctaWrap = item.querySelector(".d2-find-improve-cta-wrap");
      if (codePrompt && typeof window.createPromptActionButton === "function") {
        ctaWrap.appendChild(window.createPromptActionButton({ prompt: codePrompt, label: "Use prompt" }));
      }
      list.appendChild(item);
    }
  }

  // ── Step 3 — Validate ────────────────────────────────────────

  // Compact number for option/inventory metadata (1234 -> "1.2k").
  function formatNum(n) {
    if (typeof n !== "number" || !isFinite(n)) return String(n ?? "");
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  // Plain-text label for a palette <option> (no HTML — it's an option).
  function optionLabel(c) {
    if (c.kind === "builtin") return `${c.label} (${c.source})`;
    const m = c.meta || {};
    const bits = [];
    if (typeof m.cardinality === "number") bits.push(`${m.cardinality} distinct`);
    if (typeof m.occurrences === "number") bits.push(`${formatNum(m.occurrences)} events`);
    const meta = bits.length ? ` · ${bits.join(" · ")}` : "";
    return `${c.recommended ? "★ " : ""}customDimensions.${c.label}${meta}`;
  }

  // Origin/confidence chip shown in the status column for a non-overridden row.
  function originBadgeHtml(origin, confidence) {
    const conf = confidence ? ` · ${escapeHtml(confidence)}` : "";
    if (origin === "ai") return `<span class="map-badge map-badge--ai">AI${conf}</span>`;
    if (origin === "deterministic") return `<span class="map-badge map-badge--heuristic">heuristic${conf}</span>`;
    return `<span class="map-badge map-badge--empty">empty</span>`;
  }

  function renderValidate() {
    const f = state.findings;
    const effective = Array.isArray(f?.effectiveMapping) ? f.effectiveMapping : [];
    const byCanonical = Object.fromEntries(effective.map((r) => [r.canonical, r]));
    const palette = (f && f.palette) || {};

    const lowConf = lowConfidenceFields();
    const warn = $("validateWarning");
    const disclosure = $("mappingDisclosure");
    if (lowConf.length > 0) {
      warn.innerHTML = `
        <strong>Heads up — low confidence on:</strong>
        ${lowConf.map((name) => `<code>${escapeHtml(name)}</code>`).join(", ")}.
        Pick the right source below before saving.
      `;
      warn.classList.remove("hidden");
      disclosure.open = true;
    } else {
      warn.classList.add("hidden");
      // Advanced editor lands here on purpose, so reveal the table; in the
      // in-flow confirm path with full confidence we keep it collapsed.
      disclosure.open = state.advancedMapping;
    }

    const tbody = $("validateBody");
    tbody.innerHTML = "";

    for (const group of FIELD_GROUPS) {
      const headerTr = document.createElement("tr");
      headerTr.className = "map-group-row";
      headerTr.innerHTML = `<td colspan="4" class="map-group-head">${escapeHtml(group.title)}</td>`;
      tbody.appendChild(headerTr);
      for (const field of group.fields) {
      const proposal = byCanonical[field];
      const ovr = state.overrides[field];
      const active = ovr || proposal || { source: "", expr: "", origin: null, confidence: "low" };
      const isOverridden = !!ovr;
      const candidates = Array.isArray(palette[field]) ? palette[field] : [];
      const custom = !!state.customEditing[field];

      // Match the active source to a known candidate; otherwise it's an AI/free
      // value surfaced as a synthetic "current" option so the select reflects it.
      const matchIdx = candidates.findIndex((c) => c.source === active.source);
      const selectValue = custom ? "__custom__" : (matchIdx >= 0 ? String(matchIdx) : "__current__");

      const options = [];
      if (matchIdx < 0 && !custom && active.source) {
        options.push(`<option value="__current__" selected>${escapeHtml(active.source)} — current</option>`);
      } else if (matchIdx < 0 && !custom) {
        options.push(`<option value="__current__" selected>(no source)</option>`);
      }
      for (let i = 0; i < candidates.length; i++) {
        const sel = selectValue === String(i) ? " selected" : "";
        options.push(`<option value="${i}"${sel}>${escapeHtml(optionLabel(candidates[i]))}</option>`);
      }
      options.push(`<option value="__custom__"${custom ? " selected" : ""}>✎ Custom KQL…</option>`);

      const status = isOverridden
        ? `<span class="map-badge map-badge--manual">manual</span>`
        : originBadgeHtml(active.origin, active.confidence);

      const tr = document.createElement("tr");
      tr.dataset.field = field;
      tr.innerHTML = `
        <td>
          <div class="map-field-name">${escapeHtml(humanizeField(field))}</div>
          <code class="map-field-code">${escapeHtml(field)}</code>
        </td>
        <td>
          <select class="setup-input map-select" data-bind="select">${options.join("")}</select>
          ${custom
            ? `<input type="text" class="setup-input map-custom-source" data-bind="source"
                 value="${escapeHtml(active.source || "")}" placeholder="customDimensions.uid" />`
            : ""}
        </td>
        <td>
          ${custom
            ? `<input type="text" class="setup-input setup-input-mono" data-bind="expr"
                 value="${escapeHtml(active.expr || "")}" placeholder='tostring(customDimensions["uid"])' />`
            : `<code class="map-expr">${escapeHtml(active.expr || "—")}</code>`}
          <div class="map-preview" data-preview></div>
        </td>
        <td class="map-status">
          ${status}
          <button class="btn btn-ghost setup-row-btn" data-action="test"${active.expr ? "" : " disabled"}>Test</button>
          ${isOverridden ? `<button class="btn btn-ghost setup-row-btn" data-action="reset">Reset</button>` : ""}
        </td>
      `;
      tbody.appendChild(tr);
      }
    }

    // Select change → pick a candidate, keep the current value, or go custom.
    tbody.querySelectorAll('select[data-bind="select"]').forEach((sel) => {
      sel.addEventListener("change", () => {
        const tr = sel.closest("tr");
        const field = tr.dataset.field;
        const candidates = Array.isArray(palette[field]) ? palette[field] : [];
        const v = sel.value;
        if (v === "__custom__") {
          const cur = state.overrides[field] || byCanonical[field] || { source: "", expr: "" };
          state.customEditing[field] = true;
          state.overrides[field] = { source: cur.source || "", expr: cur.expr || "" };
        } else if (v === "__current__") {
          delete state.customEditing[field];
          delete state.overrides[field];
        } else {
          const c = candidates[Number(v)];
          delete state.customEditing[field];
          if (c) state.overrides[field] = { source: c.source, expr: c.expr };
        }
        renderValidate();
        updateValidateButtons();
      });
    });
    tbody.querySelectorAll('button[data-action="reset"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const field = btn.closest("tr").dataset.field;
        delete state.overrides[field];
        delete state.customEditing[field];
        renderValidate();
        updateValidateButtons();
      });
    });
    tbody.querySelectorAll('input[data-bind="source"], input[data-bind="expr"]').forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.closest("tr").dataset.field;
        if (!state.overrides[field]) state.overrides[field] = { source: "", expr: "" };
        state.overrides[field][input.dataset.bind] = input.value;
        // Stale preview no longer matches the edited expression — clear it.
        const out = input.closest("tr").querySelector("[data-preview]");
        if (out) out.innerHTML = "";
        const testBtn = input.closest("tr").querySelector('button[data-action="test"]');
        if (testBtn) testBtn.disabled = !input.closest("tr").querySelector('input[data-bind="expr"]')?.value;
      });
    });
    tbody.querySelectorAll('button[data-action="test"]').forEach((btn) => {
      btn.addEventListener("click", () => runPreview(btn));
    });

    renderInventoryPanel();
    updateValidateButtons();
  }

  // Phase 4 live preview: run the active expression for one field and show the
  // non-null ratio + a few sample values inline.
  async function runPreview(btn) {
    const tr = btn.closest("tr");
    const field = tr.dataset.field;
    const byCanonical = Object.fromEntries(
      (state.findings?.effectiveMapping || []).map((r) => [r.canonical, r])
    );
    const active = state.overrides[field] || byCanonical[field] || {};
    if (!active.expr) return;
    const out = tr.querySelector("[data-preview]");
    out.innerHTML = `<span class="map-preview-loading">Testing…</span>`;
    btn.disabled = true;
    try {
      const r = await api("POST", "/api/setup/mapping-preview", { source: active.source || "", expr: active.expr });
      const pct = r.nonNullPct;
      const cls = pct >= 80 ? "ok" : pct >= 30 ? "warn" : "bad";
      const samples = (r.samples || []).map((s) => `<code>${escapeHtml(String(s))}</code>`).join(" ");
      out.innerHTML =
        `<span class="map-preview-pct map-preview-pct--${cls}">${pct}% non-null</span>` +
        ` <span class="map-preview-n">(${r.nonNull}/${r.total} on ${escapeHtml(r.table)})</span>` +
        (samples ? ` · ${samples}` : ` · <span class="map-preview-none">no sample values</span>`);
    } catch (err) {
      out.innerHTML = `<span class="map-preview-err">${escapeHtml(err.message || "Test failed")}</span>`;
    } finally {
      btn.disabled = false;
    }
  }

  // Read-only "what's in my telemetry" browser, populated from the scan the
  // findings endpoint already returned — custom dimensions + event volumes.
  function renderInventoryPanel() {
    const host = $("inventoryBody");
    if (!host) return;
    const scan = state.findings?.scan || {};
    const cds = Array.isArray(scan.customDimensions) ? scan.customDimensions : [];
    const events = Array.isArray(scan.eventNames) ? scan.eventNames : [];

    const byKey = new Map();
    for (const cd of cds) {
      if (!cd || !cd.keyName) continue;
      const e = byKey.get(cd.keyName) ||
        { keyName: cd.keyName, tables: new Set(), cardinality: null, occurrences: null, samples: [] };
      if (cd.tableName) e.tables.add(cd.tableName);
      if (typeof cd.cardinality === "number") e.cardinality = Math.max(e.cardinality ?? 0, cd.cardinality);
      if (typeof cd.occurrences === "number") e.occurrences = Math.max(e.occurrences ?? 0, cd.occurrences);
      for (const s of (cd.samples || [])) {
        if (e.samples.length < 3 && !e.samples.includes(s)) e.samples.push(s);
      }
      byKey.set(cd.keyName, e);
    }

    const cdRows = [...byKey.values()].map((e) => {
      const meta = [
        [...e.tables].map(escapeHtml).join(", "),
        e.cardinality != null ? `${e.cardinality} distinct` : "",
        e.occurrences != null ? `${formatNum(e.occurrences)} events` : "",
      ].filter(Boolean).join(" · ");
      const samples = e.samples.length
        ? `<span class="inv-samples">${e.samples.map((s) => escapeHtml(String(s))).join(" · ")}</span>` : "";
      return `<li class="inv-item"><code>${escapeHtml(e.keyName)}</code><span class="inv-meta">${meta}</span>${samples}</li>`;
    }).join("");

    const evRows = events.map((ev) =>
      `<li class="inv-item"><code>${escapeHtml(ev.name)}</code><span class="inv-meta">${formatNum(ev.count)} events</span></li>`
    ).join("");

    host.innerHTML = `
      <div class="inv-group">
        <h4>Custom dimensions (${byKey.size})</h4>
        <ul class="inv-list">${cdRows || "<li class='inv-empty'>None detected.</li>"}</ul>
      </div>
      <div class="inv-group">
        <h4>Event volumes</h4>
        <ul class="inv-list">${evRows || "<li class='inv-empty'>None.</li>"}</ul>
      </div>`;
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
      // Land straight on this resource's dashboard — no second resource
      // picker, no detour through the hub.
      const resName =
        state.findings?.selectedResource?.appInsightsName ||
        state.findings?.selectedResource?.name;
      const dest = resName ? `/service/${encodeURIComponent(resName)}` : "/";
      setTimeout(() => { window.location.href = dest; }, 1200);
    } catch (err) {
      alert(`Could not save: ${err.message}`);
    }
  }

  // ── Wire up ───────────────────────────────────────────────────
  async function init() {
    // Validate-step buttons live in static markup; the rest of the chrome
    // (header + command bar) is wired per render in renderChrome().
    $("validateBack").addEventListener("click", () => {
      if (state.advancedMapping) {
        const resName =
          state.findings?.selectedResource?.appInsightsName ||
          state.findings?.selectedResource?.name;
        window.location.href = resName ? `/service/${encodeURIComponent(resName)}` : "/";
        return;
      }
      show("findings");
    });
    $("validateAcceptAll").addEventListener("click", () => submitValidation("accept_all"));
    $("validateSaveOverrides").addEventListener("click", () => submitValidation("override"));

    // ↵ advances the wizard by clicking the active step's command-bar CTA
    // (Continue / Build my dashboard / Save mapping). Disabled CTAs (the scan
    // still running) are skipped. Ignored while the user is typing or focused
    // on another control, so it never steals Enter from the mapping inputs or
    // the "Use prompt" buttons.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      const tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
          tag === "BUTTON" || tag === "A" || (t && t.isContentEditable)) return;
      const cta = document.querySelector("#setupCmdbar .d2-cmdbar-action:not([disabled])");
      if (cta) { e.preventDefault(); cta.click(); }
    });

    const themeBtn = $("themeToggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") || "light";
        const next = current === "dark" ? "light" : "dark";
        if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
        else document.documentElement.removeAttribute("data-theme");
        try { localStorage.setItem("theme", next); } catch {}
      });
    }

    try {
      const session = await api("GET", "/auth/session");
      state.csrfToken = session?.csrfToken || null;
    } catch {
      state.csrfToken = null;
    }
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "mapping") {
      state.advancedMapping = true;
      startMappingEditor();
    } else if (mode === "manual") {
      // Manual configuration: run the scan (no AI — the resource was opted out
      // when the user chose this on the hub), then land in the mapping editor.
      state.advancedMapping = true;
      state.manualMode = true;
      startStep1();
    } else {
      startStep1();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
