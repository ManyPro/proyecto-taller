/* ==========================================
   TEMPLATE LOADER
   Sistema para cargar templates desde archivos HTML o elementos <template>
   ========================================== */

// Cache de templates cargados
const templateCache = new Map();

/**
 * Cargar template desde archivo HTML
 * @param {string} path - Ruta relativa desde assets/templates/
 * @returns {Promise<HTMLElement|null>} - Elemento HTML del template o null si hay error
 */
async function loadTemplate(path) {
  // Verificar cache primero
  if (templateCache.has(path)) {
    return templateCache.get(path).cloneNode(true);
  }
  
  try {
    const fullPath = `assets/templates/${path}`;
    const response = await fetch(fullPath);
    
    if (!response.ok) {
      throw new Error(`Template not found: ${path} (${response.status})`);
    }
    
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Verificar si hay errores de parsing
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`Error parsing template ${path}: ${parserError.textContent}`);
    }
    
    const template = doc.body.firstElementChild;
    
    if (!template) {
      throw new Error(`Template ${path} is empty or invalid`);
    }
    
    // Guardar en cache (clonar para evitar mutaciones)
    templateCache.set(path, template.cloneNode(true));
    
    return template.cloneNode(true);
  } catch (error) {
    console.error(`[TemplateLoader] Error loading template ${path}:`, error);
    return null;
  }
}

/**
 * Obtener template desde elemento <template> en el DOM
 * @param {string} id - ID del elemento <template>
 * @returns {DocumentFragment|null} - Fragmento clonado o null si no existe
 */
function getTemplateElement(id) {
  const template = document.getElementById(id);
  
  if (!template) {
    console.error(`[TemplateLoader] Template element not found: #${id}`);
    return null;
  }
  
  if (template.tagName !== 'TEMPLATE') {
    console.error(`[TemplateLoader] Element #${id} is not a <template> element`);
    return null;
  }
  
  return template.content.cloneNode(true);
}

/**
 * Pre-cargar templates (útil para mejorar performance)
 * @param {string[]} paths - Array de rutas de templates a pre-cargar
 * @returns {Promise<void>}
 */
async function preloadTemplates(paths) {
  const promises = paths.map(path => loadTemplate(path));
  await Promise.all(promises);
  console.log(`[TemplateLoader] Pre-loaded ${paths.length} templates`);
}

/**
 * Limpiar cache de templates
 */
function clearTemplateCache() {
  templateCache.clear();
  console.log('[TemplateLoader] Template cache cleared');
}

/**
 * Obtener estadísticas del cache
 * @returns {Object} - Estadísticas del cache
 */
function getCacheStats() {
  return {
    size: templateCache.size,
    keys: Array.from(templateCache.keys())
  };
}

// Exportar funciones
if (typeof module !== 'undefined' && module.exports) {
  // Node.js
  module.exports = {
    loadTemplate,
    getTemplateElement,
    preloadTemplates,
    clearTemplateCache,
    getCacheStats
  };
} else {
  // Browser - agregar al objeto window
  window.TemplateLoader = {
    loadTemplate,
    getTemplateElement,
    preloadTemplates,
    clearTemplateCache,
    getCacheStats
  };
}
