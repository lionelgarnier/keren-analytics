// Keep the browser chrome tint on the page background. A prefers-color-scheme
// meta pair can't do this: the in-app toggle is stored in localStorage and
// diverges from the OS setting the moment someone uses it.
window.__setThemeColorMeta = function (dark) {
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0f1117" : "#f8f9fb");
};

// Apply persisted theme before first paint to prevent flash.
(function applyInitialTheme() {
  var theme = localStorage.getItem("theme");
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  var dark = theme === "dark" || (!theme && prefersDark);
  if (dark) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
  window.__setThemeColorMeta(dark);
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
