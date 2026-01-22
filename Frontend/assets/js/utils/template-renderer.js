/* ==========================================
   TEMPLATE RENDERER
   Sistema para renderizar templates con datos dinámicos
   Soporta: {{variable}}, {{#if}}, {{#each}}
   ========================================== */

/**
 * Escapar HTML para prevenir XSS
 * @param {string} str - String a escapar
 * @returns {string} - String escapado
 */
function escapeHTML(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Obtener valor anidado de un objeto (ej: "user.name")
 * @param {Object} obj - Objeto
 * @param {string} path - Ruta al valor (ej: "user.name")
 * @returns {*} - Valor encontrado o undefined
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, obj);
}

/**
 * Renderizar template con datos
 * @param {string} template - HTML del template
 * @param {Object} data - Datos para renderizar
 * @param {Object} options - Opciones de renderizado
 * @returns {string} - HTML renderizado
 */
function renderTemplate(template, data = {}, options = {}) {
  if (!template) return '';
  
  let html = template;
  const { escape = true, safe = false } = options;
  
  // Reemplazar variables simples {{variable}}
  html = html.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
    const value = getNestedValue(data, key);
    if (value == null) return '';
    return escape && !safe ? escapeHTML(value) : String(value);
  });
  
  // Reemplazar variables sin escapar {{{variable}}} o {{!variable}}
  html = html.replace(/\{\{\{(\w+(?:\.\w+)*)\}\}\}/g, (match, key) => {
    const value = getNestedValue(data, key);
    return value != null ? String(value) : '';
  });
  
  html = html.replace(/\{\{!(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
    const value = getNestedValue(data, key);
    return value != null ? String(value) : '';
  });
  
  // Reemplazar condicionales {{#if variable}}...{{/if}}
  html = html.replace(/\{\{#if\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
    const value = getNestedValue(data, key);
    const isTruthy = value != null && value !== false && value !== 0 && value !== '';
    return isTruthy ? renderTemplate(content, data, options) : '';
  });
  
  // Reemplazar condicionales negativas {{#unless variable}}...{{/unless}}
  html = html.replace(/\{\{#unless\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (match, key, content) => {
    const value = getNestedValue(data, key);
    const isFalsy = value == null || value === false || value === 0 || value === '';
    return isFalsy ? renderTemplate(content, data, options) : '';
  });
  
  // Reemplazar loops {{#each array}}...{{/each}}
  html = html.replace(/\{\{#each\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, content) => {
    const array = getNestedValue(data, key);
    if (!Array.isArray(array) || array.length === 0) return '';
    
    return array.map((item, index) => {
      // Crear contexto con el item y variables especiales
      const itemContext = {
        ...item,
        '@index': index,
        '@first': index === 0,
        '@last': index === array.length - 1,
        '@odd': index % 2 !== 0,
        '@even': index % 2 === 0
      };
      return renderTemplate(content, itemContext, options);
    }).join('');
  });
  
  // Reemplazar helpers comunes
  
  // {{#eq a b}}...{{/eq}} - Igualdad
  html = html.replace(/\{\{#eq\s+(\w+(?:\.\w+)*)\s+([^\}]+)\}\}([\s\S]*?)\{\{\/eq\}\}/g, (match, key, compare, content) => {
    const value = getNestedValue(data, key);
    const compareValue = compare.trim().replace(/^["']|["']$/g, ''); // Remover comillas
    return String(value) === compareValue ? renderTemplate(content, data, options) : '';
  });
  
  // {{#gt a b}}...{{/gt}} - Mayor que
  html = html.replace(/\{\{#gt\s+(\w+(?:\.\w+)*)\s+([^\}]+)\}\}([\s\S]*?)\{\{\/gt\}\}/g, (match, key, compare, content) => {
    const value = Number(getNestedValue(data, key)) || 0;
    const compareValue = Number(compare.trim()) || 0;
    return value > compareValue ? renderTemplate(content, data, options) : '';
  });
  
  return html;
}

/**
 * Renderizar template y convertir a elemento DOM
 * @param {string} template - HTML del template
 * @param {Object} data - Datos para renderizar
 * @param {Object} options - Opciones de renderizado
 * @returns {HTMLElement|null} - Elemento DOM o null si hay error
 */
function renderTemplateToElement(template, data = {}, options = {}) {
  const html = renderTemplate(template, data, options);
  return parseHTML(html);
}

// Exportar funciones
if (typeof module !== 'undefined' && module.exports) {
  // Node.js
  module.exports = {
    renderTemplate,
    renderTemplateToElement,
    escapeHTML,
    getNestedValue
  };
} else {
  // Browser - agregar al objeto window
  window.TemplateRenderer = {
    renderTemplate,
    renderTemplateToElement,
    escapeHTML,
    getNestedValue
  };
}
