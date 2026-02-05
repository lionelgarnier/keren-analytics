const connectButton = document.getElementById("connectButton");
const logoutButton = document.getElementById("logoutButton");
const statusPanel = document.getElementById("statusPanel");
const resourcePanel = document.getElementById("resourcePanel");
const resourceList = document.getElementById("resourceList");
const dashboardPanel = document.getElementById("dashboardPanel");
const readinessPanel = document.getElementById("readinessPanel");
const rangeSelect = document.getElementById("rangeSelect");

const kpiVisitors = document.getElementById("kpiVisitors");
const kpiSessions = document.getElementById("kpiSessions");
const kpiAvg = document.getElementById("kpiAvg");
const kpiErrors = document.getElementById("kpiErrors");

const topPagesTable = document.getElementById("topPagesTable");
const topNavTable = document.getElementById("topNavTable");
const browserList = document.getElementById("browserList");
const osList = document.getElementById("osList");
const deviceList = document.getElementById("deviceList");

const readinessStatus = document.getElementById("readinessStatus");
const readinessActions = document.getElementById("readinessActions");

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

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed");
    error.data = data;
    throw error;
  }
  return data;
}

function setStatus(message, variant = "info") {
  statusPanel.textContent = message;
  statusPanel.className = `panel ${variant}`;
}

function renderResources(resources) {
  resourceList.innerHTML = "";
  resources.forEach((resource) => {
    const card = document.createElement("div");
    card.className = "resource-card";
    card.innerHTML = `
      <strong>${resource.appInsightsName}</strong>
      <div>Subscription: ${resource.subscriptionId}</div>
      <div>Workspace: ${resource.workspaceId}</div>
      <div>Last telemetry: ${resource.lastTelemetryAt || "unknown"}</div>
    `;
    const button = document.createElement("button");
    button.className = "primary";
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
      await loadDashboard(rangeSelect.value);
    });
    card.appendChild(button);
    resourceList.appendChild(card);
  });
  resourcePanel.classList.remove("hidden");
}

function renderDashboard(data) {
  const dashboard = data.dashboard;
  const readiness = data.readiness;

  kpiVisitors.textContent = dashboard.kpis.uniqueVisitors ?? "-";
  kpiSessions.textContent = dashboard.kpis.sessions ?? "-";
  kpiAvg.textContent = Math.round(dashboard.kpis.avgResponseTimeMs || 0);
  kpiErrors.textContent = `${((dashboard.kpis.errorRate || 0) * 100).toFixed(2)}%`;

  topPagesTable.innerHTML = dashboard.charts.topPages
    .map(
      (row) =>
        `<tr><td>${row.path}</td><td>${row.views}</td><td>${(row.share * 100).toFixed(1)}%</td></tr>`
    )
    .join("");

  topNavTable.innerHTML = dashboard.charts.topNavigationPaths
    .map((row) => `<tr><td>${row.from}</td><td>${row.to}</td><td>${row.count}</td></tr>`)
    .join("");

  browserList.innerHTML = dashboard.charts.browsers
    .map((row) => `<li>${row.name}: ${row.count}</li>`)
    .join("");
  osList.innerHTML = dashboard.charts.os
    .map((row) => `<li>${row.name}: ${row.count}</li>`)
    .join("");
  deviceList.innerHTML = dashboard.charts.devices
    .map((row) => `<li>${row.name}: ${row.count}</li>`)
    .join("");

  readinessStatus.textContent = `Status: ${readiness.overallStatus} (confidence ${(readiness.confidence * 100).toFixed(
    0
  )}%)`;
  readinessActions.innerHTML = readiness.recommendedActions
    .slice(0, 3)
    .map((action) => `<li>${action.title}</li>`)
    .join("");

  dashboardPanel.classList.remove("hidden");
  readinessPanel.classList.remove("hidden");
  setStatus("Dashboard ready.");
}

async function loadDashboard(range) {
  setStatus("Loading dashboard...");
  try {
    const data = await apiFetch(`/dashboard/overview?range=${range}`);
    renderDashboard(data);
  } catch (error) {
    if (error.data && error.data.error === "RESOURCE_SELECTION_REQUIRED") {
      renderResources(error.data.resources || []);
      return;
    }
    setStatus(error.message || "Unable to load dashboard.", "error");
  }
}

async function init() {
  setStatus("Checking session...");
  try {
    const session = await apiFetch("/auth/session");
    if (!session.authenticated) {
      setStatus("Connect your Azure tenant to begin.");
      connectButton.classList.remove("hidden");
      return;
    }
    connectButton.classList.add("hidden");
    logoutButton.classList.remove("hidden");

    const discovery = await apiFetch("/azure/discover");
    if (!discovery.autoSelected && discovery.resources?.length > 1) {
      renderResources(discovery.resources);
    } else {
      await loadDashboard(rangeSelect.value);
    }
  } catch (error) {
    setStatus(error.message || "Unable to initialize.");
  }
}

init();
