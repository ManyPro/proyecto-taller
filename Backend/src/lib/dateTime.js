/**
 * Util centralizado para manejo de fechas y horas
 * 
 * Todas las fechas se guardan en UTC en MongoDB y se convierten a la zona horaria
 * del dispositivo cuando se muestran. Esto asegura consistencia entre dispositivos
 * con diferentes zonas horarias.
 */

/**
 * Obtiene la zona horaria del sistema
 * @returns {string} Zona horaria (ej: "America/Bogota", "America/Mexico_City")
 */
export function getSystemTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Obtiene el offset de la zona horaria en minutos
 * @param {Date} date - Fecha de referencia (por defecto ahora)
 * @returns {number} Offset en minutos
 */
export function getTimezoneOffset(date = new Date()) {
  return -date.getTimezoneOffset();
}

/**
 * Convierte una fecha/hora local a UTC para guardar en MongoDB
 * Si la fecha viene como string sin zona horaria, se interpreta como hora local
 * @param {string|Date} dateInput - Fecha en formato string o Date
 * @returns {Date} Fecha en UTC
 */
export function localToUTC(dateInput) {
  if (!dateInput) return null;
  
  // Si ya es un objeto Date, devolverlo (ya está en UTC internamente)
  if (dateInput instanceof Date) {
    return dateInput;
  }
  
  // Si es string, parsearlo
  if (typeof dateInput === 'string') {
    // Si ya tiene 'Z' o offset, new Date() lo interpreta correctamente
    if (dateInput.includes('Z') || dateInput.match(/[+-]\d{2}:\d{2}$/)) {
      return new Date(dateInput);
    }
    
    // Si es string ISO sin zona horaria, interpretarlo como hora local
    // y convertirlo a UTC
    if (dateInput.includes('T')) {
      // Crear fecha interpretando como hora local
      const localDate = new Date(dateInput);
      // Devolver directamente (JavaScript ya maneja la conversión)
      return localDate;
    }
    
    // Fallback: intentar parsear normalmente
    return new Date(dateInput);
  }
  
  return null;
}

/**
 * Convierte una fecha UTC a hora local para mostrar
 * @param {Date|string} utcDate - Fecha en UTC
 * @returns {Date} Fecha en hora local
 */
export function utcToLocal(utcDate) {
  if (!utcDate) return null;
  
  const date = utcDate instanceof Date ? utcDate : new Date(utcDate);
  if (isNaN(date.getTime())) return null;
  
  // La fecha ya está en UTC, JavaScript la mostrará en hora local automáticamente
  return date;
}

/**
 * Crea una fecha al inicio del día (00:00:00.000) en hora local, convertida a UTC
 * @param {string|Date} dateInput - Fecha o string de fecha
 * @returns {Date} Fecha al inicio del día en UTC
 */
export function startOfDay(dateInput) {
  if (!dateInput) return null;
  
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return null;
  
  // Crear nueva fecha con hora local 00:00:00.000
  const localStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  
  // Convertir a UTC (esto ya está manejado por JavaScript)
  return localStart;
}

/**
 * Crea una fecha al final del día (23:59:59.999) en hora local, convertida a UTC
 * @param {string|Date} dateInput - Fecha o string de fecha
 * @returns {Date} Fecha al final del día en UTC
 */
export function endOfDay(dateInput) {
  if (!dateInput) return null;
  
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return null;
  
  // Crear nueva fecha con hora local 23:59:59.999
  const localEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  
  // Convertir a UTC (esto ya está manejado por JavaScript)
  return localEnd;
}

/**
 * Crea un rango de fechas para períodos de liquidación
 * El inicio es 00:00:00 del día de inicio y el fin es 23:59:59.999 del día final
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
 * Parsea una fecha de string a Date, manejando diferentes formatos
 * @param {string|Date} dateStr - String de fecha o Date
 * @returns {Date|null} Fecha parseada o null si es inválida
 */
export function parseDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }
  
  if (typeof dateStr === 'string') {
    // Si ya tiene 'Z' o offset, new Date() lo interpreta correctamente
    if (dateStr.includes('Z') || dateStr.match(/[+-]\d{2}:\d{2}$/)) {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    }
    
    // Si es string ISO sin zona horaria, agregar 'Z' para forzar UTC
    // O interpretarlo como hora local según el contexto
    if (dateStr.includes('T')) {
      // Interpretar como hora local y convertir a UTC
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    }
    
    // Fallback: intentar parsear normalmente
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
}

/**
 * Formatea una fecha para mostrar en la zona horaria local
 * @param {Date|string} date - Fecha a formatear
 * @param {object} options - Opciones de formato (locale, dateStyle, timeStyle)
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
 * Obtiene la fecha/hora actual en UTC
 * @returns {Date} Fecha actual en UTC
 */
export function now() {
  return new Date();
}

/**
 * Crea una fecha a partir de componentes (año, mes, día, hora, minuto, segundo)
 * @param {number} year - Año
 * @param {number} month - Mes (0-11)
 * @param {number} day - Día (1-31)
 * @param {number} hour - Hora (0-23)
 * @param {number} minute - Minuto (0-59)
 * @param {number} second - Segundo (0-59)
 * @param {number} millisecond - Milisegundo (0-999)
 * @returns {Date} Fecha creada en hora local, convertida a UTC
 */
export function createDate(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  return new Date(year, month, day, hour, minute, second, millisecond);
}

/**
 * Convierte una fecha local a ISO string para enviar al frontend
 * @param {Date|string} date - Fecha a convertir
 * @returns {string} ISO string en UTC
 */
export function toISOString(date) {
  if (!date) return null;
  const dateObj = date instanceof Date ? date : parseDate(date);
  if (!dateObj) return null;
  return dateObj.toISOString();
}

/**
 * Crea un rango de fechas para consultas (desde inicio del día hasta fin del día)
 * @param {string|Date} fromDate - Fecha desde (solo fecha, sin hora)
 * @param {string|Date} toDate - Fecha hasta (solo fecha, sin hora)
 * @returns {{from: Date, to: Date}} Objeto con fechas desde y hasta en UTC
 */
export function createDateRange(fromDate, toDate) {
  return {
    from: fromDate ? startOfDay(fromDate) : null,
    to: toDate ? endOfDay(toDate) : null
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

