// Importar API desde el módulo existente
export async function ensureAPI() {
  if (typeof window === 'undefined') throw new Error('Browser only module');
  
  // Cargar config primero si no está disponible
  if (!window.BACKEND_URL && !window.API_BASE) {
    try {
      await import('../../assets/js/config.js');
    } catch (e) {
      console.warn('No se pudo cargar config.js:', e);
    }
  }
  
  // Cargar api.js si no está disponible
  if (!window.API) {
    try {
      await import('../../assets/js/api.js');
    } catch (e) {
      console.warn('No se pudo cargar api.js:', e);
    }
  }
  
  if (!window.API) {
    throw new Error('API no disponible. Asegúrate de que api.js esté cargado.');
  }
  
  return window.API;
}

export async function getAPI() {
  return await ensureAPI();
}

