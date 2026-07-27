/**
 * Util centralizado para manejo de fechas y horas
 * 
 * IMPORTANTE: Todas las fechas se guardan en UTC (GMT+0) en MongoDB
 * y se muestran en UTC (GMT+0) en el frontend.
 * 
 * Esto asegura consistencia y evita problemas de timezone.
 * 
 * Usa funciones nativas de JavaScript con manejo correcto de UTC
 */

/**
 * Convierte una fecha/hora local a UTC para enviar al backend
 * @param {string|Date} dateInput - Fecha en formato string o Date
 * @returns {string} ISO string en UTC (GMT+0)
 */
export function localToISO(dateInput) {
  if (!dateInput) return null;
  
  // Si es Date, convertir a ISO
  if (dateInput instanceof Date) {
    return dateInput.toISOString();
  }
  
  // Si es string, parsearlo
  if (typeof dateInput === 'string') {
    // Si ya tiene 'Z' o offset, ya está en UTC
    if (dateInput.includes('Z') || dateInput.match(/[+-]\d{2}:\d{2}$/)) {
      return dateInput;
    }
    
    // Si es string ISO sin zona horaria, agregar 'Z' para forzar UTC
    if (dateInput.includes('T')) {
      const date = new Date(dateInput + 'Z');
      return isNaN(date.getTime()) ? null : date.toISOString();
    }
    
    // Fallback: intentar parsear
    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  
  return null;
}

/**
 * Convierte una fecha UTC (del backend) a Date para mostrar
 * @param {string|Date} utcDate - Fecha en UTC (ISO string o Date)
 * @returns {Date} Fecha en UTC
 */
export function utcToLocal(utcDate) {
  if (!utcDate) return null;
  
  const date = utcDate instanceof Date ? utcDate : new Date(utcDate);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Crea una fecha al inicio del día (00:00:00.000) en UTC
 * @param {string|Date} dateInput - Fecha o string de fecha
 * @returns {Date} Fecha al inicio del día en UTC
 */
export function startOfDay(dateInput) {
  if (!dateInput) return null;
  
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return null;
  
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
export function endOfDay(dateInput) {
  if (!dateInput) return null;
  
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return null;
  
  // Obtener año, mes, día en UTC
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  // Crear nueva fecha al final del día en UTC
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
}

/**
 * Crea un rango de fechas para períodos de liquidación en UTC
 * @param {string|Date} startDate - Fecha de inicio
 * @param {string|Date} endDate - Fecha de fin
 * @returns {{start: Date, end: Date}} Objeto con fechas de inicio y fin en UTC
 */
export function createPeriodRange(startDate, endDate) {
  return {
    start: startOfDay(startDate),
    end: endOfDay(endDate)
  };
}

/**
 * Convierte un rango de período a ISO strings para enviar al backend
 * @param {string|Date} startDate - Fecha de inicio
 * @param {string|Date} endDate - Fecha de fin
 * @returns {{start: string, end: string}} Objeto con ISO strings
 */
export function periodRangeToISO(startDate, endDate) {
  const range = createPeriodRange(startDate, endDate);
  return {
    start: range.start ? range.start.toISOString() : null,
    end: range.end ? range.end.toISOString() : null
  };
}

/**
 * Parsea una fecha de string a Date en UTC
 * @param {string|Date} dateStr - String de fecha o Date
 * @returns {Date|null} Fecha parseada en UTC o null si es inválida
 */
export function parseDate(dateStr) {
  if (!dateStr) return null;
  
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }
  
  if (typeof dateStr === 'string') {
    // Si ya tiene 'Z' o offset, parsear directamente
    if (dateStr.includes('Z') || dateStr.match(/[+-]\d{2}:\d{2}$/)) {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    }
    
    // Si es string ISO sin zona horaria, agregar 'Z' para forzar UTC
    if (dateStr.includes('T')) {
      const date = new Date(dateStr + 'Z');
      return isNaN(date.getTime()) ? null : date;
    }
    
    // Fallback: intentar parsear
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
}

/**
 * Formatea una fecha para mostrar (en UTC)
 * @param {Date|string} date - Fecha a formatear
 * @param {object} options - Opciones de formato
 * @returns {string} Fecha formateada
 */
export function formatDate(date, options = {}) {
  if (!date) return '';
  
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return '';
  
  const defaultOptions = {
    locale: 'es-CO',
    timeZone: 'UTC',
    ...options
  };
  
  return new Intl.DateTimeFormat(defaultOptions.locale, {
    dateStyle: options.dateStyle || 'short',
    timeStyle: options.timeStyle,
    timeZone: 'UTC',
    ...options
  }).format(dateObj);
}

/**
 * Formatea una fecha para input type="date" (YYYY-MM-DD) en UTC
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function formatDateForInput(date) {
  if (!date) return '';
  
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return '';
  
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Formatea una fecha y hora para input type="datetime-local" (YYYY-MM-DDTHH:mm) en UTC
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} Fecha en formato YYYY-MM-DDTHH:mm
 */
export function formatDateTimeForInput(date) {
  if (!date) return '';
  
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return '';
  
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  const hours = String(dateObj.getUTCHours()).padStart(2, '0');
  const minutes = String(dateObj.getUTCMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Convierte fecha/hora local a ISO correctamente en UTC
 * Cuando el usuario ingresa 15:03 hora local, se guarda como 15:03 UTC
 * @param {string} dateString - Fecha en formato YYYY-MM-DD
 * @param {string} timeString - Hora en formato HH:mm
 * @returns {string} ISO string en UTC
 */
export function localDateTimeToISO(dateString, timeString) {
  if (!dateString || !timeString) return null;
  
  // Crear fecha interpretando como UTC (no hora local)
  // Si el usuario ingresa 15:03, guardamos 15:03 UTC
  const [hours, minutes] = timeString.split(':').map(Number);
  const [year, month, day] = dateString.split('-').map(Number);
  
  // Crear fecha en UTC directamente
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
  
  return utcDate.toISOString();
}

/**
 * Convierte un input datetime-local a ISO string en UTC
 * IMPORTANTE: Interpreta la fecha/hora como UTC directamente
 * @param {string} datetimeLocal - Valor de input type="datetime-local" (YYYY-MM-DDTHH:mm)
 * @returns {string} ISO string en UTC
 */
export function datetimeLocalToISO(datetimeLocal) {
  if (!datetimeLocal) return null;
  
  // datetime-local viene como "YYYY-MM-DDTHH:mm" sin zona horaria
  // Lo interpretamos como UTC directamente
  const [datePart, timePart] = datetimeLocal.split('T');
  if (!datePart || !timePart) return null;
  
  return localDateTimeToISO(datePart, timePart);
}

/**
 * Convierte un input date a ISO string en UTC (inicio del día)
 * @param {string} dateInput - Valor de input type="date" (YYYY-MM-DD)
 * @returns {string} ISO string en UTC al inicio del día
 */
export function dateInputToISO(dateInput) {
  if (!dateInput) return null;
  
  const [year, month, day] = dateInput.split('-').map(Number);
  if (!year || !month || !day) return null;
  
  // Crear fecha al inicio del día en UTC
  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  return utcDate.toISOString();
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
 * @returns {{from: string, to: string}} Objeto con ISO strings desde y hasta
 */
export function createDateRangeISO(fromDate, toDate) {
  return {
    from: fromDate ? startOfDay(fromDate).toISOString() : null,
    to: toDate ? endOfDay(toDate).toISOString() : null
  };
}

/**
 * Valida si una fecha es válida
 * @param {any} date - Fecha a validar
 * @returns {boolean} true si es válida, false en caso contrario
 */
export function isValidDate(date) {
  if (!date) return false;
  const dateObj = date instanceof Date ? date : new Date(date);
  return !isNaN(dateObj.getTime());
}

/**
 * Compara dos fechas
 * @param {Date|string} date1 - Primera fecha
 * @param {Date|string} date2 - Segunda fecha
 * @returns {number} -1 si date1 < date2, 0 si son iguales, 1 si date1 > date2
 */
export function compareDates(date1, date2) {
  const d1 = date1 instanceof Date ? date1 : new Date(date1);
  const d2 = date2 instanceof Date ? date2 : new Date(date2);
  
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  
  if (d1 < d2) return -1;
  if (d1 > d2) return 1;
  return 0;
}
