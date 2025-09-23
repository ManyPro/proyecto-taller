// Frontend/assets/js/sales.js
// Ventas multi-pestaña + QR + PDF + WhatsApp, sin inyectar layout.
// Usa el DOM existente en index.html.

import { API } from './api.js';

// ---------- helpers DOM / formato ----------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const money = (n) =>
  '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ---------- Modal global ----------
function openModal() {
  const modal = $('#modal');
  if (!modal) return () => {};
  modal.classList.remove('hidden');
  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  const onOverlay = (e) => { if (e.target === modal) closeModal(); };
  document.addEventListener('keydown', onKey);
  modal.addEventListener('click', onOverlay, { once: true });
  document.body.style.overflow = 'hidden';
  return () => document.removeEventListener('keydown', onKey);
}
function closeModal() {
  const modal = $('#modal');
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// ---------- PDF helpers ----------
async function fetchCompanySafe() {
  try {
    const tok = API.token.get?.();
    const r = await fetch(`${API.base}/api/v1/auth/company/me`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
function numberToMoney(n) {
  const v = Math.round(Number(n || 0));
  return '$' + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function buildSalePdf(sale, company) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const C = {
    name: company?.name || 'Taller Automotriz',
    email: company?.email || '',
    nit: company?.nit || '',
    phone: company?.phone || '',
  };
  const created = window.dayjs ? dayjs(sale.createdAt) : null;
  const when = created ? created.format('DD/MM/YYYY HH:mm') : new Date().toLocaleString();

  // Encabezado
  doc.setFontSize(14); doc.text(C.name, 14, 16);
  doc.setFontSize(10);
  if (C.nit)   doc.text(`NIT: ${C.nit}`, 14, 22);
  if (C.phone) doc.text(`Tel: ${C.phone}`, 14, 27);
  if (C.email) doc.text(C.email, 14, 32);

  doc.setFontSize(16); doc.text('VENTA', 196, 16, { align: 'right' });
  const nro = sale.number ? String(sale.number).padStart(5, '0') : (sale._id || '').slice(-6).toUpperCase();
  doc.setFontSize(10);
  doc.text(`No: ${nro}`, 196, 22, { align: 'right' });
  doc.text(`Fecha: ${when}`, 196, 27, { align: 'right' });
  doc.text(`Estado: ${sale.status?.toUpperCase() || 'OPEN'}`, 196, 32, { align: 'right' });

  // Cliente / Vehículo
  const y0 = 40;
  doc.setFontSize(11);
  doc.text('Cliente', 14, y0);
  doc.text('Vehículo', 110, y0);

  doc.setFontSize(10);
  const c = sale.customer || {}; const v = sale.vehicle || {};
  doc.text([
    `Nombre: ${c.name || '-'}`,
    `Identificación: ${c.idNumber || '-'}`,
    `Tel: ${c.phone || '-'}`,
    `Email: ${c.email || '-'}`,
    `Dirección: ${c.address || '-'}`,
  ], 14, y0 + 6);

  doc.text([
    `Placa: ${v.plate || '-'}`,
    `Marca: ${v.brand || '-'}`,
    `Línea: ${v.line || '-'}`,
    `Motor: ${v.engine || '-'}`,
    `Año: ${v.year || '-'}  |  Km: ${v.mileage ?? '-'}`,
  ], 110, y0 + 6);

  // Ítems
  const head = [['SKU', 'Descripción', 'Cant.', 'Unit', 'Total']];
  const body = (sale.items || []).map(it => [
    it.sku || '', it.name || '',
    String(it.qty ?? 1),
    numberToMoney(it.unitPrice || 0),
    numberToMoney(it.total || 0),
  ]);
  const startY = y0 + 36;
  doc.autoTable({
    startY, head, body,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42] },
    theme: 'grid',
  });

  // Totales
  const endY = doc.lastAutoTable.finalY || startY;
  const right = (x) => 196 - x;
  doc.setFontSize(11);
  doc.text(`Subtotal: ${numberToMoney(sale.subtotal || 0)}`, right(0), endY + 8,  { align: 'right' });
  doc.text(`Impuestos: ${numberToMoney(sale.tax || 0)}`,      right(0), endY + 14, { align: 'right' });
  doc.setFontSize(13);
  doc.text(`TOTAL: ${numberToMoney(sale.total || 0)}`,        right(0), endY + 22, { align: 'right' });

  doc.setFontSize(9);
  doc.text('Gracias por su compra.', 14, 290);

  return doc;
}

// ---------- QR helpers ----------
async function isNativeQRSupported() {
  if (!('BarcodeDetector' in window)) return false;
  try {
    const fmts = await window.BarcodeDetector.getSupportedFormats?.();
    if (Array.isArray(fmts)) return fmts.includes('qr_code');
    return true;
  } catch { return true; }
}
let jsQRPromise = null;
function ensureJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (jsQRPromise) return jsQRPromise;
  jsQRPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    s.async = true;
    s.onload = () => resolve(window.jsQR);
    s.onerror = () => reject(new Error('No se pudo cargar jsQR'));
    document.head.appendChild(s);
  });
  return jsQRPromise;
}
// IT:<itemId> | IT:<companyId>:<itemId> | IT:<companyId>:<itemId>:<sku?>
function parseInventoryCode(raw = '') {
  const s = String(raw || '').trim();
  if (!s.toUpperCase().startsWith('IT:')) return null;
  const parts = s.split(':').map(p => p.trim()).filter(Boolean);
  if (parts.length === 2) return { itemId: parts[1], companyId: null, sku: null };
  if (parts.length >= 3) return { companyId: parts[1] || null, itemId: parts[2] || null, sku: (parts[3] || '').toUpperCase() || null };
  return null;
}

// ================== ESTADO ventas ==================
const state = {
  current: null,                 // venta activa (objeto)
  cache: new Map(),              // saleId -> sale (para títulos)
  openTabs: [],                  // ids abiertas
  titles: {},                    // saleId -> título custom
  keyTabs()  { return `sales:openTabs:${API.getActiveCompany?.() || 'default'}`; },
  keyTitles(){ return `sales:titles:${API.getActiveCompany?.() || 'default'}`; },
  load() {
    try { this.openTabs = JSON.parse(localStorage.getItem(this.keyTabs()) || '[]'); } catch { this.openTabs = []; }
    try { this.titles   = JSON.parse(localStorage.getItem(this.keyTitles()) || '{}'); } catch { this.titles = {}; }
  },
  saveTabs()   { try { localStorage.setItem(this.keyTabs(), JSON.stringify(this.openTabs)); }   catch {} },
  saveTitles() { try { localStorage.setItem(this.keyTitles(), JSON.stringify(this.titles)); }   catch {} },
  addTab(id)   { if (!this.openTabs.includes(id)) { this.openTabs.push(id); this.saveTabs(); } renderTabs(); },
  removeTab(id){ this.openTabs = this.openTabs.filter(x => x !== id); this.saveTabs(); renderTabs(); },
};

// ================== RENDER TABS ==================
function computeTitle(sale) {
  if (!sale) return '—';
  const custom = state.titles[sale._id];
  if (custom) return custom;
  const plate = sale.vehicle?.plate?.toUpperCase();
  if (plate)  return `Venta (${plate})`;
  const nro = sale.number ? String(sale.number).padStart(4, '0') : (sale._id || '').slice(-4).toUpperCase();
  return `Vta ${nro}`;
}

function renderTabs() {
  const wrap = $('#saleTabs');
  if (!wrap) return;

  // reconcilia títulos con cache
  const chips = state.openTabs.map((id) => {
    const sale = state.cache.get(id);
    const title = sale ? computeTitle(sale) : `Vta ${String(id).slice(-4).toUpperCase()}`;
    const active = state.current?._id === id ? 'active' : '';
    return `
      <span class="chip ${active}" data-id="${id}" title="${title}">
        ${title} <b class="close" data-x="${id}">×</b>
      </span>
    `;
  }).join('') || `<span class="chip muted">— sin ventas abiertas —</span>`;

  wrap.innerHTML = chips;

  // clic para activar
  $$('#saleTabs [data-id]').forEach(el => {
    el.onclick = async () => {
      const id = el.getAttribute('data-id');
      if (!id) return;
      await switchTo(id);
    };
    // renombrar con doble clic
    el.ondblclick = () => {
      const id = el.getAttribute('data-id');
      const currentTitle = state.titles[id] || computeTitle(state.cache.get(id) || {});
      const name = prompt('Nombre de la venta', currentTitle || '');
      if (name && name.trim()) {
        state.titles[id] = name.trim();
        state.saveTitles();
        renderTabs();
      }
    };
  });
  // cerrar
  $$('#saleTabs [data-x]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const id = el.getAttribute('data-x');
      if (state.current?._id === id) state.current = null;
      state.removeTab(id);
      renderSale(); // limpia tabla si quedó sin activa
    };
  });
}

// ================== RENDER CUERPO DE VENTA ==================
const bodyEl  = $('#sales-body');
const totalEl = $('#sales-total');

function renderMini() {
  const s = state.current;
  $('#sv-mini-plate').textContent = s?.vehicle?.plate?.toUpperCase() || '—';
  $('#sv-mini-name').textContent  = 'Cliente: ' + (s?.customer?.name || '—');
  $('#sv-mini-phone').textContent = 'Cel: '    + (s?.customer?.phone || '—');
}

function bindItemRow(tr, itemId) {
  tr.querySelector('.qty').onchange = async (e) => {
    const qty = Number(e.target.value || 0);
    state.current = await API.sales.updateItem(state.current._id, itemId, { qty });
    state.cache.set(state.current._id, state.current);
    renderSale();
  };
  tr.querySelector('.u').onchange = async (e) => {
    const unitPrice = Number(e.target.value || 0);
    state.current = await API.sales.updateItem(state.current._id, itemId, { unitPrice });
    state.cache.set(state.current._id, state.current);
    renderSale();
  };
  tr.querySelector('[data-del]').onclick = async () => {
    state.current = await API.sales.removeItem(state.current._id, itemId);
    state.cache.set(state.current._id, state.current);
    renderSale();
  };
}

function renderSale() {
  if (!state.current) {
    bodyEl.innerHTML = '';
    totalEl.textContent = '$0';
    renderMini();
    renderTabs();
    return;
  }
  const rows = (state.current.items || []).map(it => `
    <tr data-id="${it._id}">
      <td>${it.sku || ''}</td>
      <td>${it.name || ''}</td>
      <td><input type="number" min="0" step="1" value="${it.qty || 1}" class="qty"></td>
      <td><input type="number" min="0" step="1" value="${it.unitPrice || 0}" class="u"></td>
      <td>${money(it.total || 0)}</td>
      <td><button class="danger" data-del>Eliminar</button></td>
    </tr>
  `).join('');
  bodyEl.innerHTML = rows || `<tr><td colspan="99" class="muted">— sin ítems —</td></tr>`;
  totalEl.textContent = money(state.current.total || 0);

  // enlazar filas
  $$('#sales-body tr').forEach(tr => {
    const id = tr.getAttribute('data-id');
    if (id) bindItemRow(tr, id);
  });

  // actualizar mini y tabs (título puede depender de PLACA)
  renderMini();
  state.cache.set(state.current._id, state.current);
  renderTabs();
}

// ================== ACCIONES BASE ==================
async function switchTo(id) {
  state.current = await API.sales.get(id);
  state.cache.set(id, state.current);
  state.addTab(id);
  renderSale();
}

async function startSale() {
  const s = await API.sales.start();
  state.current = s;
  state.cache.set(s._id, s);
  state.addTab(s._id);
  renderSale();
}

// ================== PICKERS / QR ==================

// Inventario (modal liviano normalizado a array)
async function openInventoryPicker() {
  if (!state.current) return alert('Crea primero una venta');

  const modal = $('#modal'), bodyM = $('#modalBody'), closeBtn = $('#modalClose');
  if (!modal || !bodyM) return alert('No se encontró el modal global');

  bodyM.innerHTML = `
    <h3>Agregar de Inventario</h3>
    <div class="picker-head">
      <div><label>SKU</label><input id="p-inv-sku" placeholder="SKU exacto"></div>
      <div><label>Nombre</label><input id="p-inv-name" placeholder="Buscar por nombre"></div>
      <div><button id="p-inv-search">Buscar</button></div>
    </div>
    <div class="picker-table table-wrap">
      <table class="table">
        <thead>
          <tr><th>Vista</th><th>SKU</th><th>Nombre</th><th>Stock</th><th>Precio</th><th></th></tr>
        </thead>
        <tbody id="p-inv-body"></tbody>
      </table>
    </div>
    <div class="picker-actions row">
      <button id="p-inv-more" class="secondary">Cargar más</button>
      <span class="muted" id="p-inv-count"></span>
    </div>
  `;
  const cleanupKey = openModal();
  closeBtn && (closeBtn.onclick = () => { cleanupKey?.(); closeModal(); });

  let all = []; let shown = 0; const PAGE = 20;

  async function fetchItems(params) {
    const r = await API.inventory.itemsList(params);
    return Array.isArray(r) ? r : (r.items || r.data || []);
  }

  const renderSlice = async () => {
    const chunk = all.slice(0, shown);
    $('#p-inv-body').innerHTML = chunk.map(it => `
      <tr>
        <td class="w-fit">${(it.files?.[0]?.url || it.files?.[0]?.secureUrl || it.files?.[0]?.path) ? `<img src="${it.files[0].url || it.files[0].secureUrl || it.files[0].path}" alt="img" class="thumb">` : '—'}</td>
        <td>${it.sku || ''}</td>
        <td>${it.name || ''}</td>
        <td>${Number(it.stock || 0)}</td>
        <td>${money(it.salePrice || 0)}</td>
        <td><button data-add="${it._id}">Agregar</button></td>
      </tr>
    `).join('') || `<tr><td colspan="99">Sin resultados</td></tr>`;
    $('#p-inv-count').textContent = chunk.length ? `${chunk.length}/${all.length}` : '';
    $$('#p-inv-body [data-add]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-add');
        state.current = await API.sales.addItem(state.current._id, { source: 'inventory', refId: id, qty: 1 });
        state.cache.set(state.current._id, state.current);
        renderSale();
      };
    });
  };

  const doSearch = async () => {
    const rawSku = String($('#p-inv-sku').value || '').trim();
    const sku = rawSku.toUpperCase();
    const name = String($('#p-inv-name').value || '').trim();
    try {
      let list = await fetchItems({ sku, name });
      if (!list.length && (sku || name)) {
        const q = [sku, name].filter(Boolean).join(' ');
        list = await fetchItems({ q }) || await fetchItems({ text: q });
      }
      if (!list.length && (sku || name)) {
        const allSrv = await fetchItems({});
        const needle = (sku || name).toLowerCase();
        list = (allSrv || []).filter(it => String(it.sku || '').toLowerCase().includes(needle) || String(it.name || '').toLowerCase().includes(needle));
      }
      all = list || [];
      shown = Math.min(PAGE, all.length);
      await renderSlice();
    } catch (e) {
      alert(e?.message || 'No se pudo buscar inventario');
    }
  };

  $('#p-inv-search').onclick = doSearch;
  $('#p-inv-sku').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  $('#p-inv-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  $('#p-inv-more').onclick = async () => { shown = Math.min(shown + PAGE, all.length); await renderSlice(); };

  doSearch();
}

async function openPricesPicker() {
  if (!state.current) return alert('Crea primero una venta');

  const modal = $('#modal'), bodyM = $('#modalBody'), closeBtn = $('#modalClose');
  if (!modal || !bodyM) return alert('No se encontró el modal global');

  let services = [];
  try { services = (await API.servicesList())?.items || (await API.servicesList()) || []; } catch {}
  let selectedSvc = services[0] || { variables: [] };

  bodyM.innerHTML = `
    <h3>Agregar de Lista de Precios</h3>
    <div class="picker-head">
      <div>
        <label>Servicio</label>
        <select id="p-pr-svc">${services.map(s => `<option value="${s._id}">${s.name}</option>`).join('')}</select>
      </div>
      <div class="row" style="gap:8px; align-items:end;">
        <div><label>Marca</label><input id="p-pr-brand"  placeholder="Ej. RENAULT"></div>
        <div><label>Línea</label><input id="p-pr-line"   placeholder="Ej. LOGAN"></div>
        <div><label>Motor</label><input id="p-pr-engine" placeholder="Ej. 1.6"></div>
        <div><label>Año</label><input id="p-pr-year" type="number" placeholder="Ej. 2020"></div>
        <div><button id="p-pr-search">Buscar</button></div>
      </div>
    </div>
    <div class="picker-table table-wrap">
      <table class="table" id="p-pr-table">
        <thead><tr id="p-pr-head"></tr></thead>
        <tbody id="p-pr-body"></tbody>
      </table>
    </div>
    <div class="picker-actions row">
      <button id="p-pr-more" class="secondary">Cargar más</button>
      <span class="muted" id="p-pr-count"></span>
    </div>
  `;
  const cleanupKey = openModal();
  closeBtn && (closeBtn.onclick = () => { cleanupKey?.(); closeModal(); });

  const headEl = $('#p-pr-head');
  const renderHead = () => {
    const vars = selectedSvc?.variables || [];
    headEl.innerHTML = `<th>Marca</th><th>Línea</th><th>Motor</th><th>Año</th>${vars.map(v => `<th>${v.label}</th>`).join('')}<th>Total</th><th></th>`;
  };

  let all = []; let shown = 0; const PAGE = 20;

  const renderSlice = () => {
    const vars = selectedSvc?.variables || [];
    const chunk = all.slice(0, shown);
    $('#p-pr-body').innerHTML = chunk.map(pe => {
      const cells = vars.map(v => {
        const val = pe.variables?.[v.key] ?? (v.type === 'number' ? 0 : '');
        return `<td>${v.type === 'number' ? money(val) : (val || '')}</td>`;
      }).join('');
      return `
        <tr>
          <td>${pe.brand || ''}</td>
          <td>${pe.line || ''}</td>
          <td>${pe.engine || ''}</td>
          <td>${pe.year ?? ''}</td>
          ${cells}
          <td>${money(pe.total || 0)}</td>
          <td><button data-add="${pe._id}">Agregar</button></td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="99">Sin resultados</td></tr>`;
    $('#p-pr-count').textContent = chunk.length ? `${chunk.length}/${all.length}` : '';
    $$('#p-pr-body [data-add]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-add');
        state.current = await API.sales.addItem(state.current._id, { source: 'price', refId: id, qty: 1 });
        state.cache.set(state.current._id, state.current);
        renderSale();
      };
    });
  };

  const doSearch = async () => {
    const serviceId = ($('#p-pr-svc')?.value || '').trim();
    selectedSvc = services.find(s => s._id === serviceId) || selectedSvc;
    renderHead();
    const brand  = String($('#p-pr-brand').value  || '').trim();
    const line   = String($('#p-pr-line').value   || '').trim();
    const engine = String($('#p-pr-engine').value || '').trim();
    const year   = String($('#p-pr-year').value   || '').trim();
    try {
      const params = { serviceId, brand, line, engine, year };
      const res = await API.pricesList(params);
      all   = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
      shown = Math.min(PAGE, all.length);
      renderSlice();
    } catch (e) {
      alert(e?.message || 'No se pudo buscar lista de precios');
    }
  };

  $('#p-pr-search').onclick = doSearch;
  ['p-pr-brand', 'p-pr-line', 'p-pr-engine', 'p-pr-year']
    .forEach(id => document.getElementById(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); }));
  $('#p-pr-svc')?.addEventListener('change', doSearch);
  $('#p-pr-more').onclick = () => { shown = Math.min(shown + PAGE, all.length); renderSlice(); };

  renderHead();
  doSearch();
}

// Lector de QR (modal con fallback a jsQR)
async function openQRScanner() {
  if (!state.current) return alert('Crea primero una venta');

  const modal = $('#modal'), bodyM = $('#modalBody'), closeBtn = $('#modalClose');
  if (!modal || !bodyM) return alert('No se encontró el modal global');

  bodyM.innerHTML = `
    <h3>Lector de QR</h3>
    <div class="qrbar row">
      <div class="row" style="gap:8px;align-items:center;">
        <label>Cámara</label><select id="qr-cam"></select>
        <label class="row" style="gap:6px;"><input type="checkbox" id="qr-autoclose" checked> Cerrar al agregar</label>
      </div>
      <div class="row" style="gap:8px;">
        <button id="qr-start" class="secondary">Iniciar</button>
        <button id="qr-stop"  class="secondary">Detener</button>
      </div>
    </div>
    <div class="qrwrap">
      <video id="qr-video" playsinline muted></video>
      <canvas id="qr-canvas" style="display:none;"></canvas>
      <div class="qr-hud"></div>
    </div>
    <div class="row" style="gap:8px;margin-top:8px;">
      <input id="qr-manual" placeholder="Ingresar código manualmente (fallback)">
      <button id="qr-add-manual">Agregar</button>
    </div>
    <div class="muted" id="qr-msg" style="margin-top:6px;">Permite la cámara para escanear. Si no hay soporte nativo, uso jsQR.</div>
    <ul id="qr-history" class="qr-history"></ul>
  `;
  const cleanupKey = openModal();
  closeBtn && (closeBtn.onclick = () => { cleanupKey?.(); stopStream(); closeModal(); });

  const video = $('#qr-video');
  const canvas = $('#qr-canvas');
  const ctx    = canvas.getContext('2d', { willReadFrequently: true });
  const sel    = $('#qr-cam');
  const msg    = $('#qr-msg');
  const list   = $('#qr-history');
  const autoclose = $('#qr-autoclose');

  let stream = null, running = false, useNative = await isNativeQRSupported(), detector = null;

  async function enumerateCams() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      sel.innerHTML = cams.map((d, i) => `<option value="${d.deviceId}">${d.label || 'Cam ' + (i + 1)}</option>`).join('');
    } catch {
      sel.innerHTML = `<option value="">(cámara)</option>`;
    }
  }

  async function startStream() {
    try {
      stopStream();
      const deviceId = sel.value || undefined;
      stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();

      running = true;
      if (useNative) { try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { useNative = false; } }
      if (!useNative) { try { await ensureJsQR(); } catch { msg.textContent = 'No fue posible cargar jsQR. Usa el campo manual.'; } }

      msg.textContent = useNative ? 'Escanea un código QR…' : 'Escaneo con jsQR activo…';
      tick();
    } catch (e) {
      msg.textContent = 'No se pudo abrir la cámara. Revisa permisos/HTTPS.';
    }
  }
  function stopStream() {
    running = false;
    try { video.pause(); } catch {}
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  async function handleCode(raw) {
    const codeStr = String(raw || '').trim();
    if (!codeStr) return;

    const li = document.createElement('li');
    li.textContent = `QR: ${codeStr}`; list.prepend(li);

    try {
      const parsed = parseInventoryCode(codeStr);
      if (parsed?.itemId) {
        state.current = await API.sales.addItem(state.current._id, { source: 'inventory', refId: parsed.itemId, qty: 1 });
        state.cache.set(state.current._id, state.current); renderSale();
        msg.textContent = `Agregado por QR (ítem ${parsed.sku || parsed.itemId}).`;
        if (autoclose.checked) { stopStream(); closeModal(); }
        return;
      }
      if (API.sales?.addByQR) {
        const res = await API.sales.addByQR(state.current._id, codeStr);
        if (res && (res._id || res.sale)) {
          state.current = res.sale || res;
          state.cache.set(state.current._id, state.current); renderSale();
          msg.textContent = 'Agregado por QR.';
          if (autoclose.checked) { stopStream(); closeModal(); }
          return;
        }
      }
      state.current = await API.sales.addItem(state.current._id, { source: 'inventory', sku: codeStr.toUpperCase(), qty: 1 });
      state.cache.set(state.current._id, state.current); renderSale();
      msg.textContent = 'Agregado por SKU leído.';
      if (autoclose.checked) { stopStream(); closeModal(); }
    } catch (e) {
      msg.textContent = e?.message || 'No se pudo agregar por QR';
    }
  }

  async function tick() {
    if (!running) return;
    try {
      if (useNative && detector) {
        const codes = await detector.detect(video);
        if (codes?.length) {
          await handleCode(codes[0].rawValue || codes[0].rawValue);
          await new Promise(r => setTimeout(r, 700));
        }
      } else if (window.jsQR && video.readyState >= 2) {
        const w = video.videoWidth, h = video.videoHeight;
        if (w && h) {
          canvas.width = w; canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const result = window.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
          if (result?.data) {
            await handleCode(result.data);
            await new Promise(r => setTimeout(r, 700));
          }
        }
      }
    } catch {}
    requestAnimationFrame(tick);
  }

  $('#qr-start').onclick = startStream;
  $('#qr-stop').onclick  = () => { stopStream(); msg.textContent = 'Cámara detenida.'; };
  $('#qr-add-manual').onclick = () => handleCode($('#qr-manual').value);

  await enumerateCams();
  if (navigator.mediaDevices?.getUserMedia) startStream();
}

// ================== INIT: enlaza botones ==================
export function initSales() {
  state.load();
  renderTabs(); // pinta chips guardadas (si las hay)

  // barra superior
  $('#sales-start')    && ($('#sales-start').onclick    = startSale);
  $('#sales-scan-qr')  && ($('#sales-scan-qr').onclick  = openQRScanner);
  $('#sales-add-inv')  && ($('#sales-add-inv').onclick  = openInventoryPicker);
  $('#sales-add-prices') && ($('#sales-add-prices').onclick = openPricesPicker);

  $('#sales-add-sku') && ($('#sales-add-sku').onclick = async () => {
    if (!state.current) return alert('Crea primero una venta');
    const sku = String($('#sales-sku').value || '').trim().toUpperCase();
    if (!sku) return;
    state.current = await API.sales.addItem(state.current._id, { source: 'inventory', sku, qty: 1 });
    $('#sales-sku').value = '';
    state.cache.set(state.current._id, state.current);
    renderSale();
  });

  // PDF
  $('#sales-print') && ($('#sales-print').onclick = async () => {
    if (!state.current) return alert('Crea primero una venta');
    try {
      const company = await fetchCompanySafe();
      const doc = buildSalePdf(state.current, company);
      const nro = state.current.number ? String(state.current.number).padStart(5, '0') : (state.current._id || '').slice(-6).toUpperCase();
      doc.save(`venta_${nro}.pdf`);
    } catch (e) {
      console.error(e); alert('No se pudo generar el PDF');
    }
  });

  // WhatsApp
  $('#sales-share-wa') && ($('#sales-share-wa').onclick = async () => {
    if (!state.current) return alert('Crea primero una venta');
    const company = await fetchCompanySafe();
    const nro  = state.current.number ? String(state.current.number).padStart(5, '0') : (state.current._id || '').slice(-6).toUpperCase();
    const when = window.dayjs ? dayjs(state.current.createdAt).format('DD/MM/YYYY HH:mm') : new Date().toLocaleString();
    const lines = (state.current.items || []).map(it => `• ${it.sku || ''} x${it.qty || 1} — ${it.name || ''} — ${money(it.total || 0)}`);
    const header = `*${company?.name || 'Taller'}*%0A*Venta No.* ${nro} — ${when}`;
    const body   = lines.join('%0A') || '— sin ítems —';
    const footer = `%0A*TOTAL:* ${money(state.current.total || 0)}`;
    const url = `https://wa.me/?text=${header}%0A%0A${body}%0A%0A${footer}`;
    window.open(url, '_blank');
  });

  // Cerrar venta
  $('#sales-close') && ($('#sales-close').onclick = async () => {
    if (!state.current) return alert('No hay venta activa');
    if (!confirm('¿Cerrar la venta actual?')) return;
    try {
      await API.sales.close(state.current._id);
      const closedId = state.current._id;
      state.current = null;
      state.removeTab(closedId);
      renderSale();
    } catch (e) {
      alert(e?.message || 'No se pudo cerrar la venta');
    }
  });

  // Editar cliente/vehículo (en modal usando plantilla)
  $('#sv-edit-cv') && ($('#sv-edit-cv').onclick = () => {
    if (!state.current) return alert('Crea primero una venta');
    const tpl = $('#sales-cv-template');
    if (!tpl) return;
    const frag = tpl.content.cloneNode(true);
    const cleanupKey = openModal();
    $('#modalBody').innerHTML = '';
    $('#modalBody').appendChild(frag);

    // prefill
    $('#c-name').value    = state.current.customer?.name     || '';
    $('#c-id').value      = state.current.customer?.idNumber || '';
    $('#c-phone').value   = state.current.customer?.phone    || '';
    $('#c-email').value   = state.current.customer?.email    || '';
    $('#c-address').value = state.current.customer?.address  || '';

    $('#v-plate').value = state.current.vehicle?.plate  || '';
    $('#v-brand').value = state.current.vehicle?.brand  || '';
    $('#v-line').value  = state.current.vehicle?.line   || '';
    $('#v-engine').value= state.current.vehicle?.engine || '';
    $('#v-year').value  = state.current.vehicle?.year   || '';
    $('#v-mile').value  = state.current.vehicle?.mileage ?? '';

    $('#sales-save-cv').onclick = async () => {
      const customer = {
        name: $('#c-name').value, idNumber: $('#c-id').value,
        phone: $('#c-phone').value, email: $('#c-email').value, address: $('#c-address').value,
      };
      const vehicle = {
        plate: $('#v-plate').value, brand: $('#v-brand').value, line: $('#v-line').value,
        engine: $('#v-engine').value, year: $('#v-year').value, mileage: Number($('#v-mile').value || 0) || undefined,
      };
      try {
        state.current = await API.sales.setCustomerVehicle(state.current._id, { customer, vehicle });
        state.cache.set(state.current._id, state.current);
        renderSale();
        cleanupKey?.(); closeModal();
      } catch (e) {
        alert(e?.message || 'No se pudo guardar');
      }
    };
    $('#modalClose').onclick = () => { cleanupKey?.(); closeModal(); };
  });

  // Si había tabs abiertas, intenta cargar la última
  if (state.openTabs.length) {
    switchTo(state.openTabs[state.openTabs.length - 1]).catch(() => renderTabs());
  }
}
