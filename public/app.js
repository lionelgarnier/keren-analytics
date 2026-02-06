/* ========== DOM References ========== */
const connectButton = document.getElementById("connectButton");
const logoutButton = document.getElementById("logoutButton");
const modeBadge = document.getElementById("modeBadge");
const statusPanel = document.getElementById("statusPanel");
const resourcePanel = document.getElementById("resourcePanel");
const resourceList = document.getElementById("resourceList");
const dashboardPanel = document.getElementById("dashboardPanel");
const readinessPanel = document.getElementById("readinessPanel");
const rangeSelect = document.getElementById("rangeSelect");
const selectedResourceBar = document.getElementById("selectedResourceBar");
const selectedResourceName = document.getElementById("selectedResourceName");
const changeResourceButton = document.getElementById("changeResourceButton");

let lastDiscoveredResources = [];

/* ========== Chart instances (for cleanup) ========== */
const charts = {};

/* ========== Chart.js global defaults ========== */
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = "#64748b";
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
Chart.defaults.plugins.legend.labels.padding = 16;

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#84cc16", "#6366f1",
];

/* ========== Events ========== */
connectButton.addEventListener("click", () => {
  window.location.href = "/auth/login";
});

logoutButton.addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST" });
  window.location.reload();
});

rangeSelect.addEventListener("change", () => {
  loadDashboard(rangeSelect.value);
});

changeResourceButton.addEventListener("click", async () => {
  try {
    await apiFetch("/azure/select/clear", { method: "POST" });
  } catch { /* ignore */ }
  dashboardPanel.classList.add("hidden");
  readinessPanel.classList.add("hidden");
  selectedResourceBar.classList.add("hidden");
  if (lastDiscoveredResources.length > 0) {
    renderResources(lastDiscoveredResources);
  } else {
    try {
      const discovery = await apiFetch("/azure/discover");
      lastDiscoveredResources = discovery.resources || [];
      renderResources(lastDiscoveredResources);
    } catch (error) {
      setStatus(error.message || "Unable to load resources.", "error");
    }
  }
});

/* ========== API ========== */
async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const parts = [data.message || data.error || "Request failed"];
    if (data.azureError?.message) {
      parts.push(data.azureError.message);
    }
    const error = new Error(parts.join(" — "));
    error.data = data;
    throw error;
  }
  return data;
}

/* ========== Status ========== */
function setStatus(message, variant = "info") {
  statusPanel.textContent = message;
  statusPanel.className = `panel status-panel${variant !== "info" ? ` ${variant}` : ""}`;
}

/* ========== Resource selection ========== */
function showSelectedResource(name) {
  selectedResourceName.textContent = name;
  selectedResourceBar.classList.remove("hidden");
}

function renderResources(resources) {
  lastDiscoveredResources = resources;
  resourceList.innerHTML = "";
  resources.forEach((resource) => {
    const card = document.createElement("div");
    card.className = "resource-card";

    const nameEl = document.createElement("strong");
    nameEl.textContent = resource.appInsightsName;
    card.appendChild(nameEl);

    const subDiv = document.createElement("div");
    subDiv.textContent = `Subscription: ${resource.subscriptionId}`;
    card.appendChild(subDiv);

    const wsDiv = document.createElement("div");
    wsDiv.textContent = `Workspace: ${resource.workspaceId}`;
    card.appendChild(wsDiv);

    if (resource.environmentHint) {
      const envDiv = document.createElement("div");
      envDiv.textContent = `Environment: ${resource.environmentHint}`;
      card.appendChild(envDiv);
    }

    const button = document.createElement("button");
    button.className = "btn btn-primary";
    button.textContent = "Select";
    button.addEventListener("click", async () => {
      await apiFetch("/azure/select", {
        method: "POST",
        body: JSON.stringify({
          resourceId: resource.resourceId,
          workspaceId: resource.workspaceId,
          subscriptionId: resource.subscriptionId,
          resourceGroup: resource.resourceGroup,
          appInsightsName: resource.appInsightsName,
        }),
      });
      resourcePanel.classList.add("hidden");
      showSelectedResource(resource.appInsightsName);
      await loadDashboard(rangeSelect.value);
    });
    card.appendChild(button);
    resourceList.appendChild(card);
  });
  resourcePanel.classList.remove("hidden");
}

/* ========== Number formatting ========== */
function fmt(n) {
  if (n == null) return "-";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(1) + "K";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function fmtMs(n) {
  if (n == null) return "-";
  return Math.round(n).toLocaleString();
}

function fmtPct(n) {
  if (n == null) return "-";
  return (n * 100).toFixed(1) + "%";
}

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ========== Chart helpers ========== */
function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

function showOrHide(canvasId, emptyId, hasData) {
  const canvas = document.getElementById(canvasId);
  const empty = document.getElementById(emptyId);
  if (hasData) {
    canvas?.parentElement?.classList.remove("hidden");
    empty?.classList.add("hidden");
  } else {
    canvas?.parentElement?.classList.add("hidden");
    empty?.classList.remove("hidden");
  }
}

/* ========== Sortable tables ========== */
function initSortableTable(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const headers = table.querySelectorAll("th[data-sort]");
  headers.forEach((th, colIndex) => {
    th.addEventListener("click", () => {
      const tbody = table.querySelector("tbody");
      const rows = Array.from(tbody.querySelectorAll("tr"));
      const type = th.dataset.sort;
      const isDesc = th.classList.contains("sort-asc");

      // Clear other sort indicators
      headers.forEach((h) => h.classList.remove("sort-asc", "sort-desc"));
      th.classList.add(isDesc ? "sort-desc" : "sort-asc");

      rows.sort((a, b) => {
        const aVal = a.children[colIndex]?.textContent || "";
        const bVal = b.children[colIndex]?.textContent || "";
        if (type === "number") {
          const aNum = parseFloat(aVal.replace(/[,%K]/g, "")) || 0;
          const bNum = parseFloat(bVal.replace(/[,%K]/g, "")) || 0;
          return isDesc ? aNum - bNum : bNum - aNum;
        }
        return isDesc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });

      rows.forEach((row) => tbody.appendChild(row));
    });
  });
}

/* ========== Render: Daily Trend ========== */
function renderDailyTrend(data) {
  const points = data || [];
  const hasData = points.length > 1;
  showOrHide("dailyTrendChart", "dailyTrendEmpty", hasData);
  if (!hasData) return;

  destroyChart("dailyTrend");
  const ctx = document.getElementById("dailyTrendChart").getContext("2d");
  charts.dailyTrend = new Chart(ctx, {
    type: "line",
    data: {
      labels: points.map((p) => fmtDate(p.period)),
      datasets: [
        {
          label: "Visitors",
          data: points.map((p) => p.visitors),
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: points.length > 20 ? 0 : 3,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
        {
          label: "Page Views",
          data: points.map((p) => p.pageViews),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.05)",
          fill: true,
          tension: 0.3,
          pointRadius: points.length > 20 ? 0 : 3,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", align: "end" },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#f8fafc",
          bodyColor: "#e2e8f0",
          padding: 12,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkipPadding: 20 },
        },
        y: {
          beginAtZero: true,
          grid: { color: "#f1f5f9" },
          ticks: { callback: (v) => fmt(v) },
        },
      },
    },
  });
}

/* ========== Render: Doughnut charts ========== */
function renderDoughnut(canvasId, emptyId, chartKey, items, labelKey, valueKey) {
  const hasData = items && items.length > 0;
  showOrHide(canvasId, emptyId, hasData);
  if (!hasData) return;

  destroyChart(chartKey);
  const ctx = document.getElementById(canvasId).getContext("2d");
  charts[chartKey] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: items.map((i) => i[labelKey]),
      datasets: [
        {
          data: items.map((i) => i[valueKey]),
          backgroundColor: CHART_COLORS.slice(0, items.length),
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "60%",
      plugins: {
        legend: {
          position: "right",
          labels: { font: { size: 11 }, padding: 8 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${fmt(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* ========== Render: Geo distribution ========== */
function renderGeoChart(data) {
  const items = data || [];
  const hasData = items.length > 0;
  showOrHide("geoChart", "geoEmpty", hasData);
  if (!hasData) return;

  destroyChart("geo");
  const ctx = document.getElementById("geoChart").getContext("2d");
  charts.geo = new Chart(ctx, {
    type: "bar",
    data: {
      labels: items.map((i) => i.country),
      datasets: [
        {
          data: items.map((i) => i.count),
          backgroundColor: "#3b82f6",
          borderRadius: 4,
          maxBarThickness: 32,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${fmt(ctx.parsed.x)} visitors`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "#f1f5f9" },
          ticks: { callback: (v) => fmt(v) },
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 11 } },
        },
      },
    },
  });
}

/* ========== Render: Browser timings ========== */
function renderBrowserTimings(data) {
  const hasData = data && data.sampleCount > 0;
  showOrHide("browserTimingsChart", "browserTimingsEmpty", hasData);
  const kpisEl = document.getElementById("browserTimingsKpis");
  if (!hasData) {
    kpisEl?.classList.add("hidden");
    return;
  }

  kpisEl?.classList.remove("hidden");
  document.getElementById("btAvgTotal").textContent = fmtMs(data.avgTotal);
  document.getElementById("btP95Total").textContent = fmtMs(data.p95Total);
  document.getElementById("btSamples").textContent = fmt(data.sampleCount);

  destroyChart("browserTimings");
  const ctx = document.getElementById("browserTimingsChart").getContext("2d");
  charts.browserTimings = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Network", "Send", "Receive", "Processing"],
      datasets: [
        {
          label: "Avg Duration (ms)",
          data: [data.avgNetwork, data.avgSend, data.avgReceive, data.avgProcessing],
          backgroundColor: ["#3b82f6", "#06b6d4", "#10b981", "#f59e0b"],
          borderRadius: 6,
          maxBarThickness: 48,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toFixed(0)} ms`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: "#f1f5f9" },
          ticks: { callback: (v) => v + " ms" },
        },
      },
    },
  });
}

/* ========== Render: Tables ========== */
function renderTableRows(tbodyId, emptyId, countId, rows, renderFn) {
  const tbody = document.getElementById(tbodyId);
  const empty = document.getElementById(emptyId);
  const count = countId ? document.getElementById(countId) : null;

  tbody.innerHTML = "";
  if (!rows || rows.length === 0) {
    tbody.parentElement.classList.add("hidden");
    empty?.classList.remove("hidden");
    return;
  }

  tbody.parentElement.classList.remove("hidden");
  empty?.classList.add("hidden");
  if (count) count.textContent = `${rows.length} items`;

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    renderFn(tr, row);
    tbody.appendChild(tr);
  });
}

function td(text, className) {
  const el = document.createElement("td");
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

/* ========== Render: Readiness ========== */
function renderReadiness(readiness) {
  if (!readiness) return;

  const statusBadge = document.getElementById("readinessStatusBadge");
  const confidence = document.getElementById("readinessConfidence");
  const signals = document.getElementById("readinessSignals");
  const actions = document.getElementById("readinessActions");

  const status = readiness.overallStatus || "EMPTY";
  statusBadge.textContent = status;
  statusBadge.className = `readiness-badge ${status.toLowerCase()}`;
  confidence.textContent = `Confidence: ${(readiness.confidence * 100).toFixed(0)}%`;

  // Render signal tags
  signals.innerHTML = "";
  if (readiness.availableSignals) {
    const signalNames = {
      pageViews: "Page Views",
      requests: "Requests",
      userId: "User ID",
      sessionId: "Sessions",
      userAgent: "User Agent",
      geo: "Geo",
      browserTimings: "Browser Timings",
    };
    for (const [key, label] of Object.entries(signalNames)) {
      const tag = document.createElement("span");
      tag.className = `signal-tag ${readiness.availableSignals[key] ? "available" : "missing"}`;
      tag.textContent = label;
      signals.appendChild(tag);
    }
  }

  // Render actions
  actions.innerHTML = "";
  (readiness.recommendedActions || []).slice(0, 5).forEach((action) => {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = action.title;
    li.appendChild(title);
    if (action.message) {
      const msg = document.createTextNode(action.message);
      li.appendChild(msg);
    }
    actions.appendChild(li);
  });

  readinessPanel.classList.remove("hidden");
}

/* ========== Main render ========== */
function renderDashboard(data) {
  const dashboard = data.dashboard;
  const readiness = data.readiness;

  // KPIs
  document.getElementById("kpiVisitors").textContent = fmt(dashboard.kpis.uniqueVisitors);
  document.getElementById("kpiSessions").textContent = fmt(dashboard.kpis.sessions);
  document.getElementById("kpiAvg").textContent = fmtMs(dashboard.kpis.avgResponseTimeMs);
  document.getElementById("kpiP95").textContent = fmtMs(dashboard.kpis.p95ResponseTimeMs);
  document.getElementById("kpiErrors").textContent = fmtPct(dashboard.kpis.errorRate);

  // Daily trend
  renderDailyTrend(dashboard.charts.dailyTrend);

  // Top Pages table
  renderTableRows("topPagesBody", "topPagesEmpty", "topPagesCount", dashboard.charts.topPages, (tr, row) => {
    tr.appendChild(td(row.path));
    tr.appendChild(td(fmt(row.views), "num"));
    tr.appendChild(td(fmtPct(row.share), "num"));
  });

  // Geo distribution
  renderGeoChart(dashboard.charts.geoDistribution);

  // Doughnut charts
  renderDoughnut("browserChart", "browserEmpty", "browser", dashboard.charts.browsers, "name", "count");
  renderDoughnut("osChart", "osEmpty", "os", dashboard.charts.os, "name", "count");
  renderDoughnut("deviceChart", "deviceEmpty", "device", dashboard.charts.devices, "name", "count");

  // Browser timings
  renderBrowserTimings(dashboard.charts.browserTimings);

  // Slow endpoints table
  renderTableRows("slowEndpointsBody", "slowEndpointsEmpty", "slowEndpointsCount", dashboard.tables.slowEndpoints, (tr, row) => {
    tr.appendChild(td(row.path));
    tr.appendChild(td(fmtMs(row.p50), "num"));
    tr.appendChild(td(fmtMs(row.p95), "num"));
    tr.appendChild(td(fmtMs(row.p99), "num"));
    tr.appendChild(td(fmt(row.count), "num"));
    tr.appendChild(td(fmtPct(row.errorRate), "num"));
  });

  // Navigation paths table
  renderTableRows("topNavBody", "topNavEmpty", null, dashboard.charts.topNavigationPaths, (tr, row) => {
    tr.appendChild(td(row.from));
    tr.appendChild(td(row.to));
    tr.appendChild(td(fmt(row.count), "num"));
  });

  // Readiness
  renderReadiness(readiness);

  // Show dashboard
  dashboardPanel.classList.remove("hidden");
  setStatus("Dashboard loaded.", "success");
}

/* ========== Dashboard loading ========== */
async function loadDashboard(range) {
  setStatus("Loading dashboard...");
  try {
    const data = await apiFetch(`/dashboard/overview?range=${range}`);
    renderDashboard(data);
  } catch (error) {
    if (error.data && error.data.error === "RESOURCE_SELECTION_REQUIRED") {
      selectedResourceBar.classList.add("hidden");
      renderResources(error.data.resources || []);
      return;
    }
    setStatus(error.message || "Unable to load dashboard.", "error");
  }
}

/* ========== Auth error from URL ========== */
function checkAuthError() {
  const params = new URLSearchParams(window.location.search);
  const authError = params.get("auth_error");
  if (authError) {
    setStatus(`Authentication failed: ${authError}`, "error");
    // Clean URL
    window.history.replaceState({}, "", "/");
    return true;
  }
  return false;
}

/* ========== Setup instructions ========== */
async function showSetupInstructions() {
  try {
    const setup = await apiFetch("/auth/setup");
    if (setup.configured) return;
    const steps = setup.instructions || [];
    statusPanel.innerHTML = "";
    const title = document.createElement("strong");
    title.textContent = "OAuth Setup Required";
    statusPanel.appendChild(title);
    const p = document.createElement("p");
    p.textContent = "To sign in via the browser, register an Entra ID app:";
    p.style.margin = "8px 0 4px";
    statusPanel.appendChild(p);
    const ol = document.createElement("ol");
    ol.style.margin = "0";
    ol.style.paddingLeft = "20px";
    ol.style.fontSize = "13px";
    steps.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      li.style.marginBottom = "4px";
      ol.appendChild(li);
    });
    statusPanel.appendChild(ol);
    statusPanel.className = "panel status-panel";
  } catch { /* ignore */ }
}

/* ========== Init ========== */
async function init() {
  setStatus("Checking session...");

  // Init sortable tables
  initSortableTable("topPagesTable");
  initSortableTable("slowEndpointsTable");
  initSortableTable("topNavTable");

  // Check for OAuth redirect errors
  if (checkAuthError()) {
    connectButton.classList.remove("hidden");
    return;
  }

  try {
    const session = await apiFetch("/auth/session");
    modeBadge.textContent = session.mode || "mock";

    if (!session.authenticated) {
      // Real mode without OAuth configured → show setup instructions
      if (session.mode === "real" && !session.oauthConfigured) {
        await showSetupInstructions();
      } else {
        setStatus("Connect your Azure tenant to begin.");
      }
      connectButton.textContent = session.mode === "real" ? "Sign in with Microsoft" : "Connect Azure";
      connectButton.classList.remove("hidden");
      return;
    }

    connectButton.classList.add("hidden");
    logoutButton.classList.remove("hidden");

    // Show user info if available
    if (session.user?.name) {
      logoutButton.textContent = `${session.user.name} — Logout`;
    }

    const discovery = await apiFetch("/azure/discover");
    lastDiscoveredResources = discovery.resources || [];
    if (!discovery.autoSelected && discovery.resources?.length > 1) {
      renderResources(discovery.resources);
    } else {
      if (discovery.autoSelected && discovery.resources?.length === 1) {
        showSelectedResource(discovery.resources[0].appInsightsName);
      } else if (discovery.selectedResource) {
        showSelectedResource(discovery.selectedResource);
      }
      await loadDashboard(rangeSelect.value);
    }
  } catch (error) {
    setStatus(error.message || "Unable to initialize.", "error");
  }
}

init();
