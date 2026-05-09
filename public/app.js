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
const progressPanel = document.getElementById("progressPanel");
const progressLabel = document.getElementById("progressLabel");
const progressPct = document.getElementById("progressPct");
const progressBar = document.getElementById("progressBar");

let lastDiscoveredResources = [];
let lastDashboardData = null;
let isPreviewMode = false;

/* ========== Client-side router (History API) ========== */
const router = {
  /** Parse the current pathname into a structured route object */
  parse(pathname = window.location.pathname) {
    const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts[0] === "preview") return { page: "preview" };
    if (parts[0] === "services") return { page: "services" };
    if (parts[0] === "service" && parts[1]) {
      const tab = ["marketing", "technical", "readiness"].includes(parts[2]) ? parts[2] : "marketing";
      return { page: "dashboard", service: decodeURIComponent(parts[1]), tab };
    }
    return { page: "home" };
  },

  /** Build a URL path from route parameters */
  path({ page, service, tab } = {}) {
    if (page === "preview") return "/preview";
    if (page === "services") return "/services";
    if (page === "dashboard" && service) {
      const base = `/service/${encodeURIComponent(service)}`;
      return tab && tab !== "marketing" ? `${base}/${tab}` : base;
    }
    return "/";
  },

  /** Push a new route (creates a history entry) */
  push(route) {
    const url = this.path(route);
    if (url !== window.location.pathname) {
      window.history.pushState(route, "", url);
    }
  },

  /** Replace current route (no new history entry) */
  replace(route) {
    const url = this.path(route);
    window.history.replaceState(route, "", url);
  },

  /** Current route object */
  get current() {
    return this.parse();
  },
};

/* ========== Chart instances ========== */
const charts = {};

/* ========== Theme management ========== */
function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyChartThemeDefaults() {
  Chart.defaults.color = getCSSVar("--text-muted");
  Object.values(charts).forEach((c) => {
    if (!c) return;
    c.options.scales?.x?.grid && (c.options.scales.x.grid.color = getCSSVar("--chart-grid"));
    c.options.scales?.y?.grid && (c.options.scales.y.grid.color = getCSSVar("--chart-grid"));
    if (c.options.plugins?.tooltip) {
      c.options.plugins.tooltip.backgroundColor = getCSSVar("--tooltip-bg");
      c.options.plugins.tooltip.titleColor = getCSSVar("--tooltip-text");
      c.options.plugins.tooltip.bodyColor = getCSSVar("--tooltip-text");
    }
    c.update("none");
  });
}

function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  if (next === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try { localStorage.setItem("theme", next); } catch {}
  applyChartThemeDefaults();
  updateSankeySVGColors();
}

function updateSankeySVGColors() {
  document.querySelectorAll(".flow-diagram svg text").forEach((t) => {
    const fs = t.getAttribute("font-size");
    t.setAttribute("fill", fs === "10" ? getCSSVar("--text-muted") : getCSSVar("--text-secondary"));
  });
}

document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  if (localStorage.getItem("theme")) return;
  if (e.matches) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  applyChartThemeDefaults();
  updateSankeySVGColors();
});

/* ========== Chart.js global defaults ========== */
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = getCSSVar("--text-muted") || "#9ca3af";
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
Chart.defaults.plugins.legend.labels.padding = 16;

const CHART_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#84cc16", "#6366f1",
];

/* ========== Tab Navigation ========== */
const tabs = document.querySelectorAll(".tab[data-tab]");

function activateTab(tabName, { updateUrl = true } = {}) {
  tabs.forEach((t) => {
    const isTarget = t.dataset.tab === tabName;
    t.classList.toggle("active", isTarget);
    t.setAttribute("aria-selected", isTarget ? "true" : "false");
  });
  document.querySelectorAll(".tab-content").forEach((tc) => tc.classList.remove("active"));
  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.add("active");

  if (updateUrl) {
    const currentRoute = router.current;
    if (currentRoute.page === "dashboard" && currentRoute.service) {
      router.push({ page: "dashboard", service: currentRoute.service, tab: tabName });
    }
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
});

/* ========== Events ========== */
connectButton.addEventListener("click", () => {
  window.location.href = "/auth/login";
});

logoutButton.addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST" });
  window.location.href = "/";
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
  router.push({ page: "services" });
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
  if (router.current.page === "preview") {
    router.replace({ page: "preview" });
  } else {
    router.push({ page: "preview" });
  }
  try {
    const data = await loadDashboardStream(`/preview/dashboard?range=${rangeSelect.value}&stream=1`);
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
  router.push({ page: "home" });
}

/* ========== API ========== */
async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
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

/* ========== Resource helpers ========== */
function detectEnvironment(resource) {
  const name = (resource.appInsightsName || "").toLowerCase();
  const hint = (resource.environmentHint || "").toLowerCase();
  if (hint === "prod" || hint === "prd" || hint === "production" || name.includes("-prd") || name.includes("-prod"))
    return { label: "Production", short: "PRD", css: "env-prod" };
  if (hint === "dev" || hint === "development" || name.includes("-dev"))
    return { label: "Development", short: "DEV", css: "env-dev" };
  if (hint === "staging" || hint === "stg" || hint === "stage" || name.includes("-stg") || name.includes("-staging"))
    return { label: "Staging", short: "STG", css: "env-staging" };
  if (hint === "qa" || hint === "test" || hint === "uat" || name.includes("-qa") || name.includes("-test") || name.includes("-uat"))
    return { label: "QA", short: "QA", css: "env-qa" };
  if (hint)
    return { label: hint.charAt(0).toUpperCase() + hint.slice(1), short: hint.toUpperCase().slice(0, 3), css: "env-default" };
  return { label: "", short: "", css: "env-default" };
}

function extractWorkspaceName(workspaceId) {
  if (!workspaceId) return "\u2014";
  const segments = workspaceId.split("/").filter(Boolean);
  return segments[segments.length - 1] || workspaceId;
}

function truncateGuid(id) {
  if (!id || id.length < 16) return id || "\u2014";
  return id.slice(0, 8) + "\u2026" + id.slice(-4);
}

/* ========== Resource selection ========== */
function showSelectedResource(name) {
  selectedResourceName.textContent = name;
  selectedResourceBar.classList.remove("hidden");
}

function renderResources(resources) {
  lastDiscoveredResources = resources;
  resourceList.innerHTML = "";
  statusPanel.textContent = "";

  const searchWrapper = document.getElementById("resourceSearchWrapper");
  const searchInput = document.getElementById("resourceSearchInput");
  const emptySearch = document.getElementById("resourceEmptySearch");

  if (resources.length >= 3 && searchWrapper) {
    searchWrapper.classList.remove("hidden");
    searchInput.value = "";
    searchInput.oninput = () => {
      const q = searchInput.value.toLowerCase();
      let visible = 0;
      resourceList.querySelectorAll(".resource-card-v2").forEach((c) => {
        const match = !q || (c.dataset.search || "").includes(q);
        c.style.display = match ? "" : "none";
        if (match) visible++;
      });
      if (emptySearch) emptySearch.classList.toggle("hidden", visible > 0);
    };
  } else if (searchWrapper) {
    searchWrapper.classList.add("hidden");
  }
  if (emptySearch) emptySearch.classList.add("hidden");

  const envOrder = { "env-prod": 0, "env-staging": 1, "env-dev": 2, "env-qa": 3, "env-default": 4 };
  const sorted = [...resources].sort((a, b) => {
    const ea = detectEnvironment(a), eb = detectEnvironment(b);
    const d = (envOrder[ea.css] ?? 4) - (envOrder[eb.css] ?? 4);
    return d !== 0 ? d : (a.appInsightsName || "").localeCompare(b.appInsightsName || "");
  });

  const ICON_FOLDER = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  const ICON_DB = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>';
  const ICON_SUB = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

  sorted.forEach((resource, idx) => {
    const env = detectEnvironment(resource);
    const wsName = extractWorkspaceName(resource.workspaceId);

    const card = document.createElement("div");
    card.className = `resource-card-v2 ${env.css}`;
    card.style.animationDelay = `${idx * 60}ms`;
    card.dataset.search = [resource.appInsightsName, resource.subscriptionId, resource.resourceGroup, wsName, env.label].join(" ").toLowerCase();

    // Header: name + env badge
    const top = document.createElement("div");
    top.className = "resource-card-top";

    const nameBlock = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "resource-card-name";
    nameEl.textContent = resource.appInsightsName;
    nameBlock.appendChild(nameEl);
    const typeEl = document.createElement("div");
    typeEl.className = "resource-card-type";
    typeEl.textContent = "Application Insights";
    nameBlock.appendChild(typeEl);
    top.appendChild(nameBlock);

    if (env.short) {
      const badge = document.createElement("span");
      badge.className = `resource-card-env-badge ${env.css}`;
      badge.textContent = env.short;
      top.appendChild(badge);
    }
    card.appendChild(top);

    // Metadata rows
    const meta = document.createElement("div");
    meta.className = "resource-card-meta";

    const addRow = (iconSvg, text, title) => {
      const row = document.createElement("div");
      row.className = "resource-card-meta-row";
      const icon = document.createElement("span");
      icon.innerHTML = iconSvg;
      row.appendChild(icon);
      const val = document.createElement("span");
      val.className = "resource-card-meta-value";
      val.textContent = text;
      if (title) val.title = title;
      row.appendChild(val);
      return row;
    };

    if (resource.resourceGroup) {
      meta.appendChild(addRow(ICON_FOLDER, resource.resourceGroup, resource.resourceGroup));
    }
    meta.appendChild(addRow(ICON_DB, wsName, resource.workspaceId));
    meta.appendChild(addRow(ICON_SUB, truncateGuid(resource.subscriptionId), resource.subscriptionId));
    card.appendChild(meta);

    // Action footer
    const action = document.createElement("div");
    action.className = "resource-card-action";
    const selText = document.createElement("span");
    selText.className = "resource-card-select-text";
    selText.innerHTML = 'Analyze <span class="resource-card-select-arrow">\u2192</span>';
    action.appendChild(selText);
    card.appendChild(action);

    // Click handler — entire card is clickable
    card.addEventListener("click", async () => {
      card.style.opacity = "0.6";
      card.style.pointerEvents = "none";
      setStatus(`Connecting to ${resource.appInsightsName}\u2026`);
      try {
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
        router.push({ page: "dashboard", service: resource.appInsightsName, tab: "marketing" });
        await loadDashboard(rangeSelect.value);
      } catch (err) {
        card.style.opacity = "";
        card.style.pointerEvents = "";
        setStatus(err.message || "Selection failed.", "error");
      }
    });

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

/* ========== Technical route filtering ========== */
const TECHNICAL_ROUTE_PATTERNS = [
  /^\/api\//i,
  /^\/apps\/web\/src\//i,
  /\/api\/trpc\//i,
  /\/api\/auth\//i,
  /\/api\/auth\/session/i,
  /\/_next\//i,
  /\/_not-found/i,
  /\/favicon/i,
  /\/robots\.txt/i,
  /\/sitemap/i,
  /\/healthz?/i,
  /\/ready/i,
  /\/livez/i,
  /\/__([\w-]+)/i,        // __nextjs, __data, etc.
];

function isTechnicalRoute(path) {
  return TECHNICAL_ROUTE_PATTERNS.some((re) => re.test(path));
}

function filterTechnicalRoutes(rows, pathKey = "path") {
  return rows.filter((row) => !isTechnicalRoute(row[pathKey]));
}

/* ========== Render: Daily Trend ========== */
function renderDailyTrend(data) {
  const points = data || [];
  const hasData = points.length >= 1;
  showOrHide("dailyTrendChart", "dailyTrendEmpty", hasData);
  if (!hasData) return;

  destroyChart("dailyTrend");
  const ctx = document.getElementById("dailyTrendChart").getContext("2d");
  const pointSize = points.length <= 3 ? 5 : points.length > 20 ? 0 : 3;
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
          pointRadius: pointSize,
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
          pointRadius: pointSize,
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
          backgroundColor: getCSSVar("--tooltip-bg"),
          titleColor: getCSSVar("--tooltip-text"),
          bodyColor: getCSSVar("--tooltip-text"),
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
          grid: { color: getCSSVar("--chart-grid") },
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
          grid: { color: getCSSVar("--chart-grid") },
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
          grid: { color: getCSSVar("--chart-grid") },
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
  "Greece": [39.1, 21.8],
  "Morocco": [31.8, -7.1],
  "Martinique": [14.6, -61.0],
  "Romania": [45.9, 24.97],
  "Ukraine": [48.4, 31.2],
  "Croatia": [45.1, 15.2],
  "Hungary": [47.2, 19.5],
  "Slovakia": [48.7, 19.7],
  "Bulgaria": [42.7, 25.5],
  "Serbia": [44.0, 21.0],
  "Lithuania": [55.2, 23.9],
  "Latvia": [56.9, 24.1],
  "Estonia": [58.6, 25.0],
  "Iceland": [64.1, -18.1],
  "Luxembourg": [49.8, 6.1],
  "Malta": [35.9, 14.4],
  "Tunisia": [34.0, 9.5],
  "Algeria": [28.0, 1.7],
  "Kenya": [0.02, 37.9],
  "Ghana": [7.9, -1.0],
  "Pakistan": [30.4, 69.3],
  "Bangladesh": [23.7, 90.4],
  "Sri Lanka": [7.9, 80.8],
  "Malaysia": [4.2, 101.9],
  "Taiwan": [23.7, 121.0],
  "Hong Kong": [22.4, 114.1],
  "Peru": [-9.2, -75.0],
  "Ecuador": [-1.8, -78.2],
  "Uruguay": [-32.5, -55.8],
  "Costa Rica": [9.7, -83.8],
  "Panama": [8.5, -80.8],
  "Saudi Arabia": [23.9, 45.1],
  "Qatar": [25.3, 51.2],
  "Kuwait": [29.3, 47.5],
  "Jordan": [30.6, 36.2],
  "Lebanon": [33.9, 35.9],
};

function renderGeoMap(data) {
  const items = data || [];
  const container = document.getElementById("geoMap");
  if (!items.length) return;

  // Leaflet must be loaded from CDN
  if (typeof L === "undefined") {
    console.warn("Leaflet (L) not loaded — skipping geo map render.");
    return;
  }

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

/* ========== Render: KPI Sparklines ========== */
function renderSparkline(svgId, points, color, invertAnomaly) {
  const svg = document.getElementById(svgId);
  if (!svg || !points || points.length < 2) return;
  svg.innerHTML = "";
  const ns = "http://www.w3.org/2000/svg";
  const w = 60, h = 20, pad = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points.map((v, i) => ({
    x: pad + (i / (points.length - 1)) * (w - 2 * pad),
    y: pad + (1 - (v - min) / range) * (h - 2 * pad),
  }));

  // Area fill
  const areaPath = document.createElementNS(ns, "path");
  const lineParts = coords.map((c, i) => (i === 0 ? `M${c.x},${c.y}` : `L${c.x},${c.y}`)).join(" ");
  areaPath.setAttribute("d", `${lineParts} L${coords[coords.length - 1].x},${h} L${coords[0].x},${h} Z`);
  areaPath.setAttribute("fill", color);
  areaPath.classList.add("sparkline-area");
  svg.appendChild(areaPath);

  // Line
  const line = document.createElementNS(ns, "polyline");
  line.setAttribute("points", coords.map((c) => `${c.x},${c.y}`).join(" "));
  line.setAttribute("stroke", color);
  line.classList.add("sparkline-line");
  svg.appendChild(line);

  // Last dot
  const last = coords[coords.length - 1];
  const dot = document.createElementNS(ns, "circle");
  dot.setAttribute("cx", last.x);
  dot.setAttribute("cy", last.y);
  dot.setAttribute("fill", color);
  dot.classList.add("sparkline-dot");
  svg.appendChild(dot);
}

function renderAnomalyBadge(badgeId, anomaly, invertBad) {
  const badge = document.getElementById(badgeId);
  if (!badge) return;
  if (!anomaly) {
    badge.classList.add("hidden");
    return;
  }
  badge.classList.remove("hidden");
  const arrow = anomaly.direction === "up" ? "\u2191" : "\u2193";
  const pct = Math.abs(anomaly.pctChange);
  badge.textContent = `${arrow} ${pct}% vs avg`;

  // For error rate / response time, "up" is bad. For visitors, "up" is good.
  const isGood = invertBad ? anomaly.direction === "down" : anomaly.direction === "up";
  badge.className = `anomaly-badge ${isGood ? "anomaly-up" : anomaly.direction === "up" ? "anomaly-warning" : "anomaly-down"}`;
}

function renderAllSparklines(sparklines) {
  if (!sparklines) return;
  if (sparklines.visitors) {
    renderSparkline("sparkVisitors", sparklines.visitors.points, "#3b82f6");
    renderAnomalyBadge("anomalyVisitors", sparklines.visitors.anomaly, false);
  }
  if (sparklines.sessions) {
    renderSparkline("sparkSessions", sparklines.sessions.points, "#10b981");
    renderAnomalyBadge("anomalySessions", sparklines.sessions.anomaly, false);
  }
  if (sparklines.errorRate) {
    renderSparkline("sparkErrorRate", sparklines.errorRate.points.map((v) => v * 100), "#ef4444");
    renderAnomalyBadge("anomalyErrorRate", sparklines.errorRate.anomaly, true);
  }
  if (sparklines.avgResponse) {
    renderSparkline("sparkAvgResponse", sparklines.avgResponse.points, "#f59e0b");
    renderAnomalyBadge("anomalyAvgResponse", sparklines.avgResponse.anomaly, true);
  }
}

/* ========== Render: A/B Test Monitor ========== */
function renderAbTests(tests) {
  const panel = document.getElementById("abTestPanel");
  const container = document.getElementById("abTestContainer");
  container.innerHTML = "";

  if (!tests || tests.length === 0) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  tests.forEach((test) => {
    const card = document.createElement("div");
    card.className = "ab-test-card";

    // Header
    const header = document.createElement("div");
    header.className = "ab-test-header";
    header.innerHTML = `<span class="ab-test-name">${test.testName}</span><span class="ab-test-status">${test.status}</span>`;
    card.appendChild(header);

    // Determine winner by conversion rate
    const convRates = test.variants.map((v) => v.visitors > 0 ? v.conversions / v.visitors : 0);
    const winnerIdx = convRates.indexOf(Math.max(...convRates));

    // Variants grid
    const grid = document.createElement("div");
    grid.className = "ab-test-variants";

    test.variants.forEach((variant, idx) => {
      const vEl = document.createElement("div");
      vEl.className = `ab-variant${idx === winnerIdx ? " winner" : ""}`;

      const nameEl = document.createElement("div");
      nameEl.className = "ab-variant-name";
      nameEl.textContent = variant.name;
      vEl.appendChild(nameEl);

      if (idx === winnerIdx && test.variants.length > 1) {
        const badge = document.createElement("span");
        badge.className = "ab-winner-badge";
        badge.textContent = "WINNER";
        vEl.appendChild(badge);
      }

      const convRate = variant.visitors > 0 ? variant.conversions / variant.visitors : 0;
      const metrics = [
        { label: "Visitors", value: fmt(variant.visitors) },
        { label: "Conversions", value: fmt(variant.conversions) },
        { label: "Conv. Rate", value: fmtPct(convRate), highlight: true },
        { label: "Bounce Rate", value: fmtPct(variant.bounceRate) },
        { label: "Avg Duration", value: `${Math.round(variant.avgDuration / 1000)}s` },
      ];

      const metricsEl = document.createElement("div");
      metricsEl.className = "ab-metrics";
      metrics.forEach((m) => {
        const row = document.createElement("div");
        row.className = "ab-metric";
        const labelSpan = document.createElement("span");
        labelSpan.className = "ab-metric-label";
        labelSpan.textContent = m.label;
        const valueSpan = document.createElement("span");
        valueSpan.className = "ab-metric-value";
        valueSpan.textContent = m.value;
        if (m.highlight && idx === winnerIdx && test.variants.length > 1) {
          valueSpan.classList.add("better");
        }
        row.appendChild(labelSpan);
        row.appendChild(valueSpan);
        metricsEl.appendChild(row);
      });
      vEl.appendChild(metricsEl);
      grid.appendChild(vEl);
    });

    card.appendChild(grid);
    container.appendChild(card);
  });
}

/* ========== Render: Session Replay Timelines ========== */
function renderSessionReplays(sessions) {
  const container = document.getElementById("sessionReplays");
  const emptyEl = document.getElementById("sessionReplaysEmpty");
  container.innerHTML = "";

  if (!sessions || sessions.length === 0) {
    container.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }
  container.classList.remove("hidden");
  emptyEl?.classList.add("hidden");

  const eventIcons = {
    pageView: "\u25CF",
    click: "\u25B6",
    conversion: "\u2713",
    error: "\u2716",
    exit: "\u25CB",
  };

  sessions.forEach((session, sIdx) => {
    const card = document.createElement("div");
    card.className = "session-card";

    // Header
    const header = document.createElement("div");
    header.className = "session-header";
    header.addEventListener("click", () => card.classList.toggle("open"));

    const meta = document.createElement("div");
    meta.className = "session-meta";

    const idSpan = document.createElement("span");
    idSpan.className = "session-id";
    idSpan.textContent = session.sessionId;
    meta.appendChild(idSpan);

    const tag = document.createElement("span");
    tag.className = `session-tag ${session.converted ? "converted" : session.pageCount === 1 ? "bounced" : "exited"}`;
    tag.textContent = session.converted ? "Converted" : session.pageCount === 1 ? "Bounced" : "Exited";
    meta.appendChild(tag);

    const info = document.createElement("span");
    info.textContent = `${session.pageCount} pages \u00B7 ${Math.round(session.duration)}s \u00B7 ${session.device} \u00B7 ${session.country}`;
    meta.appendChild(info);

    header.appendChild(meta);

    const arrow = document.createElement("span");
    arrow.className = "session-arrow";
    arrow.textContent = "\u25BC";
    header.appendChild(arrow);
    card.appendChild(header);

    // Auto-open first session
    if (sIdx === 0) card.classList.add("open");

    // Timeline
    const timeline = document.createElement("div");
    timeline.className = "session-timeline";

    session.events.forEach((event) => {
      const eventEl = document.createElement("div");
      eventEl.className = "timeline-event";

      const dot = document.createElement("span");
      dot.className = `timeline-dot ${event.type}`;
      dot.textContent = eventIcons[event.type] || "\u25CF";
      eventEl.appendChild(dot);

      const content = document.createElement("div");
      content.className = "timeline-content";
      const label = document.createElement("div");
      label.className = "timeline-label";
      label.textContent = event.type === "pageView" ? event.path : event.label;
      content.appendChild(label);

      if (event.type === "pageView" && event.duration) {
        const detail = document.createElement("div");
        detail.className = "timeline-detail";
        detail.textContent = `${event.duration}s on page`;
        content.appendChild(detail);
      }
      eventEl.appendChild(content);

      const time = document.createElement("span");
      time.className = "timeline-time";
      time.textContent = `+${event.timestamp}s`;
      eventEl.appendChild(time);

      timeline.appendChild(eventEl);
    });

    card.appendChild(timeline);
    container.appendChild(card);
  });
}

/* ========== Render: Period-over-period KPI deltas (B4) ========== */
function renderKpiComparison(kpis) {
  const cmp = kpis && kpis.comparison;
  const targets = [
    { key: "uniqueVisitors", deltaId: "kpiVisitorsDelta", captionId: "kpiVisitorsCompare" },
    { key: "sessions",       deltaId: "kpiSessionsDelta", captionId: "kpiSessionsCompare" },
    { key: "pageViews",      deltaId: "kpiPageViewsDelta", captionId: "kpiPageViewsCompare" },
  ];
  for (const t of targets) {
    const deltaEl = document.getElementById(t.deltaId);
    const captionEl = document.getElementById(t.captionId);
    if (!deltaEl || !captionEl) continue;

    const entry = cmp && cmp[t.key];
    if (!cmp || !entry || entry.deltaPct === null || !Number.isFinite(entry.deltaPct)) {
      deltaEl.classList.add("hidden");
      captionEl.classList.add("hidden");
      continue;
    }

    const sign = entry.deltaPct > 0 ? "+" : "";
    deltaEl.textContent = `${sign}${entry.deltaPct.toFixed(1)}%`;
    deltaEl.dataset.direction = entry.direction || "neutral";
    deltaEl.classList.remove("hidden");

    captionEl.textContent = cmp.label || "";
    if (cmp.label) captionEl.classList.remove("hidden");
    else captionEl.classList.add("hidden");
  }
}

/* ========== Render: Environment analysis narration ========== */
function renderNarration(narration) {
  const panel = document.getElementById("narrationPanel");
  if (!panel) return;
  if (!narration || !narration.enabled || !narration.paragraph) {
    panel.classList.add("hidden");
    return;
  }
  const headline = document.getElementById("narrationHeadline");
  const paragraph = document.getElementById("narrationParagraph");
  const tagline = document.getElementById("narrationTagline");
  const badge = document.getElementById("narrationBadge");
  if (headline) headline.textContent = narration.headline || "Environment analysis";
  if (paragraph) paragraph.textContent = narration.paragraph;
  if (tagline) tagline.textContent = narration.tagline || "";
  if (badge) {
    if (narration.badge) {
      badge.textContent = narration.badge;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }
  panel.dataset.mode = narration.mode || "";
  panel.classList.remove("hidden");
}

/* ========== Render: Smart Insights ========== */
function renderInsights(dashboard) {
  const panel = document.getElementById("insightsPanel");
  const list = document.getElementById("insightsList");
  list.innerHTML = "";
  const insights = [];

  // Insight 1: Best converting campaign
  const campaigns = dashboard.charts.campaignBreakdown || [];
  if (campaigns.length > 0) {
    const best = campaigns.reduce((a, b) => (a.convRate || 0) > (b.convRate || 0) ? a : b);
    if (best.convRate > 0) {
      insights.push({
        icon: "\uD83C\uDFAF",
        text: `Best converting campaign: <strong>${best.campaign}</strong> via ${best.source} at <span class="insight-highlight">${fmtPct(best.convRate)}</span> conversion rate`,
      });
    }
  }

  // Insight 2: Peak traffic time
  const peakData = dashboard.charts.peakHours;
  if (peakData && peakData.length > 0) {
    const peak = peakData.reduce((a, b) => a.count > b.count ? a : b);
    insights.push({
      icon: "\u23F0",
      text: `Peak traffic: <strong>${peak.day} ${peak.hour}:00-${peak.hour + 1}:00</strong> with ${fmt(peak.count)} visitors/period`,
    });
  }

  // Insight 3: Top traffic source
  const sources = dashboard.charts.referrerSources || [];
  if (sources.length > 0) {
    const total = sources.reduce((s, r) => s + r.count, 0);
    const top = sources[0];
    if (top && total > 0) {
      insights.push({
        icon: "\uD83D\uDD17",
        text: `Top traffic source: <strong>${top.source}</strong> drives <span class="insight-highlight">${((top.count / total) * 100).toFixed(0)}%</span> of all traffic`,
      });
    }
  }

  // Insight 4: Error rate check
  if (dashboard.kpis.errorRate > 0.03) {
    insights.push({
      icon: "\u26A0\uFE0F",
      text: `Error rate at <span class="insight-warning">${fmtPct(dashboard.kpis.errorRate)}</span> — above 3% threshold. Check slow endpoints in the Technical tab.`,
    });
  } else if (dashboard.kpis.errorRate > 0) {
    insights.push({
      icon: "\u2705",
      text: `Error rate is healthy at <span class="insight-highlight">${fmtPct(dashboard.kpis.errorRate)}</span>`,
    });
  }

  // Insight 5: URL parameter coverage
  const urlParams = dashboard.charts.urlParams;
  if (urlParams) {
    const pct = urlParams.totalUrlsScanned > 0 ? ((urlParams.urlsWithParams / urlParams.totalUrlsScanned) * 100).toFixed(0) : 0;
    const utmCount = urlParams.discovered.filter((p) => p.isUtm).length;
    insights.push({
      icon: "\uD83D\uDD0D",
      text: `<strong>${urlParams.discovered.length}</strong> URL parameters auto-detected (${utmCount} UTM). <strong>${pct}%</strong> of page views carry tracking params.`,
    });
  }

  // Insight 6: Top page dominance
  const topPages = dashboard.charts.topPages || [];
  if (topPages.length >= 2) {
    const topShare = topPages[0].share || 0;
    if (topShare > 0.25) {
      insights.push({
        icon: "\uD83D\uDCCA",
        text: `<strong>${topPages[0].path}</strong> captures <span class="insight-highlight">${fmtPct(topShare)}</span> of all page views — high homepage concentration`,
      });
    }
  }

  if (insights.length === 0) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  insights.forEach((insight) => {
    const item = document.createElement("div");
    item.className = "insight-item";
    item.innerHTML = `<span class="insight-icon">${insight.icon}</span><span class="insight-text">${insight.text}</span>`;
    list.appendChild(item);
  });
}

/* ========== Render: Peak Hours Heatmap ========== */
function renderPeakHours(data) {
  const container = document.getElementById("peakHoursGrid");
  const emptyEl = document.getElementById("peakHoursEmpty");
  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }
  container.classList.remove("hidden");
  emptyEl?.classList.add("hidden");

  const maxCount = Math.max(...data.map((d) => d.count));
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const isDark = getTheme() === "dark";
  const heatScale = isDark
    ? ["#0c1a2e", "#0c3a6e", "#1d6eb5", "#38bdf8", "#7dd3fc", "#bae6fd"]
    : ["#f0f9ff", "#bae6fd", "#7dd3fc", "#38bdf8", "#0284c7", "#0c4a6e"];

  function heatColor(count) {
    const intensity = maxCount > 0 ? count / maxCount : 0;
    if (intensity < 0.15) return heatScale[0];
    if (intensity < 0.3) return heatScale[1];
    if (intensity < 0.5) return heatScale[2];
    if (intensity < 0.7) return heatScale[3];
    if (intensity < 0.85) return heatScale[4];
    return heatScale[5];
  }

  // Build grid
  days.forEach((day, dayIdx) => {
    const row = document.createElement("div");
    row.className = "peak-row";

    const label = document.createElement("span");
    label.className = "peak-day-label";
    label.textContent = day;
    row.appendChild(label);

    for (let h = 0; h < 24; h++) {
      const cell = data.find((d) => d.dayIndex === dayIdx && d.hour === h);
      const count = cell ? cell.count : 0;
      const div = document.createElement("div");
      div.className = "peak-cell";
      div.style.background = heatColor(count);
      div.title = `${day} ${h}:00 — ${fmt(count)} visitors`;
      row.appendChild(div);
    }
    container.appendChild(row);
  });

  // Hour labels (every 3 hours)
  const hourLabels = document.createElement("div");
  hourLabels.className = "peak-hour-labels";
  for (let h = 0; h < 24; h++) {
    const lbl = document.createElement("span");
    lbl.className = "peak-hour-label";
    lbl.textContent = h % 3 === 0 ? `${h}h` : "";
    hourLabels.appendChild(lbl);
  }
  container.appendChild(hourLabels);

  // Legend
  const legend = document.createElement("div");
  legend.className = "peak-legend";
  legend.innerHTML = '<span>Less</span><div class="peak-legend-bar"></div><span>More</span>';
  const bar = legend.querySelector(".peak-legend-bar");
  heatScale.forEach((c) => {
    const cell = document.createElement("div");
    cell.className = "peak-legend-cell";
    cell.style.background = c;
    bar.appendChild(cell);
  });
  container.appendChild(legend);
}

/* ========== Render: Content Performance ========== */
function renderContentScoring(navPaths, topPages) {
  const container = document.getElementById("contentScoring");
  const emptyEl = document.getElementById("contentScoringEmpty");
  container.innerHTML = "";

  if (!navPaths || navPaths.length === 0 || !topPages || topPages.length === 0) {
    container.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }
  container.classList.remove("hidden");
  emptyEl?.classList.add("hidden");

  // Score: for each page, how much does it contribute to funnel progression?
  // "Contribution" = sum of transitions from this page to funnel pages (/pricing, /signup)
  const funnelTargets = new Set(["/pricing", "/signup", "/checkout"]);
  const pageScores = {};

  navPaths.forEach((path) => {
    if (funnelTargets.has(path.to) && !funnelTargets.has(path.from)) {
      pageScores[path.from] = (pageScores[path.from] || 0) + path.count;
    }
  });

  // Also count pages that are themselves funnel pages (self-contribution)
  navPaths.forEach((path) => {
    if (funnelTargets.has(path.from) && funnelTargets.has(path.to)) {
      pageScores[path.from] = (pageScores[path.from] || 0) + path.count;
    }
  });

  // Build scored list with target info
  const scored = Object.entries(pageScores)
    .map(([page, score]) => {
      // Find which funnel page this content drives to most
      const targets = navPaths
        .filter((p) => p.from === page && funnelTargets.has(p.to))
        .sort((a, b) => b.count - a.count);
      const mainTarget = targets[0]?.to || "/pricing";
      return { page, score, mainTarget };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  if (scored.length === 0) {
    container.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }

  const maxScore = scored[0].score;
  const colors = {
    "/pricing": "#f97316",
    "/signup": "#10b981",
    "/checkout": "#8b5cf6",
  };

  scored.forEach((item) => {
    const row = document.createElement("div");
    row.className = "content-score-row";

    const pageName = document.createElement("span");
    pageName.className = "content-page";
    pageName.textContent = item.page;
    pageName.title = item.page;
    row.appendChild(pageName);

    const barBg = document.createElement("div");
    barBg.className = "content-bar-bg";
    const bar = document.createElement("div");
    bar.className = "content-bar";
    bar.style.width = (maxScore > 0 ? (item.score / maxScore) * 100 : 0) + "%";
    bar.style.background = colors[item.mainTarget] || "#3b82f6";
    bar.textContent = `${fmt(item.score)} \u2192 ${item.mainTarget}`;
    barBg.appendChild(bar);
    row.appendChild(barBg);

    container.appendChild(row);
  });
}

/* ========== Active Filters ========== */
let activeFilters = [];

function addFilter(param, value) {
  if (activeFilters.some((f) => f.param === param && f.value === value)) return;
  activeFilters.push({ param, value });
  renderFilterBar();
}

function removeFilter(param, value) {
  activeFilters = activeFilters.filter((f) => !(f.param === param && f.value === value));
  renderFilterBar();
}

function clearAllFilters() {
  activeFilters = [];
  renderFilterBar();
}

function renderFilterBar() {
  const bar = document.getElementById("filterBar");
  const chips = document.getElementById("filterChips");
  if (activeFilters.length === 0) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  chips.innerHTML = "";
  activeFilters.forEach((f) => {
    const chip = document.createElement("span");
    chip.className = "filter-chip";
    chip.innerHTML = `<span>${f.param}=${f.value}</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.className = "filter-chip-remove";
    removeBtn.textContent = "\u00D7";
    removeBtn.addEventListener("click", () => removeFilter(f.param, f.value));
    chip.appendChild(removeBtn);
    chips.appendChild(chip);
  });
}

document.getElementById("clearFilters")?.addEventListener("click", clearAllFilters);

/* ========== Render: Campaign Breakdown ========== */
function renderCampaignTable(data) {
  const tbody = document.getElementById("campaignBody");
  const emptyEl = document.getElementById("campaignEmpty");
  tbody.innerHTML = "";

  if (!data || data.length === 0) {
    tbody.parentElement.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }
  tbody.parentElement.classList.remove("hidden");
  emptyEl?.classList.add("hidden");

  data.forEach((row) => {
    const tr = document.createElement("tr");
    tr.appendChild(td(row.source));
    tr.appendChild(td(row.medium));
    tr.appendChild(td(row.campaign));
    tr.appendChild(td(fmt(row.visitors), "num"));
    tr.appendChild(td(fmt(row.sessions), "num"));
    tr.appendChild(td(fmt(row.signups), "num"));

    const convTd = td(fmtPct(row.convRate), "num");
    if (row.convRate >= 0.08) convTd.style.color = "var(--success)";
    else if (row.convRate < 0.04) convTd.style.color = "var(--danger)";
    tr.appendChild(convTd);

    // Click to filter
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      addFilter("utm_source", row.source);
      if (row.campaign !== "(none)") addFilter("utm_campaign", row.campaign);
    });
    tbody.appendChild(tr);
  });
}

/* ========== Render: URL Parameters ========== */
let pinnedParams = new Set();
try {
  const saved = localStorage.getItem("ea_pinned_params");
  if (saved) pinnedParams = new Set(JSON.parse(saved));
} catch {}

function savePinnedParams() {
  try { localStorage.setItem("ea_pinned_params", JSON.stringify([...pinnedParams])); } catch {}
}

function renderUrlParams(data) {
  const chipsContainer = document.getElementById("paramChips");
  const scanCount = document.getElementById("paramScanCount");
  chipsContainer.innerHTML = "";

  if (!data || !data.discovered || data.discovered.length === 0) return;

  if (scanCount) {
    const pct = data.totalUrlsScanned > 0 ? ((data.urlsWithParams / data.totalUrlsScanned) * 100).toFixed(0) : 0;
    scanCount.textContent = `${data.discovered.length} params detected (${pct}% of URLs)`;
  }

  data.discovered.forEach((param) => {
    const chip = document.createElement("div");
    chip.className = `param-chip${param.isUtm ? " is-utm" : ""}`;

    const name = document.createElement("span");
    name.className = "param-chip-name";
    name.textContent = param.param;
    chip.appendChild(name);

    const count = document.createElement("span");
    count.className = "param-chip-count";
    count.textContent = fmt(param.frequency);
    chip.appendChild(count);

    // Pin button
    const pin = document.createElement("button");
    pin.className = `param-chip-pin${pinnedParams.has(param.param) ? " pinned" : ""}`;
    pin.textContent = pinnedParams.has(param.param) ? "\u2713" : "+";
    pin.title = pinnedParams.has(param.param) ? "Unpin from dashboard" : "Pin to dashboard";
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      if (pinnedParams.has(param.param)) {
        pinnedParams.delete(param.param);
        pin.classList.remove("pinned");
        pin.textContent = "+";
        pin.title = "Pin to dashboard";
      } else {
        pinnedParams.add(param.param);
        pin.classList.add("pinned");
        pin.textContent = "\u2713";
        pin.title = "Unpin from dashboard";
      }
      savePinnedParams();
    });
    chip.appendChild(pin);

    // Click chip to show detail
    chip.addEventListener("click", () => showParamDetail(param));

    chipsContainer.appendChild(chip);
  });
}

function showParamDetail(param) {
  const detail = document.getElementById("paramDetail");
  const nameEl = document.getElementById("paramDetailName");
  const valuesEl = document.getElementById("paramDetailValues");

  nameEl.textContent = `${param.param} (${fmt(param.frequency)} occurrences)`;
  valuesEl.innerHTML = "";
  detail.classList.remove("hidden");

  const maxCount = Math.max(...param.topValues.map((v) => v.count));

  param.topValues.forEach((v) => {
    const row = document.createElement("div");
    row.className = "param-value-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = "param-value-name";
    nameSpan.textContent = v.value;
    row.appendChild(nameSpan);

    const barBg = document.createElement("div");
    barBg.className = "param-value-bar-bg";
    const bar = document.createElement("div");
    bar.className = "param-value-bar";
    bar.style.width = (maxCount > 0 ? (v.count / maxCount) * 100 : 0) + "%";
    barBg.appendChild(bar);
    row.appendChild(barBg);

    const countSpan = document.createElement("span");
    countSpan.className = "param-value-count";
    countSpan.textContent = fmt(v.count);
    row.appendChild(countSpan);

    // Filter button
    const filterBtn = document.createElement("button");
    filterBtn.className = "param-value-filter-btn";
    filterBtn.textContent = "Filter";
    filterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      addFilter(param.param, v.value);
    });
    row.appendChild(filterBtn);

    valuesEl.appendChild(row);
  });
}

document.getElementById("paramDetailClose")?.addEventListener("click", () => {
  document.getElementById("paramDetail")?.classList.add("hidden");
});

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
      text.setAttribute("fill", getCSSVar("--text-secondary"));
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
    text.setAttribute("fill", getCSSVar("--text-muted"));
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

/* ========== Render: First-run banner (B3) ========== */
const FIRST_RUN_BANNER_DISMISS_KEY = "eaa.firstRunBanner.dismissed.v1";

function renderFirstRunBanner(readinessScore) {
  const banner = document.getElementById("firstRunBanner");
  if (!banner) return;

  if (!readinessScore || readinessScore.maxScore === 0) {
    banner.classList.add("hidden");
    return;
  }

  const wins = Array.isArray(readinessScore.quickWins) ? readinessScore.quickWins : [];
  const score = Number(readinessScore.score) || 0;
  const maxScore = Number(readinessScore.maxScore) || 100;

  // Hide when there's nothing to suggest (perfect score) or the user
  // dismissed it previously. Both branches log nothing to console — the
  // banner is purely informational.
  if (wins.length === 0 || score >= maxScore) {
    banner.classList.add("hidden");
    return;
  }

  let dismissed = false;
  try { dismissed = localStorage.getItem(FIRST_RUN_BANNER_DISMISS_KEY) === "1"; } catch (_) {}
  if (dismissed) {
    banner.classList.add("hidden");
    return;
  }

  const scoreEl = document.getElementById("firstRunScoreValue");
  const titleEl = document.getElementById("firstRunBannerTitle");
  const winsEl = document.getElementById("firstRunBannerWins");
  if (scoreEl) scoreEl.textContent = String(score);
  if (titleEl) {
    const winCount = Math.min(wins.length, 2);
    const plural = winCount === 1 ? "" : "s";
    titleEl.textContent = `Your environment scores ${score}/${maxScore}. ${winCount} quick win${plural} available:`;
  }

  if (winsEl) {
    winsEl.innerHTML = "";
    for (const win of wins.slice(0, 2)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "first-run-banner-chip";
      chip.dataset.signal = win.signal;
      chip.textContent = `${win.label} (+${win.points})`;
      chip.addEventListener("click", () => focusSignalPrompt(win.signal));
      winsEl.appendChild(chip);
    }
  }

  banner.classList.remove("hidden");

  const dismissBtn = document.getElementById("firstRunBannerDismiss");
  if (dismissBtn && !dismissBtn.dataset.wired) {
    dismissBtn.dataset.wired = "1";
    dismissBtn.addEventListener("click", () => {
      try { localStorage.setItem(FIRST_RUN_BANNER_DISMISS_KEY, "1"); } catch (_) {}
      banner.classList.add("hidden");
    });
  }
}

function focusSignalPrompt(signal) {
  if (typeof activateTab === "function") {
    activateTab("readiness");
  }
  // Wait one frame for the tab to become active before scrolling.
  requestAnimationFrame(() => {
    const target = document.getElementById(`signal-row-${signal}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("score-row-flash");
    setTimeout(() => target.classList.remove("score-row-flash"), 1600);
  });
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
    const wrapper = document.createElement("div");
    wrapper.className = `score-row-wrapper ${item.available ? "available" : "missing"}`;
    wrapper.id = `signal-row-${item.signal}`;

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
    points.textContent = `+${item.points}`;
    row.appendChild(points);

    wrapper.appendChild(row);

    if (!item.available) {
      const fixBtn = document.createElement("button");
      fixBtn.className = "score-row-fix-btn";
      fixBtn.textContent = "How to fix";
      fixBtn.dataset.signal = item.signal;
      row.appendChild(fixBtn);

      const detail = document.createElement("div");
      detail.className = "score-row-detail";
      detail.id = `signal-detail-${item.signal}`;

      const spinner = document.createElement("div");
      spinner.className = "score-row-detail-loading";
      spinner.textContent = "Loading\u2026";
      detail.appendChild(spinner);

      wrapper.appendChild(detail);

      fixBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.toggle("open");
        fixBtn.textContent = isOpen ? "Hide" : "How to fix";
        if (isOpen) {
          detail.innerHTML = "";
          const loading = document.createElement("div");
          loading.className = "score-row-detail-loading";
          loading.textContent = "Loading...";
          detail.appendChild(loading);
          try {
            const data = await apiFetch(`/prompts?t=${Date.now()}`);
            const prompts = data.prompts || [];
            const match = prompts.find((p) => p.signal === item.signal);
            detail.innerHTML = "";
            if (match) {
              const stackTag = document.createElement("span");
              stackTag.className = "prompt-card-stack";
              stackTag.textContent = match.detectedStack;
              detail.appendChild(stackTag);

              const pre = document.createElement("div");
              pre.className = "prompt-text";
              pre.textContent = match.prompt;
              detail.appendChild(pre);

              const copyBtn = document.createElement("button");
              copyBtn.className = "prompt-copy-btn";
              copyBtn.textContent = "Copy prompt";
              copyBtn.addEventListener("click", async () => {
                try {
                  await navigator.clipboard.writeText(match.prompt);
                } catch {
                  const ta = document.createElement("textarea");
                  ta.value = match.prompt;
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand("copy");
                  document.body.removeChild(ta);
                }
                copyBtn.textContent = "Copied!";
                copyBtn.classList.add("copied");
                setTimeout(() => { copyBtn.textContent = "Copy prompt"; copyBtn.classList.remove("copied"); }, 2000);
              });
              detail.appendChild(copyBtn);
            } else {
              detail.innerHTML = "<p class=\"text-muted\">No prompt available for this signal yet.</p>";
            }
          } catch (err) {
            detail.innerHTML = `<p class="text-muted">Failed to load prompt: ${err.message}</p>`;
          }
        }
      });
    }

    container.appendChild(wrapper);
  });
}

/* ========== Prompt Cards (removed — prompts now inline in score rows) ========== */

/* ========== Safe render helper ========== */
function safeRender(label, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[renderDashboard] ${label} failed:`, err);
  }
}

/* ========== Main render ========== */
function renderDashboard(data) {
  lastDashboardData = data;
  const dashboard = data.dashboard;
  const readiness = data.readiness;
  const readinessScore = data.readinessScore;

  // Marketing KPIs
  safeRender("Marketing KPIs", () => {
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
  });

  // Technical KPIs
  safeRender("Technical KPIs", () => {
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
  });

  // Frontend avg KPI
  safeRender("Frontend KPI", () => {
    const btData = dashboard.charts.browserTimings;
    document.getElementById("kpiFrontendAvg").textContent = btData ? fmtMs(btData.avgTotal) : "-";
  });

  // KPI Sparklines with anomaly detection
  safeRender("Sparklines", () => renderAllSparklines(dashboard.charts.kpiSparklines));

  // Environment analysis narration (deterministic; AI-style framing)
  safeRender("Narration", () => renderNarration(dashboard.narration));

  // Period-over-period comparison chips on the top 3 KPI tiles (B4).
  safeRender("KPI comparison", () => renderKpiComparison(dashboard.kpis));

  // Smart Insights (auto-generated from all data)
  safeRender("Insights", () => renderInsights(dashboard));

  // Daily trend
  safeRender("Daily trend", () => renderDailyTrend(dashboard.charts.dailyTrend));

  // Top Pages table (with technical route filtering)
  safeRender("Top Pages", () => {
    const topPagesCheckbox = document.getElementById("topPagesFilterTechnical");
    const renderTopPages = () => {
      const all = dashboard.charts.topPages || [];
      const rows = topPagesCheckbox?.checked ? filterTechnicalRoutes(all) : all;
      renderTableRows("topPagesBody", "topPagesEmpty", "topPagesCount", rows, (tr, row) => {
        tr.appendChild(td(row.path));
        tr.appendChild(td(fmt(row.views), "num"));
        tr.appendChild(td(fmtPct(row.share), "num"));
      });
    };
    renderTopPages();
    if (topPagesCheckbox) topPagesCheckbox.onchange = renderTopPages;
  });

  // Geo distribution (map + chart)
  safeRender("Geo chart", () => renderGeoChart(dashboard.charts.geoDistribution));
  safeRender("Geo map", () => renderGeoMap(dashboard.charts.geoDistribution));

  // Doughnut charts
  safeRender("Doughnuts", () => {
    renderDoughnut("browserChart", "browserEmpty", "browser", dashboard.charts.browsers, "name", "count");
    renderDoughnut("osChart", "osEmpty", "os", dashboard.charts.os, "name", "count");
    renderDoughnut("deviceChart", "deviceEmpty", "device", dashboard.charts.devices, "name", "count");
  });

  // Browser timings
  safeRender("Browser timings", () => renderBrowserTimings(dashboard.charts.browserTimings));

  // Slow endpoints table (with technical route filtering)
  safeRender("Slow endpoints", () => {
    const slowCheckbox = document.getElementById("slowEndpointsFilterTechnical");
    const renderSlowEndpoints = () => {
      const all = dashboard.tables.slowEndpoints || [];
      const rows = slowCheckbox?.checked ? filterTechnicalRoutes(all) : all;
      renderTableRows("slowEndpointsBody", "slowEndpointsEmpty", "slowEndpointsCount", rows, (tr, row) => {
        tr.appendChild(td(row.path));
        tr.appendChild(td(fmtMs(row.p50), "num"));
        tr.appendChild(td(fmtMs(row.p95), "num"));
        tr.appendChild(td(fmtMs(row.p99), "num"));
        tr.appendChild(td(fmt(row.count), "num"));
        tr.appendChild(td(fmtPct(row.errorRate), "num"));
      });
    };
    renderSlowEndpoints();
    if (slowCheckbox) slowCheckbox.onchange = renderSlowEndpoints;
  });

  // Sankey User Flow + table fallback
  safeRender("User flow", () => {
    renderSankeyFlow(dashboard.charts.userFlow);
    renderTableRows("topNavBody", null, null, dashboard.charts.topNavigationPaths, (tr, row) => {
      tr.appendChild(td(row.from));
      tr.appendChild(td(row.to));
      tr.appendChild(td(fmt(row.count), "num"));
    });
  });

  // A/B Test Monitor
  safeRender("A/B tests", () => renderAbTests(dashboard.charts.abTests));

  // Peak Hours heatmap
  safeRender("Peak hours", () => renderPeakHours(dashboard.charts.peakHours));

  // Content Performance scoring
  safeRender("Content scoring", () => renderContentScoring(dashboard.charts.topNavigationPaths, dashboard.charts.topPages));

  // Campaigns & URL Parameters
  safeRender("Campaigns", () => {
    renderCampaignTable(dashboard.charts.campaignBreakdown);
    renderUrlParams(dashboard.charts.urlParams);
  });

  // Conversion Funnel
  safeRender("Funnel", () => renderFunnel(dashboard.charts.topNavigationPaths, dashboard.charts.topPages));

  // Traffic Sources
  safeRender("Referrers", () => renderReferrerChart(dashboard.charts.referrerSources));

  // Session Replay Timelines (Technical tab)
  safeRender("Session replays", () => renderSessionReplays(dashboard.charts.sessionReplays));

  // Readiness score
  safeRender("Readiness", () => renderReadinessScore(readinessScore, readiness));

  // First-run banner (B3): score + 1-2 quick wins above the tab bar.
  safeRender("FirstRunBanner", () => renderFirstRunBanner(readinessScore));

  // Show dashboard
  dashboardPanel.classList.remove("hidden");

  // Leaflet needs a valid container size to position markers correctly;
  // the panel was hidden during render so we must refresh now.
  if (geoMapInstance) {
    setTimeout(() => geoMapInstance.invalidateSize(), 50);
  }

  setStatus("Dashboard loaded.", "success");
}

/* ========== Progress indicator ========== */
function showProgress(label, pct) {
  progressPanel.classList.remove("hidden");
  progressLabel.textContent = label;
  progressPct.textContent = `${pct}%`;
  progressBar.style.width = `${pct}%`;
}

function hideProgress() {
  progressPanel.classList.add("hidden");
  progressBar.style.width = "0%";
}

function startFallbackProgress() {
  const stepLabels = [
    "Connecting...",
    "Checking access...",
    "Preparing data...",
    "Running analytics queries...",
    "Building dashboard...",
    "Finalizing...",
  ];
  let pct = 2;
  showProgress(stepLabels[0], pct);

  const timer = setInterval(() => {
    if (pct >= 90) return;
    if (pct < 20) pct += 3;
    else if (pct < 55) pct += 2;
    else pct += 1;
    pct = Math.min(pct, 90);
    const idx = Math.min(stepLabels.length - 1, Math.floor((pct / 90) * stepLabels.length));
    showProgress(stepLabels[idx], pct);
  }, 350);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}

/* ========== Dashboard loading (NDJSON stream with progress) ========== */
async function loadDashboardStream(url) {
  statusPanel.textContent = "";
  const fallbackProgress = startFallbackProgress();
  let hasLiveProgress = false;

  const streamUrl = `${url}${url.includes("?") ? "&" : "?"}_stream=${Date.now()}`;
  const response = await fetch(streamUrl, {
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Accept": "application/x-ndjson",
      "Cache-Control": "no-cache, no-store, max-age=0",
      "Pragma": "no-cache",
    },
  });

  if (!response.ok) {
    fallbackProgress.stop();
    hideProgress();
    const text = await response.text().catch(() => "");
    let data = {};
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    console.error("[loadDashboardStream] HTTP", response.status, text.slice(0, 500));
    const err = new Error(data.message || data.error || `Request failed (HTTP ${response.status})`);
    err.data = data;
    throw err;
  }

  const contentType = response.headers.get("content-type") || "";
  console.log("[loadDashboardStream] response OK, content-type:", contentType, "reading stream...");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  let chunkCount = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    chunkCount++;
    if (chunkCount <= 3) console.log("[stream] chunk", chunkCount, "length:", text.length, "preview:", text.slice(0, 120));
    buffer += text;

    let newlineIdx;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;

      try {
        const msg = JSON.parse(line);
        console.log("[stream] msg:", msg.type, msg.label || "");
        if (msg.type === "progress") {
          if (!hasLiveProgress) {
            hasLiveProgress = true;
            fallbackProgress.stop();
          }
          showProgress(msg.label, msg.pct);
        } else if (msg.type === "done") {
          result = msg;
        } else if (msg.type === "error") {
          fallbackProgress.stop();
          hideProgress();
          const err = new Error(msg.message || msg.error || "Pipeline error");
          err.data = msg;
          throw err;
        } else if (msg.dashboard) {
          // Fallback when the server returns classic JSON (non-stream response).
          result = msg;
        }
      } catch (e) {
        if (e.data) throw e;
        console.warn("[stream] parse error on line:", line.slice(0, 200));
      }
    }
  }

  // Parse any trailing buffered payload (e.g. classic JSON without newline).
  if (!result && buffer.trim()) {
    try {
      const tail = JSON.parse(buffer.trim());
      if (tail.type === "error") {
        const err = new Error(tail.message || tail.error || "Pipeline error");
        err.data = tail;
        throw err;
      }
      if (tail.type === "done" || tail.dashboard) {
        result = tail;
      }
    } catch (e) {
      if (e.data) throw e;
      console.warn("[stream] trailing payload parse error:", buffer.slice(0, 200));
    }
  }

  console.log("[loadDashboardStream] stream ended, chunks:", chunkCount, "hasResult:", !!result);
  fallbackProgress.stop();
  hideProgress();

  if (!result) {
    throw new Error("No data received from server");
  }
  return result;
}

async function loadDashboard(range) {
  try {
    const data = await loadDashboardStream(`/dashboard/overview?range=${range}&stream=1`);
    renderDashboard(data);
  } catch (error) {
    if (error.data && error.data.error === "RESOURCE_SELECTION_REQUIRED") {
      selectedResourceBar.classList.add("hidden");
      renderResources(error.data.resources || []);
      return;
    }
    console.error("[loadDashboard]", error);
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
  initSortableTable("campaignTable");

  // Check for OAuth redirect errors
  if (checkAuthError()) {
    connectButton.classList.remove("hidden");
    return;
  }

  const route = router.current;

  // Handle preview route without needing auth
  if (route.page === "preview") {
    await enterPreviewMode();
    return;
  }

  try {
    const session = await apiFetch("/auth/session");
    modeBadge.textContent = session.mode || "mock";

    if (!session.authenticated) {
      landingPage.classList.remove("hidden");
      statusPanel.textContent = "";
      if (route.page !== "home") router.replace({ page: "home" });

      if (session.mode === "real" && !session.oauthConfigured) {
        await showSetupInstructions();
      }
      connectButton.textContent = session.mode === "real" ? "Sign in with Microsoft" : "Connect Azure";
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

    // Route-driven initialization: try to restore state from URL
    if (route.page === "dashboard" && route.service) {
      const target = lastDiscoveredResources.find(
        (r) => r.appInsightsName === route.service
      );
      if (target) {
        // Select the resource from the URL if not already selected
        if (discovery.selectedResource !== route.service) {
          await apiFetch("/azure/select", {
            method: "POST",
            body: JSON.stringify({
              resourceId: target.resourceId,
              workspaceId: target.workspaceId,
              subscriptionId: target.subscriptionId,
              resourceGroup: target.resourceGroup,
              appInsightsName: target.appInsightsName,
            }),
          });
        }
        showSelectedResource(route.service);
        activateTab(route.tab, { updateUrl: false });
        router.replace({ page: "dashboard", service: route.service, tab: route.tab });
        await loadDashboard(rangeSelect.value);
        try {
          if (!localStorage.getItem("ea_onboarding_seen")) {
            onboardingBanner.classList.remove("hidden");
          }
        } catch {}
        return;
      }
      // Service from URL not found — fall through to normal discovery flow
    }

    if (route.page === "services" || (!discovery.autoSelected && discovery.resources?.length > 1)) {
      router.replace({ page: "services" });
      renderResources(discovery.resources);
    } else {
      const serviceName = discovery.autoSelected
        ? discovery.resources[0]?.appInsightsName
        : discovery.selectedResource;
      if (serviceName) {
        showSelectedResource(serviceName);
        router.replace({ page: "dashboard", service: serviceName, tab: "marketing" });
      }
      await loadDashboard(rangeSelect.value);

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

/* ========== Browser back/forward navigation ========== */
window.addEventListener("popstate", async () => {
  const route = router.current;

  if (route.page === "home") {
    if (isPreviewMode) {
      isPreviewMode = false;
      previewBanner.classList.add("hidden");
      dashboardPanel.classList.add("hidden");
      landingPage.classList.remove("hidden");
      connectButton.classList.remove("hidden");
      statusPanel.textContent = "";
    }
    return;
  }

  if (route.page === "preview") {
    await enterPreviewMode();
    return;
  }

  if (route.page === "services") {
    dashboardPanel.classList.add("hidden");
    selectedResourceBar.classList.add("hidden");
    if (lastDiscoveredResources.length > 0) {
      renderResources(lastDiscoveredResources);
    }
    return;
  }

  if (route.page === "dashboard" && route.service) {
    resourcePanel.classList.add("hidden");
    previewBanner.classList.add("hidden");
    landingPage.classList.add("hidden");
    isPreviewMode = false;
    activateTab(route.tab, { updateUrl: false });
    const currentName = selectedResourceName.textContent;
    if (currentName !== route.service) {
      const target = lastDiscoveredResources.find((r) => r.appInsightsName === route.service);
      if (target) {
        await apiFetch("/azure/select", {
          method: "POST",
          body: JSON.stringify({
            resourceId: target.resourceId,
            workspaceId: target.workspaceId,
            subscriptionId: target.subscriptionId,
            resourceGroup: target.resourceGroup,
            appInsightsName: target.appInsightsName,
          }),
        });
        showSelectedResource(route.service);
        dashboardPanel.classList.remove("hidden");
        await loadDashboard(rangeSelect.value);
      }
    }
  }
});

init();
