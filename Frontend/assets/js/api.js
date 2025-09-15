const API_BASE = window.API_BASE || '';

const TOKEN_KEY = 'taller.token';
export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY) || '',
  setToken: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY)
};

async function request(method, path, data, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (data && !(data instanceof FormData)) headers['Content-Type'] = 'application/json';

  const token = auth.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: data
      ? (data instanceof FormData ? data : JSON.stringify(data))
      : undefined
  });

  // Intenta parsear JSON; si viene HTML (404 Express), lánzalo como texto para debug
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof body === 'string' ? body : (body?.error || JSON.stringify(body));
    throw new Error(msg);
  }
  return body;
}

// ---- Endpoints de empresa ----
export const companyAPI = {
  register: (payload) => request('POST', '/api/v1/auth/company/register', payload),
  login:    (payload) => request('POST', '/api/v1/auth/company/login', payload),
  me:       () => request('GET', '/api/v1/auth/company/me')
};

// ---- Notas / Media (ya presentes en tu backend) ----
export const notesAPI = {
  list:   (q) => request('GET', `/api/v1/notes${q ? q : ''}`),
  create: (payload) => request('POST', '/api/v1/notes', payload)
};

export const mediaAPI = {
  upload: (files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files[]', f);
    return request('POST', '/api/v1/media/upload', fd);
  }
};
