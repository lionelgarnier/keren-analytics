// Apply persisted theme before first paint to prevent flash.
(function applyInitialTheme() {
  var theme = localStorage.getItem("theme");
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (theme === "dark" || (!theme && prefersDark)) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();

// Hide the legacy navbar until app.js resolves the route (auth + service list),
// otherwise refreshing a dashboard/landing URL flashes the wrong chrome before
// the SPA decides what to show. app.js removes "booting" once the view is set.
// Setup and Docs render their own topbar (no .navbar), so skip them.
(function markBooting() {
  var p = location.pathname;
  if (p === "/setup" || p.indexOf("/docs") === 0) return;
  document.documentElement.classList.add("booting");
})();
