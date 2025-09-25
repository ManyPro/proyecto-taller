const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';

function scopeFromBase(base) {
  try { return new URL(base || (typeof window !== 'undefined' ? window.location.origin : '')).host || 'local'; }
  catch { return (base || 'local') || 'local'; }
}
const SCOPE = scopeFromBase(API_BASE);
const ACTIVE_KEY = `taller.activeCompany:${SCOPE}`;
const tokenKeyFor = (email) => `taller.token:${SCOPE}:${String(email || '').toLowerCase()}`;

const activeCompany = {
  get: () => (typeof localStorage !== 'undefined' ? (localStorage.getItem(ACTIVE_KEY) || '') : ''),
  set: (email) => { try { localStorage.setItem(ACTIVE_KEY, String(email || '').toLowerCase()); } catch {} },
  clear: () => { try { localStorage.removeItem(ACTIVE_KEY); } catch {} }
};

const tokenStore = {
  get: (email) => {
    const em = (email || activeCompany.get());
    return (typeof localStorage !== 'undefined') ? (localStorage.getItem(tokenKeyFor(em)) || '') : '';
  },
  set: (t, email) => { try { localStorage.setItem(tokenKeyFor(email || activeCompany.get()), t || ''); } catch {} },
  clear: (email) => { try { localStorage.removeItem(tokenKeyFor(email || activeCompany.get())); } catch {} }
};

async function coreRequest(method, path, data, extraHeaders = {}) {
  const isForm = (typeof FormData !== 'undefined') && (data instanceof FormData);
  const headers = { ...extraHeaders };
  if (!isForm && data != null) headers['Content-Type'] = 'application/json';
  const tok = tokenStore.get();
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method, headers, body: data == null ? undefined : (isForm ? data : JSON.stringify(data)),
    cache: 'no-store', credentials: 'omit'
  });
  const text = await res.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) { const msg = (body && body.error) ? body.error : (typeof body === 'string' ? body : res.statusText); throw new Error(msg || `HTTP ${res.status}`); }
  return body;
}

const http = {
  get: (path) => coreRequest('GET', path, null),
  post: (path, payload) => coreRequest('POST', path, payload),
  put: (path, payload) => coreRequest('PUT', path, payload),
  del: (path) => coreRequest('DELETE', path, null),
  upload: (path, files) => { const fd = new FormData(); for (const f of files) fd.append('files[]', f); return coreRequest('POST', path, fd); }
};

function toQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && String(v).trim() !== '') qs.set(k, v); });
  const s = qs.toString(); return s ? `?${s}` : '';
}

const API = {
  base: API_BASE,
  token: tokenStore,
  setActiveCompany: (email) => activeCompany.set(email),
  getActiveCompany: () => activeCompany.get(),

  companyRegister: (payload) => http.post('/api/v1/auth/company/register', payload),
  async companyLogin(payload) {
    const res = await http.post('/api/v1/auth/company/login', payload);
    const email = String(res?.email || payload?.email || '').toLowerCase();
    if (!res?.token || !email) throw new Error('Login inválido');
    activeCompany.set(email); tokenStore.set(res.token, email); return res;
  },
  companyMe: () => http.get('/api/v1/auth/company/me'),
  async logout() { try { await http.post('/api/v1/auth/company/logout', {}); } catch {} tokenStore.clear(); activeCompany.clear(); },

  notesList: (q = '') => http.get(`/api/v1/notes${q}`),
  notesCreate: (payload) => http.post('/api/v1/notes', payload),
  mediaUpload: (files) => http.upload('/api/v1/media/upload', files),

  quotesList: (q = '') => http.get(`/api/v1/quotes${q}`),
  quoteCreate: (payload) => http.post('/api/v1/quotes', payload),
  quoteUpdate: (id, payload) => http.post(`/api/v1/quotes/${id}`, payload),
  quotePatch: (id, payload) => http.put(`/api/v1/quotes/${id}`, payload),
  quoteDelete: (id) => http.del(`/api/v1/quotes/${id}`),

  servicesList: () => http.get('/api/v1/services'),
  serviceCreate: (payload) => http.post('/api/v1/services', payload),
  serviceUpdate: (id, body) => http.put(`/api/v1/services/${id}`, body),
  serviceDelete: (id) => http.del(`/api/v1/services/${id}`),

  pricesList: (params = {}) => http.get(`/api/v1/prices${toQuery(params)}`),
  priceCreate: (payload) => http.post('/api/v1/prices', payload),
  priceUpdate: (id, body) => http.put(`/api/v1/prices/${id}`, body),
  priceDelete: (id) => http.del(`/api/v1/prices/${id}`),
  pricesImport: (formData) => coreRequest('POST', `/api/v1/prices/import`, formData),
  pricesExport: async (params = {}) => {
    const tok = tokenStore.get();
    const res = await fetch(`${API_BASE}/api/v1/prices/export${toQuery(params)}`, {
      method: 'GET', headers: tok ? { 'Authorization': `Bearer ${tok}` } : {}, cache: 'no-store', credentials: 'omit'
    });
    if (!res.ok) throw new Error('No se pudo exportar CSV');
    return await res.blob();
  },

  inventory: {
    itemsList: async (params = {}) => {
      const r = await http.get(`/api/v1/inventory/items${toQuery(params)}`);
      return Array.isArray(r) ? r : (r.items || r.data || []);
    }
  },

  sales: {
    start: () => http.post('/api/v1/sales/start', {}),
    get: (id) => http.get(`/api/v1/sales/${id}`),
    addItem: (id, payload) => http.post(`/api/v1/sales/${id}/items`, payload),
    updateItem: (id, itemId, payload) => http.put(`/api/v1/sales/${id}/items/${itemId}`, payload),
    removeItem: (id, itemId) => http.del(`/api/v1/sales/${id}/items/${itemId}`),
    setCustomerVehicle: (id, payload) => http.put(`/api/v1/sales/${id}/customer-vehicle`, payload),
    close: (id) => http.post(`/api/v1/sales/${id}/close`, {}),
    addByQR: (saleId, payload) => http.post(`/api/v1/sales/addByQR`, { saleId, payload }),
    list: (params = {}) => http.get(`/api/v1/sales${toQuery(params)}`),
    summary: (params = {}) => http.get(`/api/v1/sales/summary${toQuery(params)}`),
    cancel: (id) => http.post(`/api/v1/sales/${id}/cancel`, {}),
    profileByPlate: (plate) => http.get(`/api/v1/sales/profile/by-plate/${encodeURIComponent(String(plate||'').toUpperCase())}`)
  }
};

let __evtSource = null;
let __companyId = null;
let __subs = new Set();

async function ensureCompanyId() {
  if (__companyId) return __companyId;
  try { const me = await API.companyMe(); __companyId = String(me?.id || me?._id || '').trim(); } catch {}
  return __companyId;
}

function openEventSource(url) {
  if (__evtSource) return __evtSource;
  const es = new EventSource(url, { withCredentials: false });
  es.onopen = () => console.log('[SSE] open');
  es.onerror = (e) => console.warn('[SSE] error', e);
  es.addEventListener('sale:created', (ev) => notify('sale:created', JSON.parse(ev.data)));
  es.addEventListener('sale:updated', (ev) => notify('sale:updated', JSON.parse(ev.data)));
  es.addEventListener('sale:closed',  (ev) => notify('sale:closed',  JSON.parse(ev.data)));
  es.addEventListener('sale:cancelled', (ev) => notify('sale:cancelled', JSON.parse(ev.data)));
  __evtSource = es; return es;
}

function notify(type, data) { for (const fn of __subs) { try { fn({ type, data }); } catch {} } }

API.subscribeSalesEvents = async (handler) => {
  if (typeof handler === 'function') __subs.add(handler);
  const cid = await ensureCompanyId(); if (!cid) return () => __subs.delete(handler);
  const url = `${API_BASE}/api/v1/stream?companyId=${encodeURIComponent(cid)}`;
  openEventSource(url); return () => __subs.delete(handler);
};

export { API, tokenStore as authToken };
export default API;