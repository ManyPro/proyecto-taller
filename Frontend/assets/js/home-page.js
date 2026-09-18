/**
 * UI específica de index.html (Inicio): menú móvil, sync cabecera, catálogo público.
 * La navegación por pestañas la centraliza app.js (nav-tab / mobile-nav-tab).
 */
(function () {
  function setHamburgerIcon(svgEl, open) {
    if (!svgEl) return;
    svgEl.innerHTML = open
      ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>'
      : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>';
  }

  function setupMobileMenu() {
    const mobileMenuToggle = document.getElementById("mobileMenuToggle");
    const mobileMenu = document.getElementById("mobileMenu");
    if (!mobileMenuToggle || !mobileMenu) return;

    mobileMenuToggle.addEventListener("click", () => {
      mobileMenu.classList.toggle("hidden");
      const icon = mobileMenuToggle.querySelector("svg");
      setHamburgerIcon(icon, !mobileMenu.classList.contains("hidden"));
    });

    mobileMenu.querySelectorAll(".mobile-nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        mobileMenu.classList.add("hidden");
        setHamburgerIcon(mobileMenuToggle.querySelector("svg"), false);
      });
    });
  }

  function syncCompanyNameMobile() {
    const companyName = document.getElementById("companyName");
    const companyNameMobile = document.getElementById("companyNameMobile");
    if (!companyName || !companyNameMobile) return;
    const observer = new MutationObserver(() => {
      companyNameMobile.textContent = companyName.textContent;
    });
    observer.observe(companyName, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    companyNameMobile.textContent = companyName.textContent;
  }

  function syncLogoutMobile() {
    const logoutBtn = document.getElementById("logoutBtn");
    const logoutBtnMobile = document.getElementById("logoutBtnMobile");
    if (!logoutBtn || !logoutBtnMobile) return;

    logoutBtnMobile.addEventListener("click", () => {
      logoutBtn.click();
    });

    const logoutObserver = new MutationObserver(() => {
      logoutBtnMobile.classList.toggle(
        "hidden",
        logoutBtn.classList.contains("hidden")
      );
    });
    logoutObserver.observe(logoutBtn, {
      attributes: true,
      attributeFilter: ["class"],
    });
    logoutBtnMobile.classList.toggle(
      "hidden",
      logoutBtn.classList.contains("hidden")
    );
  }

  function setupPublicCatalogButtons() {
    const buttons = document.querySelectorAll(".js-open-public-catalog");
    if (!buttons.length) return;

    function tryBind() {
      const API = window.API;
      if (!API || !API.token || !API.token.get) {
        setTimeout(tryBind, 100);
        return;
      }

      const applyToButton = (btn) => {
        const token = API.token.get() || "";
        if (!token) {
          btn.disabled = true;
          btn.title = "Inicia sesión para usar el catálogo";
          return;
        }

        const finish = (companyId, enabled) => {
          if (!companyId) {
            btn.disabled = true;
            btn.title = "No se pudo obtener companyId";
            return;
          }
          if (enabled === false) {
            btn.disabled = true;
            btn.title = "Catálogo público deshabilitado";
            btn.dataset.state = "disabled";
            return;
          }
          btn.dataset.state = "ready";
          btn.disabled = false;
          btn.onclick = () => {
            const url =
              "catalogo.html?companyId=" + encodeURIComponent(companyId);
            window.open(url, "_blank");
          };
        };

        (API.companyMe ? API.companyMe() : Promise.reject(new Error("API")))
          .then((body) => {
            const company = body?.company || body || {};
            const storedId = API?.companyId?.get?.() || "";
            const companyId = company.id || company._id || storedId || "";
            const enabled =
              typeof company.publicCatalogEnabled === "boolean"
                ? company.publicCatalogEnabled
                : true;
            finish(companyId, enabled);
          })
          .catch(() => {
            const storedId = API?.companyId?.get?.() || "";
            if (storedId) {
              btn.dataset.state = "ready";
              btn.title = "";
              btn.disabled = false;
              btn.onclick = () =>
                window.open(
                  "catalogo.html?companyId=" + encodeURIComponent(storedId),
                  "_blank"
                );
            } else {
              btn.disabled = true;
              btn.title = "Error consultando empresa";
              btn.dataset.state = "error";
            }
          });
      };

      buttons.forEach(applyToButton);
    }

    tryBind();
  }

  function init() {
    setupMobileMenu();
    syncCompanyNameMobile();
    syncLogoutMobile();
    setupPublicCatalogButtons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
