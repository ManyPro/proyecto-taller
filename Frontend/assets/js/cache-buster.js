// Cache busting helper
// Este script se ejecuta ANTES de otros scripts para agregar versiones a las URLs
(function() {
  // Obtener versión de config.js si ya está cargado, sino usar timestamp
  const getVersion = function() {
    if (window.APP_VERSION) {
      return window.APP_VERSION;
    }
    // Si config.js aún no se ha cargado, usar timestamp
    return Date.now();
  };
  
  // Función para agregar versión a una URL
  const addVersion = function(url) {
    if (!url) return url;
    const version = getVersion();
    if (url.includes('?v=') || url.includes('&v=')) {
      return url; // Ya tiene versión
    }
    const separator = url.includes('?') ? '&' : '?';
    return url + separator + 'v=' + version;
  };
  
  // Interceptar y modificar URLs antes de que se carguen
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName) {
    const element = originalCreateElement.call(document, tagName);
    
    if (tagName.toLowerCase() === 'script') {
      const originalSetAttribute = element.setAttribute;
      element.setAttribute = function(name, value) {
        if (name === 'src' && value && value.includes('assets/')) {
          value = addVersion(value);
        }
        return originalSetAttribute.call(this, name, value);
      };
    }
    
    if (tagName.toLowerCase() === 'link') {
      const originalSetAttribute = element.setAttribute;
      element.setAttribute = function(name, value) {
        if (name === 'href' && value && value.includes('assets/')) {
          value = addVersion(value);
        }
        return originalSetAttribute.call(this, name, value);
      };
    }
    
    return element;
  };
  
  // También modificar scripts y links existentes en el DOM
  const processExistingAssets = function() {
    const version = getVersion();
    
    // Procesar scripts
    document.querySelectorAll('script[src*="assets/"]:not([data-versioned])').forEach(script => {
      const src = script.getAttribute('src');
      if (src && !src.includes('?v=') && !src.includes('&v=')) {
        script.setAttribute('src', addVersion(src));
        script.setAttribute('data-versioned', 'true');
      }
    });
    
    // Procesar links
    document.querySelectorAll('link[href*="assets/"]:not([data-versioned])').forEach(link => {
      const href = link.getAttribute('href');
      if (href && !href.includes('?v=') && !href.includes('&v=')) {
        link.setAttribute('href', addVersion(href));
        link.setAttribute('data-versioned', 'true');
      }
    });
  };
  
  // Ejecutar inmediatamente y después de que el DOM esté listo
  processExistingAssets();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processExistingAssets);
  }
  
  // También ejecutar después de un pequeño delay para asegurar que config.js se haya cargado
  setTimeout(function() {
    processExistingAssets();
  }, 50);
})();

