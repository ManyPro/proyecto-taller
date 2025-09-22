import { API } from "./api.js"; // gestiona Bearer

const $ = (s) => document.querySelector(s);
const money = (n) => '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ---- helpers modal ----
function openModal() {
  const modal = $('#modal'); if (!modal) return () => { };
  modal.classList.remove('hidden');
  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  const onOverlay = (e) => { if (e.target === modal) closeModal(); };
  document.addEventListener('keydown', onKey);
  modal.addEventListener('click', onOverlay, { once: true });
  document.body.style.overflow = 'hidden';
  return () => document.removeEventListener('keydown', onKey);
}
function closeModal() {
  const modal = $('#modal'); if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// ---- QR PNG (miniatura/descarga) ----
const qrCache = new Map(); // itemId -> objectURL
async function getQRObjectURL(itemId, size = 128) {
  if (qrCache.has(itemId)) return qrCache.get(itemId);
  const tok = API.token.get?.();
  const res = await fetch(`${API.base}/api/v1/inventory/items/${itemId}/qr.png?size=${size}`, {
    headers: tok ? { 'Authorization': `Bearer ${tok}` } : {},
    cache: 'no-store',
    credentials: 'omit'
  });
  if (!res.ok) throw new Error('QR no disponible');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  qrCache.set(itemId, url);
  return url;
}
function downloadBlobUrl(url, filename = 'qr.png') {
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
}

// ---- util: soporte BarcodeDetector ----
async function isNativeQRSupported() {
  if (!('BarcodeDetector' in window)) return false;
  try {
    const fmts = await window.BarcodeDetector.getSupportedFormats?.();
    if (Array.isArray(fmts)) return fmts.includes('qr_code');
    return true;
  } catch { return true; }
}

// ---- util: jsQR (fallback) ----
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

// ---- parseo flexible de IT:... ----
// Acepta:
//   IT:<itemId>
//   IT:<companyId>:<itemId>
//   IT:<companyId>:<itemId>:<sku?>
function parseInventoryCode(raw = '') {
  const s = String(raw || '').trim();
  if (!s.toUpperCase().startsWith('IT:')) return null;
  const parts = s.split(':').map(p => p.trim()).filter(Boolean);
  // ejemplos:
  // ['IT','<itemId>']  -> itemId = parts[1]
  // ['IT','<companyId>','<itemId>'] -> itemId = parts[2]
  // ['IT','<companyId>','<itemId>','<sku?>'] -> idem + sku
  if (parts.length === 2) return { itemId: parts[1], companyId: null, sku: null };
  if (parts.length >= 3) return { companyId: parts[1] || null, itemId: parts[2] || null, sku: (parts[3] || '').toUpperCase() || null };
  return null;
}

// ====== UI Ventas ======
export function initSales() {
  const tab = document.getElementById('tab-ventas');
  if (!tab) return;

  tab.innerHTML = `
    <div class="row between">
      <div>
        <label>Destino:</label>
        <select id="sales-dest">
          <option value="sale" selected>Venta</option>
          <option value="quote">Cotización</option>
        </select>
        <button id="sales-start">Nueva venta</button>
      </div>
      <div class="row" style="gap:8px;">
        <button id="sales-scan-qr" class="secondary">Escanear QR</button>
        <button id="sales-print" class="secondary">Imprimir</button>
         <button id="sales-share-wa" class="secondary">WhatsApp</button> <!-- nuevo -->
         <button id="sales-close" class="danger">Cerrar venta</button>
      </div>

    </div>

    <div class="row">
      <input id="sales-sku" placeholder="Escanea/ingresa SKU o QR" />
      <button id="sales-add-sku">Agregar</button>
      <button id="sales-add-inv" class="secondary">Agregar de Inventario</button>
      <button id="sales-add-prices" class="secondary">Agregar de Lista de Precios</button>
    </div>

    <div class="grid">
      <div>
        <table class="table" id="sales-table">
          <thead>
            <tr><th>SKU</th><th>Descripción</th><th>Cant.</th><th>Unit</th><th>Total</th><th></th></tr>
          </thead>
          <tbody id="sales-body"></tbody>
          <tfoot>
            <tr><td colspan="4" class="t-right">Total</td><td id="sales-total">$0</td><td></td></tr>
          </tfoot>
        </table>
      </div>
      <aside>
        <div class="card">
          <h3>Cliente & Vehículo</h3>
          <div class="col">
            <input id="c-name" placeholder="Nombre/Empresa">
            <input id="c-id" placeholder="Identificación">
            <input id="c-phone" placeholder="Teléfono">
            <input id="c-email" placeholder="Email">
            <input id="c-address" placeholder="Dirección">
          </div>
          <div class="col">
            <input id="v-plate" placeholder="Placa (ABC123)">
            <input id="v-brand" placeholder="Marca">
            <input id="v-line" placeholder="Línea">
            <input id="v-engine" placeholder="Motor">
            <input id="v-year" placeholder="Año" type="number">
            <input id="v-mile" placeholder="Kilometraje" type="number">
          </div>
          <button id="sales-save-cv">Guardar Cliente/Auto</button>
        </div>
      </aside>
    </div>
  `;

  tab.querySelector('.row.between')?.insertAdjacentHTML('afterend',
    `<div id="saleTabs" class="sales-tabs"></div>`
  );

  let current = null; // venta actual
  const body = $('#sales-body');
  const totalEl = $('#sales-total');

  function render() {
    if (!current) { body.innerHTML = ''; totalEl.textContent = '$0'; return; }
    body.innerHTML = (current.items || []).map(it => `
      <tr data-id="${it._id}">
        <td>${it.sku || ''}</td>
        <td>${it.name || ''}</td>
        <td><input type="number" min="0" step="1" value="${it.qty || 1}" class="qty"></td>
        <td><input type="number" min="0" step="1" value="${it.unitPrice || 0}" class="u"></td>
        <td>${money(it.total || 0)}</td>
        <td><button class="danger" data-del>Eliminar</button></td>
      </tr>
    `).join('');
    totalEl.textContent = money(current.total || 0);

    body.querySelectorAll('tr').forEach(tr => {
      const itemId = tr.dataset.id;
      tr.querySelector('.qty').onchange = async (e) => {
        const qty = Number(e.target.value || 0);
        current = await API.sales.updateItem(current._id, itemId, { qty });
        render();
      };
      tr.querySelector('.u').onchange = async (e) => {
        const unitPrice = Number(e.target.value || 0);
        current = await API.sales.updateItem(current._id, itemId, { unitPrice });
        render();
      };
      tr.querySelector('[data-del]').onclick = async () => {
        current = await API.sales.removeItem(current._id, itemId);
        render();
      };
    });
  }

  // -------- acciones base --------
  $('#sales-start').onclick = async () => {
    current = await API.sales.start();
    addOpen(current._id);    // <-- NUEVO
    render();
  };

  $('#sales-add-sku').onclick = async () => {
    if (!current) return alert('Crea primero una venta');
    const sku = String($('#sales-sku').value || '').trim().toUpperCase();
    if (!sku) return;
    current = await API.sales.addItem(current._id, { source: 'inventory', sku, qty: 1 });
    $('#sales-sku').value = '';
    render();
  };

  // -------- pickers --------
  $('#sales-add-inv').onclick = () => openInventoryPicker();
  $('#sales-add-prices').onclick = () => openPricesPicker();

  // -------- LECTOR DE QR (nativo + fallback jsQR) --------
  $('#sales-scan-qr').onclick = () => openQRScanner();
  // Imprimir / Descargar PDF
  $('#sales-print').onclick = async () => {
    if (!current) return alert('Crea primero una venta');
    try {
      const company = await fetchCompanySafe(); // no rompe si falla
      const doc = buildSalePdf(current, company);
      const nro = current.number ? String(current.number).padStart(5, '0') : (current._id || '').slice(-6).toUpperCase();
      doc.save(`venta_${nro}.pdf`);
    } catch (e) {
      console.error(e);
      alert('No se pudo generar el PDF');
    }
  };
  // Info básica de la empresa (opcional, si falla igual comparte)
  async function fetchCompanySafe() {
    try {
      const tok = API.token.get?.();
      const r = await fetch(`${API.base}/api/v1/auth/company/me`, {
        headers: tok ? { 'Authorization': `Bearer ${tok}` } : {},
        cache: 'no-store',
        credentials: 'omit'
      });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  $('#sales-share-wa').onclick = async () => {
    if (!current) return alert('Crea primero una venta');

    const company = await fetchCompanySafe(); // puede ser null
    const nro = current.number ? String(current.number).padStart(5, '0')
      : (current._id || '').slice(-6).toUpperCase();
    const when = window.dayjs ? dayjs(current.createdAt).format('DD/MM/YYYY HH:mm')
      : new Date().toLocaleString();

    const lines = (current.items || []).map(it =>
      `• ${it.sku || ''} x${it.qty || 1} — ${it.name || ''} — ${money(it.total || 0)}`
    );

    const header = `*${company?.name || 'Taller'}*%0A*Venta No.* ${nro} — ${when}`;
    const body = lines.join('%0A') || '— sin ítems —';
    const footer = `%0A*TOTAL:* ${money(current.total || 0)}`;

    const url = `https://wa.me/?text=${header}%0A%0A${body}%0A%0A${footer}`;
    window.open(url, '_blank'); // abre selector de contacto en WhatsApp
  };


  async function openQRScanner() {
    if (!current) return alert('Crea primero una venta');

    const modal = $('#modal'), bodyM = $('#modalBody'), closeBtn = $('#modalClose');
    if (!modal || !bodyM) return alert('No se encontró el modal global');

    bodyM.innerHTML = `
      <h3>Lector de QR</h3>
      <div class="qrbar row">
        <div class="row" style="gap:8px;align-items:center;">
          <label>Camara</label>
          <select id="qr-cam"></select>
          <label class="row" style="gap:6px;"><input type="checkbox" id="qr-autoclose" checked> Cerrar al agregar</label>
        </div>
        <div class="row" style="gap:8px;">
          <button id="qr-start" class="secondary">Iniciar</button>
          <button id="qr-stop" class="secondary">Detener</button>
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

    const OPEN_KEY = `sales:openTabs:${API.getActiveCompany?.() || 'default'}`;
    let openTabs = [];
    try { openTabs = JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'); } catch { openTabs = []; }

    function saveTabs() { try { localStorage.setItem(OPEN_KEY, JSON.stringify(openTabs)); } catch { } }
    function addOpen(id) { if (!openTabs.includes(id)) { openTabs.push(id); saveTabs(); } renderSaleTabs(); }
    function removeOpen(id) { openTabs = openTabs.filter(x => x !== id); saveTabs(); renderSaleTabs(); }

    async function switchTo(id) {
      current = await API.sales.get(id);
      addOpen(id);
      render();
    }

    function renderSaleTabs() {
      const wrap = document.getElementById('saleTabs');
      if (!wrap) return;
      wrap.innerHTML = openTabs.map(id => `
    <span class="sales-tab ${current && current._id === id ? 'active' : ''}" data-id="${id}">
      Vta ${String(id).slice(-4).toUpperCase()} <b class="close" data-x="${id}">×</b>
    </span>
  `).join('') || `<span class="sales-tab">— sin ventas abiertas —</span>`;
      wrap.querySelectorAll('.sales-tab').forEach(el => {
        el.onclick = (e) => { const id = el.dataset.id; if (id) switchTo(id); };
      });
      wrap.querySelectorAll('[data-x]').forEach(el => {
        el.onclick = (e) => { e.stopPropagation(); removeOpen(el.dataset.x); };
      });
    }

    const cleanupKey = openModal();
    closeBtn && (closeBtn.onclick = () => { cleanupKey?.(); stopStream(); closeModal(); });

    const video = $('#qr-video');
    const canvas = $('#qr-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const sel = $('#qr-cam');
    const msg = $('#qr-msg');
    const list = $('#qr-history');
    const autoclose = $('#qr-autoclose');

    let stream = null;
    let running = false;
    let useNative = await isNativeQRSupported();
    let detector = null;

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
          audio: false
        });
        video.srcObject = stream;
        await video.play();

        running = true;

        if (useNative) {
          try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); }
          catch { useNative = false; }
        }
        if (!useNative) {
          try { await ensureJsQR(); }
          catch { msg.textContent = 'No fue posible cargar jsQR. Usa el campo manual.'; }
        }

        msg.textContent = useNative ? 'Escanea un código QR…' : 'Escaneo con jsQR activo…';
        tick();
      } catch (e) {
        msg.textContent = 'No se pudo abrir la cámara. Revisa permisos/HTTPS.';
      }
    }

    function stopStream() {
      running = false;
      if (video) try { video.pause(); } catch { }
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    }

    async function handleCode(raw) {
      const codeStr = String(raw || '').trim();
      if (!codeStr) return;

      // Historial visual
      const li = document.createElement('li');
      li.textContent = `QR: ${codeStr}`;
      list.prepend(li);

      try {
        // 1) Si es un código del inventario (IT:...), agregamos por refId (itemId)
        const parsed = parseInventoryCode(codeStr);
        if (parsed && parsed.itemId) {
          current = await API.sales.addItem(current._id, { source: 'inventory', refId: parsed.itemId, qty: 1 });
          render();
          msg.textContent = `Agregado por QR (ítem ${parsed.sku || parsed.itemId}).`;
          if (autoclose.checked) { stopStream(); closeModal(); }
          return;
        }

        // 2) Si no, endpoint addByQR (si existe en tu backend)
        if (API.sales?.addByQR) {
          const res = await API.sales.addByQR(current._id, codeStr);
          if (res && (res._id || res.sale)) {
            current = res.sale || res;
            render();
            msg.textContent = 'Agregado por QR.';
            if (autoclose.checked) { stopStream(); closeModal(); }
            return;
          }
        }

        // 3) Último intento: usarlo como SKU
        current = await API.sales.addItem(current._id, { source: 'inventory', sku: codeStr.toUpperCase(), qty: 1 });
        render();
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
          if (codes && codes.length) {
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
            if (result && result.data) {
              await handleCode(result.data);
              await new Promise(r => setTimeout(r, 700));
            }
          }
        }
      } catch { }
      requestAnimationFrame(tick);
    }

    $('#qr-start').onclick = startStream;
    $('#qr-stop').onclick = () => { stopStream(); msg.textContent = 'Cámara detenida.'; };
    $('#qr-add-manual').onclick = () => handleCode($('#qr-manual').value);

    await enumerateCams();
    if (navigator.mediaDevices?.getUserMedia) startStream();
  }

  // ====== PICKER: Inventario ======
  async function openInventoryPicker() {
    if (!current) return alert('Crea primero una venta');
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
            <tr>
              <th>Vista</th><th>SKU</th><th>Nombre</th><th>Stock</th><th>Precio</th><th>QR</th><th></th>
            </tr>
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

    const renderSlice = async () => {
      const chunk = all.slice(0, shown);
      const rows = await Promise.all(chunk.map(async it => {
        let thumb = '';
        try {
          const f = Array.isArray(it.files) ? it.files[0] : null;
          const url = f?.url || f?.secureUrl || f?.path || null;
          if (url) thumb = `<img src="${url}" alt="img" class="thumb">`;
        } catch { }

        let qrCell = '—';
        try {
          const qrUrl = await getQRObjectURL(it._id, 96);
          qrCell = `<img src="${qrUrl}" alt="QR" class="thumb-qr" title="Click para descargar" data-qr="${it._id}">`;
        } catch { }

        return `
          <tr>
            <td class="w-fit">${thumb || '—'}</td>
            <td>${it.sku || ''}</td>
            <td>${it.name || ''}</td>
            <td>${Number(it.stock || 0)}</td>
            <td>${money(it.salePrice || 0)}</td>
            <td class="w-fit">${qrCell}</td>
            <td><button data-add="${it._id}">Agregar</button></td>
          </tr>
        `;
      }));
      $('#p-inv-body').innerHTML = rows.join('') || `<tr><td colspan="99">Sin resultados</td></tr>`;
      $('#p-inv-count').textContent = chunk.length ? `${chunk.length}/${all.length}` : '';

      $('#p-inv-body').querySelectorAll('button[data-add]').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute('data-add');
          current = await API.sales.addItem(current._id, { source: 'inventory', refId: id, qty: 1 });
          render();
        };
      });
      $('#p-inv-body').querySelectorAll('img[data-qr]').forEach(img => {
        img.onclick = async () => {
          const id = img.getAttribute('data-qr');
          try {
            const url = await getQRObjectURL(id, 256);
            downloadBlobUrl(url, `qr_${id}.png`);
          } catch (e) { alert('No se pudo descargar el QR'); }
        };
      });
    };

    // helper normalizado: siempre array (r | r.items | r.data)
    async function fetchItems(params) {
      const r = await API.inventory.itemsList(params);
      return Array.isArray(r) ? r : (r.items || r.data || []);
    }

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
          list = (allSrv || []).filter(it => {
            const s = String(it.sku || '').toLowerCase();
            const n = String(it.name || '').toLowerCase();
            return s.includes(needle) || n.includes(needle);
          });
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

    doSearch(); // primer load
  }

  // ====== PICKER: Precios ======
  async function openPricesPicker() {
    if (!current) return alert('Crea primero una venta');
    const modal = $('#modal'), bodyM = $('#modalBody'), closeBtn = $('#modalClose');
    if (!modal || !bodyM) return alert('No se encontró el modal global');

    let services = [];
    try { services = (await API.servicesList())?.items || (await API.servicesList()) || []; } catch { }
    let selectedSvc = services[0] || { variables: [] };

    bodyM.innerHTML = `
      <h3>Agregar de Lista de Precios</h3>
      <div class="picker-head">
        <div>
          <label>Servicio</label>
          <select id="p-pr-svc">
            ${services.map(s => `<option value="${s._id}">${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="row" style="gap:8px; align-items:end;">
          <div><label>Marca</label><input id="p-pr-brand" placeholder="Ej. RENAULT"></div>
          <div><label>Línea</label><input id="p-pr-line" placeholder="Ej. LOGAN"></div>
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
      headEl.innerHTML = `
        <th>Marca</th><th>Línea</th><th>Motor</th><th>Año</th>
        ${vars.map(v => `<th>${v.label}</th>`).join('')}
        <th>Total</th><th></th>`;
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
      $('#p-pr-body').querySelectorAll('button[data-add]').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute('data-add');
          current = await API.sales.addItem(current._id, { source: 'price', refId: id, qty: 1 });
          render();
        };
      });
    };

    const doSearch = async () => {
      const serviceId = ($('#p-pr-svc')?.value || '').trim();
      selectedSvc = services.find(s => s._id === serviceId) || selectedSvc;
      renderHead();
      const brand = String($('#p-pr-brand').value || '').trim();
      const line = String($('#p-pr-line').value || '').trim();
      const engine = String($('#p-pr-engine').value || '').trim();
      const year = String($('#p-pr-year').value || '').trim();
      try {
        const params = { serviceId, brand, line, engine, year };
        const res = await API.pricesList(params);
        all = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
        shown = Math.min(PAGE, all.length);
        renderSlice();
      } catch (e) {
        alert(e?.message || 'No se pudo buscar lista de precios');
      }
    };

    $('#p-pr-search').onclick = doSearch;
    ['p-pr-brand', 'p-pr-line', 'p-pr-engine', 'p-pr-year'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    });
    $('#p-pr-svc')?.addEventListener('change', doSearch);
    $('#p-pr-more').onclick = () => { shown = Math.min(shown + PAGE, all.length); renderSlice(); };

    renderHead();
    doSearch();
  }

  // -------- cliente/vehículo & cierre --------
  $('#sales-save-cv').onclick = async () => {
    if (!current) return alert('Crea primero una venta');
    const customer = {
      name: $('#c-name').value, idNumber: $('#c-id').value,
      phone: $('#c-phone').value, email: $('#c-email').value, address: $('#c-address').value
    };
    const vehicle = {
      plate: $('#v-plate').value, brand: $('#v-brand').value, line: $('#v-line').value,
      engine: $('#v-engine').value, year: Number($('#v-year').value || 0) || null, mileage: Number($('#v-mile').value || 0) || null
    };
    current = await API.sales.setCustomerVehicle(current._id, { customer, vehicle });
    render();
  };

  $('#sales-close').onclick = async () => {
    if (!current) return;
    await API.sales.close(current._id);
    removeOpen(current._id); // <-- NUEVO
    current = null;
    render();
  };
  renderSaleTabs();
}

export async function initCash() {
  const tab = document.getElementById('tab-caja');
  if (!tab) return;

  tab.innerHTML = `
    <div class="row" style="gap:8px;align-items:center">
      <label>Desde</label><input type="date" id="cash-from">
      <label>Hasta</label><input type="date" id="cash-to">
      <button id="cash-apply">Aplicar</button>
    </div>

    <div class="cash-summary">
      <span class="pill">Ventas cerradas: <b id="cash-count">0</b></span>
      <span class="pill">Total: <b id="cash-total">$0</b></span>
    </div>

    <div class="card">
      <table class="table">
        <thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th class="t-right">Total</th></tr></thead>
        <tbody id="cash-body"></tbody>
      </table>
    </div>
  `;

  async function load() {
    const from = document.getElementById('cash-from').value;
    const to = document.getElementById('cash-to').value;

    const [sum, list] = await Promise.all([
      API.sales.summary({ from, to }),
      API.sales.list({ status: 'closed', from, to, limit: 200 })
    ]);

    document.getElementById('cash-count').textContent = String(sum?.count || 0);
    document.getElementById('cash-total').textContent = money(sum?.total || 0);

    const rows = (list?.items || list || []).map(s => `
      <tr>
        <td>${String(s.number || '').padStart(5, '0')}</td>
        <td>${new Date(s.createdAt).toLocaleString()}</td>
        <td>${(s.customer?.name || '').toUpperCase()}</td>
        <td class="t-right">${money(s.total || 0)}</td>
      </tr>
    `).join('');
    document.getElementById('cash-body').innerHTML = rows || `<tr><td colspan="4">Sin resultados</td></tr>`;
  }

  document.getElementById('cash-apply').onclick = load;
  load();
}

// ===== PDF helpers =====
async function fetchCompanySafe() {
  // pedimos /auth/company/me directo por si no está mapeado en API
  try {
    const tok = API.token.get?.();
    const r = await fetch(`${API.base}/api/v1/auth/company/me`, {
      headers: tok ? { 'Authorization': `Bearer ${tok}` } : {},
      cache: 'no-store',
      credentials: 'omit'
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function numberToMoney(n) { // evita depender de estilos del DOM
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
    phone: company?.phone || ''
  };

  const created = (window.dayjs ? dayjs(sale.createdAt) : null);
  const when = created ? created.format('DD/MM/YYYY HH:mm') : (new Date()).toLocaleString();

  // Encabezado
  doc.setFontSize(14);
  doc.text(C.name, 14, 16);
  doc.setFontSize(10);
  if (C.nit) doc.text(`NIT: ${C.nit}`, 14, 22);
  if (C.phone) doc.text(`Tel: ${C.phone}`, 14, 27);
  if (C.email) doc.text(C.email, 14, 32);

  doc.setFontSize(16);
  doc.text('VENTA', 196, 16, { align: 'right' });

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
  const c = sale.customer || {};
  const v = sale.vehicle || {};
  doc.text([
    `Nombre: ${c.name || '-'}`,
    `Identificación: ${c.idNumber || '-'}`,
    `Tel: ${c.phone || '-'}`,
    `Email: ${c.email || '-'}`,
    `Dirección: ${c.address || '-'}`
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
    numberToMoney(it.total || 0)
  ]);

  const startY = y0 + 36;
  doc.autoTable({
    startY,
    head, body,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42] }, // oscuro amigable al tema
    theme: 'grid'
  });

  // Totales
  const endY = doc.lastAutoTable.finalY || startY;
  const right = (x) => 196 - x;
  doc.setFontSize(11);
  doc.text(`Subtotal: ${numberToMoney(sale.subtotal || 0)}`, right(0), endY + 8, { align: 'right' });
  doc.text(`Impuestos: ${numberToMoney(sale.tax || 0)}`, right(0), endY + 14, { align: 'right' });
  doc.setFontSize(13);
  doc.text(`TOTAL: ${numberToMoney(sale.total || 0)}`, right(0), endY + 22, { align: 'right' });

  // Pie
  doc.setFontSize(9);
  doc.text('Gracias por su compra.', 14, 290);

  return doc;
}
