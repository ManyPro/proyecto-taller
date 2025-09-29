// =======================
// API publico
// =======================
const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';

// ---- Scopes por entorno (host del API) + empresa (email) ----
function scopeFromBase(base) {
  try { return new URL(base || (typeof window !== 'undefined' ? window.location.origin : '')).host || 'local'; }
  catch { return (base || 'local') || 'local'; }
}
const SCOPE = scopeFromBase(API_BASE);

// Claves de storage
const ACTIVE_KEY = `taller.activeCompany:${SCOPE}`;                  // empresa activa (email)
const tokenKeyFor = (email) => `taller.token:${SCOPE}:${String(email || '').toLowerCase()}`;

// Empresa activa en localStorage
const activeCompany = {
  get: () => (typeof localStorage !== 'undefined' ? (localStorage.getItem(ACTIVE_KEY) || '') : ''),
  set: (email) => { try { localStorage.setItem(ACTIVE_KEY, String(email || '').toLowerCase()); } catch { } },
  clear: () => { try { localStorage.removeItem(ACTIVE_KEY); } catch { } }
};

// Token por empresa (usa la empresa activa por defecto)
const tokenStore = {
  get: (email) => {
    const em = (email || activeCompany.get());
    return (typeof localStorage !== 'undefined') ? (localStorage.getItem(tokenKeyFor(em)) || '') : '';
  },
  set: (t, email) => { try { localStorage.setItem(tokenKeyFor(email || activeCompany.get()), t || ''); } catch { } },
  clear: (email) => { try { localStorage.removeItem(tokenKeyFor(email || activeCompany.get())); } catch { } }
};

// ===== HTTP core =====
async function coreRequest(method, path, data, extraHeaders = {}) {
  const isForm = (typeof FormData !== 'undefined') && (data instanceof FormData);
  const headers = { ...extraHeaders };

  if (!isForm && data != null) headers['Content-Type'] = 'application/json';

  const tok = tokenStore.get();
  if (tok) headers['Authorization'] = `Bearer ${tok}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: data == null ? undefined : (isForm ? data : JSON.stringify(data)),
    cache: 'no-store',
    credentials: 'omit'
  });

  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }

  if (!res.ok) {
    const msg = (body && body.error) ? body.error : (typeof body === 'string' ? body : res.statusText);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return body;
}

const http = {
  get: (path) => coreRequest('GET', path, null),
  post: (path, payload) => coreRequest('POST', path, payload),
  put: (path, payload) => coreRequest('PUT', path, payload),
  patch: (path, payload) => coreRequest('PATCH', path, payload),
  del: (path) => coreRequest('DELETE', path, null),
  upload: (path, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files[]', f);
    return coreRequest('POST', path, fd);
  }
};

// ===== Utils =====
function toQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && String(v).trim() !== '') qs.set(k, v); });
  const s = qs.toString(); return s ? `?${s}` : '';
}

// =======================
// API publico
// =======================
const API = {
  base: API_BASE,
  token: tokenStore,

  // Empresa activa
  setActiveCompany: (email) => activeCompany.set(email),
  getActiveCompany: () => activeCompany.get(),

  // --- Auth empresa ---
  companyRegister: (payload) => http.post('/api/v1/auth/company/register', payload),
  async companyLogin(payload) {
    const res = await http.post('/api/v1/auth/company/login', payload);
    const email = String(res?.company?.email || res?.email || payload?.email || '').toLowerCase();
    if (!res?.token || !email) throw new Error('Login invalido');
    activeCompany.set(email);
    tokenStore.set(res.token, email);
    return { ...res, email };
  },
  companyMe: () => http.get('/api/v1/auth/company/me'),
  logout() {
    tokenStore.clear();
    activeCompany.clear();
  },

  // Aliases retro-compatibles
  register: (payload) => http.post('/api/v1/auth/company/register', payload),
  login: (payload) => API.companyLogin(payload),
  me: () => API.companyMe(),
  registerCompany: (payload) => http.post('/api/v1/auth/company/register', payload),
  loginCompany: (payload) => API.companyLogin(payload),

  // --- Notas / Media ---
  notesList: (q = '') => http.get(`/api/v1/notes${q}`),
  notesCreate: (payload) => http.post('/api/v1/notes', payload),
  mediaUpload: (files) => http.upload('/api/v1/media/upload', files),

  // --- Cotizaciones ---
  // --- Cotizaciones ---
  quotesListRaw: (q = '') => http.get(`/api/v1/quotes${q}`),
  quotesList: async (q = '') => {
    const res = await http.get(`/api/v1/quotes${q}`);
    return Array.isArray(res) ? res : (res?.items || []);
  },
  quoteGet: (id) => http.get(`/api/v1/quotes/${id}`),
  quoteCreate: (payload) => http.post('/api/v1/quotes', payload),
  quoteUpdate: (id, payload) => http.patch(`/api/v1/quotes/${id}`, payload),
  quotePatch: (id, payload) => http.patch(`/api/v1/quotes/${id}`, payload),
  quoteDelete: (id) => http.del(`/api/v1/quotes/${id}`),

  // --- Servicios ---
  servicesList: () => http.get('/api/v1/services'),
  serviceCreate: (payload) => http.post('/api/v1/services', payload),
  serviceUpdate: (id, body) => http.put(`/api/v1/services/${id}`, body),
  serviceDelete: (id) => http.del(`/api/v1/services/${id}`),

  // --- Lista de precios ---
  pricesList: (params = {}) => http.get(`/api/v1/prices${toQuery(params)}`),
  priceCreate: (payload) => http.post('/api/v1/prices', payload),
  priceUpdate: (id, body) => http.put(`/api/v1/prices/${id}`, body),
  priceDelete: (id) => http.del(`/api/v1/prices/${id}`),
  pricesImport: (formData) => coreRequest('POST', `/api/v1/prices/import`, formData),
  pricesExport: async (params = {}) => {
    const tok = tokenStore.get();
    const res = await fetch(`${API_BASE}/api/v1/prices/export${toQuery(params)}`, {
      method: 'GET',
      headers: tok ? { 'Authorization': `Bearer ${tok}` } : {},
      cache: 'no-store',
      credentials: 'omit'
    });
    if (!res.ok) throw new Error('No se pudo exportar CSV');
    return await res.blob();
  },

  // --- Inventario ---
  inventory: {
    itemsList: async (params = {}) => {
      const r = await http.get(`/api/v1/inventory/items${toQuery(params)}`);
      return Array.isArray(r) ? r : (r.items || r.data || []);
    }
  },

  // --- Ventas ---
  sales: {
    start: () => http.post('/api/v1/sales/start', {}),
    get: (id) => http.get(`/api/v1/sales/${id}`),

    addItem: (id, payload) =>
      http.post(`/api/v1/sales/${id}/items`, payload),

    updateItem: (id, itemId, payload) =>
      http.put(`/api/v1/sales/${id}/items/${itemId}`, payload),

    removeItem: (id, itemId) =>
      http.del(`/api/v1/sales/${id}/items/${itemId}`),

    setCustomerVehicle: (id, payload) =>
      http.put(`/api/v1/sales/${id}/customer-vehicle`, payload),

    close: (id) =>
      http.post(`/api/v1/sales/${id}/close`, {}),

    addByQR: (saleId, payload) =>
      http.post(`/api/v1/sales/addByQR`, { saleId, payload }),

    list: (params = {}) => http.get(`/api/v1/sales${toQuery(params)}`),
    summary: (params = {}) => http.get(`/api/v1/sales/summary${toQuery(params)}`),
    cancel: (id) => http.post(`/api/v1/sales/${id}/cancel`, {}),
    profileByPlate: (plate) => http.get(`/api/v1/sales/profile/by-plate/${encodeURIComponent(String(plate || '').toUpperCase())}`)
  }
};

// Exports  
export { API, tokenStore as authToken };
export default API;


// ===============
// SSE Live module
// ===============
if (typeof window !== 'undefined') {
  try {
    // Agrega API.live.connect si no existe
    if (!window.API) window.API = {};
    const __tok = (typeof tokenStore !== 'undefined') ? tokenStore.get() : '';
    window.API.live = {
      connect: (onEvent) => {
        const base = API_BASE || window.location.origin;
        const url = new URL('/api/v1/sales/stream', base);
        if (__tok) url.searchParams.set('token', __tok);
        const es = new EventSource(url.toString(), { withCredentials: false });
        es.addEventListener('sale:started', e => onEvent && onEvent('sale:started', JSON.parse(e.data || '{}')));
        es.addEventListener('sale:updated', e => onEvent && onEvent('sale:updated', JSON.parse(e.data || '{}')));
        es.addEventListener('sale:closed', e => onEvent && onEvent('sale:closed', JSON.parse(e.data || '{}')));
        es.addEventListener('sale:cancelled', e => onEvent && onEvent('sale:cancelled', JSON.parse(e.data || '{}')));
        return es;
      }
    };
  } catch { }
}