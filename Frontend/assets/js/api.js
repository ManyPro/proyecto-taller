// Frontend/assets/js/api.js
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

  // Intentar parsear JSON; si viene HTML (404/500 de Express), devolver texto
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }

  if (!res.ok) {
    const msg = (body && body.error) ? body.error : (typeof body === 'string' ? body : res.statusText);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return body;
}

// Helpers básicos
const http = {
  get:  (path)            => coreRequest('GET',  path, null),
  post: (path, payload)   => coreRequest('POST', path, payload),
  upload: (path, files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files[]', f);
    return coreRequest('POST', path, fd);
  }
};

// Objeto API con métodos de negocio
const API = {
  base: API_BASE,
  token: tokenStore,

  // Auth empresa
  companyRegister: (payload) => http.post('/api/v1/auth/company/register', payload),
  companyLogin:    (payload) => http.post('/api/v1/auth/company/login', payload),
  companyMe:       ()        => http.get('/api/v1/auth/company/me'),

  // Notas
  notesList:   (queryString = '') => http.get(`/api/v1/notes${queryString}`),
  notesCreate: (payload)          => http.post('/api/v1/notes', payload),

  // Media
  mediaUpload: (files) => http.upload('/api/v1/media/upload', files),

  // Accesos de bajo nivel (si los usas en otras partes del front)
  get: http.get,
  post: http.post,
  upload: http.upload,
};

// Exports: named y default (para cubrir cualquier import existente)
export { API, tokenStore as authToken };
export default API;
