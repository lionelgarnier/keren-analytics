const connectButton = document.getElementById("connectButton");
const logoutButton = document.getElementById("logoutButton");
const statusPanel = document.getElementById("statusPanel");
const resourcePanel = document.getElementById("resourcePanel");
const resourceList = document.getElementById("resourceList");
const dashboardPanel = document.getElementById("dashboardPanel");
const readinessPanel = document.getElementById("readinessPanel");
const rangeSelect = document.getElementById("rangeSelect");
const selectedResourceBar = document.getElementById("selectedResourceBar");
const selectedResourceName = document.getElementById("selectedResourceName");
const changeResourceButton = document.getElementById("changeResourceButton");

// Track discovered resources for re-display
let lastDiscoveredResources = [];

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

changeResourceButton.addEventListener("click", async () => {
  // Clear selection on server
  try {
    await apiFetch("/azure/select/clear", { method: "POST" });
  } catch { /* ignore */ }
  // Hide dashboard, show resource picker
  dashboardPanel.classList.add("hidden");
  readinessPanel.classList.add("hidden");
  selectedResourceBar.classList.add("hidden");
  if (lastDiscoveredResources.length > 0) {
    renderResources(lastDiscoveredResources);
  } else {
    // Re-discover
    try {
      const discovery = await apiFetch("/azure/discover");
      lastDiscoveredResources = discovery.resources || [];
      renderResources(lastDiscoveredResources);
    } catch (error) {
      setStatus(error.message || "Unable to load resources.", "error");
    }
  }
});

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Build a user-friendly error message with details
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

function setStatus(message, variant = "info") {
  statusPanel.textContent = message;
  statusPanel.className = `panel ${variant}`;
}

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

    const telDiv = document.createElement("div");
    telDiv.textContent = `Last telemetry: ${resource.lastTelemetryAt || "unknown"}`;
    card.appendChild(telDiv);

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
      showSelectedResource(resource.appInsightsName);
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

  // Render Top Pages table safely (no innerHTML with user data)
  topPagesTable.innerHTML = "";
  dashboard.charts.topPages.forEach((row) => {
    const tr = document.createElement("tr");

    const pathTd = document.createElement("td");
    pathTd.textContent = row.path;
    tr.appendChild(pathTd);

    const viewsTd = document.createElement("td");
    viewsTd.textContent = String(row.views);
    tr.appendChild(viewsTd);

    const shareTd = document.createElement("td");
    shareTd.textContent = `${(row.share * 100).toFixed(1)}%`;
    tr.appendChild(shareTd);

    topPagesTable.appendChild(tr);
  });

  // Render Top Navigation Paths table safely
  topNavTable.innerHTML = "";
  dashboard.charts.topNavigationPaths.forEach((row) => {
    const tr = document.createElement("tr");

    const fromTd = document.createElement("td");
    fromTd.textContent = row.from;
    tr.appendChild(fromTd);

    const toTd = document.createElement("td");
    toTd.textContent = row.to;
    tr.appendChild(toTd);

    const countTd = document.createElement("td");
    countTd.textContent = String(row.count);
    tr.appendChild(countTd);

    topNavTable.appendChild(tr);
  });

  // Render browser list safely
  browserList.innerHTML = "";
  dashboard.charts.browsers.forEach((row) => {
    const li = document.createElement("li");
    li.textContent = `${row.name}: ${row.count}`;
    browserList.appendChild(li);
  });

  // Render OS list safely
  osList.innerHTML = "";
  dashboard.charts.os.forEach((row) => {
    const li = document.createElement("li");
    li.textContent = `${row.name}: ${row.count}`;
    osList.appendChild(li);
  });

  // Render device list safely
  deviceList.innerHTML = "";
  dashboard.charts.devices.forEach((row) => {
    const li = document.createElement("li");
    li.textContent = `${row.name}: ${row.count}`;
    deviceList.appendChild(li);
  });

  readinessStatus.textContent = `Status: ${readiness.overallStatus} (confidence ${(readiness.confidence * 100).toFixed(
    0
  )}%)`;

  // Render readiness actions safely
  readinessActions.innerHTML = "";
  readiness.recommendedActions
    .slice(0, 3)
    .forEach((action) => {
      const li = document.createElement("li");
      li.textContent = action.title;
      readinessActions.appendChild(li);
    });

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
      selectedResourceBar.classList.add("hidden");
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
    lastDiscoveredResources = discovery.resources || [];
    if (!discovery.autoSelected && discovery.resources?.length > 1) {
      renderResources(discovery.resources);
    } else {
      // Show the auto-selected resource name
      if (discovery.autoSelected && discovery.resources?.length === 1) {
        showSelectedResource(discovery.resources[0].appInsightsName);
      } else if (discovery.selectedResource) {
        showSelectedResource(discovery.selectedResource);
      }
      await loadDashboard(rangeSelect.value);
    }
  } catch (error) {
    setStatus(error.message || "Unable to initialize.");
  }
}

init();
