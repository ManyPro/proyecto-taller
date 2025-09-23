// Frontend/assets/js/api.js
// Helpers de fetch con token, y endpoints normalizados para ventas, cotizaciones, inventario y precios.

export const API = {
  base: (typeof window !== 'undefined' && window.API_BASE) || '',
  token: {
    get: () => localStorage.getItem('token') || '',
    set: (t) => localStorage.setItem('token', t || ''),
  },
  headers() {
    const h = { 'Content-Type': 'application/json' };
    const tok = API.token.get();
    if (tok) h['Authorization'] = `Bearer ${tok}`;
    return h;
  },
  toQuery(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      q.set(k, String(v));
    });
    const s = q.toString();
    return s ? `?${s}` : '';
  },

  // --------- AUTH / COMPANY ---------
  me() {
    const tok = API.token.get();
    return fetch(`${API.base}/api/v1/auth/company/me`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      cache: 'no-store',
    }).then(r => r.ok ? r.json() : null);
  },

  // --------- INVENTORY ---------
  inventory: {
    async itemsList(params = {}) {
      const r = await fetch(`${API.base}/api/v1/inventory/items${API.toQuery(params)}`, {
        headers: API.headers(), cache: 'no-store'
      });
      if (!r.ok) throw await r.json().catch(() => new Error('Error inventario'));
      const data = await r.json();
      // normalizar a array
      return Array.isArray(data) ? data : (data.items || data.data || []);
    }
  },

  // --------- PRICES / SERVICES (si los usas) ---------
  async servicesList() {
    const r = await fetch(`${API.base}/api/v1/prices/services`, { headers: API.headers(), cache: 'no-store' });
    return r.ok ? r.json() : [];
  },
  async pricesList(params = {}) {
    const r = await fetch(`${API.base}/api/v1/prices${API.toQuery(params)}`, { headers: API.headers(), cache: 'no-store' });
    if (!r.ok) throw await r.json().catch(()=>new Error('Error precios'));
    const data = await r.json();
    return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
  },

  // --------- QUOTES ---------
  quotes: {
    async search(params = {}) {
      const r = await fetch(`${API.base}/api/v1/quotes/search${API.toQuery(params)}`, {
        headers: API.headers(), cache: 'no-store'
      });
      if (!r.ok) throw await r.json().catch(()=>new Error('Error búsqueda de cotizaciones'));
      return await r.json(); // {items, total, page, pageSize}
    },
    async get(id) {
      const r = await fetch(`${API.base}/api/v1/quotes/${id}`, { headers: API.headers(), cache: 'no-store' });
      if (!r.ok) throw await r.json().catch(()=>new Error('No se pudo cargar la cotización'));
      return await r.json();
    },
    async create(payload = {}) {
      const r = await fetch(`${API.base}/api/v1/quotes`, {
        method: 'POST', headers: API.headers(), body: JSON.stringify(payload)
      });
      if (!r.ok) throw await r.json().catch(()=>new Error('No se pudo crear la cotización'));
      return await r.json();
    }
  },

  // --------- SALES ---------
  sales: {
    async start() {
      const r = await fetch(`${API.base}/api/v1/sales/start`, {
        method: 'POST', headers: API.headers()
      });
      if (!r.ok) throw await r.json().catch(()=>new Error('No se pudo iniciar la venta'));
      return await r.json();
    },
    async get(id) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}`, { headers: API.headers(), cache: 'no-store' });
      if (!r.ok) throw await r.json().catch(()=>new Error('No se pudo cargar la venta'));
      return await r.json();
    },
    async update(id, body) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}`, {
        method: 'PATCH', headers: API.headers(), body: JSON.stringify(body || {})
      });
      if (!r.ok) throw await r.json().catch(()=>new Error('No se pudo actualizar la venta'));
      return await r.json();
    },
    async setCustomerVehicle(id, body) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}/cv`, {
        method: 'PATCH', headers: API.headers(), body: JSON.stringify(body || {})
      });
      if (!r.ok) throw await r.json().catch(()=>new Error('No se pudo actualizar cliente/vehículo'));
      return await r.json();
    },
    async addItem(id, payload) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}/items`, {
        method: 'POST', headers: API.headers(), body: JSON.stringify(payload || {})
      });
      if (!r.ok) throw await r.json().catch(()=>new Error('No se pudo agregar ítem'));
      return await r.json();
    },
    async updateItem(id, itemId, body) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}/items/${itemId}`, {
        method: 'PATCH', headers: API.headers(), body: JSON.stringify(body || {})
      });
      if (!r.ok) throw await r.json().catch(()=>new Error('No se pudo actualizar ítem'));
      return await r.json();
    },
    async removeItem(id, itemId) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}/items/${itemId}`, {
        method: 'DELETE', headers: API.headers()
      });
      if (!r.ok) throw await r.json().catch(()=>new Error('No se pudo eliminar ítem'));
      return await r.json();
    },
    async close(id) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}/close`, {
        method: 'POST', headers: API.headers()
      });
      if (!r.ok) throw await r.json().catch(()=>new Error('No se pudo cerrar la venta'));
      return await r.json();
    },
    // opcional si usas endpoint de QR resolver
    async addByQR(id, payload) {
      const r = await fetch(`${API.base}/api/v1/sales/addByQR`, {
        method: 'POST',
        headers: API.headers(),
        body: JSON.stringify({ saleId: id, payload })
      });
      if (!r.ok) throw await r.json().catch(()=>new Error('QR no reconocido'));
      return await r.json();
    }
  },

  // helper: por si guardas empresa activa en LS
  getActiveCompany() {
    try { return localStorage.getItem('companyId') || ''; } catch { return ''; }
  }
};
