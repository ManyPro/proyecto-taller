// Frontend/assets/js/api.js
// Wrapper canónico de la API. Incluye TODO lo usado por Notas, Inventario, Precios, Cotizaciones y Ventas.
// Cambios clave: resolución robusta de API_BASE sin romper firmas existentes.

function resolveApiBase() {
  try {
    // 1) LocalStorage (varios nombres que has usado en el proyecto)
    const ls =
      localStorage.getItem('apiBase') ||
      localStorage.getItem('API_BASE') ||
      localStorage.getItem('api_base');
    if (ls && /^https?:/i.test(ls)) return ls.trim();

    // 2) Meta tag
    const meta = document.querySelector('meta[name="api-base"]')?.content;
    if (meta && /^https?:/i.test(meta)) return meta.trim();

    // 3) Variable global
    // eslint-disable-next-line no-undef
    if (typeof window !== 'undefined' && window.API_BASE && /^https?:/i.test(window.API_BASE)) {
      return String(window.API_BASE).trim();
    }

    // 4) Fallback (misma-origen) -> útil en dev con proxy
    return '';
  } catch {
    return '';
  }
}

let _API_BASE = resolveApiBase();

export const API = {
  // ===== Base & helpers =====
  base: _API_BASE, // string, algunos módulos lo leen directamente
  setBase(url) {
    try {
      if (url && /^https?:/i.test(url)) {
        _API_BASE = url.trim();
        API.base = _API_BASE;
        localStorage.setItem('apiBase', _API_BASE);
      }
    } catch {}
  },
  token: {
    get: () => {
      try { return localStorage.getItem('token') || ''; } catch { return ''; }
    },
    set: (t) => { try { localStorage.setItem('token', t || ''); } catch {} },
    clear: () => { try { localStorage.removeItem('token'); } catch {} },
  },
  headers(extra) {
    const h = { 'Content-Type': 'application/json' };
    const tok = API.token.get?.();
    if (tok) h['Authorization'] = `Bearer ${tok}`;
    // NOTA: no añadimos nada más para no disparar CORS raros.
    return { ...h, ...(extra || {}) };
  },
  toQuery(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      q.set(k, String(v));
    });
    const qs = q.toString();
    return qs ? `?${qs}` : '';
  },

  // ===== Auth =====
  auth: {
    async login(email, password) {
      const r = await fetch(`${API.base}/api/v1/auth/login`, {
        method: 'POST',
        headers: API.headers(),
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message || 'Login fallido');
      if (data?.token) API.token.set(data.token);
      // No tocamos nada más aquí para no romper flujos existentes
      return data;
    },
    async register(payload) {
      const r = await fetch(`${API.base}/api/v1/auth/register`, {
        method: 'POST',
        headers: API.headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message || 'Registro fallido');
      if (data?.token) API.token.set(data.token);
      return data;
    },
    async me() {
      const r = await fetch(`${API.base}/api/v1/auth/company/me`, {
        headers: API.headers(),
        cache: 'no-store',
      });
      const data = await r.json().catch(() => null);
      return data;
    },
  },

  // ===== Quotes (Cotizaciones) =====
  quotes: {
    async list(params = {}) {
      const r = await fetch(`${API.base}/api/v1/quotes${API.toQuery(params)}`, {
        headers: API.headers(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo listar cotizaciones');
      return data;
    },
    async search(params = {}) {
      const r = await fetch(`${API.base}/api/v1/quotes${API.toQuery(params)}`, {
        headers: API.headers(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo buscar cotizaciones');
      return data;
    },
    async get(id) {
      const r = await fetch(`${API.base}/api/v1/quotes/${id}`, { headers: API.headers() });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo obtener cotización');
      return data;
    },
    async create(payload) {
      const r = await fetch(`${API.base}/api/v1/quotes`, {
        method: 'POST',
        headers: API.headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo crear cotización');
      return data;
    },
    async update(id, payload) {
      const r = await fetch(`${API.base}/api/v1/quotes/${id}`, {
        method: 'PUT',
        headers: API.headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo actualizar cotización');
      return data;
    },
    async remove(id) {
      const r = await fetch(`${API.base}/api/v1/quotes/${id}`, {
        method: 'DELETE',
        headers: API.headers(),
      });
      if (!r.ok) {
        let data = null; try { data = await r.json(); } catch {}
        throw new Error(data?.message || 'No se pudo eliminar cotización');
      }
      return { ok: true };
    },
  },

  // ===== Notes =====
  notes: {
    async list(params = {}) {
      const r = await fetch(`${API.base}/api/v1/notes${API.toQuery(params)}`, { headers: API.headers() });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo listar notas');
      return data;
    },
    async create(payload) {
      const r = await fetch(`${API.base}/api/v1/notes`, {
        method: 'POST',
        headers: API.headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo crear nota');
      return data;
    },
    async update(id, payload) {
      const r = await fetch(`${API.base}/api/v1/notes/${id}`, {
        method: 'PUT',
        headers: API.headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo actualizar nota');
      return data;
    },
    async remove(id) {
      const r = await fetch(`${API.base}/api/v1/notes/${id}`, {
        method: 'DELETE',
        headers: API.headers(),
      });
      if (!r.ok) {
        let data = null; try { data = await r.json(); } catch {}
        throw new Error(data?.message || 'No se pudo eliminar nota');
      }
      return { ok: true };
    },
  },

  // ===== Inventory =====
  inventory: {
    async itemsList(params = {}) {
      const r = await fetch(`${API.base}/api/v1/inventory/items${API.toQuery(params)}`, {
        headers: API.headers(),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message || 'No se pudo listar items de inventario');
      return data;
    },
    async itemGet(id) {
      const r = await fetch(`${API.base}/api/v1/inventory/items/${id}`, { headers: API.headers() });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo obtener item');
      return data;
    },
    async itemCreate(payload) {
      const r = await fetch(`${API.base}/api/v1/inventory/items`, {
        method: 'POST',
        headers: API.headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo crear item');
      return data;
    },
    async itemUpdate(id, payload) {
      const r = await fetch(`${API.base}/api/v1/inventory/items/${id}`, {
        method: 'PUT',
        headers: API.headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo actualizar item');
      return data;
    },
    async itemRemove(id) {
      const r = await fetch(`${API.base}/api/v1/inventory/items/${id}`, {
        method: 'DELETE',
        headers: API.headers(),
      });
      if (!r.ok) {
        let data = null; try { data = await r.json(); } catch {}
        throw new Error(data?.message || 'No se pudo eliminar item');
      }
      return { ok: true };
    },

    async intakesList(params = {}) {
      const r = await fetch(`${API.base}/api/v1/inventory/vehicle-intakes${API.toQuery(params)}`, {
        headers: API.headers(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo listar entradas de vehículo');
      return data;
    },
    async intakeCreate(payload) {
      const r = await fetch(`${API.base}/api/v1/inventory/vehicle-intakes`, {
        method: 'POST',
        headers: API.headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo crear entrada de vehículo');
      return data;
    },
    async intakeUpdate(id, payload) {
      const r = await fetch(`${API.base}/api/v1/inventory/vehicle-intakes/${id}`, {
        method: 'PUT',
        headers: API.headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo actualizar entrada de vehículo');
      return data;
    },
    async intakeRemove(id) {
      const r = await fetch(`${API.base}/api/v1/inventory/vehicle-intakes/${id}`, {
        method: 'DELETE',
        headers: API.headers(),
      });
      if (!r.ok) {
        let data = null; try { data = await r.json(); } catch {}
        throw new Error(data?.message || 'No se pudo eliminar entrada de vehículo');
      }
      return { ok: true };
    },

    // URL del PNG del QR
    qrPngUrl(itemId, size = 256) {
      const tok = API.token.get?.();
      const base = `${API.base}/api/v1/inventory/items/${encodeURIComponent(itemId)}/qr.png?size=${size}`;
      return tok ? `${base}&auth=${encodeURIComponent(tok)}` : base;
    },
  },

  // ===== Prices (Lista de precios) =====
  prices: {
    async servicesList(params = {}) {
      const r = await fetch(`${API.base}/api/v1/prices/services${API.toQuery(params)}`, {
        headers: API.headers(),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message || 'No se pudo listar servicios de precios');
      return data;
    },
    async pricesList(params = {}) {
      const r = await fetch(`${API.base}/api/v1/prices${API.toQuery(params)}`, {
        headers: API.headers(),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message || 'No se pudo listar precios');
      return data;
    },
    async get(id) {
      const r = await fetch(`${API.base}/api/v1/prices/${id}`, { headers: API.headers() });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo obtener precio');
      return data;
    },
    async create(payload) {
      const r = await fetch(`${API.base}/api/v1/prices`, {
        method: 'POST',
        headers: API.headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo crear precio');
      return data;
    },
    async update(id, payload) {
      const r = await fetch(`${API.base}/api/v1/prices/${id}`, {
        method: 'PUT',
        headers: API.headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo actualizar precio');
      return data;
    },
    async remove(id) {
      const r = await fetch(`${API.base}/api/v1/prices/${id}`, {
        method: 'DELETE',
        headers: API.headers(),
      });
      if (!r.ok) {
        let data = null; try { data = await r.json(); } catch {}
        throw new Error(data?.message || 'No se pudo eliminar precio');
      }
      return { ok: true };
    },
  },

  // ===== Sales (Ventas) =====
  sales: {
    async list(params = {}) {
      const r = await fetch(`${API.base}/api/v1/sales${API.toQuery(params)}`, {
        headers: API.headers(),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.message || 'No se pudo listar ventas');
      return data;
    },
    async start() {
      const r = await fetch(`${API.base}/api/v1/sales/start`, {
        method: 'POST',
        headers: API.headers(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo iniciar venta');
      return data;
    },
    async get(id) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}`, { headers: API.headers() });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo obtener venta');
      return data;
    },
    async update(id, payload) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}`, {
        method: 'PATCH',
        headers: API.headers(),
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo actualizar venta');
      return data;
    },
    async setCustomerVehicle(id, { customer, vehicle }) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}/customer-vehicle`, {
        method: 'PATCH',
        headers: API.headers(),
        body: JSON.stringify({ customer, vehicle }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo guardar cliente/vehículo');
      return data;
    },
    // body: { source:'inventory'|'price'|'custom', refId?, sku?, name?, qty, unitPrice }
    async addItem(id, body) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}/items`, {
        method: 'POST',
        headers: API.headers(),
        body: JSON.stringify(body || {}),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo agregar ítem');
      return data;
    },
    async updateItem(id, itemId, body) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}/items/${itemId}`, {
        method: 'PATCH',
        headers: API.headers(),
        body: JSON.stringify(body || {}),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo actualizar ítem');
      return data;
    },
    async removeItem(id, itemId) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}/items/${itemId}`, {
        method: 'DELETE',
        headers: API.headers(),
      });
      const data = await r.json().catch(() => ({ ok: r.ok }));
      if (!r.ok) throw new Error(data?.message || 'No se pudo eliminar ítem');
      return data;
    },
    async addByQR(id, rawPayload) {
      const r = await fetch(`${API.base}/api/v1/sales/addByQR`, {
        method: 'POST',
        headers: API.headers(),
        body: JSON.stringify({ saleId: id, payload: rawPayload }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo agregar por QR');
      return data;
    },
    async close(id) {
      const r = await fetch(`${API.base}/api/v1/sales/${id}/close`, {
        method: 'POST',
        headers: API.headers(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || 'No se pudo cerrar la venta');
      return data;
    },
  },

  // ===== Alias legacy =====
  servicesList(params = {}) { return API.prices.servicesList(params); },
  pricesList(params = {})   { return API.prices.pricesList(params); },
};
