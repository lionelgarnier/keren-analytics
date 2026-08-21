/* ========== DOM References ========== */
const connectButton = document.getElementById("connectButton");
const logoutButton = document.getElementById("logoutButton");
const statusPanel = document.getElementById("statusPanel");
const resourcePanel = document.getElementById("resourcePanel");
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
let csrfToken = null;
/** Card names whose data arrived this load — drives the done-message safety net. */
const receivedCards = new Set();

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

/* Resolve a CSS color (hex or rgb[a]) to an rgba() string with the given alpha.
   Lets charts read D v2 tokens at render time instead of hardcoding hex. */
function colorWithAlpha(cssColor, alpha) {
  const c = (cssColor || "").trim();
  let r = 0, g = 0, b = 0;
  if (c.startsWith("#")) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split("").map((h) => h + h).join("");
    const n = parseInt(hex, 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    const m = c.match(/(\d+(?:\.\d+)?)/g);
    if (m && m.length >= 3) { r = +m[0]; g = +m[1]; b = +m[2]; }
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* D v2 chart palette: accent at descending opacity + success + warning, read
   from tokens so light/dark parity is free. Used for categorical charts. */
function chartPalette(n) {
  const accent = getCSSVar("--accent") || "#2563eb";
  const success = getCSSVar("--success") || "#16a34a";
  const warning = getCSSVar("--warning") || "#d97706";
  const muted = getCSSVar("--text-muted") || "#9ca3af";
  const base = [
    accent,
    success,
    warning,
    colorWithAlpha(accent, 0.65),
    colorWithAlpha(success, 0.6),
    colorWithAlpha(accent, 0.4),
    colorWithAlpha(warning, 0.55),
    muted,
  ];
  const out = [];
  for (let i = 0; i < n; i++) out.push(base[i % base.length]);
  return out;
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
  window.__setThemeColorMeta?.(next === "dark");
  applyChartThemeDefaults();
  updateSankeySVGColors();
}

function updateSankeySVGColors() {
  document.querySelectorAll(".flow-diagram svg text").forEach((t) => {
    const fs = t.getAttribute("font-size");
    t.setAttribute("fill", fs === "10" ? getCSSVar("--text-muted") : getCSSVar("--text-secondary"));
  });
}

document.querySelectorAll(".theme-toggle").forEach((b) => b.addEventListener("click", toggleTheme));

/* ========== Landing visibility (controls original navbar hide) ========== */
function setLandingActive(isActive) {
  document.body.classList.toggle("landing-active", isActive);
}

function showLanding() {
  landingPage.classList.remove("hidden");
  setLandingActive(true);
  setD2Route(false);
}

function hideLanding() {
  landingPage.classList.add("hidden");
  setLandingActive(false);
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  if (localStorage.getItem("theme")) return;
  if (e.matches) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  window.__setThemeColorMeta?.(e.matches);
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

/* ========== Tab Navigation ========== */
const tabs = document.querySelectorAll(".dash-subtab[data-tab]");

function activateTab(tabName, { updateUrl = true } = {}) {
  tabs.forEach((t) => {
    const isTarget = t.dataset.tab === tabName;
    t.classList.toggle("is-active", isTarget);
    t.setAttribute("aria-selected", isTarget ? "true" : "false");
  });
  document.querySelectorAll(".tab-content").forEach((tc) => tc.classList.remove("active"));
  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.add("active");

  updateDashScope(tabName);

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

/* ========== D v2 dashboard chrome ========== */

const RANGE_LABEL = { today: "today", "7d": "7d", "30d": "30d" };

// Bottom command bar scope: "<tab> · <range>" (+ filter suffix when active).
function updateDashScope(tabName) {
  const scope = document.getElementById("dashScope");
  if (!scope) return;
  const active = tabName || document.querySelector(".dash-subtab.is-active")?.dataset.tab || "marketing";
  const range = RANGE_LABEL[rangeSelect.value] || rangeSelect.value;
  let label = `${active} · ${range}`;
  if (activeFilters.length) {
    label += ` · filter: ${activeFilters.map((f) => f.value).join(", ")}`;
  }
  scope.textContent = label;
}

// Keep the segmented range control in sync with the hidden <select>.
function syncRangeButtons() {
  document.querySelectorAll(".dash-range-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.range === rangeSelect.value);
  });
}

document.querySelectorAll(".dash-range-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (rangeSelect.value === btn.dataset.range) return;
    rangeSelect.value = btn.dataset.range;
    syncRangeButtons();
    rangeSelect.dispatchEvent(new Event("change"));
  });
});

// "Change" returns to the service hub (reuses the existing clear-selection flow).
document.getElementById("dashChangeBtn")?.addEventListener("click", () => {
  changeResourceButton?.click();
});

/* ----- Refresh (R key / palette) ----- */
function refreshDashboard() {
  if (!isPreviewMode && router.current.page !== "dashboard") return;
  if (isPreviewMode) enterPreviewMode();
  else loadDashboard(rangeSelect.value);
}

function setDashRange(range) {
  if (!RANGE_LABEL[range] || rangeSelect.value === range) return;
  rangeSelect.value = range;
  syncRangeButtons();
  rangeSelect.dispatchEvent(new Event("change"));
}

/* ----- Export (⌘E / Export button) ----- */
// Serializes the aggregates currently on screen (no raw rows leave the server;
// lastDashboardData is the already-aggregated payload) to a JSON download.
function exportDashboard() {
  if (!lastDashboardData) {
    setStatus("Nothing to export yet — load a dashboard first.", "error");
    return;
  }
  const service = router.current.service || selectedResourceName?.textContent?.trim() || "service";
  const range = RANGE_LABEL[rangeSelect.value] || rangeSelect.value;
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = service.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "service";
  const payload = {
    exportedAt: new Date().toISOString(),
    service,
    range,
    data: lastDashboardData,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `keren-${slug}-${range}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus("Dashboard exported.", "success");
}

/* ----- Overlay body scroll lock -----
   iOS Safari ignores `overflow: hidden` on body for touch scrolling, so the
   page keeps moving under an open overlay. Pinning the body at its current
   offset is the technique that holds there; the counter keeps nested opens
   from unlocking early, and the saved offset is restored on the way out. */
let scrollLockCount = 0;
let scrollLockY = 0;

function lockScroll() {
  if (scrollLockCount++ > 0) return;
  scrollLockY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `${-scrollLockY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockScroll() {
  if (scrollLockCount === 0) return;
  if (--scrollLockCount > 0) return;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, scrollLockY);
}

/* ----- ⌘K command palette ----- */
const CMDK_COMMANDS = [
  { label: "Go to Marketing", hint: "tab", run: () => activateTab("marketing") },
  { label: "Go to Technical", hint: "tab", run: () => activateTab("technical") },
  { label: "Go to Readiness", hint: "tab", run: () => activateTab("readiness") },
  { label: "Range: Today", hint: "range", run: () => setDashRange("today") },
  { label: "Range: Last 7 days", hint: "range", run: () => setDashRange("7d") },
  { label: "Range: Last 30 days", hint: "range", run: () => setDashRange("30d") },
  { label: "Refresh data", hint: "R", run: () => refreshDashboard() },
  { label: "Clear all filters", hint: "filter", run: () => clearAllFilters() },
];

let cmdkActiveIdx = 0;
let cmdkMatches = [];

function cmdkEls() {
  return {
    modal: document.getElementById("dashCmdk"),
    input: document.getElementById("dashCmdkInput"),
    list: document.getElementById("dashCmdkList"),
  };
}

function renderCmdkList(query) {
  const { list } = cmdkEls();
  if (!list) return;
  const q = (query || "").trim().toLowerCase();
  cmdkMatches = q
    ? CMDK_COMMANDS.filter((c) => c.label.toLowerCase().includes(q))
    : CMDK_COMMANDS.slice();
  if (cmdkActiveIdx >= cmdkMatches.length) cmdkActiveIdx = 0;
  list.innerHTML = "";
  cmdkMatches.forEach((cmd, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `dash-cmdk-item${i === cmdkActiveIdx ? " is-active" : ""}`;
    item.innerHTML = `<span class="dash-cmdk-item-glyph">&rsaquo;</span><span>${escapeHtmlApp(cmd.label)}</span><span class="dash-cmdk-item-meta">${escapeHtmlApp(cmd.hint || "")}</span>`;
    item.addEventListener("mouseenter", () => { cmdkActiveIdx = i; updateCmdkActive(); });
    item.addEventListener("click", () => runCmdk(i));
    list.appendChild(item);
  });
}

function updateCmdkActive() {
  const { list } = cmdkEls();
  if (!list) return;
  [...list.children].forEach((el, i) => el.classList.toggle("is-active", i === cmdkActiveIdx));
}

function openCmdk() {
  const { modal, input } = cmdkEls();
  if (!modal || !modal.classList.contains("hidden")) return;
  cmdkActiveIdx = 0;
  renderCmdkList("");
  modal.classList.remove("hidden");
  lockScroll();
  if (input) { input.value = ""; input.focus(); }
}

// Escape closes both overlays blind, so unlock only when this one was open —
// otherwise the shared counter drifts and the page stays pinned.
function closeCmdk() {
  const { modal } = cmdkEls();
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  unlockScroll();
}

function runCmdk(idx) {
  const cmd = cmdkMatches[idx];
  closeCmdk();
  if (cmd) cmd.run();
}

document.getElementById("dashCmdkBtn")?.addEventListener("click", openCmdk);
document.getElementById("dashExportBtn")?.addEventListener("click", exportDashboard);
cmdkEls().input?.addEventListener("input", (e) => { cmdkActiveIdx = 0; renderCmdkList(e.target.value); });
cmdkEls().input?.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); cmdkActiveIdx = Math.min(cmdkActiveIdx + 1, cmdkMatches.length - 1); updateCmdkActive(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); cmdkActiveIdx = Math.max(cmdkActiveIdx - 1, 0); updateCmdkActive(); }
  else if (e.key === "Enter") { e.preventDefault(); runCmdk(cmdkActiveIdx); }
});
document.querySelectorAll("#dashCmdk [data-cmdk-close]").forEach((el) =>
  el.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeCmdk(); })
);

/* ----- KPI drill drawer ----- */
function openDrill(title, rows) {
  const modal = document.getElementById("dashDrill");
  const titleEl = document.getElementById("dashDrillTitle");
  const body = document.getElementById("dashDrillBody");
  if (!modal || !body) return;
  if (titleEl) titleEl.textContent = title;
  body.innerHTML = "";
  rows.forEach((r) => {
    const section = document.createElement("div");
    section.className = "dash-drill-section";
    section.innerHTML = `<div class="dash-drill-section-h">${escapeHtmlApp(r.k)}</div><div class="dash-drill-val">${escapeHtmlApp(r.v)}</div>`;
    body.appendChild(section);
  });
  if (modal.classList.contains("hidden")) {
    modal.classList.remove("hidden");
    lockScroll();
  }
}

function closeDrill() {
  const modal = document.getElementById("dashDrill");
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  unlockScroll();
}

function wireKpiDrill(grid) {
  grid?.querySelectorAll(".dash-kpi-a").forEach((card) => {
    if (card.dataset.drillWired) return;
    card.dataset.drillWired = "1";
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const label = card.querySelector(".dash-kpi-a-label")?.textContent?.trim() || "Metric";
      const value = card.querySelector(".dash-kpi-a-value")?.textContent?.trim() || "—";
      const delta = card.querySelector(".dash-kpi-a-delta")?.textContent?.trim();
      const compare = card.querySelector(".dash-kpi-a-compare")?.textContent?.trim();
      const rows = [
        { k: "Current", v: value },
        { k: "Range", v: RANGE_LABEL[rangeSelect.value] || rangeSelect.value },
      ];
      if (delta) rows.push({ k: "Change", v: delta });
      if (compare) rows.push({ k: "vs previous", v: compare });
      openDrill(label, rows);
    });
  });
}

document.querySelectorAll("#dashDrill [data-drill-close]").forEach((el) => el.addEventListener("click", closeDrill));

/* ----- Global dashboard keyboard shortcuts ----- */
function inEditableTarget(e) {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

document.addEventListener("keydown", (e) => {
  const dashOpen = !dashboardPanel.classList.contains("hidden");
  const hubOpen = !resourcePanel.classList.contains("hidden");
  // ⌘K / Ctrl+K: toggles the palette on the dashboard, focuses the search on
  // the services hub.
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    if (dashOpen) {
      e.preventDefault();
      const open = !document.getElementById("dashCmdk")?.classList.contains("hidden");
      open ? closeCmdk() : openCmdk();
    } else if (hubOpen) {
      const search = resourcePanel.querySelector("#resourceSearchInput");
      if (search) { e.preventDefault(); search.focus(); search.select(); }
    }
    return;
  }
  // ⌘E / Ctrl+E exports the current dashboard aggregates.
  if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
    if (!dashOpen) return;
    e.preventDefault();
    exportDashboard();
    return;
  }
  if (e.key === "Escape") {
    closeCmdk();
    closeDrill();
    return;
  }
  if (!dashOpen || inEditableTarget(e)) return;
  if (e.key === "r" || e.key === "R") {
    e.preventDefault();
    refreshDashboard();
  } else if (e.key === "1") {
    e.preventDefault();
    setDashRange("today");
  } else if (e.key === "7") {
    e.preventDefault();
    setDashRange("7d");
  } else if (e.key === "3") {
    e.preventDefault();
    setDashRange("30d");
  }
});

/* ========== Events ========== */
connectButton.addEventListener("click", () => {
  window.location.href = "/auth/login";
});

async function logout() {
  // A failed destroy still means the user asked to leave: land them on the
  // public page rather than leaving them on a dashboard with no feedback.
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    // Session may survive server-side; the redirect below re-checks auth.
  }
  window.location.href = "/";
}

logoutButton.addEventListener("click", logout);

const ACCOUNT_MENU_ITEMS = [
  { label: "Docs", href: "/docs" },
  { label: "Logout", onSelect: logout },
];

// Lightweight confirm dialog. Resolves true on confirm, false on cancel/Esc/
// outside-click. Built on demand (no static markup), CSP-safe (no inline JS).
function krConfirm({ title, body, confirmText = "Continue", cancelText = "Cancel" }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "kr-confirm-scrim";
    overlay.innerHTML = `
      <div class="kr-confirm" role="dialog" aria-modal="true" aria-labelledby="krConfirmTitle">
        <h3 id="krConfirmTitle" class="kr-confirm-title"></h3>
        <p class="kr-confirm-body"></p>
        <div class="kr-confirm-actions">
          <button type="button" class="kr-confirm-cancel"></button>
          <button type="button" class="kr-confirm-ok"></button>
        </div>
      </div>`;
    overlay.querySelector(".kr-confirm-title").textContent = title;
    overlay.querySelector(".kr-confirm-body").textContent = body;
    const cancelBtn = overlay.querySelector(".kr-confirm-cancel");
    const okBtn = overlay.querySelector(".kr-confirm-ok");
    cancelBtn.textContent = cancelText;
    okBtn.textContent = confirmText;

    function close(result) {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === "Escape") close(false);
    }
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
    cancelBtn.addEventListener("click", () => close(false));
    okBtn.addEventListener("click", () => close(true));
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    okBtn.focus();
  });
}

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
  try {
    const resp = await apiFetch("/api/setup/services");
    renderResources(resp.services || []);
  } catch (error) {
    setStatus(error.message || "Unable to load resources.", "error");
  }
});

/* ========== Landing page events ========== */
document.getElementById("landingConnectBtn")?.addEventListener("click", () => {
  window.location.href = "/auth/login";
});

document.getElementById("landingPreviewBtn")?.addEventListener("click", () => {
  enterPreviewMode();
});

document.getElementById("heroOpenDemoBtn")?.addEventListener("click", () => {
  enterPreviewMode();
});

document.getElementById("ctaOpenDemoBtn")?.addEventListener("click", () => {
  enterPreviewMode();
});

document.getElementById("ctaDockerCopyBtn")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText("docker compose up");
    btn.textContent = "Copied!";
  } catch {
    btn.textContent = "Copy failed";
  }
  setTimeout(() => { btn.textContent = original; }, 1500);
});

document.getElementById("previewConnectBtn").addEventListener("click", () => {
  window.location.href = "/auth/login";
});

document.getElementById("previewExitBtn").addEventListener("click", () => {
  exitPreviewMode();
});

async function loadStargazers() {
  const countEl = document.getElementById("lv2StarsCount");
  if (!countEl) return;
  try {
    const resp = await fetch("https://api.github.com/repos/lionelgarnier/keren-analytics", {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (typeof data.stargazers_count === "number") {
        countEl.textContent = data.stargazers_count.toLocaleString();
        // Only reveal the count once we have a real number from GitHub — never
        // show a fabricated fallback (the span ships empty on purpose).
        countEl.classList.add("is-loaded");
      }
    }
  } catch { /* leave the counter hidden rather than show a fake number */ }
}

document.getElementById("onboardingDismiss").addEventListener("click", () => {
  onboardingBanner.classList.add("hidden");
  try { localStorage.setItem("ea_onboarding_seen", "1"); } catch {}
});

async function enterPreviewMode() {
  isPreviewMode = true;
  hideLanding();
  connectButton.classList.add("hidden");
  previewBanner.classList.remove("hidden");
  setD2Route(true);
  dashboardPanel.classList.remove("hidden");
  if (router.current.page === "preview") {
    router.replace({ page: "preview" });
  } else {
    router.push({ page: "preview" });
  }
  try {
    showAllSkeletons();
    const data = await loadDashboardStream(`/preview/dashboard?range=${rangeSelect.value}&stream=1`);
    renderDashboard(data);
    setStatus("Preview loaded -- sample data.", "success");
  } catch (error) {
    clearAllSkeletons();
    setStatus(error.message || "Unable to load preview.", "error");
  }
}

function exitPreviewMode() {
  isPreviewMode = false;
  previewBanner.classList.add("hidden");
  dashboardPanel.classList.add("hidden");
  setD2Route(false);
  showLanding();
  connectButton.classList.remove("hidden");
  statusPanel.textContent = "";
  router.push({ page: "home" });
}

/* ========== API ========== */
async function apiFetch(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (method !== "GET" && method !== "HEAD" && csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  // Spread options FIRST, then apply the computed headers/credentials/cache —
  // otherwise `...options` re-spreads options.headers over our merged headers
  // and drops the X-CSRF-Token (and could override credentials/cache).
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers,
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
  // Mirror the service name into the D v2 dashboard header + breadcrumb.
  const h1 = document.getElementById("dashServiceName");
  const crumb = document.getElementById("dashBreadcrumbName");
  if (h1) h1.textContent = name;
  if (crumb) crumb.textContent = name;
}

/** POST /azure/select for a resource — shared by the hub cards and the
 *  init() deep-link / single-resource paths. */
function selectResourceApi(resource) {
  return apiFetch("/azure/select", {
    method: "POST",
    body: JSON.stringify({
      resourceId: resource.resourceId,
      workspaceId: resource.workspaceId,
      subscriptionId: resource.subscriptionId,
      resourceGroup: resource.resourceGroup,
      appInsightsName: resource.appInsightsName,
    }),
  });
}

function maybeShowOnboarding() {
  try {
    if (!localStorage.getItem("ea_onboarding_seen")) {
      onboardingBanner.classList.remove("hidden");
    }
  } catch { /* localStorage unavailable */ }
}

// Per-status presentation for the service hub cards.
const SERVICE_STATUS_META = {
  ready:        { label: "Ready",                    action: "Open" },
  incomplete:   { label: "Setup incomplete",         action: "Resume setup" },
  unconfigured: { label: "Not configured",           action: "Configure" },
};

/**
 * Select a resource then route to its dashboard or the setup wizard.
 * `destination` is "dashboard" for a ready service, "setup" otherwise.
 */
async function gotoService(resource, card, destination) {
  card.style.opacity = "0.6";
  card.style.pointerEvents = "none";
  setStatus(`Connecting to ${resource.appInsightsName}…`);
  try {
    await selectResourceApi(resource);
    if (destination === "setup") {
      window.location.href = "/setup";
      return;
    }
    resourcePanel.classList.add("hidden");
    setD2Route(true);
    showSelectedResource(resource.appInsightsName);
    router.push({ page: "dashboard", service: resource.appInsightsName, tab: "marketing" });
    await loadDashboard(rangeSelect.value);
  } catch (err) {
    card.style.opacity = "";
    card.style.pointerEvents = "";
    setStatus(err.message || "Selection failed.", "error");
  }
}

/* ========== Service switcher (dashboard header, in-place switch) ========== */

// Switch the dashboard to another service without leaving the page. A ready
// service loads its dashboard in place; an unconfigured/incomplete one routes
// to setup (no saved config to lose there, so no extra confirmation needed).
function switchService(resource) {
  const status = SERVICE_STATUS_META[resource.status] ? resource.status : "unconfigured";
  if (status !== "ready") {
    selectResourceApi(resource)
      .then(() => { window.location.href = "/setup"; })
      .catch((err) => setStatus(err.message || "Selection failed.", "error"));
    return;
  }
  setStatus(`Connecting to ${resource.appInsightsName}…`);
  selectResourceApi(resource)
    .then(() => {
      resourcePanel.classList.add("hidden");
      setD2Route(true);
      showSelectedResource(resource.appInsightsName);
      router.push({ page: "dashboard", service: resource.appInsightsName, tab: "marketing" });
      return loadDashboard(rangeSelect.value);
    })
    .catch((err) => setStatus(err.message || "Selection failed.", "error"));
}

(function initServiceSwitcher() {
  const trigger = document.getElementById("svcSwitchBtn");
  const menu = document.getElementById("svcSwitchMenu");
  if (!trigger || !menu) return;

  const STATUS_DOT = { ready: "is-ready", incomplete: "is-incomplete", unconfigured: "" };
  let focusIdx = -1;

  const itemsEls = () => [...menu.querySelectorAll(".svc-switch-item")];

  function buildMenu(filter = "") {
    const resources = lastDiscoveredResources || [];
    const current = (selectedResourceName.textContent || "").trim();
    const f = filter.trim().toLowerCase();
    const matches = resources.filter(
      (r) =>
        !f ||
        (r.appInsightsName || "").toLowerCase().includes(f) ||
        (r.resourceGroup || "").toLowerCase().includes(f)
    );
    const showFilter = resources.length > 7;

    const rows = matches
      .map((r) => {
        const env = detectEnvironment(r);
        const status = SERVICE_STATUS_META[r.status] ? r.status : "unconfigured";
        const isCurrent = r.appInsightsName === current;
        const envBadge = env.short ? `<span class="svc-switch-env">${escapeHtmlApp(env.short)}</span>` : "";
        const check = isCurrent
          ? '<svg class="svc-switch-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>'
          : "";
        return `<button type="button" class="svc-switch-item${isCurrent ? " is-current" : ""}" role="option" aria-selected="${isCurrent}" data-name="${escapeHtmlApp(r.appInsightsName)}">
            <span class="svc-switch-dot ${STATUS_DOT[status]}"></span>
            <span class="svc-switch-name">${escapeHtmlApp(r.appInsightsName)}</span>
            ${envBadge}${check}
          </button>`;
      })
      .join("");

    menu.innerHTML = `
      ${showFilter ? '<input type="text" class="svc-switch-filter" id="svcSwitchFilter" placeholder="Filter services…" autocomplete="off" />' : ""}
      <div class="svc-switch-list">${rows || '<div class="svc-switch-empty">No services match.</div>'}</div>
      <div class="svc-switch-foot"><a href="/services">Manage all services →</a></div>`;

    itemsEls().forEach((el) => {
      el.addEventListener("click", () => {
        const r = (lastDiscoveredResources || []).find((x) => x.appInsightsName === el.dataset.name);
        close();
        if (r) switchService(r);
      });
    });
    const filterEl = menu.querySelector("#svcSwitchFilter");
    if (filterEl) {
      filterEl.addEventListener("input", () => {
        buildMenu(filterEl.value);
        const again = menu.querySelector("#svcSwitchFilter");
        if (again) { again.value = filterEl.value; again.focus(); }
      });
    }
    focusIdx = -1;
  }

  function open() {
    buildMenu();
    menu.classList.remove("hidden");
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("keydown", onKey);
    setTimeout(() => document.addEventListener("click", onOutside), 0);
    const filterEl = menu.querySelector("#svcSwitchFilter");
    if (filterEl) filterEl.focus();
  }
  function close() {
    menu.classList.add("hidden");
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("click", onOutside);
  }
  function onOutside(e) {
    if (!menu.contains(e.target) && !trigger.contains(e.target)) close();
  }
  function setFocus(i) {
    const els = itemsEls();
    if (!els.length) return;
    focusIdx = (i + els.length) % els.length;
    els.forEach((el, idx) => el.classList.toggle("is-focus", idx === focusIdx));
    els[focusIdx].scrollIntoView({ block: "nearest" });
  }
  function onKey(e) {
    if (e.key === "Escape") { close(); trigger.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setFocus(focusIdx + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocus(focusIdx - 1); }
    else if (e.key === "Enter" && focusIdx >= 0) { e.preventDefault(); itemsEls()[focusIdx]?.click(); }
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.classList.contains("hidden")) open();
    else close();
  });
})();

/* ========== D v2 service hub ========== */

// Toggle the operator-console chrome (topbar replaces .navbar, full-bleed
// container) for the /services route. The dashboard keeps .navbar.
function setD2Route(active) {
  document.body.classList.toggle("d2-route", active);
}

// Pure-CSS sparkline bar heights (0-100). Each status reads differently:
// ready rises, incomplete spikes, unconfigured is a flat placeholder. Defaults
// to 7 bars to match the real 7-day traffic sparkline (one bar per day) that
// loadServiceTraffic swaps in for configured cards — keeps placeholder and real
// bars visually consistent (same count, same width).
function barHeights(kind, n = 7) {
  const seed = kind.length;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    let v;
    if (kind === "rising") v = 28 + t * 62 + Math.sin(i + seed) * 8;
    else if (kind === "flat") v = 52 + Math.sin(i + seed) * 14;
    else if (kind === "spiky") v = 28 + Math.abs(Math.sin(i * 0.9 + seed)) * 64;
    else if (kind === "placeholder") v = 8 + (i % 3) * 4;
    else v = 50;
    return Math.max(6, Math.min(96, v));
  });
}

const D2_SPARK_KIND = { ready: "rising", incomplete: "spiky", unconfigured: "placeholder" };
const D2_CTA_CLASS = { ready: "", incomplete: " is-warn", unconfigured: " is-mute" };

// Map real per-day traffic counts to sparkline bar heights (6-96%), normalized
// to the series max so the busiest day reads as full-height.
function trafficBarHeights(points) {
  const max = Math.max(1, ...points);
  return points.map((v) => Math.max(6, Math.min(96, Math.round((v / max) * 96))));
}

function formatTrafficTotal(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

// Off the critical render path: the hub is already painted with placeholder
// bars (barHeights), so this fetches real per-resource traffic and swaps the
// bars + total in for the configured cards once it resolves. Any resource
// missing from the response (query failed, or not configured) silently keeps
// its placeholder — never blocks or breaks the hub.
async function loadServiceTraffic(panel) {
  const readyCards = panel.querySelectorAll(".d2-rescard--ready");
  if (readyCards.length === 0) return;
  let resp;
  try {
    resp = await apiFetch("/api/setup/services/traffic");
  } catch {
    return;
  }
  const traffic = resp?.traffic || {};
  readyCards.forEach((card) => {
    const data = traffic[card.dataset.resourceId];
    if (!data || !Array.isArray(data.points) || data.points.length === 0) return;
    const sparkEl = card.querySelector(".d2-spark");
    const valEl = card.querySelector(".d2-spark-val");
    if (sparkEl) {
      sparkEl.innerHTML = trafficBarHeights(data.points)
        .map((h) => `<span class="d2-spark-bar" style="height:${h}%"></span>`)
        .join("");
    }
    if (valEl) valEl.textContent = formatTrafficTotal(data.total || 0);
  });
}

const D2_THEME_TOGGLE_SVG =
  '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
  '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

// Inject the topbar theme-toggle icons (markup ships empty). The global
// ".theme-toggle" click binding already wires toggleTheme.
const dashThemeToggleEl = document.getElementById("dashThemeToggle");
if (dashThemeToggleEl) dashThemeToggleEl.innerHTML = D2_THEME_TOGGLE_SVG;

// The dashboard topbar is static markup, so one bind at boot is enough.
window.initAvatarMenu?.(document.getElementById("dashAvatarBtn"), ACCOUNT_MENU_ITEMS);

// Bucket detectEnvironment()'s css class into a D v2 chip filter key.
function d2EnvKey(env) {
  if (env.css === "env-prod") return "prod";
  if (env.css === "env-staging") return "staging";
  if (env.css === "env-dev") return "dev";
  return "other";
}

// Shared HTML escaper (defined in escapeHtml.js, loaded before this script).
// Kept under the local name so existing call sites don't change.
const escapeHtmlApp = window.escapeHtml;

/* ===== Configure split-button: AI mode choice + data disclosure ===== */

// Deployment-global AI disclosure (provider, region, what's sent / never
// sent). Fetched once and cached — only the per-resource opt-out varies, and
// that's set explicitly when the user chooses, so we don't need it here.
let aiDisclosureCache = null;
async function getAiDisclosure() {
  if (aiDisclosureCache) return aiDisclosureCache;
  aiDisclosureCache = await apiFetch("/api/ai/disclosure");
  return aiDisclosureCache;
}

// Record the AI choice for this resource, select it, then route to setup.
// optOut=false → the scan calls the configured provider; true → deterministic
// only, no outbound call. The choice is persisted so the scan stream (a
// separate request after navigation) honours it.
async function chooseConfigure(resource, optOut) {
  setStatus(`Connecting to ${resource.appInsightsName}…`);
  try {
    await apiFetch("/api/setup/ai-preference", {
      method: "POST",
      body: JSON.stringify({ resourceId: resource.resourceId, optOut }),
    });
    await selectResourceApi(resource);
    window.location.href = "/setup";
  } catch (err) {
    setStatus(err.message || "Could not save your choice.", "error");
  }
}

// Manual configuration: opt the resource out of AI (no outbound call, no wait),
// select it, then route to the setup wizard in manual mode — it scans, then
// lands straight in the mapping editor so the user maps fields by hand.
async function chooseManualConfigure(resource) {
  setStatus(`Connecting to ${resource.appInsightsName}…`);
  try {
    await apiFetch("/api/setup/ai-preference", {
      method: "POST",
      body: JSON.stringify({ resourceId: resource.resourceId, optOut: true }),
    });
    await selectResourceApi(resource);
    window.location.href = "/setup?mode=manual";
  } catch (err) {
    setStatus(err.message || "Could not start manual setup.", "error");
  }
}

// Configure with the default mode (the first available option — AI when a
// provider is wired, else deterministic). Same outcome as a plain card click,
// but explicit so the persisted preference matches the advertised label.
async function chooseDefaultConfigure(resource) {
  let optOut = false;
  try {
    const d = await getAiDisclosure();
    optOut = Boolean(d.available?.[0]?.optOut);
  } catch { /* fall back to AI-on default */ }
  chooseConfigure(resource, optOut);
}

// Fill in each configure split-button's primary label with the default choice
// ("Configurer avec l'IA — Azure OpenAI" / "Configurer sans IA"). Async so the
// grid renders immediately; on failure the neutral placeholder stays.
async function applyConfigureLabels(root) {
  let disclosure;
  try { disclosure = await getAiDisclosure(); } catch { return; }
  const def = disclosure.available?.[0];
  if (!def) return;
  const suffix = def.optOut ? "without AI" : `with AI — ${def.provider}`;
  root.querySelectorAll("[data-ai-primary]").forEach((btn) => {
    const verb = btn.dataset.verb || "Configure";
    const labelEl = btn.querySelector(".d2-cfg-primary-label");
    if (labelEl) labelEl.textContent = `${verb} ${suffix}`;
  });
}

// Modal listing exactly what leaves the box and what never does, plus where
// the AI runs. Built on demand, CSP-safe (no inline JS), dismiss on
// Esc/outside-click — mirrors krConfirm.
function openAiDataPopover(disclosure) {
  const aiOption = (disclosure.available || []).find((o) => !o.optOut);
  const dest = aiOption
    ? `${escapeHtmlApp(aiOption.provider)}${aiOption.location ? ` · ${escapeHtmlApp(aiOption.location)}` : ""}`
    : "no AI configured";
  const list = (items) =>
    items.map((i) => `<li>${escapeHtmlApp(i)}</li>`).join("");
  const overlay = document.createElement("div");
  overlay.className = "kr-confirm-scrim";
  overlay.innerHTML = `
    <div class="ai-data-pop" role="dialog" aria-modal="true" aria-labelledby="aiDataPopTitle">
      <h3 id="aiDataPopTitle" class="ai-data-pop-title">What data is sent?</h3>
      <p class="ai-data-pop-dest">AI analysis: <strong>${dest}</strong>${aiOption && aiOption.outbound === false ? " (local, nothing leaves)" : ""}</p>
      <div class="ai-data-pop-cols">
        <div class="ai-data-pop-col ai-data-pop-col--sent">
          <h4>Sent (sanitized)</h4>
          <ul>${list(disclosure.dataContract?.sent || [])}</ul>
        </div>
        <div class="ai-data-pop-col ai-data-pop-col--never">
          <h4>Never sent</h4>
          <ul>${list(disclosure.dataContract?.never || [])}</ul>
        </div>
      </div>
      <p class="ai-data-pop-foot">Choosing "without AI" disables every outbound call for this resource.</p>
      <div class="ai-data-pop-actions">
        <button type="button" class="kr-confirm-ok ai-data-pop-close">Got it</button>
      </div>
    </div>`;
  function close() {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector(".ai-data-pop-close").addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  overlay.querySelector(".ai-data-pop-close").focus();
}

// Floating menu anchored to a card's caret: the configured AI provider(s)
// then "sans IA", then the data popover. Fixed-positioned off the button rect
// so it never clips inside the grid's overflow.
let openConfigMenuEl = null;
function closeConfigMenu() {
  if (openConfigMenuEl) {
    openConfigMenuEl.remove();
    openConfigMenuEl = null;
    document.removeEventListener("click", closeConfigMenu, { capture: true });
    document.removeEventListener("keydown", onConfigMenuKey);
    window.removeEventListener("scroll", closeConfigMenu);
  }
}
function onConfigMenuKey(e) { if (e.key === "Escape") closeConfigMenu(); }

async function openConfigureMenu(anchorBtn, resource) {
  if (openConfigMenuEl) { closeConfigMenu(); return; }
  let disclosure;
  try {
    disclosure = await getAiDisclosure();
  } catch (err) {
    setStatus(err.message || "Could not load AI options.", "error");
    return;
  }
  const menu = document.createElement("div");
  menu.className = "d2-cfg-menu";
  menu.setAttribute("role", "menu");

  for (const opt of disclosure.available || []) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "d2-cfg-item";
    item.setAttribute("role", "menuitem");
    const icon = opt.optOut ? "🔒" : (opt.outbound ? "⚡" : "🖥");
    const where = opt.location ? `<span class="d2-cfg-where">${escapeHtmlApp(opt.location)}</span>` : "";
    item.innerHTML = `
      <span class="d2-cfg-icon" aria-hidden="true">${icon}</span>
      <span class="d2-cfg-text">
        <span class="d2-cfg-label">${escapeHtmlApp(opt.label)}${opt.provider ? ` — ${escapeHtmlApp(opt.provider)}` : ""} ${where}</span>
        <span class="d2-cfg-detail">${escapeHtmlApp(opt.detail)}</span>
      </span>`;
    item.addEventListener("click", () => { closeConfigMenu(); chooseConfigure(resource, opt.optOut); });
    menu.appendChild(item);
  }

  // Manual configuration — distinct from the AI on/off options above: the user
  // maps the fields themselves in the editor (scan runs, no AI).
  const manual = document.createElement("button");
  manual.type = "button";
  manual.className = "d2-cfg-item";
  manual.setAttribute("role", "menuitem");
  manual.innerHTML = `
    <span class="d2-cfg-icon" aria-hidden="true">✎</span>
    <span class="d2-cfg-text">
      <span class="d2-cfg-label">Configure manually</span>
      <span class="d2-cfg-detail">Map fields by hand, without AI</span>
    </span>`;
  manual.addEventListener("click", () => { closeConfigMenu(); chooseManualConfigure(resource); });
  menu.appendChild(manual);

  const info = document.createElement("button");
  info.type = "button";
  info.className = "d2-cfg-item d2-cfg-info";
  info.setAttribute("role", "menuitem");
  info.innerHTML = `<span class="d2-cfg-icon" aria-hidden="true">ⓘ</span><span class="d2-cfg-text"><span class="d2-cfg-label">What data is sent?</span></span>`;
  info.addEventListener("click", () => { closeConfigMenu(); openAiDataPopover(disclosure); });
  menu.appendChild(info);

  document.body.appendChild(menu);
  const r = anchorBtn.getBoundingClientRect();
  // Prefer dropping below-right of the caret; flip up if it would overflow.
  menu.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - menu.offsetWidth - 12))}px`;
  const below = r.bottom + 6;
  menu.style.top = below + menu.offsetHeight > window.innerHeight
    ? `${Math.max(12, r.top - menu.offsetHeight - 6)}px`
    : `${below}px`;

  openConfigMenuEl = menu;
  anchorBtn.setAttribute("aria-expanded", "true");
  setTimeout(() => {
    document.addEventListener("click", closeConfigMenu, { capture: true });
    document.addEventListener("keydown", onConfigMenuKey);
    // The menu is fixed-positioned against the caret's coordinates, so it
    // drifts away from its button as soon as the page moves.
    window.addEventListener("scroll", closeConfigMenu, { once: true, passive: true });
  }, 0);
}

// Per-service Configuration control in the dashboard header. Primary action is
// the non-destructive "edit mapping"; the caret groups the rarer reconfigure
// (destructive) and the AI data/opt-out popover, so the header isn't cluttered
// and the destructive path stays behind a confirm. Reuses the hub's caret-menu
// chrome (closeConfigMenu / openConfigMenuEl / onConfigMenuKey).
function openDashboardConfigMenu(anchorBtn) {
  if (openConfigMenuEl) { closeConfigMenu(); return; }
  const menu = document.createElement("div");
  menu.className = "d2-cfg-menu";
  menu.setAttribute("role", "menu");

  const addItem = (icon, label, detail, onClick) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "d2-cfg-item";
    item.setAttribute("role", "menuitem");
    item.innerHTML = `
      <span class="d2-cfg-icon" aria-hidden="true">${icon}</span>
      <span class="d2-cfg-text">
        <span class="d2-cfg-label">${escapeHtmlApp(label)}</span>
        <span class="d2-cfg-detail">${escapeHtmlApp(detail)}</span>
      </span>`;
    item.addEventListener("click", () => { closeConfigMenu(); onClick(); });
    menu.appendChild(item);
  };

  addItem("✎", "Edit mapping", "Adjust how fields are mapped — without a re-scan.", () => {
    window.location.href = "/setup?mode=mapping";
  });
  addItem("⚠", "Reconfigure (re-scan + AI)", "Re-scans telemetry and re-runs the AI. Replaces the current configuration.", async () => {
    const ok = await krConfirm({
      title: "Reconfigure this service?",
      body: "This re-scans your telemetry and re-runs the AI mapping. This service's current configuration will be replaced. This cannot be undone.",
      confirmText: "Reconfigure",
      cancelText: "Cancel",
    });
    if (ok) window.location.href = "/setup";
  });
  addItem("ⓘ", "Data sent to the AI", "See what is sent / never sent, and choose without AI.", async () => {
    try { openAiDataPopover(await getAiDisclosure()); }
    catch (err) { setStatus(err.message || "Could not load AI options.", "error"); }
  });

  document.body.appendChild(menu);
  const r = anchorBtn.getBoundingClientRect();
  menu.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - menu.offsetWidth - 12))}px`;
  const below = r.bottom + 6;
  menu.style.top = below + menu.offsetHeight > window.innerHeight
    ? `${Math.max(12, r.top - menu.offsetHeight - 6)}px`
    : `${below}px`;

  openConfigMenuEl = menu;
  anchorBtn.setAttribute("aria-expanded", "true");
  setTimeout(() => {
    document.addEventListener("click", closeConfigMenu, { capture: true });
    document.addEventListener("keydown", onConfigMenuKey);
    // The menu is fixed-positioned against the caret's coordinates, so it
    // drifts away from its button as soon as the page moves.
    window.addEventListener("scroll", closeConfigMenu, { once: true, passive: true });
  }, 0);
}

document.getElementById("dashConfigPrimary")?.addEventListener("click", () => {
  window.location.href = "/setup?mode=mapping";
});
document.getElementById("dashConfigCaret")?.addEventListener("click", (e) => {
  e.stopPropagation();
  openDashboardConfigMenu(e.currentTarget);
});

function renderResources(resources) {
  lastDiscoveredResources = resources;
  statusPanel.textContent = "";
  setD2Route(true);

  const envOrder = { "env-prod": 0, "env-staging": 1, "env-dev": 2, "env-qa": 3, "env-default": 4 };
  const sorted = [...resources].sort((a, b) => {
    const ea = detectEnvironment(a), eb = detectEnvironment(b);
    const d = (envOrder[ea.css] ?? 4) - (envOrder[eb.css] ?? 4);
    return d !== 0 ? d : (a.appInsightsName || "").localeCompare(b.appInsightsName || "");
  });

  const counts = { all: sorted.length, prod: 0, staging: 0, dev: 0 };
  for (const r of sorted) {
    const key = d2EnvKey(detectEnvironment(r));
    if (key in counts) counts[key]++;
  }

  const chip = (key, label) =>
    `<button type="button" class="d2-chip${key === "all" ? " is-active" : ""}" data-env="${key}">${label} <span class="d2-chip-count">${counts[key]}</span></button>`;

  // Full operator-console shell, rebuilt each render. resourcePanel itself is
  // the full-height d2 column; topbar + body + command bar are its children.
  resourcePanel.className = "resource-panel d2-page";
  resourcePanel.innerHTML = `
    <div class="d2-topbar">
      <div class="d2-topbar-l">
        <span class="d2-mark">Keren<span class="d2-mark-dot">.</span></span>
        <div class="d2-tabs">
          <a class="d2-tab is-active" href="/services">Services</a>
        </div>
      </div>
      <div class="d2-topbar-r">
        <button type="button" id="d2ThemeToggle" class="theme-toggle" aria-label="Toggle dark mode" title="Toggle theme">${D2_THEME_TOGGLE_SVG}</button>
        <span class="d2-mark-tag" style="margin-left:0">⌘ K</span>
        <span class="d2-avatar-wrap"><button type="button" class="d2-avatar" aria-haspopup="menu" aria-expanded="false" aria-label="Account menu">··</button></span>
      </div>
    </div>
    <div class="d2-page-body">
      <div class="d2-pageheader">
        <div class="d2-pageheader-l">
          <div class="d2-breadcrumb">
            <span>keren</span>
            <span class="d2-breadcrumb-sep">/</span>
            <span class="d2-breadcrumb-here">services</span>
            <span class="d2-breadcrumb-tag">${counts.all} connected</span>
          </div>
          <h1 class="d2-h1">Services</h1>
          <p class="d2-sub">${counts.all} Application Insights workspace${counts.all === 1 ? "" : "s"}. Open a ready service or finish setting one up — Keren maps the schema, then the AI tells you what's renderable.</p>
        </div>
        <div class="d2-pageheader-r">
          <button type="button" class="d2-headeraction" id="d2FilterBtn">⌘K Filter</button>
          <button type="button" class="d2-headeraction d2-headeraction--accent" id="d2ConnectBtn">+ Connect workspace</button>
        </div>
      </div>
      <div class="d2-toolbar">
        <div class="d2-chips" id="d2Chips">
          ${chip("all", "All")}${chip("prod", "Prod")}${chip("staging", "Staging")}${chip("dev", "Dev")}
        </div>
        <div class="d2-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="resourceSearchInput" placeholder="Filter by name, workspace, group…" />
          <span class="d2-search-kbd">⌘K</span>
        </div>
      </div>
      <div class="d2-resgrid" id="resourceList"></div>
      <div id="resourceEmptySearch" class="resource-empty-search hidden"><p>No resources match your search.</p></div>
    </div>
    <div class="d2-cmdbar">
      <div class="d2-cmdbar-l">
        <span class="d2-cmdbar-status"><span class="d2-cmdbar-status-dot"></span>synced · ${new Date().toLocaleTimeString([], { hour12: false })}</span>
        <span class="d2-cmdbar-sep">·</span>
        <span>services · ${counts.all} node${counts.all === 1 ? "" : "s"}</span>
      </div>
      <div class="d2-cmdbar-r">
        <span class="d2-cmdbar-cell"><span class="d2-cmdbar-kbd">↑</span><span class="d2-cmdbar-kbd">↓</span>navigate</span>
        <span class="d2-cmdbar-cell"><span class="d2-cmdbar-kbd">↵</span>open</span>
        <span class="d2-cmdbar-cell"><span class="d2-cmdbar-kbd">⌘K</span>filter</span>
        <button type="button" class="d2-cmdbar-action" id="d2CmdConnectBtn">+ Connect workspace</button>
      </div>
    </div>
  `;

  const grid = resourcePanel.querySelector("#resourceList");
  const emptySearch = resourcePanel.querySelector("#resourceEmptySearch");
  const searchInput = resourcePanel.querySelector("#resourceSearchInput");

  sorted.forEach((resource) => {
    const env = detectEnvironment(resource);
    const wsName = extractWorkspaceName(resource.workspaceId);
    const status = SERVICE_STATUS_META[resource.status] ? resource.status : "unconfigured";
    const statusMeta = SERVICE_STATUS_META[status];
    const destination = status === "ready" ? "dashboard" : "setup";
    const envKey = d2EnvKey(env);

    const card = document.createElement("div");
    card.className = `d2-rescard d2-rescard--${status}`;
    card.dataset.env = envKey;
    card.dataset.resourceId = resource.resourceId;
    card.dataset.search = [resource.appInsightsName, resource.subscriptionId, resource.resourceGroup, wsName, env.label].join(" ").toLowerCase();

    const envBadge = env.short
      ? `<span style="opacity:0.5">·</span><span class="d2-env d2-env--${envKey}">${escapeHtmlApp(env.short)}</span>`
      : "";
    const bars = barHeights(D2_SPARK_KIND[status])
      .map((h) => `<span class="d2-spark-bar" style="height:${h}%"></span>`).join("");
    const sparkValClass = status === "unconfigured" ? "d2-spark-val d2-spark-val-mute" : "d2-spark-val";
    // Configure CTA is a split-button: the primary states the default choice
    // (e.g. "Configurer avec l'IA — Azure OpenAI", filled in by
    // applyConfigureLabels once the disclosure loads), the attached caret opens
    // the with/without-AI menu + data popover. On a ready card the open action
    // stays the card body; reconfigure is the (ghost) split.
    const aiCaret = `<button type="button" class="d2-cfg-caret" data-ai-menu aria-haspopup="menu" aria-expanded="false" aria-label="Choisir le mode IA">▾</button>`;
    const cta = status === "ready"
      ? `<span class="d2-cta-link${D2_CTA_CLASS[status]}">${escapeHtmlApp(statusMeta.action)} →</span>
         <div class="d2-cfg-split d2-cfg-split--ghost">
           <button type="button" class="d2-cfg-primary" data-reconfigure><span class="d2-cfg-primary-label">Reconfigure</span></button>
           ${aiCaret}
         </div>`
      : `<div class="d2-cfg-split">
           <button type="button" class="d2-cfg-primary" data-ai-primary data-verb="Configure">
             <span class="d2-cfg-primary-label">Configure…</span>
             <span class="d2-cfg-primary-kbd" aria-hidden="true">↵</span>
           </button>
           ${aiCaret}
         </div>`;

    card.innerHTML = `
      <div class="d2-rescard-head">
        <div>
          <div class="d2-rescard-name">${escapeHtmlApp(resource.appInsightsName)}</div>
          <div class="d2-rescard-sub">Application Insights ${envBadge}</div>
        </div>
        <span class="d2-statpill d2-statpill--${status}"><span class="d2-statpill-dot"></span>${escapeHtmlApp(statusMeta.label)}</span>
      </div>
      <div class="d2-spark-wrap">
        <div class="d2-spark-head"><span>Traffic · 7d</span><span class="${sparkValClass}">—</span></div>
        <div class="d2-spark">${bars}</div>
      </div>
      <div class="d2-tree">
        <div class="d2-tree-line"><span class="d2-tree-glyph">┌</span><span class="d2-tree-key">sub</span><span class="d2-tree-val d2-tree-val-mute" title="${escapeHtmlApp(resource.subscriptionId || "")}">${escapeHtmlApp(truncateGuid(resource.subscriptionId))}</span></div>
        <div class="d2-tree-line"><span class="d2-tree-glyph">├</span><span class="d2-tree-key">rg</span><span class="d2-tree-val" title="${escapeHtmlApp(resource.resourceGroup || "")}">${escapeHtmlApp(resource.resourceGroup || "—")}</span></div>
        <div class="d2-tree-line"><span class="d2-tree-glyph">└</span><span class="d2-tree-key">ws</span><span class="d2-tree-val" title="${escapeHtmlApp(resource.workspaceId || "")}">${escapeHtmlApp(wsName)}</span></div>
      </div>
      <div class="d2-cardcta${status === "ready" ? "" : " d2-cardcta--split"}">
        ${cta}
      </div>
    `;

    const reconfigureBtn = card.querySelector("[data-reconfigure]");
    if (reconfigureBtn) {
      reconfigureBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        gotoService(resource, card, "setup");
      });
    }
    // Primary on a non-ready card configures with the default mode (the same
    // mode its label advertises). Clicking the card body does the same.
    const primaryBtn = card.querySelector("[data-ai-primary]");
    if (primaryBtn) {
      primaryBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        chooseDefaultConfigure(resource);
      });
    }
    const aiMenuBtn = card.querySelector("[data-ai-menu]");
    if (aiMenuBtn) {
      aiMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openConfigureMenu(aiMenuBtn, resource);
      });
    }
    card.addEventListener("click", () => gotoService(resource, card, destination));
    grid.appendChild(card);
  });

  // Label the configure split-buttons with the default choice once the
  // (deployment-global) disclosure resolves — keeps render synchronous and
  // works for every renderResources call site.
  applyConfigureLabels(resourcePanel);

  // Real traffic sparklines for configured cards — fired after the synchronous
  // render so the hub paints instantly and bars fill in when the (cached,
  // parallelized) per-resource queries resolve.
  loadServiceTraffic(resourcePanel);

  // Filter state: active env chip + free-text search, combined.
  let activeEnv = "all";
  const applyFilter = () => {
    const q = (searchInput.value || "").toLowerCase();
    let visible = 0;
    grid.querySelectorAll(".d2-rescard").forEach((c) => {
      const envOk = activeEnv === "all" || c.dataset.env === activeEnv;
      const textOk = !q || (c.dataset.search || "").includes(q);
      const match = envOk && textOk;
      c.style.display = match ? "" : "none";
      if (match) visible++;
    });
    if (emptySearch) emptySearch.classList.toggle("hidden", visible > 0);
  };
  searchInput.addEventListener("input", applyFilter);
  resourcePanel.querySelector("#d2FilterBtn")?.addEventListener("click", () => {
    searchInput.focus();
    searchInput.select();
  });
  resourcePanel.querySelectorAll(".d2-chip").forEach((c) => {
    c.addEventListener("click", () => {
      activeEnv = c.dataset.env;
      resourcePanel.querySelectorAll(".d2-chip").forEach((x) => x.classList.toggle("is-active", x === c));
      applyFilter();
    });
  });

  // Theme toggle inside the d2 topbar (the global .navbar toggle is hidden).
  resourcePanel.querySelector("#d2ThemeToggle")?.addEventListener("click", toggleTheme);

  // The hub topbar is rebuilt on every render, so the avatar is a new element
  // each time and needs re-wiring alongside the theme toggle.
  window.initAvatarMenu?.(resourcePanel.querySelector(".d2-avatar"), ACCOUNT_MENU_ITEMS);

  // "Connect workspace" reuses the existing Azure connect flow.
  const connect = () => { window.location.href = "/auth/login"; };
  resourcePanel.querySelector("#d2ConnectBtn")?.addEventListener("click", connect);
  resourcePanel.querySelector("#d2CmdConnectBtn")?.addEventListener("click", connect);

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
          borderColor: getCSSVar("--accent"),
          backgroundColor: colorWithAlpha(getCSSVar("--accent"), 0.06),
          fill: true,
          tension: 0.35,
          pointRadius: pointSize,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
        {
          label: "Page Views",
          data: points.map((p) => p.pageViews),
          borderColor: getCSSVar("--success"),
          backgroundColor: colorWithAlpha(getCSSVar("--success"), 0.05),
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
        legend: {
          position: "top",
          align: "end",
          labels: {
            // boxHeight matches the global pointStyleWidth (8) so the marker is
            // a round dot instead of a vertical oval (height would otherwise
            // follow the ~12px font size).
            boxHeight: 8,
            // The area fill makes each dataset's backgroundColor ~6% opacity,
            // which Chart.js would otherwise reuse as the legend marker fill —
            // rendering a hollow ring that reads as the digit "0". Fill the
            // marker with the solid line color instead.
            generateLabels(chart) {
              const items =
                Chart.defaults.plugins.legend.labels.generateLabels(chart);
              items.forEach((item) => {
                item.fillStyle = item.strokeStyle;
                item.lineWidth = 0;
              });
              return items;
            },
          },
        },
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
          backgroundColor: chartPalette(items.length),
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
          backgroundColor: getCSSVar("--accent"),
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
          backgroundColor: chartPalette(4),
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
      const panel = toggle.closest(".dash-panel");
      if (!panel) return;
      panel.querySelectorAll(".toggle-view").forEach((v) => v.classList.remove("active"));
      const viewId = btn.dataset.view;
      // Find the matching view by id convention: {group}{View}View
      const targetId = `${group}${viewId[0].toUpperCase()}${viewId.slice(1)}View`;
      document.getElementById(targetId)?.classList.add("active");
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
    // One-finger panning swallows the page scroll: a swipe started over the
    // map moves the map instead of the page, trapping the reader. The zoom
    // buttons keep the map usable without dragging.
    dragging: !window.matchMedia("(pointer: coarse)").matches,
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

    const accent = getCSSVar("--accent") || "#2563eb";
    const circle = L.circleMarker(coords, {
      radius,
      fillColor: accent,
      fillOpacity: 0.55,
      color: accent,
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
    renderSparkline("sparkVisitors", sparklines.visitors.points, getCSSVar("--accent"));
    renderAnomalyBadge("anomalyVisitors", sparklines.visitors.anomaly, false);
  }
  if (sparklines.sessions) {
    renderSparkline("sparkSessions", sparklines.sessions.points, getCSSVar("--success"));
    renderAnomalyBadge("anomalySessions", sparklines.sessions.anomaly, false);
  }
  if (sparklines.errorRate) {
    renderSparkline("sparkErrorRate", sparklines.errorRate.points.map((v) => v * 100), getCSSVar("--danger"));
    renderAnomalyBadge("anomalyErrorRate", sparklines.errorRate.anomaly, true);
  }
  if (sparklines.avgResponse) {
    renderSparkline("sparkAvgResponse", sparklines.avgResponse.points, getCSSVar("--warning"));
    renderAnomalyBadge("anomalyAvgResponse", sparklines.avgResponse.anomaly, true);
  }
}

/* ========== Render: A/B Test Monitor ========== */
function renderAbTests(_tests) {
  const panel = document.getElementById("abTestPanel");
  if (panel) panel.classList.add("hidden");
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
    // D v2 delta pill: green when improving, amber when regressing.
    const up = (entry.direction || "") === "up" || (entry.direction == null && entry.deltaPct >= 0);
    deltaEl.classList.toggle("is-up", up);
    deltaEl.classList.toggle("is-down", !up);
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

  // Insight 1: Most active campaign source
  const campaigns = dashboard.charts.campaignBreakdown || [];
  if (campaigns.length > 0) {
    const best = campaigns.reduce((a, b) => (a.visitors || 0) > (b.visitors || 0) ? a : b);
    if ((best.visitors || 0) > 0) {
      insights.push({
        kind: "up",
        text: `Top campaign source: <strong>${escapeHtmlApp(best.campaign)}</strong> via ${escapeHtmlApp(best.source)} with <strong>${fmt(best.visitors)}</strong> visitors`,
      });
    }
  }

  // Insight 2: Peak traffic time \u2014 needs session tracking and real variance
  // (a uniform all-zero grid has no peak, only a reduce() tie-break artifact).
  const peakData = dashboard.charts.peakHours;
  const sessionTracked = dashboard.availability?.hasSessionId !== false;
  if (sessionTracked && peakData && peakData.length > 0) {
    const peak = peakData.reduce((a, b) => a.count > b.count ? a : b);
    if (Math.max(...peakData.map((p) => p.count || 0)) > 0) {
      const peakDayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const dayLabel = peakDayNames[peak.dayIndex];
      const window = `${peak.hour}:00-${peak.hour + 1}:00`;
      const when = dayLabel ? `${dayLabel} ${window}` : window;
      insights.push({
        kind: "up",
        text: `Peak traffic: <strong>${when}</strong> with <strong>${fmt(peak.count)}</strong> visitors/period`,
      });
    }
  }

  // Insight 3: Top traffic source
  const sources = dashboard.charts.referrerSources || [];
  if (sources.length > 0) {
    const total = sources.reduce((s, r) => s + r.count, 0);
    const top = sources[0];
    if (top && total > 0) {
      insights.push({
        kind: "up",
        text: `Top traffic source: <strong>${escapeHtmlApp(top.source)}</strong> drives <strong>${((top.count / total) * 100).toFixed(0)}%</strong> of all traffic`,
      });
    }
  }

  // Insight 4: Error rate check
  if (dashboard.kpis.errorRate > 0.03) {
    insights.push({
      kind: "warn",
      text: `Error rate at <strong>${fmtPct(dashboard.kpis.errorRate)}</strong> — above 3% threshold. Check slow endpoints in the Technical tab.`,
    });
  } else if (dashboard.kpis.errorRate > 0) {
    insights.push({
      kind: "ok",
      text: `Error rate is healthy at <strong>${fmtPct(dashboard.kpis.errorRate)}</strong>`,
    });
  }

  // Insight 5: URL parameter coverage
  const urlParams = dashboard.charts.urlParams;
  if (urlParams) {
    const pct = urlParams.totalUrlsScanned > 0 ? ((urlParams.urlsWithParams / urlParams.totalUrlsScanned) * 100).toFixed(0) : 0;
    const utmCount = urlParams.discovered.filter((p) => p.isUtm).length;
    insights.push({
      kind: "ok",
      text: `<strong>${urlParams.discovered.length}</strong> URL parameters auto-detected (${utmCount} UTM). <strong>${pct}%</strong> of page views carry tracking params.`,
    });
  }

  // Insight 6: Top page dominance
  const topPages = dashboard.charts.topPages || [];
  if (topPages.length >= 2) {
    const topShare = topPages[0].share || 0;
    if (topShare > 0.25) {
      const topPath = topPages[0].path;
      const tail = topPath === "/" ? "high homepage concentration" : "traffic is concentrated on one route";
      insights.push({
        kind: "up",
      text: `<strong>${escapeHtmlApp(topPath)}</strong> captures <strong>${fmtPct(topShare)}</strong> of all page views — ${tail}`,
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
    item.className = `dash-insight dash-insight--${insight.kind || "up"}`;
    item.innerHTML = `<span class="dash-insight-dot"></span><span>${insight.text}</span>`;
    list.appendChild(item);
  });
}

/* ========== Render: Peak Hours Heatmap ========== */
function renderPeakHours(data, availability) {
  const container = document.getElementById("peakHoursGrid");
  const emptyEl = document.getElementById("peakHoursEmpty");
  container.innerHTML = "";

  // Peak hours is derived from distinct sessions per hour. Without session
  // tracking the grid is uniformly zero — show the empty state instead.
  const noSession = availability && availability.hasSessionId === false;
  if (noSession || !data || data.length === 0) {
    container.classList.add("hidden");
    if (emptyEl) {
      const p = emptyEl.querySelector("p") || emptyEl;
      p.textContent = noSession
        ? "Peak hours need session tracking — set it up in the Readiness tab."
        : "No hourly data available.";
      emptyEl.classList.remove("hidden");
    }
    return;
  }
  container.classList.remove("hidden");
  emptyEl?.classList.add("hidden");

  const maxCount = Math.max(...data.map((d) => d.count));
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const byKey = {};
  data.forEach((d) => { byKey[`${d.dayIndex}:${d.hour}`] = d.count; });

  // D v2 heatmap: one grid (24px day label + 24 hour cells), intensity by opacity.
  const grid = document.createElement("div");
  grid.className = "dash-peaks";
  days.forEach((day, dayIdx) => {
    const label = document.createElement("span");
    label.className = "dash-peaks-day";
    label.textContent = day;
    grid.appendChild(label);

    for (let h = 0; h < 24; h++) {
      const count = byKey[`${dayIdx}:${h}`] || 0;
      const intensity = maxCount > 0 ? count / maxCount : 0;
      const cell = document.createElement("div");
      cell.className = "dash-peaks-cell";
      cell.style.opacity = (0.08 + intensity * 0.92).toFixed(2);
      cell.title = `${day} ${h}:00 — ${fmt(count)} visitors`;
      grid.appendChild(cell);
    }
  });
  container.appendChild(grid);

  // A title attribute never fires on touch, so the grid's numbers were
  // unreadable without a mouse. Tapping a cell puts its reading here.
  const readout = document.createElement("div");
  readout.className = "dash-peaks-readout";
  readout.textContent = "Tap a cell to read its traffic.";
  container.appendChild(readout);

  grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".dash-peaks-cell");
    if (!cell) return;
    const wasFocused = cell.classList.contains("is-focused");
    grid.querySelectorAll(".dash-peaks-cell.is-focused").forEach((c) => c.classList.remove("is-focused"));
    if (wasFocused) {
      readout.textContent = "Tap a cell to read its traffic.";
      return;
    }
    cell.classList.add("is-focused");
    readout.textContent = cell.title;
  });

  const foot = document.createElement("div");
  foot.className = "dash-peaks-foot";
  ["00:00", "06:00", "12:00", "18:00", "23:00"].forEach((t) => {
    const span = document.createElement("span");
    span.textContent = t;
    foot.appendChild(span);
  });
  container.appendChild(foot);
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
    "/pricing": getCSSVar("--warning"),
    "/signup": getCSSVar("--success"),
    "/checkout": colorWithAlpha(getCSSVar("--accent"), 0.65),
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
    bar.style.background = colors[item.mainTarget] || getCSSVar("--accent");
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
    chip.className = "dash-filterchip";
    const key = document.createElement("span");
    key.className = "dash-filterchip-key";
    key.textContent = f.param;
    const val = document.createElement("span");
    val.className = "dash-filterchip-val";
    val.textContent = f.value;
    chip.appendChild(key);
    chip.appendChild(val);
    const removeBtn = document.createElement("button");
    removeBtn.className = "dash-filterchip-x";
    removeBtn.type = "button";
    removeBtn.textContent = "\u00D7";
    removeBtn.setAttribute("aria-label", `Remove filter ${f.param}=${f.value}`);
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

  // Non-UTM params carry no sample values — their raw values (auth tokens,
  // UUIDs, OAuth scopes) are withheld server-side for privacy.
  if (!param.topValues || param.topValues.length === 0) {
    const note = document.createElement("div");
    note.className = "param-value-empty";
    note.textContent = "Values hidden — non-UTM parameter values are not shown for privacy.";
    valuesEl.appendChild(note);
    return;
  }

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
  charts.referrer = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: items.map((i) => i.source),
      datasets: [{
        data: items.map((i) => i.count),
        backgroundColor: chartPalette(items.length),
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

  funnelSteps.forEach((step, i) => {
    const pct = (step.count / maxCount) * 100;

    const row = document.createElement("div");
    row.className = "dash-funnel-row";

    const head = document.createElement("div");
    head.className = "dash-funnel-head";
    const labelSpan = document.createElement("span");
    labelSpan.innerHTML = `<strong>${escapeHtmlApp(step.label)}</strong>`;
    const metaSpan = document.createElement("span");
    metaSpan.className = "dash-funnel-head-meta";
    metaSpan.textContent = `${fmt(step.count)} \u00B7 ${pct.toFixed(1)}%`;
    head.appendChild(labelSpan);
    head.appendChild(metaSpan);
    row.appendChild(head);

    const barBg = document.createElement("div");
    barBg.className = "dash-funnel-bar";
    const fill = document.createElement("div");
    fill.className = "dash-funnel-bar-fill";
    fill.style.width = Math.max(8, pct) + "%";
    barBg.appendChild(fill);
    row.appendChild(barBg);

    // Drop-off from the previous step.
    if (i > 0) {
      const prev = funnelSteps[i - 1];
      const drop = ((1 - step.count / prev.count) * 100);
      if (drop > 0) {
        const dropEl = document.createElement("div");
        dropEl.className = "dash-funnel-drop";
        dropEl.textContent = `\u2193 ${drop.toFixed(1)}% drop-off`;
        row.appendChild(dropEl);
      }
    }

    container.appendChild(row);
  });
}

/* ========== Render: Sankey User Flow ========== */
function sankeyGroupColors() {
  return {
    funnel: getCSSVar("--warning"),
    info: getCSSVar("--accent"),
    other: getCSSVar("--text-muted"),
    exit: colorWithAlpha(getCSSVar("--warning"), 0.6),
  };
}
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
  flowData.nodes.forEach((n) => nodeMap.set(n.id, { ...n, label: n.label || n.id, y: 0, h: 0, sourceLinks: [], targetLinks: [] }));
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
  const groupColors = sankeyGroupColors();
  const nodeGroup = document.createElementNS(svgNS, "g");
  nodeMap.forEach((node) => {
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", node.x);
    rect.setAttribute("y", node.y);
    rect.setAttribute("width", nodeWidth);
    rect.setAttribute("height", Math.max(4, node.h));
    rect.setAttribute("rx", 3);
    rect.setAttribute("fill", groupColors[node.group] || getCSSVar("--text-muted"));
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
    span.innerHTML = `<span class="sankey-legend-dot" style="background:${groupColors[item.group]}"></span>${item.label}`;
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
    const winCount = wins.length;
    const plural = winCount === 1 ? "" : "s";
    titleEl.textContent = `Your environment scores ${score}/${maxScore}. ${winCount} quick win${plural} available:`;
  }

  if (winsEl) {
    winsEl.innerHTML = "";
    for (const win of wins) {
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

  // Score ring — D v2 keeps a single gradient stroke (url(#krDashScoreGrad)),
  // so the fill colour is grade-independent; only the arc length varies.
  const circumference = 2 * Math.PI * 52; // r=52
  const offset = circumference - (percentage / 100) * circumference;
  const ring = document.getElementById("scoreRingFill");
  ring.style.strokeDasharray = `${circumference}`;
  ring.style.strokeDashoffset = offset;
  ring.setAttribute("class", "dash-score-ring-fill");

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

  // Mini badge in the Readiness sub-tab
  const miniBadge = document.getElementById("scoreMiniBadge");
  miniBadge.textContent = `${score}`;
  miniBadge.className = "dash-subtab-num";
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

              if (typeof window.createPromptActionButton === "function") {
                detail.appendChild(window.createPromptActionButton({ prompt: match.prompt, label: "Use prompt" }));
              } else {
                // Fallback if the shared component failed to load — keep the
                // legacy single-action button so the row stays functional.
                const copyBtn = document.createElement("button");
                copyBtn.className = "prompt-copy-btn";
                copyBtn.textContent = "Copy prompt";
                copyBtn.addEventListener("click", async () => {
                  try { await navigator.clipboard.writeText(match.prompt); }
                  catch { /* ignore */ }
                  copyBtn.textContent = "Copied!";
                  setTimeout(() => { copyBtn.textContent = "Copy prompt"; }, 2000);
                });
                detail.appendChild(copyBtn);
              }
            } else {
              detail.innerHTML = "<p class=\"text-muted\">No prompt available for this signal yet.</p>";
            }
          } catch (err) {
            detail.innerHTML = `<p class="text-muted">Failed to load prompt: ${escapeHtmlApp(err.message)}</p>`;
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

/* ========== Skeleton loaders ========== */
// Each dashboard card carries a [data-card] attribute. On load every card
// gets a shimmering overlay; it is removed the instant that card's data
// streams in (or replaced by an error state if its query failed).
const SKELETON_HTML =
  '<div class="skeleton skeleton-line sk-40"></div><div class="skeleton skeleton-fill"></div>';

function showAllSkeletons() {
  receivedCards.clear();
  document.querySelectorAll("[data-card]").forEach((el) => {
    // Fresh load: drop any prior skeleton AND error overlay/state.
    el.querySelectorAll(":scope > .card-overlay").forEach((o) => o.remove());
    el.classList.remove("is-error");
    el.classList.add("is-loading");
    const overlay = document.createElement("div");
    overlay.className = "card-overlay skeleton-overlay";
    overlay.innerHTML = SKELETON_HTML;
    el.appendChild(overlay);
  });
}

// Removes a card's skeleton only — never an error overlay. An errored card
// carries `is-error` (not `is-loading`), so it is left untouched here.
function clearSkeleton(name) {
  document.querySelectorAll(`[data-card="${name}"]`).forEach((el) => {
    el.classList.remove("is-loading");
    el.querySelectorAll(":scope > .skeleton-overlay").forEach((o) => o.remove());
  });
}

function clearAllSkeletons() {
  document.querySelectorAll("[data-card].is-loading").forEach((el) => {
    el.classList.remove("is-loading");
    el.querySelectorAll(":scope > .skeleton-overlay").forEach((o) => o.remove());
  });
}

// One failed query is isolated to its own card: an error message + Retry,
// while every other card renders normally. The card is marked `is-error`
// (a distinct state from `is-loading`) so the terminal clearAllSkeletons()
// in renderDashboard does not wipe the error overlay.
function showCardError(name, message) {
  document.querySelectorAll(`[data-card="${name}"]`).forEach((el) => {
    el.querySelectorAll(":scope > .card-overlay").forEach((o) => o.remove());
    el.classList.remove("is-loading");
    el.classList.add("is-error"); // keep real (empty) content hidden, persist past `done`
    const overlay = document.createElement("div");
    overlay.className = "card-overlay card-error";
    const p = document.createElement("p");
    p.className = "card-error-msg";
    p.textContent = message || "Couldn't load this section.";
    const btn = document.createElement("button");
    btn.className = "btn btn-ghost btn-sm";
    btn.textContent = "Retry";
    btn.addEventListener("click", () => {
      if (isPreviewMode) enterPreviewMode();
      else loadDashboard(rangeSelect.value);
    });
    overlay.append(p, btn);
    el.appendChild(overlay);
  });
}

/* ========== Per-card renderers ========== */

// Show a clickable hint under a KPI whose telemetry signal is missing; the
// hint jumps to the matching Readiness signal row.
function showKpiHint(hintId, signal, label) {
  const hint = document.getElementById(hintId);
  if (!hint) return;
  hint.textContent = label || "Not tracked — set up in Readiness";
  hint.dataset.signal = signal;
  hint.classList.remove("hidden");
  if (!hint.dataset.wired) {
    hint.dataset.wired = "1";
    hint.addEventListener("click", () => focusSignalPrompt(hint.dataset.signal));
  }
}

function hideKpiHint(hintId) {
  document.getElementById(hintId)?.classList.add("hidden");
}

// A KPI whose signal is missing renders an em-dash + hint instead of a
// degenerate value (e.g. dcountif=0 visitors counted over an empty column).
function setGatedKpi(valueId, hintId, value, untracked, signal) {
  const valueEl = document.getElementById(valueId);
  if (untracked) {
    valueEl.textContent = "—";
    showKpiHint(hintId, signal);
  } else {
    valueEl.textContent = fmt(value);
    hideKpiHint(hintId);
  }
}

function renderMarketingKpis(d) {
  const av = d.availability || {};
  const untrackedUser = av.hasUserId === false;
  const untrackedSession = av.hasSessionId === false;
  const untrackedPv = av.hasPageViews === false;

  setGatedKpi("kpiVisitors", "kpiVisitorsHint", d.uniqueVisitors, untrackedUser, "userId");
  setGatedKpi("kpiSessions", "kpiSessionsHint", d.sessions, untrackedSession, "sessionId");

  // Avg Pages / Session is pageViews ÷ sessions — a meaningless ratio once
  // sessions is unreliable (it produced the 7643 artifact).
  if (untrackedSession) {
    document.getElementById("kpiPagesPerSession").textContent = "—";
    showKpiHint("kpiPagesPerSessionHint", "sessionId");
  } else {
    document.getElementById("kpiPagesPerSession").textContent =
      d.pagesPerSession != null ? d.pagesPerSession.toFixed(1) : "-";
    hideKpiHint("kpiPagesPerSessionHint");
  }

  // Page Views is a real count, but when no page-view telemetry exists it
  // counts server requests — relabel the card so it stops claiming to be
  // page views, while keeping the (real, useful) number.
  document.getElementById("kpiPageViews").textContent = fmt(d.pageViews);
  const pvLabel = document.getElementById("kpiPageViewsLabel");
  if (pvLabel) pvLabel.textContent = untrackedPv ? "Requests" : "Page Views";
  if (untrackedPv) {
    showKpiHint("kpiPageViewsHint", "pageViews", "No page-view telemetry — showing server requests");
  } else {
    hideKpiHint("kpiPageViewsHint");
  }

  // Suppress the delta chip for any KPI whose signal is missing — a delta
  // on a degenerate value is itself misleading.
  let comparison = d.comparison;
  if (comparison && (untrackedUser || untrackedSession)) {
    comparison = { ...comparison };
    if (untrackedUser) comparison.uniqueVisitors = null;
    if (untrackedSession) comparison.sessions = null;
  }
  renderKpiComparison({ comparison });
  wireKpiDrill(document.querySelector('[data-card="marketingKpis"]'));
}

function renderTechnicalKpis(d) {
  document.getElementById("kpiAvg").textContent = fmtMs(d.avgResponseTimeMs);
  document.getElementById("kpiP95").textContent = fmtMs(d.p95ResponseTimeMs);
  document.getElementById("kpiErrors").textContent = fmtPct(d.errorRate);
  // 4xx responses (mostly 404s) are tracked separately — they are not server
  // failures and must not inflate the error rate.
  const clientEl = document.getElementById("kpiClientErrors");
  if (clientEl) {
    clientEl.textContent = d.clientErrorRate > 0
      ? `+ ${fmtPct(d.clientErrorRate)} client errors (4xx)`
      : "";
  }
  const errorCard = document.getElementById("kpiErrorCard");
  if (d.errorRate > 0.05) {
    errorCard.style.borderLeft = "3px solid var(--danger)";
  } else if (d.errorRate > 0.02) {
    errorCard.style.borderLeft = "3px solid var(--warning)";
  } else {
    errorCard.style.borderLeft = "3px solid var(--success)";
  }
  wireKpiDrill(document.querySelector('[data-card="technicalKpis"]'));
}

function renderDailyTrendCard(d) {
  renderDailyTrend(d.dailyTrend);
  renderAllSparklines(d.kpiSparklines);
}

function renderTopPagesCard(topPages) {
  const all = topPages || [];
  const checkbox = document.getElementById("topPagesFilterTechnical");
  const draw = () => {
    const rows = checkbox?.checked ? filterTechnicalRoutes(all) : all;
    renderTableRows("topPagesBody", "topPagesEmpty", "topPagesCount", rows, (tr, row) => {
      tr.appendChild(td(row.path));
      tr.appendChild(td(fmt(row.views), "num"));
      tr.appendChild(td(fmtPct(row.share), "num"));
    });
  };
  draw();
  if (checkbox) checkbox.onchange = draw;
}

function renderSlowEndpointsCard(slowEndpoints) {
  const all = slowEndpoints || [];
  const checkbox = document.getElementById("slowEndpointsFilterTechnical");
  const draw = () => {
    const rows = checkbox?.checked ? filterTechnicalRoutes(all) : all;
    renderTableRows("slowEndpointsBody", "slowEndpointsEmpty", "slowEndpointsCount", rows, (tr, row) => {
      tr.appendChild(td(row.path));
      tr.appendChild(td(fmtMs(row.p50), "num"));
      tr.appendChild(td(fmtMs(row.p95), "num"));
      tr.appendChild(td(fmtMs(row.p99), "num"));
      tr.appendChild(td(fmt(row.count), "num"));
      tr.appendChild(td(fmtPct(row.errorRate), "num"));
    });
  };
  draw();
  if (checkbox) checkbox.onchange = draw;
}

function renderUserFlowCard(d) {
  renderSankeyFlow(d.userFlow);
  renderTableRows("topNavBody", null, null, d.topNavigationPaths, (tr, row) => {
    tr.appendChild(td(row.from));
    tr.appendChild(td(row.to));
    tr.appendChild(td(fmt(row.count), "num"));
  });
}

function renderGeoCard(d) {
  renderGeoChart(d.geoDistribution);
  renderGeoMap(d.geoDistribution);
  if (geoMapInstance) setTimeout(() => geoMapInstance.invalidateSize(), 60);
}

function renderBrowserTimingsCard(d) {
  renderBrowserTimings(d.browserTimings);
  document.getElementById("kpiFrontendAvg").textContent =
    d.browserTimings ? fmtMs(d.browserTimings.avgTotal) : "-";
}

/* ----- Backend / APM cards ----- */

function renderBackendKpis(d) {
  const av = d.availability || {};
  const noDeps = av.hasDependencies === false;
  const noEx = av.hasExceptions === false;

  if (noDeps) {
    document.getElementById("kpiDepCalls").textContent = "—";
    document.getElementById("kpiDepFail").textContent = "—";
    document.getElementById("kpiDepP95").textContent = "—";
    showKpiHint("kpiDepCallsHint", "dependencies");
  } else {
    document.getElementById("kpiDepCalls").textContent = fmt(d.dependencyCalls);
    document.getElementById("kpiDepFail").textContent = fmtPct(d.dependencyFailureRate);
    document.getElementById("kpiDepP95").textContent = fmtMs(d.dependencyP95Ms);
    hideKpiHint("kpiDepCallsHint");
  }
  const targetsEl = document.getElementById("kpiDepTargets");
  if (targetsEl) targetsEl.textContent = !noDeps && d.distinctTargets ? `${d.distinctTargets} targets` : "";

  const failCard = document.getElementById("kpiDepFailCard");
  if (failCard) {
    if (!noDeps && d.dependencyFailureRate > 0.05) failCard.style.borderLeft = "3px solid var(--danger)";
    else if (!noDeps && d.dependencyFailureRate > 0.02) failCard.style.borderLeft = "3px solid var(--warning)";
    else failCard.style.borderLeft = "3px solid var(--success)";
  }

  if (noEx) {
    document.getElementById("kpiExceptions").textContent = "—";
    showKpiHint("kpiExceptionsHint", "exceptions");
  } else {
    document.getElementById("kpiExceptions").textContent = fmt(d.exceptionCount);
    hideKpiHint("kpiExceptionsHint");
  }
  const typesEl = document.getElementById("kpiExceptionTypes");
  if (typesEl) typesEl.textContent = !noEx && d.distinctExceptionTypes ? `${d.distinctExceptionTypes} types` : "";
}

function renderDependenciesCard(d) {
  renderTableRows("slowDepsBody", "slowDepsEmpty", "slowDepsCount", d.slowDependencies, (tr, row) => {
    tr.appendChild(td(row.target));
    tr.appendChild(td(row.type));
    tr.appendChild(td(fmtMs(row.p50), "num"));
    tr.appendChild(td(fmtMs(row.p95), "num"));
    tr.appendChild(td(fmt(row.count), "num"));
    tr.appendChild(td(fmtPct(row.failureRate), "num"));
  });
  renderDoughnut("dependencyTypesChart", "dependencyTypesEmpty", "dependencyTypes", d.dependencyTypes, "type", "count");
}

function renderExceptionsCard(d) {
  renderTableRows("exceptionsBody", "exceptionsEmpty", "exceptionsCount", d.topExceptions, (tr, row) => {
    tr.appendChild(td(row.type));
    tr.appendChild(td(fmt(row.count), "num"));
    tr.appendChild(td(fmt(row.affectedOperations), "num"));
    tr.appendChild(td(fmt(row.affectedUsers), "num"));
  });
}

function renderServiceHealthCard(d) {
  renderTableRows("serviceHealthBody", "serviceHealthEmpty", "serviceHealthCount", d.serviceHealth, (tr, row) => {
    tr.appendChild(td(row.role));
    tr.appendChild(td(fmt(row.count), "num"));
    tr.appendChild(td(fmtMs(row.avgDuration), "num"));
    tr.appendChild(td(fmtMs(row.p95), "num"));
    tr.appendChild(td(fmtPct(row.errorRate), "num"));
  });
}

function renderStatusCodesCard(d) {
  renderDoughnut("statusCodesChart", "statusCodesEmpty", "statusCodes", d.statusCodes, "class", "count");
}

// card name -> renderer. Each renderer takes the card's streamed payload.
const CARD_RENDERERS = {
  marketingKpis: renderMarketingKpis,
  technicalKpis: renderTechnicalKpis,
  dailyTrend: renderDailyTrendCard,
  topPages: (d) => renderTopPagesCard(d.topPages),
  userFlow: renderUserFlowCard,
  browsers: (d) => renderDoughnut("browserChart", "browserEmpty", "browser", d.browsers, "name", "count"),
  os: (d) => renderDoughnut("osChart", "osEmpty", "os", d.os, "name", "count"),
  devices: (d) => renderDoughnut("deviceChart", "deviceEmpty", "device", d.devices, "name", "count"),
  geo: renderGeoCard,
  peakHours: (d) => renderPeakHours(d.peakHours, d.availability),
  campaigns: (d) => { renderCampaignTable(d.campaignBreakdown); renderUrlParams(d.urlParams); },
  referrers: (d) => renderReferrerChart(d.referrerSources),
  slowEndpoints: (d) => renderSlowEndpointsCard(d.slowEndpoints),
  browserTimings: renderBrowserTimingsCard,
  sessionReplays: (d) => renderSessionReplays(d.sessionReplays),
  contentScoring: (d) => renderContentScoring(d.topNavigationPaths, d.topPages),
  funnel: (d) => renderFunnel(d.topNavigationPaths, d.topPages),
  backendKpis: renderBackendKpis,
  dependencies: renderDependenciesCard,
  exceptions: renderExceptionsCard,
  serviceHealth: renderServiceHealthCard,
  statusCodes: renderStatusCodesCard,
};

// Rebuild a card's streamed-payload shape from a full dashboard object —
// used by the done-message safety net when no per-card message arrived.
function cardDataFromDashboard(name, dash) {
  const c = dash.charts || {};
  const k = dash.kpis || {};
  const t = dash.tables || {};
  const totalPv = (c.dailyTrend || []).reduce((s, d) => s + (d.pageViews || 0), 0);
  switch (name) {
    case "marketingKpis":
      return {
        uniqueVisitors: k.uniqueVisitors,
        sessions: k.sessions,
        pageViews: totalPv,
        pagesPerSession: k.sessions > 0 ? totalPv / k.sessions : null,
        comparison: k.comparison,
        availability: dash.availability,
      };
    case "technicalKpis":
      return {
        avgResponseTimeMs: k.avgResponseTimeMs,
        p95ResponseTimeMs: k.p95ResponseTimeMs,
        errorRate: k.errorRate,
        clientErrorRate: k.clientErrorRate,
      };
    case "dailyTrend": return { dailyTrend: c.dailyTrend, kpiSparklines: c.kpiSparklines };
    case "topPages": return { topPages: c.topPages };
    case "userFlow": return { userFlow: c.userFlow, topNavigationPaths: c.topNavigationPaths };
    case "browsers": return { browsers: c.browsers };
    case "os": return { os: c.os };
    case "devices": return { devices: c.devices };
    case "geo": return { geoDistribution: c.geoDistribution };
    case "peakHours": return { peakHours: c.peakHours, availability: dash.availability };
    case "campaigns": return { campaignBreakdown: c.campaignBreakdown, urlParams: c.urlParams };
    case "referrers": return { referrerSources: c.referrerSources };
    case "slowEndpoints": return { slowEndpoints: t.slowEndpoints };
    case "browserTimings": return { browserTimings: c.browserTimings };
    case "sessionReplays": return { sessionReplays: c.sessionReplays };
    case "contentScoring":
    case "funnel":
      return { topNavigationPaths: c.topNavigationPaths, topPages: c.topPages };
    case "backendKpis": {
      const b = dash.backend || {};
      return {
        dependencyCalls: b.dependencyCalls,
        dependencyFailureRate: b.dependencyFailureRate,
        dependencyP95Ms: b.dependencyP95Ms,
        distinctTargets: b.distinctTargets,
        exceptionCount: b.exceptionCount,
        distinctExceptionTypes: b.distinctExceptionTypes,
        availability: {
          hasDependencies: dash.availability?.hasDependencies,
          hasExceptions: dash.availability?.hasExceptions,
        },
      };
    }
    case "dependencies":
      return { slowDependencies: t.slowDependencies, dependencyTypes: c.dependencyTypes };
    case "exceptions": return { topExceptions: t.topExceptions };
    case "serviceHealth": return { serviceHealth: t.serviceHealth };
    case "statusCodes": return { statusCodes: c.statusCodes };
    default: return {};
  }
}

// Render one card from its streamed payload (or show its error state).
function applyCard(name, data) {
  receivedCards.add(name);
  const renderer = CARD_RENDERERS[name];
  if (!renderer) return;
  if (data && data.error) {
    showCardError(name, data.message);
    return;
  }
  safeRender(`card:${name}`, () => renderer(data || {}));
  clearSkeleton(name);
}

/* ========== Main render (done message) ========== */
// Per-card data arrives via `applyCard` while the stream runs. This handler
// only paints what cannot stream per-card: whole-dashboard derived panels,
// plus a safety net for any card that never streamed (non-stream response).
function renderDashboard(data) {
  lastDashboardData = data;
  const dashboard = data.dashboard;

  safeRender("Narration", () => renderNarration(dashboard.narration));
  safeRender("Insights", () => renderInsights(dashboard));
  safeRender("A/B tests", () => renderAbTests(null));
  safeRender("Readiness", () => renderReadinessScore(data.readinessScore, data.readiness));
  safeRender("FirstRunBanner", () => renderFirstRunBanner(data.readinessScore));

  // Safety net: a card with no streamed message (classic JSON response, or
  // an older server) is rendered here from the full payload.
  for (const name of Object.keys(CARD_RENDERERS)) {
    if (!receivedCards.has(name)) {
      applyCard(name, cardDataFromDashboard(name, dashboard));
    }
  }

  clearAllSkeletons();
  dashboardPanel.classList.remove("hidden");
  if (geoMapInstance) setTimeout(() => geoMapInstance.invalidateSize(), 50);
  setStatus("Dashboard loaded.", "success");
}

/* ========== Dashboard loading (NDJSON stream, per-card) ========== */
// Reads the NDJSON stream: `card` messages fill cards progressively (each
// removing its skeleton), the terminal `done` carries the full payload and
// the derived panels. `progress` messages are ignored — the per-card
// skeletons are the loading indicator now.
async function loadDashboardStream(url) {
  statusPanel.textContent = "";

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
    const text = await response.text().catch(() => "");
    let data = {};
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    console.error("[loadDashboardStream] HTTP", response.status, text.slice(0, 500));
    const err = new Error(data.message || data.error || `Request failed (HTTP ${response.status})`);
    err.data = data;
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;

  function handle(msg) {
    if (msg.type === "card") {
      applyCard(msg.name, msg.data);
    } else if (msg.type === "done") {
      result = msg;
    } else if (msg.type === "error") {
      const err = new Error(msg.message || msg.error || "Pipeline error");
      err.data = msg;
      throw err;
    } else if (msg.dashboard) {
      // Classic JSON (non-stream) response.
      result = msg;
    }
    // `progress` messages are intentionally ignored.
  }

  // Cancel the reader on ANY exit path (including a throw from handle() or the
  // trailing-parse `throw e`) so the underlying connection isn't leaked.
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          console.warn("[stream] parse error on line:", line.slice(0, 200));
          continue;
        }
        handle(msg);
      }
    }

    // Parse any trailing buffered payload (e.g. classic JSON without newline).
    if (!result && buffer.trim()) {
      try {
        handle(JSON.parse(buffer.trim()));
      } catch (e) {
        if (e.data) throw e;
        console.warn("[stream] trailing payload parse error:", buffer.slice(0, 200));
      }
    }

    if (!result) {
      throw new Error("No data received from server");
    }
    return result;
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
}

async function loadDashboard(range) {
  try {
    dashboardPanel.classList.remove("hidden");
    showAllSkeletons();
    const data = await loadDashboardStream(`/dashboard/overview?range=${range}&stream=1`);
    renderDashboard(data);
  } catch (error) {
    clearAllSkeletons();
    dashboardPanel.classList.add("hidden");
    if (error.data && error.data.error === "RESOURCE_SELECTION_REQUIRED") {
      selectedResourceBar.classList.add("hidden");
      renderResources(error.data.resources || []);
      return;
    }
    // Resource not configured yet — config belongs to the setup wizard,
    // never to a dashboard load. Send the user there.
    if (error.data && error.data.error === "SETUP_REQUIRED") {
      window.location.href = "/setup";
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

  // Fire-and-forget: real stargazer count for the landing nav.
  loadStargazers();

  // Init sortable tables
  initSortableTable("topPagesTable");
  initSortableTable("slowEndpointsTable");
  initSortableTable("topNavTable");
  initSortableTable("campaignTable");
  initSortableTable("slowDepsTable");
  initSortableTable("exceptionsTable");
  initSortableTable("serviceHealthTable");

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

  // Paint the landing hero immediately for the common anonymous "/" visit
  // instead of waiting on the /auth/session round-trip — otherwise a cold
  // Container App or slow mobile link shows a blank page until the fetch
  // resolves. `booting` only hides the legacy navbar (which the landing hides
  // anyway), so the hero renders now; if the session turns out authenticated,
  // the block below calls hideLanding() and swaps in the dashboard.
  if (route.page === "home") {
    showLanding();
  }

  try {
    const session = await apiFetch("/auth/session");
    csrfToken = session.csrfToken || null;

    if (!session.authenticated) {
      showLanding();
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
    hideLanding();

    if (session.user?.name) {
      logoutButton.textContent = `${session.user.name} — Logout`;
    }

    // Per-resource service hub. /api/setup/services lists every App
    // Insights resource tagged with its config status (ready /
    // incomplete / unconfigured). This replaces the tenant-global
    // needsSetup redirect, which silently mixed up multi-resource state.
    const servicesResp = await apiFetch("/api/setup/services");
    const services = servicesResp.services || [];
    lastDiscoveredResources = services;

    if (services.length === 0) {
      setStatus(
        "No Application Insights resources found in this tenant. Create one in Azure, then come back.",
        "error"
      );
      return;
    }

    // Deep link to a specific service dashboard — restore it directly.
    if (route.page === "dashboard" && route.service) {
      const target = services.find((r) => r.appInsightsName === route.service);
      if (target) {
        if (servicesResp.selectedResourceId !== target.resourceId) {
          await selectResourceApi(target);
        }
        setD2Route(true);
        showSelectedResource(route.service);
        activateTab(route.tab, { updateUrl: false });
        router.replace({ page: "dashboard", service: route.service, tab: route.tab });
        await loadDashboard(rangeSelect.value);
        maybeShowOnboarding();
        return;
      }
      // Service from the URL not found — fall through to the hub.
    }

    // Explicit /services route — always show the hub.
    if (route.page === "services") {
      router.replace({ page: "services" });
      renderResources(services);
      return;
    }

    // Single resource — skip the hub: straight to its dashboard when
    // configured, straight to the setup wizard otherwise.
    if (services.length === 1) {
      const only = services[0];
      await selectResourceApi(only);
      if (only.status === "ready") {
        setD2Route(true);
        showSelectedResource(only.appInsightsName);
        router.replace({ page: "dashboard", service: only.appInsightsName, tab: "marketing" });
        await loadDashboard(rangeSelect.value);
        maybeShowOnboarding();
      } else {
        window.location.href = "/setup";
      }
      return;
    }

    // Multiple resources — the service hub with per-resource status.
    router.replace({ page: "services" });
    renderResources(services);
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
      showLanding();
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
    setD2Route(true);
    previewBanner.classList.add("hidden");
    hideLanding();
    isPreviewMode = false;
    activateTab(route.tab, { updateUrl: false });
    // Always reveal the dashboard panel for a dashboard route — otherwise
    // navigating Back to an already-selected service left BOTH panels hidden
    // (blank screen), since the reveal used to live inside the "service
    // changed" branch below.
    showSelectedResource(route.service);
    dashboardPanel.classList.remove("hidden");
    const currentName = selectedResourceName.textContent;
    if (currentName !== route.service) {
      const target = lastDiscoveredResources.find((r) => r.appInsightsName === route.service);
      if (target) {
        await selectResourceApi(target);
      }
    }
    await loadDashboard(rangeSelect.value);
  }
});

// Reveal the chrome only once the route is resolved: by now the correct view
// has set body.landing-active / body.d2-route (which keep the navbar hidden in
// those modes), or an edge state (auth error, no services) legitimately needs
// the legacy navbar — so removing "booting" shows it.
init().finally(() => document.documentElement.classList.remove("booting"));
