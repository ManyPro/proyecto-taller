// ESM bridge so Vite-less browsers can use module imports while api.js runs as classic script
// Precondition: assets/js/api.js must be loaded first in the page to populate window.API

function ensureAPI() {
  if (typeof window === 'undefined') throw new Error('Browser only module');
  if (!window.API) throw new Error('API not initialized: load assets/js/api.js before importing api.esm.js');
  return window.API;
}

export const API = ensureAPI();
export const authToken = API.token;
export default API;
