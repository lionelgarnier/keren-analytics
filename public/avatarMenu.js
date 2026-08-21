/**
 * Account menu behind the avatar in the operator-console topbars.
 *
 * Docs and Logout used to sit in the tab row next to Services. With 44px touch
 * targets they ended up adjacent under the thumb, and Logout destroys the
 * session on a single tap — so they moved in here, two taps away.
 *
 * Exposed as `window.initAvatarMenu(trigger, items) → { close }`.
 * Items are `{ label, href }` for navigation or `{ label, onSelect }` for an
 * action. Plain DOM, no bundler, same posture as promptActionButton.js.
 *
 * Focus moves to the real items rather than a roving virtual cursor, so Enter
 * activates natively and screen readers announce the menu properly.
 */
(function () {
  "use strict";

  function initAvatarMenu(trigger, items) {
    if (!trigger || !Array.isArray(items) || items.length === 0) return null;
    // The hub topbar is re-rendered wholesale, so a second init on a fresh
    // trigger is normal; guard against double-wiring the same one.
    if (trigger.dataset.avatarMenuWired === "1") return null;
    trigger.dataset.avatarMenuWired = "1";

    const menu = document.createElement("div");
    menu.className = "avatar-menu hidden";
    menu.setAttribute("role", "menu");

    const entries = items.map((item) => {
      const el = document.createElement(item.href ? "a" : "button");
      el.className = "avatar-menu-item";
      el.setAttribute("role", "menuitem");
      el.textContent = item.label;
      if (item.href) {
        el.href = item.href;
      } else {
        el.type = "button";
        el.addEventListener("click", () => {
          close();
          item.onSelect?.();
        });
      }
      menu.appendChild(el);
      return el;
    });

    (trigger.parentElement || document.body).appendChild(menu);

    function isOpen() {
      return !menu.classList.contains("hidden");
    }

    function open() {
      if (isOpen()) return;
      menu.classList.remove("hidden");
      trigger.setAttribute("aria-expanded", "true");
      entries[0]?.focus();
      // Deferred so the click that opened the menu doesn't close it again.
      setTimeout(() => {
        document.addEventListener("click", onOutside, { capture: true });
        document.addEventListener("keydown", onKey);
      }, 0);
    }

    function close({ restoreFocus = false } = {}) {
      if (!isOpen()) return;
      menu.classList.add("hidden");
      trigger.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onOutside, { capture: true });
      document.removeEventListener("keydown", onKey);
      if (restoreFocus) trigger.focus();
    }

    function onOutside(e) {
      if (!menu.contains(e.target) && e.target !== trigger) close();
    }

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close({ restoreFocus: true });
        return;
      }
      if (e.key === "Tab") {
        close();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const current = entries.indexOf(document.activeElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = (current + step + entries.length) % entries.length;
      entries[next]?.focus();
    }

    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      isOpen() ? close() : open();
    });

    return { close };
  }

  window.initAvatarMenu = initAvatarMenu;
})();
