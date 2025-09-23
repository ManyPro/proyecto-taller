/* assets/js/api.js
   Capa API unificada + alias de compatibilidad (loginCompany, registerCompany, getToken, authToken)
*/

// ========= Base =========
const API_BASE =
  (typeof window !== 'undefined' && window.API_BASE) ||
  (typeof location !== 'undefined' ? `${location.origin}` : '');

const TOKEN_KEY = 'token';
const COMPANY_KEY = 'activeCompanyEmail';

// ========= Stores =========
const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  },
  set(tok) {
    try { localStorage.setItem(TOKEN_KEY, tok || ''); } catch {}
    return tok;
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
  }
};

const companyStore = {
  get() { try { return localStorage.getItem(COMPANY_KEY) || ''; } catch { return ''; } },
  set(email) { try { localStorage.setItem(COMPANY_KEY, email || ''); } catch {} },
  clear() { try { localStorage.removeItem(COMPANY_KEY); } catch {} }
};

// ========= Helpers =========
function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  const tok = tokenStore.get();
  if (tok) h['Authorization'] = `Bearer ${tok}`;
  return h;
}

function toQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const s = String(v).trim();
    if (s !== '') qs.set(k, s);
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

async function coreRequest(method, path, body) {
  const isForm = (typeof FormData !== 'undefined') && (body instanceof FormData);
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: isForm ? { Authorization: headers().Authorization } : headers(),
    body: body == null ? undefined : (isForm ? body : JSON.stringify(body)),
    cache: 'no-store',
    credentials: 'omit'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  return data;
}

const http = {
  get: (path)         => coreRequest('GET', path),
  post: (path, body)  => coreRequest('POST', path, body),
  put: (path, body)   => coreRequest('PUT', path, body),
  patch: (path, body) => coreRequest('PATCH', path, body),
  del: (path)         => coreRequest('DELETE', path),
};

// ========= API =========
export const API = {
  base: API_BASE,

  // Estado
  token: tokenStore,
  getActiveCompany: () => companyStore.get(),
  setActiveCompany: (email) => companyStore.set(email || ''),
  clearActiveCompany: () => companyStore.clear(),

  // ===== Auth =====
  auth: {
    async register({ email, password }) {
      const r = await http.post('/api/v1/auth/register', { email, password });
      return r;
    },
    async login({ email, password }) {
      const r = await http.post('/api/v1/auth/login', { email, password });
      if (r?.token) tokenStore.set(r.token);
      if (r?.email) companyStore.set(r.email);
      return r;
    },
    async me() {
      return http.get('/api/v1/auth/company/me');
    },
    async logout() {
      tokenStore.clear();
      companyStore.clear();
      return { ok: true };
    }
  },

  // ===== Notes =====
  notes: {
    list:   (params = {}) => http.get(`/api/v1/notes${toQuery(params)}`),
    create: (payload = {}) => http.post('/api/v1/notes', payload),
    update: (id, body={})  => http.put(`/api/v1/notes/${id}`, body),
    remove: (id)           => http.del(`/api/v1/notes/${id}`),
  },

  // ===== Inventory =====
  inventory: {
    // Items
    itemsList: (params = {}) => http.get(`/api/v1/inventory/items${toQuery(params)}`),
    itemGet:   (id)          => http.get(`/api/v1/inventory/items/${id}`),
    itemCreate:(body={})     => http.post('/api/v1/inventory/items', body),
    itemUpdate:(id, body={}) => http.put(`/api/v1/inventory/items/${id}`, body),
    itemDelete:(id)          => http.del(`/api/v1/inventory/items/${id}`),

    // Entradas de vehículo
    listVehicleIntakes: (params={}) => http.get(`/api/v1/inventory/vehicle-intakes${toQuery(params)}`),

    // QR PNG URL helper
    qrPngUrl(itemId, size=256) {
      const tok = tokenStore.get();
      const u = new URL(`${API_BASE}/api/v1/inventory/items/${itemId}/qr.png`, location.origin);
      u.searchParams.set('size', String(size));
      return { url: u.toString(), headers: tok ? { Authorization: `Bearer ${tok}` } : {} };
    }
  },

  // ===== Quotes =====
  quotes: {
    list:   (params={}) => http.get(`/api/v1/quotes${toQuery(params)}`),
    search: (q='')      => http.get(`/api/v1/quotes${toQuery({ q })}`),
    get:    (id)        => http.get(`/api/v1/quotes/${id}`),
    create: (body={})   => http.post('/api/v1/quotes', body),
    update: (id, b={})  => http.put(`/api/v1/quotes/${id}`, b),
    remove: (id)        => http.del(`/api/v1/quotes/${id}`),
  },

  // ===== Prices / Services =====
  servicesList: (params = {}) => http.get(`/api/v1/services${toQuery(params)}`),
  serviceCreate: (body={})    => http.post('/api/v1/services', body),
  serviceUpdate: (id, b={})   => http.put(`/api/v1/services/${id}`, b),
  serviceDelete: (id)         => http.del(`/api/v1/services/${id}`),

  pricesList:   (params = {}) => http.get(`/api/v1/prices${toQuery(params)}`),
  priceCreate:  (body={})     => http.post('/api/v1/prices', body),
  priceUpdate:  (id, b={})    => http.put(`/api/v1/prices/${id}`, b),
  priceDelete:  (id)          => http.del(`/api/v1/prices/${id}`),
  pricesImport: (formData)    => coreRequest('POST', `/api/v1/prices/import`, formData),
  async pricesExport(params = {}) {
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

  // ===== Sales (Ventas) =====
  sales: {
    start:            ()                 => http.post('/api/v1/sales/start', {}),
    get:              (id)               => http.get(`/api/v1/sales/${id}`),
    addItem:          (id, body={})      => http.post(`/api/v1/sales/${id}/items`, body),
    updateItem:       (id, itemId, b={}) => http.put(`/api/v1/sales/${id}/items/${itemId}`, b),
    removeItem:       (id, itemId)       => http.del(`/api/v1/sales/${id}/items/${itemId}`),
    setCustomerVehicle:(id, body={})     => http.put(`/api/v1/sales/${id}/customer`, body),
    close:            (id)               => http.post(`/api/v1/sales/${id}/close`, {}),
    addByQR:          (saleId, code)     => http.post(`/api/v1/sales/addByQR`, { saleId, code }),
  },

  // ===== Media (opcional; usado por inventory.js si existe) =====
  async mediaUpload(fileList) {
    const fd = new FormData();
    Array.from(fileList || []).forEach(f => fd.append('files', f));
    return coreRequest('POST', '/api/v1/media/upload', fd);
  },

  // ===== Alias de compatibilidad para front heredado =====
  loginCompany(payload)        { return API.auth.login(payload); },
  registerCompany(payload)     { return API.auth.register(payload); },
  getToken()                   { return API.token.get(); },
  me()                         { return API.auth.me(); },
  logout()                     { return API.auth.logout(); },
};

// Export nombrado esperado por algunos módulos antiguos
export function authToken() { return tokenStore.get(); }

// Default
export default API;
