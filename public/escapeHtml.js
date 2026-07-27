// Single HTML escaper shared by every page script (app.js, setup.js,
// promptActionButton.js). Loaded as a classic script before its consumers so
// `window.escapeHtml` is defined when they run. Having ONE implementation means
// there is a single place to audit — three drifting copies is exactly how the
// campaign-source XSS slipped in (one call site forgot to escape).
window.escapeHtml = function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};
