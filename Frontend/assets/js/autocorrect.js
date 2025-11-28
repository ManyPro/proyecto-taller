/**
 * Autocorrector personalizado para campos de texto
 * Permite definir correcciones personalizadas (especialmente para términos de mecánica)
 * y revertir cambios si es necesario
 */

// Diccionario de correcciones (palabra incorrecta -> palabra correcta)
// Solo incluir palabras que realmente necesitan corrección
const corrections = {
  // Términos de mecánica - errores tipográficos comunes
  'frenoss': 'frenos',
  'frenoz': 'frenos',
  'pastillaz': 'pastillas',
  'pastillass': 'pastillas',
  'aceitee': 'aceite',
  'transmision': 'transmisión',
  'suspencion': 'suspensión',
  'direccion': 'dirección',
  'amortiguadorez': 'amortiguadores',
  'bateria': 'batería',
  'alternadore': 'alternador',
  'bujias': 'bujías',
  'inyeccion': 'inyección',
  'neumatico': 'neumático',
  'neumaticos': 'neumáticos',
  'alineacion': 'alineación',
  'rotacion': 'rotación',
  'diagnostico': 'diagnóstico',
  'valvula': 'válvula',
  'valvulas': 'válvulas',
  'piston': 'pistón',
  'cigueñal': 'cigüeñal',
  'arbol': 'árbol',
  'liquido': 'líquido',
  'liquidos': 'líquidos',
  // Términos generales - errores comunes
  'vehiculo': 'vehículo',
  'vehiculos': 'vehículos',
  'cotizacion': 'cotización',
  'descripcion': 'descripción',
  'observacion': 'observación',
  'tecnico': 'técnico',
  'tecnicos': 'técnicos',
  'mecanico': 'mecánico',
  'mecanicos': 'mecánicos',
  'iva': 'IVA',
};

// Historial de cambios para poder revertir
const changeHistory = new WeakMap();

/**
 * Normaliza una palabra para comparación (sin acentos, minúsculas)
 */
function normalizeWord(word) {
  return word.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Aplica correcciones a un texto
 */
function applyCorrections(text) {
  if (!text || typeof text !== 'string') return text;
  
  const words = text.split(/(\s+|[.,;:!?()\[\]{}"'/-])/);
  const corrected = words.map(word => {
    const normalized = normalizeWord(word);
    if (corrections[normalized]) {
      // Preservar mayúsculas/minúsculas originales
      const originalCase = word;
      const isUpperCase = originalCase === originalCase.toUpperCase();
      const isCapitalized = originalCase[0] === originalCase[0]?.toUpperCase();
      
      let correctedWord = corrections[normalized];
      if (isUpperCase) {
        correctedWord = correctedWord.toUpperCase();
      } else if (isCapitalized) {
        correctedWord = correctedWord.charAt(0).toUpperCase() + correctedWord.slice(1);
      }
      
      return correctedWord;
    }
    return word;
  });
  
  return corrected.join('');
}

/**
 * Configura el autocorrector en un campo de texto
 */
export function setupAutocorrect(input) {
  if (!input || (input.tagName !== 'INPUT' && input.tagName !== 'TEXTAREA')) return;
  
  // Guardar valor original antes de aplicar correcciones
  let lastValue = input.value;
  changeHistory.set(input, [lastValue]);
  
  // Aplicar correcciones al perder el foco (blur)
  input.addEventListener('blur', (e) => {
    const currentValue = e.target.value;
    if (!currentValue) return;
    
    const corrected = applyCorrections(currentValue);
    if (corrected !== currentValue) {
      // Guardar en historial
      const history = changeHistory.get(input) || [];
      history.push(currentValue);
      if (history.length > 10) history.shift(); // Limitar historial
      changeHistory.set(input, history);
      
      // Aplicar corrección
      e.target.value = corrected;
      e.target.dispatchEvent(new Event('input', { bubbles: true }));
      e.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  
  // Permitir revertir con Ctrl+Z
  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      const history = changeHistory.get(input);
      if (history && history.length > 1) {
        e.preventDefault();
        history.pop(); // Remover valor actual
        const previousValue = history[history.length - 1];
        input.value = previousValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
}

/**
 * Configura el autocorrector en múltiples campos
 */
export function setupAutocorrectForSelector(selector, context = document) {
  const inputs = context.querySelectorAll(selector);
  inputs.forEach(input => {
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
      setupAutocorrect(input);
    }
  });
}

/**
 * Agrega una corrección personalizada al diccionario
 */
export function addCorrection(incorrect, correct) {
  const normalized = normalizeWord(incorrect);
  corrections[normalized] = correct;
}

/**
 * Agrega múltiples correcciones al diccionario
 */
export function addCorrections(correctionsObj) {
  Object.entries(correctionsObj).forEach(([incorrect, correct]) => {
    addCorrection(incorrect, correct);
  });
}

/**
 * Obtiene todas las correcciones del diccionario
 */
export function getCorrections() {
  return { ...corrections };
}
