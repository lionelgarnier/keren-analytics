/**
 * Shared "Use this AI prompt" split-button + dropdown.
 *
 * Used by the setup wizard's missing-signals list and the readiness panel's
 * "How to fix" rows. Primary click = copy. Caret = open a menu with copy +
 * IDE deep-links (Cursor today; others planned via the `destinations` array).
 *
 * Exposed as `window.createPromptActionButton({ prompt, label }) → HTMLElement`.
 * Plain DOM, no bundler. Keep it self-contained so both setup.js and app.js
 * can use it without a build step.
 */
(function () {
  "use strict";

  // Each destination is a one-shot action against a prompt string. Extending
  // the list (VS Code, JetBrains AI Assistant, etc.) only requires adding
  // entries here — the UI loops over them.
  //
  // Cursor's deep link is "cursor://anysphere.cursor-deeplink/prompt?text=…".
  // It opens a new chat with the text pre-filled if Cursor is installed;
  // otherwise the OS shows "no app for this URL" and the user can fall back
  // to plain copy. We surface the latter explicitly in the menu so the user
  // never gets stuck.
  const DESTINATIONS = [
    {
      id: "copy",
      label: "Copy to clipboard",
      hint: "Paste into any AI assistant (Claude, ChatGPT, Copilot, …).",
      handler: async (prompt) => {
        await copyToClipboard(prompt);
        return { confirmation: "Copied" };
      },
    },
    {
      id: "cursor",
      label: "Open in Cursor",
      hint: "Requires Cursor installed.",
      handler: async (prompt) => {
        await copyToClipboard(prompt); // safety net if the deep-link silently fails
        const url = `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(prompt)}`;
        window.location.href = url;
        return { confirmation: "Opening Cursor… (copied too)" };
      },
    },
  ];

  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall through to execCommand fallback.
      }
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
  }

  function createPromptActionButton({ prompt, label = "Use prompt" } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "prompt-action";
    wrap.dataset.promptAction = "1";

    const primary = document.createElement("button");
    primary.type = "button";
    primary.className = "prompt-action-primary";
    primary.innerHTML = `<span class="prompt-action-icon" aria-hidden="true">⌘</span><span class="prompt-action-label">${escape(label)}</span>`;

    const caret = document.createElement("button");
    caret.type = "button";
    caret.className = "prompt-action-caret";
    caret.setAttribute("aria-haspopup", "menu");
    caret.setAttribute("aria-expanded", "false");
    caret.setAttribute("aria-label", "Choose destination");
    caret.innerHTML = `<span aria-hidden="true">▾</span>`;

    const menu = document.createElement("div");
    menu.className = "prompt-action-menu hidden";
    menu.setAttribute("role", "menu");
    for (const dest of DESTINATIONS) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "prompt-action-menu-item";
      item.setAttribute("role", "menuitem");
      item.dataset.dest = dest.id;
      item.innerHTML = `
        <span class="prompt-action-menu-label">${escape(dest.label)}</span>
        <span class="prompt-action-menu-hint">${escape(dest.hint)}</span>
      `;
      item.addEventListener("click", () => runDestination(dest));
      menu.appendChild(item);
    }

    wrap.append(primary, caret, menu);

    function showFlash(text) {
      const originalLabel = primary.querySelector(".prompt-action-label").textContent;
      primary.querySelector(".prompt-action-label").textContent = text;
      primary.classList.add("prompt-action-primary-confirmed");
      setTimeout(() => {
        primary.querySelector(".prompt-action-label").textContent = originalLabel;
        primary.classList.remove("prompt-action-primary-confirmed");
      }, 2000);
    }

    async function runDestination(dest) {
      closeMenu();
      if (!prompt) return;
      try {
        const result = await dest.handler(prompt);
        showFlash(result?.confirmation || "Done");
      } catch (err) {
        showFlash(`Failed: ${err.message || "unknown"}`);
      }
    }

    function openMenu() {
      menu.classList.remove("hidden");
      caret.setAttribute("aria-expanded", "true");
      // Defer registration so the click that opened the menu doesn't immediately close it.
      setTimeout(() => {
        document.addEventListener("click", outsideClick, { capture: true });
        document.addEventListener("keydown", escKey);
      }, 0);
    }
    function closeMenu() {
      menu.classList.add("hidden");
      caret.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", outsideClick, { capture: true });
      document.removeEventListener("keydown", escKey);
    }
    function outsideClick(e) {
      if (!wrap.contains(e.target)) closeMenu();
    }
    function escKey(e) {
      if (e.key === "Escape") closeMenu();
    }

    primary.addEventListener("click", () => runDestination(DESTINATIONS[0]));
    caret.addEventListener("click", () => {
      if (menu.classList.contains("hidden")) openMenu();
      else closeMenu();
    });

    return wrap;
  }

  // Shared HTML escaper (defined in escapeHtml.js, loaded before this script).
  const escape = window.escapeHtml;

  window.createPromptActionButton = createPromptActionButton;
})();
