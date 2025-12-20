/**
 * Util centralizado para manejo de fechas y horas usando date-fns
 * 
 * IMPORTANTE: Todas las fechas se guardan en UTC (GMT+0) en MongoDB
 * y se muestran en UTC (GMT+0) en el frontend.
 * 
 * Esto asegura consistencia y evita problemas de timezone.
 */

import {
  parseISO,
  format,
  isValid,
  compareAsc
} from 'date-fns';

/**
 * Convierte una fecha/hora a UTC para guardar en MongoDB
 * IMPORTANTE: Interpreta las fechas como UTC directamente (GMT+0)
 * Si el usuario ingresa 15:03, se guarda como 15:03 UTC (no se convierte)
 * @param {string|Date} dateInput - Fecha en formato string o Date
 * @returns {Date} Fecha en UTC (GMT+0)
 */
export function localToUTC(dateInput) {
  if (!dateInput) return null;
  
  // Si ya es un objeto Date, devolverlo directamente (ya está en UTC internamente)
  if (dateInput instanceof Date) {
    if (isValid(dateInput)) {
      return dateInput;
    }
    return null;
  }
  
  // Si es string, parsearlo como UTC
  if (typeof dateInput === 'string') {
    // Si ya tiene 'Z' o offset, parsear directamente
    if (dateInput.includes('Z') || dateInput.match(/[+-]\d{2}:\d{2}$/)) {
      const date = parseISO(dateInput);
      return isValid(date) ? date : null;
    }
    
    // Si es string ISO sin zona horaria, agregar 'Z' para forzar UTC
    // Esto hace que "2024-01-15T15:03:00" se interprete como "2024-01-15T15:03:00Z" (UTC)
    if (dateInput.includes('T')) {
      const date = parseISO(dateInput + 'Z');
      return isValid(date) ? date : null;
    }
    
    // Si es solo fecha (YYYY-MM-DD), crear fecha al inicio del día en UTC
    if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateInput.split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }
    
    // Fallback: intentar parsear como ISO y agregar 'Z'
    const date = parseISO(dateInput + 'Z');
    return isValid(date) ? date : null;
  }
  
  return null;
}

/**
 * Convierte una fecha UTC a string ISO para enviar al frontend
 * @param {Date|string} utcDate - Fecha en UTC
 * @returns {string} ISO string en UTC
 */
export function utcToISO(utcDate) {
  if (!utcDate) return null;
  
  const date = utcDate instanceof Date ? utcDate : parseISO(utcDate);
  if (!isValid(date)) return null;
  
  // Usar toISOString() nativo que siempre devuelve UTC
  return date.toISOString();
}

/**
 * Crea una fecha al inicio del día (00:00:00.000) en UTC
 * @param {string|Date} dateInput - Fecha o string de fecha
 * @returns {Date} Fecha al inicio del día en UTC
 */
export function startOfDayUTC(dateInput) {
  if (!dateInput) return null;
  
  // Si es string en formato YYYY-MM-DD, parsearlo directamente como UTC
  if (typeof dateInput === 'string' && dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateInput.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }
  
  const date = dateInput instanceof Date ? dateInput : parseISO(dateInput);
  if (!isValid(date)) return null;
  
  // Obtener año, mes, día en UTC
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  // Crear nueva fecha al inicio del día en UTC
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

/**
 * Crea una fecha al final del día (23:59:59.999) en UTC
 * @param {string|Date} dateInput - Fecha o string de fecha
 * @returns {Date} Fecha al final del día en UTC
 */
export function endOfDayUTC(dateInput) {
  if (!dateInput) return null;
  
  // Si es string en formato YYYY-MM-DD, parsearlo directamente como UTC
  if (typeof dateInput === 'string' && dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateInput.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  }
  
  const date = dateInput instanceof Date ? dateInput : parseISO(dateInput);
  if (!isValid(date)) return null;
  
  // Obtener año, mes, día en UTC
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  // Crear nueva fecha al final del día en UTC
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
}

/**
 * Parsea una fecha de string a Date en UTC
 * @param {string|Date} dateStr - String de fecha o Date
 * @returns {Date|null} Fecha parseada en UTC o null si es inválida
 */
export function parseDate(dateStr) {
  if (!dateStr) return null;
  
  if (dateStr instanceof Date) {
    return isValid(dateStr) ? dateStr : null;
  }
  
  if (typeof dateStr === 'string') {
    // Si ya tiene 'Z' o offset, parsear directamente
    if (dateStr.includes('Z') || dateStr.match(/[+-]\d{2}:\d{2}$/)) {
      const date = parseISO(dateStr);
      return isValid(date) ? date : null;
    }
    
    // Si es string ISO sin zona horaria, agregar 'Z' para forzar UTC
    if (dateStr.includes('T')) {
      const date = parseISO(dateStr + 'Z');
      return isValid(date) ? date : null;
    }
    
    // Fallback: intentar parsear como ISO
    const date = parseISO(dateStr);
    return isValid(date) ? date : null;
  }
  
  return null;
}

/**
 * Formatea una fecha para mostrar (en UTC)
 * @param {Date|string} date - Fecha a formatear
 * @param {string} formatStr - Formato (por defecto 'yyyy-MM-dd HH:mm:ss')
 * @returns {string} Fecha formateada
 */
export function formatDate(date, formatStr = 'yyyy-MM-dd HH:mm:ss') {
  if (!date) return '';
  
  const dateObj = date instanceof Date ? date : parseISO(date);
  if (!isValid(dateObj)) return '';
  
  return format(dateObj, formatStr);
}

/**
 * Obtiene la fecha/hora actual en UTC
 * @returns {Date} Fecha actual en UTC
 */
export function now() {
  return new Date();
}

/**
 * Crea un rango de fechas para consultas (desde inicio del día hasta fin del día) en UTC
 * @param {string|Date} fromDate - Fecha desde (solo fecha, sin hora)
 * @param {string|Date} toDate - Fecha hasta (solo fecha, sin hora)
 * @returns {{from: Date, to: Date}} Objeto con fechas desde y hasta en UTC
 */
export function createDateRange(fromDate, toDate) {
  return {
    from: fromDate ? startOfDayUTC(fromDate) : null,
    to: toDate ? endOfDayUTC(toDate) : null
  };
}

/**
 * Crea un rango de fechas para períodos de liquidación en UTC
 * @param {string|Date} startDate - Fecha de inicio
 * @param {string|Date} endDate - Fecha de fin
 * @returns {{start: Date, end: Date}} Objeto con fechas de inicio y fin en UTC
 */
export function createPeriodRange(startDate, endDate) {
  return {
    start: startDate ? startOfDayUTC(startDate) : null,
    end: endDate ? endOfDayUTC(endDate) : null
  };
}

/**
 * Valida si una fecha es válida
 * @param {any} date - Fecha a validar
 * @returns {boolean} true si es válida, false en caso contrario
 */
export function isValidDate(date) {
  if (!date) return false;
  const dateObj = date instanceof Date ? date : parseISO(date);
  return isValid(dateObj);
}

/**
 * Compara dos fechas
 * @param {Date|string} date1 - Primera fecha
 * @param {Date|string} date2 - Segunda fecha
 * @returns {number} -1 si date1 < date2, 0 si son iguales, 1 si date1 > date2
 */
export function compareDates(date1, date2) {
  const d1 = date1 instanceof Date ? date1 : parseISO(date1);
  const d2 = date2 instanceof Date ? date2 : parseISO(date2);
  
  if (!isValid(d1) || !isValid(d2)) return 0;
  
  return compareAsc(d1, d2);
}

/**
 * Convierte una fecha a ISO string para guardar en BD
 * @param {Date|string} date - Fecha a convertir
 * @returns {string} ISO string en UTC
 */
export function toISOString(date) {
  if (!date) return null;
  const dateObj = date instanceof Date ? date : parseISO(date);
  if (!isValid(dateObj)) return null;
  return dateObj.toISOString();
}

/**
 * Crea una fecha a partir de componentes en UTC
 * @param {number} year - Año
 * @param {number} month - Mes (1-12, no 0-11)
 * @param {number} day - Día (1-31)
 * @param {number} hour - Hora (0-23)
 * @param {number} minute - Minuto (0-59)
 * @param {number} second - Segundo (0-59)
 * @param {number} millisecond - Milisegundo (0-999)
 * @returns {Date} Fecha creada en UTC
 */
export function createDate(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  // date-fns usa meses 0-11, pero aquí usamos 1-12 para ser más intuitivo
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
}

// Mantener compatibilidad con funciones antiguas (deprecated)
export const startOfDay = startOfDayUTC;
export const endOfDay = endOfDayUTC;
export const utcToLocal = (date) => date; // En UTC, no hay conversión necesaria
