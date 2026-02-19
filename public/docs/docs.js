/* ========== Theme Toggle ========== */
document.getElementById("themeToggle")?.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
  }
  try { localStorage.setItem("theme", isDark ? "light" : "dark"); } catch {}
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  if (localStorage.getItem("theme")) return;
  if (e.matches) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
});

/* ========== Scroll spy ========== */
const sidebarLinks = document.querySelectorAll(".doc-sidebar-link");
const sections = document.querySelectorAll(".doc-content section[id]");

function updateScrollSpy() {
  const scrollY = window.scrollY + 80;
  let currentId = "";
  sections.forEach((section) => {
    if (section.offsetTop <= scrollY) {
      currentId = section.id;
    }
  });
  sidebarLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${currentId}`);
  });
}

window.addEventListener("scroll", updateScrollSpy, { passive: true });
updateScrollSpy();

/* ========== Copy buttons ========== */
document.querySelectorAll(".doc-copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const code = btn.dataset.code || btn.previousElementSibling?.textContent || "";
    try {
      await navigator.clipboard.writeText(code.replace(/\\n/g, "\n"));
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code.replace(/\\n/g, "\n");
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = "Copy";
      btn.classList.remove("copied");
    }, 2000);
  });
});

/* ========== Search ========== */
const searchOverlay = document.getElementById("searchOverlay");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const searchTrigger = document.getElementById("searchTrigger");

// Build search index from headings + content
const searchIndex = [];
sections.forEach((section) => {
  const heading = section.querySelector("h1, h2, h3");
  if (!heading) return;
  const text = section.textContent.substring(0, 300).replace(/\s+/g, " ").trim();
  searchIndex.push({
    id: section.id,
    title: heading.textContent,
    text,
    tag: heading.tagName,
  });
});

function openSearch() {
  searchOverlay.classList.remove("hidden");
  searchInput.value = "";
  searchInput.focus();
  renderSearchResults("");
}

function closeSearch() {
  searchOverlay.classList.add("hidden");
}

function renderSearchResults(query) {
  searchResults.innerHTML = "";
  const q = query.toLowerCase().trim();
  const results = q
    ? searchIndex.filter((item) =>
        item.title.toLowerCase().includes(q) || item.text.toLowerCase().includes(q)
      )
    : searchIndex.filter((item) => item.tag === "H2").slice(0, 8);

  results.slice(0, 10).forEach((item, idx) => {
    const a = document.createElement("a");
    a.className = `doc-search-result${idx === 0 ? " selected" : ""}`;
    a.href = `#${item.id}`;
    a.innerHTML = `<strong>${item.title}</strong><small>${item.text.substring(0, 80)}...</small>`;
    a.addEventListener("click", closeSearch);
    searchResults.appendChild(a);
  });

  if (results.length === 0 && q) {
    const empty = document.createElement("div");
    empty.className = "doc-search-result";
    empty.innerHTML = `<span style="color:var(--text-muted)">No results for "${q}"</span>`;
    searchResults.appendChild(empty);
  }
}

searchTrigger.addEventListener("click", openSearch);

searchOverlay.addEventListener("click", (e) => {
  if (e.target === searchOverlay) closeSearch();
});

searchInput.addEventListener("input", () => {
  renderSearchResults(searchInput.value);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSearch();
  if (e.key === "Enter") {
    const first = searchResults.querySelector(".doc-search-result");
    if (first?.href) {
      first.click();
      closeSearch();
    }
  }
});

// Cmd+K / Ctrl+K shortcut
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    if (searchOverlay.classList.contains("hidden")) {
      openSearch();
    } else {
      closeSearch();
    }
  }
  if (e.key === "Escape" && !searchOverlay.classList.contains("hidden")) {
    closeSearch();
  }
});

/* ========== Mobile menu ========== */
const mobileToggle = document.getElementById("mobileToggle");
const sidebar = document.getElementById("sidebar");

mobileToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

// Close sidebar on link click (mobile)
sidebarLinks.forEach((link) => {
  link.addEventListener("click", () => {
    sidebar.classList.remove("open");
  });
});
