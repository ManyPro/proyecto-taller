(function () {
  const THEME_KEY = "app:theme";
  const THEME_LIGHT = "light";
  const THEME_DARK = "dark";

  function getStoredTheme() {
    try {
      const value = localStorage.getItem(THEME_KEY);
      if (value === THEME_LIGHT || value === THEME_DARK) return value;
    } catch (_) {}
    return null;
  }

  function detectTheme() {
    const saved = getStoredTheme();
    if (saved) return saved;
    try {
      const prefersLight =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches;
      return prefersLight ? THEME_LIGHT : THEME_DARK;
    } catch (_) {
      return THEME_DARK;
    }
  }

  function setTheme(theme) {
    const body = document.body;
    if (!body) return;
    const isLight = theme === THEME_LIGHT;
    body.classList.toggle("theme-light", isLight);
    body.classList.toggle("theme-dark", !isLight);
    body.setAttribute("data-theme", isLight ? THEME_LIGHT : THEME_DARK);

    try {
      localStorage.setItem(THEME_KEY, isLight ? THEME_LIGHT : THEME_DARK);
    } catch (_) {}

    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.textContent = isLight ? "🌙" : "🌞";
      btn.setAttribute(
        "title",
        isLight ? "Cambiar a oscuro" : "Cambiar a claro"
      );
      btn.setAttribute("aria-label", btn.getAttribute("title"));
    });
  }

  function toggleTheme() {
    setTheme(document.body.classList.contains("theme-light") ? "dark" : "light");
  }

  function bindToggles() {
    document
      .querySelectorAll("#themeToggle, #themeTogglePortal, #themeToggleLogin, #themeToggleAdmin")
      .forEach((btn) => btn.setAttribute("data-theme-toggle", "1"));
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest(
        "[data-theme-toggle], #themeToggle, #themeTogglePortal, #themeToggleLogin, #themeToggleAdmin"
      );
      if (!trigger) return;
      event.preventDefault();
      toggleTheme();
    });
  }

  function initTheme() {
    ensureUiCssPriority();
    setTheme(detectTheme());
    bindToggles();
  }

  function ensureUiCssPriority() {
    const head = document.head;
    if (!head) return;
    const existing = document.querySelector('link[href*="assets/ui.css"]');
    if (existing) {
      head.appendChild(existing);
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./assets/ui.css?v=20260330";
    head.appendChild(link);
  }

  window.MMTheme = {
    init: initTheme,
    setTheme,
    toggleTheme,
    detectTheme,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme, { once: true });
  } else {
    initTheme();
  }
})();
