/**
 * Utilidades de búsqueda para normalizar texto y hacer búsquedas más flexibles
 */

/**
 * Normaliza un texto removiendo tildes y caracteres especiales para búsquedas
 * @param {string} text - Texto a normalizar
 * @returns {string} - Texto normalizado
 */
export function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .toLowerCase()
    .normalize('NFD') // Descompone caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Remueve marcas diacríticas (tildes)
    .replace(/[^\w\s]/g, '') // Remueve caracteres especiales excepto letras, números y espacios
    .replace(/\s+/g, ' ') // Normaliza espacios múltiples a uno solo
    .trim();
}

/**
 * Crea una expresión regular flexible para búsquedas
 * @param {string} searchTerm - Término de búsqueda
 * @param {object} options - Opciones de búsqueda
 * @returns {RegExp} - Expresión regular para búsqueda
 */
export function createFlexibleRegex(searchTerm, options = {}) {
  if (!searchTerm || typeof searchTerm !== 'string') {
    return new RegExp('', 'i');
  }
  
  const {
    caseSensitive = false,
    exactMatch = false,
    wordBoundary = false
  } = options;
  
  // Normalizar el término de búsqueda
  const normalized = normalizeText(searchTerm);
  
  // Si está vacío después de normalizar, devolver regex que no matchea nada
  if (!normalized) {
    return new RegExp('', 'i');
  }
  
  // Escapar caracteres especiales de regex excepto espacios
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Crear el patrón de búsqueda
  let pattern = escaped;
  
  if (!exactMatch) {
    // Permitir coincidencias parciales
    pattern = escaped.split(' ').map(word => {
      if (word.length > 0) {
        return wordBoundary ? `\\b${word}\\b` : word;
      }
      return word;
    }).join('.*');
  }
  
  const flags = caseSensitive ? 'g' : 'gi';
  return new RegExp(pattern, flags);
}

/**
 * Verifica si un texto coincide con un término de búsqueda usando normalización
 * @param {string} text - Texto a buscar
 * @param {string} searchTerm - Término de búsqueda
 * @param {object} options - Opciones de búsqueda
 * @returns {boolean} - True si coincide
 */
export function matchesSearch(text, searchTerm, options = {}) {
  if (!text || !searchTerm) return false;
  
  const normalizedText = normalizeText(text);
  const normalizedSearch = normalizeText(searchTerm);
  
  if (!normalizedSearch) return false;
  
  const { exactMatch = false } = options;
  
  if (exactMatch) {
    return normalizedText === normalizedSearch;
  }
  
  // Búsqueda parcial - verificar si todas las palabras del término están en el texto
  const searchWords = normalizedSearch.split(' ').filter(word => word.length > 0);
  const textWords = normalizedText.split(' ');
  
  return searchWords.every(searchWord => 
    textWords.some(textWord => textWord.includes(searchWord))
  );
}

/**
 * Filtra un array de objetos basado en un término de búsqueda
 * @param {Array} items - Array de objetos a filtrar
 * @param {string} searchTerm - Término de búsqueda
 * @param {Array} searchFields - Campos en los que buscar
 * @param {object} options - Opciones de búsqueda
 * @returns {Array} - Array filtrado
 */
export function filterItems(items, searchTerm, searchFields = [], options = {}) {
  if (!Array.isArray(items) || !searchTerm || !Array.isArray(searchFields)) {
    return items || [];
  }
  
  const normalizedSearch = normalizeText(searchTerm);
  if (!normalizedSearch) return items;
  
  return items.filter(item => {
    return searchFields.some(field => {
      const fieldValue = getNestedValue(item, field);
      if (!fieldValue) return false;
      
      return matchesSearch(String(fieldValue), searchTerm, options);
    });
  });
}

/**
 * Obtiene un valor anidado de un objeto usando notación de punto
 * @param {object} obj - Objeto
 * @param {string} path - Ruta al valor (ej: 'user.name')
 * @returns {any} - Valor encontrado o undefined
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Crea un query de MongoDB flexible para búsquedas
 * @param {string} searchTerm - Término de búsqueda
 * @param {Array} fields - Campos en los que buscar
 * @param {object} options - Opciones adicionales
 * @returns {object} - Query de MongoDB
 */
export function createMongoSearchQuery(searchTerm, fields = [], options = {}) {
  if (!searchTerm || !Array.isArray(fields) || fields.length === 0) {
    return {};
  }
  
  const normalizedSearch = normalizeText(searchTerm);
  if (!normalizedSearch) return {};
  
  const { exactMatch = false } = options;
  
  if (exactMatch) {
    // Búsqueda exacta normalizada
    return {
      $or: fields.map(field => ({
        [field]: { $regex: `^${normalizedSearch}$`, $options: 'i' }
      }))
    };
  }
  
  // Búsqueda parcial - crear regex que busque todas las palabras
  const searchWords = normalizedSearch.split(' ').filter(word => word.length > 0);
  
  if (searchWords.length === 0) return {};
  
  // Crear regex que busque todas las palabras en cualquier orden
  const regexPattern = searchWords.map(word => `(?=.*${word})`).join('');
  
  return {
    $or: fields.map(field => ({
      [field]: { $regex: regexPattern, $options: 'i' }
    }))
  };
}
