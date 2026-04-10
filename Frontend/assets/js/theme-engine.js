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

    const logo = document.getElementById("brandLogo");
    if (logo) {
      const src = isLight ? "assets/darklogo.png" : "assets/lightlogo.png";
      if (logo.getAttribute("src") !== src) logo.setAttribute("src", src);
    }
  }

  function toggleTheme() {
    setTheme(document.body.classList.contains("theme-light") ? "dark" : "light");
  }

  function eventTargetElement(target) {
    if (!target) return null;
    if (target.nodeType === Node.ELEMENT_NODE) return target;
    const p = target.parentElement;
    return p && p.nodeType === Node.ELEMENT_NODE ? p : null;
  }

  let themeClickBound = false;
  function bindToggles() {
    document
      .querySelectorAll("#themeToggle, #themeToggleMobile, #themeTogglePortal, #themeToggleLogin, #themeToggleAdmin, #themeToggleSelector")
      .forEach((btn) => btn.setAttribute("data-theme-toggle", "1"));
    if (themeClickBound) return;
    themeClickBound = true;
    document.addEventListener("click", (event) => {
      const el = eventTargetElement(event.target);
      const trigger = el && el.closest(
        "[data-theme-toggle], #themeToggle, #themeToggleMobile, #themeTogglePortal, #themeToggleLogin, #themeToggleAdmin, #themeToggleSelector"
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
    link.href = "./assets/ui.css?v=20260406";
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
