// =======================
// API BASE CONFIG
// =======================
const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';

// ---- Token namespaced por entorno (host del API) ----
function scopeFromBase(base) {
  try { return new URL(base || (typeof window !== 'undefined' ? window.location.origin : '')).host || 'local'; }
  catch { return (base || 'local') || 'local'; }
}
const SCOPE = scopeFromBase(API_BASE);
const TOKEN_KEY_SCOPED = `taller.token:${SCOPE}`;
const LEGACY_TOKEN_KEY = 'taller.token';

// Migración automática desde la clave vieja (si existe)
try {
  const old = (typeof localStorage !== 'undefined') ? localStorage.getItem(LEGACY_TOKEN_KEY) : null;
  const cur = (typeof localStorage !== 'undefined') ? localStorage.getItem(TOKEN_KEY_SCOPED) : null;
  if (old && !cur) {
    localStorage.setItem(TOKEN_KEY_SCOPED, old);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
} catch {}

const tokenStore = {
  get: () => (typeof localStorage !== 'undefined' ? (localStorage.getItem(TOKEN_KEY_SCOPED) || '') : ''),
  set: (t) => { try { localStorage.setItem(TOKEN_KEY_SCOPED, t); } catch {} },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY_SCOPED); } catch {} }
};

async function coreRequest(method, path, data, extraHeaders = {}) {
  const isForm = (typeof FormData !== 'undefined') && (data instanceof FormData);
  const headers = { ...extraHeaders };

  if (!isForm && data != null) headers['Content-Type'] = 'application/json';
  // Anti cache intermedio
  headers['Cache-Control'] = 'no-store';

  const tok = tokenStore.get();
  if (tok) headers['Authorization'] = `Bearer ${tok}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: data == null ? undefined : (isForm ? data : JSON.stringify(data)),
    cache: 'no-store',
    credentials: 'omit' // el token va en Authorization, no en cookies
  });

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }

  if (!res.ok) {
    const msg = (body && body.error) ? body.error : (typeof body === 'string' ? body : res.statusText);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return body;
}

const http = {
  get:  (path)          => coreRequest('GET',  path, null),
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

  // --- Canonical ---
  companyRegister: (payload) => http.post('/api/v1/auth/company/register', payload),
  companyLogin:    (payload) => http.post('/api/v1/auth/company/login', payload),
  companyMe:       ()        => http.get('/api/v1/auth/company/me'),

  notesList:       (q = '')  => http.get(`/api/v1/notes${q}`),
  notesCreate:     (payload) => http.post('/api/v1/notes', payload),

  mediaUpload:     (files)   => http.upload('/api/v1/media/upload', files),

  // --- Aliases retrocompatibles ---
  register:           (payload) => http.post('/api/v1/auth/company/register', payload),
  login:              (payload) => http.post('/api/v1/auth/company/login', payload),
  me:                 ()        => http.get('/api/v1/auth/company/me'),

  registerCompany:    (payload) => http.post('/api/v1/auth/company/register', payload),
  loginCompany:       (payload) => http.post('/api/v1/auth/company/login', payload),

  listNotes:          (q = '')  => http.get(`/api/v1/notes${q}`),
  createNote:         (payload) => http.post('/api/v1/notes', payload),
  uploadMedia:        (files)   => http.upload('/api/v1/media/upload', files),

  // Accesos de bajo nivel
  get: http.get,
  post: http.post,
  upload: http.upload,

  // Cotizaciones
  quotesList:    (q='')       => http.get(`/api/v1/quotes${q}`),
  quoteCreate:   (payload)    => http.post('/api/v1/quotes', payload),
  quoteUpdate:   (id,payload) => http.post(`/api/v1/quotes/${id}`, payload),
  quotePatch:    (id,payload) => coreRequest('PATCH', `/api/v1/quotes/${id}`, payload),
  quoteDelete:   (id)         => coreRequest('DELETE', `/api/v1/quotes/${id}`)
};

// Exports
export { API, tokenStore as authToken };
export default API;
