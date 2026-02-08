/* ========== DOM References ========== */
const connectButton = document.getElementById("connectButton");
const logoutButton = document.getElementById("logoutButton");
const modeBadge = document.getElementById("modeBadge");
const statusPanel = document.getElementById("statusPanel");
const resourcePanel = document.getElementById("resourcePanel");
const resourceList = document.getElementById("resourceList");
const dashboardPanel = document.getElementById("dashboardPanel");
const rangeSelect = document.getElementById("rangeSelect");
const selectedResourceBar = document.getElementById("selectedResourceBar");
const selectedResourceName = document.getElementById("selectedResourceName");
const changeResourceButton = document.getElementById("changeResourceButton");
const landingPage = document.getElementById("landingPage");
const previewBanner = document.getElementById("previewBanner");
const onboardingBanner = document.getElementById("onboardingBanner");

let lastDiscoveredResources = [];
let lastDashboardData = null;
let isPreviewMode = false;

/* ========== Chart instances ========== */
const charts = {};

/* ========== Chart.js global defaults ========== */
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = "#9ca3af";
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
Chart.defaults.plugins.legend.labels.padding = 16;

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#84cc16", "#6366f1",
];

/* ========== Tab Navigation ========== */
const tabs = document.querySelectorAll(".tab[data-tab]");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");

    document.querySelectorAll(".tab-content").forEach((tc) => tc.classList.remove("active"));
    const target = document.getElementById(`tab-${tab.dataset.tab}`);
    if (target) target.classList.add("active");

    // Load prompts on first visit to readiness tab
    if (tab.dataset.tab === "readiness" && lastDashboardData && !document.querySelector(".prompt-card")) {
      loadPrompts();
    }
  });
});

/* ========== Events ========== */
connectButton.addEventListener("click", () => {
  window.location.href = "/auth/login";
});

logoutButton.addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST" });
  window.location.reload();
});

rangeSelect.addEventListener("change", () => {
  if (isPreviewMode) {
    enterPreviewMode();
  } else {
    loadDashboard(rangeSelect.value);
  }
});

changeResourceButton.addEventListener("click", async () => {
  try {
    await apiFetch("/azure/select/clear", { method: "POST" });
  } catch { /* ignore */ }
  dashboardPanel.classList.add("hidden");
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

/* ========== Landing page events ========== */
document.getElementById("landingConnectBtn").addEventListener("click", () => {
  window.location.href = "/auth/login";
});

document.getElementById("landingPreviewBtn").addEventListener("click", () => {
  enterPreviewMode();
});

document.getElementById("previewConnectBtn").addEventListener("click", () => {
  window.location.href = "/auth/login";
});

document.getElementById("previewExitBtn").addEventListener("click", () => {
  exitPreviewMode();
});

document.getElementById("onboardingDismiss").addEventListener("click", () => {
  onboardingBanner.classList.add("hidden");
  try { localStorage.setItem("ea_onboarding_seen", "1"); } catch {}
});

async function enterPreviewMode() {
  isPreviewMode = true;
  landingPage.classList.add("hidden");
  connectButton.classList.add("hidden");
  previewBanner.classList.remove("hidden");
  dashboardPanel.classList.remove("hidden");
  setStatus("Loading preview dashboard...");
  try {
    const data = await apiFetch(`/preview/dashboard?range=${rangeSelect.value}`);
    renderDashboard(data);
    setStatus("Preview loaded -- sample data.", "success");
  } catch (error) {
    setStatus(error.message || "Unable to load preview.", "error");
  }
}

function exitPreviewMode() {
  isPreviewMode = false;
  previewBanner.classList.add("hidden");
  dashboardPanel.classList.add("hidden");
  landingPage.classList.remove("hidden");
  connectButton.classList.remove("hidden");
  statusPanel.textContent = "";
}

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
  statusPanel.className = `status-bar${variant !== "info" ? ` ${variant}` : ""}`;
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
    button.className = "btn btn-primary btn-sm";
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
          backgroundColor: "rgba(59, 130, 246, 0.06)",
          fill: true,
          tension: 0.35,
          pointRadius: points.length > 20 ? 0 : 3,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
        {
          label: "Page Views",
          data: points.map((p) => p.pageViews),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.04)",
          fill: true,
          tension: 0.35,
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
      cutout: "62%",
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
  const emptyEl = document.getElementById("geoEmpty");
  if (!hasData) {
    emptyEl?.classList.remove("hidden");
    return;
  }
  emptyEl?.classList.add("hidden");

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
          maxBarThickness: 28,
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
          maxBarThickness: 40,
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

/* ========== View Toggle logic ========== */
document.querySelectorAll(".view-toggle").forEach((toggle) => {
  const group = toggle.dataset.toggleGroup;
  toggle.querySelectorAll(".view-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Update buttons
      toggle.querySelectorAll(".view-toggle-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      // Update views
      const panel = toggle.closest(".panel");
      panel.querySelectorAll(".toggle-view").forEach((v) => v.classList.remove("active"));
      const viewId = btn.dataset.view;
      // Find the matching view by id convention: {group}{View}View
      const targetMap = {
        "geo-map": "geoMapView",
        "geo-chart": "geoChartView",
        "flow-sankey": "flowSankeyView",
        "flow-table": "flowTableView",
      };
      const targetId = targetMap[`${group}-${viewId}`];
      if (targetId) {
        document.getElementById(targetId)?.classList.add("active");
      }
      // Resize map if switching to map view
      if (group === "geo" && viewId === "map" && geoMapInstance) {
        setTimeout(() => geoMapInstance.invalidateSize(), 100);
      }
    });
  });
});

/* ========== Leaflet World Map ========== */
let geoMapInstance = null;
let geoMapMarkers = [];

const COUNTRY_COORDS = {
  "United States": [39.8, -98.5],
  "France": [46.6, 2.3],
  "Germany": [51.2, 10.4],
  "United Kingdom": [55.4, -3.4],
  "Canada": [56.1, -106.3],
  "Netherlands": [52.1, 5.3],
  "Japan": [36.2, 138.3],
  "Australia": [-25.3, 133.8],
  "Brazil": [-14.2, -51.9],
  "India": [20.6, 78.9],
  "China": [35.9, 104.2],
  "South Korea": [35.9, 127.8],
  "Mexico": [23.6, -102.6],
  "Spain": [40.5, -3.7],
  "Italy": [41.9, 12.6],
  "Sweden": [60.1, 18.6],
  "Switzerland": [46.8, 8.2],
  "Norway": [60.5, 8.5],
  "Poland": [51.9, 19.1],
  "Belgium": [50.5, 4.5],
  "Austria": [47.5, 14.6],
  "Ireland": [53.1, -7.7],
  "Denmark": [56.3, 9.5],
  "Finland": [61.9, 25.7],
  "Portugal": [39.4, -8.2],
  "Czech Republic": [49.8, 15.5],
  "Russia": [61.5, 105.3],
  "Turkey": [38.9, 35.2],
  "Argentina": [-38.4, -63.6],
  "Colombia": [4.6, -74.3],
  "South Africa": [-30.6, 22.9],
  "Nigeria": [9.1, 8.7],
  "Egypt": [26.8, 30.8],
  "Israel": [31.0, 34.9],
  "UAE": [23.4, 53.8],
  "Singapore": [1.4, 103.8],
  "Indonesia": [-0.8, 113.9],
  "Thailand": [15.9, 100.9],
  "Vietnam": [14.1, 108.3],
  "Philippines": [12.9, 121.8],
  "New Zealand": [-40.9, 174.9],
  "Chile": [-35.7, -71.5],
};

function renderGeoMap(data) {
  const items = data || [];
  const container = document.getElementById("geoMap");
  if (!items.length) return;

  // Destroy previous map
  if (geoMapInstance) {
    geoMapInstance.remove();
    geoMapInstance = null;
  }

  geoMapInstance = L.map(container, {
    scrollWheelZoom: false,
    zoomControl: true,
    attributionControl: true,
  }).setView([25, 10], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a>',
    maxZoom: 8,
    minZoom: 1,
  }).addTo(geoMapInstance);

  // Find max for scaling
  const maxCount = Math.max(...items.map((i) => i.count));
  geoMapMarkers = [];

  items.forEach((item) => {
    const coords = COUNTRY_COORDS[item.country];
    if (!coords) return;

    const radius = Math.max(5, Math.sqrt(item.count / maxCount) * 35);
    const pct = maxCount > 0 ? ((item.count / maxCount) * 100).toFixed(0) : 0;

    const circle = L.circleMarker(coords, {
      radius,
      fillColor: "#3b82f6",
      fillOpacity: 0.55,
      color: "#2563eb",
      weight: 1.5,
    }).addTo(geoMapInstance);

    const popupHtml = `<div class="map-popup-name">${item.country}</div><div class="map-popup-count">${fmt(item.count)} visitors (${fmtPct(item.share)})</div><div class="map-popup-bar" style="width:${pct}%"></div>`;
    circle.bindPopup(popupHtml, { className: "map-popup" });
    circle.on("mouseover", function () { this.openPopup(); });
    circle.on("mouseout", function () { this.closePopup(); });

    geoMapMarkers.push(circle);
  });

  // Fit bounds to markers
  if (geoMapMarkers.length > 0) {
    const group = L.featureGroup(geoMapMarkers);
    geoMapInstance.fitBounds(group.getBounds().pad(0.3));
  }
}

/* ========== Render: Referrer sources ========== */
function renderReferrerChart(data) {
  const items = data || [];
  const hasData = items.length > 0;
  showOrHide("referrerChart", "referrerEmpty", hasData);
  if (!hasData) return;

  destroyChart("referrer");
  const ctx = document.getElementById("referrerChart").getContext("2d");
  const sourceColors = {
    "Direct": "#3b82f6",
    "Organic Search": "#10b981",
    "Referral": "#f59e0b",
    "Social": "#8b5cf6",
    "Email": "#06b6d4",
  };
  charts.referrer = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: items.map((i) => i.source),
      datasets: [{
        data: items.map((i) => i.count),
        backgroundColor: items.map((i) => sourceColors[i.source] || CHART_COLORS[0]),
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "right", labels: { font: { size: 11 }, padding: 8 } },
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

/* ========== Render: Conversion Funnel ========== */
function renderFunnel(navPaths, topPages) {
  const container = document.getElementById("funnelContainer");
  const emptyEl = document.getElementById("funnelEmpty");
  container.innerHTML = "";

  if (!navPaths || navPaths.length === 0 || !topPages || topPages.length === 0) {
    container.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }
  container.classList.remove("hidden");
  emptyEl?.classList.add("hidden");

  // Build funnel from top pages + navigation drop-offs
  // Use: homepage views -> pricing views -> signup views
  const pageMap = {};
  topPages.forEach((p) => { pageMap[p.path] = p.views; });

  const funnelSteps = [
    { label: "Homepage", path: "/", count: pageMap["/"] || 0 },
    { label: "Pricing", path: "/pricing", count: pageMap["/pricing"] || 0 },
    { label: "Signup", path: "/signup", count: pageMap["/signup"] || 0 },
  ].filter((s) => s.count > 0);

  if (funnelSteps.length < 2) {
    container.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }

  const maxCount = funnelSteps[0].count;
  const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

  funnelSteps.forEach((step, i) => {
    const widthPct = Math.max(15, (step.count / maxCount) * 100);

    // Step bar
    const stepEl = document.createElement("div");
    stepEl.className = "funnel-step";

    const barWrapper = document.createElement("div");
    barWrapper.className = "funnel-bar-wrapper";

    const bar = document.createElement("div");
    bar.className = "funnel-bar";
    bar.style.width = widthPct + "%";
    bar.style.background = colors[i % colors.length];

    const labelSpan = document.createElement("span");
    labelSpan.className = "funnel-bar-label";
    labelSpan.textContent = step.label;
    bar.appendChild(labelSpan);

    const countSpan = document.createElement("span");
    countSpan.className = "funnel-bar-count";
    countSpan.textContent = fmt(step.count);
    bar.appendChild(countSpan);

    barWrapper.appendChild(bar);
    stepEl.appendChild(barWrapper);

    const meta = document.createElement("span");
    meta.className = "funnel-meta";
    meta.textContent = ((step.count / maxCount) * 100).toFixed(0) + "%";
    stepEl.appendChild(meta);

    container.appendChild(stepEl);

    // Drop-off indicator between steps
    if (i < funnelSteps.length - 1) {
      const next = funnelSteps[i + 1];
      const dropPct = ((1 - next.count / step.count) * 100).toFixed(1);
      const dropEl = document.createElement("div");
      dropEl.className = "funnel-drop";
      dropEl.innerHTML = `<span class="funnel-drop-arrow">\u25BC</span> <span class="funnel-drop-pct">-${dropPct}%</span> drop-off`;
      container.appendChild(dropEl);
    }
  });
}

/* ========== Render: Sankey User Flow ========== */
const SANKEY_GROUP_COLORS = {
  funnel: "#f97316",
  info: "#3b82f6",
  other: "#94a3b8",
  exit: "#fbbf80",
};
const SANKEY_LINK_COLOR = "rgba(148,163,184,0.25)";
const SANKEY_LINK_HOVER = "rgba(148,163,184,0.45)";

function renderSankeyFlow(flowData) {
  const container = document.getElementById("flowDiagram");
  const emptyEl = document.getElementById("flowEmpty");
  const countEl = document.getElementById("flowCount");
  container.innerHTML = "";

  if (!flowData || !flowData.nodes || flowData.nodes.length === 0) {
    container.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }
  container.classList.remove("hidden");
  emptyEl?.classList.add("hidden");
  if (countEl) countEl.textContent = `${flowData.links.length} flows`;

  // Layout constants
  const W = container.clientWidth || 900;
  const nodeWidth = 18;
  const nodePadding = 6;
  const stepCount = Math.max(...flowData.nodes.map((n) => n.step)) + 1;
  const stepSpacing = (W - nodeWidth) / (stepCount - 1 || 1);
  const groupOrder = ["funnel", "info", "other", "exit"];

  // Build node map
  const nodeMap = new Map();
  flowData.nodes.forEach((n) => nodeMap.set(n.id, { ...n, y: 0, h: 0, sourceLinks: [], targetLinks: [] }));
  flowData.links.forEach((l) => {
    const sn = nodeMap.get(l.source);
    const tn = nodeMap.get(l.target);
    if (sn) sn.sourceLinks.push(l);
    if (tn) tn.targetLinks.push(l);
  });

  // Layout: group nodes by step, sort by group order, compute y positions
  const steps = [];
  for (let s = 0; s < stepCount; s++) {
    const stepNodes = flowData.nodes
      .filter((n) => n.step === s)
      .map((n) => nodeMap.get(n.id))
      .sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group));
    steps.push(stepNodes);
  }

  // Compute heights proportional to value
  const maxStepValue = Math.max(...steps.map((s) => s.reduce((sum, n) => sum + n.value, 0)));
  const maxH = 300;
  const scaleFactor = maxH / (maxStepValue || 1);

  steps.forEach((stepNodes) => {
    let y = 0;
    stepNodes.forEach((node) => {
      node.h = Math.max(4, node.value * scaleFactor);
      node.y = y;
      node.x = node.step * stepSpacing;
      y += node.h + nodePadding;
    });
  });

  const totalH = Math.max(...steps.map((s) => {
    const last = s[s.length - 1];
    return last ? last.y + last.h : 0;
  })) + 20;

  // Create SVG
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${totalH}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", totalH);
  svg.style.display = "block";
  svg.style.overflow = "visible";

  // Tooltip element
  const tooltip = document.createElement("div");
  tooltip.className = "sankey-tooltip hidden";
  container.appendChild(tooltip);

  // Draw links first (behind nodes)
  const linkGroup = document.createElementNS(svgNS, "g");
  flowData.links.forEach((link) => {
    const sn = nodeMap.get(link.source);
    const tn = nodeMap.get(link.target);
    if (!sn || !tn) return;

    // Compute vertical positions within source/target nodes
    const sOutTotal = sn.sourceLinks.reduce((s, l) => s + l.value, 0);
    const tInTotal = tn.targetLinks.reduce((s, l) => s + l.value, 0);

    let sOffset = 0;
    for (const sl of sn.sourceLinks) {
      if (sl === link) break;
      sOffset += sl.value;
    }
    let tOffset = 0;
    for (const tl of tn.targetLinks) {
      if (tl === link) break;
      tOffset += tl.value;
    }

    const linkH = Math.max(1.5, (link.value / (sOutTotal || 1)) * sn.h);
    const linkHt = Math.max(1.5, (link.value / (tInTotal || 1)) * tn.h);
    const sy = sn.y + (sOffset / (sOutTotal || 1)) * sn.h;
    const ty = tn.y + (tOffset / (tInTotal || 1)) * tn.h;

    const x0 = sn.x + nodeWidth;
    const x1 = tn.x;
    const cx = (x0 + x1) / 2;

    const path = document.createElementNS(svgNS, "path");
    const d = `M${x0},${sy} C${cx},${sy} ${cx},${ty} ${x1},${ty} L${x1},${ty + linkHt} C${cx},${ty + linkHt} ${cx},${sy + linkH} ${x0},${sy + linkH} Z`;
    path.setAttribute("d", d);
    path.setAttribute("fill", SANKEY_LINK_COLOR);
    path.style.cursor = "pointer";
    path.style.transition = "fill 0.15s ease";

    path.addEventListener("mouseenter", (e) => {
      path.setAttribute("fill", SANKEY_LINK_HOVER);
      tooltip.textContent = `${sn.label} \u2192 ${tn.label}: ${fmt(link.value)}`;
      tooltip.classList.remove("hidden");
      const rect = container.getBoundingClientRect();
      tooltip.style.left = (e.clientX - rect.left + 10) + "px";
      tooltip.style.top = (e.clientY - rect.top - 28) + "px";
    });
    path.addEventListener("mousemove", (e) => {
      const rect = container.getBoundingClientRect();
      tooltip.style.left = (e.clientX - rect.left + 10) + "px";
      tooltip.style.top = (e.clientY - rect.top - 28) + "px";
    });
    path.addEventListener("mouseleave", () => {
      path.setAttribute("fill", SANKEY_LINK_COLOR);
      tooltip.classList.add("hidden");
    });

    linkGroup.appendChild(path);
  });
  svg.appendChild(linkGroup);

  // Draw nodes
  const nodeGroup = document.createElementNS(svgNS, "g");
  nodeMap.forEach((node) => {
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", node.x);
    rect.setAttribute("y", node.y);
    rect.setAttribute("width", nodeWidth);
    rect.setAttribute("height", Math.max(4, node.h));
    rect.setAttribute("rx", 3);
    rect.setAttribute("fill", SANKEY_GROUP_COLORS[node.group] || "#94a3b8");
    rect.style.cursor = "pointer";

    rect.addEventListener("mouseenter", (e) => {
      tooltip.textContent = `${node.label}: ${fmt(node.value)}`;
      tooltip.classList.remove("hidden");
      const cr = container.getBoundingClientRect();
      tooltip.style.left = (e.clientX - cr.left + 10) + "px";
      tooltip.style.top = (e.clientY - cr.top - 28) + "px";
    });
    rect.addEventListener("mouseleave", () => {
      tooltip.classList.add("hidden");
    });

    nodeGroup.appendChild(rect);

    // Label
    if (node.h > 12) {
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", node.x + nodeWidth + 4);
      text.setAttribute("y", node.y + node.h / 2 + 4);
      text.setAttribute("font-size", "11");
      text.setAttribute("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");
      text.setAttribute("fill", "#374151");
      text.textContent = node.label;
      nodeGroup.appendChild(text);
    }
  });
  svg.appendChild(nodeGroup);

  // Step labels
  const labelGroup = document.createElementNS(svgNS, "g");
  for (let s = 0; s < stepCount; s++) {
    const text = document.createElementNS(svgNS, "text");
    text.setAttribute("x", s * stepSpacing + nodeWidth / 2);
    text.setAttribute("y", totalH - 2);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "10");
    text.setAttribute("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");
    text.setAttribute("fill", "#9ca3af");
    text.textContent = s === 0 ? "Entry" : `Step ${s}`;
    labelGroup.appendChild(text);
  }
  svg.appendChild(labelGroup);

  container.appendChild(svg);

  // Legend
  const legend = document.createElement("div");
  legend.className = "sankey-legend";
  [
    { group: "funnel", label: "Funnel Pages" },
    { group: "info", label: "Informational" },
    { group: "other", label: "Other Pages" },
    { group: "exit", label: "Exit" },
  ].forEach((item) => {
    const span = document.createElement("span");
    span.className = "sankey-legend-item";
    span.innerHTML = `<span class="sankey-legend-dot" style="background:${SANKEY_GROUP_COLORS[item.group]}"></span>${item.label}`;
    legend.appendChild(span);
  });
  container.appendChild(legend);
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

/* ========== Render: Readiness Score ========== */
function renderReadinessScore(readinessScore, readiness) {
  if (!readinessScore) return;

  const { score, percentage, breakdown, grade } = readinessScore;

  // Score ring
  const circumference = 2 * Math.PI * 52; // r=52
  const offset = circumference - (percentage / 100) * circumference;
  const ring = document.getElementById("scoreRingFill");
  ring.style.strokeDashoffset = offset;
  ring.className = `score-ring-fill grade-${grade.toLowerCase()}`;

  // Score number
  document.getElementById("scoreValue").textContent = score;

  // Grade text
  const gradeTexts = {
    A: "Excellent coverage! Your telemetry is comprehensive.",
    B: "Good coverage. A few improvements will unlock more insights.",
    C: "Fair coverage. Key signals are missing — see below to improve.",
    D: "Limited coverage. Several important signals need to be added.",
    F: "Minimal coverage. Start with the required signals below.",
  };
  document.getElementById("scoreGradeText").textContent = gradeTexts[grade] || "";

  // Mini badge in tab
  const miniBadge = document.getElementById("scoreMiniBadge");
  miniBadge.textContent = `${score}`;
  miniBadge.className = `score-mini-badge grade-${grade.toLowerCase()}`;
  miniBadge.classList.remove("hidden");

  // Status badge
  if (readiness) {
    const status = readiness.overallStatus || "EMPTY";
    const statusBadge = document.getElementById("readinessStatusBadge");
    statusBadge.textContent = status;
    statusBadge.className = `readiness-badge ${status.toLowerCase()}`;

    const confidence = document.getElementById("readinessConfidence");
    confidence.textContent = `Confidence: ${(readiness.confidence * 100).toFixed(0)}%`;
  }

  // Breakdown rows
  const container = document.getElementById("scoreBreakdown");
  container.innerHTML = "";
  breakdown.forEach((item) => {
    const row = document.createElement("div");
    row.className = `score-row ${item.available ? "available" : "missing"}`;

    const check = document.createElement("span");
    check.className = `score-check ${item.available ? "available" : "missing"}`;
    check.textContent = item.available ? "\u2713" : "\u00B7";
    row.appendChild(check);

    const label = document.createElement("span");
    label.className = "score-row-label";
    label.innerHTML = `${item.label}<small>${item.description}</small>`;
    row.appendChild(label);

    const cat = document.createElement("span");
    cat.className = `score-row-category cat-${item.category}`;
    cat.textContent = item.category;
    row.appendChild(cat);

    const points = document.createElement("span");
    points.className = "score-row-points";
    points.textContent = item.available ? `+${item.points}` : `+${item.points}`;
    row.appendChild(points);

    container.appendChild(row);
  });
}

/* ========== Render: Prompt Cards ========== */
async function loadPrompts() {
  try {
    const data = await apiFetch("/prompts");
    const container = document.getElementById("promptCards");
    const noMessage = document.getElementById("noPromptsMessage");
    container.innerHTML = "";

    if (!data.prompts || data.prompts.length === 0) {
      noMessage?.classList.remove("hidden");
      return;
    }
    noMessage?.classList.add("hidden");

    data.prompts.forEach((p) => {
      const card = document.createElement("div");
      card.className = "prompt-card";

      const header = document.createElement("div");
      header.className = "prompt-card-header";
      header.addEventListener("click", () => card.classList.toggle("open"));

      const title = document.createElement("span");
      title.className = "prompt-card-title";
      title.textContent = p.label;

      const stack = document.createElement("span");
      stack.className = "prompt-card-stack";
      stack.textContent = p.detectedStack;
      title.appendChild(stack);

      const arrow = document.createElement("span");
      arrow.className = "prompt-card-arrow";
      arrow.textContent = "\u25BC";

      header.appendChild(title);
      header.appendChild(arrow);
      card.appendChild(header);

      const body = document.createElement("div");
      body.className = "prompt-card-body";

      const pre = document.createElement("div");
      pre.className = "prompt-text";
      pre.textContent = p.prompt;
      body.appendChild(pre);

      const copyBtn = document.createElement("button");
      copyBtn.className = "prompt-copy-btn";
      copyBtn.textContent = "Copy prompt";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(p.prompt);
          copyBtn.textContent = "Copied!";
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.textContent = "Copy prompt";
            copyBtn.classList.remove("copied");
          }, 2000);
        } catch {
          // Fallback for non-HTTPS
          const textarea = document.createElement("textarea");
          textarea.value = p.prompt;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
          copyBtn.textContent = "Copied!";
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.textContent = "Copy prompt";
            copyBtn.classList.remove("copied");
          }, 2000);
        }
      });
      body.appendChild(copyBtn);

      card.appendChild(body);
      container.appendChild(card);
    });
  } catch (error) {
    console.error("Failed to load prompts:", error.message);
  }
}

/* ========== Main render ========== */
function renderDashboard(data) {
  lastDashboardData = data;
  const dashboard = data.dashboard;
  const readiness = data.readiness;
  const readinessScore = data.readinessScore;

  // Marketing KPIs
  document.getElementById("kpiVisitors").textContent = fmt(dashboard.kpis.uniqueVisitors);
  document.getElementById("kpiSessions").textContent = fmt(dashboard.kpis.sessions);

  // Compute total page views from trend data
  const totalPageViews = (dashboard.charts.dailyTrend || []).reduce((sum, d) => sum + (d.pageViews || 0), 0);
  document.getElementById("kpiPageViews").textContent = fmt(totalPageViews);

  // Pages per session
  const pagesPerSession = dashboard.kpis.sessions > 0
    ? (totalPageViews / dashboard.kpis.sessions).toFixed(1)
    : "-";
  document.getElementById("kpiPagesPerSession").textContent = pagesPerSession;

  // Technical KPIs
  document.getElementById("kpiAvg").textContent = fmtMs(dashboard.kpis.avgResponseTimeMs);
  document.getElementById("kpiP95").textContent = fmtMs(dashboard.kpis.p95ResponseTimeMs);
  document.getElementById("kpiErrors").textContent = fmtPct(dashboard.kpis.errorRate);

  // Color-code error rate
  const errorCard = document.getElementById("kpiErrorCard");
  if (dashboard.kpis.errorRate > 0.05) {
    errorCard.style.borderLeft = "3px solid var(--danger)";
  } else if (dashboard.kpis.errorRate > 0.02) {
    errorCard.style.borderLeft = "3px solid var(--warning)";
  } else {
    errorCard.style.borderLeft = "3px solid var(--success)";
  }

  // Frontend avg KPI
  const btData = dashboard.charts.browserTimings;
  document.getElementById("kpiFrontendAvg").textContent = btData ? fmtMs(btData.avgTotal) : "-";

  // Daily trend
  renderDailyTrend(dashboard.charts.dailyTrend);

  // Top Pages table
  renderTableRows("topPagesBody", "topPagesEmpty", "topPagesCount", dashboard.charts.topPages, (tr, row) => {
    tr.appendChild(td(row.path));
    tr.appendChild(td(fmt(row.views), "num"));
    tr.appendChild(td(fmtPct(row.share), "num"));
  });

  // Geo distribution (map + chart)
  renderGeoChart(dashboard.charts.geoDistribution);
  renderGeoMap(dashboard.charts.geoDistribution);

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

  // Sankey User Flow + table fallback
  renderSankeyFlow(dashboard.charts.userFlow);
  renderTableRows("topNavBody", null, null, dashboard.charts.topNavigationPaths, (tr, row) => {
    tr.appendChild(td(row.from));
    tr.appendChild(td(row.to));
    tr.appendChild(td(fmt(row.count), "num"));
  });

  // Conversion Funnel
  renderFunnel(dashboard.charts.topNavigationPaths, dashboard.charts.topPages);

  // Traffic Sources
  renderReferrerChart(dashboard.charts.referrerSources);

  // Readiness score
  renderReadinessScore(readinessScore, readiness);

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
    statusPanel.className = "status-bar";
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
      // Show landing page instead of plain "Connect" button
      landingPage.classList.remove("hidden");
      statusPanel.textContent = "";

      if (session.mode === "real" && !session.oauthConfigured) {
        await showSetupInstructions();
      }
      connectButton.textContent = session.mode === "real" ? "Sign in with Microsoft" : "Connect Azure";
      // Keep navbar connect button visible too
      connectButton.classList.remove("hidden");
      return;
    }

    connectButton.classList.add("hidden");
    logoutButton.classList.remove("hidden");
    landingPage.classList.add("hidden");

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

      // Show onboarding banner on first load
      try {
        if (!localStorage.getItem("ea_onboarding_seen")) {
          onboardingBanner.classList.remove("hidden");
        }
      } catch {}
    }
  } catch (error) {
    setStatus(error.message || "Unable to initialize.", "error");
  }
}

init();
