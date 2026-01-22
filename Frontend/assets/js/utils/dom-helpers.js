/* ==========================================
   DOM HELPERS
   Utilidades para manipulación del DOM
   ========================================== */

/**
 * Parsear HTML string a elemento DOM
 * @param {string} htmlString - String HTML
 * @returns {HTMLElement|null} - Primer elemento o null si hay error
 */
function parseHTML(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') {
    console.error('[DOMHelpers] Invalid HTML string provided');
    return null;
  }
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  
  // Verificar errores de parsing
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    console.error('[DOMHelpers] Error parsing HTML:', parserError.textContent);
    return null;
  }
  
  return doc.body.firstElementChild;
}

/**
 * Parsear HTML string a fragmento DOM (múltiples elementos)
 * @param {string} htmlString - String HTML
 * @returns {DocumentFragment} - Fragmento con elementos
 */
function parseHTMLFragment(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') {
    console.error('[DOMHelpers] Invalid HTML string provided');
    return document.createDocumentFragment();
  }
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  
  const fragment = document.createDocumentFragment();
  while (doc.body.firstChild) {
    fragment.appendChild(doc.body.firstChild);
  }
  
  return fragment;
}

/**
 * Clonar template desde elemento <template>
 * @param {string} id - ID del elemento <template>
 * @returns {DocumentFragment|null} - Fragmento clonado o null
 */
function cloneTemplate(id) {
  const template = document.getElementById(id);
  
  if (!template) {
    console.error(`[DOMHelpers] Template element not found: #${id}`);
    return null;
  }
  
  if (template.tagName !== 'TEMPLATE') {
    console.error(`[DOMHelpers] Element #${id} is not a <template> element`);
    return null;
  }
  
  return template.content.cloneNode(true);
}

/**
 * Mostrar elemento (remover clase hidden, agregar visible)
 * @param {HTMLElement} element - Elemento a mostrar
 */
function showElement(element) {
  if (!element) return;
  element.classList.remove('hidden');
  element.classList.add('visible');
  element.classList.add('js-show');
  element.classList.remove('js-hide');
}

/**
 * Ocultar elemento (agregar clase hidden, remover visible)
 * @param {HTMLElement} element - Elemento a ocultar
 */
function hideElement(element) {
  if (!element) return;
  element.classList.add('hidden');
  element.classList.remove('visible');
  element.classList.add('js-hide');
  element.classList.remove('js-show');
}

/**
 * Toggle visibilidad de elemento
 * @param {HTMLElement} element - Elemento a toggle
 * @returns {boolean} - true si está visible después del toggle
 */
function toggleElement(element) {
  if (!element) return false;
  const isHidden = element.classList.contains('hidden');
  if (isHidden) {
    showElement(element);
    return true;
  } else {
    hideElement(element);
    return false;
  }
}

/**
 * Agregar clases CSS a elemento
 * @param {HTMLElement} element - Elemento
 * @param {...string} classes - Clases a agregar
 */
function addClasses(element, ...classes) {
  if (!element) return;
  element.classList.add(...classes.filter(Boolean));
}

/**
 * Remover clases CSS de elemento
 * @param {HTMLElement} element - Elemento
 * @param {...string} classes - Clases a remover
 */
function removeClasses(element, ...classes) {
  if (!element) return;
  element.classList.remove(...classes.filter(Boolean));
}

/**
 * Toggle clases CSS
 * @param {HTMLElement} element - Elemento
 * @param {...string} classes - Clases a toggle
 */
function toggleClasses(element, ...classes) {
  if (!element) return;
  classes.filter(Boolean).forEach(className => {
    element.classList.toggle(className);
  });
}

/**
 * Bind eventos a elementos dentro de un contenedor
 * @param {HTMLElement} container - Contenedor
 * @param {string} selector - Selector CSS
 * @param {string} event - Tipo de evento
 * @param {Function} handler - Manejador de evento
 */
function bindEvent(container, selector, event, handler) {
  if (!container) return;
  
  container.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && container.contains(target)) {
      handler.call(target, e);
    }
  });
}

/**
 * Bind múltiples eventos
 * @param {HTMLElement} container - Contenedor
 * @param {Object} events - Objeto con selectores y handlers { selector: { event: handler } }
 */
function bindEvents(container, events) {
  if (!container) return;
  
  Object.entries(events).forEach(([selector, handlers]) => {
    Object.entries(handlers).forEach(([event, handler]) => {
      bindEvent(container, selector, event, handler);
    });
  });
}

/**
 * Debounce function
 * @param {Function} func - Función a debounce
 * @param {number} wait - Tiempo de espera en ms
 * @returns {Function} - Función debounced
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 * @param {Function} func - Función a throttle
 * @param {number} limit - Límite de tiempo en ms
 * @returns {Function} - Función throttled
 */
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Exportar funciones
if (typeof module !== 'undefined' && module.exports) {
  // Node.js
  module.exports = {
    parseHTML,
    parseHTMLFragment,
    cloneTemplate,
    showElement,
    hideElement,
    toggleElement,
    addClasses,
    removeClasses,
    toggleClasses,
    bindEvent,
    bindEvents,
    debounce,
    throttle
  };
} else {
  // Browser - agregar al objeto window
  window.DOMHelpers = {
    parseHTML,
    parseHTMLFragment,
    cloneTemplate,
    showElement,
    hideElement,
    toggleElement,
    addClasses,
    removeClasses,
    toggleClasses,
    bindEvent,
    bindEvents,
    debounce,
    throttle
  };
  
  // También exportar funciones globales para uso directo
  window.parseHTML = parseHTML;
  window.parseHTMLFragment = parseHTMLFragment;
  window.cloneTemplate = cloneTemplate;
  window.showElement = showElement;
  window.hideElement = hideElement;
  window.toggleElement = toggleElement;
}
