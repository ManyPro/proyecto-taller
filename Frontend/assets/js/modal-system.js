(function () {
  function getModalElements() {
    const modal = document.getElementById("modal");
    if (!modal) return null;
    const panel =
      modal.querySelector(".modal-content") ||
      modal.querySelector(".ui-modal-panel") ||
      modal.firstElementChild;
    const body = document.getElementById("modalBody") || panel;
    const close = document.getElementById("modalClose") || modal.querySelector(".close");
    return { modal, panel, body, close };
  }

  function openModal() {
    const parts = getModalElements();
    if (!parts) return;
    const { modal } = parts;
    modal.classList.remove("hidden");
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    const parts = getModalElements();
    if (!parts) return;
    const { modal } = parts;
    modal.classList.add("hidden");
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function setBody(content) {
    const parts = getModalElements();
    if (!parts || !parts.body) return;
    if (typeof content === "string") {
      parts.body.innerHTML = content;
    } else if (content instanceof Node) {
      parts.body.innerHTML = "";
      parts.body.appendChild(content);
    }
  }

  function bind() {
    const parts = getModalElements();
    if (!parts) return;
    const { modal, panel, close } = parts;

    if (close && !close.dataset.mmModalBound) {
      close.dataset.mmModalBound = "1";
      close.addEventListener("click", closeModal);
    }

    if (!modal.dataset.mmModalBackdropBound) {
      modal.dataset.mmModalBackdropBound = "1";
      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal();
      });
    }

    if (panel && !panel.classList.contains("ui-modal-panel")) {
      panel.classList.add("ui-modal-panel");
    }
    if (!modal.classList.contains("ui-modal")) {
      modal.classList.add("ui-modal");
    }

    if (!modal.dataset.mmModalObserverBound) {
      modal.dataset.mmModalObserverBound = "1";
      const observer = new MutationObserver(() => {
        const isHidden = modal.classList.contains("hidden");
        modal.classList.toggle("is-open", !isHidden);
        modal.setAttribute("aria-hidden", isHidden ? "true" : "false");
      });
      observer.observe(modal, { attributes: true, attributeFilter: ["class"] });
    }

    if (!document.body.dataset.mmModalEscBound) {
      document.body.dataset.mmModalEscBound = "1";
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeModal();
      });
    }
  }

  function init() {
    bind();
  }

  window.MMModal = {
    init,
    open: openModal,
    close: closeModal,
    setBody,
    get: getModalElements,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
