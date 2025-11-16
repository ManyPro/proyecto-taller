/**
 * Util centralizado para manejo de fechas y horas (Frontend)
 * 
 * Todas las fechas se manejan considerando la zona horaria del dispositivo.
 * Las fechas se envían al backend en formato ISO (UTC) y se muestran en hora local.
 */

/**
 * Obtiene la zona horaria del sistema
 * @returns {string} Zona horaria (ej: "America/Bogota", "America/Mexico_City")
 */
export function getSystemTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Convierte una fecha/hora local a ISO string para enviar al backend
 * Cuando el usuario ingresa una hora local, debe convertirse a UTC para guardar
 * @param {string|Date} dateInput - Fecha en formato string o Date
 * @returns {string} ISO string en UTC
 */
export function localToISO(dateInput) {
  if (!dateInput) return null;
  
  // Si es Date, convertir a ISO
  if (dateInput instanceof Date) {
    return dateInput.toISOString();
  }
  
  // Si es string, crear Date interpretando como hora local
  if (typeof dateInput === 'string') {
    // Si ya tiene 'Z' o offset, ya está en UTC
    if (dateInput.includes('Z') || dateInput.match(/[+-]\d{2}:\d{2}$/)) {
      return dateInput;
    }
    
    // Si es string ISO sin zona horaria, interpretarlo como hora local
    if (dateInput.includes('T')) {
      const localDate = new Date(dateInput);
      return localDate.toISOString();
    }
    
    // Fallback: intentar parsear
    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  
  return null;
}

/**
 * Convierte una fecha UTC (del backend) a hora local para mostrar
 * @param {string|Date} utcDate - Fecha en UTC (ISO string o Date)
 * @returns {Date} Fecha en hora local
 */
export function utcToLocal(utcDate) {
  if (!utcDate) return null;
  
  const date = utcDate instanceof Date ? utcDate : new Date(utcDate);
  if (isNaN(date.getTime())) return null;
  
  return date;
}

/**
 * Crea una fecha al inicio del día (00:00:00.000) en hora local
 * @param {string|Date} dateInput - Fecha o string de fecha
 * @returns {Date} Fecha al inicio del día en hora local
 */
export function startOfDay(dateInput) {
  if (!dateInput) return null;
  
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return null;
  
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/**
 * Crea una fecha al final del día (23:59:59.999) en hora local
 * @param {string|Date} dateInput - Fecha o string de fecha
 * @returns {Date} Fecha al final del día en hora local
 */
export function endOfDay(dateInput) {
  if (!dateInput) return null;
  
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return null;
  
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/**
 * Crea un rango de fechas para períodos de liquidación
 * El inicio es 00:00:00 del día de inicio y el fin es 23:59:59.999 del día final
 * @param {string|Date} startDate - Fecha de inicio
 * @param {string|Date} endDate - Fecha de fin
 * @returns {{start: Date, end: Date}} Objeto con fechas de inicio y fin
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
 * Parsea una fecha de string a Date
 * @param {string|Date} dateStr - String de fecha o Date
 * @returns {Date|null} Fecha parseada o null si es inválida
 */
export function parseDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }
  
  if (typeof dateStr === 'string') {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
}

/**
 * Formatea una fecha para mostrar en la zona horaria local
 * @param {Date|string} date - Fecha a formatear
 * @param {object} options - Opciones de formato
 * @returns {string} Fecha formateada
 */
export function formatDate(date, options = {}) {
  if (!date) return '';
  
  const dateObj = date instanceof Date ? date : parseDate(date);
  if (!dateObj) return '';
  
  const defaultOptions = {
    locale: 'es-CO',
    ...options
  };
  
  return new Intl.DateTimeFormat(defaultOptions.locale, {
    dateStyle: options.dateStyle || 'short',
    timeStyle: options.timeStyle,
    ...options
  }).format(dateObj);
}

/**
 * Formatea una fecha para input type="date" (YYYY-MM-DD)
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function formatDateForInput(date) {
  if (!date) return '';
  
  const dateObj = date instanceof Date ? date : parseDate(date);
  if (!dateObj) return '';
  
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Formatea una fecha y hora para input type="datetime-local" (YYYY-MM-DDTHH:mm)
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} Fecha en formato YYYY-MM-DDTHH:mm
 */
export function formatDateTimeForInput(date) {
  if (!date) return '';
  
  const dateObj = date instanceof Date ? date : parseDate(date);
  if (!dateObj) return '';
  
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Convierte fecha/hora local a ISO correctamente
 * Cuando el usuario ingresa 15:03 hora local, debe guardarse como 15:03 hora local (no UTC)
 * MongoDB guarda fechas como UTC, así que necesitamos convertir correctamente
 * @param {string} dateString - Fecha en formato YYYY-MM-DD
 * @param {string} timeString - Hora en formato HH:mm
 * @returns {string} ISO string en UTC
 */
export function localDateTimeToISO(dateString, timeString) {
  if (!dateString || !timeString) return null;
  
  // Crear fecha en hora local (JavaScript interpreta como hora local)
  const localDate = new Date(`${dateString}T${timeString}`);
  
  // toISOString() convierte correctamente a UTC
  // Si el usuario está en UTC-5 e ingresa 15:03, esto guardará 20:03 UTC
  // Cuando MongoDB lo lea y lo convierta de vuelta a hora local, mostrará 15:03 correctamente
  return localDate.toISOString();
}

/**
 * Obtiene la fecha/hora actual
 * @returns {Date} Fecha actual
 */
export function now() {
  return new Date();
}

/**
 * Crea un rango de fechas para consultas (desde inicio del día hasta fin del día)
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
  const dateObj = date instanceof Date ? date : parseDate(date);
  return dateObj !== null && !isNaN(dateObj.getTime());
}

/**
 * Compara dos fechas
 * @param {Date|string} date1 - Primera fecha
 * @param {Date|string} date2 - Segunda fecha
 * @returns {number} -1 si date1 < date2, 0 si son iguales, 1 si date1 > date2
 */
export function compareDates(date1, date2) {
  const d1 = date1 instanceof Date ? date1 : parseDate(date1);
  const d2 = date2 instanceof Date ? date2 : parseDate(date2);
  
  if (!d1 || !d2) return 0;
  
  if (d1 < d2) return -1;
  if (d1 > d2) return 1;
  return 0;
}

