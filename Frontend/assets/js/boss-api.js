const API_BASE = (typeof window !== 'undefined' && window.BACKEND_URL)
  ? window.BACKEND_URL
  : ((typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '');

function scopeFromBase(base) {
  try {
    return new URL(base || (typeof window !== 'undefined' ? window.location.origin : '')).host || 'local';
  } catch {
    return (base || 'local') || 'local';
  }
}

const SCOPE = scopeFromBase(API_BASE);
const ACTIVE_KEY = `taller.boss.active:${SCOPE}`;
const tokenKeyFor = (email) => `taller.boss.token:${SCOPE}:${String(email || '').toLowerCase()}`;
const usernameKeyFor = (email) => `taller.boss.username:${SCOPE}:${String(email || '').toLowerCase()}`;
const companyNameKeyFor = (email) => `taller.boss.companyName:${SCOPE}:${String(email || '').toLowerCase()}`;

const bossSession = {
  getActiveEmail() {
    try {
      return localStorage.getItem(ACTIVE_KEY) || '';
    } catch {
      return '';
    }
  },
  setActiveEmail(email) {
    try {
      localStorage.setItem(ACTIVE_KEY, String(email || '').toLowerCase());
    } catch {}
  },
  clearActiveEmail() {
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {}
  },
  getToken(email) {
    try {
      return localStorage.getItem(tokenKeyFor(email || this.getActiveEmail())) || '';
    } catch {
      return '';
    }
  },
  setToken(token, email) {
    try {
      localStorage.setItem(tokenKeyFor(email || this.getActiveEmail()), String(token || ''));
    } catch {}
  },
  clearToken(email) {
    try {
      localStorage.removeItem(tokenKeyFor(email || this.getActiveEmail()));
    } catch {}
  },
  getUsername(email) {
    try {
      return localStorage.getItem(usernameKeyFor(email || this.getActiveEmail())) || '';
    } catch {
      return '';
    }
  },
  setUsername(username, email) {
    try {
      localStorage.setItem(usernameKeyFor(email || this.getActiveEmail()), String(username || '').toLowerCase());
    } catch {}
  },
  clearUsername(email) {
    try {
      localStorage.removeItem(usernameKeyFor(email || this.getActiveEmail()));
    } catch {}
  },
  getCompanyName(email) {
    try {
      return localStorage.getItem(companyNameKeyFor(email || this.getActiveEmail())) || '';
    } catch {
      return '';
    }
  },
  setCompanyName(name, email) {
    try {
      localStorage.setItem(companyNameKeyFor(email || this.getActiveEmail()), String(name || ''));
    } catch {}
  },
  clearCompanyName(email) {
    try {
      localStorage.removeItem(companyNameKeyFor(email || this.getActiveEmail()));
    } catch {}
  },
  clearAll(email) {
    this.clearToken(email);
    this.clearUsername(email);
    this.clearCompanyName(email);
    this.clearActiveEmail();
  }
};

async function bossRequest(method, path, payload) {
  const headers = {};
  if (payload != null) headers['Content-Type'] = 'application/json';
  const token = bossSession.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: payload == null ? undefined : JSON.stringify(payload),
    cache: 'no-store',
    credentials: 'omit'
  });

  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = text; }

  if (!response.ok) {
    const message = body?.message || body?.error || (typeof body === 'string' ? body : response.statusText);
    throw new Error(message || `HTTP ${response.status}`);
  }
  return body;
}

export const BossAPI = {
  base: API_BASE,
  session: bossSession,
  async login(payload) {
    const email = String(payload?.email || '').toLowerCase().trim();
    const response = await bossRequest('POST', '/api/v1/auth/company/boss/login', payload);
    if (!response?.token || !response?.company?.email) {
      throw new Error('Login del jefe invÃ¡lido');
    }
    bossSession.setActiveEmail(email || response.company.email);
    bossSession.setToken(response.token, response.company.email);
    bossSession.setUsername(response?.boss?.username || payload?.username || '', response.company.email);
    bossSession.setCompanyName(response?.company?.name || '', response.company.email);
    return response;
  },
  async me() {
    const response = await bossRequest('GET', '/api/v1/auth/company/boss/me');
    const email = String(response?.company?.email || bossSession.getActiveEmail() || '').toLowerCase().trim();
    if (email) {
      bossSession.setActiveEmail(email);
      bossSession.setUsername(response?.boss?.username || bossSession.getUsername(email), email);
      bossSession.setCompanyName(response?.company?.name || bossSession.getCompanyName(email), email);
    }
    return response;
  },
  logout() {
    bossSession.clearAll();
    return Promise.resolve();
  },
  isAuthenticated() {
    return !!bossSession.getToken();
  },
  cashflow: {
    balances: () => bossRequest('GET', '/api/v1/boss/cashflow/accounts/balances'),
    entries: (params = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          qs.set(key, value);
        }
      });
      const query = qs.toString();
      return bossRequest('GET', `/api/v1/boss/cashflow/entries${query ? `?${query}` : ''}`);
    }
  },
  sales: {
    list: (params = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          qs.set(key, value);
        }
      });
      const query = qs.toString();
      return bossRequest('GET', `/api/v1/boss/sales${query ? `?${query}` : ''}`);
    },
    get: (id) => bossRequest('GET', `/api/v1/boss/sales/${encodeURIComponent(id)}`)
  },
  inventory: {
    suppliers: () => bossRequest('GET', '/api/v1/boss/inventory/suppliers'),
    items: (params = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          qs.set(key, value);
        }
      });
      const query = qs.toString();
      return bossRequest('GET', `/api/v1/boss/inventory/items${query ? `?${query}` : ''}`);
    }
  }
};

if (typeof window !== 'undefined') {
  window.BossAPI = BossAPI;
}

export default BossAPI;
