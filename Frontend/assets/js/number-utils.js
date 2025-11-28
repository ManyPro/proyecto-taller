/**
 * Utilidades para normalizar números con formato de separadores de miles
 * Maneja correctamente valores como "900.000" -> 900000, "1.000.000" -> 1000000
 */

/**
 * Normaliza un valor numérico que puede tener formato de separadores de miles (puntos)
 * y separador decimal (coma o punto).
 * 
 * Ejemplos:
 * - "900.000" -> 900000
 * - "1.000.000" -> 1000000
 * - "1.500.000" -> 1500000
 * - "900.000,50" -> 900000.50 (formato europeo: punto para miles, coma para decimales)
 * - "900000.50" -> 900000.50 (formato estándar)
 * 
 * @param {string|number} value - El valor a normalizar
 * @returns {number} El número normalizado, o 0 si no es válido
 */
export function normalizeNumberWithThousands(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  
  // Convertir a string y limpiar espacios
  let str = String(value).trim().replace(/\s+/g, '');
  
  // Si está vacío después de limpiar, retornar 0
  if (!str) return 0;
  
  // Detectar formato: si tiene coma como último separador decimal, es formato europeo
  // Ejemplo: "1.500.000,50" -> formato europeo (punto=miles, coma=decimal)
  // Ejemplo: "1.500.000.50" -> formato estándar (punto=decimal)
  const hasCommaDecimal = /,\d{1,2}$/.test(str);
  const hasPointDecimal = /\.\d{1,2}$/.test(str) && !hasCommaDecimal;
  
  if (hasCommaDecimal) {
    // Formato europeo: punto=miles, coma=decimal
    // "1.500.000,50" -> "1500000.50"
    str = str.replace(/\./g, ''); // Eliminar todos los puntos (separadores de miles)
    str = str.replace(',', '.'); // Convertir coma decimal a punto
  } else {
    // Formato estándar o solo separadores de miles
    // Contar puntos
    const pointCount = (str.match(/\./g) || []).length;
    
    if (pointCount > 1) {
      // Múltiples puntos = separadores de miles
      // "1.500.000" -> "1500000"
      str = str.replace(/\./g, '');
    } else if (pointCount === 1) {
      // Un solo punto: determinar si es decimal o separador de miles
      const parts = str.split('.');
      const beforePoint = parts[0] || '';
      const afterPoint = parts[1] || '';
      
      // Si tiene 3 dígitos después del punto Y el número antes tiene más de 3 dígitos, es separador de miles
      // Si tiene 1-2 dígitos después, probablemente es decimal
      if (afterPoint.length === 3 && beforePoint.length > 3) {
        // Separador de miles: "1.500" -> "1500"
        str = str.replace(/\./g, '');
      } else if (afterPoint.length > 3) {
        // Más de 3 dígitos después del punto, probablemente es separador de miles mal formateado
        str = str.replace(/\./g, '');
      }
      // Si tiene 1-2 dígitos después del punto, mantenerlo como decimal
    }
  }
  
  // Limpiar cualquier carácter no numérico excepto punto y signo negativo
  str = str.replace(/[^\d.\-]/g, '');
  
  // Convertir a número
  const num = parseFloat(str);
  
  // Retornar el número si es válido, sino 0
  return Number.isFinite(num) ? num : 0;
}

/**
 * Configura un campo de entrada numérico para normalizar valores pegados
 * con formato de separadores de miles.
 * 
 * @param {HTMLInputElement} input - El campo de entrada a configurar
 */
export function setupNumberInputPasteHandler(input) {
  if (!input || input.tagName !== 'INPUT') return;
  
  input.addEventListener('paste', (e) => {
    // Obtener el texto pegado
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    
    if (!pastedText) return;
    
    // Normalizar el número
    const normalized = normalizeNumberWithThousands(pastedText);
    
    // Prevenir el comportamiento por defecto
    e.preventDefault();
    
    // Establecer el valor normalizado
    // Si el campo es de tipo number, usar valueAsNumber si está disponible
    if (input.type === 'number') {
      input.valueAsNumber = normalized;
      // También actualizar value para asegurar compatibilidad
      input.value = normalized.toString();
    } else {
      input.value = normalized.toString();
    }
    
    // Disparar evento input para que otros listeners sepan que cambió
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/**
 * Configura múltiples campos de entrada numéricos para normalizar valores pegados.
 * 
 * @param {string} selector - Selector CSS para encontrar los campos
 * @param {HTMLElement} context - Contexto donde buscar (default: document)
 */
export function setupNumberInputsPasteHandler(selector, context = document) {
  const inputs = context.querySelectorAll(selector);
  inputs.forEach(input => {
    if (input.tagName === 'INPUT' && (input.type === 'number' || input.type === 'text')) {
      setupNumberInputPasteHandler(input);
    }
  });
}

