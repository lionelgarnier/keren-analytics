// Apply persisted theme before first paint to prevent flash.
(function applyInitialTheme() {
  var theme = localStorage.getItem("theme");
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (theme === "dark" || (!theme && prefersDark)) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
