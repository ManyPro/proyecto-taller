// =======================
// API BASE CONFIG
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
  upload: (path, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files[]', f);
    return coreRequest('POST', path, fd);
  }
};

// =======================
// API público
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
    // Esperamos { token, email, ... }
    const res = await http.post('/api/v1/auth/company/login', payload);
    const email = String(res?.email || payload?.email || '').toLowerCase();
    if (!res?.token || !email) throw new Error('Login inválido');
    activeCompany.set(email);
    tokenStore.set(res.token, email);
    return res;
  },
  companyMe: () => http.get('/api/v1/auth/company/me'),
  async logout() {
    try { await http.post('/api/v1/auth/company/logout', {}); } catch { }
    tokenStore.clear();
    activeCompany.clear();
  },

  // --- Notas / Media ---
  notesList: (q = '') => http.get(`/api/v1/notes${q}`),
  notesCreate: (payload) => http.post('/api/v1/notes', payload),
  mediaUpload: (files) => http.upload('/api/v1/media/upload', files),

  // --- Aliases retro ---
  register: (payload) => http.post('/api/v1/auth/company/register', payload),
  login: (payload) => API.companyLogin(payload),
  me: () => API.companyMe(),
  registerCompany: (payload) => http.post('/api/v1/auth/company/register', payload),
  loginCompany: (payload) => API.companyLogin(payload),

  // --- Cotizaciones ---
  quotesList: (q = '') => http.get(`/api/v1/quotes${q}`),
  quoteCreate: (payload) => http.post('/api/v1/quotes', payload),
  quoteUpdate: (id, payload) => http.post(`/api/v1/quotes/${id}`, payload),
  quotePatch: (id, payload) => coreRequest('PATCH', `/api/v1/quotes/${id}`, payload),
  quoteDelete: (id) => coreRequest('DELETE', `/api/v1/quotes/${id}`)
};

// === Services ===
API.servicesList = () => http.get('/api/v1/services');
API.serviceCreate = (payload) => http.post('/api/v1/services', payload);
API.serviceUpdate = (id, body) => coreRequest('PUT', `/api/v1/services/${id}`, body);
API.serviceDelete = (id) => coreRequest('DELETE', `/api/v1/services/${id}`);

// === Prices ===
function toQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && String(v).trim() !== '') qs.set(k, v); });
  const s = qs.toString(); return s ? `?${s}` : '';
}
API.pricesList = (params = {}) => http.get(`/api/v1/prices${toQuery(params)}`);
API.priceCreate = (payload) => http.post('/api/v1/prices', payload);
API.priceUpdate = (id, body) => coreRequest('PUT', `/api/v1/prices/${id}`, body);
API.priceDelete = (id) => coreRequest('DELETE', `/api/v1/prices/${id}`);

// Exports
export { API, tokenStore as authToken };
export default API;
