  // =======================
// API publico
// =======================
const API_BASE = (typeof window !== 'undefined' && window.BACKEND_URL) ? window.BACKEND_URL : 
                (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';

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

// companyId store por empresa activa (para resolver companyId en el front)
const companyIdKeyFor = (email) => `taller.companyId:${SCOPE}:${String(email || '').toLowerCase()}`;
const companyIdStore = {
  get: (email) => {
    const em = (email || activeCompany.get());
    try { return (typeof localStorage !== 'undefined') ? (localStorage.getItem(companyIdKeyFor(em)) || '') : ''; } catch { return ''; }
  },
  set: (id, email) => { try { localStorage.setItem(companyIdKeyFor(email || activeCompany.get()), String(id || '')); } catch { } },
  clear: (email) => { try { localStorage.removeItem(companyIdKeyFor(email || activeCompany.get())); } catch { } }
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
    // Preferir 'message' si está disponible (más descriptivo), sino usar 'error'
    const msg = (body && body.message) ? body.message : ((body && body.error) ? body.error : (typeof body === 'string' ? body : res.statusText));
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
  companyId: companyIdStore,
  
  // Métodos HTTP directos para uso general
  get: (path, params) => {
    // Si params es undefined o null, usar objeto vacío
    // Si es string, asumir que ya es query string
    if (params === undefined || params === null) {
      return http.get(path);
    }
    if (typeof params === 'string') {
      return http.get(`${path}${params}`);
    }
    const query = toQuery(params || {});
    return http.get(`${path}${query}`);
  },
  post: (path, payload) => http.post(path, payload),
  put: (path, payload) => http.put(path, payload),
  patch: (path, payload) => http.patch(path, payload),
  del: (path) => http.del(path),
  
  company: {
    getPreferences: () => http.get('/api/v1/company/preferences').then(r=> r.preferences || { laborPercents: [] }),
    setPreferences: (prefs) => http.put('/api/v1/company/preferences', prefs).then(r=> r.preferences || {}),
    getTechnicians: async () => {
      const response = await http.get('/api/v1/company/technicians');
      const techs = response?.technicians || [];
      // Normalizar: extraer nombres como strings
      return Array.isArray(techs) ? techs.map(t => {
        if (typeof t === 'string') return t.trim();
        if (t && typeof t === 'object' && t.name) return String(t.name).trim();
        return '';
      }).filter(n => n && n.trim() !== '') : [];
    },
    addTechnician: async (name, identification, basicSalary, workHoursPerMonth, basicSalaryPerDay, contractType) => {
      const res = await http.post('/api/v1/company/technicians', { 
        name,
        identification: identification || '',
        basicSalary: (basicSalary !== null && basicSalary !== undefined && basicSalary !== '') ? Number(basicSalary) : null,
        workHoursPerMonth: (workHoursPerMonth !== null && workHoursPerMonth !== undefined && workHoursPerMonth !== '') ? Number(workHoursPerMonth) : null,
        basicSalaryPerDay: (basicSalaryPerDay !== null && basicSalaryPerDay !== undefined && basicSalaryPerDay !== '') ? Number(basicSalaryPerDay) : null,
        contractType: contractType || ''
      });
      return res.technicians || [];
    },
    deleteTechnician: async (name) => {
      const res = await http.del(`/api/v1/company/technicians/${encodeURIComponent(String(name||''))}`);
      return res.technicians || [];
    },
    removeTechnician: async (name) => {
      const res = await http.del(`/api/v1/company/technicians/${encodeURIComponent(String(name||''))}`);
      return res.technicians || [];
    },
    updateTechnician: async (currentName, newName, identification, basicSalary, workHoursPerMonth, basicSalaryPerDay, contractType) => {
      const res = await http.put(`/api/v1/company/technicians/${encodeURIComponent(String(currentName||''))}`, {
        name: newName,
        identification: identification || '',
        basicSalary: (basicSalary !== null && basicSalary !== undefined && basicSalary !== '') ? Number(basicSalary) : null,
        workHoursPerMonth: (workHoursPerMonth !== null && workHoursPerMonth !== undefined && workHoursPerMonth !== '') ? Number(workHoursPerMonth) : null,
        basicSalaryPerDay: (basicSalaryPerDay !== null && basicSalaryPerDay !== undefined && basicSalaryPerDay !== '') ? Number(basicSalaryPerDay) : null,
        contractType: contractType || ''
      });
      return res.technicians || [];
    },
    getTechConfig: () => http.get('/api/v1/company/tech-config').then(r=> r.config || { laborKinds:[], technicians:[] }),
    setTechConfig: (config) => http.put('/api/v1/company/tech-config', config).then(r=> r.config || config),
    updateTechConfig: (updates) => {
      return http.get('/api/v1/company/tech-config').then(r => {
        const current = r.config || { laborKinds: [], technicians: [] };
        const merged = { ...current, ...updates };
        return http.put('/api/v1/company/tech-config', merged).then(res => res.config || merged);
      });
    },
    togglePublicCatalog: (enabled) => http.patch('/api/v1/company/public-catalog', { enabled }).then(r => !!r.publicCatalogEnabled),
    getFeatures: () => http.get('/api/v1/company/features').then(r => r.features || {}),
    getToggles: () => http.get('/api/v1/company/features').then(r => ({
      features: r?.features || {},
      featureOptions: r?.featureOptions || {},
      restrictions: r?.restrictions || {}
    })),
    setFeatures: (patch) => http.patch('/api/v1/company/features', patch).then(r => r.features || {}),
    getFeatureOptions: () => http.get('/api/v1/company/feature-options').then(r => r.featureOptions || {}),
    setFeatureOptions: (patch) => http.patch('/api/v1/company/feature-options', patch).then(r => r.featureOptions || {}),
    getRestrictions: () => http.get('/api/v1/company/restrictions').then(r => r.restrictions || {})
  },

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
      try { if(res?.company?.id) companyIdStore.set(res.company.id, email); } catch {}
      try { if(res?.company?.features) localStorage.setItem(`taller.features:${SCOPE}:${email}`, JSON.stringify(res.company.features)); } catch {}
      return { ...res, email };
  },
    companyMe: async () => {
      const body = await http.get('/api/v1/auth/company/me');
      try {
        const email = activeCompany.get();
        const cid = body?.company?.id || body?.id || body?._id || '';
        if (cid) companyIdStore.set(cid, email);
        if (body?.company?.features) localStorage.setItem(`taller.features:${SCOPE}:${email}`, JSON.stringify(body.company.features));
      } catch {}
      return body;
    },
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
  
  // --- Calendario / Eventos ---
  calendar: {
    list: (params = {}) => http.get(`/api/v1/calendar${toQuery(params)}`),
    create: (payload) => http.post('/api/v1/calendar', payload),
    update: (id, payload) => http.put(`/api/v1/calendar/${id}`, payload),
    delete: (id) => http.del(`/api/v1/calendar/${id}`),
    syncNoteReminders: () => http.post('/api/v1/calendar/sync-note-reminders'),
    searchByPlate: (plate) => http.get(`/api/v1/calendar/search-by-plate/${encodeURIComponent(plate)}`),
    getQuotesByPlate: (plate) => http.get(`/api/v1/calendar/quotes-by-plate/${encodeURIComponent(plate)}`),
    getSettings: () => http.get('/api/v1/calendar/settings'),
    updateSettings: (payload) => http.put('/api/v1/calendar/settings', payload)
  },

  // --- Chats ---
  chats: {
    list: (params = {}) => http.get(`/api/v1/chats${toQuery(params)}`),
    get: (id) => http.get(`/api/v1/chats/${id}`),
    create: (payload) => http.post('/api/v1/chats', payload),
    update: (id, payload) => http.patch(`/api/v1/chats/${id}`, payload),
    delete: (id) => http.del(`/api/v1/chats/${id}`),
    addInventoryItem: (id, itemId) => http.post(`/api/v1/chats/${id}/inventory`, { itemId }),
    addComment: (id, text) => http.post(`/api/v1/chats/${id}/comments`, { text })
  },

  // --- Cotizaciones ---
  // --- Cotizaciones ---
  quotesListRaw: async (q = '') => {
    try {
      const path = typeof q === 'string' ? `/api/v1/quotes${q}` : `/api/v1/quotes${toQuery(q||{})}`;
      return await http.get(path);
    } catch(e){
      if(/401|autorizad|token/i.test(e.message||'')) {
        console.warn('[API] No autorizado al listar cotizaciones. Revisa token.');
      }
      throw e;
    }
  },
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
  prices: {
    list: (params = {}) => http.get(`/api/v1/prices${toQuery(params)}`),
    get: (id) => http.get(`/api/v1/prices/${id}`),
    create: (payload) => http.post('/api/v1/prices', payload),
    update: (id, body) => http.put(`/api/v1/prices/${id}`, body),
    delete: (id) => http.del(`/api/v1/prices/${id}`),
  },
  // Mantener compatibilidad con nombres antiguos
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

  // --- Vehículos (global) ---
  vehicles: {
    list: (params = {}) => http.get(`/api/v1/vehicles${toQuery(params)}`),
    get: (id) => http.get(`/api/v1/vehicles/${id}`),
    create: (payload) => http.post('/api/v1/vehicles', payload),
    update: (id, payload) => http.put(`/api/v1/vehicles/${id}`, payload),
    delete: (id, hard = false) => http.del(`/api/v1/vehicles/${id}${hard ? '?hard=true' : ''}`),
    search: (params = {}) => http.get(`/api/v1/vehicles/search${toQuery(params)}`),
    getMakes: () => http.get('/api/v1/vehicles/makes'),
    getLinesByMake: (make) => http.get(`/api/v1/vehicles/makes/${encodeURIComponent(make)}/lines`),
    validateYear: (vehicleId, year) => http.get(`/api/v1/vehicles/validate-year?vehicleId=${vehicleId}&year=${year}`)
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

    addItemsBatch: (id, items) =>
      http.post(`/api/v1/sales/${id}/items/batch`, { items }),

    updateItem: (id, itemId, payload) =>
      http.put(`/api/v1/sales/${id}/items/${itemId}`, payload),

    removeItem: (id, itemId) =>
      http.del(`/api/v1/sales/${id}/items/${itemId}`),

    setCustomerVehicle: (id, payload) =>
      http.put(`/api/v1/sales/${id}/customer-vehicle`, payload),

    update: (id, payload) =>
      http.patch(`/api/v1/sales/${id}`, payload),

    deleteBulk: (payload) =>
      http.post('/api/v1/sales/bulk/delete', payload),

    close: (id, payload = {}) =>
      http.post(`/api/v1/sales/${id}/close`, payload),
    updateClose: (id, payload = {}) =>
      http.patch(`/api/v1/sales/${id}/close`, payload),

    addByQR: (saleId, payload) =>
      http.post(`/api/v1/sales/addByQR`, { saleId, payload }),

    completeSlot: (id, slotIndex, itemId, sku) =>
      http.post(`/api/v1/sales/${id}/complete-slot`, { slotIndex, itemId, sku }),

    list: (params = {}) => http.get(`/api/v1/sales${toQuery(params)}`),
    summary: (params = {}) => http.get(`/api/v1/sales/summary${toQuery(params)}`),
  techReport: (params = {}) => http.get(`/api/v1/sales/technicians/report${toQuery(params)}`),
    cancel: (id) => http.post(`/api/v1/sales/${id}/cancel`, {}),
    profileByPlate: (plate, opts = {}) => {
      const params = {};
      if (opts.fuzzy) params.fuzzy = 'true';
      const q = Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : '';
      return http.get(`/api/v1/sales/profile/by-plate/${encodeURIComponent(String(plate || '').toUpperCase())}${q}`);
    },
    // Buscar perfil por número de identificación del cliente
    profileById: (idNumber) => {
      const id = encodeURIComponent(String(idNumber || '').trim());
      if (!id) return Promise.resolve(null);
      return http.get(`/api/v1/sales/profile/by-id/${id}`);
    },
    setTechnician: (id, technician) => http.patch(`/api/v1/sales/${id}/technician`, { technician })
  },
  accounts: {
    list: () => http.get('/api/v1/cashflow/accounts'),
    create: (payload) => http.post('/api/v1/cashflow/accounts', payload),
    update: (id, body) => http.patch(`/api/v1/cashflow/accounts/${id}`, body),
    balances: () => http.get('/api/v1/cashflow/accounts/balances')
  },
  cashflow: {
    list: (params={}) => http.get(`/api/v1/cashflow/entries${toQuery(params)}`),
    create: (payload) => http.post('/api/v1/cashflow/entries', payload),
    update: (id, payload) => http.patch(`/api/v1/cashflow/entries/${id}`, payload),
    delete: (id) => http.del(`/api/v1/cashflow/entries/${id}`),
    fixBalances: () => http.post('/api/v1/cashflow/entries/fix-balances'),
    // Préstamos a empleados
    loans: {
      list: (params={}) => http.get(`/api/v1/cashflow/loans${toQuery(params)}`),
      create: (payload) => http.post('/api/v1/cashflow/loans', payload),
      getPending: (technicianName) => http.get(`/api/v1/cashflow/loans/pending?technicianName=${encodeURIComponent(technicianName)}`),
      update: (id, payload) => http.patch(`/api/v1/cashflow/loans/${id}`, payload),
      settle: (id, payload) => http.post(`/api/v1/cashflow/loans/${id}/settle`, payload),
      delete: (id) => http.del(`/api/v1/cashflow/loans/${id}`)
    }
  },
  receivables: {
    // Empresas
    companies: {
      list: (params={}) => http.get(`/api/v1/receivables/companies${toQuery(params)}`),
      get: (id) => http.get(`/api/v1/receivables/companies/${id}`),
      create: (payload) => http.post('/api/v1/receivables/companies', payload),
      update: (id, payload) => http.put(`/api/v1/receivables/companies/${id}`, payload),
      delete: (id) => http.del(`/api/v1/receivables/companies/${id}`)
    },
    // Links Cliente-Empresa
    links: {
      list: (params={}) => http.get(`/api/v1/receivables/links${toQuery(params)}`),
      getByPlate: (plate) => http.get(`/api/v1/receivables/links/plate/${encodeURIComponent(plate)}`),
      create: (payload) => http.post('/api/v1/receivables/links', payload),
      delete: (id) => http.del(`/api/v1/receivables/links/${id}`)
    },
    // Cuentas por cobrar
    list: (params={}) => http.get(`/api/v1/receivables${toQuery(params)}`),
    get: (id) => http.get(`/api/v1/receivables/${id}`),
    create: (payload) => http.post('/api/v1/receivables', payload),
    addPayment: (id, payload) => http.post(`/api/v1/receivables/${id}/payment`, payload),
    cancel: (id, payload={}) => http.post(`/api/v1/receivables/${id}/cancel`, payload),
    stats: (params={}) => http.get(`/api/v1/receivables/stats${toQuery(params)}`)
  },
  templates: {
    list: (params={}) => http.get(`/api/v1/templates${toQuery(params)}`),
    getByType: (type) => http.get(`/api/v1/templates?type=${encodeURIComponent(type)}`),
    getById: (id) => http.get(`/api/v1/templates/${id}`),
    get: (id) => http.get(`/api/v1/templates/${id}`), // alias for backward compatibility
    active: (type) => http.get(`/api/v1/templates/active/${encodeURIComponent(type)}`),
    create: (payload) => http.post('/api/v1/templates', payload),
    update: (id, payload) => http.patch(`/api/v1/templates/${id}`, payload),
    delete: (id) => http.del(`/api/v1/templates/${id}`),
    duplicate: (id, payload) => http.post(`/api/v1/templates/${id}/duplicate`, payload),
    activate: (id) => http.patch(`/api/v1/templates/${id}`, { activate: true }),
    preview: (payload) => http.post('/api/v1/templates/preview', payload)
  },
  // --- Perfiles (helpers generales) ---
  profiles: {
    byId: (idNumber) => {
      const id = encodeURIComponent(String(idNumber || '').trim());
      if (!id) return Promise.resolve(null);
      // Preferir endpoint de ventas que implementa el lookup consolidado
      return http.get(`/api/v1/sales/profile/by-id/${id}`);
    },
    // Vehículos no asignados (pendientes de aprobación)
    unassignedVehicles: {
      list: (params = {}) => http.get(`/api/v1/profiles/unassigned-vehicles${toQuery(params)}`),
      get: (id) => http.get(`/api/v1/profiles/unassigned-vehicles/${id}`),
      approve: (id, payload = {}) => http.post(`/api/v1/profiles/unassigned-vehicles/${id}/approve`, payload),
      reject: (id, payload = {}) => http.post(`/api/v1/profiles/unassigned-vehicles/${id}/reject`, payload),
      delete: (id, deleteProfile = false) => http.del(`/api/v1/profiles/unassigned-vehicles/${id}${deleteProfile ? '?deleteProfile=true' : ''}`),
      stats: () => http.get('/api/v1/profiles/unassigned-vehicles/stats')
    }
  },
  
  // --- SKUs ---
  skus: {
    list: (params = {}) => http.get(`/api/v1/skus${toQuery(params)}`),
    byCategory: () => http.get('/api/v1/skus/by-category'),
    stats: () => http.get('/api/v1/skus/stats'),
    get: (id) => http.get(`/api/v1/skus/${id}`),
    getByCode: (code) => http.get(`/api/v1/skus/code/${encodeURIComponent(code)}`),
    create: (payload) => http.post('/api/v1/skus', payload),
    update: (id, payload) => http.patch(`/api/v1/skus/${id}`, payload),
    delete: (id) => http.del(`/api/v1/skus/${id}`),
    getSuggestion: (prefix) => http.get(`/api/v1/skus/suggestion/${encodeURIComponent(prefix)}`),
    markAsPrinted: (id) => http.patch(`/api/v1/skus/${id}/print`),
    markAsApplied: (id) => http.patch(`/api/v1/skus/${id}/apply`),
    updateNotes: (id, notes) => http.patch(`/api/v1/skus/${id}/notes`, { notes }),
    backfillFromItems: () => http.post('/api/v1/skus/backfill/items')
  }
};

// Expose global early (para otros módulos que cargan en paralelo)
if (typeof window !== 'undefined') {
  window.API = window.API || {};
  Object.assign(window.API, API);
}

// Exports (only for module environments like Node/bundlers). In the browser we rely on window.API above.
/* eslint-disable no-undef */
try {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { API, authToken: tokenStore, default: API };
  }
} catch { }


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
        es.addEventListener('chat:created', e => onEvent && onEvent('chat:created', JSON.parse(e.data || '{}')));
        es.addEventListener('chat:updated', e => onEvent && onEvent('chat:updated', JSON.parse(e.data || '{}')));
        es.addEventListener('chat:deleted', e => onEvent && onEvent('chat:deleted', JSON.parse(e.data || '{}')));
        return es;
      }
    };
  } catch { }
}

// Asegurar que window.API_BASE esté configurado para compatibilidad
if (typeof window !== 'undefined') {
  window.API_BASE = API_BASE;
}
