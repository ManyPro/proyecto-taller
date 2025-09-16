// =======================
// API BASE CONFIG
// =======================
const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';

const TOKEN_KEY = 'taller.token';
const tokenStore = {
  get: () => (typeof localStorage !== 'undefined' ? (localStorage.getItem(TOKEN_KEY) || '') : ''),
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch {} },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} }
};

async function coreRequest(method, path, data, extraHeaders = {}) {
  const isForm = (typeof FormData !== 'undefined') && (data instanceof FormData);
  const headers = { ...extraHeaders };

  if (!isForm && data != null) headers['Content-Type'] = 'application/json';

  const tok = tokenStore.get();
  if (tok) headers['Authorization'] = `Bearer ${tok}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: data == null ? undefined : (isForm ? data : JSON.stringify(data))
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

  // --- Canonical (nombres nuevos) ---
  companyRegister: (payload) => http.post('/api/v1/auth/company/register', payload),
  companyLogin:    (payload) => http.post('/api/v1/auth/company/login', payload),
  companyMe:       ()        => http.get('/api/v1/auth/company/me'),

  notesList:       (q = '')  => http.get(`/api/v1/notes${q}`),
  notesCreate:     (payload) => http.post('/api/v1/notes', payload),

  mediaUpload:     (files)   => http.upload('/api/v1/media/upload', files),

  // --- Aliases retrocompatibles (para código viejo) ---
  register:        (payload) => http.post('/api/v1/auth/company/register', payload),
  login:           (payload) => http.post('/api/v1/auth/company/login', payload),
  me:              ()        => http.get('/api/v1/auth/company/me'),

  listNotes:       (q = '')  => http.get(`/api/v1/notes${q}`),
  createNote:      (payload) => http.post('/api/v1/notes', payload),
  uploadMedia:     (files)   => http.upload('/api/v1/media/upload', files),

  // Accesos de bajo nivel
  get: http.get,
  post: http.post,
  upload: http.upload,

  quotesList:   (q='')      => http.get(`/api/v1/quotes${q}`),
  quoteCreate:  (payload)   => http.post('/api/v1/quotes', payload),
  quoteUpdate:  (id,payload)=> http.post(`/api/v1/quotes/${id}`, payload),
  quotePatch:   (id,payload)=> coreRequest('PATCH', `/api/v1/quotes/${id}`, payload),
  quoteDelete:  (id)        => coreRequest('DELETE', `/api/v1/quotes/${id}`),
};

// Exports (named y default)
export { API, tokenStore as authToken };
export default API;
